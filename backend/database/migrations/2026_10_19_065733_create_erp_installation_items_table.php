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
        Schema::create('erp_installation_items', function (Blueprint $table) {
            $table->id();
            // Danh sach vat tu lap dat duoc phep chon — import tay tu file Excel noi bo
            // "TRA MA HANG TONG HOP _HTG (KSLD).xlsx" (ben lap dat tu bien soan), khong phai tu F&O.
            $table->string('item_number')->unique();
            $table->string('product_name_ref')->nullable(); // ten trong file Excel, chi de doi chieu
            $table->string('unit_ref')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('erp_installation_items');
    }
};
