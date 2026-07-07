<?php

namespace App\Services\Erp;

use Carbon\Carbon;
use Illuminate\Support\Collection;

class FinanceService
{
    private const TERRITORY_MAP = [
        'SOUTH'  => 'Miền Nam',
        'CENTER' => 'Miền Trung',
        'NORTH'  => 'Miền Bắc',
    ];

    // F&O tự phân loại khách hàng/NCC nội bộ qua CustomerGroupId="Internal c" / VendorGroupId="INT".
    // 200644 xác nhận là nội bộ qua kiểm tra thực tế nhưng lại bị gắn nhầm VendorGroupId="AP Other" (lỗi data phía F&O)
    // nên phải giữ thêm ngoại lệ thủ công này.
    private const EXTRA_INTERNAL_VENDOR_ACCOUNTS = [
        '200644', // CONG TY TNHH MTV HUU TOAN MIEN BAC — VendorGroupId sai, không phải "INT"
    ];

    public function __construct(private ErpApiService $api) {}

    public function summary(Carbon $from, Carbon $to, ?string $territory = null): array
    {
        $invoices = $this->filterByTerritory($this->fetchInvoices($from, $to), $territory);

        return [
            'total_revenue' => round($invoices->sum('total_amount')),
            'invoice_count' => $invoices->count(),
        ];
    }

    public function byPeriod(Carbon $from, Carbon $to, string $groupBy, ?string $territory = null): array
    {
        $invoices = $this->filterByTerritory($this->fetchInvoices($from, $to), $territory);

        return $invoices
            ->groupBy(fn ($inv) => $this->periodLabel($inv['invoice_date'], $groupBy))
            ->map(fn ($items, $period) => [
                'period' => $period,
                'value'  => round($items->sum('total_amount')),
                'count'  => $items->count(),
            ])
            ->sortBy('period')
            ->values()
            ->toArray();
    }

    private function fetchInvoices(Carbon $from, Carbon $to): Collection
    {
        $fromStr = $from->copy()->startOfDay()->utc()->format('Y-m-d\TH:i:s\Z');
        $toStr   = $to->copy()->endOfDay()->utc()->format('Y-m-d\TH:i:s\Z');

        $data = $this->api->getAll('SalesInvoiceHeadersV4', [
            '$select' => 'InvoiceNumber,InvoiceDate,TotalInvoiceAmount,InvoiceCustomerAccountNumber,InvoiceAddressState',
            '$filter' => "InvoiceDate ge {$fromStr} and InvoiceDate lt {$toStr}",
        ]);

        return collect($data)->map(fn ($inv) => [
            'invoice_number' => $inv['InvoiceNumber'] ?? '',
            'invoice_date'   => $inv['InvoiceDate'] ?? null,
            'total_amount'   => (float) ($inv['TotalInvoiceAmount'] ?? 0),
            'customer'       => $inv['InvoiceCustomerAccountNumber'] ?? '',
            'state'          => $inv['InvoiceAddressState'] ?? '',
        ]);
    }

    private function periodLabel(?string $date, string $groupBy): string
    {
        if (!$date) return 'unknown';
        $d = Carbon::parse($date);

        return match ($groupBy) {
            'quarter' => $d->year . '-Q' . $d->quarter,
            default   => $d->format('Y-m'),
        };
    }

    private function filterByTerritory(Collection $invoices, ?string $territory): Collection
    {
        if (!$territory || strtoupper($territory) === 'ALL') return $invoices;

        $label = self::TERRITORY_MAP[strtoupper($territory)] ?? null;
        if (!$label) return $invoices;

        return $invoices->filter(fn ($inv) => $inv['state'] === $label);
    }

    public function debtAging(): array
    {
        return [
            'ar' => $this->arAging(),
            'ap' => $this->apAging(),
        ];
    }

    // CustTransOpens chỉ chứa giao dịch CHƯA tất toán, AmountMST đã là số dư còn lại — không cần trừ settle amount
    private function arAging(): array
    {
        $trans = cache()->remember('erp:ar_open_trans', 300, fn () =>
            $this->api->getAll('CustTransOpens', [
                '$select' => 'AccountNum,TransDate,DueDate,AmountMST',
            ])
        );

        $directory = $this->fetchCustomerDirectory(collect($trans)->pluck('AccountNum')->filter()->unique()->values()->toArray());

        return $this->mapAging($trans, $directory, fn ($t) => (float) ($t['AmountMST'] ?? 0));
    }

    // VendTransBiEntities chứa TẤT CẢ giao dịch (đã/chưa tất toán) — lọc Closed = null-date để lấy giao dịch còn mở,
    // và số dư còn lại = AmountMST - SettleAmountMST (khác CustTransOpens vì đây không phải bảng "open" riêng)
    private function apAging(): array
    {
        $trans = cache()->remember('erp:ap_open_trans', 300, fn () =>
            $this->api->getAll('VendTransBiEntities', [
                '$select' => 'AccountNum,Txt,TransDate,DueDate,AmountMST,SettleAmountMST',
                '$filter' => 'Closed eq 1900-01-01T00:00:00Z',
            ])
        );

        $directory = $this->fetchVendorDirectory(collect($trans)->pluck('AccountNum')->filter()->unique()->values()->toArray());

        return $this->mapAging($trans, $directory, fn ($t) => (float) ($t['AmountMST'] ?? 0) - (float) ($t['SettleAmountMST'] ?? 0));
    }

    /**
     * @param  array<string, array{name: string, internal: bool}>  $directory
     */
    private function mapAging(array $trans, array $directory, \Closure $resolveAmount): array
    {
        $todayTs = strtotime('today');

        return collect($trans)
            ->reject(fn ($t) => $directory[$t['AccountNum'] ?? '']['internal'] ?? false)
            ->map(fn ($t) => [$t, $resolveAmount($t)])
            ->filter(fn ($pair) => abs($pair[1]) > 0.01)
            ->map(function ($pair) use ($directory, $todayTs) {
                [$t, $amount] = $pair;
                $dueDate     = $t['DueDate'] ?? null;
                $daysOverdue = $dueDate ? (int) floor(($todayTs - strtotime($dueDate)) / 86400) : null;

                return [
                    'account_num'  => $t['AccountNum'] ?? '',
                    'name'         => $directory[$t['AccountNum'] ?? '']['name'] ?? ($t['AccountNum'] ?? ''),
                    'description'  => $t['Txt'] ?? '',
                    'trans_date'   => !empty($t['TransDate']) ? substr($t['TransDate'], 0, 10) : null,
                    'due_date'     => $dueDate ? substr($dueDate, 0, 10) : null,
                    'amount'       => $amount,
                    'days_overdue' => $daysOverdue,
                ];
            })
            ->sortByDesc('days_overdue')
            ->values()
            ->toArray();
    }

    /**
     * @return array<string, array{name: string, internal: bool}>
     */
    private function fetchCustomerDirectory(array $accountNumbers): array
    {
        if (empty($accountNumbers)) return [];

        $all = cache()->remember('erp:customers_master', 3600, fn () =>
            $this->api->getAll('CustomersV3', ['$select' => 'CustomerAccount,OrganizationName,CustomerGroupId'])
        );

        $accountSet = array_flip($accountNumbers);

        $directory = [];
        foreach ($all as $c) {
            if (isset($accountSet[$c['CustomerAccount']])) {
                $directory[$c['CustomerAccount']] = [
                    'name'     => $c['OrganizationName'] ?? $c['CustomerAccount'],
                    'internal' => ($c['CustomerGroupId'] ?? '') === 'Internal c',
                ];
            }
        }

        return $directory;
    }

    /**
     * @return array<string, array{name: string, internal: bool}>
     */
    private function fetchVendorDirectory(array $accountNumbers): array
    {
        if (empty($accountNumbers)) return [];

        $all = cache()->remember('erp:vendors_master', 3600, fn () =>
            $this->api->getAll('VendorsV2', ['$select' => 'VendorAccountNumber,VendorOrganizationName,VendorGroupId'])
        );

        $accountSet = array_flip($accountNumbers);

        $directory = [];
        foreach ($all as $v) {
            if (isset($accountSet[$v['VendorAccountNumber']])) {
                $directory[$v['VendorAccountNumber']] = [
                    'name'     => $v['VendorOrganizationName'] ?? $v['VendorAccountNumber'],
                    'internal' => ($v['VendorGroupId'] ?? '') === 'INT'
                        || in_array($v['VendorAccountNumber'], self::EXTRA_INTERNAL_VENDOR_ACCOUNTS, true),
                ];
            }
        }

        return $directory;
    }
}
