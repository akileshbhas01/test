<?php

namespace App\Http\Controllers;

use App\Models\WishlistItem;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WishlistController extends Controller
{
    private function getWishlistQuery(Request $request)
    {
        if (Auth::check()) {
            return WishlistItem::where('user_id', Auth::id());
        }

        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();
        return WishlistItem::where('session_id', $sessionId);
    }

    public function index(Request $request)
    {
        $ids = $this->getWishlistQuery($request)->pluck('product_id')->toArray();

        return response()->json([
            'success' => true,
            'wishlist' => $ids
        ]);
    }

    public function toggle(Request $request)
    {
        $productId = $request->input('id');
        $product = Product::where('id', $productId)->first();

        if (!$product) {
            return response()->json(['success' => false, 'message' => 'Product not found'], 404);
        }

        $userId = Auth::id();
        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();

        $itemQuery = $userId
            ? WishlistItem::where('user_id', $userId)->where('product_id', $productId)
            : WishlistItem::where('session_id', $sessionId)->where('product_id', $productId);

        $item = $itemQuery->first();
        $saved = false;

        if ($item) {
            $item->delete();
            $saved = false;
        } else {
            WishlistItem::create([
                'user_id' => $userId,
                'session_id' => $userId ? null : $sessionId,
                'product_id' => $productId,
            ]);
            $saved = true;
        }

        $ids = $this->getWishlistQuery($request)->pluck('product_id')->toArray();

        return response()->json([
            'success' => true,
            'saved' => $saved,
            'wishlist' => $ids
        ]);
    }

    public function sync(Request $request)
    {
        $incoming = $request->input('wishlist', []);
        $userId = Auth::id();
        $sessionId = $request->header('X-Session-Id') ?: $request->session()->getId();

        if (is_array($incoming)) {
            foreach ($incoming as $pId) {
                if (!$pId) continue;
                $exists = $userId
                    ? WishlistItem::where('user_id', $userId)->where('product_id', $pId)->exists()
                    : WishlistItem::where('session_id', $sessionId)->where('product_id', $pId)->exists();

                if (!$exists && Product::where('id', $pId)->exists()) {
                    WishlistItem::create([
                        'user_id' => $userId,
                        'session_id' => $userId ? null : $sessionId,
                        'product_id' => $pId,
                    ]);
                }
            }
        }

        return $this->index($request);
    }
}
