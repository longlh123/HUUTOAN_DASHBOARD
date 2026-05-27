<?php

namespace App\Http\Controllers\Traits;

use Illuminate\Http\JsonResponse;

trait ApiResponse
{
    protected function success(mixed $data, array $meta = [], int $status = 200): JsonResponse
    {
        $payload = ['data' => $data];

        if (!empty($meta)) {
            $payload['meta'] = $meta;
        }

        return response()->json($payload, $status);
    }

    protected function error(string $error, string $message, int $status = 500): JsonResponse
    {
        return response()->json([
            'error'   => $error,
            'message' => $message,
            'code'    => $status,
        ], $status);
    }
}