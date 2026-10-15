<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Coupon;
use App\Models\CartItem;
use App\Models\User;
use App\Support\OrderEmailNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class OrderController extends Controller
{
    public function create(Request $request, OrderEmailNotifier $emailNotifier)
    {
        $request->validate([
            'items' => 'required|array|min:1',
            'shipping_address' => 'required|array',
            'payment_method' => 'required|in:cod,razorpay',
            'razorpay_order_id' => 'required_if:payment_method,razorpay|nullable|string|max:255',
        ]);

        $rawItems = $request->input('items', []);
        $shippingAddr = $request->input('shipping_address');
        $couponCode = strtoupper(trim($request->input('coupon_code', '')));
        $method = $request->input('payment_method', 'razorpay');
        $note = $request->input('note');

        $userId = Auth::id();
        $user = Auth::user();

        $subtotal = 0;
        $orderItemsData = [];
        $orderItemsSummary = [];

        foreach ($rawItems as $item) {
            $pId = $item['id'] ?? null;
            $qty = max(1, (int) ($item['qty'] ?? 1));
            $custom = $item['custom'] ?? null;

            $product = Product::find($pId);
            if (!$product) {
                return response()->json([
                    'success' => false,
                    'message' => "Product {$pId} not found."
                ], 404);
            }

            if ($product->stock < $qty) {
                return response()->json([
                    'success' => false,
                    'message' => "Item '{$product->name}' only has {$product->stock} in stock."
                ], 422);
            }

            $lineTotal = $product->price * $qty;
            $subtotal += $lineTotal;

            $orderItemsData[] = [
                'product_id' => $product->id,
                'name' => $product->name,
                'price' => $product->price,
                'qty' => $qty,
                'img' => $product->img,
                'custom' => $custom,
            ];

            $orderItemsSummary[] = [
                'id' => $product->id,
                'name' => $product->name,
                'qty' => $qty,
                'price' => $product->price,
                'img' => $product->img,
            ];
        }

        // Calculate discount
        $discount = 0;
        if (!empty($couponCode)) {
            $coupon = Coupon::whereRaw('UPPER(code) = ?', [$couponCode])->where('active', true)->first();
            if ($coupon && $subtotal >= $coupon->min) {
                if ($coupon->type === 'pct') {
                    $discount = ($subtotal * $coupon->value) / 100;
                    if ($coupon->max > 0 && $discount > $coupon->max) {
                        $discount = $coupon->max;
                    }
                } else {
                    $discount = $coupon->value;
                }
                $discount = min($discount, $subtotal);
                $couponCode = $coupon->code;
            } else {
                $couponCode = null;
            }
        } else {
            $couponCode = null;
        }

        $discount = round($discount, 2);

        // Free gift condition (Orders >= 899 get free speaker)
        $freeGift = $subtotal >= 899 ? 'speaker' : null;

        // Shipping (Free delivery across India)
        $shipping = 0;

        $total = max(0, $subtotal - $discount + $shipping);

        // Generate clean Order Number e.g. LT-67891
        $orderNumber = 'LT-' . strtoupper(Str::random(6));

        $customerEmail = $request->input('customer_email') ?: ($shippingAddr['email'] ?? ($user ? $user->email : null));
        $customerName = $request->input('customer_name') ?: ($shippingAddr['name'] ?? ($user ? $user->name : 'Customer'));
        $customerPhone = $request->input('customer_phone') ?: ($shippingAddr['phone'] ?? ($user ? $user->phone : ''));

        if (!$userId && !empty($customerEmail)) {
            $foundUser = User::where('email', strtolower(trim($customerEmail)))->first();
            if ($foundUser) {
                $userId = $foundUser->id;
                $user = $foundUser;
            }
        }

        $order = Order::create([
            'order_number' => $orderNumber,
            'user_id' => $userId,
            'customer_name' => $customerName,
            'customer_email' => $customerEmail ?: ($user ? $user->email : 'order@lemurra.in'),
            'customer_phone' => $customerPhone,
            'shipping_address' => $shippingAddr,
            'items_summary' => $orderItemsSummary,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'shipping' => $shipping,
            'total' => $total,
            'coupon_code' => $couponCode,
            'free_gift' => $freeGift,
            'payment_method' => $method,
            'payment_status' => $method === 'cod' ? 'Pay on delivery' : 'Pending',
            'razorpay_order_id' => $method === 'razorpay' ? $request->input('razorpay_order_id') : null,
            'status' => $method === 'cod' ? 'Order Confirmed' : 'Payment Pending',
            'note' => $note,
        ]);

        foreach ($orderItemsData as $itemData) {
            $order->items()->create($itemData);
        }

        // If COD, clear cart and reduce stock immediately, and send order emails
        if ($method === 'cod') {
            foreach ($orderItemsData as $itemData) {
                $prod = Product::find($itemData['product_id']);
                if ($prod) {
                    $prod->decrement('stock', min($prod->stock, $itemData['qty']));
                }
            }

            $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();
            if ($userId) {
                CartItem::where('user_id', $userId)->delete();
            } else {
                CartItem::where('session_id', $sessionId)->delete();
            }

            $emailNotifier->send($order);
        }

        return response()->json([
            'success' => true,
            'message' => 'Order created successfully',
            'order' => $order->load('items'),
        ]);
    }

    public function show($orderNumber)
    {
        $cleanId = preg_replace('/^ORD-/i', '', (string) $orderNumber);
        $cleanLT = preg_replace('/^LT-/i', '', (string) $orderNumber);

        $order = Order::with(['items', 'user'])
            ->where(function ($q) use ($orderNumber, $cleanId, $cleanLT) {
                $q->where('order_number', $orderNumber)
                  ->orWhere('order_number', 'LT-' . $cleanLT)
                  ->orWhere('order_number', $cleanLT);
                if (is_numeric($orderNumber)) {
                    $q->orWhere('id', (int) $orderNumber);
                }
                if (is_numeric($cleanId)) {
                    $q->orWhere('id', (int) $cleanId);
                }
            })
            ->first();

        if (!$order) {
            return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
        }

        return response()->json([
            'success' => true,
            'order' => $order
        ]);
    }

    public function userOrders(Request $request)
    {
        $user = Auth::user();

        if (!$user) {
            $token = $request->bearerToken()
                ?: $request->header('X-Auth-Token')
                ?: $request->input('auth_token')
                ?: $request->cookie('lem_token');

            if (!empty($token)) {
                $user = User::where('remember_token', $token)->first();
                if ($user) {
                    Auth::login($user, true);
                }
            }
        }

        if (!$user) {
            return response()->json(['success' => true, 'orders' => []]);
        }

        $userId = $user->id;
        $userEmail = strtolower(trim((string) $user->email));

        $orders = Order::with('items')
            ->where(function ($q) use ($userId, $userEmail) {
                $q->where('user_id', $userId);
                if (!empty($userEmail)) {
                    $q->orWhere(function ($sub) use ($userEmail) {
                        $sub->whereNull('user_id')
                            ->where('customer_email', $userEmail);
                    });
                }
            })
            ->latest()
            ->get();

        foreach ($orders as $ord) {
            if (!$ord->user_id) {
                $ord->update(['user_id' => $userId]);
            }
        }

        return response()->json([
            'success' => true,
            'orders' => $orders
        ]);
    }

    public function printInvoice($orderNumber)
    {
        $cleanId = preg_replace('/^ORD-/i', '', (string) $orderNumber);
        $cleanLT = preg_replace('/^LT-/i', '', (string) $orderNumber);

        $order = Order::with('items')
            ->where(function ($q) use ($orderNumber, $cleanId, $cleanLT) {
                $q->where('order_number', $orderNumber)
                  ->orWhere('order_number', 'LT-' . $cleanLT)
                  ->orWhere('order_number', $cleanLT);
                if (is_numeric($orderNumber)) {
                    $q->orWhere('id', (int) $orderNumber);
                }
                if (is_numeric($cleanId)) {
                    $q->orWhere('id', (int) $cleanId);
                }
            })
            ->first();

        if (!$order) {
            if (Auth::check()) {
                $order = Order::with('items')->where('user_id', Auth::id())->latest()->first();
            }
            if (!$order) {
                $order = Order::with('items')->latest()->first();
            }
        }

        if (!$order) {
            abort(404, 'Invoice not found');
        }

        return view('invoice', compact('order'));
    }
}
