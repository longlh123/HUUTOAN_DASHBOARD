<?php

namespace App\Services\Invoice;

use App\Models\Invoice;
use App\Services\Sharepoint\SharepointApiService;
use Carbon\Carbon;
use DOMDocument;
use DOMNode;
use DOMXPath;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use ZipArchive;

class InvoiceImportService
{
    public function __construct(private SharepointApiService $sharepoint) {}

    /**
     * @param  array<int, string>  $zipPaths  Duong dan tam cua tung file zip da upload
     * @param  array<int, string>  $originalNames  Ten file goc, dung de bao loi de doc
     * @return array{imported: int, duplicate: int, errors: array<int, string>}
     */
    public function importZips(array $zipPaths, array $originalNames = []): array
    {
        $imported = 0;
        $duplicate = 0;
        $errors = [];

        foreach ($zipPaths as $i => $zipPath) {
            $originalName = $originalNames[$i] ?? basename($zipPath);

            try {
                $xmlContent = $this->extractInvoiceXml($zipPath);
                if ($xmlContent === null) {
                    $errors[] = "{$originalName}: không tìm thấy invoice.xml trong file zip";

                    continue;
                }

                $result = $this->storeFromXml($xmlContent, $originalName);
                $result === 'duplicate' ? $duplicate++ : $imported++;
            } catch (\Throwable $e) {
                $errors[] = "{$originalName}: {$e->getMessage()}";
            }
        }

        return ['imported' => $imported, 'duplicate' => $duplicate, 'errors' => $errors];
    }

    private function extractInvoiceXml(string $zipPath): ?string
    {
        $zip = new ZipArchive;
        if ($zip->open($zipPath) !== true) {
            throw new \RuntimeException('Không mở được file zip');
        }

        $xmlContent = $zip->getFromName('invoice.xml');
        $zip->close();

        return $xmlContent !== false ? $xmlContent : null;
    }

    /** @return 'created'|'duplicate' */
    private function storeFromXml(string $xmlContent, string $sourceZip): string
    {
        $doc = new DOMDocument;
        if (! $doc->loadXML($xmlContent)) {
            throw new \RuntimeException('Nội dung XML không hợp lệ');
        }
        $xp = new DOMXPath($doc);

        $lookupCode = $this->nullableStr($this->xval($xp, '//*[local-name()="MCCQT"]'));
        $invoiceNumber = $this->nullableStr($this->xval($xp, '//*[local-name()="SHDon"]'));
        $sellerTaxCode = $this->nullableStr($this->xval($xp, '//*[local-name()="NBan"]/*[local-name()="MST"]'));

        // Dedup: uu tien ma tra cuu CQT (MCCQT) — do CQT sinh ra, dam bao duy nhat.
        // Fallback ve (so HD + MST ban) neu vi ly do nao do khong co MCCQT.
        $existing = $lookupCode
            ? Invoice::where('lookup_code', $lookupCode)->exists()
            : Invoice::where('invoice_number', $invoiceNumber)->where('seller_tax_code', $sellerTaxCode)->exists();

        if ($existing) {
            return 'duplicate';
        }

        $itemRows = [];
        $itemNames = [];
        foreach ($xp->query('//*[local-name()="DSHHDVu"]/*[local-name()="HHDVu"]') as $node) {
            $name = $this->nullableStr($this->xval($xp, './*[local-name()="THHDVu"]', $node));
            if ($name) {
                $itemNames[] = $name;
            }

            $itemRows[] = [
                'line_no' => $this->toInt($this->xval($xp, './*[local-name()="STT"]', $node)),
                'item_code' => $this->nullableStr($this->xval($xp, './*[local-name()="MHHDVu"]', $node)),
                'item_name' => $name,
                'unit' => $this->nullableStr($this->xval($xp, './*[local-name()="DVTinh"]', $node)),
                'quantity' => $this->toDecimal($this->xval($xp, './*[local-name()="SLuong"]', $node)),
                'unit_price' => $this->toDecimal($this->xval($xp, './*[local-name()="DGia"]', $node)),
                'discount_rate' => $this->toDecimal($this->xval($xp, './*[local-name()="TLCKhau"]', $node)),
                'discount_amount' => $this->toDecimal($this->xval($xp, './*[local-name()="STCKhau"]', $node)),
                'amount' => $this->toDecimal($this->xval($xp, './*[local-name()="ThTien"]', $node)),
                'tax_rate' => $this->nullableStr($this->xval($xp, './*[local-name()="TSuat"]', $node)),
            ];
        }

        DB::transaction(function () use ($xp, $lookupCode, $invoiceNumber, $sellerTaxCode, $itemRows, $itemNames, $sourceZip, $xmlContent, &$invoice) {
            $invoice = Invoice::create([
                'lookup_code' => $lookupCode,
                'invoice_number' => $invoiceNumber,
                'invoice_symbol' => $this->nullableStr($this->xval($xp, '//*[local-name()="KHHDon"]')),
                'template_code' => $this->nullableStr($this->xval($xp, '//*[local-name()="KHMSHDon"]')),
                'issue_date' => $this->parseDate($this->xval($xp, '//*[local-name()="NLap"]')),
                'signed_date' => $this->parseSignedDate($xp),
                'seller_name' => $this->nullableStr($this->xval($xp, '//*[local-name()="NBan"]/*[local-name()="Ten"]')),
                'seller_tax_code' => $sellerTaxCode,
                'seller_address' => $this->nullableStr($this->xval($xp, '//*[local-name()="NBan"]/*[local-name()="DChi"]')),
                'buyer_name' => $this->nullableStr($this->xval($xp, '//*[local-name()="NMua"]/*[local-name()="Ten"]')),
                'buyer_tax_code' => $this->nullableStr($this->xval($xp, '//*[local-name()="NMua"]/*[local-name()="MST"]')),
                'payment_method' => $this->nullableStr($this->xval($xp, '//*[local-name()="HTTToan"]')),
                'currency' => $this->nullableStr($this->xval($xp, '//*[local-name()="DVTTe"]')),
                'total_before_tax' => $this->toDecimal($this->xval($xp, '//*[local-name()="TgTCThue"]')),
                'total_tax' => $this->toDecimal($this->xval($xp, '//*[local-name()="TgTThue"]')),
                'total_discount' => $this->toDecimal($this->xval($xp, '//*[local-name()="TTCKTMai"]')),
                'total_payment' => $this->toDecimal($this->xval($xp, '//*[local-name()="TgTTTBSo"]')),
                'total_payment_words' => $this->nullableStr($this->xval($xp, '//*[local-name()="TgTTTBChu"]')),
                'content_summary' => implode('; ', $itemNames),
                'source_zip' => $sourceZip,
                'raw_xml' => $xmlContent,
            ]);

            foreach ($itemRows as $row) {
                $invoice->items()->create($row);
            }
        });

        $this->uploadToSharepoint($invoice, $xmlContent);

        return 'created';
    }

    // Upload la hanh dong phu (archive cho Finance) — khong duoc lam fail buoc import chinh
    // (invoice da luu DB thanh cong roi), chi log lai neu loi.
    private function uploadToSharepoint(Invoice $invoice, string $xmlContent): void
    {
        if (! $invoice->issue_date || ! $invoice->seller_tax_code || ! $invoice->invoice_number) {
            Log::warning("Invoice #{$invoice->id}: thieu issue_date/seller_tax_code/invoice_number, bo qua upload SharePoint");

            return;
        }

        $fileName = sprintf(
            '%s-%s-%s.xml',
            $invoice->issue_date->format('Ymd'),
            $invoice->seller_tax_code,
            $invoice->invoice_number,
        );

        try {
            $this->sharepoint->uploadInvoiceFile($fileName, $xmlContent);
        } catch (\Throwable $e) {
            Log::warning("Invoice #{$invoice->id}: upload SharePoint that bai — {$e->getMessage()}");
        }
    }

    // Ngay ky = SigningTime trong chu ky cua Co Quan Thue (<CQT>) — xac nhan hoa don da duoc CQT cap ma,
    // khac voi ngay ky cua ben ban (<NBan>). Fallback ve SigningTime cuoi cung neu khong tim thay <CQT>.
    private function parseSignedDate(DOMXPath $xp): ?string
    {
        $t = $this->xval($xp, '//*[local-name()="CQT"]//*[local-name()="SigningTime"]');
        if ($t === '') {
            $t = $this->xval($xp, '(//*[local-name()="SigningTime"])[last()]');
        }

        return $this->parseDate($t);
    }

    private function xval(DOMXPath $xp, string $query, ?DOMNode $context = null): string
    {
        $nodes = $context ? $xp->query($query, $context) : $xp->query($query);
        if (! $nodes || $nodes->length === 0) {
            return '';
        }

        return trim($nodes->item(0)->textContent);
    }

    private function parseDate(?string $value): ?string
    {
        if (! $value) {
            return null;
        }
        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    private function toDecimal(?string $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        // TSuat co the la "8%" — nhung field nay chi dung cho cac cot so tien/so luong, khong dung cho TSuat
        return (float) str_replace(['%', ','], '', $value);
    }

    private function toInt(?string $value): ?int
    {
        return ($value === null || $value === '') ? null : (int) $value;
    }

    private function nullableStr(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
