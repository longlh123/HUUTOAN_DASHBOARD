<?php

namespace App\Console\Commands;

use App\Services\Erp\ErpApiService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncErpProductVariants extends Command
{
    protected $signature = 'erp:sync-product-variants';

    protected $description = 'Dong bo bien the san pham (ReleasedProductVariantsV2) vao bang erp_product_variants — F&O khong co field "ngay sua doi" nen luon full-refresh, khong incremental';

    public function __construct(private ErpApiService $erp)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        ini_set('memory_limit', '512M');

        $this->info('Dang fetch ReleasedProductVariantsV2 tu F&O...');

        $variants = $this->erp->getAll('ReleasedProductVariantsV2', [
            '$select' => 'dataAreaId,ItemNumber,ProductVariantNumber,ProductConfigurationId,ProductSizeId,'
                .'ProductColorId,ProductStyleId,ProductVersionId,ProductSearchName,ProductLifecycleStateId',
        ]);

        $this->info(count($variants).' biến thể từ F&O. Đang upsert...');

        $updateColumns = [
            'item_number', 'product_configuration_id', 'product_size_id', 'product_color_id',
            'product_style_id', 'product_version_id', 'search_name', 'product_lifecycle_state_id',
            'data_area_id', 'last_synced_at', 'updated_at',
        ];

        $total = 0;
        foreach (array_chunk($variants, 500) as $chunk) {
            $now = now();
            $rows = array_map(fn ($v) => [
                'item_number' => $v['ItemNumber'],
                'product_variant_number' => $v['ProductVariantNumber'],
                'product_configuration_id' => $v['ProductConfigurationId'] ?: null,
                'product_size_id' => $v['ProductSizeId'] ?: null,
                'product_color_id' => $v['ProductColorId'] ?: null,
                'product_style_id' => $v['ProductStyleId'] ?: null,
                'product_version_id' => $v['ProductVersionId'] ?: null,
                'search_name' => $v['ProductSearchName'] ?: null,
                'product_lifecycle_state_id' => $v['ProductLifecycleStateId'] ?: null,
                'data_area_id' => $v['dataAreaId'] ?: null,
                'last_synced_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ], $chunk);

            DB::table('erp_product_variants')->upsert($rows, ['product_variant_number'], $updateColumns);
            $total += count($rows);
        }

        $this->info("Xong — tổng {$total} biến thể đã sync.");

        return self::SUCCESS;
    }
}
