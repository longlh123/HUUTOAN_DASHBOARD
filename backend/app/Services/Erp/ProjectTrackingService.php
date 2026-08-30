<?php

namespace App\Services\Erp;

use App\Services\Crm\CrmApiService;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * Theo doi hoat dong du an B2B — xem docs/sales-crm-backlog-tracking.md (thao luan "dong thoi gian
 * du an"). Da verify: khong co field "% hoan thanh"/"giai doan"/"ngay bat dau-ket thuc thuc te" nao
 * dang tin duoc trong CRM (`ab_project_contract.ab_amount` rong 100%) lan F&O (`ProjectStage` chi la
 * nhan generic "User1"/"User2", `ActualStartDate`/`ActualEndDate` la sentinel 1900-01-01) — nen KHONG
 * tinh %/giai doan chinh thuc. Chi dung 2 thu dang tin: `ab_erp_status_code` (trang thai tho, dong bo
 * that tu F&O) va lich su giao dich tren `ProjectPostTransViews` (Item/Cost/OnAccount) de suy ra
 * "hoat dong gan nhat" — du an lau khong co giao dich moi = tin hieu can chu y.
 */
class ProjectTrackingService
{
    // Gia tri optionset ab_erp_status_code — xac nhan qua tinker (khong doan), xem CLAUDE.md.
    private const STATUS_CODES = [
        'Created' => '500000000',
        'Estimated' => '500000001',
        'In Process' => '500000002',
        'Closed' => '500000005',
        'Warranty' => '500000006',
    ];

    public function __construct(
        private ErpApiService $erp,
        private CrmApiService $crm,
    ) {}

    /**
     * Danh sach du an theo department + trang thai (mac dinh "In Process"), sap xep theo hoat dong
     * gan nhat (lau nhat len dau) de du an co the dang bi tac noi bat len truoc. Cross-reference F&O
     * 1 lan cho toan bo du an (chunk 15 ma/request) — khong goi rieng tung du an, tranh lap lai van
     * de cham nhu erp_synced_deals.
     */
    public function list(string $department = 'B2B', string $status = 'In Process'): Collection
    {
        // Cache::remember luu PLAIN ARRAY (khong phai Collection) — cache Collection qua database
        // store gap loi unserialize() ra __PHP_Incomplete_Class o lan doc lai thu 2 tro di.
        $rows = Cache::remember("project_tracking:list:{$department}:{$status}", 900, function () use ($department, $status) {
            $projects = $this->fetchProjectsByStatus($department, $status);
            if ($projects->isEmpty()) {
                return [];
            }

            $codes = $projects->pluck('code')->all();
            $activity = $this->fetchActivitySummary($codes);

            return $projects->map(function ($p) use ($activity) {
                $a = $activity[$p['code']] ?? null;
                $lastDate = $a['last_date'] ?? null;
                // Mot so giao dich (vd milestone da len lich nhung chua toi ngay) co TransactionDate
                // trong tuong lai — clamp ve 0 de tranh hien "-N ngay" vo nghia tren UI.
                $daysSince = $lastDate ? max(0, (int) round(Carbon::parse($lastDate)->diffInDays(now()))) : null;

                return [
                    ...$p,
                    'revenue_to_date' => $a['revenue'] ?? 0.0,
                    'cost_to_date' => $a['cost'] ?? 0.0,
                    'last_activity_at' => $lastDate,
                    'days_since_activity' => $daysSince,
                ];
            })->sortBy(fn ($p) => $p['last_activity_at'] ?? '0000-00-00')->values()->all();
        });

        return collect($rows);
    }

    /**
     * Dong thoi gian giao dich cua 1 du an, kem thong tin dau bai (khach hang, phu trach, gia tri
     * bao gia — CHI de tham khao quy mo, khong dung tinh %, xem ghi chu class-level).
     */
    public function timeline(string $projectCode): array
    {
        $project = $this->fetchProjectHeader($projectCode);

        $rows = $this->erp->getAll('ProjectPostTransViews', [
            '$select' => 'ProjectId,TransactionDate,TransactionType,TransactionOrigin,CategoryId,TotalSalesAmount,TotalCostAmount,VendorName,ResourceName,ItemId',
            '$filter' => "ProjectId eq '{$projectCode}'",
        ]);

        // OnAccount = doanh thu, dung TotalSalesAmount. Cost (nhan cong/thau phu) va Item (xuat vat tu)
        // deu la gia von — dung TotalCostAmount. TotalSalesAmount tren dong Item thuong la 0 (dac biet
        // FGS-Finished Goods) nen KHONG dung duoc cho gia von, du truoc day nham lay field nay.
        $transactions = collect($rows)
            ->map(fn ($r) => [
                'date' => substr($r['TransactionDate'] ?? '', 0, 10),
                'type' => $r['TransactionType'] ?? '',
                'origin' => $r['TransactionOrigin'] ?? '',
                'category' => $r['CategoryId'] ?? '',
                'amount' => $r['TransactionType'] === 'OnAccount'
                    ? (float) ($r['TotalSalesAmount'] ?? 0)
                    : (float) ($r['TotalCostAmount'] ?? 0),
                'who' => $r['VendorName'] ?: ($r['ResourceName'] ?: null),
                'item' => $r['ItemId'] ?: null,
            ])
            ->sortBy('date')
            ->values();

        return [
            'project' => $project,
            'totals' => [
                'revenue' => $transactions->where('type', 'OnAccount')->sum('amount'),
                'material_cost' => $transactions->where('type', 'Item')->sum('amount'),
                'labor_cost' => $transactions->where('type', 'Cost')->sum('amount'),
            ],
            'transactions' => $transactions,
        ];
    }

    private function fetchProjectsByStatus(string $department, string $status): Collection
    {
        $statusCode = self::STATUS_CODES[$status] ?? self::STATUS_CODES['In Process'];

        $rows = $this->crm->getAll('ab_projects', [
            '$select' => 'ab_name,ab_description,_ab_customer_id_value,_ab_sales_owner_id_value,ab_start_date,ab_erp_status_code,_ab_dim_department_id_value',
            '$filter' => 'ab_erp_status_code eq '.$statusCode,
        ]);

        return collect($rows)
            ->filter(fn ($r) => ($r['_ab_dim_department_id_value@OData.Community.Display.V1.FormattedValue'] ?? '') === $department)
            ->map(fn ($r) => [
                'code' => $r['ab_name'],
                'description' => $r['ab_description'] ?? '',
                'customer' => $r['_ab_customer_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'owner' => $r['_ab_sales_owner_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
                'status' => $r['ab_erp_status_code@OData.Community.Display.V1.FormattedValue'] ?? '',
                'start_date' => $r['ab_start_date'] ? substr($r['ab_start_date'], 0, 10) : null,
            ])
            ->values();
    }

    private function fetchProjectHeader(string $projectCode): array
    {
        $data = $this->crm->get('ab_projects', [
            '$select' => 'ab_name,ab_description,_ab_customer_id_value,_ab_sales_owner_id_value,ab_start_date,ab_erp_status_code,_ab_quote_id_value',
            '$filter' => "ab_name eq '{$projectCode}'",
        ]);
        $r = $data['value'][0] ?? null;
        if (! $r) {
            return ['code' => $projectCode, 'description' => '', 'customer' => '', 'owner' => '', 'status' => '', 'start_date' => null, 'quote_amount' => null];
        }

        $quoteAmount = null;
        if (! empty($r['_ab_quote_id_value'])) {
            $q = $this->crm->get('quotes', [
                '$select' => 'totalamount',
                '$filter' => "quoteid eq {$r['_ab_quote_id_value']}",
            ]);
            $quoteAmount = isset($q['value'][0]['totalamount']) ? (float) $q['value'][0]['totalamount'] : null;
        }

        return [
            'code' => $r['ab_name'],
            'description' => $r['ab_description'] ?? '',
            'customer' => $r['_ab_customer_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            'owner' => $r['_ab_sales_owner_id_value@OData.Community.Display.V1.FormattedValue'] ?? '',
            'status' => $r['ab_erp_status_code@OData.Community.Display.V1.FormattedValue'] ?? '',
            'start_date' => $r['ab_start_date'] ? substr($r['ab_start_date'], 0, 10) : null,
            'quote_amount' => $quoteAmount,
        ];
    }

    /** @return array<string, array{revenue: float, cost: float, last_date: ?string}> */
    private function fetchActivitySummary(array $projectCodes): array
    {
        $summary = [];

        foreach (array_chunk($projectCodes, 15) as $chunk) {
            $filter = implode(' or ', array_map(fn ($c) => "ProjectId eq '{$c}'", $chunk));
            $rows = $this->erp->getAll('ProjectPostTransViews', [
                '$select' => 'ProjectId,TransactionDate,TransactionType,TotalSalesAmount,TotalCostAmount',
                '$filter' => "({$filter})",
            ]);

            foreach ($rows as $r) {
                $code = $r['ProjectId'] ?? '';
                if ($code === '') {
                    continue;
                }

                $summary[$code] ??= ['revenue' => 0.0, 'cost' => 0.0, 'last_date' => null];

                $date = substr($r['TransactionDate'] ?? '', 0, 10);
                if ($date && ($summary[$code]['last_date'] === null || $date > $summary[$code]['last_date'])) {
                    $summary[$code]['last_date'] = $date;
                }

                if (($r['TransactionType'] ?? '') === 'OnAccount') {
                    $summary[$code]['revenue'] += (float) ($r['TotalSalesAmount'] ?? 0);
                } elseif (in_array($r['TransactionType'] ?? '', ['Cost', 'Item'], true)) {
                    // Gop chung gia von vat tu (Item) + chi phi nhan cong/dich vu (Cost) thanh 1 tong
                    // cho bang danh sach — xem chi tiet tach rieng o trang timeline tung du an.
                    $summary[$code]['cost'] += (float) ($r['TotalCostAmount'] ?? 0);
                }
            }
        }

        return $summary;
    }
}
