<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Erp\CostService;
use App\Services\Erp\FinanceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinanceController extends Controller
{
    use ApiResponse;

    public function __construct(private FinanceService $finance, private CostService $cost) {}

    public function summary(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);

        return $this->success($this->finance->summary($from, $to, $request->query('territory')));
    }

    public function byPeriod(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);
        $groupBy     = in_array($request->query('group_by'), ['day', 'week', 'month', 'quarter'])
            ? $request->query('group_by')
            : 'month';

        return $this->success($this->finance->byPeriod($from, $to, $groupBy, $request->query('territory')));
    }

    public function debtAging(): JsonResponse
    {
        return $this->success($this->finance->debtAging());
    }

    public function advanceLedger(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseDateRange($request);

        return $this->success($this->finance->advanceLedger($from, $to));
    }

    public function costComparison(): JsonResponse
    {
        return $this->success($this->cost->comparison());
    }

    public function costBomBreakdown(string $itemNumber): JsonResponse
    {
        return $this->success($this->cost->bomBreakdown($itemNumber));
    }

    private function parseDateRange(Request $request): array
    {
        $from = Carbon::parse($request->query('from', now()->startOfYear()->toDateString()));
        $to   = Carbon::parse($request->query('to',   now()->toDateString()));
        return [$from, $to];
    }
}
