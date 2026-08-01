<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Chay truoc khi cache tho quote value (TTL 1800s = 30 phut) het han, de user khong ai
// phai cho cold-fetch CRM (~30-90s) nua.
Schedule::command('sales:warm-cache')->cron('*/25 * * * *')->withoutOverlapping();
