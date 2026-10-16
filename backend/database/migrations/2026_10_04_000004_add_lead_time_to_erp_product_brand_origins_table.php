<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('erp_product_brand_origins', function (Blueprint $table) {
            $table->integer('procurement_lead_time_days')->nullable()->after('dien_ap');
            $table->integer('inventory_lead_time_days')->nullable()->after('procurement_lead_time_days');
            $table->integer('sales_lead_time_days')->nullable()->after('inventory_lead_time_days');
        });
    }

    public function down(): void
    {
        Schema::table('erp_product_brand_origins', function (Blueprint $table) {
            $table->dropColumn(['procurement_lead_time_days', 'inventory_lead_time_days', 'sales_lead_time_days']);
        });
    }
};
