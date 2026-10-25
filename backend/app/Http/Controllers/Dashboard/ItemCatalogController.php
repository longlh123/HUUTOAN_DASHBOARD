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

    public function index(Request $request): JsonResponse
    {
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));

        $candidateOnly = $request->boolean('candidate_only');
        $category = $request->query('category');
        $productGroup = $request->query('product_group');
        $lifecycleState = $request->query('lifecycle_state');
        $excludeNeverSold = $request->boolean('exclude_never_sold');
        $finishedUnsoldOnly = $request->boolean('finished_unsold_only');
        $materialUnusedOnly = $request->boolean('material_unused_only');
        $result = $this->items->list(
            (string) $request->query('q', ''),
            $page,
            $perPage,
            $candidateOnly,
            $category ? (string) $category : null,
            $productGroup ? (string) $productGroup : null,
            $lifecycleState ? (string) $lifecycleState : null,
            $excludeNeverSold,
            $finishedUnsoldOnly,
            $materialUnusedOnly
        );

        return $this->success($result['data'], [
            'total' => $result['total'],
            'current_page' => $result['page'],
            'last_page' => (int) max(1, ceil($result['total'] / $perPage)),
        ]);
    }

    public function stats(): JsonResponse
    {
        return $this->success($this->items->stats());
    }

    public function categories(): JsonResponse
    {
        return $this->success($this->items->categories());
    }

    public function productGroups(): JsonResponse
    {
        return $this->success($this->items->productGroups());
    }

    public function lifecycleStates(): JsonResponse
    {
        return $this->success($this->items->lifecycleStates());
    }

    public function itemLevel1Options(): JsonResponse
    {
        return $this->success($this->items->itemLevel1Options());
    }

    public function itemLevel2Options(): JsonResponse
    {
        return $this->success($this->items->itemLevel2Options());
    }
}
