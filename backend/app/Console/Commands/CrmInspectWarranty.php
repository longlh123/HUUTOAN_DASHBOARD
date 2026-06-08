<?php

namespace App\Console\Commands;

use App\Services\Crm\CrmApiService;
use Illuminate\Console\Command;

class CrmInspectWarranty extends Command
{
    protected $signature   = 'crm:inspect-warranty';
    protected $description = 'Probe ab_warranty_policy and ab_warranty_policy_detail — show first record fields';

    public function __construct(private CrmApiService $api) {
        parent::__construct();
    }

    public function handle(): void
    {
        foreach (['ab_warranty_policies', 'ab_warranty_policy_details'] as $entity) {
            $this->info("\n=== {$entity} (top 1, no \$select) ===");
            try {
                $data = $this->api->get($entity, ['$top' => '1']);
                $records = $data['value'] ?? [];
                if (empty($records)) {
                    $this->warn('  → 0 records');
                    continue;
                }
                foreach (array_keys($records[0]) as $field) {
                    $val = $records[0][$field];
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $this->line("  {$field}: " . substr($display, 0, 120));
                }
            } catch (\Throwable $e) {
                $this->error('  Error: ' . $e->getMessage());
            }
        }

        // Thử tên entity số ít (D365 đôi khi dùng số ít)
        foreach (['ab_warranty_policy', 'ab_warranty_policy_detail'] as $entity) {
            $this->info("\n=== {$entity} (số ít) ===");
            try {
                $data = $this->api->get($entity, ['$top' => '1']);
                $records = $data['value'] ?? [];
                if (empty($records)) {
                    $this->warn('  → 0 records');
                    continue;
                }
                foreach (array_keys($records[0]) as $field) {
                    $val = $records[0][$field];
                    $display = is_array($val) ? json_encode($val) : (string) $val;
                    $this->line("  {$field}: " . substr($display, 0, 120));
                }
            } catch (\Throwable $e) {
                $this->error('  Error: ' . $e->getMessage());
            }
        }
    }
}
