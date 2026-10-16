<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('erp_synced_items', function (Blueprint $table) {
            // Chi ~40% item co gia tri (phan con lai rong) nhung van la tin hieu tot nhat hien co
            // de biet item con "Active" hay "Blocked" ben F&O — xem docs trao doi luc thiet ke bang nay.
            $table->string('product_lifecycle_state_id')->nullable()->after('bom_level');
        });
    }

    public function down(): void
    {
        Schema::table('erp_synced_items', function (Blueprint $table) {
            $table->dropColumn('product_lifecycle_state_id');
        });
    }
};
