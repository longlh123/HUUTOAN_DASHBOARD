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
        // Optionset dong cua ab_item_level_2_code tren CRM (ab_work_order_product) — chi tao 1 lan,
        // khong can lenh sync lap lai (giong erp_product_groups/erp_warehouses).
        Schema::create('erp_item_level2_options', function (Blueprint $table) {
            $table->unsignedInteger('code')->primary();
            $table->string('label');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('erp_item_level2_options');
    }
};
