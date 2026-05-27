<?php

namespace App\Console\Commands;

use App\Services\Crm\CrmApiService;
use Illuminate\Console\Command;

class CrmInspectDimEntities extends Command
{
    protected $signature   = 'crm:inspect-dim';
    protected $description = 'Query D365 metadata to find entity set names and nav properties for ab_dim_* lookups';

    public function __construct(private CrmApiService $api) { parent::__construct(); }

    public function handle(): void
    {
        $this->info('=== Entity set names for ab_dim_* entities ===');

        $result = $this->api->get('EntityDefinitions(LogicalName=\'ab_financial_dimension_value\')', [
            '$select' => 'LogicalName,EntitySetName,SchemaName',
        ]);

        $this->line("  LogicalName={$result['LogicalName']}  EntitySetName={$result['EntitySetName']}");


        $this->newLine();
        $this->info('=== Lookup attributes on systemuser matching ab_dim ===');

        $attrs = $this->api->get(
            'EntityDefinitions(LogicalName=\'systemuser\')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata',
            ['$select' => 'LogicalName,SchemaName,Targets'],
        );

        foreach ($attrs['value'] ?? [] as $a) {
            if (!str_contains($a['LogicalName'], 'ab_dim')) continue;
            $targets = implode(',', $a['Targets'] ?? []);
            $this->line("  LogicalName={$a['LogicalName']}  SchemaName={$a['SchemaName']}  Targets=[{$targets}]");
        }
    }
}
