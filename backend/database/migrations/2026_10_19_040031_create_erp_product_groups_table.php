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
        Schema::create('erp_product_groups', function (Blueprint $table) {
            $table->id();
            $table->string('group_id')->unique(); // F&O ProductGroups.GroupId (vd "108")
            $table->string('group_name')->nullable(); // F&O ProductGroups.GroupName
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('erp_product_groups');
    }
};
