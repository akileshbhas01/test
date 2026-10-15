<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = [
        'order_number',
        'user_id',
        'customer_name',
        'customer_email',
        'customer_phone',
        'shipping_address',
        'items_summary',
        'subtotal',
        'discount',
        'shipping',
        'total',
        'coupon_code',
        'free_gift',
        'payment_method',
        'payment_status',
        'payment_ref',
        'razorpay_order_id',
        'razorpay_payment_id',
        'status',
        'tracking_number',
        'carrier',
        'note',
    ];

    protected $casts = [
        'shipping_address' => 'array',
        'items_summary' => 'array',
        'subtotal' => 'float',
        'discount' => 'float',
        'shipping' => 'float',
        'total' => 'float',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }
}
