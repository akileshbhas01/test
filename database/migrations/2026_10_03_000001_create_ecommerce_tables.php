<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('phone');
            $table->string('line1');
            $table->string('line2')->nullable();
            $table->string('city');
            $table->string('state');
            $table->string('pin');
            $table->string('label')->default('Home');
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->string('id')->primary(); // e.g. LTWF103
            $table->string('name');
            $table->string('slug')->index();
            $table->string('cat')->index();
            $table->decimal('price', 10, 2);
            $table->decimal('mrp', 10, 2);
            $table->string('img');
            $table->json('images')->nullable();
            $table->integer('stock')->default(0);
            $table->decimal('rating', 3, 1)->default(4.7);
            $table->integer('reviews')->default(0);
            $table->text('blurb')->nullable();
            $table->json('specs')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('cart_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('session_id')->nullable()->index();
            $table->string('product_id');
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->integer('qty')->default(1);
            $table->json('custom')->nullable();
            $table->timestamps();
        });

        Schema::create('wishlist_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('session_id')->nullable()->index();
            $table->string('product_id');
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::create('coupons', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('type')->default('pct'); // 'pct' or 'flat'
            $table->decimal('value', 10, 2);
            $table->decimal('min', 10, 2)->default(0);
            $table->decimal('max', 10, 2)->default(0);
            $table->boolean('active')->default(true);
            $table->string('note')->nullable();
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_name');
            $table->string('customer_email');
            $table->string('customer_phone');
            $table->json('shipping_address');
            $table->json('items_summary')->nullable();
            $table->decimal('subtotal', 10, 2);
            $table->decimal('discount', 10, 2)->default(0);
            $table->decimal('shipping', 10, 2)->default(0);
            $table->decimal('total', 10, 2);
            $table->string('coupon_code')->nullable();
            $table->string('free_gift')->nullable();
            $table->string('payment_method')->default('razorpay');
            $table->string('payment_status')->default('Pending');
            $table->string('payment_ref')->nullable();
            $table->string('razorpay_order_id')->nullable();
            $table->string('razorpay_payment_id')->nullable();
            $table->string('status')->default('Order Confirmed');
            $table->string('tracking_number')->nullable();
            $table->string('carrier')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('product_id')->nullable();
            $table->string('name');
            $table->decimal('price', 10, 2);
            $table->integer('qty');
            $table->string('img')->nullable();
            $table->json('custom')->nullable();
            $table->timestamps();
        });

        Schema::create('blogs', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            $table->string('date')->nullable();
            $table->string('read_time')->nullable();
            $table->json('tags')->nullable();
            $table->text('snippet')->nullable();
            $table->longText('content')->nullable();
            $table->string('cover')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blogs');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('coupons');
        Schema::dropIfExists('wishlist_items');
        Schema::dropIfExists('cart_items');
        Schema::dropIfExists('products');
        Schema::dropIfExists('addresses');
    }
};
