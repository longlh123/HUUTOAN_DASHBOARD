<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('kpi_member_targets', function (Blueprint $table) {
            // Team ma target nay duoc TINH VAO — khong phai team CRM song cua nguoi giu target.
            // Can tach rieng vi target co the duoc chuyen cho nguoi ngoai team (vd sale nghi,
            // target chuyen cho 1 CCO khong thuoc team nao) nhung van phai cong vao target team cu.
            $table->string('team_id', 36)->nullable()->after('user_name');
            $table->string('team_name')->nullable()->after('team_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('kpi_member_targets', function (Blueprint $table) {
            $table->dropColumn(['team_id', 'team_name']);
        });
    }
};
