<?php

namespace App\Console\Commands;

use App\Services\Erp\ErpSalesAttributionService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncErpDeals extends Command
{
    protected $signature = 'erp:sync-deals {--from=} {--to=}';

    protected $description = 'Dong bo doanh so ERP (NNC/SS) vao bang erp_synced_deals — mac dinh 7 ngay gan nhat, dung --from/--to de backfill lich su';

    public function __construct(private ErpSalesAttributionService $erp)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $from = $this->option('from') ? Carbon::parse($this->option('from'))->startOfDay() : now()->subDays(7)->startOfDay();
        $to = $this->option('to') ? Carbon::parse($this->option('to'))->startOfDay() : now()->startOfDay();

        // Range lon (backfill lich su) -> chunk theo thang, tranh 1 request qua lau/qua nang
        $chunks = [];
        $cursor = $from->copy();
        while ($cursor <= $to) {
            $chunkEnd = $cursor->copy()->endOfMonth()->min($to);
            $chunks[] = [$cursor->copy(), $chunkEnd->copy()];
            $cursor = $chunkEnd->copy()->addDay()->startOfDay();
        }

        $total = 0;
        foreach ($chunks as [$chunkFrom, $chunkTo]) {
            $this->info("Syncing {$chunkFrom->toDateString()} → {$chunkTo->toDateString()}...");

            $rows = $this->erp->fetchLiveDealRows($chunkFrom, $chunkTo)->map(fn ($r) => [
                'source' => str_starts_with($r['quoteid'], 'erp-oa-') ? 'onaccount' : 'so_invoice',
                'external_key' => $r['quoteid'],
                'invoice_date' => Carbon::parse($r['closedon'])->toDateString(),
                'source_created_at' => $r['createdon'] ? Carbon::parse($r['createdon'])->toDateString() : null,
                'resolved_value' => $r['resolved_value'],
                'owner_id' => $r['_ownerid_value'],
                'owner_name' => $r['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?: null,
                'team_id' => $r['_owningbusinessunit_value'],
                'team_name' => $r['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue'] ?: null,
                'updated_at' => now(),
                'created_at' => now(),
            ])->values()->all();

            if (! empty($rows)) {
                DB::table('erp_synced_deals')->upsert(
                    $rows,
                    ['external_key'],
                    ['source', 'invoice_date', 'source_created_at', 'resolved_value', 'owner_id', 'owner_name', 'team_id', 'team_name', 'updated_at']
                );
            }

            $total += count($rows);
            $this->info('  → '.count($rows).' dòng.');
        }

        $this->info("Xong — tổng {$total} dòng đã sync.");

        return self::SUCCESS;
    }
}
