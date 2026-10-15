<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Address;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:6',
            'phone' => 'nullable|string|max:20',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors()
            ], 422);
        }

        $user = User::create([
            'name' => $request->name,
            'email' => strtolower(trim($request->email)),
            'password' => Hash::make($request->password),
            'phone' => $request->phone,
            'role' => 'customer',
        ]);

        Auth::login($user, true);

        if (empty($user->remember_token)) {
            $user->remember_token = bin2hex(random_bytes(30));
            $user->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Registration successful',
            'token' => $user->remember_token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'role' => $user->role,
                'addresses' => [],
            ],
            'is_admin' => false,
        ]);
    }

    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|string',
            'password' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        $email = strtolower(trim($request->email));
        $password = $request->password;

        // Try to authenticate by email
        $user = User::where('email', $email)->first();

        // Also allow admin to login via username if provided as "admin"
        if (!$user && $email === 'admin') {
            $user = User::where('email', 'admin@lemurra.in')->first();
        }

        if (!$user || !Hash::check($password, $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid email or password.'
            ], 401);
        }

        Auth::login($user, true);
        $user->load('addresses');

        if (empty($user->remember_token)) {
            $user->remember_token = bin2hex(random_bytes(30));
            $user->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Signed in successfully',
            'token' => $user->remember_token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'role' => $user->role,
                'addresses' => $user->addresses,
            ],
            'is_admin' => $user->isAdmin(),
        ]);
    }

    public function logout(Request $request)
    {
        $user = Auth::user();
        if ($user) {
            $user->remember_token = null;
            $user->save();
        }

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'success' => true,
            'message' => 'Signed out successfully'
        ])
        ->withCookie(cookie('lem_token', '', -1, '/'))
        ->withCookie(cookie('lem_email', '', -1, '/'))
        ->withCookie(cookie('lem_role', '', -1, '/'));
    }

    public function me(Request $request)
    {
        if (!Auth::check()) {
            $token = $request->header('X-Auth-Token') 
                ?: $request->bearerToken() 
                ?: $request->input('auth_token') 
                ?: $request->cookie('lem_token');

            if (!empty($token)) {
                $u = User::where('remember_token', $token)->first();
                if ($u) {
                    Auth::login($u, true);
                }
            }
        }

        if (Auth::check()) {
            $user = Auth::user();
            $user->load(['addresses', 'orders' => function($q) {
                $q->latest()->take(20);
            }]);

            if (empty($user->remember_token)) {
                $user->remember_token = bin2hex(random_bytes(30));
                $user->save();
            }

            return response()->json([
                'success' => true,
                'authenticated' => true,
                'token' => $user->remember_token,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => $user->phone,
                    'role' => $user->role,
                    'addresses' => $user->addresses,
                    'orders' => $user->orders,
                ],
                'is_admin' => $user->isAdmin(),
            ]);
        }

        return response()->json([
            'success' => true,
            'authenticated' => false,
            'user' => null,
            'is_admin' => false,
        ]);
    }

    public function updateProfile(Request $request)
    {
        if (!Auth::check()) {
            $token = $request->header('X-Auth-Token') 
                ?: $request->bearerToken() 
                ?: $request->input('auth_token') 
                ?: $request->cookie('lem_token');

            if (!empty($token)) {
                $u = User::where('remember_token', $token)->first();
                if ($u) {
                    Auth::login($u, true);
                }
            }
        }

        if (!Auth::check()) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated. Please sign in.'], 401);
        }

        $user = Auth::user();

        $request->validate([
            'name' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:6',
        ]);

        if ($request->filled('name')) {
            $user->name = trim($request->name);
        }

        if ($request->has('phone')) {
            $user->phone = trim($request->phone);
        }

        if ($request->filled('email')) {
            $newEmail = strtolower(trim($request->email));
            if ($newEmail !== strtolower($user->email)) {
                $user->email = $newEmail;
            }
        }

        if ($request->filled('password')) {
            $user->password = Hash::make($request->password);
        }

        $user->save();
        $user->load('addresses');

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'role' => $user->role,
                'addresses' => $user->addresses,
            ],
            'is_admin' => $user->isAdmin(),
        ]);
    }
}
