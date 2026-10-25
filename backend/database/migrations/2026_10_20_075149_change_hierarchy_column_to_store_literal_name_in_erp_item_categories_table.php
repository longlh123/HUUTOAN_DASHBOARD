<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Doi tu enum('procurement','sales') (ten tu dat) sang string luu dung nguyen van
        // ProductCategoryHierarchyName tu F&O (vd "HTG Procurement Categories") — tranh phai
        // doan/map ten rut gon, giong cach erp_product_groups giu nguyen GroupName goc.
        DB::statement("ALTER TABLE erp_item_categories MODIFY hierarchy VARCHAR(255) NOT NULL");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE erp_item_categories MODIFY hierarchy ENUM('procurement','sales') NOT NULL");
    }
};
