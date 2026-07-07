<?php

use Illuminate\Support\Facades\Route;
use App\Services\Crm\CrmApiService;
use App\Http\Controllers\Auth\AzureAuthController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Dashboard\SalesController;
use App\Http\Controllers\Dashboard\OpportunitiesController;
use App\Http\Controllers\Dashboard\KpiController;
use App\Http\Controllers\Dashboard\DeviceController;
use App\Http\Controllers\Dashboard\UsersController;
use App\Http\Controllers\Dashboard\FinanceController;

// Azure AD OAuth — web middleware cần thiết cho session (OAuth state)
Route::middleware('web')->prefix('auth/azure')->group(function () {
    Route::get('/redirect',  [AzureAuthController::class, 'redirect']);
    Route::get('/callback',  [AzureAuthController::class, 'callback']);
});

Route::middleware('auth:sanctum')->get('/auth/me', [AzureAuthController::class, 'me']);

Route::post('/auth/login',                               [AuthController::class, 'login']);
Route::middleware('auth:sanctum')->post('/auth/logout',  [AuthController::class, 'logout']);

// Dev-only: tạo test user và trả token (chỉ chạy khi APP_ENV=local)
if (app()->isLocal()) {
    Route::get('/auth/dev-login', function () {
        $territory  = request()->query('territory');   // SOUTH | CENTER | NORTH | null
        $department = request()->query('department');  // B2B | B2C | ...
        $name       = request()->query('name', 'Test User');

        $isAdmin = !$territory;

        $user = \App\Models\User::updateOrCreate(
            ['email' => 'devtest+' . strtolower($department ?? 'admin') . '@huutoan.com'],
            [
                'azure_id'   => 'dev-' . ($department ?? 'admin') . '-' . ($territory ?? 'all'),
                'name'       => $name,
                'territory'  => $territory ?: null,
                'department' => $department ?: null,
                'is_admin'   => $isAdmin,
                'password'   => bcrypt('dev'),
            ]
        );

        $token = $user->createToken('dev')->plainTextToken;

        return response()->json(['token' => $token, 'user' => [
            'name'       => $user->name,
            'territory'  => $user->territory,
            'department' => $user->department,
            'is_admin'   => $user->is_admin,
        ]]);
    });
}

// Debug
Route::get('/crm-ping', function (CrmApiService $crm) {
    return response()->json($crm->get('accounts', [
        '$select' => 'name,accountid',
        '$top'    => '3',
    ]));
});

// Dashboard
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnforceTerritory::class])
    ->prefix('dashboard')
    ->group(function () {
        Route::get('/sales/weekly',            [SalesController::class,        'weekly']);
        Route::get('/sales/gap-to-target',    [SalesController::class,        'gapToTarget']);
        Route::get('/sales/top-accounts',     [SalesController::class,        'topAccounts']);
        Route::get('/sales/all',              [SalesController::class,        'all']);
        Route::get('/sales/summary',          [SalesController::class,        'summary']);
        Route::get('/sales/by-period',        [SalesController::class,        'byPeriod']);
        Route::get('/sales/by-rep',           [SalesController::class,        'byRep']);
        Route::get('/sales/by-team',          [SalesController::class,        'byTeam']);
        Route::get('/sales/request-type',     [SalesController::class,         'requestTypeCrosstab']);
        Route::get('/devices/by-product-line',    [DeviceController::class, 'byProductLine']);
        Route::get('/devices/agreement-overview', [DeviceController::class, 'agreementOverview']);
        Route::get('/devices/agreements',              [DeviceController::class, 'agreements']);
        Route::get('/devices/maintenance-schedule',    [DeviceController::class, 'maintenanceSchedule']);
        Route::get('/devices/service-centers',         [DeviceController::class, 'serviceCenters']);
        Route::get('/opportunities/pipeline', [OpportunitiesController::class, 'pipeline']);
        Route::get('/opportunities/quality',  [OpportunitiesController::class, 'quality']);
        Route::get('/opportunities/activity', [OpportunitiesController::class, 'activity']);

        Route::get('/sales/users',            [SalesController::class,  'users']);
        Route::get('/sales/kpi-quarterly',    [SalesController::class,  'kpiQuarterly']);
        Route::get('/users',                  [UsersController::class,  'index']);
        Route::put('/users/{id}',             [UsersController::class,  'update']);

        Route::get('/finance/summary',         [FinanceController::class, 'summary']);
        Route::get('/finance/by-period',       [FinanceController::class, 'byPeriod']);
        Route::get('/finance/debt-aging',      [FinanceController::class, 'debtAging']);
        Route::get('/finance/cost-comparison', [FinanceController::class, 'costComparison']);
        Route::get('/finance/cost-comparison/{itemNumber}/bom', [FinanceController::class, 'costBomBreakdown']);

        Route::get('/kpi',                    [KpiController::class, 'index']);
        Route::get('/kpi/performance',        [KpiController::class, 'performance']);
        Route::post('/kpi',                   [KpiController::class, 'store']);
        Route::put('/kpi/{id}',               [KpiController::class, 'update']);
        Route::delete('/kpi/{id}',            [KpiController::class, 'destroy']);
    });
