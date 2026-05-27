<?php

namespace App\Services\Crm;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class CrmTokenService
{
    public function getToken(): string
    {
        return Cache::remember('crm_access_token', 3000, function () {
            $response = Http::asForm()->post(config('crm.token_url'), [
                'grant_type'    => 'client_credentials',
                'client_id'     => config('crm.client_id'),
                'client_secret' => config('crm.client_secret'),
                'scope'         => config('crm.scope'),
            ]);

            if ($response->failed()) {
                throw new \RuntimeException('CRM auth failed: ' . $response->body());
            }

            return $response->json('access_token');
        });
    }

    // Dùng khi cần force refresh (token bị revoke, ...)
    public function forceRefresh(): string
    {
        Cache::forget('crm_access_token');
        return $this->getToken();
    }
}