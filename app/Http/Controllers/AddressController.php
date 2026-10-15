<?php

namespace App\Http\Controllers;

use App\Models\Address;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AddressController extends Controller
{
    public function index()
    {
        if (!Auth::check()) {
            return response()->json(['success' => false, 'addresses' => []], 401);
        }

        return response()->json([
            'success' => true,
            'addresses' => Auth::user()->addresses
        ]);
    }

    public function store(Request $request)
    {
        if (!Auth::check()) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'required|string|max:20',
            'line1' => 'required|string|max:255',
            'city' => 'required|string|max:100',
            'state' => 'required|string|max:100',
            'pin' => 'required|string|max:10',
        ]);

        $user = Auth::user();

        $isDefault = $request->boolean('is_default', false) || $user->addresses()->count() === 0;

        if ($isDefault) {
            $user->addresses()->update(['is_default' => false]);
        }

        if ($request->filled('id')) {
            $address = $user->addresses()->where('id', $request->id)->first();
            if ($address) {
                $address->update([
                    'name' => $request->name,
                    'phone' => $request->phone,
                    'line1' => $request->line1,
                    'line2' => $request->line2,
                    'city' => $request->city,
                    'state' => $request->state,
                    'pin' => $request->pin,
                    'label' => $request->input('label', 'Home'),
                    'is_default' => $isDefault,
                ]);
            }
        } else {
            $address = $user->addresses()->create([
                'name' => $request->name,
                'phone' => $request->phone,
                'line1' => $request->line1,
                'line2' => $request->line2,
                'city' => $request->city,
                'state' => $request->state,
                'pin' => $request->pin,
                'label' => $request->input('label', 'Home'),
                'is_default' => $isDefault,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Address saved successfully',
            'address' => $address,
            'addresses' => $user->addresses()->get()
        ]);
    }

    public function destroy($id)
    {
        if (!Auth::check()) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        $address = Auth::user()->addresses()->where('id', $id)->first();
        if ($address) {
            $address->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Address deleted successfully',
            'addresses' => Auth::user()->addresses()->get()
        ]);
    }
}
