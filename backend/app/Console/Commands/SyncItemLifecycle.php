<?php

namespace App\Console\Commands;

use App\Services\Erp\ItemLifecycleSyncService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SyncItemLifecycle extends Command
{
    protected $signature = 'erp:sync-item-lifecycle {--from=} {--to=} {--skip-on-hand} {--skip-all-time-sales} {--skip-all-time-inventory} {--all-time-from=}';

    protected $description = 'Dong bo tin hieu vong doi vat tu (ban hang, xuat nhap ton, ton kho hien tai) vao bang item_lifecycle_signals — mac dinh 3 nam gan nhat';

    public function __construct(private ItemLifecycleSyncService $sync)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        // Bien "all-time" (khong gioi han ngay) co the keo ve rat nhieu dong (InventTransCDSEntities
        // toan bo lich su F&O) — memory_limit mac dinh CLI (128M) khong du, giong erp:sync-items.
        ini_set('memory_limit', '1024M');

        $from = $this->option('from') ? Carbon::parse($this->option('from'))->startOfDay() : now()->subYears(3)->startOfDay();
        $to = $this->option('to') ? Carbon::parse($this->option('to'))->startOfDay() : now()->startOfDay();

        // Chunk theo thang — tranh 1 request qua lau/qua nang (giong erp:sync-deals)
        $chunks = [];
        $cursor = $from->copy();
        while ($cursor <= $to) {
            $chunkEnd = $cursor->copy()->endOfMonth()->min($to);
            $chunks[] = [$cursor->copy(), $chunkEnd->copy()];
            $cursor = $chunkEnd->copy()->addDay()->startOfDay();
        }

        $this->info('Syncing tin hieu ban hang (SalesLineBiEntities)...');
        foreach ($chunks as [$chunkFrom, $chunkTo]) {
            $this->info("  {$chunkFrom->toDateString()} -> {$chunkTo->toDateString()}");
            $this->sync->syncSales($chunkFrom, $chunkTo);
        }

        $this->info('Syncing tin hieu xuat nhap ton (InventTransCDSEntities)...');
        foreach ($chunks as [$chunkFrom, $chunkTo]) {
            $this->info("  {$chunkFrom->toDateString()} -> {$chunkTo->toDateString()}");
            $this->sync->syncInventoryMovement($chunkFrom, $chunkTo);
        }

        if (! $this->option('skip-on-hand')) {
            $this->info('Syncing ton kho hien tai (ABInventWarehousesOnHandV2)...');
            $this->sync->syncOnHand();
        }

        if (! $this->option('skip-all-time-sales')) {
            $this->info('Syncing "da tung ban hay chua" (toan bo lich su, khong gioi han ngay)...');
            $this->sync->syncAllTimeSales();
        }

        if (! $this->option('skip-all-time-inventory')) {
            $this->info('Syncing ngay XNK gan nhat (toan bo lich su, chia theo thang de tranh tran bo nho/timeout)...');
            // Du lieu that cua InventTransCDSEntities bat dau tu ~2018-11 (truoc do la gia tri
            // placeholder "1900-01-01" cua F&O, khong phai giao dich that) — 2018-01-01 la moc an toan.
            // --all-time-from cho phep resume tu giua chung khi gap loi mang tam thoi (SSL timeout),
            // khong phai chay lai tu dau.
            $allTimeFrom = $this->option('all-time-from')
                ? Carbon::parse($this->option('all-time-from'))->startOfDay()
                : Carbon::parse('2018-01-01')->startOfDay();
            $allTimeCursor = $allTimeFrom->copy();
            while ($allTimeCursor <= $to) {
                $chunkEnd = $allTimeCursor->copy()->endOfMonth()->min($to);
                $this->info("  {$allTimeCursor->toDateString()} -> {$chunkEnd->toDateString()}");
                $this->sync->syncAllTimeInventoryMovement($allTimeCursor, $chunkEnd);
                $allTimeCursor = $chunkEnd->copy()->addDay()->startOfDay();
            }
        }

        $this->info('Xong.');

        return self::SUCCESS;
    }
}
