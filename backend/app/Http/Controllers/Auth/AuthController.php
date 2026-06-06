<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Traits\ApiResponse;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    use ApiResponse;

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return $this->error('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng', 401);
        }

        $token = $user->createToken('dashboard')->plainTextToken;

        return $this->success([
            'token' => $token,
            'user'  => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'territory'  => $user->territory,
                'department' => $user->department,
                'is_admin'   => $user->is_admin,
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return $this->success(null);
    }
}
