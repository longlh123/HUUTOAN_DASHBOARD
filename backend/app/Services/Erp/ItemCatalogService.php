<?php

namespace App\Services\Erp;

use Illuminate\Support\Facades\DB;

class ItemCatalogService
{
    // Nguong "khong con hoat dong trong N nam" dung de goi y ung vien don kho.
    private const INACTIVE_YEARS = 3;

    // Thanh pham dung tag chinh thuc tu F&O (project_category_id). Vat tu va Ban thanh pham dung
    // chung 1 category (VPC-Direct RM) — phan biet qua chu so dau cua item_number (quy uoc danh
    // ma cua Huu Toan): bat dau "1" = vat tu/NVL, bat dau "2" = ban thanh pham tu san xuat noi bo.
    private const FINISHED_CATEGORY = 'FGS-Finished Goods';
    private const MATERIAL_CATEGORY = 'VPC-Direct RM';
    private const MATERIAL_PREFIX = '1';
    private const SEMI_FINISHED_PREFIX = '2';

    public function stats(): array
    {
        $cutoff = now()->subYears(self::INACTIVE_YEARS)->toDateString();

        $items = fn () => DB::table('erp_synced_items')
            ->leftJoin('item_lifecycle_signals', 'item_lifecycle_signals.item_number', '=', 'erp_synced_items.item_number')
            ->where('erp_synced_items.product_type', 'Item');

        $semiFinished = fn () => $items()
            ->where('erp_synced_items.project_category_id', self::MATERIAL_CATEGORY)
            ->where('erp_synced_items.item_number', 'like', self::SEMI_FINISHED_PREFIX.'%');
        $material = fn () => $items()
            ->where('erp_synced_items.project_category_id', self::MATERIAL_CATEGORY)
            ->where('erp_synced_items.item_number', 'like', self::MATERIAL_PREFIX.'%');

        // Bo qua thanh pham chua tung ban — moi tao/chua ra mat, chua co du lieu de xet block.
        $finished = fn () => $items()
            ->where('project_category_id', self::FINISHED_CATEGORY)
            ->where('has_ever_sold', true);

        $finishedTotal = $finished()->count();
        $finishedActive3y = $finished()
            ->where(function ($q) use ($cutoff) {
                $q->where('sale_count_3y', '>', 0)->orWhere('last_inventory_txn_date', '>=', $cutoff);
            })->count();

        $semiFinishedTotal = $semiFinished()->count();
        $semiFinishedActive3y = $semiFinished()
            ->where(function ($q) use ($cutoff) {
                $q->where('sale_count_3y', '>', 0)->orWhere('last_inventory_txn_date', '>=', $cutoff);
            })->count();

        // Ban thanh pham duoc tao nhung khong tung dung: chua tung ban VA khong co XNK trong N nam
        // (hoac chua tung co XNK) — tuc la hoan toan khong hoat dong, bat ke con ton hay khong.
        $semiFinishedDormantQuery = fn () => $semiFinished()
            ->where('has_ever_sold', false)
            ->where(function ($q) use ($cutoff) {
                $q->whereNull('last_inventory_txn_date_all_time')->orWhere('last_inventory_txn_date_all_time', '<', $cutoff);
            });
        $semiFinishedDormantCount = (clone $semiFinishedDormantQuery())->count();
        $semiFinishedDormantStock = (clone $semiFinishedDormantQuery())
            ->selectRaw('count(*) as cnt, sum(case when on_hand_qty > 0 then on_hand_qty * unit_cost else 0 end) as val, sum(case when on_hand_qty > 0 then 1 else 0 end) as stock_cnt')
            ->first();

        // Thanh pham dang con ton kho nhung khong ban duoc trong N nam.
        $finishedUnsoldQuery = fn () => $items()->where('project_category_id', self::FINISHED_CATEGORY)
            ->where('on_hand_qty', '>', 0)
            ->where(function ($q) use ($cutoff) {
                $q->whereNull('last_sale_date_all_time')->orWhere('last_sale_date_all_time', '<', $cutoff);
            });
        $finishedUnsold = (clone $finishedUnsoldQuery())
            ->selectRaw('count(*) as cnt, sum(on_hand_qty * unit_cost) as val')
            ->first();

        // Vat tu/NVL (item_number bat dau "1") dang con ton kho nhung khong XNK trong N nam.
        $materialUnusedQuery = fn () => $material()
            ->where('on_hand_qty', '>', 0)
            ->where(function ($q) use ($cutoff) {
                $q->whereNull('last_inventory_txn_date_all_time')->orWhere('last_inventory_txn_date_all_time', '<', $cutoff);
            });
        $materialUnused = (clone $materialUnusedQuery())
            ->selectRaw('count(*) as cnt, sum(on_hand_qty * unit_cost) as val')
            ->first();

        return [
            'cutoff_date' => $cutoff,
            'years' => self::INACTIVE_YEARS,
            'by_type' => [
                'finished' => ['total' => $finishedTotal, 'active_3y' => $finishedActive3y],
                'semi_finished' => ['total' => $semiFinishedTotal, 'active_3y' => $semiFinishedActive3y],
            ],
            'semi_finished_dormant' => [
                'count' => $semiFinishedDormantCount,
                'stock_count' => (int) ($semiFinishedDormantStock->stock_cnt ?? 0),
                'stock_value' => (float) ($semiFinishedDormantStock->val ?? 0),
            ],
            'finished_unsold_with_stock' => [
                'count' => (int) ($finishedUnsold->cnt ?? 0),
                'stock_value' => (float) ($finishedUnsold->val ?? 0),
            ],
            'material_unused_with_stock' => [
                'count' => (int) ($materialUnused->cnt ?? 0),
                'stock_value' => (float) ($materialUnused->val ?? 0),
            ],
        ];
    }

    public function categories(): array
    {
        return DB::table('erp_synced_items')
            ->select('project_category_id')
            ->whereNotNull('project_category_id')
            ->distinct()
            ->orderBy('project_category_id')
            ->pluck('project_category_id')
            ->all();
    }

    public function itemLevel1Options(): array
    {
        return DB::table('erp_item_level1_options')
            ->select('code', 'label')
            ->orderBy('label')
            ->get()
            ->map(fn ($row) => ['code' => $row->code, 'label' => $row->label])
            ->all();
    }

    public function itemLevel2Options(): array
    {
        return DB::table('erp_item_level2_options')
            ->select('code', 'label')
            ->orderBy('label')
            ->get()
            ->map(fn ($row) => ['code' => $row->code, 'label' => $row->label])
            ->all();
    }

    public function productGroups(): array
    {
        return DB::table('erp_product_groups')
            ->select('group_id', 'group_name')
            ->orderBy('group_id')
            ->get()
            ->map(fn ($row) => ['id' => $row->group_id, 'name' => $row->group_name])
            ->all();
    }

    public function lifecycleStates(): array
    {
        return DB::table('erp_synced_items')
            ->select('product_lifecycle_state_id')
            ->whereNotNull('product_lifecycle_state_id')
            ->distinct()
            ->orderBy('product_lifecycle_state_id')
            ->pluck('product_lifecycle_state_id')
            ->all();
    }

    public function list(string $query, int $page = 1, int $perPage = 20, bool $candidateOnly = false, ?string $category = null, ?string $productGroup = null, ?string $lifecycleState = null, bool $excludeNeverSold = false, bool $finishedUnsoldOnly = false, bool $materialUnusedOnly = false): array
    {
        $cutoff = now()->subYears(self::INACTIVE_YEARS)->toDateString();

        $variantCounts = DB::table('erp_product_variants')
            ->select('item_number', DB::raw('count(*) as variant_count'))
            ->groupBy('item_number');

        $procurementCategories = DB::table('erp_item_categories')
            ->select('item_number', DB::raw("group_concat(category_name separator '/') as procurement_category"))
            ->where('hierarchy', 'HTG Procurement Categories')
            ->groupBy('item_number');

        $salesCategories = DB::table('erp_item_categories')
            ->select('item_number', DB::raw("group_concat(category_name separator '/') as sales_category"))
            ->where('hierarchy', 'HTG Sales Categories')
            ->groupBy('item_number');

        $builder = DB::table('erp_synced_items')
            ->leftJoin('item_lifecycle_signals', 'item_lifecycle_signals.item_number', '=', 'erp_synced_items.item_number')
            ->leftJoin('erp_product_groups', 'erp_product_groups.group_id', '=', 'erp_synced_items.product_group_id')
            ->leftJoinSub($variantCounts, 'variant_counts', 'variant_counts.item_number', '=', 'erp_synced_items.item_number')
            ->leftJoinSub($procurementCategories, 'procurement_categories', 'procurement_categories.item_number', '=', 'erp_synced_items.item_number')
            ->leftJoinSub($salesCategories, 'sales_categories', 'sales_categories.item_number', '=', 'erp_synced_items.item_number')
            ->select(
                'erp_synced_items.item_number',
                'search_name',
                'product_type',
                'inventory_unit_symbol',
                'sales_price',
                'unit_cost',
                'product_lifecycle_state_id',
                'project_category_id',
                'erp_synced_items.product_group_id',
                'erp_product_groups.group_name as product_group_name',
                'last_sale_date',
                'sale_count_3y',
                'has_ever_sold',
                'sale_count_all_time',
                'last_sale_date_all_time',
                'last_inventory_txn_date',
                'last_inventory_txn_date_all_time',
                'on_hand_qty',
                'variant_counts.variant_count',
                'procurement_categories.procurement_category',
                'sales_categories.sales_category',
                'item_lifecycle_signals.last_synced_at as signals_synced_at'
            );

        $query = trim($query);
        if ($query !== '') {
            $builder->where(function ($q) use ($query) {
                $q->where('erp_synced_items.item_number', 'like', "%{$query}%")
                    ->orWhere('search_name', 'like', "%{$query}%");
            });
        }

        if ($category !== null && $category !== '') {
            $builder->where('project_category_id', $category);
        }

        if ($productGroup !== null && $productGroup !== '') {
            $builder->where('erp_synced_items.product_group_id', $productGroup);
        }

        if ($lifecycleState === '__none__') {
            $builder->whereNull('product_lifecycle_state_id');
        } elseif ($lifecycleState !== null && $lifecycleState !== '') {
            $builder->where('product_lifecycle_state_id', $lifecycleState);
        }

        if ($excludeNeverSold) {
            $builder->where('has_ever_sold', true);
        }

        if ($finishedUnsoldOnly) {
            // Khop dung logic cua the "Thanh pham ton kho, khong ban N nam" trong stats().
            $builder->where('project_category_id', self::FINISHED_CATEGORY)
                ->where('on_hand_qty', '>', 0)
                ->where(function ($q) use ($cutoff) {
                    $q->whereNull('last_sale_date_all_time')->orWhere('last_sale_date_all_time', '<', $cutoff);
                });
        }

        if ($materialUnusedOnly) {
            // Khop dung logic cua the "Vat tu ton kho, khong xuat dung N nam" trong stats().
            $builder->where('project_category_id', self::MATERIAL_CATEGORY)
                ->where('erp_synced_items.item_number', 'like', self::MATERIAL_PREFIX.'%')
                ->where('on_hand_qty', '>', 0)
                ->where(function ($q) use ($cutoff) {
                    $q->whereNull('last_inventory_txn_date_all_time')->orWhere('last_inventory_txn_date_all_time', '<', $cutoff);
                });
        }

        if ($candidateOnly) {
            // Phai da tung ban that su (has_ever_sold) moi tinh la ung vien dong — item chua
            // tung ban lan nao (moi tao BOM, chua ra mat) khong phai "ngung ban", khong nen gop chung.
            $builder->where('has_ever_sold', true)
                ->where(function ($q) {
                    $q->whereNull('on_hand_qty')->orWhere('on_hand_qty', '<=', 0);
                })
                ->where(function ($q) use ($cutoff) {
                    $q->whereNull('last_sale_date')->orWhere('last_sale_date', '<', $cutoff);
                })
                ->where(function ($q) use ($cutoff) {
                    $q->whereNull('last_inventory_txn_date')->orWhere('last_inventory_txn_date', '<', $cutoff);
                });
        }

        $total = (clone $builder)->count();

        $rows = $builder
            ->orderBy('erp_synced_items.item_number')
            ->forPage($page, $perPage)
            ->get()
            ->map(fn ($row) => [
                'item_number' => $row->item_number,
                'name' => $row->search_name,
                'type' => $row->product_type,
                'unit' => $row->inventory_unit_symbol,
                'sales_price' => (float) $row->sales_price,
                'unit_cost' => (float) $row->unit_cost,
                'lifecycle_state' => $row->product_lifecycle_state_id,
                'category' => $row->project_category_id,
                'product_group_id' => $row->product_group_id,
                'product_group_name' => $row->product_group_name,
                'procurement_category' => $row->procurement_category,
                'sales_category' => $row->sales_category,
                'last_sale_date' => $row->last_sale_date,
                'sale_count_3y' => (int) $row->sale_count_3y,
                'has_ever_sold' => (bool) $row->has_ever_sold,
                'sale_count_all_time' => (int) $row->sale_count_all_time,
                'last_sale_date_all_time' => $row->last_sale_date_all_time,
                'last_inventory_txn_date' => $row->last_inventory_txn_date,
                'last_inventory_txn_date_all_time' => $row->last_inventory_txn_date_all_time,
                'on_hand_qty' => (float) $row->on_hand_qty,
                'variant_count' => (int) $row->variant_count,
                'candidate_to_close' => ! empty($row->has_ever_sold)
                    && (empty($row->on_hand_qty) || $row->on_hand_qty <= 0)
                    && (empty($row->last_sale_date) || $row->last_sale_date < $cutoff)
                    && (empty($row->last_inventory_txn_date) || $row->last_inventory_txn_date < $cutoff),
                'signals_synced_at' => $row->signals_synced_at,
            ])
            ->all();

        return [
            'data' => $rows,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
        ];
    }

    public function search(string $query, int $limit = 20): array
    {
        $query = trim($query);
        if ($query === '') {
            return [];
        }

        return DB::table('erp_synced_items')
            ->select(
                'erp_synced_items.item_number',
                'search_name',
                'inventory_unit_symbol',
                'erp_installation_items.item_level_1',
                'erp_installation_items.item_level_2'
            )
            // Dung cho combobox "Vat tu lap dat" (MaterialEntryPage) — chi cho chon vat tu nam trong
            // danh sach cho phep (erp_installation_items), khong phai toan bo catalog F&O. Join (thay
            // vi whereIn) de lay luon item_level_1/2 da ghi nhan san cho item nay, lam mac dinh tren form.
            ->join('erp_installation_items', 'erp_installation_items.item_number', '=', 'erp_synced_items.item_number')
            ->where(function ($q) use ($query) {
                $q->where('erp_synced_items.item_number', 'like', "%{$query}%")
                    ->orWhere('search_name', 'like', "%{$query}%");
            })
            ->orderByRaw('erp_synced_items.item_number = ? desc', [$query])
            ->orderBy('search_name')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'item_number' => $row->item_number,
                'name' => $row->search_name,
                'unit' => $row->inventory_unit_symbol,
                'level1' => $row->item_level_1,
                'level2' => $row->item_level_2,
            ])
            ->all();
    }
}
