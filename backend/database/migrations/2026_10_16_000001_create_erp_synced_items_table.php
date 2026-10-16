<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('erp_synced_items', function (Blueprint $table) {
            $table->id();
            $table->string('item_number')->unique(); // F&O ItemNumber — khoa upsert chinh
            $table->string('search_name')->nullable();
            $table->string('product_type')->nullable();
            $table->string('product_sub_type')->nullable();
            $table->string('product_group_id')->nullable();
            $table->string('item_model_group_id')->nullable();
            $table->string('cost_group_id')->nullable();
            $table->string('project_category_id')->nullable(); // field quyet dinh phan bo du an ben F&O (khac Item Level, chi ton tai ben CRM)
            $table->string('inventory_unit_symbol')->nullable();
            $table->string('purchase_unit_symbol')->nullable();
            $table->string('sales_unit_symbol')->nullable();
            $table->decimal('sales_price', 18, 2)->nullable();
            $table->date('sales_price_date')->nullable();
            $table->decimal('purchase_price', 18, 2)->nullable();
            $table->date('purchase_price_date')->nullable();
            $table->decimal('unit_cost', 18, 2)->nullable();
            $table->date('unit_cost_date')->nullable();
            $table->string('sales_tax_item_group_code')->nullable();
            $table->string('purchase_tax_item_group_code')->nullable();
            $table->integer('bom_level')->nullable();
            $table->string('data_area_id', 10)->nullable(); // company code F&O, hien tai luon "1001"
            $table->timestamp('last_synced_at')->nullable(); // F&O khong co field "ngay sua doi" nen phai full-refresh moi lan sync
            $table->timestamps();

            $table->index('product_group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('erp_synced_items');
    }
};
