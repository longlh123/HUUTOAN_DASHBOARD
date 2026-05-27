<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnforceTerritory
{
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();

        if ($user && !$user->is_admin) {
            if ($user->territory) {
                $request->merge(['territory' => $user->territory]);
            }
            if ($user->department) {
                $request->merge(['department' => $user->department]);
            }
        }

        return $next($request);
    }
}
