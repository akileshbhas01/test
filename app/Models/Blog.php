<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Blog extends Model
{
    protected $fillable = [
        'slug',
        'title',
        'date',
        'read_time',
        'tags',
        'snippet',
        'content',
        'cover',
    ];

    protected $casts = [
        'tags' => 'array',
    ];
}
