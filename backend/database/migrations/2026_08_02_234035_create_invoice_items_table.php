<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->integer('line_no')->nullable();      // STT
            $table->string('item_code')->nullable();     // MHHDVu — optional, khong phai hang nao cung co
            $table->string('item_name')->nullable();     // THHDVu
            $table->string('unit')->nullable();           // DVTinh
            $table->decimal('quantity', 18, 4)->nullable();     // SLuong
            $table->decimal('unit_price', 18, 4)->nullable();   // DGia
            $table->decimal('discount_rate', 9, 4)->nullable(); // TLCKhau
            $table->decimal('discount_amount', 18, 2)->nullable(); // STCKhau
            $table->decimal('amount', 18, 2)->nullable();  // ThTien
            $table->string('tax_rate', 20)->nullable();    // TSuat — giu string ("8%", co the la "KCT"/"KKKNT")
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_items');
    }
};
