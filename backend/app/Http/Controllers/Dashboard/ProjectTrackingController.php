<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Erp\ProjectTrackingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectTrackingController extends Controller
{
    use ApiResponse;

    public function __construct(private ProjectTrackingService $tracking) {}

    public function index(Request $request): JsonResponse
    {
        $department = $request->query('department', 'B2B');
        $status = $request->query('status', 'In Process');

        return $this->success($this->tracking->list($department, $status));
    }

    public function show(string $code): JsonResponse
    {
        return $this->success($this->tracking->timeline($code));
    }
}
