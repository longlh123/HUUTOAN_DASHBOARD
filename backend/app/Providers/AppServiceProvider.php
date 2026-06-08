<?php

namespace App\Providers;

use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use App\Services\Crm\CrmApiService;
use App\Services\Crm\CrmTokenService;
use App\Services\Crm\DeviceService;
use App\Services\Crm\SalesPerformanceService;
use SocialiteProviders\Manager\SocialiteWasCalled;
use SocialiteProviders\Azure\AzureExtendSocialite;

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
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Event::listen(SocialiteWasCalled::class, AzureExtendSocialite::class);
    }
}
