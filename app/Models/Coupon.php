<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Coupon extends Model
{
    protected $fillable = [
        'code',
        'type',
        'value',
        'min',
        'max',
        'active',
        'note',
    ];

    protected $casts = [
        'value' => 'float',
        'min' => 'float',
        'max' => 'float',
        'active' => 'boolean',
    ];
}
