<?php

return [
    'tenant_id'     => env('AZURE_TENANT_ID'),
    'client_id'     => env('AZURE_CLIENT_ID'),
    'client_secret' => env('AZURE_CLIENT_SECRET'),
    'base_url'      => env('CRM_BASE_URL'),
    'scope'         => env('CRM_SCOPE'),
    'token_url'     => 'https://login.microsoftonline.com/' . env('AZURE_TENANT_ID') . '/oauth2/v2.0/token',
];