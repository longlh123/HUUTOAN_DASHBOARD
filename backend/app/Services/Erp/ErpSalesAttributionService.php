<?php

namespace App\Services\Erp;

use App\Services\Crm\CrmApiService;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Doanh so NNC (Luong 1: SO -> Sales Order -> Invoice) va SEV (Luong 2/3: WO -> Project -> OnAccount)
 * tinh tu hoa don that ben F&O thay vi CRM Won quote — xem docs/sales-crm-backlog-tracking.md muc 3.
 *
 * dealRows() tra ve deal-shaped rows GIONG HET CRM quote rows ma SalesPerformanceService dang dung
 * noi bo (resolved_value, closedon, createdon, _ownerid_value, _owningbusinessunit_value + annotation)
 * de tai dung nguyen xi pipeline group/sum hien co (calcOppValue, periodKey, filterByDepartment...)
 * ma khong phai viet lai. Khong tu loc theo department o day — SalesPerformanceService::filterByDepartment()
 * da loc theo department cua OWNER (qua fetchUsers()), khong phai field tren deal, nen ap dung duoc
 * thang len cac row nay mien la _ownerid_value dung.
 *
 * dealRows() (doc-path, dashboard dung) doc tu bang erp_synced_deals — nhanh (query MySQL co index)
 * thay vi cross-reference song moi lan load (tung mat toi 30 phut voi khoang full nam). Du lieu trong
 * bang duoc dien boi lenh `php artisan erp:sync-deals` (SyncErpDeals command), goi fetchLiveDealRows()
 * (chinh la logic cross-reference cu, khong doi) roi upsert vao MySQL.
 */
class ErpSalesAttributionService
{
    public function __construct(
        private ErpApiService $erp,
        private CrmApiService $crm,
    ) {}

    public function dealRows(Carbon $from, Carbon $to): Collection
    {
        return DB::table('erp_synced_deals')
            ->whereBetween('invoice_date', [$from->toDateString(), $to->toDateString()])
            ->get()
            ->map(fn ($row) => [
                'quoteid' => $row->external_key,
                '_opportunityid_value' => null,
                'closedon' => $row->invoice_date,
                'createdon' => $row->source_created_at ?? $row->invoice_date,
                'resolved_value' => (float) $row->resolved_value,
                '_ownerid_value' => $row->owner_id,
                '_ownerid_value@OData.Community.Display.V1.FormattedValue' => $row->owner_name ?? '',
                '_owningbusinessunit_value' => $row->team_id,
                '_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue' => $row->team_name ?? '',
            ]);
    }

    // Logic cross-reference song, dung boi SyncErpDeals command de dien bang erp_synced_deals —
    // KHONG dung truc tiep tu dashboard nua (qua cham, xem dealRows() o tren).
    public function fetchLiveDealRows(Carbon $from, Carbon $to): Collection
    {
        return $this->soInvoiceRows($from, $to)->merge($this->onAccountRows($from, $to))->values();
    }

    // Luong 1 (NNC, 1 it Service): SalesInvoiceHeadersV4.SalesOrderNumber ghep prefix "1001"
    // khop salesorders.ordernumber (CRM) -> _quoteid_value -> quotes (owner/team/createdon).
    private function soInvoiceRows(Carbon $from, Carbon $to): Collection
    {
        $invoices = collect($this->erp->getAll('SalesInvoiceHeadersV4', [
            '$select' => 'InvoiceNumber,InvoiceDate,TotalInvoiceAmount,SalesOrderNumber',
            '$filter' => $this->dateFilter('InvoiceDate', $from, $to),
        ]))->filter(fn ($i) => ! empty($i['SalesOrderNumber']));

        if ($invoices->isEmpty()) {
            return collect();
        }

        $soNumbers = $invoices->pluck('SalesOrderNumber')->unique()->values();

        $quoteIdBySo = collect();
        foreach ($soNumbers->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($so) => "ordernumber eq '1001{$so}'")->implode(' or ');
            $data = $this->crm->get('salesorders', [
                '$select' => 'ordernumber,_quoteid_value',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));

            foreach ($data['value'] ?? [] as $so) {
                $soNumber = substr($so['ordernumber'] ?? '', 4); // bo prefix "1001" (4 ky tu dau)
                if ($soNumber !== '') {
                    $quoteIdBySo[$soNumber] = $so['_quoteid_value'] ?? null;
                }
            }
        }

        $quoteIds = collect($quoteIdBySo)->filter()->unique()->values();
        $quotes = collect();
        foreach ($quoteIds->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($id) => "quoteid eq {$id}")->implode(' or ');
            $data = $this->crm->get('quotes', [
                '$select' => 'quoteid,createdon,_ownerid_value,_owningbusinessunit_value',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));
            $quotes = $quotes->merge($data['value'] ?? []);
        }
        $quoteById = $quotes->keyBy('quoteid');

        return $invoices->map(function ($inv) use ($quoteIdBySo, $quoteById) {
            $quoteId = $quoteIdBySo[$inv['SalesOrderNumber']] ?? null;
            $quote = $quoteId ? $quoteById->get($quoteId) : null;
            if (! $quote || empty($quote['_ownerid_value'])) {
                return null;
            }

            return [
                'quoteid' => 'erp-so-'.$inv['InvoiceNumber'],
                '_opportunityid_value' => null,
                'closedon' => $inv['InvoiceDate'],
                'createdon' => $quote['createdon'] ?? $inv['InvoiceDate'],
                'resolved_value' => (float) ($inv['TotalInvoiceAmount'] ?? 0),
                '_ownerid_value' => $quote['_ownerid_value'],
                '_ownerid_value@OData.Community.Display.V1.FormattedValue' => $quote['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                '_owningbusinessunit_value' => $quote['_owningbusinessunit_value'] ?? null,
                '_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue' => $quote['_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            ];
        })->filter()->values();
    }

    // Luong 2/3 (SEV, 1 it B2B - loai B2B ra vi B2B van tinh theo CRM):
    // DocumentProjInvoiceOnAccLines.TransId = ProjectPostTransViews.TransactionId -> ProjectId
    // -> ab_projects.ab_name -> _ab_sales_owner_id_value (owner) -> systemusers (team).
    private function onAccountRows(Carbon $from, Carbon $to): Collection
    {
        $lines = collect($this->erp->getAll('DocumentProjInvoiceOnAccLines', [
            '$select' => 'TransId,InvoiceDate,LineAmount',
            '$filter' => $this->dateFilter('InvoiceDate', $from, $to),
        ]))->filter(fn ($l) => ! empty($l['TransId']));

        if ($lines->isEmpty()) {
            return collect();
        }

        $transIds = $lines->pluck('TransId')->unique()->values();
        $projectByTrans = collect();
        foreach ($transIds->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($id) => "TransactionId eq '{$id}'")->implode(' or ');
            $data = $this->erp->get('ProjectPostTransViews', [
                '$select' => 'TransactionId,ProjectId',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));

            foreach ($data['value'] ?? [] as $r) {
                $projectByTrans[$r['TransactionId']] = $r['ProjectId'] ?? null;
            }
        }

        $projectIds = collect($projectByTrans)->filter()->unique()->values();
        $projects = collect();
        foreach ($projectIds->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($id) => "ab_name eq '{$id}'")->implode(' or ');
            $data = $this->crm->get('ab_projects', [
                '$select' => 'ab_name,createdon,_ab_sales_owner_id_value',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));
            $projects = $projects->merge($data['value'] ?? []);
        }
        $projectByName = $projects->keyBy('ab_name');

        $ownerIds = $projectByName->pluck('_ab_sales_owner_id_value')->filter()->unique()->values();
        $owners = collect();
        foreach ($ownerIds->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($id) => "systemuserid eq {$id}")->implode(' or ');
            $data = $this->crm->get('systemusers', [
                '$select' => 'systemuserid,fullname,_businessunitid_value',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));
            $owners = $owners->merge($data['value'] ?? []);
        }
        $ownerById = $owners->keyBy('systemuserid');

        return $lines->map(function ($line) use ($projectByTrans, $projectByName, $ownerById) {
            $projectId = $projectByTrans[$line['TransId']] ?? null;
            $project = $projectId ? $projectByName->get($projectId) : null;
            $ownerId = $project['_ab_sales_owner_id_value'] ?? null;
            $owner = $ownerId ? $ownerById->get($ownerId) : null;
            if (! $owner) {
                return null;
            }

            return [
                'quoteid' => 'erp-oa-'.$line['TransId'],
                '_opportunityid_value' => null,
                'closedon' => $line['InvoiceDate'],
                'createdon' => $project['createdon'] ?? $line['InvoiceDate'],
                'resolved_value' => (float) ($line['LineAmount'] ?? 0),
                '_ownerid_value' => $ownerId,
                '_ownerid_value@OData.Community.Display.V1.FormattedValue' => $owner['fullname'] ?? '',
                '_owningbusinessunit_value' => $owner['_businessunitid_value'] ?? null,
                '_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue' => $owner['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            ];
        })->filter()->values();
    }

    // addDay()->startOfDay() cho moc "lt" — an toan voi ca field Date Only lan DateTime
    // (xem docs/backend crm-integration.md — bug da gap voi endOfDay() tren field Date Only).
    private function dateFilter(string $field, Carbon $from, Carbon $to): string
    {
        return implode(' and ', [
            "{$field} ge {$from->copy()->startOfDay()->utc()->toIso8601String()}",
            "{$field} lt {$to->copy()->addDay()->startOfDay()->utc()->toIso8601String()}",
        ]);
    }

    private function ttl(Carbon $to): int
    {
        return $to->year < now()->year ? 86400 : 1800;
    }
}
