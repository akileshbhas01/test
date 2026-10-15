<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\CartItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    public function createRazorpayOrder(Request $request)
    {
        $amount = (float) $request->input('amount', 0);
        $orderNumber = $request->input('order_number', 'ORD-' . strtoupper(uniqid()));
        $key = env('RAZORPAY_KEY', 'rzp_test_nHZf320qihdDBv');
        $secret = env('RAZORPAY_SECRET', '');

        $amountInPaise = (int) round($amount * 100);

        if (!empty($key) && !empty($secret)) {
            try {
                $response = Http::withBasicAuth($key, $secret)
                    ->post('https://api.razorpay.com/v1/orders', [
                        'amount' => $amountInPaise,
                        'currency' => 'INR',
                        'receipt' => (string) $orderNumber,
                        'payment_capture' => 1,
                    ]);

                if ($response->successful()) {
                    $razorpayOrder = $response->json();
                    return response()->json([
                        'success' => true,
                        'razorpay_order_id' => $razorpayOrder['id'],
                        'amount' => $amountInPaise,
                        'currency' => 'INR',
                        'key' => $key,
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('Razorpay Order API error: ' . $e->getMessage());
            }
        }

        // Test fallback order ID for test key
        return response()->json([
            'success' => true,
            'razorpay_order_id' => 'order_test_' . substr(md5(uniqid()), 0, 14),
            'amount' => $amountInPaise,
            'currency' => 'INR',
            'key' => $key,
        ]);
    }

    public function verifyPayment(Request $request)
    {
        $orderNumber = $request->input('order_number');
        $paymentId = $request->input('razorpay_payment_id');
        $razorpayOrderId = $request->input('razorpay_order_id');
        $signature = $request->input('razorpay_signature');

        $order = Order::where('order_number', $orderNumber)->first();
        if (!$order) {
            return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
        }

        $secret = env('RAZORPAY_SECRET', '');
        $verified = true;

        if (!empty($secret) && !empty($signature) && !empty($razorpayOrderId)) {
            $generatedSignature = hash_hmac('sha256', $razorpayOrderId . '|' . $paymentId, $secret);
            if ($generatedSignature !== $signature) {
                $verified = false;
            }
        }

        if (!$verified) {
            $order->update([
                'payment_status' => 'Failed',
            ]);
            return response()->json(['success' => false, 'message' => 'Payment verification failed.'], 400);
        }

        $order->update([
            'payment_status' => 'Paid',
            'payment_ref' => $paymentId,
            'razorpay_order_id' => $razorpayOrderId,
            'razorpay_payment_id' => $paymentId,
            'status' => 'Order Confirmed',
        ]);

        // Decrement stock for purchased products
        foreach ($order->items as $item) {
            $prod = Product::find($item->product_id);
            if ($prod) {
                $prod->decrement('stock', min($prod->stock, $item->qty));
            }
        }

        // Clear user/session cart
        $userId = Auth::id() ?: $order->user_id;
        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();
        if ($userId) {
            CartItem::where('user_id', $userId)->delete();
        } else {
            CartItem::where('session_id', $sessionId)->delete();
        }

        // Send separate emails for Customer (Thank you) and Admin (New Order Alert)
        try {
            $order->load('items');
            $customerEmail = !empty($order->customer_email) ? trim($order->customer_email) : null;
            if (!empty($customerEmail)) {
                \Illuminate\Support\Facades\Mail::to($customerEmail)
                    ->send(new \App\Mail\OrderConfirmationMail($order));
                Log::info("Customer confirmation email sent for #{$order->order_number} to {$customerEmail}");
            }

            // Dedicated Admin notification email
            $adminEmails = array_values(array_unique(array_filter([
                'lemurratraders@gmail.com',
                'admin@lemurra.in',
                env('MAIL_FROM_ADDRESS', 'ezhil.sujee@gmail.com')
            ])));

            if (!empty($adminEmails)) {
                \Illuminate\Support\Facades\Mail::to($adminEmails[0])
                    ->cc(array_slice($adminEmails, 1))
                    ->send(new \App\Mail\AdminOrderNotificationMail($order));
                Log::info("Admin new order notification email sent for #{$order->order_number}");
            }
        } catch (\Exception $e) {
            Log::error('Order email sending failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Payment verified successfully',
            'order' => $order->load('items'),
        ]);
    }
}
