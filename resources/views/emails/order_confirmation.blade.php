<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fbf4; margin: 0; padding: 20px; color: #1a2e26; }
  .wrapper { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #dbe7df; box-shadow: 0 4px 16px rgba(12,74,50,0.06); }
  .header { background: #0C4A32; padding: 30px; text-align: center; color: #ffffff; }
  .header h1 { margin: 0; font-size: 24px; letter-spacing: 0.5px; }
  .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.85; }
  .content { padding: 30px; }
  .badge { display: inline-block; background: #e8f5ed; color: #0C4A32; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; }
  .meta-grid { display: flex; justify-content: space-between; background: #f9fbf9; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #eef4f0; }
  .meta-item small { display: block; color: #6e8a7e; font-size: 11px; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
  .meta-item b { font-size: 14px; color: #0C4A32; }
  table.items { width: 100%; border-collapse: collapse; margin: 20px 0; }
  table.items th { text-align: left; padding: 10px; background: #f3f8f5; color: #0C4A32; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #dce8e1; }
  table.items td { padding: 12px 10px; border-bottom: 1px solid #eef4f0; font-size: 14px; }
  .totals { width: 100%; margin-top: 15px; border-top: 2px solid #0C4A32; padding-top: 12px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
  .totals-row.grand { font-size: 18px; font-weight: 800; color: #0C4A32; border-top: 1px dashed #dbe7df; padding-top: 8px; margin-top: 8px; }
  .address-box { background: #fbfdfa; border: 1px solid #eef4f0; padding: 16px; border-radius: 8px; margin: 20px 0; }
  .address-box h4 { margin: 0 0 8px 0; color: #0C4A32; font-size: 14px; }
  .address-box p { margin: 0; font-size: 13px; line-height: 1.5; color: #445950; }
  .actions { text-align: center; margin: 30px 0 10px; }
  .btn { display: inline-block; background: #0C4A32; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 700; font-size: 14px; }
  .footer { background: #f3f8f5; padding: 20px; text-align: center; font-size: 12px; color: #728c81; border-top: 1px solid #eef4f0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Lemurra Traders</h1>
    <p>Tamil Nadu — Handcrafted Decor, Lamps & Personalized Gifts</p>
  </div>
  <div class="content">
    <span class="badge">Order Confirmed</span>
    <h2 style="margin: 0 0 8px 0; color: #0C4A32;">Thank you for your order, {{ $order->customer_name }}!</h2>
    <p style="margin: 0 0 15px 0; color: #5a7368; font-size: 14px;">We have received your order and payment. We are carefully preparing your items for delivery.</p>

    <div class="meta-grid">
      <div class="meta-item">
        <small>Order Number</small>
        <b>#{{ $order->order_number }}</b>
      </div>
      <div class="meta-item">
        <small>Payment</small>
        <b>{{ $order->payment_status }} ({{ strtoupper($order->payment_method) }})</b>
      </div>
      <div class="meta-item">
        <small>Amount Paid</small>
        <b>₹{{ number_format($order->total, 2) }}</b>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Price</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        @foreach($order->items as $item)
        <tr>
          <td>
            <b>{{ $item->name }}</b>
            @if(!empty($item->custom))
              <br><small style="color:#0C4A32;">Personalised Order</small>
            @endif
          </td>
          <td style="text-align: center;">{{ $item->qty }}</td>
          <td style="text-align: right;">₹{{ number_format($item->price, 2) }}</td>
          <td style="text-align: right; font-weight: 700;">₹{{ number_format($item->price * $item->qty, 2) }}</td>
        </tr>
        @endforeach
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>₹{{ number_format($order->subtotal, 2) }}</span>
      </div>
      @if($order->discount > 0)
      <div class="totals-row" style="color: #0C4A32;">
        <span>Discount{{ !empty($order->coupon_code) ? ' (Coupon: ' . $order->coupon_code . ')' : '' }}</span>
        <span>- ₹{{ number_format($order->discount, 2) }}</span>
      </div>
      @endif
      <div class="totals-row">
        <span>Delivery Charges</span>
        <span style="color: #0C4A32; font-weight: 600;">Free</span>
      </div>
      <div class="totals-row grand">
        <span>Total Paid</span>
        <span>₹{{ number_format($order->total, 2) }}</span>
      </div>
    </div>

    <div class="address-box">
      <h4>Delivery Address</h4>
      @php
        $addr = is_string($order->shipping_address) ? json_decode($order->shipping_address, true) : $order->shipping_address;
      @endphp
      <p>
        <strong>{{ $addr['name'] ?? $order->customer_name }}</strong><br>
        {{ $addr['line1'] ?? ($addr['line'] ?? '') }}
        @if(!empty($addr['line2']) || !empty($addr['landmark']))
          , {{ $addr['line2'] ?? ($addr['landmark'] ?? '') }}
        @endif
        <br>
        {{ $addr['city'] ?? '' }}, {{ $addr['state'] ?? '' }} — {{ $addr['pin'] ?? '' }}<br>
        Phone: {{ $addr['phone'] ?? $order->customer_phone }}
      </p>
    </div>

    <div class="actions">
      <a href="{{ url('/orders/' . $order->order_number . '/print') }}" target="_blank" class="btn">View & Print Official Invoice (PDF)</a>
    </div>
  </div>

  <div class="footer">
    <p>Lemurra Traders · Tamil Nadu - India · Phone: +91-6383408380</p>
    <p>Support: <a href="mailto:support@lemurra.in" style="color: #0C4A32;">support@lemurra.in</a> · <a href="mailto:lemurratraders@gmail.com" style="color: #0C4A32;">lemurratraders@gmail.com</a> · Website: <a href="https://www.lemurra.in" style="color: #0C4A32;">www.lemurra.in</a></p>
    <p>Thank you for shopping with Lemurra Traders!</p>
  </div>
</div>
</body>
</html>
