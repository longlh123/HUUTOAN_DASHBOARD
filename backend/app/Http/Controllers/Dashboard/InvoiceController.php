<?php

namespace App\Http\Controllers\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Models\Invoice;
use App\Services\Invoice\InvoiceImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvoiceController extends Controller
{
    use ApiResponse;

    public function __construct(private InvoiceImportService $importer) {}

    public function index(Request $request): JsonResponse
    {
        // Khong select raw_xml o day — chi can khi xem chi tiet 1 hoa don, day la list nhieu dong
        $query = Invoice::query()
            ->select([
                'id', 'lookup_code', 'invoice_number', 'invoice_symbol',
                'issue_date', 'signed_date', 'seller_name', 'seller_tax_code',
                'content_summary', 'note', 'total_payment',
            ])
            ->orderByDesc('issue_date')->orderByDesc('id');

        if ($from = $request->query('from')) {
            $query->whereDate('issue_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->whereDate('issue_date', '<=', $to);
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('invoice_number', 'like', "%{$search}%")
                    ->orWhere('seller_name', 'like', "%{$search}%")
                    ->orWhere('seller_tax_code', 'like', "%{$search}%");
            });
        }

        $perPage = (int) $request->query('per_page', 20);
        $page    = $query->paginate($perPage);

        return $this->success($page->items(), [
            'total'        => $page->total(),
            'current_page' => $page->currentPage(),
            'last_page'    => $page->lastPage(),
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'files'   => 'required|array|min:1',
            'files.*' => 'file',
        ]);

        $paths = [];
        $names = [];
        foreach ($request->file('files') as $file) {
            if (strtolower($file->getClientOriginalExtension()) !== 'zip') continue;
            $paths[] = $file->getRealPath();
            $names[] = $file->getClientOriginalName();
        }

        return $this->success($this->importer->importZips($paths, $names));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $invoice = Invoice::findOrFail($id);
        $v = $request->validate(['note' => 'nullable|string']);
        $invoice->update($v);

        return $this->success(['id' => $invoice->id, 'note' => $invoice->note]);
    }
}
