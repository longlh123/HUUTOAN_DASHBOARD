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
        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->dropColumn('item_level_3');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->string('item_level_3')->nullable()->after('item_level_2');
        });
    }
};
