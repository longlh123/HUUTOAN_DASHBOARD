<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('erp_synced_deals', function (Blueprint $table) {
            $table->id();
            $table->string('source', 20); // 'so_invoice' | 'onaccount' — luong nao sinh ra dong nay
            $table->string('external_key')->unique(); // dedup key: 'erp-so-{InvoiceNumber}' / 'erp-oa-{TransId}'
            $table->date('invoice_date'); // = closedon trong shape CRM quote row
            $table->date('source_created_at')->nullable(); // = createdon (tu quote/ab_project)
            $table->decimal('resolved_value', 18, 2);
            $table->string('owner_id')->nullable(); // CRM systemuserid — khoa de filterByDepartment() tra theo owner
            $table->string('owner_name')->nullable();
            $table->string('team_id')->nullable(); // CRM businessunitid — dung lam groupBy key trong byTeam()
            $table->string('team_name')->nullable();
            $table->timestamps();

            $table->index('invoice_date');
            $table->index('owner_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('erp_synced_deals');
    }
};
