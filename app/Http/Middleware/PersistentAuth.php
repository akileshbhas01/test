<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;

class PersistentAuth
{
    /**
     * Handle an incoming request.
     * Restores login session if cookies expired or client is using token authentication.
     */
    public function handle(Request $request, Closure $next)
    {
        // Never restore sessions when hitting logout endpoint
        if ($request->is('*/logout') || $request->is('logout')) {
            return $next($request);
        }

        if (!Auth::check()) {
            $token = $request->bearerToken()
                ?: $request->header('X-Auth-Token')
                ?: $request->input('auth_token')
                ?: $request->cookie('lem_token');

            if (!empty($token)) {
                $user = User::where('remember_token', $token)->first();
                if ($user) {
                    Auth::login($user, true);
                    return $next($request);
                }
            }
        }

        return $next($request);
    }
}
