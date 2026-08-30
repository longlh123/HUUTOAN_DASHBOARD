<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kpi_team_targets', function (Blueprint $table) {
            $table->id();
            $table->smallInteger('year');
            $table->string('team_id', 36); // GUID business unit CRM — khop _businessunitid_value
            $table->string('team_name');   // snapshot ten hien thi (vd "Sales B2B South") de khong phai join lai
            $table->bigInteger('q1')->default(0);
            $table->bigInteger('q2')->default(0);
            $table->bigInteger('q3')->default(0);
            $table->bigInteger('q4')->default(0);
            $table->timestamps();

            $table->unique(['year', 'team_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpi_team_targets');
    }
};
