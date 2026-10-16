<?php

namespace App\Services\Erp;

use Illuminate\Support\Facades\DB;

class ItemCatalogService
{
    public function search(string $query, int $limit = 20): array
    {
        $query = trim($query);
        if ($query === '') {
            return [];
        }

        return DB::table('erp_synced_items')
            ->select('item_number', 'search_name', 'inventory_unit_symbol')
            ->where(function ($q) use ($query) {
                $q->where('item_number', 'like', "%{$query}%")
                    ->orWhere('search_name', 'like', "%{$query}%");
            })
            ->orderByRaw('item_number = ? desc', [$query])
            ->orderBy('search_name')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'item_number' => $row->item_number,
                'name' => $row->search_name,
                'unit' => $row->inventory_unit_symbol,
            ])
            ->all();
    }
}
