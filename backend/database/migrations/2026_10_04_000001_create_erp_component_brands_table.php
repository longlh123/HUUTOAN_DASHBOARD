<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('erp_component_brands', function (Blueprint $table) {
            $table->id();
            $table->string('loai'); // 'Dau phat' | 'Dong co' | 'Bo dieu khien'
            $table->string('hang'); // ten hang: MECC, KOHLER, DEEPSEA...
            $table->string('xuat_xu_pho_bien', 2)->nullable(); // ma nuoc pho bien nhat cua hang nay trong catalog
            $table->string('nhien_lieu')->nullable(); // chi ap dung Dong co: 'dau' | 'xang' | 'ca_hai' | null
            $table->integer('so_luong_item')->default(0); // so item thuc te trong catalog F&O
            $table->text('ghi_chu')->nullable();
            $table->timestamps();

            $table->unique(['loai', 'hang']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('erp_component_brands');
    }
};
