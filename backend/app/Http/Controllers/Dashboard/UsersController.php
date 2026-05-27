<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Crm\SalesPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UsersController extends Controller
{
    use ApiResponse;

    public function __construct(private SalesPerformanceService $sales) {}

    public function index(): JsonResponse
    {
        return $this->success($this->sales->allUsers());
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $payload = $request->only(['department_id', 'territory_id', 'cost_center_id', 'is_disabled']);
        $this->sales->updateUser($id, $payload);
        return $this->success(['id' => $id]);
    }
}
