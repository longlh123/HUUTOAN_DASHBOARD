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
        Schema::table('kpi_team_targets', function (Blueprint $table) {
            // Override tuong minh cho team thuoc business unit chung (vd "BU Service" trai nhieu
            // department) — khong the tu suy ra duoc department qua roster vi khong co 1 department
            // chiem da so ro rang. Null = tu suy (doanh so thuc te, roi fallback roster majority).
            $table->string('department')->nullable()->after('team_name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('kpi_team_targets', function (Blueprint $table) {
            $table->dropColumn('department');
        });
    }
};
