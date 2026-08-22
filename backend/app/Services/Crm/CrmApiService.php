<?php

namespace App\Services\Crm;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class CrmApiService
{
    private string $apiVersion = 'v9.2';

    public function __construct(private CrmTokenService $tokenService) {}

    private function client(): PendingRequest
    {
        return Http::withToken($this->tokenService->getToken())
            ->baseUrl(config('crm.base_url') . "/api/data/{$this->apiVersion}/")
            ->withHeaders([
                'OData-MaxVersion' => '4.0',
                'OData-Version'    => '4.0',
                'Accept'           => 'application/json',
                'Prefer'           => 'odata.include-annotations="*"',
            ]);
    }

    /**
     * GET /api/data/v9.2/{entity}
     *
     * @param  array<string, string>  $params  OData query params ($select, $filter, $top, ...)
     * @param  int  $ttl  Cache TTL in seconds (0 = no cache)
     */
    public function get(string $entity, array $params = [], int $ttl = 0): array
    {
        if ($ttl > 0) {
            $cacheKey = 'crm:' . md5($entity . serialize($params));
            return Cache::remember($cacheKey, $ttl, fn () => $this->fetch($entity, $params));
        }

        return $this->fetch($entity, $params);
    }

    /**
     * Fetch tất cả records bằng cách follow @odata.nextLink (server-driven paging).
     * Không dùng $top — thay bằng Prefer: odata.maxpagesize=5000 để D365 trả nextLink.
     * Trả về mảng flat của tất cả records.
     */
    public function getAll(string $entity, array $params = [], int $pageSize = 5000): array
    {
        $all = [];

        $response = $this->fetchPaged($entity, $params, $pageSize);
        $all      = array_merge($all, $response['value'] ?? []);

        while (!empty($response['@odata.nextLink'])) {
            $response = $this->fetchAbsolute($response['@odata.nextLink'], $pageSize);
            $all      = array_merge($all, $response['value'] ?? []);
        }

        return $all;
    }

    private function fetchPaged(string $entity, array $params, int $pageSize): array
    {
        $response = Http::withToken($this->tokenService->getToken())
            ->baseUrl(config('crm.base_url') . "/api/data/{$this->apiVersion}/")
            ->withHeaders([
                'OData-MaxVersion' => '4.0',
                'OData-Version'    => '4.0',
                'Accept'           => 'application/json',
                'Prefer'           => 'odata.include-annotations="*",odata.maxpagesize=' . $pageSize,
            ])
            ->get($entity, $params);

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = Http::withToken($this->tokenService->getToken())
                ->baseUrl(config('crm.base_url') . "/api/data/{$this->apiVersion}/")
                ->withHeaders([
                    'OData-MaxVersion' => '4.0',
                    'OData-Version'    => '4.0',
                    'Accept'           => 'application/json',
                    'Prefer'           => 'odata.include-annotations="*",odata.maxpagesize=' . $pageSize,
                ])
                ->get($entity, $params);
        }

        $response->throw();
        return $response->json();
    }

    private function fetchAbsolute(string $url, int $pageSize = 5000): array
    {
        $response = Http::withToken($this->tokenService->getToken())
            ->withHeaders([
                'OData-MaxVersion' => '4.0',
                'OData-Version'    => '4.0',
                'Accept'           => 'application/json',
                'Prefer'           => 'odata.include-annotations="*",odata.maxpagesize=' . $pageSize,
            ])
            ->get($url);

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = Http::withToken($this->tokenService->getToken())
                ->withHeaders([
                    'OData-MaxVersion' => '4.0',
                    'OData-Version'    => '4.0',
                    'Accept'           => 'application/json',
                    'Prefer'           => 'odata.include-annotations="*",odata.maxpagesize=' . $pageSize,
                ])
                ->get($url);
        }

        $response->throw();
        return $response->json();
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

    public function post(string $entity, array $body): string
    {
        $response = $this->clientWrite()->post($entity, $body);

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = $this->clientWrite()->post($entity, $body);
        }

        $response->throw();

        preg_match('/\(([a-f0-9\-]{36})\)$/i', $response->header('OData-EntityId'), $m);

        return $m[1] ?? '';
    }

    public function patch(string $entity, string $id, array $body): void
    {
        $response = $this->clientWrite()->patch("{$entity}({$id})", $body);

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = $this->clientWrite()->patch("{$entity}({$id})", $body);
        }

        $response->throw();
    }

    public function forget(string $entity, array $params): void
    {
        Cache::forget('crm:' . md5($entity . serialize($params)));
    }

    // Fetch D365 metadata (option sets, entity definitions) — cache dài vì ít thay đổi
    public function getMetadata(string $path, array $params = [], int $ttl = 86400): array
    {
        $cacheKey = 'crm_meta:' . md5($path . serialize($params));
        return Cache::remember($cacheKey, $ttl, function () use ($path, $params) {
            $client = Http::withToken($this->tokenService->getToken())
                ->baseUrl(config('crm.base_url') . "/api/data/{$this->apiVersion}/")
                ->withHeaders([
                    'OData-MaxVersion' => '4.0',
                    'OData-Version'    => '4.0',
                    'Accept'           => 'application/json',
                ]);

            $response = $client->get($path, $params);

            if ($response->unauthorized()) {
                $this->tokenService->forceRefresh();
                $response = Http::withToken($this->tokenService->getToken())
                    ->baseUrl(config('crm.base_url') . "/api/data/{$this->apiVersion}/")
                    ->withHeaders([
                        'OData-MaxVersion' => '4.0',
                        'OData-Version'    => '4.0',
                        'Accept'           => 'application/json',
                    ])
                    ->get($path, $params);
            }

            $response->throw();
            return $response->json();
        });
    }

    public function delete(string $entity, string $id): void
    {
        $response = $this->clientWrite()->delete("{$entity}({$id})");

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = $this->clientWrite()->delete("{$entity}({$id})");
        }

        $response->throw();
    }

    // Xoá giá trị 1 single-valued navigation property (vd lookup field) — PATCH voi
    // gia tri null khong hop le trong Dataverse, phai DELETE thang vao {property}/$ref.
    public function deleteRef(string $entity, string $id, string $navigationProperty): void
    {
        $response = $this->clientWrite()->delete("{$entity}({$id})/{$navigationProperty}/\$ref");

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = $this->clientWrite()->delete("{$entity}({$id})/{$navigationProperty}/\$ref");
        }

        $response->throw();
    }

    private function clientWrite(): PendingRequest
    {
        return Http::withToken($this->tokenService->getToken())
            ->baseUrl(config('crm.base_url') . "/api/data/{$this->apiVersion}/")
            ->withHeaders([
                'OData-MaxVersion' => '4.0',
                'OData-Version'    => '4.0',
                'Accept'           => 'application/json',
            ]);
    }
}