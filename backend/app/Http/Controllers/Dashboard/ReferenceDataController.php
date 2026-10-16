<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Crm\ReferenceDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReferenceDataController extends Controller
{
    use ApiResponse;

    public function __construct(private ReferenceDataService $referenceData) {}

    public function tables(): JsonResponse
    {
        return $this->success($this->referenceData->tables());
    }

    public function schema(string $table): JsonResponse
    {
        return $this->success($this->referenceData->schema($table));
    }

    public function index(Request $request, string $table): JsonResponse
    {
        return $this->success($this->referenceData->list(
            $table,
            $request->query('filter_field'),
            $request->query('filter_value'),
        ));
    }

    public function options(string $table): JsonResponse
    {
        return $this->success($this->referenceData->options($table));
    }

    public function store(Request $request, string $table): JsonResponse
    {
        $id = $this->referenceData->create($table, $request->all());

        return $this->success(['id' => $id], status: 201);
    }

    public function update(Request $request, string $table, string $id): JsonResponse
    {
        $this->referenceData->update($table, $id, $request->all());

        return $this->success(['id' => $id]);
    }
}
