<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice #{{ $order->order_number }} — Lemurra Traders</title>
<link rel="icon" href="{{ asset('images/brand.webp') }}">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1b2e25;
    background: #f4f7f5;
    margin: 0;
    padding: 30px 15px;
    font-size: 14px;
    line-height: 1.5;
  }
  .invoice-card {
    max-width: 800px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 12px;
    padding: 40px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    border: 1px solid #d9e6de;
  }
  .no-print {
    max-width: 800px;
    margin: 0 auto 20px auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn-print {
    background: #0C4A32;
    color: #ffffff;
    border: none;
    padding: 10px 24px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .btn-print:hover { background: #156646; }
  .btn-back {
    color: #0C4A32;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
  }
  .inv-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0C4A32;
    padding-bottom: 22px;
    margin-bottom: 24px;
    gap: 20px;
  }
  .brand-wrap {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }
  .brand-logo {
    width: 64px;
    height: 64px;
    object-fit: contain;
    border-radius: 10px;
    border: 1px solid #d9e6de;
    background: #ffffff;
    padding: 3px;
  }
  .brand h1 { margin: 0 0 4px 0; color: #0C4A32; font-size: 24px; font-weight: 800; letter-spacing: -0.3px; }
  .brand p { margin: 2px 0; color: #42584e; font-size: 12.5px; line-height: 1.45; }
  .brand .gstin-tag {
    display: inline-block;
    background: #eef6f2;
    color: #0C4A32;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    margin-top: 4px;
    font-size: 12px;
    border: 1px solid #cbe0d4;
  }
  .inv-title { text-align: right; min-width: 200px; }
  .inv-title h2 { margin: 0 0 6px 0; font-size: 22px; color: #0C4A32; text-transform: uppercase; letter-spacing: 1px; }
  .inv-title p { margin: 3px 0; font-size: 13px; color: #5a7368; }
  .inv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin-bottom: 30px;
  }
  .box h4 {
    margin: 0 0 10px 0;
    font-size: 12px;
    text-transform: uppercase;
    color: #0C4A32;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #eef4f0;
    padding-bottom: 4px;
  }
  .box p { margin: 0; font-size: 13.5px; line-height: 1.6; color: #374a41; }
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 25px;
  }
  table.data-table th {
    background: #eef5f1;
    color: #0C4A32;
    text-transform: uppercase;
    font-size: 12px;
    padding: 10px 14px;
    text-align: left;
    border-bottom: 2px solid #0C4A32;
  }
  table.data-table td {
    padding: 14px;
    border-bottom: 1px solid #e6efe9;
    font-size: 13.5px;
  }
  table.data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .inv-summary {
    display: flex;
    justify-content: flex-end;
  }
  .summary-table {
    width: 320px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13.5px;
  }
  .summary-row.total {
    border-top: 2px solid #0C4A32;
    border-bottom: 2px solid #0C4A32;
    padding: 10px 0;
    margin-top: 8px;
    font-size: 17px;
    font-weight: 800;
    color: #0C4A32;
  }
  .tag-paid {
    display: inline-block;
    background: #d4edda;
    color: #155724;
    padding: 3px 10px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 12px;
  }
  .footer-note {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px dashed #d9e6de;
    font-size: 12px;
    color: #728c81;
    text-align: center;
  }

  @media print {
    body { background: #ffffff; padding: 0; }
    .no-print { display: none !important; }
    .invoice-card { box-shadow: none; border: none; padding: 0; width: 100%; max-width: 100%; }
    @page { margin: 15mm; size: auto; }
  }
</style>
</head>
<body>

<div class="no-print">
  <a href="javascript:window.close()" class="btn-back">← Close window</a>
  <div>
    <button class="btn-print" onclick="window.print()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      Print / Save as PDF
    </button>
  </div>
</div>

<div class="invoice-card">
  <div class="inv-header">
    <div class="brand-wrap">
      <img src="{{ asset('images/brand.webp') }}" alt="Lemurra Traders Logo" class="brand-logo">
      <div class="brand">
        <h1>Lemurra Traders</h1>
        <p><strong>Location:</strong> Tamil Nadu - India</p>
        <p><strong>Phone / WhatsApp:</strong> +91-6383408380 &nbsp;·&nbsp; <strong>Website:</strong> www.lemurra.in</p>
        <p><strong>Email:</strong> lemurratraders@gmail.com</p>
        <p><strong>Official:</strong> admin@lemurra.in &nbsp;|&nbsp; support@lemurra.in</p>
        <span class="gstin-tag">GSTIN: 33FJHPR1675D1Z5</span>
      </div>
    </div>
    <div class="inv-title">
      <h2>Tax Invoice</h2>
      <p><strong>Invoice #:</strong> {{ $order->order_number }}</p>
      <p><strong>Date:</strong> {{ $order->created_at ? $order->created_at->format('d M Y, h:i A') : date('d M Y') }}</p>
      <p><strong>Status:</strong> <span class="tag-paid">{{ $order->payment_status }}</span></p>
    </div>
  </div>

  @php
    $addr = is_string($order->shipping_address) ? json_decode($order->shipping_address, true) : $order->shipping_address;
  @endphp

  <div class="inv-grid">
    <div class="box">
      <h4>Customer & Shipping Details</h4>
      <p>
        <strong>{{ $addr['name'] ?? $order->customer_name }}</strong><br>
        {{ $addr['line1'] ?? ($addr['line'] ?? '') }}
        @if(!empty($addr['line2']) || !empty($addr['landmark']))
          , {{ $addr['line2'] ?? ($addr['landmark'] ?? '') }}
        @endif
        <br>
        {{ $addr['city'] ?? '' }}, {{ $addr['state'] ?? '' }} — <strong>{{ $addr['pin'] ?? '' }}</strong><br>
        Phone: {{ $addr['phone'] ?? $order->customer_phone }}<br>
        Email: {{ $order->customer_email }}
      </p>
    </div>
    <div class="box">
      <h4>Payment Information</h4>
      <p>
        <strong>Gateway:</strong> Razorpay Secure Payment<br>
        <strong>Payment Method:</strong> {{ strtoupper($order->payment_method) }}<br>
        <strong>Transaction Ref:</strong> {{ $order->payment_ref ?? ($order->razorpay_payment_id ?? 'N/A') }}<br>
        <strong>Delivery:</strong> Free Standard Shipping across India
      </p>
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 50%;">Item Description</th>
        <th style="text-align: center; width: 15%;">Qty</th>
        <th style="text-align: right; width: 15%;">Unit Price</th>
        <th style="text-align: right; width: 20%;">Total</th>
      </tr>
    </thead>
    <tbody>
      @foreach($order->items as $item)
      <tr>
        <td>
          <strong>{{ $item->name }}</strong>
          @if(!empty($item->custom))
            <br><small style="color: #0C4A32;">Personalised Order Details Provided</small>
          @endif
        </td>
        <td style="text-align: center;">{{ $item->qty }}</td>
        <td class="num">₹{{ number_format($item->price, 2) }}</td>
        <td class="num"><strong>₹{{ number_format($item->price * $item->qty, 2) }}</strong></td>
      </tr>
      @endforeach
      @if($order->free_gift)
      <tr>
        <td><strong>Free Gift: {{ ucfirst($order->free_gift) }}</strong></td>
        <td style="text-align: center;">1</td>
        <td class="num">₹0.00</td>
        <td class="num"><strong>Free</strong></td>
      </tr>
      @endif
    </tbody>
  </table>

  <div class="inv-summary">
    <div class="summary-table">
      <div class="summary-row">
        <span>Subtotal</span>
        <span class="num">₹{{ number_format($order->subtotal, 2) }}</span>
      </div>
      @if($order->discount > 0)
      <div class="summary-row" style="color: #0C4A32;">
        <span>Discount{{ !empty($order->coupon_code) ? ' (' . $order->coupon_code . ')' : '' }}</span>
        <span class="num">- ₹{{ number_format($order->discount, 2) }}</span>
      </div>
      @endif
      <div class="summary-row">
        <span>Shipping & Delivery</span>
        <span class="num" style="color: #0C4A32; font-weight: 700;">Free</span>
      </div>
      <div class="summary-row total">
        <span>Total Amount</span>
        <span>₹{{ number_format($order->total, 2) }}</span>
      </div>
    </div>
  </div>

  <div class="footer-note">
    <p>This is a computer-generated tax invoice. No signature is required.</p>
    <p><strong>Lemurra Traders</strong> · Tamil Nadu - India · GSTIN: 33FJHPR1675D1Z5 · Phone: +91-6383408380</p>
    <p>Website: <a href="https://www.lemurra.in" target="_blank" style="color:#0C4A32;">www.lemurra.in</a> · Official: <a href="mailto:admin@lemurra.in" style="color:#0C4A32;">admin@lemurra.in</a> | <a href="mailto:support@lemurra.in" style="color:#0C4A32;">support@lemurra.in</a> | <a href="mailto:lemurratraders@gmail.com" style="color:#0C4A32;">lemurratraders@gmail.com</a></p>
  </div>
</div>

<script>
  // Auto trigger print prompt on load if requested via ?print=1
  if (window.location.search.indexOf('print=1') !== -1) {
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 500);
    });
  }
</script>
</body>
</html>
