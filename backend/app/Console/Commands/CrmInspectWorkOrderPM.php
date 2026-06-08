<?php

namespace App\Console\Commands;

use App\Services\Crm\CrmApiService;
use Illuminate\Console\Command;

class CrmInspectWorkOrderPM extends Command
{
    protected $signature   = 'crm:inspect-wo-pm';
    protected $description = 'Probe ab_work_orders: type codes, PM samples, scheduled WOs linked to agreement_devices';

    public function __construct(private CrmApiService $api) {
        parent::__construct();
    }

    public function handle(): void
    {
        // 1. Phân bổ ab_wo_type_code — có bao nhiêu loại?
        $this->info("\n=== 1. Phân bổ ab_wo_type_code (top 500) ===");
        try {
            $data = $this->api->get('ab_work_orders', [
                '$select' => 'ab_wo_type_code',
                '$top'    => '500',
            ]);
            $counts = [];
            foreach ($data['value'] ?? [] as $r) {
                $label = $r['ab_wo_type_code@OData.Community.Display.V1.FormattedValue'] ?? 'null';
                $code  = (string) ($r['ab_wo_type_code'] ?? 'null');
                $key   = "{$label} ({$code})";
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
            arsort($counts);
            foreach ($counts as $k => $v) {
                $this->line("  {$k}: {$v}");
            }
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
        }

        // 2. Phân bổ ab_wo_status_code
        $this->info("\n=== 2. Phân bổ ab_wo_status_code (top 500) ===");
        try {
            $data = $this->api->get('ab_work_orders', [
                '$select' => 'ab_wo_status_code',
                '$top'    => '500',
            ]);
            $counts = [];
            foreach ($data['value'] ?? [] as $r) {
                $label = $r['ab_wo_status_code@OData.Community.Display.V1.FormattedValue'] ?? 'null';
                $code  = (string) ($r['ab_wo_status_code'] ?? 'null');
                $key   = "{$label} ({$code})";
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
            arsort($counts);
            foreach ($counts as $k => $v) {
                $this->line("  {$k}: {$v}");
            }
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
        }

        // 3. WO loại PM (thử các code phổ biến: 500000001, 500000002, 1, 2)
        $this->info("\n=== 3. Tìm WO có _ab_agreement_device_id_value != null (top 3) ===");
        try {
            $data = $this->api->get('ab_work_orders', [
                '$select' => implode(',', [
                    'ab_name', 'ab_wo_type_code', 'ab_wo_status_code',
                    'ab_planned_start_date', 'ab_planned_end_date',
                    'ab_actual_start_date', 'ab_actual_end_date',
                    '_ab_agreement_device_id_value',
                    '_ab_agreement_id_value',
                    '_ab_lead_engineer_id_value',
                    'ab_technician',
                    '_ab_service_customer_id_value',
                ]),
                '$filter' => '_ab_agreement_device_id_value ne null',
                '$top'    => '3',
                '$orderby' => 'createdon desc',
            ]);
            $records = $data['value'] ?? [];
            if (empty($records)) {
                $this->warn('  → 0 records có _ab_agreement_device_id_value');
            }
            foreach ($records as $i => $r) {
                $this->line("\n  --- Record " . ($i + 1) . " ---");
                foreach ($r as $field => $val) {
                    if (str_contains($field, '@')) continue;
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $label   = $r[$field . '@OData.Community.Display.V1.FormattedValue'] ?? null;
                    $suffix  = $label ? " ({$label})" : '';
                    $this->line("    {$field}: " . substr($display, 0, 100) . $suffix);
                }
            }
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
        }

        // 4. WO scheduled trong 30 ngày tới (bất kỳ loại)
        $this->info("\n=== 4. WO Scheduled trong 30 ngày tới ===");
        try {
            $from = now()->utc()->toIso8601String();
            $to   = now()->addDays(30)->utc()->toIso8601String();
            $data = $this->api->get('ab_work_orders', [
                '$select' => implode(',', [
                    'ab_name', 'ab_wo_type_code', 'ab_wo_status_code',
                    'ab_planned_start_date',
                    '_ab_agreement_device_id_value',
                    '_ab_service_customer_id_value',
                    '_ab_lead_engineer_id_value',
                    'ab_technician',
                    '_ab_state_id_value',
                ]),
                '$filter'  => "ab_planned_start_date ge {$from} and ab_planned_start_date le {$to}",
                '$orderby' => 'ab_planned_start_date asc',
                '$top'     => '20',
            ]);
            $records = $data['value'] ?? [];
            $this->line('  → ' . count($records) . ' WO trong 30 ngày tới');
            foreach ($records as $r) {
                $type     = $r['ab_wo_type_code@OData.Community.Display.V1.FormattedValue'] ?? '?';
                $status   = $r['ab_wo_status_code@OData.Community.Display.V1.FormattedValue'] ?? '?';
                $customer = $r['_ab_service_customer_id_value@OData.Community.Display.V1.FormattedValue'] ?? '?';
                $date     = substr($r['ab_planned_start_date'] ?? '', 0, 10);
                $hasAgreement = $r['_ab_agreement_device_id_value'] ? 'HĐ' : '---';
                $this->line("  [{$date}] {$r['ab_name']} | {$type} | {$status} | {$hasAgreement} | {$customer}");
            }
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
        }

        // 5. Kiểm tra ab_agreements: effective_date có được set không?
        $this->info("\n=== 5. ab_agreements có effective_date (top 5) ===");
        try {
            $data = $this->api->get('ab_agreements', [
                '$select' => implode(',', [
                    'ab_name', 'ab_effective_date', 'ab_expiry_date',
                    'ab_duration_month', 'ab_default_maintenance_times',
                    'ab_total_maintenance_times_rollup', 'statuscode', 'statecode',
                ]),
                '$filter' => 'ab_effective_date ne null and statecode eq 0',
                '$top'    => '5',
            ]);
            foreach ($data['value'] ?? [] as $r) {
                $this->line(sprintf(
                    '  %s | eff: %s | exp: %s | dur: %sm | times: %s/%s | done: %s',
                    $r['ab_name'],
                    substr($r['ab_effective_date'] ?? '-', 0, 10),
                    substr($r['ab_expiry_date'] ?? '-', 0, 10),
                    $r['ab_duration_month'] ?? '?',
                    $r['ab_total_maintenance_times_rollup'] ?? '?',
                    $r['ab_default_maintenance_times'] ?? '?',
                    $r['statuscode@OData.Community.Display.V1.FormattedValue'] ?? '?',
                ));
            }
        } catch (\Throwable $e) {
            $this->error($e->getMessage());
        }
    }
}
