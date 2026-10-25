<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('erp_synced_deals', function (Blueprint $table) {
            // Chi co gia tri o dong Returned Order (tra nguoc qua InventTransIdReturn tren SalesLine
            // F&O ra SO goc) — dong Sales binh thuong de null. Dung de gop 1 SO voi chung tu giam
            // tru cua no: WHERE sales_order_number = 'X' OR original_sales_order_number = 'X'.
            $table->string('original_sales_order_number')->nullable()->after('sales_order_number');
            $table->index('original_sales_order_number');
        });
    }

    public function down(): void
    {
        Schema::table('erp_synced_deals', function (Blueprint $table) {
            $table->dropIndex(['original_sales_order_number']);
            $table->dropColumn('original_sales_order_number');
        });
    }
};
