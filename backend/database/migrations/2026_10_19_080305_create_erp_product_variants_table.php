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
        Schema::create('erp_product_variants', function (Blueprint $table) {
            $table->id();
            // Noi ve Master qua item_number (= erp_synced_items.item_number). F&O dung chung
            // ItemNumber cho moi bien the cua 1 Master — chi phan biet qua cac dimension duoi day.
            $table->string('item_number');
            $table->string('product_variant_number')->unique(); // "ItemNumber : Config : Size : Color : Style"
            $table->string('product_configuration_id')->nullable();
            $table->string('product_size_id')->nullable();
            $table->string('product_color_id')->nullable();
            $table->string('product_style_id')->nullable();
            $table->string('product_version_id')->nullable();
            $table->string('search_name')->nullable();
            $table->string('product_lifecycle_state_id')->nullable();
            $table->string('data_area_id')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->index('item_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('erp_product_variants');
    }
};
