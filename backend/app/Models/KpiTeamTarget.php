<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KpiTeamTarget extends Model
{
    protected $fillable = [
        'year',
        'team_id',
        'team_name',
        'q1',
        'q2',
        'q3',
        'q4',
    ];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'q1' => 'integer',
            'q2' => 'integer',
            'q3' => 'integer',
            'q4' => 'integer',
        ];
    }
}
