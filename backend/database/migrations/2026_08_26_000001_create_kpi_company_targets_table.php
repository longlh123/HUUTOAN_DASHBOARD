<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kpi_company_targets', function (Blueprint $table) {
            $table->id();
            $table->smallInteger('year');
            $table->bigInteger('target_amount'); // target tong ca nam, set 1 lan dau nam — khong suy tu tong team
            $table->timestamps();

            $table->unique('year');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpi_company_targets');
    }
};
