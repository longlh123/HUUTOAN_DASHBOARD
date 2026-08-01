<?php

namespace App\Console\Commands;

use App\Services\Crm\SalesPerformanceService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class WarmSalesCache extends Command
{
    protected $signature   = 'sales:warm-cache';
    protected $description = 'Pre-fetch resolved quote values cho năm hiện tại/năm trước/tuần này theo từng territory, tránh user đầu tiên phải chờ cold-fetch CRM';

    private const TERRITORIES = ['ALL', 'SOUTH', 'CENTER', 'NORTH'];

    public function __construct(private SalesPerformanceService $sales)
    {
        parent::__construct();
    }

    public function handle(): void
    {
        $year        = now()->year;
        $currentFrom = Carbon::create($year, 1, 1)->startOfDay();
        $currentTo   = now();

        $prevYear = $year - 1;
        $prevFrom = Carbon::create($prevYear, 1, 1)->startOfDay();
        $prevTo   = Carbon::create($prevYear, 12, 31)->endOfDay();

        foreach (self::TERRITORIES as $territory) {
            $this->info("Warming territory={$territory}...");

            $this->sales->byTeam($currentFrom, $currentTo, $territory, null);
            $this->sales->byTeam($prevFrom, $prevTo, $territory, null);
            $this->sales->weeklyDeals(0, $territory, null);
        }

        $this->info('Done.');
    }
}
