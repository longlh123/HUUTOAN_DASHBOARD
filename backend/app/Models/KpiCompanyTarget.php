<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KpiCompanyTarget extends Model
{
    protected $fillable = [
        'year',
        'target_amount',
    ];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'target_amount' => 'integer',
        ];
    }
}
