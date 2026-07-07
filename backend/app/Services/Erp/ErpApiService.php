<?php

namespace App\Services\Erp;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ErpApiService
{
    public function __construct(private ErpTokenService $tokenService) {}

    private function client(): PendingRequest
    {
        return Http::withToken($this->tokenService->getToken())
            ->baseUrl(config('erp.base_url') . '/data/')
            ->timeout(60)
            ->withHeaders([
                'OData-MaxVersion' => '4.0',
                'OData-Version'    => '4.0',
                'Accept'           => 'application/json',
            ]);
    }

    /**
     * GET /data/{entity}
     *
     * @param  array<string, string>  $params  OData query params ($select, $filter, $top, ...)
     * @param  int  $ttl  Cache TTL in seconds (0 = no cache)
     */
    public function get(string $entity, array $params = [], int $ttl = 0): array
    {
        if ($ttl > 0) {
            $cacheKey = 'erp:' . md5($entity . serialize($params));
            return Cache::remember($cacheKey, $ttl, fn () => $this->fetch($entity, $params));
        }

        return $this->fetch($entity, $params);
    }

    /**
     * Fetch tat ca records bang $skip/$top chu dong.
     * Luu y: khi client tu truyen $top, F&O KHONG tra @odata.nextLink de tiep tuc nua
     * (khac voi khi khong truyen $top) — nen phai tu quan ly phan trang bang $skip.
     */
    public function getAll(string $entity, array $params = [], int $pageSize = 1000): array
    {
        $all  = [];
        $skip = 0;

        while (true) {
            $page    = $this->fetch($entity, $params + ['$top' => (string) $pageSize, '$skip' => (string) $skip]);
            $records = $page['value'] ?? [];
            $all     = array_merge($all, $records);

            if (count($records) < $pageSize) break;
            $skip += $pageSize;
        }

        return $all;
    }

    private function fetch(string $entity, array $params): array
    {
        $response = $this->client()->get($entity, $params);

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = $this->client()->get($entity, $params);
        }

        $response->throw();

        return $response->json();
    }
}
