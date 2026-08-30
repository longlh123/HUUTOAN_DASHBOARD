<?php

return [
    'tenant_id' => env('AZURE_TENANT_ID'),
    'client_id' => env('AZURE_CLIENT_ID'),
    'client_secret' => env('AZURE_CLIENT_SECRET'),
    'scope' => env('GRAPH_SCOPE', 'https://graph.microsoft.com/.default'),
    'token_url' => 'https://login.microsoftonline.com/'.env('AZURE_TENANT_ID').'/oauth2/v2.0/token',
    'site_id' => env('SHAREPOINT_SITE_ID'),
    'invoice_folder' => env('SHAREPOINT_INVOICE_FOLDER'),
];
