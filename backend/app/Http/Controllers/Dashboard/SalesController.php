<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Crm\SalesPerformanceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesController extends Controller
{
    use ApiResponse;

    public function __construct(private SalesPerformanceService $sales) {}

    public function users(): JsonResponse
    {
        return $this->success($this->sales->users());
    }

    public function kpiQuarterly(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);

        return $this->success($this->sales->kpiQuarterlyTotals(
            $year,
            $request->query('territory'),
            $request->query('department')
        ));
    }

    public function all(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);
        $territory   = $request->query('territory');
        $department  = $request->query('department');
        $groupBy     = in_array($request->query('group_by'), ['day', 'week', 'month', 'quarter'])
            ? $request->query('group_by')
            : 'month';

        return $this->success([
            'summary'   => $this->sales->summary($from, $to, $territory, $department),
            'by_period' => $this->sales->byPeriod($from, $to, $groupBy, $territory, $department),
            'by_rep'    => $this->sales->byRep($from, $to, $territory, $department),
            'by_team'   => $this->sales->byTeam($from, $to, $territory, $department),
            'kpi'       => $this->sales->kpiQuarterlyTotals($from->year, $territory, $department),
        ]);
    }

    // KPI tổng: total_value, total_deals, avg_deal_size
    public function summary(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);

        return $this->success($this->sales->summary($from, $to, $request->query('territory'), $request->query('department')));
    }

    public function byPeriod(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);
        $groupBy     = in_array($request->query('group_by'), ['day', 'week', 'month', 'quarter'])
            ? $request->query('group_by')
            : 'month';

        return $this->success($this->sales->byPeriod($from, $to, $groupBy, $request->query('territory'), $request->query('department')));
    }

    public function byRep(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);

        return $this->success($this->sales->byRep($from, $to, $request->query('territory'), $request->query('department')));
    }

    public function byTeam(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);

        return $this->success($this->sales->byTeam($from, $to, $request->query('territory'), $request->query('department')));
    }

    public function topAccounts(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);

        return $this->success($this->sales->topAccounts(
            $from, $to,
            $request->query('territory'),
            $request->query('department')
        ));
    }

    public function gapToTarget(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);
        return $this->success($this->sales->quarterlyGapChart(
            $year,
            $request->query('territory'),
            $request->query('department')
        ));
    }

    public function weekly(Request $request): JsonResponse
    {
        $weekOffset = max(-52, min(0, (int) $request->query('week_offset', 0)));

        return $this->success($this->sales->weeklyDeals(
            $weekOffset,
            $request->query('territory'),
            $request->query('department')
        ));
    }

    public function requestTypeCrosstab(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', now()->year);
        return $this->success($this->sales->quoteRequestTypeCrosstab(
            $year,
            $request->query('territory'),
            $request->query('department')
        ));
    }

    private function parseDateRange(Request $request): array
    {
        $from = Carbon::parse($request->query('from', now()->startOfYear()->toDateString()));
        $to   = Carbon::parse($request->query('to',   now()->toDateString()));

        return [$from, $to];
    }
}
