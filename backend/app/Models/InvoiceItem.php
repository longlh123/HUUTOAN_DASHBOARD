<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceItem extends Model
{
    protected $fillable = [
        'invoice_id', 'line_no', 'item_code', 'item_name', 'unit',
        'quantity', 'unit_price', 'discount_rate', 'discount_amount', 'amount', 'tax_rate',
    ];

    protected function casts(): array
    {
        return [
            'quantity'         => 'decimal:4',
            'unit_price'       => 'decimal:4',
            'discount_rate'    => 'decimal:4',
            'discount_amount'  => 'decimal:2',
            'amount'           => 'decimal:2',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
