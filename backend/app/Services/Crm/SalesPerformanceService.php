<?php

namespace App\Services\Crm;

use Carbon\Carbon;
use Illuminate\Support\Collection;

class SalesPerformanceService
{
    public function __construct(private CrmApiService $api) {}

    /**
     * KPI tổng hợp cho một kỳ.
     *
     * @return array{total_value: float, total_deals: int, avg_deal_size: float}
     */
    public function summary(Carbon $from, Carbon $to, ?string $territory = null, ?string $department = null): array
    {
        $wonQuotes  = $this->resolveQuoteValues(
            $this->filterByTerritory($this->filterByDepartment($this->fetchWonQuotes($from, $to), $department), $territory),
            $this->ttlFor($to)
        );
        $wonByOpp   = $this->maxWonByOpp($wonQuotes);
        $wonOppIds  = $wonByOpp->keys()->all();
        $totalValue = $wonByOpp->sum('resolved_value');
        $wonCount   = $wonByOpp->count();

        $lostOpps  = $this->filterByTerritory(
            $this->filterByDepartment($this->fetchLostOpportunities($from, $to), $department),
            $territory
        );
        $lostCount = $lostOpps->filter(fn ($o) => !in_array($o['opportunityid'], $wonOppIds))->count();

        $totalClosed = $wonCount + $lostCount;

        return [
            'total_value'   => $totalValue,
            'total_deals'   => $wonCount,
            'avg_deal_size' => $wonCount > 0 ? round($totalValue / $wonCount) : 0,
            'lost_deals'    => $lostCount,
            'win_rate'      => $totalClosed > 0 ? round($wonCount / $totalClosed * 100, 1) : 0,
        ];
    }

    /**
     * Giá trị hợp đồng nhóm theo kỳ thời gian — dùng để vẽ biểu đồ xu hướng.
     *
     * @return Collection<int, array{period: string, value: float, deals: int}>
     */
    public function byPeriod(Carbon $from, Carbon $to, string $groupBy = 'month', ?string $territory = null, ?string $department = null): Collection
    {
        $wonQuotes = $this->resolveQuoteValues(
            $this->filterByTerritory($this->filterByDepartment($this->fetchWonQuotes($from, $to), $department), $territory),
            $this->ttlFor($to)
        );

        return $this->maxWonByOpp($wonQuotes)
            ->groupBy(fn ($q) => $this->periodKey($q['closedon'], $groupBy))
            ->map(fn ($items, $period) => [
                'period' => $period,
                'value'  => $items->sum('resolved_value'),
                'deals'  => $items->count(),
            ])
            ->sortBy('period')
            ->values();
    }

    /**
     * Xếp hạng salesperson theo tổng giá trị hợp đồng — dùng để vẽ leaderboard.
     *
     * @return Collection<int, array{owner_id: string, name: string, team: string, total_value: float, deals: int, avg_deal_size: float}>
     */
    public function byRep(Carbon $from, Carbon $to, ?string $territory = null, ?string $department = null): Collection
    {
        $wonQuotes = $this->resolveQuoteValues(
            $this->filterByTerritory($this->filterByDepartment($this->fetchWonQuotes($from, $to), $department), $territory),
            $this->ttlFor($to)
        );
        $kpiByRep  = $this->kpiByRep($from->year);
        $wonOppIds = $wonQuotes->pluck('_opportunityid_value')->filter()->unique()->all();

        $lostOpps = $this->filterByTerritory(
            $this->filterByDepartment($this->fetchLostOpportunities($from, $to), $department),
            $territory
        )->filter(fn ($o) => !in_array($o['opportunityid'], $wonOppIds));

        $wonByOwner  = $wonQuotes->groupBy('_ownerid_value');
        $lostByOwner = $lostOpps->groupBy('_ownerid_value');
        $allOwnerIds = $wonByOwner->keys()->merge($lostByOwner->keys())->unique();

        return $allOwnerIds->map(function ($ownerId) use ($wonByOwner, $lostByOwner, $kpiByRep) {
            $ownerWon  = $wonByOwner->get($ownerId, collect());
            $ownerLost = $lostByOwner->get($ownerId, collect());

            $wonByOpp   = $this->maxWonByOpp($ownerWon);
            $totalValue = $wonByOpp->sum('resolved_value');
            $wonCount   = $wonByOpp->count();
            $lostCount  = $ownerLost->count();
            $total      = $wonCount + $lostCount;

            $avgDays = $wonByOpp->avg(fn ($q) =>
                max(0, Carbon::parse($q['createdon'])->diffInDays(Carbon::parse($q['closedon'])))
            );

            $sampleWon  = $ownerWon->first();
            $sampleLost = $ownerLost->first();

            return [
                'owner_id'          => $ownerId,
                'name'              => $sampleWon['_ownerid_value@OData.Community.Display.V1.FormattedValue']
                    ?? $sampleLost['_ownerid_value@OData.Community.Display.V1.FormattedValue']
                    ?? 'Unknown',
                'team'              => $sampleWon['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue']
                    ?? $sampleLost['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue']
                    ?? '',
                'total_value'       => $totalValue,
                'deals'             => $wonCount,
                'lost_deals'        => $lostCount,
                'win_rate'          => $total > 0 ? round($wonCount / $total * 100, 1) : 0,
                'avg_deal_size'     => $wonCount > 0 ? round($totalValue / $wonCount) : 0,
                'avg_days_to_close' => $wonCount > 0 ? (int) round($avgDays) : null,
                'kpi'               => $kpiByRep->get($ownerId) ?: null,
            ];
        })
        ->sortByDesc('total_value')
        ->values();
    }

    public function kpiQuarterlyTotals(int $year, ?string $territory = null, ?string $department = null): array
    {
        $scopedIds = $this->fetchUsers()
            ->filter(fn ($u) =>
                (!$territory || strtoupper($territory) === 'ALL' ||
                    strtoupper($u['_ab_dim_territory_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === strtoupper($territory)) &&
                (!$department ||
                    ($u['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === $department)
            )
            ->keys()
            ->flip()
            ->toArray();

        if (empty($scopedIds)) return ['q1' => 0, 'q2' => 0, 'q3' => 0, 'q4' => 0];

        $targets = collect($this->api->get('crc83_kpitargetses', [
            '$select' => '_crc83_ab_user_value,crc83_ab_q1,crc83_ab_q2,crc83_ab_q3,crc83_ab_q4',
            '$filter' => "crc83_ab_year eq {$year}",
        ], ttl: 3600)['value'] ?? [])
            ->filter(fn ($t) => isset($scopedIds[$t['_crc83_ab_user_value'] ?? '']));

        if ($targets->isEmpty()) return ['q1' => 0, 'q2' => 0, 'q3' => 0, 'q4' => 0];

        $from = Carbon::create($year, 1, 1)->startOfDay();
        $to   = Carbon::create($year, 12, 31)->endOfDay();

        $actualByOwner = $this->resolveQuoteValues($this->fetchWonQuotes($from, $to), $this->ttlFor($to))
            ->filter(fn ($q) => isset($scopedIds[$q['_ownerid_value'] ?? '']))
            ->groupBy('_ownerid_value')
            ->map(fn ($quotes) =>
                $quotes
                    ->groupBy(fn ($q) => Carbon::parse($q['closedon'])->quarter)
                    ->map(fn ($g) => (float) $g->sum('resolved_value'))
            );

        $now            = now();
        $currentYear    = $now->year;
        $currentQuarter = $now->quarter;

        $totals = ['q1' => 0.0, 'q2' => 0.0, 'q3' => 0.0, 'q4' => 0.0];

        foreach ($targets as $target) {
            $userId   = $target['_crc83_ab_user_value'] ?? '';
            $actuals  = $actualByOwner->get($userId, collect());
            $rollover = 0.0;

            foreach ([1, 2, 3, 4] as $q) {
                $original     = (float) ($target["crc83_ab_q{$q}"] ?? 0);
                $effective    = $original + $rollover;
                $actual       = (float) $actuals->get($q, 0);
                $quarterEnded = $year < $currentYear || ($year === $currentYear && $q < $currentQuarter);
                $rollover     = $quarterEnded ? max(0.0, $effective - $actual) : 0.0;

                $totals["q{$q}"] += $effective;
            }
        }

        return [
            'q1' => (int) round($totals['q1']),
            'q2' => (int) round($totals['q2']),
            'q3' => (int) round($totals['q3']),
            'q4' => (int) round($totals['q4']),
        ];
    }

    // KPI target theo từng user (owner_id) cho các quý trong date range
    private function kpiByRep(int $year): Collection
    {
        $targetsRaw = $this->api->get('crc83_kpitargetses', [
            '$select' => '_crc83_ab_user_value,crc83_ab_q1,crc83_ab_q2,crc83_ab_q3,crc83_ab_q4',
            '$filter' => "crc83_ab_year eq {$year}",
        ], ttl: 3600);

        return collect($targetsRaw['value'] ?? [])
            ->keyBy(fn ($t) => $t['_crc83_ab_user_value'] ?? '')
            ->filter(fn ($_, $userId) => $userId !== '')
            ->map(fn ($t) =>
                (int) round((float)($t['crc83_ab_q1'] ?? 0) + (float)($t['crc83_ab_q2'] ?? 0)
                           + (float)($t['crc83_ab_q3'] ?? 0) + (float)($t['crc83_ab_q4'] ?? 0))
            );
    }

    /**
     * Xếp hạng team (business unit) theo tổng giá trị hợp đồng.
     *
     * @return Collection<int, array{team_id: string, name: string, total_value: float, deals: int, avg_deal_size: float, members: int}>
     */
    public function byTeam(Carbon $from, Carbon $to, ?string $territory = null, ?string $department = null): Collection
    {
        $wonQuotes = $this->resolveQuoteValues(
            $this->filterByTerritory($this->filterByDepartment($this->fetchWonQuotes($from, $to), $department), $territory),
            $this->ttlFor($to)
        );
        $users     = $this->fetchUsers();
        $kpiByTeam = $this->kpiByTeam($users, $from->year);
        $wonOppIds = $wonQuotes->pluck('_opportunityid_value')->filter()->unique()->all();

        $lostOpps = $this->filterByTerritory(
            $this->filterByDepartment($this->fetchLostOpportunities($from, $to), $department),
            $territory
        )->filter(fn ($o) => !in_array($o['opportunityid'], $wonOppIds));

        $wonByTeam  = $wonQuotes->groupBy('_owningbusinessunit_value');
        $lostByTeam = $lostOpps->groupBy('_owningbusinessunit_value');
        $allTeamIds = $wonByTeam->keys()->merge($lostByTeam->keys())->unique()->filter();

        return $allTeamIds->map(function ($teamId) use ($wonByTeam, $lostByTeam, $users, $kpiByTeam) {
            $teamWon  = $wonByTeam->get($teamId, collect());
            $teamLost = $lostByTeam->get($teamId, collect());

            $wonByOpp   = $this->maxWonByOpp($teamWon);
            $totalValue = $wonByOpp->sum('resolved_value');
            $wonCount   = $wonByOpp->count();
            $lostCount  = $teamLost->count();
            $total      = $wonCount + $lostCount;

            $avgDays = $wonByOpp->avg(fn ($q) =>
                max(0, Carbon::parse($q['createdon'])->diffInDays(Carbon::parse($q['closedon'])))
            );

            $ownerIds = $teamWon->pluck('_ownerid_value')
                ->merge($teamLost->pluck('_ownerid_value'))
                ->filter()->unique();
            $deptId   = $ownerIds->map(fn ($id) => $users->get($id)['_ab_dim_department_id_value'] ?? null)
                ->filter()->countBy()->sortDesc()->keys()->first() ?? '';
            $deptName = $ownerIds->map(fn ($id) => $users->get($id)['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? null)
                ->filter()->countBy()->sortDesc()->keys()->first() ?? '';

            $sampleWon  = $teamWon->first();
            $sampleLost = $teamLost->first();

            return [
                'team_id'           => $teamId,
                'name'              => $sampleWon['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue']
                    ?? $sampleLost['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue']
                    ?? 'Unknown',
                'department_id'     => $deptId,
                'department'        => $deptName,
                'total_value'       => $totalValue,
                'deals'             => $wonCount,
                'lost_deals'        => $lostCount,
                'win_rate'          => $total > 0 ? round($wonCount / $total * 100, 1) : 0,
                'avg_deal_size'     => $wonCount > 0 ? round($totalValue / $wonCount) : 0,
                'avg_days_to_close' => $wonCount > 0 ? (int) round($avgDays) : null,
                'members'           => $wonByOpp->pluck('_ownerid_value')->unique()->count(),
                'kpi'               => $kpiByTeam->get($teamId) ?: null,
            ];
        })
        ->sortByDesc('total_value')
        ->values();
    }

    // KPI target cả năm theo team — sum Q1+Q2+Q3+Q4 của tất cả user trong team
    private function kpiByTeam(Collection $users, int $year): Collection
    {
        $targetsRaw = $this->api->get('crc83_kpitargetses', [
            '$select' => '_crc83_ab_user_value,crc83_ab_q1,crc83_ab_q2,crc83_ab_q3,crc83_ab_q4',
            '$filter' => "crc83_ab_year eq {$year}",
        ], ttl: 3600);

        $userToTeam = $users->mapWithKeys(fn ($u, $id) => [$id => $u['_businessunitid_value'] ?? '']);

        return collect($targetsRaw['value'] ?? [])
            ->groupBy(fn ($t) => $userToTeam->get($t['_crc83_ab_user_value'] ?? '') ?? '')
            ->filter(fn ($_, $teamId) => $teamId !== '')
            ->map(fn ($teamTargets) =>
                (int) round($teamTargets->sum(fn ($t) =>
                    (float)($t['crc83_ab_q1'] ?? 0) + (float)($t['crc83_ab_q2'] ?? 0)
                    + (float)($t['crc83_ab_q3'] ?? 0) + (float)($t['crc83_ab_q4'] ?? 0)
                ))
            );
    }

    public function topAccounts(Carbon $from, Carbon $to, ?string $territory = null, ?string $department = null): array
    {
        $quotes = $this->resolveQuoteValues(
            $this->filterByTerritory(
                $this->filterByDepartment($this->fetchWonQuotes($from, $to), $department),
                $territory
            ),
            $this->ttlFor($to)
        );

        return $quotes
            ->filter(fn ($q) => !empty($q['_customerid_value']))
            ->groupBy('_customerid_value')
            ->map(fn ($group, $accountId) => [
                'account_id'  => $accountId,
                'name'        => $group->first()['_customerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown',
                'total_value' => $group->sum('resolved_value'),
                'deals'       => $group->count(),
            ])
            ->sortByDesc('total_value')
            ->take(10)
            ->values()
            ->all();
    }

    public function weeklyDeals(int $weekOffset = 0, ?string $territory = null, ?string $department = null): array
    {
        $monday = now()->startOfWeek(Carbon::MONDAY)->addWeeks($weekOffset)->startOfDay();
        $sunday = now()->endOfWeek(Carbon::SUNDAY)->addWeeks($weekOffset)->endOfDay();

        $quotes = $this->resolveQuoteValues(
            $this->filterByTerritory(
                $this->filterByDepartment($this->fetchWonQuotes($monday, $sunday), $department),
                $territory
            ),
            300
        );

        $byDay  = $quotes->groupBy(fn ($q) => Carbon::parse($q['closedon'])->format('Y-m-d'));
        $labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        $result = [];

        for ($i = 0; $i < 7; $i++) {
            $date  = $monday->copy()->addDays($i);
            $key   = $date->toDateString();
            $items = $byDay->get($key, collect());

            $result[] = [
                'day'   => $labels[$i],
                'date'  => $key,
                'count' => $items->pluck('_opportunityid_value')->filter()->unique()->count(),
                'value' => (int) round($items->sum('resolved_value')),
            ];
        }

        return $result;
    }

    // Won quotes only (statecode=2) — dùng cho byPeriod
    private function fetchWonQuotes(Carbon $from, Carbon $to): Collection
    {
        $data = $this->api->get('quotes', [
            '$select'  => 'quoteid,closedon,createdon,_ownerid_value,_owningbusinessunit_value,_opportunityid_value,_customerid_value',
            '$filter'  => implode(' and ', [
                'statecode eq 2',
                "closedon ge {$from->copy()->startOfDay()->utc()->toIso8601String()}",
                "closedon lt {$to->copy()->endOfDay()->utc()->toIso8601String()}",
            ]),
            '$orderby' => 'closedon asc',
        ], ttl: $this->ttlFor($to));

        return collect($data['value'] ?? []);
    }

    // Won (statecode=2) + Closed/Lost (statecode=3) — dùng cho summary, byRep, byTeam
    private function fetchClosedQuotes(Carbon $from, Carbon $to): Collection
    {
        $data = $this->api->get('quotes', [
            '$select'  => 'quoteid,closedon,createdon,statecode,_ownerid_value,_owningbusinessunit_value,_opportunityid_value',
            '$filter'  => implode(' and ', [
                '(statecode eq 2 or statecode eq 3)',
                "closedon ge {$from->copy()->startOfDay()->utc()->toIso8601String()}",
                "closedon lt {$to->copy()->endOfDay()->utc()->toIso8601String()}",
            ]),
            '$orderby' => 'closedon asc',
        ], ttl: $this->ttlFor($to));

        return collect($data['value'] ?? []);
    }

    // resolved_value = SUM(ab_total_amount_plus_ut_no_tax_calculated - ab_line_ut_amount) từ quotedetail
    // ab_line_ut_amount = 0 nếu quote không có SF → kết quả tương đương totalamount
    private function resolveQuoteValues(Collection $quotes, int $ttl = 1800): Collection
    {
        $detailsByQuote = $this->fetchQuoteDetails(
            $quotes->pluck('quoteid')->filter()->values()->all(),
            $ttl
        );

        return $quotes->map(function ($quote) use ($detailsByQuote) {
            $lines = $detailsByQuote->get($quote['quoteid'] ?? '', collect());
            $value = $lines->sum(fn ($l) =>
                (float) ($l['ab_total_amount_plus_ut_no_tax_calculated'] ?? 0)
                - (float) ($l['ab_line_ut_amount'] ?? 0)
            );
            return array_merge($quote, ['resolved_value' => $value]);
        });
    }

    private function fetchQuoteDetails(array $quoteIds, int $ttl = 1800): Collection
    {
        if (empty($quoteIds)) return collect();

        $all = collect();
        foreach (array_chunk($quoteIds, 15) as $chunk) {
            $filter = implode(' or ', array_map(
                fn ($id) => "_quoteid_value eq $id",
                $chunk
            ));
            $data = $this->api->get('quotedetails', [
                '$select' => 'ab_total_amount_plus_ut_no_tax_calculated,ab_line_ut_amount,_quoteid_value',
                '$filter' => $filter,
            ], ttl: $ttl);
            $all = $all->merge($data['value'] ?? []);
        }

        return $all->groupBy('_quoteid_value');
    }

    /**
     * KPI performance theo từng quý — tính rollover khi không đạt mục tiêu.
     *
     * @return array<int, array{user_id: string, name: string, quarters: array}>
     */
    public function kpiPerformance(int $year, ?string $territory = null): array
    {
        $from = Carbon::create($year, 1, 1)->startOfDay();
        $to   = Carbon::create($year, 12, 31)->endOfDay();

        // Targets từ CRM
        $targetsRaw = $this->api->get('crc83_kpitargetses', [
            '$select' => 'crc83_ab_year,crc83_ab_q1,crc83_ab_q2,crc83_ab_q3,crc83_ab_q4,_crc83_ab_user_value',
            '$filter' => "crc83_ab_year eq {$year}",
        ]);

        $targets = collect($targetsRaw['value'] ?? [])
            ->keyBy(fn ($r) => $r['_crc83_ab_user_value'] ?? '');

        if ($targets->isEmpty()) return [];

        // Actual won quotes cho cả năm, group by owner → quarter → sum
        $wonQuotes = $this->resolveQuoteValues(
            $this->filterByTerritory($this->fetchWonQuotes($from, $to), $territory),
            $this->ttlFor($to)
        );

        $actualByOwner = $wonQuotes
            ->groupBy('_ownerid_value')
            ->map(fn ($quotes) =>
                $quotes
                    ->groupBy(fn ($q) => Carbon::parse($q['closedon'])->quarter)
                    ->map(fn ($g) => (float) $g->sum('resolved_value'))
            );

        $now            = now();
        $currentYear    = $now->year;
        $currentQuarter = $now->quarter;

        return $targets->map(function ($target) use ($actualByOwner, $year, $currentYear, $currentQuarter) {
            $userId  = $target['_crc83_ab_user_value'] ?? '';
            $actuals = $actualByOwner->get($userId, collect());
            $rollover = 0.0;
            $quarters = [];

            foreach ([1, 2, 3, 4] as $q) {
                $original  = (float) ($target["crc83_ab_q{$q}"] ?? 0);
                $effective = $original + $rollover;
                $actual    = (float) $actuals->get($q, 0);
                // Chỉ tính rollover sang quý sau khi quý này đã kết thúc
                $quarterEnded = $year < $currentYear || ($year === $currentYear && $q < $currentQuarter);
                $rollover     = $quarterEnded ? max(0.0, $effective - $actual) : 0.0;

                $quarters["q{$q}"] = [
                    'target'    => (int) round($original),
                    'effective' => (int) round($effective),
                    'actual'    => (int) round($actual),
                    'rollover'  => (int) round($rollover),
                ];
            }

            return [
                'user_id'  => $userId,
                'name'     => $target['_crc83_ab_user_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown',
                'quarters' => $quarters,
            ];
        })->values()->toArray();
    }

    public function pipeline(?string $territory = null, ?string $department = null): array
    {
        $opps = $this->filterByTerritory($this->filterByDepartment($this->fetchOpenOpportunities(), $department), $territory);
        $now  = now();

        // Keep: has ≥1 quote (any status) AND no won quote
        $oppIds   = $opps->pluck('opportunityid')->filter()->values()->toArray();
        $wonByOpp = $this->fetchWonQuotesForOpps($oppIds);
        $anyByOpp = $this->fetchAnyQuotesForOpps($oppIds);
        $opps     = $opps->filter(fn ($o) =>
            isset($anyByOpp[$o['opportunityid']]) &&
            !isset($wonByOpp[$o['opportunityid']])
        );

        $maxQuoteValue = fn ($o) => (float) ($anyByOpp[$o['opportunityid']]
            ?->max(fn ($q) => (float) ($q['totalamount'] ?? 0)) ?? 0);

        $pipelineValue = $opps->sum($maxQuoteValue);
        $count         = $opps->count();
        $weighted      = $opps->sum(fn ($o) =>
            $maxQuoteValue($o) * ((float) ($o['closeprobability'] ?? 0) / 100)
        );

        $byStage = $opps
            ->groupBy(fn ($o) => $o['stepname'] ?? 'Chua phan loai')
            ->map(fn ($items, $stage) => [
                'stage' => $stage,
                'count' => $items->count(),
                'value' => $items->sum($maxQuoteValue),
            ])
            ->sortByDesc('value')
            ->values();

        $f30 = $opps->filter(fn ($o) =>
            !empty($o['estimatedclosedate']) &&
            Carbon::parse($o['estimatedclosedate'])->lte($now->copy()->addDays(30))
        )->sum($maxQuoteValue);

        $f60 = $opps->filter(fn ($o) =>
            !empty($o['estimatedclosedate']) &&
            Carbon::parse($o['estimatedclosedate'])->lte($now->copy()->addDays(60))
        )->sum($maxQuoteValue);

        $f90 = $opps->filter(fn ($o) =>
            !empty($o['estimatedclosedate']) &&
            Carbon::parse($o['estimatedclosedate'])->lte($now->copy()->addDays(90))
        )->sum($maxQuoteValue);

        $aging = $opps
            ->filter(fn ($o) =>
                !empty($o['createdon']) &&
                Carbon::parse($o['createdon'])->diffInDays($now) > 90
            )
            ->map(fn ($o) => [
                'name'      => $o['name'] ?? '',
                'owner'     => $o['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown',
                'days_open' => (int) Carbon::parse($o['createdon'])->diffInDays($now),
                'value'     => $maxQuoteValue($o),
                'stage'     => $o['stepname'] ?? '',
            ])
            ->sortByDesc('days_open')
            ->values();

        $urgencyWeight = fn ($o) => match (true) {
            !empty($o['estimatedclosedate']) && Carbon::parse($o['estimatedclosedate'])->lte($now->copy()->addDays(30)) => 1.5,
            !empty($o['estimatedclosedate']) && Carbon::parse($o['estimatedclosedate'])->lte($now->copy()->addDays(60)) => 1.2,
            default => 1.0,
        };

        $topWin = $opps
            ->sortByDesc(fn ($o) =>
                $maxQuoteValue($o) * (1 + (float) ($o['closeprobability'] ?? 0) / 100) * $urgencyWeight($o)
            )
            ->take(10)
            ->map(fn ($o) => [
                'opp_number'       => $o['ab_opportunitynumber'] ?? '',
                'crm_link'         => config('crm.base_url') . '/main.aspx?etn=opportunity&id=' . ($o['opportunityid'] ?? '') . '&pagetype=entityrecord',
                'name'             => $o['name'] ?? '',
                'owner'            => $o['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown',
                'stage'            => $o['stepname'] ?? '',
                'close_probability'=> (int) ($o['closeprobability'] ?? 0),
                'estimated_close'  => !empty($o['estimatedclosedate'])
                    ? Carbon::parse($o['estimatedclosedate'])->toDateString()
                    : null,
                'value'            => $maxQuoteValue($o),
            ])
            ->values();

        return [
            'pipeline_value'    => round($pipelineValue),
            'opportunity_count' => $count,
            'weighted_pipeline' => round($weighted),
            'by_stage'          => $byStage->toArray(),
            'forecast_30d'      => round($f30),
            'forecast_60d'      => round($f60),
            'forecast_90d'      => round($f90),
            'aging'             => $aging->toArray(),
            'top_win'           => $topWin->toArray(),
        ];
    }

    public function quarterlyGapChart(int $year, ?string $territory = null, ?string $department = null): array
    {
        $scopedIds = $this->fetchUsers()
            ->filter(fn ($u) =>
                (!$territory || strtoupper($territory) === 'ALL' ||
                    strtoupper($u['_ab_dim_territory_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === strtoupper($territory)) &&
                (!$department ||
                    ($u['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === $department)
            )
            ->keys()->flip()->toArray();

        if (empty($scopedIds)) {
            return array_map(fn ($q) => ['quarter' => "Q{$q}", 'target' => 0, 'actual' => 0, 'gap' => 0], [1, 2, 3, 4]);
        }

        $targets = collect($this->api->get('crc83_kpitargetses', [
            '$select' => '_crc83_ab_user_value,crc83_ab_q1,crc83_ab_q2,crc83_ab_q3,crc83_ab_q4',
            '$filter' => "crc83_ab_year eq {$year}",
        ], ttl: 3600)['value'] ?? [])
            ->filter(fn ($t) => isset($scopedIds[$t['_crc83_ab_user_value'] ?? '']));

        $from = Carbon::create($year, 1, 1)->startOfDay();
        $to   = Carbon::create($year, 12, 31)->endOfDay();

        $actualByOwner = $this->resolveQuoteValues($this->fetchWonQuotes($from, $to), $this->ttlFor($to))
            ->filter(fn ($q) => isset($scopedIds[$q['_ownerid_value'] ?? '']))
            ->groupBy('_ownerid_value')
            ->map(fn ($quotes) =>
                $quotes->groupBy(fn ($q) => Carbon::parse($q['closedon'])->quarter)
                       ->map(fn ($g) => (float) $g->sum('resolved_value'))
            );

        $now            = now();
        $currentYear    = $now->year;
        $currentQuarter = $now->quarter;

        $targetTotals = [1 => 0.0, 2 => 0.0, 3 => 0.0, 4 => 0.0];
        $actualTotals = [1 => 0.0, 2 => 0.0, 3 => 0.0, 4 => 0.0];

        foreach ($targets as $target) {
            $userId   = $target['_crc83_ab_user_value'] ?? '';
            $actuals  = $actualByOwner->get($userId, collect());
            $rollover = 0.0;

            foreach ([1, 2, 3, 4] as $q) {
                $original     = (float) ($target["crc83_ab_q{$q}"] ?? 0);
                $effective    = $original + $rollover;
                $actual       = (float) $actuals->get($q, 0);
                $quarterEnded = $year < $currentYear || ($year === $currentYear && $q < $currentQuarter);
                $rollover     = $quarterEnded ? max(0.0, $effective - $actual) : 0.0;

                $targetTotals[$q] += $effective;
                $actualTotals[$q] += $actual;
            }
        }

        return array_map(function ($q) use ($targetTotals, $actualTotals) {
            $target = (int) round($targetTotals[$q]);
            $actual = (int) round($actualTotals[$q]);
            return [
                'quarter' => "Q{$q}",
                'target'  => $target,
                'actual'  => $actual,
                'gap'     => max(0, $target - $actual),
            ];
        }, [1, 2, 3, 4]);
    }

    public function currentQuarterGap(?string $territory = null, ?string $department = null): array
    {
        $now     = now();
        $year    = (int) $now->year;
        $quarter = (int) $now->quarter;

        $performance = collect($this->kpiPerformance($year));
        if ($performance->isEmpty()) return [];

        // Filter reps by territory + department
        if (($territory && strtoupper($territory) !== 'ALL') || $department) {
            $allowedIds = array_flip(
                $this->fetchUsers()->filter(function ($u) use ($territory, $department) {
                    $tOk = !$territory || strtoupper($territory) === 'ALL' ||
                           strtoupper($u['_ab_dim_territory_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === strtoupper($territory);
                    $dOk = !$department ||
                           ($u['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === $department;
                    return $tOk && $dOk;
                })->keys()->toArray()
            );
            $performance = $performance->filter(fn ($p) => isset($allowedIds[$p['user_id']]));
        }

        if ($performance->isEmpty()) return [];

        // Actual revenue current quarter, same filters
        $startMonth = ($quarter - 1) * 3 + 1;
        $endMonth   = $quarter * 3;
        $from = Carbon::create($year, $startMonth, 1)->startOfDay();
        $to   = Carbon::create($year, $endMonth, 1)->endOfMonth()->endOfDay();
        if ($to->gt($now)) $to = $now->copy()->endOfDay();

        $wonQuotes = $this->resolveQuoteValues(
            $this->filterByTerritory(
                $this->filterByDepartment($this->fetchWonQuotes($from, $to), $department),
                $territory
            ),
            $this->ttlFor($to)
        );

        $actualByRep = $wonQuotes
            ->groupBy('_ownerid_value')
            ->map(fn ($g) => (float) $g->sum('resolved_value'));

        $qKey = "q{$quarter}";

        return $performance
            ->map(function ($perf) use ($qKey, $actualByRep) {
                $target = (float) ($perf['quarters'][$qKey]['effective'] ?? 0);
                if ($target <= 0) return null;

                $actual = (float) ($actualByRep->get($perf['user_id']) ?? 0);
                $gap    = max(0.0, $target - $actual);

                return [
                    'user_id'        => $perf['user_id'],
                    'name'           => $perf['name'],
                    'target'         => (int) round($target),
                    'actual'         => (int) round($actual),
                    'gap'            => (int) round($gap),
                    'attainment_pct' => round($actual / $target * 100, 1),
                ];
            })
            ->filter()
            ->sortByDesc('gap')
            ->values()
            ->toArray();
    }

    private function fetchOpenOpportunities(): Collection
    {
        $data = $this->api->get('opportunities', [
            '$select'  => 'opportunityid,ab_opportunitynumber,name,estimatedvalue,closeprobability,stepname,estimatedclosedate,createdon,_ownerid_value,_owningbusinessunit_value',
            '$filter'  => 'statecode eq 0',
            '$orderby' => 'createdon desc',
            '$top'     => '500',
        ], ttl: 300);

        return collect($data['value'] ?? []);
    }

    private function fetchWonQuotesForOpps(array $oppIds): Collection
    {
        if (empty($oppIds)) return collect();

        $data = $this->api->get('quotes', [
            '$select' => 'totalamount,_opportunityid_value',
            '$filter' => 'statecode eq 2',
            '$top'    => '5000',
        ], ttl: 300);

        $oppIdSet = array_flip($oppIds);

        return collect($data['value'] ?? [])
            ->filter(fn ($q) =>
                !empty($q['_opportunityid_value']) &&
                isset($oppIdSet[$q['_opportunityid_value']])
            )
            ->groupBy('_opportunityid_value');
    }

    private function fetchAnyQuotesForOpps(array $oppIds): Collection
    {
        if (empty($oppIds)) return collect();

        $data = $this->api->get('quotes', [
            '$select' => 'quoteid,totalamount,_opportunityid_value',
            '$filter' => '_opportunityid_value ne null',
            '$top'    => '5000',
        ], ttl: 300);

        $oppIdSet = array_flip($oppIds);

        return collect($data['value'] ?? [])
            ->filter(fn ($q) =>
                !empty($q['_opportunityid_value']) &&
                isset($oppIdSet[$q['_opportunityid_value']])
            )
            ->groupBy('_opportunityid_value');
    }

    private function ttlFor(Carbon $to): int
    {
        return $to->year < now()->year ? 86400 : 1800;
    }

    // Closed (non-open) opportunities trong kỳ — dùng để tính Lost
    private function fetchLostOpportunities(Carbon $from, Carbon $to): Collection
    {
        $data = $this->api->get('opportunities', [
            '$select'  => 'opportunityid,actualclosedate,_ownerid_value,_owningbusinessunit_value',
            '$filter'  => implode(' and ', [
                'statecode ne 0',
                "actualclosedate ge {$from->copy()->startOfDay()->utc()->toIso8601String()}",
                "actualclosedate lt {$to->copy()->endOfDay()->utc()->toIso8601String()}",
            ]),
            '$top'     => '5000',
        ], ttl: $this->ttlFor($to));

        return collect($data['value'] ?? []);
    }

    // Group won quotes by opportunity, giữ quote có giá trị cao nhất mỗi opp
    private function maxWonByOpp(Collection $wonQuotes): Collection
    {
        return $wonQuotes
            ->groupBy(fn ($q) => $q['_opportunityid_value'] ?: $q['quoteid'])
            ->map(fn ($quotes) => $quotes->sortByDesc('resolved_value')->first());
    }

    private function periodKey(?string $date, string $groupBy): string
    {
        if (!$date) return 'unknown';
        $dt = Carbon::parse($date);

        return match ($groupBy) {
            'quarter' => 'Q' . $dt->quarter . ' ' . $dt->year,  // "Q1 2025"
            'week'    => $dt->startOfWeek()->format('Y-\WW'),    // "2025-W03"
            'month'   => $dt->format('Y-m'),                     // "2025-03"
            default   => $dt->toDateString(),                    // "2025-03-15"
        };
    }

    private function filterByTerritory(Collection $deals, ?string $territory): Collection
    {
        if (!$territory || strtoupper($territory) === 'ALL') return $deals;

        $ownerIds = $this->fetchUsers()
            ->filter(fn ($u) =>
                strtoupper($u['_ab_dim_territory_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === strtoupper($territory)
            )
            ->keys()
            ->toArray();

        return $deals->filter(fn ($d) => in_array($d['_ownerid_value'], $ownerIds));
    }

    private function filterByDepartment(Collection $deals, ?string $department): Collection
    {
        if (!$department) return $deals;

        $ownerIds = $this->fetchUsers()
            ->filter(fn ($u) =>
                ($u['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === $department
            )
            ->keys()
            ->toArray();

        return $deals->filter(fn ($d) => in_array($d['_ownerid_value'], $ownerIds));
    }

    private function loadKpiConfig(): array
    {
        $path = storage_path('app/kpi.json');
        if (!file_exists($path)) return ['teams' => []];
        return json_decode(file_get_contents($path), true) ?? ['teams' => []];
    }

    public function users(): Collection
    {
        return $this->fetchUsers()
            ->filter(fn ($u) =>
                !empty($u['_ab_dim_territory_id_value']) &&
                !empty($u['_ab_dim_department_id_value']) &&
                !empty($u['_businessunitid_value'])
            )
            ->map(fn ($u) => [
                'id'         => $u['systemuserid'],
                'name'       => $u['fullname'] ?? '',
                'territory'  => $u['_ab_dim_territory_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'department' => $u['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'team'       => $u['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            ])
            ->values()
            ->sortBy('name')
            ->values();
    }

    private function allUsersParams(): array
    {
        return [
            '$select' => implode(',', [
                'systemuserid',
                'fullname',
                'title',
                'internalemailaddress',
                'mobilephone',
                'isdisabled',
                'azurestate',
                '_ab_dim_territory_id_value',
                '_ab_dim_cost_center_id_value',
                '_ab_dim_department_id_value',
            ]),
            '$expand' => 'businessunitid($select=name)',
            '$filter' => 'deletedstate eq 0',
            '$top'    => '1000',
        ];
    }

    public function allUsers(): Collection
    {
        $data = $this->api->get('systemusers', $this->allUsersParams(), ttl: 3600);

        return collect($data['value'] ?? [])
            ->filter(fn ($u) =>
                str_ends_with(strtolower($u['internalemailaddress'] ?? ''), '@huutoan.com') &&
                !empty($u['_ab_dim_department_id_value']) &&
                !empty($u['_ab_dim_territory_id_value'])
            )
            ->map(fn ($u) => [
                'id'              => $u['systemuserid'],
                'full_name'       => $u['fullname'] ?? '',
                'title'           => $u['title'] ?? '',
                'email'           => $u['internalemailaddress'] ?? '',
                'mobile'          => $u['mobilephone'] ?? '',
                'is_disabled'     => (bool) ($u['isdisabled'] ?? false),
                'azure_state'     => (int) ($u['azurestate'] ?? 0),
                'business_unit'    => $u['businessunitid']['name'] ?? '',
                'business_unit_id' => $u['businessunitid']['businessunitid'] ?? null,
                'department'      => $u['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'department_id'   => $u['_ab_dim_department_id_value'] ?? null,
                'cost_center'     => $u['_ab_dim_cost_center_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'cost_center_id'  => $u['_ab_dim_cost_center_id_value'] ?? null,
                'territory'       => $u['_ab_dim_territory_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'territory_id'    => $u['_ab_dim_territory_id_value'] ?? null,
            ])
            ->sortBy('full_name')
            ->values();
    }

    public function updateUser(string $userId, array $payload): void
    {
        $body = [];

        // Entity set names cho dimension lookups — xác nhận lại với D365 metadata nếu PATCH thất bại
        if (!empty($payload['department_id'])) {
            $body['ab_dim_department_id@odata.bind'] = "/ab_financial_dimension_values({$payload['department_id']})";
        }
        if (!empty($payload['territory_id'])) {
            $body['ab_dim_territory_id@odata.bind'] = "/ab_financial_dimension_values({$payload['territory_id']})";
        }
        if (!empty($payload['cost_center_id'])) {
            $body['ab_dim_cost_center_id@odata.bind'] = "/ab_financial_dimension_values({$payload['cost_center_id']})";
        }
        if (!empty($payload['business_unit_id'])) {
            $body['businessunitid@odata.bind'] = "/businessunits({$payload['business_unit_id']})";
        }
        if (array_key_exists('is_disabled', $payload)) {
            $body['isdisabled'] = (bool) $payload['is_disabled'];
        }

        if (!empty($body)) {
            $this->api->patch('systemusers', $userId, $body);
            $this->api->forget('systemusers', $this->allUsersParams());
        }
    }

    public function opportunityQuality(?string $territory = null, ?string $department = null): array
    {
        $opps = $this->filterByTerritory(
            $this->filterByDepartment($this->fetchOpenOppsForQuality(), $department),
            $territory
        );

        $oppIds   = $opps->pluck('opportunityid')->filter()->values()->toArray();
        $wonByOpp = $this->fetchWonQuotesForOpps($oppIds);
        $opps     = $opps->filter(fn ($o) => !isset($wonByOpp[$o['opportunityid']]));

        $oppIdSet    = array_flip($opps->pluck('opportunityid')->filter()->toArray());
        $quotesByOpp = $this->fetchAllQuotesForOpps()
            ->filter(fn ($q) => isset($oppIdSet[$q['_opportunityid_value'] ?? '']))
            ->groupBy('_opportunityid_value');

        try {
            $activeOppIds = $this->fetchRecentOppActivities(30)
                ->pluck('_regardingobjectid_value')
                ->filter()
                ->flip()
                ->toArray();
        } catch (\Throwable) {
            $activeOppIds = [];
        }

        $byRep = $opps
            ->groupBy('_ownerid_value')
            ->map(function (Collection $repOpps, string $ownerId) use ($quotesByOpp, $activeOppIds) {
                $name  = $repOpps->first()['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown';
                $total = $repOpps->count();

                $withQuote     = 0;
                $quoteLags     = [];
                $completeCount = 0;
                $noActivity    = 0;
                $backdated     = 0;

                foreach ($repOpps as $opp) {
                    $oppId  = $opp['opportunityid'];
                    $quotes = $quotesByOpp->get($oppId, collect());

                    if ($quotes->isNotEmpty()) {
                        $withQuote++;
                        $oppCreated = Carbon::parse($opp['createdon']);
                        $firstQuote = $quotes
                            ->map(fn ($q) => Carbon::parse($q['createdon']))
                            ->sort()
                            ->first();
                        if ($firstQuote) {
                            $quoteLags[] = max(0, (int) $oppCreated->diffInDays($firstQuote));
                        }
                    }

                    $hasCloseDate = !empty($opp['estimatedclosedate']);
                    $hasAmount    = (float) ($opp['estimatedvalue'] ?? 0) > 0;
                    $hasStage     = !empty($opp['stepname']);
                    $hasCustomer  = !empty($opp['_customerid_value']);
                    if ($hasCloseDate && $hasAmount && $hasStage && $hasCustomer) {
                        $completeCount++;
                    }

                    if (!isset($activeOppIds[$oppId])) {
                        $noActivity++;
                    }

                    if (!empty($opp['estimatedclosedate']) && !empty($opp['createdon'])) {
                        $created   = Carbon::parse($opp['createdon']);
                        $closeDate = Carbon::parse($opp['estimatedclosedate']);
                        if ($closeDate->gte($created) && $created->diffInDays($closeDate) <= 7) {
                            $backdated++;
                        }
                    }
                }

                return [
                    'owner_id'          => $ownerId,
                    'name'              => $name,
                    'total_open'        => $total,
                    'with_quote'        => $withQuote,
                    'quote_attach_rate' => $total > 0 ? round($withQuote / $total * 100, 1) : 0.0,
                    'avg_days_to_quote' => count($quoteLags) > 0
                        ? round(array_sum($quoteLags) / count($quoteLags), 1)
                        : null,
                    'complete_rate'     => $total > 0 ? round($completeCount / $total * 100, 1) : 0.0,
                    'no_activity_30d'   => $noActivity,
                    'backdated'         => $backdated,
                ];
            })
            ->sortByDesc('total_open')
            ->values();

        return $byRep->toArray();
    }

    private function fetchOpenOppsForQuality(): Collection
    {
        $data = $this->api->get('opportunities', [
            '$select'  => 'opportunityid,estimatedvalue,stepname,estimatedclosedate,createdon,_ownerid_value,_owningbusinessunit_value,_customerid_value',
            '$filter'  => 'statecode eq 0',
            '$orderby' => 'createdon desc',
            '$top'     => '500',
        ], ttl: 300);

        return collect($data['value'] ?? []);
    }

    private function fetchAllQuotesForOpps(): Collection
    {
        $data = $this->api->get('quotes', [
            '$select'  => 'quoteid,_opportunityid_value,createdon',
            '$orderby' => 'createdon desc',
            '$top'     => '5000',
        ], ttl: 300);

        return collect($data['value'] ?? [])->filter(fn ($q) => !empty($q['_opportunityid_value']));
    }

    private function fetchRecentOppActivities(int $days = 30): Collection
    {
        $cutoff = now()->subDays($days)->utc()->toIso8601String();
        $data   = $this->api->get('activitypointers', [
            '$select' => '_regardingobjectid_value',
            '$filter' => "createdon ge {$cutoff} and regardingobjecttypecode eq 'opportunity'",
            '$top'    => '5000',
        ], ttl: 180);

        return collect($data['value'] ?? [])->filter(fn ($a) => !empty($a['_regardingobjectid_value']));
    }

    // Lấy danh sách user, keyed theo systemuserid — dùng để map owner_id → territory/department/cost_center
    private function fetchUsers(): Collection
    {
        $data = $this->api->get('systemusers', [
            '$select' => 'fullname,systemuserid,title,_ab_dim_territory_id_value,_ab_dim_cost_center_id_value,_ab_dim_department_id_value,_businessunitid_value',
            '$filter' => 'azurestate eq 0 and deletedstate eq 0',
            '$top'    => '1000',
        ], ttl: 3600);

        return collect($data['value'] ?? [])->keyBy('systemuserid');
    }
}
