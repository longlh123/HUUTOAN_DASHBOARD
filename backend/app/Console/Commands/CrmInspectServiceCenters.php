<?php

namespace App\Console\Commands;

use App\Services\Crm\CrmApiService;
use Illuminate\Console\Command;

class CrmInspectServiceCenters extends Command
{
    protected $signature   = 'crm:inspect-service-centers';
    protected $description = 'Probe msdyn_organizationalunits and related junction table for service center data';

    public function __construct(private CrmApiService $api) {
        parent::__construct();
    }

    public function handle(): void
    {
        // 1. Thử query msdyn_organizationalunits — entity chuẩn D365 Field Service
        $this->info("\n=== 1. msdyn_organizationalunits — tất cả fields (top 3) ===");
        try {
            $data = $this->api->get('msdyn_organizationalunits', [
                '$top' => '3',
            ]);
            $records = $data['value'] ?? [];
            $this->line('  → ' . count($records) . ' records');
            foreach ($records as $i => $r) {
                $this->line("\n  --- Record " . ($i + 1) . " ---");
                foreach ($r as $field => $val) {
                    if (str_contains($field, '@odata')) continue;
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $label   = $r[$field . '@OData.Community.Display.V1.FormattedValue'] ?? null;
                    $suffix  = $label ? " ({$label})" : '';
                    $this->line("    {$field}: " . substr($display, 0, 120) . $suffix);
                }
            }
        } catch (\Throwable $e) {
            $this->error('  msdyn_organizationalunits: ' . $e->getMessage());
        }

        // 2. Thử entity junction table mà user đề cập
        $this->info("\n=== 2. Junction table ab_msdyn_organizationalunit_ab_work_order_organizational_unit_id (top 3) ===");
        try {
            $data = $this->api->get('ab_msdyn_organizationalunit_ab_work_order_organizational_unit_id', [
                '$top' => '3',
            ]);
            $records = $data['value'] ?? [];
            $this->line('  → ' . count($records) . ' records');
            foreach ($records as $i => $r) {
                $this->line("\n  --- Record " . ($i + 1) . " ---");
                foreach ($r as $field => $val) {
                    if (str_contains($field, '@odata')) continue;
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $label   = $r[$field . '@OData.Community.Display.V1.FormattedValue'] ?? null;
                    $suffix  = $label ? " ({$label})" : '';
                    $this->line("    {$field}: " . substr($display, 0, 120) . $suffix);
                }
            }
        } catch (\Throwable $e) {
            $this->error('  junction table: ' . $e->getMessage());
        }

        // 3. Unique service_unit từ work orders đang dùng
        $this->info("\n=== 3. Unique _ab_organizational_unit_id từ WO (mẫu 200 WO gần nhất) ===");
        try {
            $data = $this->api->get('ab_work_orders', [
                '$select'  => '_ab_organizational_unit_id_value',
                '$filter'  => '_ab_organizational_unit_id_value ne null',
                '$orderby' => 'createdon desc',
                '$top'     => '200',
            ]);
            $units = [];
            foreach ($data['value'] ?? [] as $r) {
                $id   = $r['_ab_organizational_unit_id_value'] ?? null;
                $name = $r['_ab_organizational_unit_id_value@OData.Community.Display.V1.FormattedValue'] ?? '?';
                if ($id) $units[$id] = $name;
            }
            $this->line('  → ' . count($units) . ' đơn vị unique:');
            foreach ($units as $id => $name) {
                $this->line("    {$name} ({$id})");
            }
        } catch (\Throwable $e) {
            $this->error('  ' . $e->getMessage());
        }

        // 4. Expand organizational unit từ 1 WO để thấy fields có sẵn
        $this->info("\n=== 4. Expand msdyn_organizationalunit từ 1 WO ===");
        try {
            $data = $this->api->get('ab_work_orders', [
                '$select'  => 'ab_name,_ab_organizational_unit_id_value',
                '$expand'  => 'ab_organizational_unit_id($select=msdyn_name,msdyn_description,msdyn_currency)',
                '$filter'  => '_ab_organizational_unit_id_value ne null',
                '$top'     => '1',
            ]);
            foreach ($data['value'] ?? [] as $r) {
                $this->line('  WO: ' . $r['ab_name']);
                $unit = $r['ab_organizational_unit_id'] ?? [];
                $this->line('  Expanded org unit:');
                foreach ($unit as $f => $v) {
                    $this->line("    {$f}: {$v}");
                }
            }
        } catch (\Throwable $e) {
            $this->error('  expand failed: ' . $e->getMessage());
        }
    }
}
