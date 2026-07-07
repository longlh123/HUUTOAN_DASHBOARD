<?php

namespace App\Services\Erp;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ErpTokenService
{
    public function getToken(): string
    {
        return Cache::remember('erp_access_token', 3000, function () {
            $response = Http::asForm()->post(config('erp.token_url'), [
                'grant_type'    => 'client_credentials',
                'client_id'     => config('erp.client_id'),
                'client_secret' => config('erp.client_secret'),
                'scope'         => config('erp.scope'),
            ]);

            if ($response->failed()) {
                throw new \RuntimeException('ERP auth failed: ' . $response->body());
            }

            return $response->json('access_token');
        });
    }

    // Dung khi can force refresh (token bi revoke, ...)
    public function forceRefresh(): string
    {
        Cache::forget('erp_access_token');
        return $this->getToken();
    }
}
