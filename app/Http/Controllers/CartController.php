<?php

namespace App\Http\Controllers;

use App\Models\CartItem;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CartController extends Controller
{
    private function getCartQuery(Request $request)
    {
        if (Auth::check()) {
            return CartItem::where('user_id', Auth::id());
        }

        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();
        return CartItem::where('session_id', $sessionId);
    }

    public function index(Request $request)
    {
        $items = $this->getCartQuery($request)->with('product')->get();

        $cart = $items->map(function ($item) {
            return [
                'id' => $item->product_id,
                'qty' => $item->qty,
                'custom' => $item->custom,
                'product' => $item->product,
            ];
        });

        return response()->json([
            'success' => true,
            'cart' => $cart
        ]);
    }

    public function add(Request $request)
    {
        $productId = $request->input('id');
        $qty = max(1, (int) $request->input('qty', 1));
        $custom = $request->input('custom');

        $product = Product::where('id', $productId)->first();
        if (!$product) {
            return response()->json(['success' => false, 'message' => 'Product not found'], 404);
        }

        $userId = Auth::id();
        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();

        $itemQuery = $userId
            ? CartItem::where('user_id', $userId)->where('product_id', $productId)
            : CartItem::where('session_id', $sessionId)->where('product_id', $productId);

        $item = $itemQuery->first();

        if ($item) {
            $item->qty += $qty;
            if ($custom) {
                $item->custom = $custom;
            }
            $item->save();
        } else {
            CartItem::create([
                'user_id' => $userId,
                'session_id' => $userId ? null : $sessionId,
                'product_id' => $productId,
                'qty' => $qty,
                'custom' => $custom,
            ]);
        }

        return $this->index($request);
    }

    public function update(Request $request)
    {
        $productId = $request->input('id');
        $qty = (int) $request->input('qty', 1);
        $custom = $request->input('custom');

        $query = $this->getCartQuery($request)->where('product_id', $productId);
        $item = $query->first();

        if ($item) {
            if ($qty <= 0) {
                $item->delete();
            } else {
                $item->qty = $qty;
                if ($request->has('custom')) {
                    $item->custom = $custom;
                }
                $item->save();
            }
        }

        return $this->index($request);
    }

    public function remove(Request $request)
    {
        $productId = $request->input('id');
        $this->getCartQuery($request)->where('product_id', $productId)->delete();

        return $this->index($request);
    }

    public function clear(Request $request)
    {
        $this->getCartQuery($request)->delete();

        return response()->json([
            'success' => true,
            'cart' => []
        ]);
    }

    public function sync(Request $request)
    {
        $incoming = $request->input('cart', []);
        $userId = Auth::id();
        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();

        if (is_array($incoming)) {
            foreach ($incoming as $item) {
                $pId = $item['id'] ?? null;
                $qty = (int) ($item['qty'] ?? 1);
                $custom = $item['custom'] ?? null;

                if (!$pId) continue;

                $existing = $userId
                    ? CartItem::where('user_id', $userId)->where('product_id', $pId)->first()
                    : CartItem::where('session_id', $sessionId)->where('product_id', $pId)->first();

                if ($existing) {
                    $existing->qty = max($existing->qty, $qty);
                    if ($custom) $existing->custom = $custom;
                    $existing->save();
                } else {
                    CartItem::create([
                        'user_id' => $userId,
                        'session_id' => $userId ? null : $sessionId,
                        'product_id' => $pId,
                        'qty' => $qty,
                        'custom' => $custom,
                    ]);
                }
            }
        }

        return $this->index($request);
    }
}
