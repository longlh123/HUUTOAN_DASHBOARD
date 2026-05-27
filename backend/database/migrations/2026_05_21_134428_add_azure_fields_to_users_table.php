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
        Schema::table('users', function (Blueprint $table) {
            $table->string('azure_id')->nullable()->unique()->after('id');
            $table->string('territory')->nullable()->after('email'); // SOUTH|CENTER|NORTH|null=admin
            $table->boolean('is_admin')->default(false)->after('territory');
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['azure_id', 'territory', 'is_admin']);
            $table->string('password')->nullable(false)->change();
        });
    }
};
