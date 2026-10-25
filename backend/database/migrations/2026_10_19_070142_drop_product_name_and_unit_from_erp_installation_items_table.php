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
        Schema::table('erp_installation_items', function (Blueprint $table) {
            // Ten/DVT chi lay tu erp_synced_items (1 nguon duy nhat) — bang nay chi giu item_number
            // lam allow-list, khong luu lap du lieu product de tranh lech khi erp_synced_items doi.
            $table->dropColumn(['product_name_ref', 'unit_ref']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->string('product_name_ref')->nullable();
            $table->string('unit_ref')->nullable();
        });
    }
};
