<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_user_team_history', function (Blueprint $table) {
            $table->id();
            $table->string('crm_user_id', 36); // systemuserid
            $table->string('business_unit_id', 36);
            $table->string('business_unit_name')->nullable();
            $table->timestamp('effective_from'); // tu luc nao user thuoc team nay — nhap tay khi co thay doi
            $table->timestamps();

            $table->index(['crm_user_id', 'effective_from']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_user_team_history');
    }
};
