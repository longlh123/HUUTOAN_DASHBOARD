<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    protected $fillable = [
        'lookup_code', 'invoice_number', 'invoice_symbol', 'template_code',
        'issue_date', 'signed_date',
        'seller_name', 'seller_tax_code', 'seller_address',
        'buyer_name', 'buyer_tax_code',
        'payment_method', 'currency',
        'total_before_tax', 'total_tax', 'total_discount', 'total_payment', 'total_payment_words',
        'content_summary', 'note', 'source_zip', 'raw_xml',
    ];

    protected function casts(): array
    {
        return [
            'issue_date'  => 'date',
            'signed_date' => 'date',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }
}
