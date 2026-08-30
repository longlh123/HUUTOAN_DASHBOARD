<?php

namespace App\Providers;

use App\Services\Crm\CrmApiService;
use App\Services\Crm\CrmTokenService;
use App\Services\Crm\DeviceService;
use App\Services\Crm\SalesPerformanceService;
use App\Services\Erp\CostService;
use App\Services\Erp\ErpApiService;
use App\Services\Erp\ErpSalesAttributionService;
use App\Services\Erp\ErpTokenService;
use App\Services\Erp\FinanceService;
use App\Services\Erp\ProjectTrackingService;
use App\Services\Invoice\InvoiceImportService;
use App\Services\Sharepoint\SharepointApiService;
use App\Services\Sharepoint\SharepointTokenService;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use SocialiteProviders\Azure\AzureExtendSocialite;
use SocialiteProviders\Manager\SocialiteWasCalled;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(CrmTokenService::class);
        $this->app->singleton(CrmApiService::class);
        $this->app->singleton(SalesPerformanceService::class);
        $this->app->singleton(DeviceService::class);
        $this->app->singleton(ErpTokenService::class);
        $this->app->singleton(ErpApiService::class);
        $this->app->singleton(FinanceService::class);
        $this->app->singleton(ErpSalesAttributionService::class);
        $this->app->singleton(CostService::class);
        $this->app->singleton(ProjectTrackingService::class);
        $this->app->singleton(InvoiceImportService::class);
        $this->app->singleton(SharepointTokenService::class);
        $this->app->singleton(SharepointApiService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Event::listen(SocialiteWasCalled::class, AzureExtendSocialite::class);
    }
}
