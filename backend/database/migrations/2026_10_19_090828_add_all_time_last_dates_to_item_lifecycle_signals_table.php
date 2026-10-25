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
            // Ngay thuc te gan nhat (toan bo lich su, khong gioi han 3 nam) — dung de hien thi khi
            // last_sale_date/last_inventory_txn_date (ban trong 3 nam) la null, de biet item nay
            // thuc su ngung tu bao lau, thay vi chi bao "khong co trong 3 nam".
            $table->date('last_sale_date_all_time')->nullable()->after('sale_count_all_time');
            $table->date('last_inventory_txn_date_all_time')->nullable()->after('last_inventory_txn_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('item_lifecycle_signals', function (Blueprint $table) {
            $table->dropColumn(['last_sale_date_all_time', 'last_inventory_txn_date_all_time']);
        });
    }
};
