<?php

namespace App\Services\Sharepoint;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

class SharepointApiService
{
    public function __construct(private SharepointTokenService $tokenService) {}

    private function client(): PendingRequest
    {
        return Http::withToken($this->tokenService->getToken())
            ->baseUrl('https://graph.microsoft.com/v1.0/')
            ->timeout(30);
    }

    /**
     * Upload 1 file vao folder cau hinh san (graph.invoice_folder) trong thu vien mac dinh cua site.
     * Chi dung cho file nho (<4MB, khop voi invoice.xml) — upload truc tiep 1 request PUT,
     * khong can upload session (dung cho file lon hon).
     */
    public function uploadInvoiceFile(string $fileName, string $content, string $contentType = 'application/xml'): array
    {
        $siteId = config('graph.site_id');
        $path = collect(explode('/', config('graph.invoice_folder')))
            ->map(fn ($seg) => rawurlencode($seg))
            ->implode('/');
        $name = rawurlencode($fileName);
        $url = "sites/{$siteId}/drive/root:/{$path}/{$name}:/content";

        $response = $this->client()->withBody($content, $contentType)->put($url);

        if ($response->unauthorized()) {
            $this->tokenService->forceRefresh();
            $response = $this->client()->withBody($content, $contentType)->put($url);
        }

        $response->throw();

        return $response->json();
    }
}
