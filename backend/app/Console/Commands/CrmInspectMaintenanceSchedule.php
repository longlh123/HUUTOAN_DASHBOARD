<?php

namespace App\Console\Commands;

use App\Services\Crm\CrmApiService;
use Illuminate\Console\Command;

class CrmInspectMaintenanceSchedule extends Command
{
    protected $signature   = 'crm:inspect-maintenance-schedule';
    protected $description = 'Probe ab_agreement_devices full fields + related maintenance entities';

    public function __construct(private CrmApiService $api) {
        parent::__construct();
    }

    public function handle(): void
    {
        // 1. Toàn bộ fields của ab_agreement_devices (1 record)
        $this->info("\n=== ab_agreement_devices — all fields (top 1) ===");
        try {
            $data    = $this->api->get('ab_agreement_devices', ['$top' => '1']);
            $records = $data['value'] ?? [];
            if (empty($records)) {
                $this->warn('  → 0 records');
            } else {
                foreach (array_keys($records[0]) as $field) {
                    $val     = $records[0][$field];
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $this->line("  {$field}: " . substr($display, 0, 140));
                }
            }
        } catch (\Throwable $e) {
            $this->error('  Error: ' . $e->getMessage());
        }

        // 2. Tìm entity lịch/nhật ký bảo hành
        $candidates = [
            'ab_maintenance_schedules',
            'ab_maintenanceschedules',
            'ab_maintenance_activities',
            'ab_maintenanceactivities',
            'ab_maintenance_orders',
            'ab_maintenanceorders',
            'ab_service_orders',
            'ab_serviceorders',
            'ab_maintenance_logs',
            'ab_maintenancelogs',
            'ab_agreement_maintenances',
            'ab_maintenances',
        ];

        foreach ($candidates as $entity) {
            $this->info("\n=== {$entity} ===");
            try {
                $data    = $this->api->get($entity, ['$top' => '1']);
                $records = $data['value'] ?? [];
                if (empty($records)) {
                    $this->warn('  → entity tồn tại nhưng 0 records');
                    continue;
                }
                foreach (array_keys($records[0]) as $field) {
                    $val     = $records[0][$field];
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $this->line("  {$field}: " . substr($display, 0, 140));
                }
            } catch (\Throwable $e) {
                // 404 = không tồn tại, bỏ qua
                if (!str_contains($e->getMessage(), '404')) {
                    $this->error('  Error: ' . $e->getMessage());
                }
            }
        }
    }
}
