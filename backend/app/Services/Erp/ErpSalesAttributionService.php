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
    // ProjectGroups.Name goc trong F&O khong khop cach Sale goi ("Ban dich vu" thay vi "Sua chua")
    // — map lai theo dung nhan Sale dang dung, verify qua ProjectName that (vd group 102 toan project
    // ten "Sua chua - ...", group 104 la "Bao tri bao duong", 103 la "Cho thue may").
    private const PROJECT_GROUP_LABELS = [
        '100' => 'BÁN MÁY',
        '101' => 'THI CÔNG LẮP ĐẶT',
        '102' => 'SỬA CHỮA',
        '103' => 'THUÊ MÁY',
        '104' => 'BẢO TRÌ',
        '105' => 'OEM',
        '106' => 'BẢO HÀNH',
    ];

    private const RECONCILE_DEPARTMENTS = ['NNC', 'SS'];

    public function __construct(
        private ErpApiService $erp,
        private CrmApiService $crm,
    ) {}

    /**
     * Bang chi tiet tung dong hoa don ERP (ca luong SO-Invoice/NNC lan OnAccount/SEV-SS), du 18 cot
     * khop file Excel Sale tu tong hop de doi chieu — xem docs/sales-crm-backlog-tracking.md muc 3.
     * Khac dealRows() (chi tra ve shape rut gon cho dashboard tong hop) — bang nay giu nguyen tung
     * field goc (Ledger Voucher, LastSettleVoucher, Customer Account, Service type...) nen luon fetch
     * song (khong qua bang sync erp_synced_deals) vi day la trang audit, tan suat truy cap thap.
     */
    public function reconciliationRows(Carbon $from, Carbon $to, ?string $department = null): Collection
    {
        $rows = $this->onAccountDetailRows($from, $to)->merge($this->soInvoiceDetailRows($from, $to));

        $rows = $department
            ? $rows->filter(fn ($r) => $r['department'] === $department)
            : $rows->filter(fn ($r) => in_array($r['department'], self::RECONCILE_DEPARTMENTS, true));

        $customerNameByAccount = $this->customerNamesFor($rows->pluck('customer_account'));

        return $rows
            ->map(fn ($r) => $r + ['customer_name' => $customerNameByAccount->get($r['customer_account'], '')])
            ->sortByDesc('invoice_date')
            ->values();
    }

    // CustomersV3 qua lon de getAll() ca bang (tung timeout 60s ngay trang dau — khac
    // FinanceService::fetchCustomerDirectory() dung getAll() toan bo, chap nhan duoc vi Finance
    // dashboard fetch it, cache dai) — chi truy van dung cac CustomerAccount can, chunk 15/request
    // giong moi join khac trong file nay.
    private function customerNamesFor(Collection $accountNumbers): Collection
    {
        $accounts = $accountNumbers->filter()->unique()->values();
        if ($accounts->isEmpty()) {
            return collect();
        }

        $names = collect();
        foreach ($accounts->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($a) => "CustomerAccount eq '{$a}'")->implode(' or ');
            $data = $this->erp->get('CustomersV3', [
                '$select' => 'CustomerAccount,OrganizationName',
                '$filter' => $filter,
            ], ttl: 86400);

            foreach ($data['value'] ?? [] as $c) {
                $names[$c['CustomerAccount']] = $c['OrganizationName'] ?? '';
            }
        }

        return $names;
    }

    // Luong OnAccount (SEV/SS, 1 it B2B/khac — loc department sau khi map xong).
    private function onAccountDetailRows(Carbon $from, Carbon $to): Collection
    {
        $lines = collect($this->erp->getAll('DocumentProjInvoiceOnAccLines', [
            '$select' => 'TransId,InvoiceDate,LedgerVoucher,ProjInvoiceId,SalesPrice,LineAmount',
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
        if ($projectIds->isEmpty()) {
            return collect();
        }

        $projects = collect();
        foreach ($projectIds->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($id) => "ProjectID eq '{$id}'")->implode(' or ');
            $data = $this->erp->get('Projects', [
                '$select' => 'ProjectID,ProjectName,CustomerAccount,WorkerRespSalesPersonnelNumber,DimensionDisplayValue,ProjectGroup',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));
            $projects = $projects->merge($data['value'] ?? []);
        }
        $projectById = $projects->keyBy('ProjectID');

        $sumsByProject = $this->projectAllTimeSums($projectIds, $to);

        $personnelNumbers = $projectById->pluck('WorkerRespSalesPersonnelNumber')->filter()->unique()->values();
        $workerNameByPersonnel = $this->workersByPersonnelNumbers($personnelNumbers, $to);

        $vouchers = $lines->pluck('LedgerVoucher')->filter()->unique()->values();
        $custTransByVoucher = $this->custTransactionsByVouchers($vouchers, $to);

        return $lines->map(function ($line) use ($projectByTrans, $projectById, $sumsByProject, $workerNameByPersonnel, $custTransByVoucher) {
            $projectId = $projectByTrans[$line['TransId']] ?? null;
            $project = $projectId ? $projectById->get($projectId) : null;
            if (! $project) {
                return null;
            }

            // DimensionDisplayValue: "-{Department}-200-{BusinessUnit}-{BUCode}-{Territory}--{ProjectID}-220"
            // (9 segment co dinh, verify khop tren nhieu department khac nhau — xem docs muc 3).
            // segment[1] = F2-Department goc F&O (vd "SEV"), segment[3] = BusinessUnit (vd "SS"/"NNC"/"B2B",
            // KHOP voi department dashboard/CRM dang dung) — dung segment[3] de loc/gom nhom, segment[1]/[5]
            // chi hien thi dung nguyen van cho khop cot Excel.
            $dim = explode('-', $project['DimensionDisplayValue'] ?? '');

            $salesPrice = (float) ($line['SalesPrice'] ?? 0);
            $lineAmount = (float) ($line['LineAmount'] ?? 0);
            $sfAmount = $salesPrice - $lineAmount;
            $personnel = $project['WorkerRespSalesPersonnelNumber'] ?? '';
            $ct = $custTransByVoucher->get($line['LedgerVoucher'] ?? '');
            $sums = $sumsByProject->get($projectId, ['sales_price' => 0.0, 'sf' => 0.0]);

            return [
                'source' => 'onaccount',
                'invoice_number' => $line['ProjInvoiceId'] ?? '',
                'ledger_voucher' => $line['LedgerVoucher'] ?? '',
                'last_settle_voucher' => $ct['LastSettleVoucher'] ?? '',
                'invoice_date' => $line['InvoiceDate'] ?? '',
                'amount_included' => $salesPrice,
                'sf_amount' => $sfAmount,
                'amount_excluded' => $lineAmount,
                'sf_percent' => $salesPrice > 0 ? round($sfAmount / $salesPrice * 100, 1) : 0.0,
                'salesman_id' => $personnel,
                'salesman' => $workerNameByPersonnel->get($personnel, ''),
                'department' => strtoupper($dim[3] ?? ''),
                'f2_department' => strtoupper($dim[1] ?? ''),
                'sales_channel' => strtoupper($dim[5] ?? ''),
                'project' => $projectId,
                'project_name' => $project['ProjectName'] ?? '',
                'so_number' => '',
                'customer_account' => $project['CustomerAccount'] ?? '',
                'service_type' => self::PROJECT_GROUP_LABELS[$project['ProjectGroup'] ?? ''] ?? ($project['ProjectGroup'] ?? ''),
                'sum_project_sales_price' => $sums['sales_price'],
                'sum_project_sf' => $sums['sf'],
                'is_settled' => $this->isSettled($ct),
            ];
        })->filter()->values();
    }

    // Luong SO-Invoice (NNC, 1 it Service): SalesInvoiceHeadersV4.SalesOrderNumber -> SalesOrderHeadersV2
    // (co san field ABDimDepartment/ABDimTerritory truc tiep, khong can parse DimensionDisplayValue).
    private function soInvoiceDetailRows(Carbon $from, Carbon $to): Collection
    {
        $invoices = collect($this->erp->getAll('SalesInvoiceHeadersV4', [
            '$select' => 'InvoiceNumber,InvoiceDate,LedgerVoucher,SalesOrderNumber,SalesOrderResponsiblePersonnelNumber,TotalInvoiceAmount,InvoiceCustomerAccountNumber',
            '$filter' => $this->dateFilter('InvoiceDate', $from, $to),
        ]))->filter(fn ($i) => ! empty($i['SalesOrderNumber']));

        if ($invoices->isEmpty()) {
            return collect();
        }

        $soNumbers = $invoices->pluck('SalesOrderNumber')->unique()->values();
        $soByNumber = collect();
        foreach ($soNumbers->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($so) => "SalesOrderNumber eq '{$so}'")->implode(' or ');
            $data = $this->erp->get('SalesOrderHeadersV2', [
                '$select' => 'SalesOrderNumber,ABDimDepartment,ABDimTerritory',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));

            foreach ($data['value'] ?? [] as $so) {
                $soByNumber[$so['SalesOrderNumber']] = $so;
            }
        }

        $personnelNumbers = $invoices->pluck('SalesOrderResponsiblePersonnelNumber')->filter()->unique()->values();
        $workerNameByPersonnel = $this->workersByPersonnelNumbers($personnelNumbers, $to);

        $vouchers = $invoices->pluck('LedgerVoucher')->filter()->unique()->values();
        $custTransByVoucher = $this->custTransactionsByVouchers($vouchers, $to);

        return $invoices->map(function ($inv) use ($soByNumber, $workerNameByPersonnel, $custTransByVoucher) {
            $so = $soByNumber->get($inv['SalesOrderNumber']);
            if (! $so) {
                return null;
            }

            $personnel = $inv['SalesOrderResponsiblePersonnelNumber'] ?? '';
            $ct = $custTransByVoucher->get($inv['LedgerVoucher'] ?? '');
            $amount = (float) ($inv['TotalInvoiceAmount'] ?? 0);

            return [
                'source' => 'so_invoice',
                'invoice_number' => $inv['InvoiceNumber'] ?? '',
                'ledger_voucher' => $inv['LedgerVoucher'] ?? '',
                'last_settle_voucher' => $ct['LastSettleVoucher'] ?? '',
                'invoice_date' => $inv['InvoiceDate'] ?? '',
                'amount_included' => $amount,
                'sf_amount' => 0.0,
                'amount_excluded' => $amount,
                'sf_percent' => 0.0,
                'salesman_id' => $personnel,
                'salesman' => $workerNameByPersonnel->get($personnel, ''),
                'department' => strtoupper($so['ABDimDepartment'] ?? ''),
                'f2_department' => strtoupper($so['ABDimDepartment'] ?? ''),
                'sales_channel' => strtoupper($so['ABDimTerritory'] ?? ''),
                'project' => '',
                'project_name' => '',
                'so_number' => $inv['SalesOrderNumber'] ?? '',
                'customer_account' => $inv['InvoiceCustomerAccountNumber'] ?? '',
                'service_type' => '',
                'sum_project_sales_price' => null,
                'sum_project_sf' => null,
                'is_settled' => $this->isSettled($ct),
            ];
        })->filter()->values();
    }

    // Sum Project Sales Price trong Excel Sale = cong don TOAN BO lich su cac giao dich OnAccount cua
    // 1 project (khong gioi han theo ky dang xem, ke ca milestone CHUA len hoa don) — verify PI26070140:
    // 8.470.000 (chua invoice) + 1.210.000 (da invoice) = 9.680.000 khop chinh xac. Vi vay phai dung
    // ProjectPostTransViews.TotalSalesAmount (co du milestone chua invoice) — KHONG join qua
    // DocumentProjInvoiceOnAccLines (chi chua dong DA len hoa don, se thieu cac milestone con lai).
    // "Sum Project SF" chua tim duoc nguon rieng tach SF khoi tong nay — de 0 (khop 100% du lieu that
    // da verify, SF Amount = 0 o moi dong hien tai).
    private function projectAllTimeSums(Collection $projectIds, Carbon $to): Collection
    {
        if ($projectIds->isEmpty()) {
            return collect();
        }

        $sums = collect();
        foreach ($projectIds->chunk(15) as $chunk) {
            $filter = '('.$chunk->map(fn ($id) => "ProjectId eq '{$id}'")->implode(' or ').") and TransactionType eq Microsoft.Dynamics.DataEntities.ProjTransType'OnAccount'";
            $data = $this->erp->get('ProjectPostTransViews', [
                '$select' => 'ProjectId,TotalSalesAmount',
                '$filter' => $filter,
            ], ttl: 86400);

            foreach ($data['value'] ?? [] as $r) {
                $pid = $r['ProjectId'];
                $prev = $sums->get($pid, ['sales_price' => 0.0, 'sf' => 0.0]);
                $sums[$pid] = ['sales_price' => $prev['sales_price'] + (float) ($r['TotalSalesAmount'] ?? 0), 'sf' => 0.0];
            }
        }

        return $sums;
    }

    private function workersByPersonnelNumbers(Collection $personnelNumbers, Carbon $to): Collection
    {
        $names = collect();
        foreach ($personnelNumbers->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($n) => "PersonnelNumber eq '{$n}'")->implode(' or ');
            $data = $this->erp->get('Workers', [
                '$select' => 'PersonnelNumber,Name',
                '$filter' => $filter,
            ], ttl: 86400);

            foreach ($data['value'] ?? [] as $w) {
                $names[$w['PersonnelNumber']] = $w['Name'] ?? '';
            }
        }

        return $names;
    }

    // Join theo Voucher (khong phai Invoice) de chac chan chi lay dung dong giao dich hoa don goc —
    // filter theo Invoice tra ve ca cac dong but toan doi ung thanh toan/settle, gay nhieu dong trung.
    private function custTransactionsByVouchers(Collection $vouchers, Carbon $to): Collection
    {
        $result = collect();
        foreach ($vouchers->chunk(15) as $chunk) {
            $filter = $chunk->map(fn ($v) => "Voucher eq '{$v}'")->implode(' or ');
            $data = $this->erp->get('CustTransactions', [
                '$select' => 'Voucher,LastSettleVoucher,Closed',
                '$filter' => $filter,
            ], ttl: $this->ttl($to));

            foreach ($data['value'] ?? [] as $row) {
                $result[$row['Voucher']] = $row;
            }
        }

        return $result;
    }

    // Closed = "1900-01-01" la sentinel "chua settle" cua F&O — Closed co ngay that (> nam 1900)
    // nghia la giao dich da duoc doi ung/settle voi 1 khoan thanh toan.
    private function isSettled(?array $ct): bool
    {
        $closed = $ct['Closed'] ?? null;
        if (! $closed) {
            return false;
        }

        return Carbon::parse($closed)->year > 1900;
    }

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
