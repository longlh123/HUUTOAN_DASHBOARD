<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Services\Erp\ItemCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ItemCatalogController extends Controller
{
    use ApiResponse;

    public function __construct(private ItemCatalogService $items) {}

    public function search(Request $request): JsonResponse
    {
        return $this->success($this->items->search((string) $request->query('q', '')));
    }
}
