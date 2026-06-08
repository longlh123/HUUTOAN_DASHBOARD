<?php

namespace App\Console\Commands;

use App\Services\Crm\CrmApiService;
use Illuminate\Console\Command;

class CrmInspectAgreementAndWorkOrders extends Command
{
    protected $signature   = 'crm:inspect-agreement-wo';
    protected $description = 'Probe ab_agreements fields + work order candidates';

    public function __construct(private CrmApiService $api) {
        parent::__construct();
    }

    public function handle(): void
    {
        // 1. ab_agreements — entity cha của ab_agreement_devices
        $this->info("\n=== ab_agreements — all fields (top 1, statecode=0) ===");
        try {
            $data = $this->api->get('ab_agreements', [
                '$top'    => '1',
                '$filter' => 'statecode eq 0',
            ]);
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

        // 2. Work order candidates
        $candidates = [
            'msdyn_workorders',
            'ab_work_orders',
            'ab_workorders',
            'ab_service_calls',
            'ab_servicecalls',
            'ab_field_service_activities',
            'ab_maintenance_visits',
            'ab_maintenancevisits',
            'tasks',
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
                $this->line('  → ' . count($records) . ' record(s), fields:');
                foreach (array_keys($records[0]) as $field) {
                    $val     = $records[0][$field];
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $this->line("  {$field}: " . substr($display, 0, 140));
                }
            } catch (\Throwable $e) {
                if (!str_contains($e->getMessage(), '404')) {
                    $this->error('  Error: ' . $e->getMessage());
                }
            }
        }
    }
}
