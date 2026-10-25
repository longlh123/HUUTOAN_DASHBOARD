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
        Schema::create('erp_warehouses', function (Blueprint $table) {
            $table->id();
            $table->string('warehouse_id')->unique(); // F&O Warehouses.WarehouseId
            $table->string('warehouse_name')->nullable();
            $table->string('warehouse_type')->nullable(); // Standard, Quarantine, Transit, ITMGIT...
            $table->string('site_id')->nullable(); // F&O OperationalSites.SiteId
            $table->string('site_name')->nullable();
            // Phan loai nghiep vu tu de (gan tay, khong tu dong) — 'sellable' (kho ban duoc, tinh vao
            // candidate_to_close), 'internal' (kho noi bo/quy trinh, loai khoi candidate_to_close),
            // null = chua xac dinh/can xac nhan lai voi nghiep vu.
            $table->string('classification')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('erp_warehouses');
    }
};
