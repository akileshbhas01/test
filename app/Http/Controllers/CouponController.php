<?php

namespace App\Http\Controllers;

use App\Models\Coupon;
use Illuminate\Http\Request;

class CouponController extends Controller
{
    public function index()
    {
        $coupons = Coupon::where('active', true)->get();
        return response()->json([
            'success' => true,
            'coupons' => $coupons
        ]);
    }

    public function apply(Request $request)
    {
        $code = strtoupper(trim((string) $request->input('code', '')));
        $subtotal = (float) $request->input('subtotal', 0);

        if (empty($code)) {
            return response()->json([
                'success' => false,
                'message' => 'Please enter a coupon code.'
            ], 422);
        }

        $coupon = Coupon::whereRaw('UPPER(code) = ?', [$code])
            ->where('active', true)
            ->first();

        if (!$coupon) {
            return response()->json([
                'success' => false,
                'message' => "Coupon code '{$code}' is invalid or expired."
            ], 422);
        }

        if ($subtotal > 0 && $subtotal < $coupon->min) {
            return response()->json([
                'success' => false,
                'message' => "This code applies on orders of ₹{$coupon->min} or more."
            ], 422);
        }

        $discount = 0;
        if ($coupon->type === 'pct') {
            $discount = ($subtotal * $coupon->value) / 100;
            if ($coupon->max > 0 && $discount > $coupon->max) {
                $discount = $coupon->max;
            }
        } else {
            $discount = $coupon->value;
        }

        $discount = min($discount, $subtotal);

        return response()->json([
            'success' => true,
            'message' => "Coupon '{$coupon->code}' applied successfully!",
            'coupon' => [
                'code' => $coupon->code,
                'type' => $coupon->type,
                'value' => (float) $coupon->value,
                'min' => (float) $coupon->min,
                'max' => (float) $coupon->max,
                'discount' => round($discount, 2),
                'note' => $coupon->note,
            ]
        ]);
    }
}
