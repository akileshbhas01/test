<?php

namespace App\Support;

use App\Mail\AdminOrderNotificationMail;
use App\Mail\OrderConfirmationMail;
use App\Models\Order;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class OrderEmailNotifier
{
    public function send(Order $order): void
    {
        $order->loadMissing('items');

        $recipients = [
            [
                'type' => 'customer',
                'email' => trim((string) $order->customer_email),
                'mail' => new OrderConfirmationMail($order),
            ],
            [
                'type' => 'admin',
                'email' => trim((string) config('services.order_notification_email')),
                'mail' => new AdminOrderNotificationMail($order),
            ],
        ];

        foreach ($recipients as $recipient) {
            if (!filter_var($recipient['email'], FILTER_VALIDATE_EMAIL)) {
                Log::warning('Order email skipped because the recipient address is missing or invalid.', [
                    'order_number' => $order->order_number,
                    'recipient_type' => $recipient['type'],
                ]);
                continue;
            }

            try {
                Mail::to($recipient['email'])->send($recipient['mail']);
                Log::info('Order email sent.', [
                    'order_number' => $order->order_number,
                    'recipient_type' => $recipient['type'],
                ]);
            } catch (\Throwable $exception) {
                Log::error('Order email delivery failed.', [
                    'order_number' => $order->order_number,
                    'recipient_type' => $recipient['type'],
                    'exception' => $exception::class,
                    'message' => $exception->getMessage(),
                ]);
            }
        }
    }
}
