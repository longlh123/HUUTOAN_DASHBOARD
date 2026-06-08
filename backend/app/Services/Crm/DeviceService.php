<?php

namespace App\Services\Crm;

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

    public function __construct(private CrmApiService $api) {}

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

        $data = $this->api->get('ab_work_orders', [
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
                'ab_wo_type_code eq 500000001',
                'ab_wo_status_code ne 500000005',
                "ab_planned_start_date ge {$from}",
                "ab_planned_start_date lt {$to}",
            ]),
            '$orderby' => 'ab_planned_start_date asc',
            '$top'     => '5000',
        ], ttl: 300);

        $records     = $data['value'] ?? [];
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
