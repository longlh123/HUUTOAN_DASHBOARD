<?php

namespace App\Services\Crm;

use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class SalesPerformanceService
{
    private const GENSET_LABELS = ['Sales-B2B', 'Sales-B2D', 'Sales-OEM', 'Sales-International', 'Sales-B2C'];

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
        $wonByOpp   = $this->calcOppValue($wonQuotes);
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

        return $wonQuotes
            ->groupBy(fn ($q) => $this->periodKey($q['closedon'], $groupBy))
            ->map(fn ($periodQuotes, $period) => [
                'period' => $period,
                'value'  => (float) $this->calcOppValue($periodQuotes)->sum('resolved_value'),
                'deals'  => $this->calcOppValue($periodQuotes)->count(),
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

        // Group by owner FIRST — mỗi người tính calcOppValue trên quotes của chính họ
        $wonByOwner  = $wonQuotes->groupBy('_ownerid_value');
        $wonOppIds   = $wonQuotes->pluck('_opportunityid_value')->filter()->unique()->all();

        $lostOpps = $this->filterByTerritory(
            $this->filterByDepartment($this->fetchLostOpportunities($from, $to), $department),
            $territory
        )->filter(fn ($o) => !in_array($o['opportunityid'], $wonOppIds));

        $lostByOwner = $lostOpps->groupBy('_ownerid_value');
        $allOwnerIds = $wonByOwner->keys()->merge($lostByOwner->keys())->unique();

        return $allOwnerIds->map(function ($ownerId) use ($wonByOwner, $lostByOwner, $kpiByRep) {
            $ownerWon  = $wonByOwner->get($ownerId, collect());
            $ownerLost = $lostByOwner->get($ownerId, collect());

            // calcOppValue trên quotes của chính người này → không bị mất opp vì representative sai owner
            $ownerOppRows = $this->calcOppValue($ownerWon);
            $totalValue   = $ownerOppRows->sum('resolved_value');
            $wonCount     = $ownerOppRows->count();
            $lostCount    = $ownerLost->count();
            $total        = $wonCount + $lostCount;

            $avgDays = $ownerOppRows->avg(fn ($q) =>
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

        $allWonQuotes = $this->resolveQuoteValues($this->fetchWonQuotes($from, $to), $this->ttlFor($to));

        $actualByOwner = $allWonQuotes
            ->filter(fn ($q) => isset($scopedIds[$q['_ownerid_value'] ?? '']))
            ->groupBy('_ownerid_value')
            ->map(fn ($ownerQuotes) =>
                $ownerQuotes
                    ->groupBy(fn ($q) => Carbon::parse($q['closedon'])->quarter)
                    ->map(fn ($qQuotes) => (float) $this->calcOppValue($qQuotes)->sum('resolved_value'))
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

        // Group by team FIRST — mỗi team tính calcOppValue trên quotes của chính team
        $wonByTeam  = $wonQuotes->groupBy('_owningbusinessunit_value');
        $wonOppIds  = $wonQuotes->pluck('_opportunityid_value')->filter()->unique()->all();

        $lostOpps = $this->filterByTerritory(
            $this->filterByDepartment($this->fetchLostOpportunities($from, $to), $department),
            $territory
        )->filter(fn ($o) => !in_array($o['opportunityid'], $wonOppIds));

        $lostByTeam = $lostOpps->groupBy('_owningbusinessunit_value');
        $allTeamIds = $wonByTeam->keys()->merge($lostByTeam->keys())->unique()->filter();

        return $allTeamIds->map(function ($teamId) use ($wonByTeam, $lostByTeam, $users, $kpiByTeam) {
            $teamWon  = $wonByTeam->get($teamId, collect());
            $teamLost = $lostByTeam->get($teamId, collect());

            // Tính per-member rồi aggregate — tránh de-duplicate opp nhầm
            // (nếu calcOppValue trên toàn team, opp của Liem có thể bị assign representative là người khác)
            $memberOppRows = $teamWon
                ->groupBy('_ownerid_value')
                ->flatMap(fn ($memberQuotes) => $this->calcOppValue($memberQuotes)->all());

            $totalValue = $memberOppRows->sum('resolved_value');
            $wonCount   = $memberOppRows->count();
            $lostCount  = $teamLost->count();
            $total      = $wonCount + $lostCount;

            $avgDays = $memberOppRows->avg(fn ($q) =>
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
                'members'           => $teamWon->pluck('_ownerid_value')->unique()->count(),
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

        return $this->calcOppValue($quotes)
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

    /**
     * Danh sach tung deal (Won quote, da dedup theo opportunity giong cach tinh byRep/byPeriod)
     * trong 1 khoang ngay — dung de doi chieu voi so lieu tu theo doi thu cong cua team.
     * Kem theo so_number (Sales Order) neu quote da duoc convert sang SO — khong phai quote nao
     * cung co SO ngay, mot so deal Won van chua duoc tao SO tai thoi diem query.
     *
     * @return Collection<int, array{quote_number: ?string, so_number: ?string, name: ?string, owner: string, team: string, closedon: ?string, createdon: ?string, value: float}>
     */
    public function dealList(Carbon $from, Carbon $to, ?string $territory = null, ?string $department = null): Collection
    {
        $wonQuotes = $this->resolveQuoteValues(
            $this->filterByTerritory($this->filterByDepartment($this->fetchWonQuotes($from, $to), $department), $territory),
            $this->ttlFor($to)
        );

        $oppRows = $this->calcOppValue($wonQuotes);

        $quoteIds  = $oppRows->pluck('quoteid')->filter()->unique()->values()->all();
        $soByQuote = $this->fetchSalesOrderNumbers($quoteIds);

        return $oppRows
            ->map(fn ($q) => [
                'quote_number' => $q['quotenumber'] ?? null,
                'so_number'    => $soByQuote[$q['quoteid'] ?? ''] ?? null,
                'name'         => $q['name'] ?? null,
                'owner'        => $q['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown',
                'team'         => $q['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'closedon'     => $q['closedon'] ?? null,
                'createdon'    => $q['createdon'] ?? null,
                'value'        => (float) $q['resolved_value'],
            ])
            ->sortBy('closedon')
            ->values();
    }

    // Map quoteId => ordernumber (SO) — khong phai quote nao cung co SO, chi convert khi co ket qua
    private function fetchSalesOrderNumbers(array $quoteIds): array
    {
        if (empty($quoteIds)) return [];

        $byQuote = [];
        foreach (array_chunk($quoteIds, 20) as $chunk) {
            $filter = implode(' or ', array_map(fn ($id) => "_quoteid_value eq $id", $chunk));
            $data   = $this->api->get('salesorders', [
                '$select' => 'ordernumber,_quoteid_value',
                '$filter' => $filter,
            ], ttl: 1800);

            foreach ($data['value'] ?? [] as $so) {
                $qid = $so['_quoteid_value'] ?? '';
                if ($qid && !isset($byQuote[$qid])) {
                    $byQuote[$qid] = $so['ordernumber'] ?? null;
                }
            }
        }

        return $byQuote;
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

        $oppRows = $this->calcOppValue($quotes);
        $byDay   = $oppRows->groupBy(fn ($q) => Carbon::parse($q['closedon'])->format('Y-m-d'));
        $labels  = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        $result  = [];

        for ($i = 0; $i < 7; $i++) {
            $date  = $monday->copy()->addDays($i);
            $key   = $date->toDateString();
            $items = $byDay->get($key, collect());

            $result[] = [
                'day'   => $labels[$i],
                'date'  => $key,
                'count' => $items->count(),
                'value' => (int) round($items->sum('resolved_value')),
            ];
        }

        return $result;
    }

    // Won quotes only (statecode=2) — dùng cho byPeriod
    private function fetchWonQuotes(Carbon $from, Carbon $to): Collection
    {
        $data = $this->api->get('quotes', [
            '$select'  => 'quoteid,quotenumber,name,closedon,createdon,ab_request_type_code,_ownerid_value,_owningbusinessunit_value,_opportunityid_value,_customerid_value',
            '$filter'  => implode(' and ', [
                'statecode eq 2',
                "closedon ge {$from->copy()->startOfDay()->utc()->toIso8601String()}",
                "closedon lt {$to->copy()->addDay()->startOfDay()->utc()->toIso8601String()}",
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
                "closedon lt {$to->copy()->addDay()->startOfDay()->utc()->toIso8601String()}",
            ]),
            '$orderby' => 'closedon asc',
        ], ttl: $this->ttlFor($to));

        return collect($data['value'] ?? []);
    }

    // resolved_value = SUM(ab_total_amount_plus_ut_no_tax_calculated - ab_line_ut_amount) từ quotedetail
    // ab_line_ut_amount = 0 nếu quote không có SF → kết quả tương đương totalamount
    private function resolveQuoteValues(Collection $quotes, int $ttl = 1800): Collection
    {
        $quoteIds = $quotes->pluck('quoteid')->filter()->values()->sort()->values()->all();
        if (empty($quoteIds)) return $quotes;

        // Cache theo dung bo quoteId (khong phai theo tung chunk rieng le) — byPeriod/byRep/byTeam
        // cung mot khoang ngay se ra cung mot bo quoteId, gop lai 1 cache entry duy nhat thay vi
        // moi method tu chunk lai tu dau, tranh lap lai toan bo vong lap goi CRM.
        $cacheKey = 'crm:quote_values:' . md5(implode(',', $quoteIds));

        // Lock tranh 2 request cung luc deu cache-miss roi tu sweep CRM song song (da gap thuc te:
        // by-team + by-rep ban dong thoi, ca 2 deu mat ~37s vi khong request nao kip ghi cache
        // truoc khi request kia doc). Request den sau se doi request dau ghi xong cache roi doc
        // lai, khong tu fetch CRM lan nua.
        $valueByQuote = Cache::lock("lock:{$cacheKey}", 120)->block(120, fn () =>
            cache()->remember($cacheKey, $ttl, function () use ($quoteIds, $ttl) {
                $detailsByQuote = $this->fetchQuoteDetails($quoteIds, $ttl);

                return $detailsByQuote->map(fn ($lines) => $lines->sum(fn ($l) =>
                    (float) ($l['ab_total_amount_plus_ut_no_tax_calculated'] ?? 0)
                    - (float) ($l['ab_line_ut_amount'] ?? 0)
                ))->all();
            })
        );

        return $quotes->map(fn ($quote) => array_merge($quote, [
            'resolved_value' => $valueByQuote[$quote['quoteid'] ?? ''] ?? 0.0,
        ]));
    }

    private function fetchQuoteDetails(array $quoteIds, int $ttl = 1800): Collection
    {
        if (empty($quoteIds)) return collect();

        $all = collect();
        foreach (array_chunk($quoteIds, 20) as $chunk) {
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

        // Actual won quotes cho cả năm, group by owner → calcOppValue per owner → group by quarter
        $wonQuotes = $this->resolveQuoteValues(
            $this->filterByTerritory($this->fetchWonQuotes($from, $to), $territory),
            $this->ttlFor($to)
        );

        // Group by owner → quarter → calcOppValue per quarter
        // Tránh cross-quarter: opp có quote Q1 và Q4 không bị assign nhầm quarter
        $actualByOwner = $wonQuotes
            ->groupBy('_ownerid_value')
            ->map(fn ($ownerQuotes) =>
                $ownerQuotes
                    ->groupBy(fn ($q) => Carbon::parse($q['closedon'])->quarter)
                    ->map(fn ($qQuotes) => (float) $this->calcOppValue($qQuotes)->sum('resolved_value'))
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
        $potentialProb = fn ($o) => match (
            $o['ab_project_potential_code@OData.Community.Display.V1.FormattedValue'] ?? ''
        ) {
            'High'   => 0.70,
            'Medium' => 0.40,
            'Low'    => 0.20,
            default  => 0.10,
        };
        $weighted = $opps->sum(fn ($o) => $maxQuoteValue($o) * $potentialProb($o));

        $byPotential = $opps
            ->groupBy(fn ($o) => $o['ab_project_potential_code@OData.Community.Display.V1.FormattedValue'] ?? 'Chua phan loai')
            ->map(fn ($items, $label) => [
                'label' => $label,
                'count' => $items->count(),
                'value' => round($items->sum($maxQuoteValue)),
                'pct'   => $count > 0 ? round($items->count() / $count * 100, 1) : 0.0,
            ])
            ->sortBy(fn ($item) => match ($item['label']) {
                'High'  => 0,
                'Medium' => 1,
                'Low'   => 2,
                default => 3,
            })
            ->values();

        $byStage = $opps
            ->groupBy(fn ($o) => $o['ab_process_stage_code@OData.Community.Display.V1.FormattedValue'] ?? 'Chua phan loai')
            ->map(fn ($items, $stage) => [
                'stage' => $stage,
                'count' => $items->count(),
                'value' => $items->sum($maxQuoteValue),
            ])
            ->sortByDesc('value')
            ->values();

        $currentQStart = $now->copy()->startOfQuarter();
        $currentQEnd   = $now->copy()->endOfQuarter();
        $nextQStart    = $now->copy()->addQuarters(1)->startOfQuarter();
        $nextQ1End     = $now->copy()->addQuarters(1)->endOfQuarter();
        $nextQ2End     = $now->copy()->addQuarters(2)->endOfQuarter();

        // Opp con ton dong trong quy hien tai — tinh tu dau quy (khong phai tu hom nay),
        // vi opp da qua EstimatedCloseDate nhung van con Open la opp can hoi thuc sale.
        $currentQOpps = $opps->filter(fn ($o) =>
            !empty($o['estimatedclosedate']) &&
            Carbon::parse($o['estimatedclosedate'])->between($currentQStart, $currentQEnd)
        );
        $fCurrentQ         = $currentQOpps->sum($maxQuoteValue);
        $fCurrentQCount    = $currentQOpps->count();
        $fCurrentQWeighted = $currentQOpps->sum(fn ($o) => $maxQuoteValue($o) * $potentialProb($o));

        $nextQOpps = $opps->filter(fn ($o) =>
            !empty($o['estimatedclosedate']) &&
            Carbon::parse($o['estimatedclosedate'])->between($nextQStart, $nextQ1End)
        );
        $fNextQ         = $nextQOpps->sum($maxQuoteValue);
        $fNextQCount    = $nextQOpps->count();
        $fNextQWeighted = $nextQOpps->sum(fn ($o) => $maxQuoteValue($o) * $potentialProb($o));

        $next2QOpps = $opps->filter(fn ($o) =>
            !empty($o['estimatedclosedate']) &&
            Carbon::parse($o['estimatedclosedate'])->between($nextQStart, $nextQ2End)
        );
        $f2Q         = $next2QOpps->sum($maxQuoteValue);
        $f2QWeighted = $next2QOpps->sum(fn ($o) => $maxQuoteValue($o) * $potentialProb($o));

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
                'stage'     => $o['ab_process_stage_code@OData.Community.Display.V1.FormattedValue'] ?? '',
            ])
            ->sortByDesc('days_open')
            ->values();

        $urgencyWeight = fn ($o) => match (true) {
            !empty($o['estimatedclosedate']) && Carbon::parse($o['estimatedclosedate'])->lte($now->copy()->addDays(30)) => 1.5,
            !empty($o['estimatedclosedate']) && Carbon::parse($o['estimatedclosedate'])->lte($now->copy()->addDays(60)) => 1.2,
            default => 1.0,
        };

        $potentialOrder = fn ($o) => match (
            $o['ab_project_potential_code@OData.Community.Display.V1.FormattedValue'] ?? ''
        ) {
            'High'   => 0,
            'Medium' => 1,
            'Low'    => 2,
            default  => 3,
        };

        $topWin = $opps
            ->sortBy(fn ($o) => [$potentialOrder($o), -$maxQuoteValue($o)])
            ->map(fn ($o) => [
                'opp_number'       => $o['ab_opportunitynumber'] ?? '',
                'crm_link'         => config('crm.base_url') . '/main.aspx?etn=opportunity&id=' . ($o['opportunityid'] ?? '') . '&pagetype=entityrecord',
                'name'             => $o['name'] ?? '',
                'owner'            => $o['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown',
                'stage'            => $o['ab_process_stage_code@OData.Community.Display.V1.FormattedValue'] ?? '',
                'potential'        => $o['ab_project_potential_code@OData.Community.Display.V1.FormattedValue'] ?? '',
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
            'by_potential'      => $byPotential->toArray(),
            'by_stage'          => $byStage->toArray(),
            'forecast_current_quarter'          => round($fCurrentQ),
            'forecast_current_quarter_count'    => $fCurrentQCount,
            'forecast_current_quarter_weighted' => round($fCurrentQWeighted),
            'forecast_next_quarter'          => round($fNextQ),
            'forecast_next_quarter_count'    => $fNextQCount,
            'forecast_next_quarter_weighted' => round($fNextQWeighted),
            'forecast_next_2q'          => round($f2Q),
            'forecast_next_2q_weighted' => round($f2QWeighted),
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

        $allWonQuotes2 = $this->resolveQuoteValues($this->fetchWonQuotes($from, $to), $this->ttlFor($to));

        $actualByOwner = $allWonQuotes2
            ->filter(fn ($q) => isset($scopedIds[$q['_ownerid_value'] ?? '']))
            ->groupBy('_ownerid_value')
            ->map(fn ($ownerQuotes) =>
                $ownerQuotes
                    ->groupBy(fn ($q) => Carbon::parse($q['closedon'])->quarter)
                    ->map(fn ($qQuotes) => (float) $this->calcOppValue($qQuotes)->sum('resolved_value'))
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

        // Cong them actual cua sale chua khai KPI target — khong co target nen khong rollover,
        // chi cong thang doanh so vao actual de Gap to Target phan anh dung tong doanh thu thuc te.
        $targetedIds = $targets->pluck('_crc83_ab_user_value')->filter()->flip()->toArray();
        foreach ($actualByOwner as $ownerId => $quarters) {
            if (isset($targetedIds[$ownerId])) continue;
            foreach ([1, 2, 3, 4] as $q) {
                $actualTotals[$q] += (float) $quarters->get($q, 0);
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
            ->map(fn ($ownerQuotes) => (float) $this->calcOppValue($ownerQuotes)->sum('resolved_value'));

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
        // Dung getAll() (follow @odata.nextLink) thay vi $top cung - CRM co the co > 500 open opp
        // va $top se cat mat du lieu ma khong bao loi.
        $data = cache()->remember('crm:pipeline_open_opportunities', 300, fn () =>
            $this->api->getAll('opportunities', [
                '$select'  => 'opportunityid,ab_opportunitynumber,name,estimatedvalue,closeprobability,ab_process_stage_code,estimatedclosedate,createdon,_ownerid_value,_owningbusinessunit_value,ab_project_potential_code',
                '$filter'  => 'statecode eq 0',
                '$orderby' => 'createdon desc',
            ])
        );

        return collect($data);
    }

    private function fetchWonQuotesForOpps(array $oppIds): Collection
    {
        if (empty($oppIds)) return collect();

        $all = cache()->remember('crm:pipeline_won_quotes', 300, fn () =>
            $this->api->getAll('quotes', [
                '$select' => 'totalamount,_opportunityid_value',
                '$filter' => 'statecode eq 2',
            ])
        );

        $oppIdSet = array_flip($oppIds);

        return collect($all)
            ->filter(fn ($q) =>
                !empty($q['_opportunityid_value']) &&
                isset($oppIdSet[$q['_opportunityid_value']])
            )
            ->groupBy('_opportunityid_value');
    }

    // Lấy Active (1) + Draft (0) quotes — dùng getAll() để pagination, tránh $top=5000 cutoff
    private function fetchAnyQuotesForOpps(array $oppIds): Collection
    {
        if (empty($oppIds)) return collect();

        $all = cache()->remember('crm:pipeline_active_draft_quotes', 300, fn () =>
            $this->api->getAll('quotes', [
                '$select' => 'quoteid,totalamount,_opportunityid_value',
                '$filter' => 'statecode eq 0 or statecode eq 1',
            ])
        );

        $oppIdSet = array_flip($oppIds);

        return collect($all)
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
                "actualclosedate lt {$to->copy()->addDay()->startOfDay()->utc()->toIso8601String()}",
            ]),
            '$top'     => '5000',
        ], ttl: $this->ttlFor($to));

        return collect($data['value'] ?? []);
    }

    // Group won quotes by opportunity, giữ quote có giá trị cao nhất mỗi opp
    /**
     * Tính giá trị mỗi opp = max(genset won) + sum(d&i won).
     * Trả về Collection keyed by opp_id, mỗi phần tử là representative quote + resolved_value mới.
     */
    private function calcOppValue(Collection $wonQuotes): Collection
    {
        $labels   = $this->fetchPicklistLabels('quote', 'ab_request_type_code');
        $gensetSet = array_flip(self::GENSET_LABELS);

        $codeToGroup = [];
        foreach ($labels as $code => $label) {
            $codeToGroup[$code] = isset($gensetSet[$label]) ? 'genset' : 'di';
        }

        return $wonQuotes
            ->groupBy(fn ($q) => $q['_opportunityid_value'] ?: $q['quoteid'])
            ->map(function ($quotes) use ($codeToGroup) {
                $genset = $quotes->filter(
                    fn ($q) => ($codeToGroup[(string) ($q['ab_request_type_code'] ?? '')] ?? 'genset') === 'genset'
                );
                $di = $quotes->filter(
                    fn ($q) => ($codeToGroup[(string) ($q['ab_request_type_code'] ?? '')] ?? 'genset') === 'di'
                );

                $gensetValue = (float) ($genset->max('resolved_value') ?? 0);
                $diValue     = (float) $di->sum('resolved_value');

                $rep = $quotes->sortByDesc('closedon')->first();
                return array_merge($rep, ['resolved_value' => $gensetValue + $diValue]);
            });
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
            ->filter(function ($u) {
                $team = $u['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] ?? '';
                return $team !== ''
                    && !in_array($team, self::GENERIC_BUSINESS_UNITS)
                    && !str_starts_with(strtolower($u['fullname'] ?? ''), 'tester');
            })
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

    // BU cua to chuc/root, khong phai team thuc - loai khoi danh sach nhan vien de tranh nhieu
    private const GENERIC_BUSINESS_UNITS = ['huutoan', 'Công ty TNHH Hữu Toàn Group'];

    public function allUsers(): Collection
    {
        $data = $this->api->get('systemusers', $this->allUsersParams(), ttl: 3600);

        return collect($data['value'] ?? [])
            ->filter(fn ($u) =>
                str_ends_with(strtolower($u['internalemailaddress'] ?? ''), '@huutoan.com') &&
                !empty($u['businessunitid']['name']) &&
                !in_array($u['businessunitid']['name'], self::GENERIC_BUSINESS_UNITS) &&
                !str_starts_with(strtolower($u['fullname'] ?? ''), 'tester')
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
            $this->api->forget('systemusers', $this->fetchUsersParams());
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

        $cutoff30 = now()->subDays(30);

        $byRep = $opps
            ->groupBy('_ownerid_value')
            ->map(function (Collection $repOpps, string $ownerId) use ($quotesByOpp, $activeOppIds, $cutoff30) {
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

                        // Opp bị stale: có quote nhưng không có activity và không có quote nào được cập nhật trong 30 ngày
                        $quoteRecentlyUpdated = $quotes->contains(
                            fn ($q) => !empty($q['modifiedon']) && Carbon::parse($q['modifiedon'])->gte($cutoff30)
                        );
                        if (!isset($activeOppIds[$oppId]) && !$quoteRecentlyUpdated) {
                            $noActivity++;
                        }
                    }

                    $hasCloseDate  = !empty($opp['estimatedclosedate']);
                    $hasAmount     = (float) ($opp['estimatedvalue'] ?? 0) > 0;
                    $hasStage      = !empty($opp['ab_process_stage_code']);
                    $hasCustomer   = !empty($opp['_customerid_value']);
                    $hasPotential  = !empty($opp['ab_project_potential_code']);
                    if ($hasCloseDate && $hasAmount && $hasStage && $hasCustomer && $hasPotential) {
                        $completeCount++;
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

    /**
     * Danh sach tung Opp rieng le kem co quality flag — dung de sale/quan ly click vao
     * tung opp kiem tra va cap nhat truc tiep tren CRM (khac voi opportunityQuality() dang
     * gop theo salesperson).
     */
    public function opportunityQualityDetail(?string $territory = null, ?string $department = null): array
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

        $cutoff30 = now()->subDays(30);

        return $opps
            ->map(function ($opp) use ($quotesByOpp, $activeOppIds, $cutoff30) {
                $oppId  = $opp['opportunityid'];
                $quotes = $quotesByOpp->get($oppId, collect());

                $hasQuote    = $quotes->isNotEmpty();
                $daysToQuote = null;
                $noActivity  = false;

                if ($hasQuote) {
                    $oppCreated = Carbon::parse($opp['createdon']);
                    $firstQuote = $quotes->map(fn ($q) => Carbon::parse($q['createdon']))->sort()->first();
                    if ($firstQuote) {
                        $daysToQuote = max(0, (int) $oppCreated->diffInDays($firstQuote));
                    }

                    $quoteRecentlyUpdated = $quotes->contains(
                        fn ($q) => !empty($q['modifiedon']) && Carbon::parse($q['modifiedon'])->gte($cutoff30)
                    );
                    $noActivity = !isset($activeOppIds[$oppId]) && !$quoteRecentlyUpdated;
                }

                $hasCloseDate = !empty($opp['estimatedclosedate']);
                $hasAmount    = (float) ($opp['estimatedvalue'] ?? 0) > 0;
                $hasStage     = !empty($opp['ab_process_stage_code']);
                $hasCustomer  = !empty($opp['_customerid_value']);
                $hasPotential = !empty($opp['ab_project_potential_code']);
                $complete     = $hasCloseDate && $hasAmount && $hasStage && $hasCustomer && $hasPotential;

                $backdated = false;
                if ($hasCloseDate && !empty($opp['createdon'])) {
                    $created   = Carbon::parse($opp['createdon']);
                    $closeDate = Carbon::parse($opp['estimatedclosedate']);
                    $backdated = $closeDate->gte($created) && $created->diffInDays($closeDate) <= 7;
                }

                return [
                    'opportunity_id'  => $oppId,
                    'opp_number'      => $opp['ab_opportunitynumber'] ?? '',
                    'crm_link'        => config('crm.base_url') . '/main.aspx?etn=opportunity&id=' . $oppId . '&pagetype=entityrecord',
                    'name'            => $opp['name'] ?? '',
                    'owner_id'        => $opp['_ownerid_value'] ?? '',
                    'owner'           => $opp['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown',
                    'estimated_value' => (float) ($opp['estimatedvalue'] ?? 0),
                    'created_on'      => !empty($opp['createdon']) ? Carbon::parse($opp['createdon'])->toDateString() : null,
                    'estimated_close' => $hasCloseDate ? Carbon::parse($opp['estimatedclosedate'])->toDateString() : null,
                    'has_quote'       => $hasQuote,
                    'days_to_quote'   => $daysToQuote,
                    'complete'        => $complete,
                    'no_activity_30d' => $noActivity,
                    'backdated'       => $backdated,
                ];
            })
            ->sortByDesc('created_on')
            ->values()
            ->toArray();
    }

    private function fetchOpenOppsForQuality(): Collection
    {
        // Dung getAll() (follow @odata.nextLink) thay vi $top cung — CRM co the co > 500 open opp
        // va $top se cat mat du lieu ma khong bao loi (da gap bug nay o pipeline()).
        $data = cache()->remember('crm:quality_open_opportunities', 300, fn () =>
            $this->api->getAll('opportunities', [
                '$select'  => 'opportunityid,ab_opportunitynumber,name,estimatedvalue,ab_process_stage_code,estimatedclosedate,createdon,_ownerid_value,_owningbusinessunit_value,_customerid_value,ab_project_potential_code',
                '$filter'  => 'statecode eq 0',
                '$orderby' => 'createdon desc',
            ])
        );

        return collect($data);
    }

    private function fetchAllQuotesForOpps(): Collection
    {
        $data = $this->api->get('quotes', [
            '$select'  => 'quoteid,_opportunityid_value,createdon,modifiedon',
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

    public function oppActivity(Carbon $from, Carbon $to, ?string $territory = null, ?string $department = null): array
    {
        $fromStr = $from->copy()->startOfDay()->utc()->toIso8601String();
        $toStr   = $to->copy()->addDay()->startOfDay()->utc()->toIso8601String();

        $data = $this->api->get('opportunities', [
            '$select'  => 'opportunityid,createdon,estimatedvalue,_ownerid_value,_customerid_value',
            '$filter'  => "createdon ge {$fromStr} and createdon lt {$toStr}",
            '$orderby' => 'createdon desc',
            '$top'     => '2000',
        ], ttl: 600);

        $opps = $this->filterByTerritory(
            $this->filterByDepartment(collect($data['value'] ?? []), $department),
            $territory
        );

        return $opps
            ->groupBy('_ownerid_value')
            ->map(function (Collection $repOpps) {
                $name          = $repOpps->first()['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? 'Unknown';
                $lastCreated   = $repOpps->map(fn ($o) => $o['createdon'])->filter()->sort()->last();

                return [
                    'owner_id'           => $repOpps->first()['_ownerid_value'] ?? '',
                    'name'               => $name,
                    'new_opps'           => $repOpps->count(),
                    'new_pipeline_value' => $repOpps->sum(fn ($o) => (float) ($o['estimatedvalue'] ?? 0)),
                    'new_customers'      => $repOpps->pluck('_customerid_value')->filter()->unique()->count(),
                    'last_opp_created'   => $lastCreated,
                ];
            })
            ->sortByDesc('new_opps')
            ->values()
            ->toArray();
    }

    public function quoteRequestTypeCrosstab(int $year, ?string $territory = null, ?string $department = null): array
    {
        $from = Carbon::create($year, 1, 1)->startOfDay()->utc()->toIso8601String();
        $to   = Carbon::create($year, 12, 31)->addDay()->startOfDay()->utc()->toIso8601String();

        $data = $this->api->get('quotes', [
            '$select' => 'quoteid,ab_request_type_code,_ownerid_value,statecode',
            '$filter' => "createdon ge {$from} and createdon lt {$to}",
            '$top'    => '5000',
        ], ttl: 900);

        $quotes = $this->filterByTerritory(
            $this->filterByDepartment(collect($data['value'] ?? []), $department),
            $territory
        );

        $users = $this->fetchUsers();

        $matrix   = [];
        $deptSet  = [];
        $codeSet  = [];

        foreach ($quotes as $q) {
            $raw     = $q['ab_request_type_code'] ?? null;
            $code    = ($raw !== null && $raw !== '') ? (string) $raw : '(Chua nhap)';
            $ownerId = $q['_ownerid_value'] ?? null;
            $dept    = ($ownerId && $users->has($ownerId))
                ? ($users->get($ownerId)['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '(Chua phan bo)')
                : '(Chua phan bo)';

            $matrix[$code][$dept] = ($matrix[$code][$dept] ?? 0) + 1;
            $deptSet[$dept]       = true;
            $codeSet[$code]       = true;
        }

        $depts = array_keys($deptSet);
        sort($depts);

        $codeList = array_keys($codeSet);
        usort($codeList, fn ($a, $b) =>
            $a === '(Chua nhap)' ? 1 : ($b === '(Chua nhap)' ? -1 : strcmp($a, $b))
        );

        $colTotals  = array_fill_keys($depts, 0);
        $grandTotal = 0;
        $rows       = [];

        foreach ($codeList as $code) {
            $byDept   = [];
            $rowTotal = 0;
            foreach ($depts as $dept) {
                $count          = $matrix[$code][$dept] ?? 0;
                $byDept[$dept]  = $count;
                $colTotals[$dept] += $count;
                $rowTotal       += $count;
                $grandTotal     += $count;
            }
            $rows[] = ['code' => $code, 'by_dept' => $byDept, 'total' => $rowTotal];
        }

        $labels = $this->fetchPicklistLabels('quote', 'ab_request_type_code');

        return [
            'labels'        => $labels,
            'codes'         => $codeList,
            'departments'   => $depts,
            'rows'          => $rows,
            'column_totals' => $colTotals,
            'grand_total'   => $grandTotal,
        ];
    }

    private function fetchPicklistLabels(string $entity, string $attribute): array
    {
        try {
            $path   = "EntityDefinitions(LogicalName='{$entity}')/Attributes(LogicalName='{$attribute}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata";
            $data   = $this->api->getMetadata($path, ['$expand' => 'OptionSet']);
            $labels = [];
            foreach ($data['OptionSet']['Options'] ?? [] as $opt) {
                $value          = (string) $opt['Value'];
                $labels[$value] = $opt['Label']['UserLocalizedLabel']['Label']
                    ?? $opt['Label']['LocalizedLabels'][0]['Label']
                    ?? $value;
            }
            return $labels;
        } catch (\Throwable) {
            return [];
        }
    }

    // Lấy danh sách user, keyed theo systemuserid — dùng để map owner_id → territory/department/cost_center
    private function fetchUsersParams(): array
    {
        return [
            '$select' => 'fullname,systemuserid,title,_ab_dim_territory_id_value,_ab_dim_cost_center_id_value,_ab_dim_department_id_value,_businessunitid_value',
            '$filter' => 'azurestate eq 0 and deletedstate eq 0',
            '$top'    => '1000',
        ];
    }

    private function fetchUsers(): Collection
    {
        $data = $this->api->get('systemusers', $this->fetchUsersParams(), ttl: 3600);

        return collect($data['value'] ?? [])->keyBy('systemuserid');
    }
}
