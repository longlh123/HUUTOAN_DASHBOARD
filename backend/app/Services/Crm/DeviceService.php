<?php

namespace App\Services\Crm;

use App\Services\Erp\ErpApiService;
use Carbon\Carbon;

class DeviceService
{
    private const STATUS_ACTIVE  = 500000003;
    private const STATUS_EXPIRED = 500000002;
    private const STATUS_DRAFT   = 1;
    private const STATUS_LOST    = 500000004;

    private const TYPE_MAP = [
        'PM'     => 500000000,
        'WEL'    => 500000001,
        'Rental' => 500000002,
    ];

    private const STATUS_MAP = [
        'Active'  => self::STATUS_ACTIVE,
        'Expired' => self::STATUS_EXPIRED,
        'Draft'   => self::STATUS_DRAFT,
        'Lost'    => self::STATUS_LOST,
    ];

    public function __construct(private CrmApiService $api, private ErpApiService $erp) {}

    public function byProductLine(Carbon $from, Carbon $to): array
    {
        $fromStr = $from->copy()->startOfDay()->utc()->toIso8601String();
        $toStr   = $to->copy()->endOfDay()->utc()->toIso8601String();

        $data    = $this->api->get('ab_devices', [
            '$select' => 'ab_product_line_code',
            '$filter' => "createdon ge {$fromStr} and createdon lt {$toStr}",
            '$top'    => '5000',
        ], ttl: 600);

        $records = $data['value'] ?? [];
        $counts  = [];
        $total   = count($records);

        foreach ($records as $r) {
            $line = $r['ab_product_line_code@OData.Community.Display.V1.FormattedValue'] ?? null;
            if (!$line) $line = 'Khác';
            $counts[$line] = ($counts[$line] ?? 0) + 1;
        }

        arsort($counts);

        $items = [];
        foreach ($counts as $name => $count) {
            $items[] = [
                'name'  => $name,
                'count' => $count,
                'pct'   => $total > 0 ? round($count / $total * 100, 1) : 0.0,
            ];
        }

        return ['total' => $total, 'items' => $items];
    }

    /**
     * Trả về KPI + phân bổ theo loại + cảnh báo — tất cả từ 1 lần fetch.
     */
    public function agreementOverview(): array
    {
        $data = $this->api->get('ab_agreement_devices', [
            '$select' => implode(',', [
                'statuscode', 'ab_agreement_type_code',
                'ab_total_amount_calculated', 'ab_actual_maintenance_times_rollup',
                'ab_maintenance_times', 'ab_remaining_times_calculated',
                'ab_name', 'createdon',
                '_ab_device_id_value', '_ab_customer_id_value',
                '_ownerid_value', '_owningbusinessunit_value',
            ]),
            '$top' => '5000',
        ], ttl: 300);

        $records = $data['value'] ?? [];

        $activeCount     = 0;
        $neverMaintained = 0;
        $expiredCount    = 0;
        $totalValue      = 0.0;
        $byType          = [];
        $alertsNever     = [];
        $alertsDraft     = [];

        foreach ($records as $r) {
            $sc     = (int) ($r['statuscode'] ?? 0);
            $type   = $r['ab_agreement_type_code@OData.Community.Display.V1.FormattedValue'] ?? 'Khác';
            $val    = (float) ($r['ab_total_amount_calculated'] ?? 0);
            $actual = (int) ($r['ab_actual_maintenance_times_rollup'] ?? 0);
            $total  = (int) ($r['ab_maintenance_times'] ?? 0);

            $slabel = match ($sc) {
                self::STATUS_ACTIVE  => 'Active',
                self::STATUS_EXPIRED => 'Expired',
                self::STATUS_DRAFT   => 'Draft',
                self::STATUS_LOST    => 'Lost',
                default              => 'Other',
            };

            if (in_array($type, ['PM', 'WEL', 'Rental'])) {
                $byType[$type][$slabel] = ($byType[$type][$slabel] ?? 0) + 1;
            }

            if ($sc === self::STATUS_ACTIVE) {
                $activeCount++;
                $totalValue += $val;
                if ($actual === 0) {
                    $neverMaintained++;
                    $alertsNever[] = $this->mapAlertRecord($r);
                }
            }

            if ($sc === self::STATUS_EXPIRED) {
                $expiredCount++;
            }

            if ($sc === self::STATUS_DRAFT) {
                $alertsDraft[] = $this->mapAlertRecord($r);
            }
        }

        $chartData = [];
        foreach (['PM', 'WEL', 'Rental'] as $t) {
            $chartData[] = [
                'type'    => $t,
                'Active'  => $byType[$t]['Active']  ?? 0,
                'Expired' => $byType[$t]['Expired'] ?? 0,
                'Draft'   => $byType[$t]['Draft']   ?? 0,
                'Lost'    => $byType[$t]['Lost']    ?? 0,
            ];
        }

        return [
            'kpis' => [
                'active_count'     => $activeCount,
                'never_maintained' => $neverMaintained,
                'expiring_soon'    => $this->countExpiringSoon(),
                'expired_count'    => $expiredCount,
                'total_value'      => $totalValue,
            ],
            'by_type' => $chartData,
            'alerts'  => [
                'never_maintained' => $alertsNever,
                'drafts'           => $alertsDraft,
            ],
        ];
    }

    public function agreements(?string $type, ?string $status): array
    {
        $filters = [];

        if ($type && isset(self::TYPE_MAP[$type])) {
            $filters[] = 'ab_agreement_type_code eq ' . self::TYPE_MAP[$type];
        }
        if ($status && isset(self::STATUS_MAP[$status])) {
            $filters[] = 'statuscode eq ' . self::STATUS_MAP[$status];
        }

        $params = [
            '$select'  => implode(',', [
                'ab_name', 'ab_agreement_type_code', 'statuscode',
                'ab_maintenance_times', 'ab_actual_maintenance_times_rollup',
                'ab_remaining_times_calculated', 'ab_total_amount_calculated',
                '_ab_device_id_value', '_ab_customer_id_value',
                '_ownerid_value', '_owningbusinessunit_value', 'createdon',
            ]),
            '$top'     => '5000',
            '$orderby' => 'createdon desc',
        ];

        if (!empty($filters)) {
            $params['$filter'] = implode(' and ', $filters);
        }

        $data = $this->api->get('ab_agreement_devices', $params, ttl: 300);

        return array_map(function ($r) {
            $total  = (int) ($r['ab_maintenance_times'] ?? 0);
            $actual = (int) ($r['ab_actual_maintenance_times_rollup'] ?? 0);

            return [
                'id'           => $r['ab_agreement_deviceid'],
                'code'         => $r['ab_name'],
                'type'         => $r['ab_agreement_type_code@OData.Community.Display.V1.FormattedValue'] ?? '',
                'status'       => $r['statuscode@OData.Community.Display.V1.FormattedValue'] ?? '',
                'device'       => $r['_ab_device_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'customer'     => $r['_ab_customer_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'owner'        => $r['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'team'         => $r['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'total_times'  => $total,
                'actual_times' => $actual,
                'remaining'    => (int) ($r['ab_remaining_times_calculated'] ?? 0),
                'progress_pct' => $total > 0 ? (int) round($actual / $total * 100) : 0,
                'value'        => (float) ($r['ab_total_amount_calculated'] ?? 0),
                'created_at'   => $r['createdon'] ?? '',
            ];
        }, $data['value'] ?? []);
    }

    public function maintenanceSchedule(int $year, int $quarter): array
    {
        $fromMonth = ($quarter - 1) * 3 + 1;
        $from = Carbon::create($year, $fromMonth, 1)->startOfDay()->utc()->toIso8601String();
        $to   = Carbon::create($year, $fromMonth, 1)->addMonths(3)->startOfDay()->utc()->toIso8601String();

        // Hien tat ca loai WO (PM/Repair/Inspection/Rental/...) — khong loc ab_wo_type_code
        // nua de Lich KTV phan anh dung toan bo lich lam viec cua KTV, khong chi rieng PM.
        // Dung getAll() (follow @odata.nextLink) thay vi $top cung — 1 quy co the co > 5000 WO.
        $cacheKey = "crm:maintenance_schedule:{$year}:{$quarter}";
        $records  = cache()->remember($cacheKey, 300, fn () =>
            $this->api->getAll('ab_work_orders', [
                '$select'  => implode(',', [
                    'ab_work_orderid', 'ab_name',
                    'ab_wo_type_code', 'ab_wo_status_code',
                    'ab_planned_start_date',
                    '_ab_service_customer_id_value',
                    '_ab_lead_engineer_id_value', 'ab_technician',
                    '_ab_state_id_value', '_ab_city_id_value',
                    'ab_address_fx',
                    '_ab_agreement_device_id_value',
                    '_ab_organizational_unit_id_value',
                ]),
                '$filter'  => implode(' and ', [
                    'ab_wo_status_code ne 500000005',
                    "ab_planned_start_date ge {$from}",
                    "ab_planned_start_date lt {$to}",
                ]),
                '$orderby' => 'ab_planned_start_date asc',
            ])
        );
        $unscheduled = 0;
        $scheduled   = 0;
        $inProgress  = 0;
        $completed   = 0;
        $items       = [];

        foreach ($records as $r) {
            $sc = (int) ($r['ab_wo_status_code'] ?? 0);

            match ($sc) {
                500000000 => $unscheduled++,
                500000001, 500000006 => $scheduled++,
                500000002 => $inProgress++,
                500000003 => $completed++,
                default   => null,
            };

            $engineer = $r['_ab_lead_engineer_id_value@OData.Community.Display.V1.FormattedValue']
                     ?? $r['ab_technician']
                     ?? '';

            $items[] = [
                'id'            => $r['ab_work_orderid'],
                'code'          => $r['ab_name'],
                'type'          => $r['ab_wo_type_code@OData.Community.Display.V1.FormattedValue'] ?? '',
                'status_code'   => $sc,
                'status'        => $r['ab_wo_status_code@OData.Community.Display.V1.FormattedValue'] ?? '',
                'customer'      => $r['_ab_service_customer_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'region'        => $r['_ab_state_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'city'          => $r['_ab_city_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'address'       => $r['ab_address_fx'] ?? '',
                'service_unit'  => $r['_ab_organizational_unit_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'planned_date'  => $r['ab_planned_start_date'] ?? '',
                'engineer'      => $engineer,
                'has_agreement' => !empty($r['_ab_agreement_device_id_value']),
            ];
        }

        return [
            'kpis'  => [
                'total'       => count($records),
                'unscheduled' => $unscheduled,
                'scheduled'   => $scheduled,
                'in_progress' => $inProgress,
                'completed'   => $completed,
            ],
            'items' => $items,
        ];
    }

    /**
     * Danh sach vat tu can cho 1 Work Order + doi chieu ton kho F&O — dung khi click 1 WO
     * trong Lich KTV de xem can chuan bi/nhap them gi truoc khi thuc hien.
     *
     * Nguon: ab_work_order_products (CRM) — chi lay dong co Estimate Quantity >= 1.
     * Vat tu "Existing" (khong phai Write In) tra cuu ton kho qua product.productnumber
     * (dang "1001" + Item Number F&O, vd 1001108402514 -> item 108402514) roi SUM
     * OnHandQuantity tren ABInventWarehousesOnHandV2 (F&O) qua tat ca kho.
     */
    public function workOrderParts(string $workOrderId): array
    {
        $data = $this->api->get('ab_work_order_products', [
            '$select' => 'ab_product_name_fx,ab_quantity,ab_select_product_flag',
            '$filter' => "_ab_work_order_id_value eq {$workOrderId} and ab_quantity ge 1",
            '$expand' => 'ab_product_id($select=productnumber,name)',
        ], ttl: 60);

        $rows        = array_map(fn ($r) => $this->parseWorkOrderProductRow($r), $data['value'] ?? []);
        $itemNumbers = array_values(array_unique(array_filter(array_column($rows, 'item_number'))));
        $stockByItem = $this->fetchStockByItems($itemNumbers);

        [$all, $shortage] = $this->buildPartsLists($rows, $stockByItem);

        return ['all' => $all, 'shortage' => $shortage];
    }

    /**
     * Bang tong hop vat tu can + thieu hang cho TAT CA Work Order trong 1 khoang ngay —
     * dung cho bang "liet ke tat ca WO" duoi Lich KTV, tranh phai click tung WO de xem.
     *
     * Batch 3 buoc de tranh N+1: (1) lay danh sach WO trong khoang ngay, (2) lay tat ca
     * ab_work_order_products cho toan bo WO do (chunk 15 id/request), (3) lay ton kho F&O
     * cho toan bo item number xuat hien (1 lan, khong phai tung item).
     */
    public function workOrdersPartsSummary(Carbon $from, Carbon $to): array
    {
        $fromStr = $from->copy()->startOfDay()->utc()->toIso8601String();
        $toStr   = $to->copy()->addDay()->startOfDay()->utc()->toIso8601String();

        $wos = $this->api->getAll('ab_work_orders', [
            '$select'  => implode(',', [
                'ab_work_orderid', 'ab_name', 'ab_wo_type_code',
                'ab_planned_start_date', '_ab_lead_engineer_id_value', 'ab_technician',
            ]),
            '$filter'  => implode(' and ', [
                'ab_wo_status_code ne 500000005',
                "ab_planned_start_date ge {$fromStr}",
                "ab_planned_start_date lt {$toStr}",
            ]),
            '$orderby' => 'ab_planned_start_date asc',
        ]);

        if (empty($wos)) return [];

        $woIds        = array_column($wos, 'ab_work_orderid');
        $productsByWo = $this->fetchWorkOrderProductsBulk($woIds);

        $itemNumbers = [];
        foreach ($productsByWo as $rows) {
            foreach ($rows as $r) {
                if ($r['item_number']) $itemNumbers[] = $r['item_number'];
            }
        }
        $stockByItem = $this->fetchStockByItems(array_values(array_unique($itemNumbers)));

        return collect($wos)
            ->map(function ($wo) use ($productsByWo, $stockByItem) {
                $rows = $productsByWo[$wo['ab_work_orderid']] ?? [];
                [$all, $shortage] = $this->buildPartsLists($rows, $stockByItem);

                return [
                    'id'           => $wo['ab_work_orderid'],
                    'code'         => $wo['ab_name'],
                    'type'         => $wo['ab_wo_type_code@OData.Community.Display.V1.FormattedValue'] ?? '',
                    'engineer'     => $wo['_ab_lead_engineer_id_value@OData.Community.Display.V1.FormattedValue']
                                   ?? $wo['ab_technician']
                                   ?? '',
                    'planned_date' => $wo['ab_planned_start_date'] ?? '',
                    'all'          => $all,
                    'shortage'     => $shortage,
                ];
            })
            ->filter(fn ($item) => count($item['all']) > 0)
            ->values()
            ->toArray();
    }

    private function fetchWorkOrderProductsBulk(array $workOrderIds): array
    {
        $byWo = [];

        foreach (array_chunk($workOrderIds, 15) as $chunk) {
            $idFilter = implode(' or ', array_map(fn ($id) => "_ab_work_order_id_value eq {$id}", $chunk));
            $data = $this->api->get('ab_work_order_products', [
                '$select' => 'ab_product_name_fx,ab_quantity,ab_select_product_flag,_ab_work_order_id_value',
                '$filter' => "({$idFilter}) and ab_quantity ge 1",
                '$expand' => 'ab_product_id($select=productnumber,name)',
            ], ttl: 60);

            foreach ($data['value'] ?? [] as $r) {
                $woId = $r['_ab_work_order_id_value'] ?? '';
                $byWo[$woId][] = $this->parseWorkOrderProductRow($r);
            }
        }

        return $byWo;
    }

    private function parseWorkOrderProductRow(array $r): array
    {
        $isWriteIn     = (bool) ($r['ab_select_product_flag'] ?? false);
        $productNumber = $r['ab_product_id']['productnumber'] ?? null;
        $itemNumber    = null;

        if (!$isWriteIn && $productNumber && str_starts_with($productNumber, '1001')) {
            $candidate = substr($productNumber, 4);
            if ($candidate !== '' && ctype_digit($candidate)) {
                $itemNumber = $candidate;
            }
        }

        return [
            'name'        => trim($r['ab_product_name_fx'] ?? ''),
            'qty_needed'  => (float) ($r['ab_quantity'] ?? 0),
            'is_write_in' => $isWriteIn,
            'item_number' => $itemNumber,
        ];
    }

    /** @return array{0: array, 1: array} [all, shortage] */
    private function buildPartsLists(array $rows, array $stockByItem): array
    {
        $all = collect($rows)->map(function ($p) use ($stockByItem) {
            $stock    = $p['item_number'] !== null ? ($stockByItem[$p['item_number']] ?? 0.0) : null;
            $shortage = $stock !== null ? max(0.0, $p['qty_needed'] - $stock) : null;

            return [
                'item_number' => $p['item_number'],
                'name'        => $p['name'],
                'qty_needed'  => $p['qty_needed'],
                'stock_qty'   => $stock,
                'shortage'    => $shortage,
                'is_write_in' => $p['is_write_in'],
                'sufficient'  => $shortage !== null ? $shortage <= 0 : null,
            ];
        })->values();

        $shortage = $all->filter(fn ($p) => $p['sufficient'] === false)->values();

        return [$all->toArray(), $shortage->toArray()];
    }

    private function fetchStockByItems(array $itemNumbers): array
    {
        if (empty($itemNumbers)) return [];

        $filter = implode(' or ', array_map(fn ($n) => "ItemNumber eq '{$n}'", $itemNumbers));
        $data   = $this->erp->get('ABInventWarehousesOnHandV2', [
            '$select' => 'ItemNumber,OnHandQuantity',
            '$filter' => $filter,
        ], ttl: 300);

        $byItem = [];
        foreach ($data['value'] ?? [] as $row) {
            $item = $row['ItemNumber'] ?? '';
            $byItem[$item] = ($byItem[$item] ?? 0.0) + (float) ($row['OnHandQuantity'] ?? 0);
        }

        return $byItem;
    }

    public function serviceCenters(): array
    {
        $data = $this->api->get('msdyn_organizationalunits', [
            '$select'  => implode(',', [
                'msdyn_organizationalunitid', 'msdyn_name',
                'msdyn_address1', 'msdyn_city', 'msdyn_stateorprovince',
                'msdyn_latitude', 'msdyn_longitude',
                '_ab_dispatcher_id_value',
                '_ab_site_id_value',
                'statecode', 'statuscode',
            ]),
            '$orderby' => 'msdyn_name asc',
        ], ttl: 3600);

        return array_map(function ($r) {
            $lat = $r['msdyn_latitude']  ? (float) $r['msdyn_latitude']  : null;
            $lng = $r['msdyn_longitude'] ? (float) $r['msdyn_longitude'] : null;

            $addressParts = array_filter([
                $r['msdyn_address1']       ?? '',
                $r['msdyn_city']           ?? '',
                $r['msdyn_stateorprovince'] ?? '',
            ]);

            return [
                'id'         => $r['msdyn_organizationalunitid'],
                'name'       => $r['msdyn_name'] ?? '',
                'address'    => implode(', ', $addressParts) ?: null,
                'latitude'   => $lat,
                'longitude'  => $lng,
                'maps_url'   => ($lat && $lng) ? "https://www.google.com/maps?q={$lat},{$lng}" : null,
                'dispatcher' => $r['_ab_dispatcher_id_value@OData.Community.Display.V1.FormattedValue'] ?? null,
                'site'       => $r['_ab_site_id_value@OData.Community.Display.V1.FormattedValue'] ?? null,
                'is_active'  => ((int) ($r['statecode'] ?? 1)) === 0,
            ];
        }, $data['value'] ?? []);
    }

    private function countExpiringSoon(): int
    {
        $today = now()->startOfDay();
        $in30  = $today->copy()->addDays(30);

        $data = $this->api->get('ab_agreements', [
            '$select' => 'ab_expiry_date',
            '$filter' => 'statecode eq 0',
            '$top'    => '2000',
        ], ttl: 300);

        $count = 0;
        foreach ($data['value'] ?? [] as $a) {
            if (empty($a['ab_expiry_date'])) continue;
            $d = Carbon::parse($a['ab_expiry_date']);
            if ($d->gte($today) && $d->lte($in30)) $count++;
        }

        return $count;
    }

    private function mapAlertRecord(array $r): array
    {
        return [
            'id'           => $r['ab_agreement_deviceid'],
            'code'         => $r['ab_name'],
            'type'         => $r['ab_agreement_type_code@OData.Community.Display.V1.FormattedValue'] ?? '',
            'device'       => $r['_ab_device_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            'customer'     => $r['_ab_customer_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            'owner'        => $r['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            'team'         => $r['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            'total_times'  => (int) ($r['ab_maintenance_times'] ?? 0),
            'actual_times' => (int) ($r['ab_actual_maintenance_times_rollup'] ?? 0),
            'remaining'    => (int) ($r['ab_remaining_times_calculated'] ?? 0),
            'created_at'   => $r['createdon'] ?? '',
        ];
    }
}
