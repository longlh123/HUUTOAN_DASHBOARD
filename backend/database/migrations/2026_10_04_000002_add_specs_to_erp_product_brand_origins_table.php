<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('erp_product_brand_origins', function (Blueprint $table) {
            // Dong co: 'dau' | 'xang' | null (chua xac dinh)
            $table->string('nhien_lieu')->nullable()->after('xuat_xu');
            // Dau phat: '1 pha' | '3 pha' | null (chua xac dinh - khong du du lieu de suy ra tu ten)
            $table->string('pha')->nullable()->after('nhien_lieu');
            // Dau phat: dien ap danh dinh, dang text vi co the ghi '220V' hoac '220/380V'
            $table->string('dien_ap')->nullable()->after('pha');
        });
    }

    public function down(): void
    {
        Schema::table('erp_product_brand_origins', function (Blueprint $table) {
            $table->dropColumn(['nhien_lieu', 'pha', 'dien_ap']);
        });
    }
};
