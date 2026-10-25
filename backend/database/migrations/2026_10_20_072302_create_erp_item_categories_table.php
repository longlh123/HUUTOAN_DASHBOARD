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
        Schema::create('erp_item_categories', function (Blueprint $table) {
            $table->id();
            $table->string('item_number');
            $table->enum('hierarchy', ['procurement', 'sales']);
            $table->string('category_name');
            $table->timestamps();

            $table->unique(['item_number', 'hierarchy', 'category_name']);
            $table->index('item_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('erp_item_categories');
    }
};
