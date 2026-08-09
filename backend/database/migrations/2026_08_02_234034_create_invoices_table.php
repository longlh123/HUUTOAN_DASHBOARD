<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('lookup_code')->nullable()->unique(); // MCCQT — ma tra cuu CQT, dung chong trung
            $table->string('invoice_number');   // SHDon
            $table->string('invoice_symbol')->nullable(); // KHHDon
            $table->string('template_code')->nullable();  // KHMSHDon
            $table->date('issue_date')->nullable();  // NLap
            $table->date('signed_date')->nullable(); // ngay ky CQT (tu chu ky so)
            $table->string('seller_name')->nullable();
            $table->string('seller_tax_code')->nullable();
            $table->string('seller_address')->nullable();
            $table->string('buyer_name')->nullable();
            $table->string('buyer_tax_code')->nullable();
            $table->string('payment_method')->nullable(); // HTTToan
            $table->string('currency', 10)->nullable();   // DVTTe
            $table->decimal('total_before_tax', 18, 2)->nullable(); // TgTCThue
            $table->decimal('total_tax', 18, 2)->nullable();        // TgTThue
            $table->decimal('total_discount', 18, 2)->nullable();   // TTCKTMai
            $table->decimal('total_payment', 18, 2)->nullable();    // TgTTTBSo
            $table->string('total_payment_words')->nullable();     // TgTTTBChu
            $table->text('content_summary')->nullable(); // ten cac mat hang noi lai — cot "Noi dung"
            $table->text('note')->nullable();            // "Ghi chu" — nhap tay tren UI, khong co trong XML
            $table->string('source_zip')->nullable();     // ten file zip goc, de truy vet
            $table->longText('raw_xml')->nullable();       // luu nguyen ban XML de doi chieu khi can
            $table->timestamps();

            $table->index(['invoice_number', 'seller_tax_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
