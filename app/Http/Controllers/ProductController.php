<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $query = Product::where('active', true);

        if ($request->filled('cat') && $request->cat !== 'All') {
            $query->where('cat', $request->cat);
        }

        if ($request->filled('q')) {
            $q = $request->q;
            $query->where(function($sub) use ($q) {
                $sub->where('name', 'like', "%{$q}%")
                    ->orWhere('blurb', 'like', "%{$q}%")
                    ->orWhere('id', 'like', "%{$q}%")
                    ->orWhere('cat', 'like', "%{$q}%");
            });
        }

        $sort = $request->input('sort', 'default');
        if ($sort === 'price-asc') {
            $query->orderBy('price', 'asc');
        } elseif ($sort === 'price-desc') {
            $query->orderBy('price', 'desc');
        } elseif ($sort === 'rating') {
            $query->orderBy('rating', 'desc');
        }

        $products = $query->get();

        return response()->json([
            'success' => true,
            'products' => $products,
        ]);
    }

    public function show($id)
    {
        $product = Product::where('id', $id)
            ->orWhere('slug', $id)
            ->firstOrFail();

        return response()->json([
            'success' => true,
            'product' => $product,
        ]);
    }
}
