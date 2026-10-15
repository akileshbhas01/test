<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\CartController;
use App\Http\Controllers\WishlistController;
use App\Http\Controllers\AddressController;
use App\Http\Controllers\CouponController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\AdminController;

// Public and Customer APIs
Route::prefix('api')->group(function () {
    // Auth routes
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/profile', [AuthController::class, 'updateProfile']);

    // Catalog routes
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{id}', [ProductController::class, 'show']);

    // Cart routes
    Route::get('/cart', [CartController::class, 'index']);
    Route::post('/cart/add', [CartController::class, 'add']);
    Route::post('/cart/update', [CartController::class, 'update']);
    Route::post('/cart/remove', [CartController::class, 'remove']);
    Route::post('/cart/clear', [CartController::class, 'clear']);
    Route::post('/cart/sync', [CartController::class, 'sync']);

    // Wishlist routes
    Route::get('/wishlist', [WishlistController::class, 'index']);
    Route::post('/wishlist/toggle', [WishlistController::class, 'toggle']);
    Route::post('/wishlist/sync', [WishlistController::class, 'sync']);

    // Address routes
    Route::get('/user/addresses', [AddressController::class, 'index']);
    Route::post('/user/addresses', [AddressController::class, 'store']);
    Route::delete('/user/addresses/{id}', [AddressController::class, 'destroy']);

    // Coupon routes
    Route::get('/coupons', [CouponController::class, 'index']);
    Route::post('/coupons/apply', [CouponController::class, 'apply']);

    // Order routes
    Route::post('/orders/create', [OrderController::class, 'create']);
    Route::get('/orders/{orderNumber}', [OrderController::class, 'show']);
    Route::get('/user/orders', [OrderController::class, 'userOrders']);

    // Payment (Razorpay) routes
    Route::post('/payment/razorpay/create-order', [PaymentController::class, 'createRazorpayOrder']);
    Route::post('/payment/razorpay/verify', [PaymentController::class, 'verifyPayment']);

    // Admin routes
    Route::prefix('admin')->group(function () {
        Route::get('/dashboard', [AdminController::class, 'dashboard']);
        Route::get('/orders', [AdminController::class, 'orders']);
        Route::match(['patch', 'post'], '/orders/{id}/status', [AdminController::class, 'updateOrderStatus']);
        Route::get('/customers', [AdminController::class, 'customers']);
        Route::get('/products', [AdminController::class, 'products']);
        Route::post('/products', [AdminController::class, 'storeProduct']);
        Route::put('/products/{id}', [AdminController::class, 'updateProduct']);
        Route::delete('/products/{id}', [AdminController::class, 'deleteProduct']);
        Route::post('/products/upload-image', [AdminController::class, 'uploadImage']);
        Route::get('/coupons', [AdminController::class, 'coupons']);
        Route::post('/coupons', [AdminController::class, 'storeCoupon']);
        Route::delete('/coupons/{id}', [AdminController::class, 'deleteCoupon']);
    });
});

// Printable Invoice (PDF) Routes
Route::get('/orders/{orderNumber}/print', [OrderController::class, 'printInvoice']);
Route::get('/orders/{orderNumber}/invoice', [OrderController::class, 'printInvoice']);
Route::get('/order/{orderNumber}/print', [OrderController::class, 'printInvoice']);
Route::get('/order/{orderNumber}/invoice', [OrderController::class, 'printInvoice']);
Route::get('/api/orders/{orderNumber}/print', [OrderController::class, 'printInvoice']);

// Direct order and user orders aliases
Route::get('/orders/{orderNumber}', [OrderController::class, 'show']);
Route::get('/user/orders', [OrderController::class, 'userOrders']);
Route::match(['patch', 'post'], '/orders/{id}/status', [AdminController::class, 'updateOrderStatus']);
Route::match(['patch', 'post'], '/admin/orders/{id}/status', [AdminController::class, 'updateOrderStatus']);

// Main SPA Frontend View
Route::get('/', function () {
    return view('index');
});

// Fallback for direct links
Route::fallback(function () {
    return view('index');
});

