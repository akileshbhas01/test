<?php

namespace Tests\Feature;

use Tests\TestCase;

class RazorpayConfigurationTest extends TestCase
{
    public function test_order_creation_fails_closed_when_gateway_credentials_are_missing(): void
    {
        config([
            'services.razorpay.key' => null,
            'services.razorpay.secret' => null,
        ]);

        $this->postJson('/api/payment/razorpay/create-order', [
            'amount' => 100,
            'order_number' => 'LT-TEST123',
        ])
            ->assertStatus(503)
            ->assertJsonPath('success', false);
    }

    public function test_order_creation_rejects_non_positive_amounts(): void
    {
        $this->postJson('/api/payment/razorpay/create-order', [
            'amount' => 0,
            'order_number' => 'LT-TEST123',
        ])->assertStatus(422);
    }
}
