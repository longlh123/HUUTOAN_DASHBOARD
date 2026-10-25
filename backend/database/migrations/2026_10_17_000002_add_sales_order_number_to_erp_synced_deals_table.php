<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('erp_synced_deals', function (Blueprint $table) {
            // Chi co o dong source='so_invoice' (tu SalesInvoiceHeadersV4.SalesOrderNumber) — dong
            // 'onaccount' khong gan voi 1 SO cu the nen de null. Them cot nay de query thang theo SO
            // (vd "SO26083908") thay vi phai tra nguoc tu InvoiceNumber trong external_key.
            $table->string('sales_order_number')->nullable()->after('resolved_value');
            $table->index('sales_order_number');
        });
    }

    public function down(): void
    {
        Schema::table('erp_synced_deals', function (Blueprint $table) {
            $table->dropIndex(['sales_order_number']);
            $table->dropColumn('sales_order_number');
        });
    }
};
