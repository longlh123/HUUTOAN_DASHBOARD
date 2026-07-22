<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Crm\DeviceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    use ApiResponse;

    public function __construct(private DeviceService $devices) {}

    public function byProductLine(Request $request): JsonResponse
    {
        $from = Carbon::parse($request->query('from', now()->startOfYear()->toDateString()));
        $to   = Carbon::parse($request->query('to',   now()->toDateString()));

        return $this->success($this->devices->byProductLine($from, $to));
    }

    public function agreementOverview(): JsonResponse
    {
        return $this->success($this->devices->agreementOverview());
    }

    public function agreements(Request $request): JsonResponse
    {
        $type   = $request->query('type');
        $status = $request->query('status');

        return $this->success($this->devices->agreements($type, $status));
    }

    public function serviceCenters(): JsonResponse
    {
        return $this->success($this->devices->serviceCenters());
    }

    public function maintenanceSchedule(Request $request): JsonResponse
    {
        $currentQuarter = (int) ceil(now()->month / 3);
        $year    = (int) $request->query('year',    now()->year);
        $quarter = (int) $request->query('quarter', $currentQuarter);
        $quarter = max(1, min(4, $quarter));

        return $this->success($this->devices->maintenanceSchedule($year, $quarter));
    }

    public function workOrderParts(string $id): JsonResponse
    {
        return $this->success($this->devices->workOrderParts($id));
    }

    public function workOrdersPartsSummary(Request $request): JsonResponse
    {
        $from = Carbon::parse($request->query('from', now()->startOfWeek()->toDateString()));
        $to   = Carbon::parse($request->query('to',   now()->toDateString()));

        return $this->success($this->devices->workOrdersPartsSummary($from, $to));
    }
}
