<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'slug',
        'cat',
        'price',
        'mrp',
        'img',
        'images',
        'stock',
        'rating',
        'reviews',
        'blurb',
        'specs',
        'active',
    ];

    protected $casts = [
        'price' => 'float',
        'mrp' => 'float',
        'stock' => 'integer',
        'rating' => 'float',
        'reviews' => 'integer',
        'active' => 'boolean',
        'images' => 'array',
        'specs' => 'array',
    ];

    public function cartItems()
    {
        return $this->hasMany(CartItem::class);
    }

    public function wishlistItems()
    {
        return $this->hasMany(WishlistItem::class);
    }
}
