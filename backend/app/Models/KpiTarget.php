<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KpiTarget extends Model
{
    protected $table = 'kpi_member_targets';

    protected $fillable = [
        'crm_user_id',
        'user_name',
        'year',
        'q1',
        'q2',
        'q3',
        'q4',
    ];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'q1'   => 'integer',
            'q2'   => 'integer',
            'q3'   => 'integer',
            'q4'   => 'integer',
        ];
    }
}
