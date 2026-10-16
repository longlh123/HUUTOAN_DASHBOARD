<?php

namespace App\Console\Commands;

use App\Services\Erp\ErpApiService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncErpItems extends Command
{
    protected $signature = 'erp:sync-items';

    protected $description = 'Dong bo toan bo item master (ReleasedProductsV2) vao bang erp_synced_items — F&O khong co field "ngay sua doi" nen luon full-refresh, khong incremental';

    public function __construct(private ErpApiService $erp)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        // 20k+ item, map + upsert theo chunk vuot qua memory_limit mac dinh cua CLI (128M)
        ini_set('memory_limit', '512M');

        $this->info('Dang fetch ReleasedProductsV2 tu F&O...');

        $items = $this->erp->getAll('ReleasedProductsV2', [
            '$select' => 'dataAreaId,ItemNumber,SearchName,ProductType,ProductSubType,ProductGroupId,'
                .'ItemModelGroupId,CostGroupId,ProjectCategoryId,InventoryUnitSymbol,PurchaseUnitSymbol,'
                .'SalesUnitSymbol,SalesPrice,SalesPriceDate,PurchasePrice,PurchasePriceDate,UnitCost,UnitCostDate,'
                .'SalesSalesTaxItemGroupCode,PurchaseSalesTaxItemGroupCode,BOMLevel,ProductLifecycleStateId',
        ]);

        $this->info(count($items).' item tu F&O. Dang upsert...');

        $updateColumns = [
            'search_name', 'product_type', 'product_sub_type', 'product_group_id', 'item_model_group_id',
            'cost_group_id', 'project_category_id', 'inventory_unit_symbol', 'purchase_unit_symbol',
            'sales_unit_symbol', 'sales_price', 'sales_price_date', 'purchase_price', 'purchase_price_date',
            'unit_cost', 'unit_cost_date', 'sales_tax_item_group_code', 'purchase_tax_item_group_code',
            'bom_level', 'product_lifecycle_state_id', 'data_area_id', 'last_synced_at', 'updated_at',
        ];

        $total = 0;
        foreach (array_chunk($items, 500) as $chunk) {
            $now = now();
            $rows = array_map(fn ($i) => [
                'item_number' => $i['ItemNumber'],
                'search_name' => $i['SearchName'] ?: null,
                'product_type' => $i['ProductType'] ?: null,
                'product_sub_type' => $i['ProductSubType'] ?: null,
                'product_group_id' => $i['ProductGroupId'] ?: null,
                'item_model_group_id' => $i['ItemModelGroupId'] ?: null,
                'cost_group_id' => $i['CostGroupId'] ?: null,
                'project_category_id' => $i['ProjectCategoryId'] ?: null,
                'inventory_unit_symbol' => $i['InventoryUnitSymbol'] ?: null,
                'purchase_unit_symbol' => $i['PurchaseUnitSymbol'] ?: null,
                'sales_unit_symbol' => $i['SalesUnitSymbol'] ?: null,
                'sales_price' => $i['SalesPrice'] ?? null,
                'sales_price_date' => $this->nullableFoDate($i['SalesPriceDate'] ?? null),
                'purchase_price' => $i['PurchasePrice'] ?? null,
                'purchase_price_date' => $this->nullableFoDate($i['PurchasePriceDate'] ?? null),
                'unit_cost' => $i['UnitCost'] ?? null,
                'unit_cost_date' => $this->nullableFoDate($i['UnitCostDate'] ?? null),
                'sales_tax_item_group_code' => $i['SalesSalesTaxItemGroupCode'] ?: null,
                'purchase_tax_item_group_code' => $i['PurchaseSalesTaxItemGroupCode'] ?: null,
                'bom_level' => $i['BOMLevel'] ?? null,
                'product_lifecycle_state_id' => $i['ProductLifecycleStateId'] ?: null,
                'data_area_id' => $i['dataAreaId'] ?: null,
                'last_synced_at' => $now,
                'updated_at' => $now,
                'created_at' => $now,
            ], $chunk);

            DB::table('erp_synced_items')->upsert($rows, ['item_number'], $updateColumns);
            $total += count($rows);
        }

        $this->info("Xong — tổng {$total} item đã sync.");

        return self::SUCCESS;
    }

    // F&O dung sentinel "1900-01-01" cho field ngay rong (xem CustTransactions.Closed cung convention nay)
    private function nullableFoDate(?string $value): ?string
    {
        if (! $value) {
            return null;
        }

        $date = Carbon::parse($value);

        return $date->year > 1900 ? $date->toDateString() : null;
    }
}
