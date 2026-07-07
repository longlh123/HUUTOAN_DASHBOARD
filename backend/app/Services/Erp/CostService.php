<?php

namespace App\Services\Erp;

class CostService
{
    public function __construct(private ErpApiService $api) {}

    public function comparison(): array
    {
        [$standardVersionId, $plannedVersionId] = $this->resolveVersionIds();

        $standardPrices = $this->latestPriceByItem($standardVersionId);
        $plannedPrices  = $this->latestPriceByItem($plannedVersionId);

        $itemNumbers = array_unique(array_merge(array_keys($standardPrices), array_keys($plannedPrices)));
        $names       = $this->fetchProductNames($itemNumbers);
        $bomMap      = $this->activeBomMap();

        $items        = [];
        $onlyStandard = 0;
        $onlyPlanned  = 0;
        $exactMatch   = 0;

        foreach ($itemNumbers as $item) {
            $standard = $standardPrices[$item] ?? null;
            $planned  = $plannedPrices[$item] ?? null;

            if ($standard === null) { $onlyPlanned++; continue; }
            if ($planned === null)  { $onlyStandard++; continue; }

            $diff = $planned['price'] - $standard['price'];
            if (abs($diff) < 1) { $exactMatch++; continue; }

            $items[] = [
                'item_number'      => $item,
                'name'             => $names[$item] ?? $item,
                'standard_price'   => $standard['price'],
                'standard_date'    => $standard['date'] ? substr($standard['date'], 0, 10) : null,
                'planned_price'    => $planned['price'],
                'planned_date'     => $planned['date'] ? substr($planned['date'], 0, 10) : null,
                'diff'             => $diff,
                'diff_pct'         => $standard['price'] > 0 ? round($diff / $standard['price'] * 100, 1) : null,
                'has_bom'          => isset($bomMap[$item]),
            ];
        }

        usort($items, fn ($a, $b) => abs($b['diff']) <=> abs($a['diff']));

        return [
            'summary' => [
                'total_items'   => count($itemNumbers),
                'both_prices'   => count($items) + $exactMatch,
                'different'     => count($items),
                'exact_match'   => $exactMatch,
                'only_standard' => $onlyStandard,
                'only_planned'  => $onlyPlanned,
            ],
            'items' => $items,
        ];
    }

    /**
     * Breakdown linh kiện cấu thành BOM của 1 item — dùng để xem item con nào
     * kéo giá BOM cha lệch so với standard.
     */
    public function bomBreakdown(string $itemNumber): array
    {
        $bomMap = $this->activeBomMap();
        $bomId  = $bomMap[$itemNumber] ?? null;

        if (!$bomId) {
            return ['bom_id' => null, 'components' => []];
        }

        [$standardVersionId, $plannedVersionId] = $this->resolveVersionIds();
        $standardPrices = $this->latestPriceByItem($standardVersionId);
        $plannedPrices  = $this->latestPriceByItem($plannedVersionId);

        $components  = $this->bomComponents($bomId);
        $itemNumbers = array_merge([$itemNumber], array_column($components, 'item_number'));
        $names       = $this->fetchProductNames(array_unique($itemNumbers));

        $lines           = [];
        $rollupStandard  = 0.0;
        $rollupPlanned   = 0.0;

        foreach ($components as $c) {
            $std = $standardPrices[$c['item_number']]['price'] ?? null;
            $pln = $plannedPrices[$c['item_number']]['price'] ?? null;

            $stdTotal = $std !== null ? $std * $c['qty'] : null;
            $plnTotal = $pln !== null ? $pln * $c['qty'] : null;

            if ($stdTotal !== null) $rollupStandard += $stdTotal;
            if ($plnTotal !== null) $rollupPlanned  += $plnTotal;

            $lines[] = [
                'item_number'    => $c['item_number'],
                'name'           => $names[$c['item_number']] ?? $c['item_number'],
                'qty'            => $c['qty'],
                'unit'           => $c['unit'],
                'standard_price' => $std,
                'planned_price'  => $pln,
                'standard_total' => $stdTotal,
                'planned_total'  => $plnTotal,
                'diff'           => ($stdTotal !== null && $plnTotal !== null) ? $plnTotal - $stdTotal : null,
            ];
        }

        usort($lines, fn ($a, $b) => abs($b['diff'] ?? 0) <=> abs($a['diff'] ?? 0));

        return [
            'bom_id'          => $bomId,
            'item_number'     => $itemNumber,
            'item_name'       => $names[$itemNumber] ?? $itemNumber,
            'components'      => $lines,
            'rollup_standard' => $rollupStandard,
            'rollup_planned'  => $rollupPlanned,
        ];
    }

    // Version "Standard" xác định qua CostingType; version "Planned" xác định qua tên (VersionName)
    // vì không có field CostingType riêng cho "Planned" — F&O dùng chung CostingType "Normal" cho nhiều version khác.
    private function resolveVersionIds(): array
    {
        $versions = cache()->remember('erp:costing_versions', 3600, fn () =>
            $this->api->getAll('CostingVersions', [
                '$select' => 'VersionId,VersionName,CostingType',
            ])
        );

        $standard = collect($versions)->firstWhere('CostingType', 'Standard');
        $planned  = collect($versions)->first(fn ($v) => stripos($v['VersionName'] ?? '', 'planned') !== false);

        return [$standard['VersionId'] ?? null, $planned['VersionId'] ?? null];
    }

    /**
     * InventItemPricesV3 lưu lịch sử giá theo từng site + ngày hiệu lực (FromDate) — lấy giá mới nhất mỗi item,
     * bỏ qua khác biệt theo site (đơn giản hoá cho bản xem thử đầu tiên).
     *
     * @return array<string, array{price: float, date: ?string}>
     */
    private function latestPriceByItem(?string $versionId): array
    {
        if (!$versionId) return [];

        $records = cache()->remember("erp:invent_item_prices:{$versionId}", 3600, fn () =>
            $this->api->getAll('InventItemPricesV3', [
                '$select' => 'ItemNumber,FromDate,Price',
                '$filter' => "CostingVersionId eq '{$versionId}'",
            ])
        );

        $latest = [];
        foreach ($records as $r) {
            $item = $r['ItemNumber'] ?? null;
            if (!$item) continue;

            $fromDate = $r['FromDate'] ?? '';
            if (!isset($latest[$item]) || $fromDate > $latest[$item]['date']) {
                $latest[$item] = ['date' => $fromDate, 'price' => (float) ($r['Price'] ?? 0)];
            }
        }

        return $latest;
    }

    /**
     * Map item -> BOMId (BOM đang active). Một item có thể có nhiều BOM version active
     * (đổi công thức theo thời gian mà không tắt version cũ) — lấy version có FromDate mới nhất.
     *
     * @return array<string, string>
     */
    private function activeBomMap(): array
    {
        $versions = cache()->remember('erp:bom_versions', 3600, fn () =>
            $this->api->getAll('BOMVersionBiEntities', [
                '$select' => 'ItemId,BOMId,Active,FromDate',
            ])
        );

        $map = [];
        foreach ($versions as $v) {
            if (($v['Active'] ?? '') !== 'Yes') continue;

            $item     = $v['ItemId'] ?? null;
            $fromDate = $v['FromDate'] ?? '';
            if (!$item) continue;

            if (!isset($map[$item]) || $fromDate > $map[$item]['date']) {
                $map[$item] = ['bom_id' => $v['BOMId'], 'date' => $fromDate];
            }
        }

        return array_map(fn ($v) => $v['bom_id'], $map);
    }

    /**
     * Danh sách linh kiện của 1 BOM — lấy qua lịch sử production order (ProductionOrderBillOfMaterialLines)
     * vì F&O không expose bảng BOM-line master thuần qua OData. Dedupe theo LineNumber+ItemNumber vì cùng
     * 1 BOM sẽ sinh ra dòng giống hệt nhau ở mỗi production order.
     *
     * @return array<int, array{item_number: string, qty: float, unit: string}>
     */
    private function bomComponents(string $bomId): array
    {
        $records = cache()->remember("erp:bom_components:{$bomId}", 3600, fn () =>
            $this->api->getAll('ProductionOrderBillOfMaterialLines', [
                '$select' => 'LineNumber,ItemNumber,BOMLineQuantity,BOMLineUnitSymbol',
                '$filter' => "SourceBOMId eq '{$bomId}'",
            ])
        );

        $seen = [];
        foreach ($records as $r) {
            $key = ($r['LineNumber'] ?? '') . ':' . ($r['ItemNumber'] ?? '');
            if (isset($seen[$key])) continue;

            $seen[$key] = [
                'item_number' => $r['ItemNumber'] ?? '',
                'qty'         => (float) ($r['BOMLineQuantity'] ?? 0),
                'unit'        => $r['BOMLineUnitSymbol'] ?? '',
            ];
        }

        return array_values($seen);
    }

    private function fetchProductNames(array $itemNumbers): array
    {
        if (empty($itemNumbers)) return [];

        $all = cache()->remember('erp:released_products', 3600, fn () =>
            $this->api->getAll('ReleasedProductsV2', ['$select' => 'ItemNumber,SearchName'])
        );

        $itemSet = array_flip($itemNumbers);

        $names = [];
        foreach ($all as $p) {
            if (isset($itemSet[$p['ItemNumber']])) {
                $names[$p['ItemNumber']] = $p['SearchName'] ?? $p['ItemNumber'];
            }
        }

        return $names;
    }
}
