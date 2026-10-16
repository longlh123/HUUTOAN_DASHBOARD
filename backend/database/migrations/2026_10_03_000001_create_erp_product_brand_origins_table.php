<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('erp_product_brand_origins', function (Blueprint $table) {
            $table->id();
            $table->string('item_number')->unique(); // F&O ItemNumber (DisplayProductNumber)
            $table->string('name'); // ten day du, khong bi cat (tu EcoResProductTranslationBiEntities)
            $table->string('loai'); // 'Dau phat' | 'Dong co' | 'Bo dieu khien'
            $table->string('hang')->nullable(); // brand: MECC, KOHLER, DEEPSEA...
            $table->string('xuat_xu', 2)->nullable(); // ma nuoc: CN, IT, VN, JP...
            $table->timestamps();

            $table->index('loai');
            $table->index('hang');
            $table->index('xuat_xu');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('erp_product_brand_origins');
    }
};
