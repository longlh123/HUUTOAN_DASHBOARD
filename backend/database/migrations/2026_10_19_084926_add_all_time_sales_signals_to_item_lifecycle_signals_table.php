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
        Schema::table('item_lifecycle_signals', function (Blueprint $table) {
            // Khac voi last_sale_date/sale_count_3y (chi tinh trong 3 nam) — 2 cot nay query toan bo
            // lich su SalesLineBiEntities, khong gioi han ngay, de phan biet "da tung ban, gio ngung"
            // voi "chua tung ban lan nao" (item moi tao BOM, chua ra mat — khong phai ung vien dong).
            $table->boolean('has_ever_sold')->default(false)->after('sale_qty_3y');
            $table->date('first_sale_date')->nullable()->after('has_ever_sold');
            $table->integer('sale_count_all_time')->default(0)->after('first_sale_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('item_lifecycle_signals', function (Blueprint $table) {
            $table->dropColumn(['has_ever_sold', 'first_sale_date', 'sale_count_all_time']);
        });
    }
};
