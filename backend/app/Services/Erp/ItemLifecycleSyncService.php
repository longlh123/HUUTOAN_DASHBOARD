<?php

namespace App\Services\Erp;

use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ItemLifecycleSyncService
{
    public function __construct(private ErpApiService $erp) {}

    // Tin hieu "dung cho du an" tu SalesLineBiEntities — dang tin cay hon CRM quotedetails vi
    // hon nua so dong quotedetails la free-text, khong gan productid nao ca.
    public function syncSales(Carbon $from, Carbon $to): void
    {
        $rows = $this->erp->getAll('SalesLineBiEntities', [
            '$select' => 'ItemId,CreatedOn,SalesQty',
            '$filter' => "CreatedOn ge {$from->toIso8601String()} and CreatedOn le {$to->toIso8601String()}",
        ]);

        $byItem = collect($rows)
            ->filter(fn ($r) => ! empty($r['ItemId']))
            ->groupBy('ItemId')
            ->map(fn (Collection $g) => [
                'last_sale_date' => $g->max(fn ($r) => Carbon::parse($r['CreatedOn'])->toDateString()),
                'sale_count_3y' => $g->count(),
                'sale_qty_3y' => $g->sum(fn ($r) => (float) ($r['SalesQty'] ?? 0)),
            ]);

        $this->upsert($byItem);
    }

    // "Da tung ban hay chua" — KHONG gioi han ngay (toan bo lich su F&O co), khac han last_sale_date/
    // sale_count_3y o tren. Dung de phan biet "da tung ban, gio ngung" voi "chua tung ban lan nao"
    // (item moi tao BOM, chua ra mat — khong nen tinh la ung vien dong kho).
    public function syncAllTimeSales(): void
    {
        $rows = $this->erp->getAll('SalesLineBiEntities', [
            '$select' => 'ItemId,CreatedOn',
        ]);

        $byItem = collect($rows)
            ->filter(fn ($r) => ! empty($r['ItemId']))
            ->groupBy('ItemId')
            ->map(fn (Collection $g) => [
                'has_ever_sold' => true,
                'first_sale_date' => $g->min(fn ($r) => Carbon::parse($r['CreatedOn'])->toDateString()),
                'last_sale_date_all_time' => $g->max(fn ($r) => Carbon::parse($r['CreatedOn'])->toDateString()),
                'sale_count_all_time' => $g->count(),
            ]);

        $this->upsert($byItem);
    }

    // Ngay xuat/nhap kho gan nhat — KHONG gioi han 3 nam nhu syncInventoryMovement(), dung khi
    // last_inventory_txn_date la null de biet item nay thuc su ngung xuat nhap tu bao lau thay vi
    // chi bao "khong co trong 3 nam". Nhan $from/$to de chia nho theo tung khoang (toan bo lich su
    // F&O cong lai co the len toi hang tram nghin dong — khong the keo 1 lan, de tran bo nho/timeout).
    // Cac khoang PHAI duoc goi theo thu tu tu CU den MOI (giong erp:sync-deals) vi moi lan goi se ghi
    // de MAX cua rieng khoang do — goi dung thu tu thi lan goi cuoi (moi nhat) se giu dung gia tri that.
    public function syncAllTimeInventoryMovement(Carbon $from, Carbon $to): void
    {
        $rows = $this->erp->getAll('InventTransCDSEntities', [
            '$select' => 'ItemId,DatePhysical',
            '$filter' => "DatePhysical ge {$from->toIso8601String()} and DatePhysical le {$to->toIso8601String()}",
        ]);

        $byItem = collect($rows)
            ->filter(fn ($r) => ! empty($r['ItemId']))
            ->groupBy('ItemId')
            ->map(fn (Collection $g) => [
                'last_inventory_txn_date_all_time' => $g->max(fn ($r) => Carbon::parse($r['DatePhysical'])->toDateString()),
            ]);

        $this->upsert($byItem);
    }

    // Tin hieu "xuat nhap ton" tu InventTransCDSEntities — StatusIssue/StatusReceipt khac null (khong
    // phai "None") nghia la dong giao dich that su da xay ra (khong phai dong dang cho).
    public function syncInventoryMovement(Carbon $from, Carbon $to): void
    {
        $rows = $this->erp->getAll('InventTransCDSEntities', [
            '$select' => 'ItemId,Qty,DatePhysical,StatusIssue,StatusReceipt',
            '$filter' => "DatePhysical ge {$from->toIso8601String()} and DatePhysical le {$to->toIso8601String()}",
        ]);

        $byItem = collect($rows)
            ->filter(fn ($r) => ! empty($r['ItemId']))
            ->groupBy('ItemId')
            ->map(function (Collection $g) {
                $qty = fn ($r) => (float) ($r['Qty'] ?? 0);

                return [
                    'last_inventory_txn_date' => $g->max(fn ($r) => Carbon::parse($r['DatePhysical'])->toDateString()),
                    'qty_in_3y' => $g->filter(fn ($r) => $qty($r) > 0)->sum($qty),
                    'qty_out_3y' => abs($g->filter(fn ($r) => $qty($r) < 0)->sum($qty)),
                ];
            });

        $this->upsert($byItem);
    }

    // Ton kho hien tai — khong can loc ngay, la so du tai thoi diem sync.
    public function syncOnHand(): void
    {
        $rows = $this->erp->getAll('ABInventWarehousesOnHandV2', [
            '$select' => 'ItemNumber,OnHandQuantity',
        ]);

        $byItem = collect($rows)
            ->filter(fn ($r) => ! empty($r['ItemNumber']))
            ->groupBy('ItemNumber')
            ->map(fn (Collection $g) => [
                'on_hand_qty' => $g->sum(fn ($r) => (float) ($r['OnHandQuantity'] ?? 0)),
            ]);

        $this->upsert($byItem);
    }

    private function upsert(Collection $byItem): void
    {
        if ($byItem->isEmpty()) {
            return;
        }

        $now = now();
        $rows = $byItem->map(fn ($fields, $itemNumber) => array_merge(
            ['item_number' => $itemNumber, 'last_synced_at' => $now, 'updated_at' => $now, 'created_at' => $now],
            $fields
        ))->values()->all();

        $columns = array_values(array_unique(array_merge(...array_map('array_keys', $rows))));
        $updateColumns = array_values(array_diff($columns, ['item_number', 'created_at']));

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('item_lifecycle_signals')->upsert($chunk, ['item_number'], $updateColumns);
        }
    }
}
