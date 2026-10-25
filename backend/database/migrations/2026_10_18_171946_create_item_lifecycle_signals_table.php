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
        Schema::create('item_lifecycle_signals', function (Blueprint $table) {
            $table->id();
            $table->string('item_number')->unique();

            // Tin hieu "dung cho du an" — tu SalesLineBiEntities (F&O), CreatedOn/ItemId/SalesQty.
            // Dang tin cay hon CRM quotedetails (phan lon dong quotedetails la free-text, khong gan productid).
            $table->date('last_sale_date')->nullable();
            $table->integer('sale_count_3y')->default(0);
            $table->decimal('sale_qty_3y', 18, 2)->default(0);

            // Tin hieu "xuat nhap ton" — tu InventTransCDSEntities (F&O), DatePhysical/StatusIssue/StatusReceipt.
            $table->date('last_inventory_txn_date')->nullable();
            $table->decimal('qty_in_3y', 18, 2)->default(0);
            $table->decimal('qty_out_3y', 18, 2)->default(0);

            // Ton kho hien tai — tu ABInventWarehousesOnHandV2, SUM qua tat ca kho.
            $table->decimal('on_hand_qty', 18, 2)->default(0);

            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->index('last_sale_date');
            $table->index('last_inventory_txn_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('item_lifecycle_signals');
    }
};
