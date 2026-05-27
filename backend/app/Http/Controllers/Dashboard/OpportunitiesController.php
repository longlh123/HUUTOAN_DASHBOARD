<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Crm\SalesPerformanceService;
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
}
