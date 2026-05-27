<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kpi_member_targets', function (Blueprint $table) {
            $table->id();
            $table->string('crm_user_id', 36);
            $table->string('user_name');
            $table->smallInteger('year');
            $table->bigInteger('q1')->nullable();
            $table->bigInteger('q2')->nullable();
            $table->bigInteger('q3')->nullable();
            $table->bigInteger('q4')->nullable();
            $table->timestamps();

            $table->unique(['crm_user_id', 'year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpi_member_targets');
    }
};
