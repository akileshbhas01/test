<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0C4A32">
<meta name="csrf-token" content="{{ csrf_token() }}">
<base href="{{ asset('/') }}">
<title>Lemurra Traders — Gifts, decor and everyday goods from Tamil Nadu</title>
<meta name="description" content="Lemurra Traders: wooden decor, crystal LED lamps, kids' toys, jute bags and personalised photo calendars. Free delivery across India, cash on delivery and easy returns.">
<link rel="icon" id="favicon" href="{{ asset('images/brand.webp') }}" data-x="1">
<link rel="alternate icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M0 20C0 4 4 0 20 0h28c12 0 16 4 16 16v28c0 16-4 20-20 20H16C4 64 0 60 0 48z' fill='%230C4A32'/%3E%3Ctext x='32' y='47' font-family='Arial' font-weight='800' font-size='40' text-anchor='middle' fill='%23F7FBF4'%3EL%3C/text%3E%3Ccircle cx='52' cy='12' r='6' fill='%23FFB320'/%3E%3C/svg%3E">
<link rel="preload" href="{{ asset('fonts/poppins-latin-700.woff2') }}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{{ asset('fonts/roboto-latin.woff2') }}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{{ asset('css/styles.css') }}?v={{ time() }}">
<!-- Razorpay Checkout SDK -->
<script src="https://checkout.razorpay.com/v1/checkout.js" defer></script>
<!-- SweetAlert2 -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11" defer></script>
<script>
  (function() {
    var loc = window.location.pathname;
    var base = '';
    if (loc.indexOf('/lemurra-traders/public') === 0) {
      base = '/lemurra-traders/public';
    } else if (loc.indexOf('/lemurra-traders') === 0) {
      base = '/lemurra-traders';
    }
    window.APP_CONFIG = {
      csrfToken: '{{ csrf_token() }}',
      razorpayKey: '{{ env('RAZORPAY_KEY', 'rzp_test_nHZf320qihdDBv') }}',
      appName: '{{ config('app.name', 'Lemurra Traders') }}',
      apiUrl: base + '/api',
      baseUrl: base || '/'
    };
  })();
</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<div id="boot" role="status" aria-live="polite">
  <div class="boot-in">
    <svg class="boot-ring" viewBox="-100 -100 200 200" aria-hidden="true"><path id="bootRing" pathLength="1"/><g id="bootDots"></g></svg>
    <span class="boot-orb"></span>
    <img class="boot-logo" data-brand alt="" width="64" height="64" src="{{ asset('images/brand.webp') }}">
    <div class="boot-name">Lemurra Traders</div>
    <div class="boot-sub">Setting out the shelves</div>
  </div>
</div>
<script>
  // Robust failsafe: ensure boot screen is NEVER permanently stuck
  (function() {
    function hideBoot() {
      var b = document.getElementById("boot");
      if (b && !b.classList.contains("done")) {
        b.classList.add("done");
        setTimeout(function() { if (b && b.parentNode) b.remove(); }, 900);
      }
      document.body.classList.add("ready");
    }
    window.dismissBootLoader = hideBoot;
    setTimeout(hideBoot, 1800);
  })();
</script>

<header class="nav" id="nav">
  <div class="topbar" id="topbar"><div class="tb-in"><div class="tb-msgs" id="tbMsgs"></div><a class="tb-help" href="#/help">Help</a></div></div>
  <div class="nav-bar" id="navbar">
    <a class="brand" href="#/" aria-label="Lemurra Traders, home"><span class="mark mark-img"><img data-brand alt="" width="38" height="38" src="{{ asset('images/brand.webp') }}"></span><span class="brand-name">Lemurra<small>Traders</small></span></a>

    <nav class="nav-links" id="navlinks" aria-label="Main">
      <i class="lamp" id="lamp"></i>
      <a class="nl" href="#/" data-k="home"><span class="roll"><span data-t="Home">Home</span></span></a>
      <a class="nl" href="#/shop" data-k="shop" id="shopbtn" aria-haspopup="true" aria-expanded="false"><span class="roll"><span data-t="Shop">Shop</span></span><svg class="nl-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></a>
      <a class="nl" href="#/shop/Customize" data-k="custom"><span class="roll"><span data-t="Personalise">Personalise</span></span></a>
      <a class="nl" href="#/services" data-k="services"><span class="roll"><span data-t="Services">Services</span></span></a>
      <a class="nl" href="#/blog" data-k="blog"><span class="roll"><span data-t="Blog">Blog</span></span></a>
      <a class="nl" href="#/help" data-k="help"><span class="roll"><span data-t="Help">Help</span></span></a>
    </nav>

    <div class="nav-tools">
      <button class="tool mag" id="searchbtn" aria-label="Search products" aria-expanded="false"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>
      <button class="tool mag tool-theme" id="themebtn" aria-label="Switch between light and dark theme">
        <svg class="ic i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>
        <svg class="ic i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>
      </button>
      <a class="tool mag tool-wish" href="#/wishlist" aria-label="Wishlist"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-9.4A4 4 0 0 1 12 8a4 4 0 0 1 7 2.6C19 15.6 12 20 12 20z"/></svg><span class="dot" id="wdot" hidden>0</span></a>
      <a class="tool mag" id="cartbtn" href="#/cart" aria-label="Cart"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg><span class="dot" id="cdot" hidden>0</span></a>
      <a class="tool mag" id="acctbtn" href="#/account" aria-label="Account"><span id="acctIn"></span></a>
      <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="mmenu"><i></i><i></i><i></i></button>
    </div>

    <div class="mega" id="mega" role="region" aria-label="Shop menu"></div>
    <div class="nav-progress" aria-hidden="true"><i></i></div>
  </div>
</header>

<div class="search" id="search" role="dialog" aria-modal="true" aria-label="Search products">
  <div class="search-scrim"></div>
  <div class="search-panel">
    <div class="search-box">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="sq" type="search" placeholder="Search lamps, toys, calendars…" autocomplete="off" aria-label="Search products">
      <button id="sclear" aria-label="Clear search"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      <kbd>Esc</kbd>
    </div>
    <div class="sres" id="sres"></div>
  </div>
</div>

<div class="mmenu" id="mmenu" aria-label="Menu">
  <div class="mm-in">
    <a data-k="home" href="#/" style="--i:0">Home</a>
    <a data-k="shop" href="#/shop" style="--i:1">Shop</a>
    <a data-k="custom" href="#/shop/Customize" style="--i:2">Personalise</a>
    <a data-k="services" href="#/services" style="--i:3">Services</a>
    <a data-k="blog" href="#/blog" style="--i:4">Blog</a>
    <a data-k="help" href="#/help" style="--i:5">Help</a>
    <div class="mm-sub" style="--i:6">
      <a href="#/cart" id="mcart">Cart</a><a href="#/wishlist">Wishlist</a><a href="#/account" id="macct">Sign in</a>
      <button onclick="toggleTheme()">Switch theme</button>
    </div>
  </div>
</div>

<main class="view" id="main" tabindex="-1"></main>
<footer class="foot" id="foot"></footer>

<button class="totop" id="totop" aria-label="Back to top"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg></button>
<div class="modal" id="modal" role="dialog" aria-modal="true"><div class="modal-c" id="modalC"></div></div>
<div id="toasts" aria-live="polite"></div>

<script src="{{ asset('js/app.js') }}?v={{ time() }}"></script>
</body>
</html>
