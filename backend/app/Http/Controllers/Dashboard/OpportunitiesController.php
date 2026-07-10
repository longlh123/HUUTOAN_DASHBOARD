<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Crm\SalesPerformanceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OpportunitiesController extends Controller
{
    use ApiResponse;

    public function __construct(private SalesPerformanceService $sales) {}

    public function pipeline(Request $request): JsonResponse
    {
        return $this->success($this->sales->pipeline($request->query('territory'), $request->query('department')));
    }

    public function quality(Request $request): JsonResponse
    {
        try {
            return $this->success($this->sales->opportunityQuality($request->query('territory'), $request->query('department')));
        } catch (\Throwable $e) {
            return $this->error('QUALITY_ERROR', $e->getMessage(), 500);
        }
    }

    public function qualityDetail(Request $request): JsonResponse
    {
        try {
            return $this->success($this->sales->opportunityQualityDetail($request->query('territory'), $request->query('department')));
        } catch (\Throwable $e) {
            return $this->error('QUALITY_DETAIL_ERROR', $e->getMessage(), 500);
        }
    }

    public function activity(Request $request): JsonResponse
    {
        $from = Carbon::parse($request->query('from', now()->startOfYear()->toDateString()));
        $to   = Carbon::parse($request->query('to',   now()->toDateString()));
        return $this->success($this->sales->oppActivity($from, $to, $request->query('territory'), $request->query('department')));
    }
}
