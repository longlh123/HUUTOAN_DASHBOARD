<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('erp_product_brand_origins', function (Blueprint $table) {
            // Model: tach tu ten san pham, phan ngay sau ten hang, truoc cac marker spec (SAE/kVA/kW/Hz/xuat xu...)
            $table->string('model', 150)->nullable()->after('hang');
        });
    }

    public function down(): void
    {
        Schema::table('erp_product_brand_origins', function (Blueprint $table) {
            $table->dropColumn('model');
        });
    }
};
