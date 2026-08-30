<?php

namespace App\Services\Sharepoint;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class SharepointTokenService
{
    public function getToken(): string
    {
        return Cache::remember('graph_access_token', 3000, function () {
            $response = Http::asForm()->post(config('graph.token_url'), [
                'grant_type' => 'client_credentials',
                'client_id' => config('graph.client_id'),
                'client_secret' => config('graph.client_secret'),
                'scope' => config('graph.scope'),
            ]);

            if ($response->failed()) {
                throw new \RuntimeException('Graph auth failed: '.$response->body());
            }

            return $response->json('access_token');
        });
    }

    // Dung khi can force refresh (token bi revoke, ...)
    public function forceRefresh(): string
    {
        Cache::forget('graph_access_token');

        return $this->getToken();
    }
}
