<?php

namespace App\Http\Controllers;

use App\Models\CartItem;
use App\Models\Order;
use App\Models\Product;
use App\Support\OrderEmailNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function createRazorpayOrder(Request $request)
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'order_number' => ['nullable', 'string', 'max:40'],
        ]);

        $key = config('services.razorpay.key');
        $secret = config('services.razorpay.secret');

        if (!$key || !$secret) {
            return response()->json([
                'success' => false,
                'message' => 'Online payment is temporarily unavailable. Please contact support.',
            ], 503);
        }

        $amountInPaise = (int) round((float) $validated['amount'] * 100);

        try {
            $response = Http::connectTimeout(5)
                ->timeout(15)
                ->withBasicAuth($key, $secret)
                ->post('https://api.razorpay.com/v1/orders', [
                    'amount' => $amountInPaise,
                    'currency' => 'INR',
                    'receipt' => $validated['order_number'] ?? 'LT-' . Str::upper(Str::random(12)),
                ]);
        } catch (\Throwable $exception) {
            Log::error('Razorpay order creation request failed.', [
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Could not start payment. Please try again.',
            ], 502);
        }

        if (!$response->successful() || !is_string($response->json('id'))) {
            Log::error('Razorpay rejected the order creation request.', [
                'http_status' => $response->status(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Could not start payment. Please try again or contact support.',
            ], 502);
        }

        return response()->json([
            'success' => true,
            'razorpay_order_id' => $response->json('id'),
            'amount' => $amountInPaise,
            'currency' => 'INR',
            'key' => $key,
        ]);
    }

    public function verifyPayment(Request $request, OrderEmailNotifier $emailNotifier)
    {
        $validated = $request->validate([
            'order_number' => ['required', 'string', 'max:40'],
            'razorpay_payment_id' => ['required', 'string', 'max:255'],
            'razorpay_order_id' => ['required', 'string', 'max:255'],
            'razorpay_signature' => ['required', 'string', 'max:255'],
        ]);

        $order = Order::where('order_number', $validated['order_number'])->first();
        if (!$order) {
            return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
        }

        if ($order->payment_status === 'Paid') {
            return response()->json([
                'success' => true,
                'message' => 'Payment was already verified.',
                'order' => $order->load('items'),
            ]);
        }

        $key = config('services.razorpay.key');
        $secret = config('services.razorpay.secret');
        if (!$key || !$secret) {
            return response()->json([
                'success' => false,
                'message' => 'Payment verification is temporarily unavailable. Contact support before retrying payment.',
            ], 503);
        }

        if (
            !$order->razorpay_order_id
            || !hash_equals((string) $order->razorpay_order_id, $validated['razorpay_order_id'])
        ) {
            return response()->json(['success' => false, 'message' => 'Payment order does not match this order.'], 400);
        }

        $expectedSignature = hash_hmac(
            'sha256',
            $validated['razorpay_order_id'] . '|' . $validated['razorpay_payment_id'],
            $secret,
        );

        if (!hash_equals($expectedSignature, $validated['razorpay_signature'])) {
            return response()->json(['success' => false, 'message' => 'Payment signature verification failed.'], 400);
        }

        try {
            $paymentResponse = Http::connectTimeout(5)
                ->timeout(15)
                ->withBasicAuth($key, $secret)
                ->get('https://api.razorpay.com/v1/payments/' . rawurlencode($validated['razorpay_payment_id']));
        } catch (\Throwable $exception) {
            Log::error('Razorpay payment verification request failed.', [
                'order_number' => $order->order_number,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Could not verify payment right now. Please contact support before retrying.',
            ], 502);
        }

        if (!$paymentResponse->successful()) {
            Log::error('Razorpay could not confirm the payment.', [
                'order_number' => $order->order_number,
                'http_status' => $paymentResponse->status(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Could not verify payment right now. Please contact support before retrying.',
            ], 502);
        }

        $payment = $paymentResponse->json();
        if (!is_array($payment)) {
            Log::error('Razorpay returned an invalid payment response.', [
                'order_number' => $order->order_number,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Could not verify payment right now. Please contact support before retrying.',
            ], 502);
        }

        $expectedAmount = (int) round((float) $order->total * 100);
        if (
            ($payment['status'] ?? null) !== 'captured'
            || ($payment['currency'] ?? null) !== 'INR'
            || (int) ($payment['amount'] ?? 0) !== $expectedAmount
            || ($payment['order_id'] ?? null) !== $order->razorpay_order_id
            || ($payment['id'] ?? null) !== $validated['razorpay_payment_id']
        ) {
            Log::warning('Razorpay payment details did not match the order.', [
                'order_number' => $order->order_number,
                'payment_status' => $payment['status'] ?? null,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Payment is not captured for the correct order amount. Contact support if money was debited.',
            ], 400);
        }

        $order->update([
            'payment_status' => 'Paid',
            'payment_ref' => $validated['razorpay_payment_id'],
            'razorpay_payment_id' => $validated['razorpay_payment_id'],
            'status' => 'Order Confirmed',
        ]);

        foreach ($order->items as $item) {
            $product = Product::find($item->product_id);
            if ($product) {
                $product->decrement('stock', min($product->stock, $item->qty));
            }
        }

        $userId = Auth::id() ?: $order->user_id;
        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();
        if ($userId) {
            CartItem::where('user_id', $userId)->delete();
        } else {
            CartItem::where('session_id', $sessionId)->delete();
        }

        $emailNotifier->send($order);

        return response()->json([
            'success' => true,
            'message' => 'Payment verified successfully.',
            'order' => $order->load('items'),
        ]);
    }
}
