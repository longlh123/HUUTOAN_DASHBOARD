<?php

namespace App\Console\Commands;

use App\Services\Erp\ErpApiService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncErpItemCategories extends Command
{
    protected $signature = 'erp:sync-item-categories';

    protected $description = 'Dong bo quan he item <-> category (ProductCategoryAssignments) vao bang erp_item_categories — F&O khong co field "ngay sua doi" nen luon full-refresh, khong incremental';

    public function __construct(private ErpApiService $erp)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        ini_set('memory_limit', '512M');

        $this->info('Dang fetch ProductCategoryAssignments tu F&O...');

        $assignments = $this->erp->getAll('ProductCategoryAssignments', [
            '$select' => 'ProductNumber,ProductCategoryName,ProductCategoryHierarchyName',
        ]);

        $this->info(count($assignments).' dong quan he tu F&O. Dang upsert...');

        $now = now();
        $rows = [];
        foreach ($assignments as $a) {
            $itemNumber = $a['ProductNumber'] ?? null;
            $categoryName = $a['ProductCategoryName'] ?? null;
            $hierarchy = $a['ProductCategoryHierarchyName'] ?? null;

            if (! $itemNumber || ! $categoryName || ! $hierarchy) {
                continue;
            }

            $rows[] = [
                'item_number' => $itemNumber,
                'hierarchy' => $hierarchy,
                'category_name' => $categoryName,
                'updated_at' => $now,
                'created_at' => $now,
            ];
        }

        DB::table('erp_item_categories')->truncate();

        $total = 0;
        foreach (array_chunk($rows, 1000) as $chunk) {
            DB::table('erp_item_categories')->insertOrIgnore($chunk);
            $total += count($chunk);
        }

        $this->info("Xong — tổng {$total} quan he item-category đã sync.");

        return self::SUCCESS;
    }
}
