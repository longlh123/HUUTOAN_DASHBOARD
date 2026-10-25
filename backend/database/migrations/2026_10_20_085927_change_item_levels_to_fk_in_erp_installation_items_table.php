<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // item_level_1/item_level_2 dang luu label text (vd "C. LẮP ĐẶT") — doi sang luu code (FK toi
        // erp_item_level1_options/erp_item_level2_options) de tra cuu nhanh, khong phai goi CRM.
        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->unsignedInteger('item_level_1_code')->nullable()->after('item_level_1');
            $table->unsignedInteger('item_level_2_code')->nullable()->after('item_level_2');
        });

        DB::statement('
            UPDATE erp_installation_items ii
            JOIN erp_item_level1_options o1 ON o1.label = ii.item_level_1
            SET ii.item_level_1_code = o1.code
        ');
        DB::statement('
            UPDATE erp_installation_items ii
            JOIN erp_item_level2_options o2 ON o2.label = ii.item_level_2
            SET ii.item_level_2_code = o2.code
        ');

        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->dropColumn(['item_level_1', 'item_level_2']);
        });

        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->renameColumn('item_level_1_code', 'item_level_1');
            $table->renameColumn('item_level_2_code', 'item_level_2');
        });

        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->foreign('item_level_1')->references('code')->on('erp_item_level1_options');
            $table->foreign('item_level_2')->references('code')->on('erp_item_level2_options');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->dropForeign(['item_level_1']);
            $table->dropForeign(['item_level_2']);
        });

        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->renameColumn('item_level_1', 'item_level_1_code');
            $table->renameColumn('item_level_2', 'item_level_2_code');
        });

        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->string('item_level_1')->nullable()->after('item_level_1_code');
            $table->string('item_level_2')->nullable()->after('item_level_2_code');
        });

        DB::statement('
            UPDATE erp_installation_items ii
            JOIN erp_item_level1_options o1 ON o1.code = ii.item_level_1_code
            SET ii.item_level_1 = o1.label
        ');
        DB::statement('
            UPDATE erp_installation_items ii
            JOIN erp_item_level2_options o2 ON o2.code = ii.item_level_2_code
            SET ii.item_level_2 = o2.label
        ');

        Schema::table('erp_installation_items', function (Blueprint $table) {
            $table->dropColumn(['item_level_1_code', 'item_level_2_code']);
        });
    }
};
