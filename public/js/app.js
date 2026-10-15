/* Lemurra Traders — application (v2, "Kolam & Leaf")
   Catalogue: the SEED array.  Storage: the DB object.  Routes: ROUTES near the bottom.
   No backend. All state lives in localStorage on the visitor's own device. */
"use strict";
document.documentElement.classList.add("js");

/* =====================================================================
   DYNAMIC BACKEND API CLIENT (Laravel + MariaDB / MySQL + Razorpay)
   ===================================================================== */
const API = {
  sessionId() {
    let sid = localStorage.getItem("lem.session_id");
    if (!sid) {
      sid = "sid_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("lem.session_id", sid);
    }
    return sid;
  },
  url(path) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || "/api";
    return base + path;
  },
  headers(extra = {}) {
    const csrf = (window.APP_CONFIG && window.APP_CONFIG.csrfToken) || "";
    const token = localStorage.getItem("lem.token") || "";
    const h = {
      "Accept": "application/json",
      "X-Session-Id": this.sessionId(),
      "X-CSRF-TOKEN": csrf,
      "X-Auth-Token": token,
      ...extra
    };
    if (token) {
      h["Authorization"] = "Bearer " + token;
    }
    return h;
  },
  async get(path) {
    try {
      const token = localStorage.getItem("lem.token") || "";
      let targetUrl = this.url(path);
      if (token) {
        const sep = targetUrl.includes("?") ? "&" : "?";
        targetUrl += sep + "auth_token=" + encodeURIComponent(token);
      }
      const r = await fetch(targetUrl, {
        headers: this.headers(),
        credentials: "same-origin"
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  async post(path, data) {
    try {
      const token = localStorage.getItem("lem.token") || "";
      const r = await fetch(this.url(path), {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({ auth_token: token, ...(data || {}) })
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  async patch(path, data) {
    try {
      const token = localStorage.getItem("lem.token") || "";
      const r = await fetch(this.url(path), {
        method: "PATCH",
        headers: this.headers({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({ auth_token: token, ...(data || {}) })
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  async put(path, data) {
    try {
      const r = await fetch(this.url(path), {
        method: "PUT",
        headers: this.headers({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify(data || {})
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  async delete(path) {
    try {
      const r = await fetch(this.url(path), {
        method: "DELETE",
        headers: this.headers(),
        credentials: "same-origin"
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  async upload(path, formData) {
    try {
      const r = await fetch(this.url(path), {
        method: "POST",
        headers: this.headers(),
        credentials: "same-origin",
        body: formData
      });
      return await r.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

function getAppBase() {
  const cfg = window.APP_CONFIG || {};
  let b = cfg.baseUrl || "";
  if (b.startsWith("http://") || b.startsWith("https://")) {
    try {
      b = new URL(b).pathname;
    } catch (e) { }
  }
  return b.replace(/\/+$/, "");
}

function currentRoute() {
  if (location.hash && location.hash.length > 1) {
    const clean = location.hash.replace(/^#\/?/, "");
    const base = getAppBase();
    const newUrl = (base ? base : "") + "/" + clean;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", newUrl);
    }
    return clean.replace(/^\/+|\/+$/g, "");
  }

  const base = getAppBase();
  let p = location.pathname;
  if (base && p.startsWith(base)) {
    p = p.slice(base.length);
  }
  return p.replace(/^\/+|\/+$/g, "");
}

function mapOrderFromApi(o) {
  if (!o) return null;
  let addr = {};
  try {
    addr = typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : (o.shipping_address || o.address || {});
  } catch (e) {
    addr = o.address || {};
  }
  addr.name = addr.name || o.customer_name || "Customer";
  addr.phone = addr.phone || o.customer_phone || "";
  addr.line = addr.line || addr.line1 || "";
  addr.landmark = addr.landmark || addr.line2 || "";
  const createdAt = o.created_at ? new Date(o.created_at).getTime() : Date.now();
  const updatedAt = o.updated_at ? new Date(o.updated_at).getTime() : createdAt;

  return {
    ...o,
    id: o.order_number || ('ORD-' + o.id),
    order_number: o.order_number,
    db_id: o.id,
    user_id: o.user_id,
    customer_name: o.customer_name || addr.name || "Customer",
    email: o.customer_email || (o.user && o.user.email) || o.email || "",
    customer_email: o.customer_email || (o.user && o.user.email) || o.email || "",
    phone: o.customer_phone || addr.phone || "",
    payment: {
      method: (o.payment && o.payment.method) || o.payment_method || "razorpay",
      status: (o.payment && o.payment.status) || o.payment_status || "Paid",
      ref: (o.payment && o.payment.ref) || o.payment_ref || o.razorpay_payment_id || ""
    },
    address: addr,
    when: o.when || createdAt,
    eta: o.eta || (createdAt + 4 * 864e5),
    history: (o.history && Array.isArray(o.history) && o.history.length) ? o.history : [
      { s: "Order Confirmed", t: o.when || createdAt },
      ...(o.status && o.status !== "Order Confirmed" ? [{ s: o.status, t: updatedAt }] : [])
    ],
    items: (o.items || []).map(it => {
      let c = it.custom;
      if (typeof c === 'string') {
        try { c = JSON.parse(c); } catch (e) { }
      }
      return {
        id: it.product_id || it.id,
        name: it.name,
        price: Number(it.price),
        mrp: Number(it.mrp || it.price),
        qty: Number(it.qty || 1),
        img: it.img,
        custom: c
      };
    })
  };
}

function refreshAdminData() {
  if (!S.admin) return Promise.resolve();
  return API.get('/admin/orders').then(res => {
    if (res && res.success && Array.isArray(res.orders)) {
      S.orders = res.orders.map(mapOrderFromApi);
      DB.write("orders", S.orders);
      if (currentRoute().startsWith("account") || currentRoute().startsWith("admin")) render();
    }
  }).then(() => {
    return API.get('/admin/customers').then(res => {
      if (res && res.success && res.customers) {
        S.adminCustomers = res.customers;
        if (currentRoute().startsWith("account") || currentRoute().startsWith("admin")) render();
      }
    });
  }).then(() => {
    return API.get('/admin/coupons').then(res => {
      if (res && res.success && Array.isArray(res.coupons) && res.coupons.length) {
        S.coupons = res.coupons;
        DB.write("coupons", S.coupons);
        if (currentRoute().startsWith("account") || currentRoute().startsWith("admin")) render();
      }
    });
  });
}

function refreshUserOrders() {
  const token = localStorage.getItem("lem.token") || "";
  const email = (S.user && S.user.email) || localStorage.getItem("lem.email") || "";
  if (!S.user && !email && !token) {
    if (!S.admin) {
      S.orders = [];
      DB.write("orders", []);
    }
    return Promise.resolve(S.orders || []);
  }

  return API.get('/user/orders').then(res => {
    if (res && res.success && Array.isArray(res.orders)) {
      const serverOrders = res.orders.map(mapOrderFromApi);
      const uEmail = (S.user && S.user.email ? S.user.email : email).toLowerCase().trim();
      const uId = S.user && S.user.id ? String(S.user.id) : null;
      const seen = new Set();
      const merged = [];

      serverOrders.forEach(so => {
        if (!so) return;
        merged.push(so);
        if (so.order_number) seen.add(String(so.order_number));
        if (so.id) seen.add(String(so.id));
        if (so.db_id) seen.add(String(so.db_id));
      });

      // Retain only unsynced orders that strictly belong to this user
      (S.orders || []).forEach(lo => {
        if (!lo) return;
        const isSeen = (lo.order_number && seen.has(String(lo.order_number))) ||
          (lo.id && seen.has(String(lo.id))) ||
          (lo.db_id && seen.has(String(lo.db_id)));
        if (!isSeen) {
          const loUserId = lo.user_id ? String(lo.user_id) : null;
          const loEmail = (lo.customer_email || lo.email || (lo.address && lo.address.email) || "").toLowerCase().trim();
          const belongsToMe = (uId && loUserId && loUserId === uId) || (uEmail && loEmail && loEmail === uEmail);
          if (belongsToMe) {
            merged.push(lo);
          }
        }
      });

      S.orders = merged.sort((a, b) => (b.when || 0) - (a.when || 0));
      DB.write("orders", S.orders);
      if (currentRoute().startsWith("account") || currentRoute().startsWith("order")) {
        render();
      }
      return S.orders;
    }
    return S.orders;
  }).catch(e => {
    console.warn("refreshUserOrders notice:", e);
    return S.orders;
  });
}

async function syncWithBackend() {
  try {
    const me = await API.get('/auth/me');
    if (me && me.authenticated && me.user) {
      S.user = me.user;
      S.admin = !!me.is_admin;
      if (me.token) {
        localStorage.setItem("lem.token", me.token);
        document.cookie = "lem_token=" + encodeURIComponent(me.token) + "; path=/; max-age=31536000";
      }
      document.cookie = "lem_email=" + encodeURIComponent(me.user.email) + "; path=/; max-age=31536000";
      document.cookie = "lem_role=" + encodeURIComponent(S.admin ? "admin" : "customer") + "; path=/; max-age=31536000";
      DB.write("user", S.user);
      if (S.admin) DB.write("admin", true);
      else DB.drop("admin");
    }

    const prodRes = await API.get('/products');
    if (prodRes && prodRes.success && prodRes.products && prodRes.products.length) {
      S.products = prodRes.products;
      DB.write("products", S.products);
      if (typeof buildMega === 'function') buildMega();
    }

    const cartRes = await API.get('/cart');
    if (cartRes && cartRes.success && Array.isArray(cartRes.cart)) {
      if (cartRes.cart.length > 0) {
        S.cart = cartRes.cart;
        DB.write("cart", S.cart);
      } else if (S.cart && S.cart.length > 0) {
        API.post('/cart/sync', { cart: S.cart });
      }
    }

    const wishRes = await API.get('/wishlist');
    if (wishRes && wishRes.success && Array.isArray(wishRes.wishlist)) {
      if (wishRes.wishlist.length > 0) {
        S.wish = wishRes.wishlist;
        DB.write("wish", S.wish);
      } else if (S.wish && S.wish.length > 0) {
        API.post('/wishlist/sync', { wishlist: S.wish });
      }
    }

    const cpnRes = await API.get('/coupons');
    if (cpnRes && cpnRes.success && Array.isArray(cpnRes.coupons) && cpnRes.coupons.length) {
      S.coupons = cpnRes.coupons;
      DB.write("coupons", S.coupons);
    }

    if (S.admin) {
      await refreshAdminData();
    } else if (S.user) {
      await refreshUserOrders();
    }

    badges();
    render();
  } catch (e) {
    console.warn("Backend sync notice:", e);
  }
}


const IMG = {
  ballet: "images/ballet.webp",
  deer: "images/deer.webp",
  moon: "images/moon.webp",
  stand: "images/stand.webp",
  calendar: "images/calendar.webp",
  calendar2: "images/calendar2.webp",
  calendar3: "images/calendar3.webp",
  chopping: "images/chopping.webp",
  duck: "images/duck.webp",
  jeep: "images/jeep.webp",
  thar: "images/thar.webp",
  carbag: "images/carbag.webp",
  jute: "images/jute.webp",
  sling: "images/sling.webp",
  bottle: "images/bottle.webp",
  puzzle: "images/puzzle.webp",
  logo: "images/logo.webp",
  brand: "images/brand.webp",
  brandfull: "images/brandfull.webp",
};
/* photographs shot on a white background — these get blended into the tinted image well */
const WHITE = new Set([
  "ballet",
  "bottle",
  "calendar",
  "calendar2",
  "carbag",
  "chopping",
  "jeep",
  "jute",
  "puzzle",
  "sling",
  "stand",
]);

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      c
      ],
  );
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
const uid = () => Math.random().toString(36).slice(2, 9);
const enc = encodeURIComponent;
const REDUCED = matchMedia("(prefers-reduced-motion:reduce)");
const FINE = matchMedia("(pointer:fine)");
function fmtDate(t, opts) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : isNaN(Number(t)) ? t : Number(t));
  if (isNaN(d.getTime())) return String(t);
  return d.toLocaleDateString("en-IN", opts || { day: "numeric", month: "short", year: "numeric" });
}
function fmtDT(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : isNaN(Number(t)) ? t : Number(t));
  if (isNaN(d.getTime())) return String(t);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* icons — one stroke style everywhere */
const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  heart:
    '<path d="M12 20s-7-4.4-7-9.4A4 4 0 0 1 12 8a4 4 0 0 1 7 2.6C19 15.6 12 20 12 20z"/>',
  bag: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 20.5l1.7-5.5A8.4 8.4 0 1 1 21 11.5z"/>',
  truck:
    '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  shield:
    '<path d="M12 3l7.5 3v5.3c0 4.4-3.1 8.3-7.5 9.7-4.4-1.4-7.5-5.3-7.5-9.7V6z"/><path d="M9.3 12.2l2 2 3.5-3.8"/>',
  undo: '<path d="M4 7h16v13H4z"/><path d="M9 7V4.5h6V7M9 12h6M9 16h4"/>',
  camera:
    '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:
    '<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 3.9M6.2 7.3A16.6 16.6 0 0 0 2 12s3.6 6.5 10 6.5a9.6 9.6 0 0 0 4-.9"/>',
  decor:
    '<path d="M9 21h6M12 21v-5M7 10.5a5 5 0 1 1 10 0c0 2.1-1 3.4-2 4.2-.4.4-.6.8-.6 1.3H9.6c0-.5-.2-.9-.6-1.3-1-.8-2-2.1-2-4.2z"/>',
  kids: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  utility:
    '<rect x="5" y="3" width="14" height="18" rx="3.5"/><circle cx="12" cy="7.5" r="1.4"/>',
  calendar:
    '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 20h14"/>',
  logout:
    '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  inbox:
    '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  star: '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.3h.01"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  pin: '<path d="M12 21s7-5.8 7-11a7 7 0 0 0-14 0c0 5.2 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  sparkle:
    '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>',
};
const brandMark = (cls = "") =>
  `<span class="mark mark-img ${cls}"><img src="${IMG.brand}" alt="" width="56" height="56"></span>`;
const ic = (n, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ""}</svg>`;

/* ---------- storage (always guarded) ---------- */
const DB = {
  read(k, fb) {
    try {
      const v = localStorage.getItem("lem." + k);
      return v ? JSON.parse(v) : fb;
    } catch (e) {
      return fb;
    }
  },
  write(k, v) {
    try {
      localStorage.setItem("lem." + k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  },
  drop(k) {
    try {
      localStorage.removeItem("lem." + k);
    } catch (e) { }
  },
};

/* ---------- seed catalogue ---------- */
const SEED = [
  {
    id: "LTWF103",
    name: "Handcrafted Wooden Tribal Statue",
    cat: "Home Decor",
    price: 1899,
    mrp: 2599,
    img: "ballet",
    stock: 12,
    rating: 4.7,
    reviews: 24,
    blurb:
      "A tall hand-carved wooden figure with an expressive face and a natural finish. A statement piece for a shelf, a hallway corner or a farmhouse-style wall.",
    specs: {
      Material: "Hand-carved wood",
      Style: "Tribal, farmhouse",
      Finish: "Natural polish",
      Use: "Shelf, console or floor corner",
      Care: "Dust with a dry cloth",
    },
  },
  {
    id: "LTHD008",
    name: "3D Deer Crystal Ball LED Lamp",
    cat: "Home Decor",
    price: 249,
    mrp: 380,
    img: "deer",
    stock: 48,
    rating: 4.6,
    reviews: 118,
    blurb:
      "A laser-etched deer suspended inside optical crystal. The wooden base warms up to a soft amber glow on a single tap.",
    specs: {
      Material: "K9 optical crystal, wood base",
      Diameter: "8 cm",
      Power: "USB / 3× AAA",
      Light: "Warm white, touch switch",
      Box: "Gift carton included",
    },
  },
  {
    id: "LTWS102",
    name: "Wooden Ballet Dancer Sculpture",
    cat: "Home Decor",
    price: 1899,
    mrp: 2999,
    img: "moon",
    stock: 12,
    rating: 4.8,
    reviews: 41,
    blurb:
      "A hand-carved dancer mid-turn, finished in natural teak oil. Sits well on a console, a study desk or a gifting table.",
    specs: {
      Material: "Seasoned teak wood",
      Height: "28 cm",
      Finish: "Natural oil, hand-rubbed",
      Care: "Dust with a dry cloth",
      Origin: "Handmade in Tamil Nadu",
    },
  },
  {
    id: "LTPS009",
    name: "Adjustable Foldable Mobile & Tablet Stand",
    cat: "Accessories",
    price: 380,
    mrp: 550,
    img: "stand",
    stock: 64,
    rating: 4.5,
    reviews: 203,
    blurb:
      "Folds to pocket size, opens to six viewing angles. Silicone pads keep the device still through a long call.",
    specs: {
      Material: "ABS with silicone grip",
      Fits: '4" to 12.9" devices',
      Angles: "6 positions",
      Folded: "11 × 7 × 2 cm",
      Weight: "92 g",
    },
  },
  {
    id: "LTCP501",
    name: "Custom Desktop Calendar with Wooden Stand",
    cat: "Customize",
    price: 529,
    mrp: 760,
    img: "calendar",
    stock: 999,
    rating: 4.9,
    reviews: 156,
    blurb:
      "Twelve of your own photographs, printed on 300 gsm matte card and set in a solid wood stand. Upload your pictures and the text to print in your cart when you order.",
    specs: {
      Pages: "12 months + cover",
      Paper: "300 gsm matte art card",
      Size: "6 × 8 inches",
      Stand: "Solid wood, reusable",
      Turnaround: "4–6 working days",
    },
  },
  {
    id: "LTCP502",
    name: "Custom Photo Calendar — Landscape",
    cat: "Customize",
    price: 599,
    mrp: 850,
    img: "calendar2",
    stock: 999,
    rating: 4.8,
    reviews: 64,
    blurb:
      "The landscape cut, for group photographs and wide shots. Same wooden stand, more room per month.",
    specs: {
      Pages: "12 months + cover",
      Paper: "300 gsm matte art card",
      Size: "8 × 6 inches",
      Stand: "Solid wood",
      Turnaround: "4–6 working days",
    },
  },
  {
    id: "LTCP503",
    name: "Custom Calendar — Premium Gift Set",
    cat: "Customize",
    price: 749,
    mrp: 1100,
    img: "calendar3",
    stock: 999,
    rating: 4.9,
    reviews: 28,
    blurb:
      "Calendar, printed greeting card and a kraft gift sleeve. Built for corporate new-year gifting in small batches.",
    specs: {
      Includes: "Calendar + card + sleeve",
      Paper: "350 gsm textured",
      Size: "6 × 8 inches",
      Bulk: "10+ units priced lower",
      Turnaround: "6–8 working days",
    },
  },
  {
    id: "LTCB122",
    name: "Premium Wooden Chopping Board",
    cat: "Home Utility",
    price: 489,
    mrp: 699,
    img: "chopping",
    stock: 27,
    rating: 4.6,
    reviews: 94,
    blurb:
      "Acacia end-grain with a juice groove and a deep finger hold. Goes from prep board to serving platter without a wash.",
    specs: {
      Material: "Acacia hardwood",
      Size: "38 × 25 × 1.8 cm",
      Feature: "Juice groove, hanging hole",
      Care: "Hand wash, oil monthly",
      Safe: "Food-grade finish",
    },
  },
  {
    id: "LTKT201",
    name: "Electric Duck Climbing Stairs Toy",
    cat: "Kids",
    price: 599,
    mrp: 899,
    img: "duck",
    stock: 19,
    rating: 4.4,
    reviews: 72,
    blurb:
      "Waddles up its own staircase, quacks at the top and starts again. Holds a three-year-old's attention longer than most screens.",
    specs: {
      Ages: "3 years and up",
      Power: "2× AA (not included)",
      Includes: "Duck, staircase, slide",
      Material: "BIS-tested ABS",
      Sound: "Quack + light",
    },
  },
  {
    id: "LTTH020",
    name: "Diecast Jeep Model 1:32 Scale",
    cat: "Kids",
    price: 419,
    mrp: 620,
    img: "jeep",
    stock: 33,
    rating: 4.5,
    reviews: 61,
    blurb:
      "Pull-back diecast with opening doors and bonnet, working suspension and rubber tyres. Heavier than it looks.",
    specs: {
      Scale: "1:32",
      Material: "Zinc alloy and ABS",
      Length: "14 cm",
      Features: "Pull-back, opening doors, light and sound",
      Ages: "3 years and up",
    },
  },
  {
    id: "LTTH010",
    name: "Die-Cast THAR Police SUV Model",
    cat: "Kids",
    price: 449,
    mrp: 650,
    img: "thar",
    stock: 22,
    rating: 4.6,
    reviews: 55,
    blurb:
      "Police livery Thar with siren lights and a pull-back motor. A favourite on the shelf and on the floor.",
    specs: {
      Scale: "1:32",
      Material: "Zinc alloy and ABS",
      Length: "14 cm",
      Features: "Light, sound, pull-back",
      Ages: "3 years and up",
    },
  },
  {
    id: "LTSB015",
    name: "Car Shaped School and Travel Bag",
    cat: "Kids",
    price: 899,
    mrp: 1350,
    img: "carbag",
    stock: 15,
    rating: 4.7,
    reviews: 39,
    blurb:
      "A soft moulded car body over a real two-compartment bag. Padded straps, and it stands up on its own wheels.",
    specs: {
      Capacity: "14 litres",
      Material: "Padded polyester",
      Fits: "Nursery to class 2",
      Straps: "Adjustable, padded",
      Wash: "Spot clean",
    },
  },
  {
    id: "LTJSB017",
    name: "Handmade Jute Sling Bag",
    cat: "Accessories",
    price: 649,
    mrp: 950,
    img: "jute",
    stock: 24,
    rating: 4.8,
    reviews: 47,
    blurb:
      "Woven from natural jute with a cotton lining and a brass clasp. Light, roomy, and it only looks better with use.",
    specs: {
      Material: "Natural jute, cotton lining",
      Size: "30 × 26 cm",
      Strap: "Adjustable, 120 cm",
      Closure: "Brass magnetic clasp",
      Made: "Handwoven",
    },
  },
  {
    id: "LTCB016",
    name: "Black Everyday Sling Bag",
    cat: "Accessories",
    price: 549,
    mrp: 799,
    img: "sling",
    stock: 31,
    rating: 4.4,
    reviews: 88,
    blurb:
      "Water-resistant crossbody with a hidden back pocket. Fits a 10-inch tablet, a bottle and the usual pocket clutter.",
    specs: {
      Material: "Water-resistant nylon",
      Size: "28 × 20 × 8 cm",
      Pockets: "3 outer, 1 hidden",
      Strap: "Adjustable",
      Colour: "Black",
    },
  },
  {
    id: "LTWB008",
    name: "Insulated Kids Water Bottle",
    cat: "Kids",
    price: 399,
    mrp: 580,
    img: "bottle",
    stock: 42,
    rating: 4.5,
    reviews: 130,
    blurb:
      "Double-walled steel that keeps water cold through a school day. Flip lid, silicone sleeve, no metallic aftertaste.",
    specs: {
      Capacity: "600 ml",
      Material: "304 stainless steel",
      Keeps: "Cold 18 h / hot 10 h",
      Lid: "Flip-top with lock",
      Leakproof: "Yes",
    },
  },
  {
    id: "LTHD006",
    name: "3D Ganesha Crystal Ball LED Lamp",
    cat: "Home Decor",
    price: 279,
    mrp: 420,
    img: "puzzle",
    stock: 36,
    rating: 4.7,
    reviews: 87,
    blurb:
      "A spiritual decorative lamp: Ganesha etched inside optical crystal and lit from beneath by a warm LED on a wooden base. A popular gift for housewarmings and festivals.",
    specs: {
      Material: "K9 optical crystal, wood base",
      Diameter: "8 cm",
      Power: "USB powered",
      Light: "Warm white LED",
      Box: "Gift carton included",
    },
  },
];

/* the five shelves. pic/fit/tint drive the home-page shelf panels */
const CATS = [
  {
    id: "Home Decor",
    ic: "decor",
    note: "Sculpture, crystal lamps, wall pieces",
    pic: "deer",
    fit: false,
    tint: "#0C4A32",
  },
  {
    id: "Kids",
    ic: "kids",
    note: "Toys, bags and bottles that survive school",
    pic: "duck",
    fit: false,
    tint: "#0C4A32",
  },
  {
    id: "Home Utility",
    ic: "utility",
    note: "Boards, puzzles and everyday useful things",
    pic: "chopping",
    fit: true,
    tint: "#FFB320",
  },
  {
    id: "Accessories",
    ic: "bag",
    note: "Bags, stands and carry gear",
    pic: "jute",
    fit: true,
    tint: "#F2A9C4",
  },
  {
    id: "Customize",
    ic: "calendar",
    note: "Calendars printed with your own photos",
    pic: "calendar3",
    fit: false,
    tint: "#0C4A32",
  },
];

const WA =
  "916383408380"; /* support line only — orders are placed on the site */
const STATUS = [
  "Order Confirmed",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
];
const FREE_GIFT = {
  min: 899,
  name: "speaker",
  worth: 200,
}; /* the client's live offer */
const PAY = {
  demo: true,
}; /* true = simulated payment page. Set false once a real gateway is wired into startPayment() */
const ORDER_WEBHOOK =
  ""; /* optional: every new order is POSTed here as JSON (Google Apps Script, Formspree, your own API) */
const COUPONS_SEED = [
  {
    code: "WELCOME10",
    type: "pct",
    value: 10,
    min: 499,
    max: 150,
    active: true,
    note: "10% off, up to ₹150, on orders above ₹499",
  },
  {
    code: "GIFT100",
    type: "flat",
    value: 100,
    min: 999,
    max: 0,
    active: true,
    note: "₹100 off on orders above ₹999",
  },
];
const STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

/* ---------- app state ---------- */
const _initProds = DB.read("products", null);
const _initCoupons = DB.read("coupons", null);
const S = {
  products:
    (Array.isArray(_initProds) && _initProds.length)
      ? _initProds
      : SEED.map((p) => ({ ...p, active: true })),
  cart: Array.isArray(DB.read("cart", [])) ? DB.read("cart", []) : [],
  wish: Array.isArray(DB.read("wish", [])) ? DB.read("wish", []) : [],
  user: DB.read("user", null),
  admin: !!DB.read("admin", false),
  orders: Array.isArray(DB.read("orders", [])) ? DB.read("orders", []) : [],
  coupons:
    (Array.isArray(_initCoupons) && _initCoupons.length)
      ? _initCoupons
      : COUPONS_SEED.map((c) => ({ ...c })),
  coupon: DB.read("coupon", ""),
  buyNow: null,
  co: { step: 1, addr: null, pay: "razorpay" },
  filter: "All",
  sort: "featured",
  query: "",
  maxPrice: null,
  stockOnly: false,
  minRating: 0,
  tab: "overview",
  note: "",
};
if (!Array.isArray(DB.read("products", null))) DB.write("products", S.products);
/* v3: three listings carried the wrong photograph in earlier builds — replace them with the corrected records */
(function migrate() {
  if (DB.read("ver", 1) >= 3) return;
  ["LTWF103", "LTWS102", "LTHD006"].forEach((id) => {
    const seed = SEED.find((x) => x.id === id),
      i = S.products.findIndex((p) => p.id === id);
    if (seed && i > -1 && !S.products[i].photo)
      S.products[i] = {
        ...seed,
        active: S.products[i].active !== false,
        stock: S.products[i].stock,
      };
  });
  DB.write("products", S.products);
  DB.write("ver", 3);
})();

let _fullWarned = false;
const save = () => {
  const ok = DB.write("cart", S.cart);
  DB.write("wish", S.wish);
  if (!ok && !_fullWarned) {
    _fullWarned = true;
    toast(
      "Browser storage is full. Remove a photo from your cart to keep your changes.",
      "err",
    );
  }
  if (ok) _fullWarned = false;
  if (S.user) {
    try {
      const a = DB.read("accounts", {}),
        k = (S.user.email || "").toLowerCase();
      if (a[k]) {
        a[k].wish = S.wish.slice();
        DB.write("accounts", a);
      }
    } catch (e) { }
  }
};
const findP = (id) => S.products.find((p) => p.id === id);
function phoneClean(t) {
  return String(t || "").replace(/\D/g, "").slice(-10);
}
const live = () => S.products.filter((p) => p.active !== false);
const cartCount = () => S.cart.reduce((n, i) => n + i.qty, 0);
const cartTotal = () =>
  S.cart.reduce((n, i) => {
    const p = findP(i.id);
    return n + (p ? p.price * i.qty : 0);
  }, 0);
const cartMrp = () =>
  S.cart.reduce((n, i) => {
    const p = findP(i.id);
    return n + (p ? (p.mrp || p.price) * i.qty : 0);
  }, 0);

/* ---------- product images: a bundled photo, or one the shop owner uploaded ---------- */
const imgOf = (p) => (p && (p.photo || IMG[p.img] || (p.img && (p.img.includes("/") || p.img.startsWith("http")) ? p.img : null))) || IMG.logo;
const isWhite = (p) => (p.photo ? !!p.white : WHITE.has(p.img));
const galleryOf = (p) => {
  const out = [{ src: imgOf(p), white: isWhite(p) }];
  (p.gallery || []).forEach((g) =>
    out.push({ src: g.src || g, white: !!g.white }),
  );
  return out;
};
/* product page gallery: exactly four small views under the main image. Real photos first; any slots left over
   are close-up crops of the main photo, so every product shows one main image + 4 small images */
const CROPS = [
  [1, 50, 50],
  [1.7, 50, 50],
  [2.1, 24, 26],
  [2.1, 76, 74],
];
function thumbsOf(p) {
  const real = galleryOf(p)
    .slice(0, 4)
    .map((g) => ({ src: g.src, white: g.white, z: 1, x: 50, y: 50 }));
  const base = real[0];
  for (let i = real.length; i < 4; i++) {
    const c = CROPS[i];
    real.push({
      src: base.src,
      white: base.white,
      z: c[0],
      x: c[1],
      y: c[2],
      crop: true,
    });
  }
  return real;
}
const pimg = (p, cls = "", extra = "") =>
  `<img class="${cls}" src="${imgOf(p)}" alt="${esc(p.name)}" data-w="${isWhite(p) ? 1 : 0}" ${extra}>`;
const offOf = (p) =>
  p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
const agesOf = (p) => {
  const a = p.specs && p.specs.Ages;
  const m = a && String(a).match(/\d+/);
  return m ? m[0] + "+" : "";
};
const stars = (r, n) => {
  const val = Number(r) || 0;
  return `<span class="rate" role="img" aria-label="Rated ${val.toFixed(1)} out of 5"><i class="stars" style="--r:${val}"></i><b class="num">${val.toFixed(1)}</b>${n != null ? `<span>(${n})</span>` : ""}</span>`;
};

/* ---------- toast ---------- */
function toast(msg, kind) {
  const t = document.createElement("div");
  t.className = "toast" + (kind === "err" ? " toast-err" : "");
  t.innerHTML = `<span class="toast-i">${ic(kind === "err" ? "alert" : "check")}</span><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(t);
  setTimeout(
    () => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 400);
    },
    kind === "err" ? 3600 : 2600,
  );
}

/* ---------- modal ---------- */
let lastFocus = null;
function modal(title, bodyHTML, footHTML, opts) {
  opts = opts || {};
  lastFocus = document.activeElement;
  $("#modalC").className = "modal-c" + (opts.wide ? " wide" : "");
  $("#modalC").innerHTML =
    `<div class="modal-h"><h3>${esc(title)}</h3><button class="x" onclick="closeModal()" aria-label="Close">${ic("x")}</button></div>
     <div class="modal-b">${bodyHTML}</div>` +
    (footHTML ? `<div class="modal-f">${footHTML}</div>` : "");
  $("#modal").classList.add("on");
  document.body.classList.add("noscroll");
  setTimeout(() => {
    const f = $(
      "#modalC input:not([type=file]),#modalC textarea,#modalC select,#modalC .btn",
    );
    if (f) f.focus({ preventScroll: true });
  }, 90);
}
function closeModal() {
  $("#modal").classList.remove("on");
  document.body.classList.remove("noscroll");
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
$("#modal").addEventListener("mousedown", (e) => {
  if (e.target.id === "modal") closeModal();
});

/* ---------- cart actions ---------- */
function addToCart(id, qty, fromEl) {
  const p = findP(id);
  if (!p) return;
  const line = S.cart.find((i) => i.id === id);
  if (line) line.qty = Math.min(line.qty + (qty || 1), 20);
  else S.cart.push({ id, qty: qty || 1 });
  save();
  API.post("/cart/add", { id, qty: qty || 1 });
  badges();
  if (fromEl) flyToCart(fromEl, p);
  cartPulse();
  toast(p.name + " added to cart");
}
function setQty(id, q) {
  const line = S.cart.find((i) => i.id === id);
  if (!line) return;
  line.qty = Math.min(q, 20);
  if (line.qty < 1) S.cart = S.cart.filter((i) => i.id !== id);
  save();
  API.post("/cart/update", { id, qty: q });
  badges();
  render();
}
function removeLine(id) {
  S.cart = S.cart.filter((i) => i.id !== id);
  save();
  API.post("/cart/remove", { id });
  badges();
  render();
  toast("Removed from cart");
}
function toggleWish(id, btn) {
  const i = S.wish.indexOf(id);
  if (i > -1) {
    S.wish.splice(i, 1);
    toast("Removed from wishlist");
  } else {
    S.wish.push(id);
    toast("Saved to wishlist");
  }
  save();
  API.post("/wishlist/toggle", { id });
  badges();
  if (btn) {
    btn.classList.toggle("on", S.wish.includes(id));
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
  }
  if (currentRoute().startsWith("wishlist")) render();
}
function cartPulse() {
  const b = $("#cartbtn");
  if (!b) return;
  b.classList.remove("pulse");
  void b.offsetWidth;
  b.classList.add("pulse");
}
function badges() {
  const c = cartCount(),
    w = S.wish.length;
  const cd = $("#cdot"),
    wd = $("#wdot");
  cd.hidden = !c;
  cd.textContent = c;
  if (c) {
    cd.classList.remove("bump");
    void cd.offsetWidth;
    cd.classList.add("bump");
  }
  wd.hidden = !w;
  wd.textContent = w;
  const md = $("#mcart");
  if (md) md.textContent = c ? `Cart (${c})` : "Cart";
  paintAcct();
}
/* the photo flies from the product into the cart icon — motion that answers a click */
function flyToCart(src, p) {
  if (REDUCED.matches) return;
  const box = src.closest(".pc,.pd");
  const img = box && box.querySelector("img");
  if (!img) return;
  const a = img.getBoundingClientRect(),
    b = $("#cartbtn").getBoundingClientRect();
  const f = document.createElement("img");
  f.src = imgOf(p);
  f.className = "fly";
  f.alt = "";
  f.style.left = a.left + a.width / 2 - 30 + "px";
  f.style.top = a.top + a.height / 2 - 30 + "px";
  document.body.appendChild(f);
  f.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
      {
        transform: `translate(${(b.left + b.width / 2 - a.left - a.width / 2) * 0.55}px,${(b.top - a.top - a.height / 2) * 0.9 - 60}px) scale(.7)`,
        opacity: 1,
        offset: 0.45,
      },
      {
        transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px,${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.16)`,
        opacity: 0.2,
        offset: 1,
      },
    ],
    { duration: 760, easing: "cubic-bezier(.4,0,.3,1)" },
  ).onfinish = () => f.remove();
}

/* ---------- kolam geometry (scalloped ring) ---------- */
function ringPath(R, petals, amp, n) {
  n = n || 300;
  let d = "";
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2,
      r = R * (1 + amp * Math.cos(petals * t));
    d +=
      (i ? "L" : "M") +
      (r * Math.cos(t - Math.PI / 2)).toFixed(2) +
      " " +
      (r * Math.sin(t - Math.PI / 2)).toFixed(2);
  }
  return d + "Z";
}
function ringDots(R, n, r, cls) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    s += `<circle class="${cls || ""}" cx="${(R * Math.cos(t)).toFixed(2)}" cy="${(R * Math.sin(t)).toFixed(2)}" r="${r}"/>`;
  }
  return s;
}

/* =====================================================================
   COMMERCE HELPERS — price details, delivery estimate, order ids
// fmtDate and fmtDT hoisted helper functions are defined at the top of the file
/* estimated delivery: 6xx pin codes (Tamil Nadu, Puducherry) are nearest; personalised goods take longer to make */
function etaFor(pin, items) {
  const custom = (items || []).some((i) => {
    const p = findP(i.id);
    return p && p.cat === "Customize";
  });
  let days = /^6[0-4]/.test(String(pin || "")) ? 3 : 5;
  if (custom) days += 4;
  const d = new Date();
  let n = days;
  while (n > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) n--;
  }
  return d;
}
function couponFor(sell) {
  if (!S.coupon) return null;
  const c = S.coupons.find((x) => x.code === S.coupon && x.active !== false);
  if (!c) return null;
  if (sell < c.min)
    return {
      code: c.code,
      off: 0,
      err: `Add ${inr(c.min - sell)} more to use ${c.code}.`,
    };
  let off = c.type === "pct" ? Math.round((sell * c.value) / 100) : c.value;
  if (c.max) off = Math.min(off, c.max);
  return { code: c.code, off: Math.min(off, sell) };
}
/* the numbers shown in every "Price details" panel */
function priceLines(items) {
  let mrp = 0,
    sell = 0,
    count = 0;
  items.forEach((i) => {
    const p = findP(i.id);
    if (!p) return;
    mrp += (p.mrp || p.price) * i.qty;
    sell += p.price * i.qty;
    count += i.qty;
  });
  const c = couponFor(sell),
    couponOff = c ? c.off : 0;
  return {
    count,
    mrp,
    sell,
    discount: mrp - sell,
    coupon: c,
    couponOff,
    delivery: 0,
    total: Math.max(0, sell - couponOff),
    saved: mrp - sell + couponOff,
    gift: sell >= FREE_GIFT.min,
  };
}
const checkoutItems = () => (S.buyNow ? [S.buyNow] : S.cart);
function newOrderId() {
  const d = new Date(),
    p = (n) => String(n).padStart(2, "0");
  return (
    "LTO" +
    String(d.getFullYear()).slice(2) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}
const orderStatusClass = (s) =>
  s === "Delivered"
    ? "ok"
    : s === "Cancelled"
      ? "off"
      : s === "Order Confirmed" || s === "Packed"
        ? "warn"
        : "info";
// phoneClean function defined above
function userFromAcc(email, acc) {
  const u = {
    name: acc.name,
    email,
    phone: acc.phone,
    addresses: acc.addresses || [],
  };
  if (!u.addresses.length && acc.addr) {
    u.addresses = [
      {
        id: "a1",
        name: acc.name,
        phone: acc.phone,
        pin: acc.pin || "",
        line: acc.addr,
        city: "",
        state: "",
        type: "Home",
      },
    ];
  }
  return u;
}
/* persist the signed-in customer's profile (addresses included) back to the accounts table */
function saveUser() {
  if (!S.user) return;
  if (DB.read("user", null)) DB.write("user", S.user);
  const acc = DB.read("accounts", {});
  const k = (S.user.email || "").toLowerCase();
  if (acc[k]) {
    acc[k] = {
      ...acc[k],
      name: S.user.name,
      phone: S.user.phone,
      addresses: S.user.addresses || [],
    };
    DB.write("accounts", acc);
  }
}

/* =====================================================================
   NAVBAR — sliding lamp, rolling links, mega menu, live search, mobile menu
   ===================================================================== */
function navKey(h) {
  const r = String(h || "").replace(/^#\/?/, "");
  if (!r || r === "/") return "home";
  if (r.startsWith("shop/Customize")) return "custom";
  if (r.startsWith("shop") || r.startsWith("p/")) return "shop";
  if (r.startsWith("services")) return "services";
  if (r.startsWith("blog")) return "blog";
  if (r.startsWith("help") || r.startsWith("policies")) return "help";
  return "";
}
function placeLamp(a) {
  const lamp = $("#lamp"),
    box = $("#navlinks");
  if (!lamp || !box) return;
  if (!a) {
    lamp.classList.remove("on");
    return;
  }
  const b = box.getBoundingClientRect(),
    r = a.getBoundingClientRect();
  if (!r.width) return;
  lamp.style.width = r.width + "px";
  lamp.style.transform = `translateX(${r.left - b.left}px)`;
  lamp.classList.add("on");
}
function paintNav() {
  const k = navKey(currentRoute());
  $$("#navlinks .nl").forEach((a) =>
    a.classList.toggle("on", a.dataset.k === k),
  );
  $$("#mmenu a[data-k]").forEach((a) =>
    a.classList.toggle("on", a.dataset.k === k),
  );
  placeLamp($("#navlinks .nl.on"));
  paintAcct();
}
function paintAcct() {
  const a = $("#acctbtn");
  if (!a) return;
  const admin = S.admin,
    u = S.user;
  a.classList.toggle("is-admin", !!admin);
  a.classList.toggle("is-user", !!u && !admin);
  let initials = "";
  if (admin) {
    initials = "A";
  } else if (u && typeof u.name === "string" && u.name.trim()) {
    initials = u.name
      .trim()
      .split(/\s+/)
      .map((x) => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  } else if (u && typeof u.email === "string" && u.email.trim()) {
    initials = u.email.trim()[0].toUpperCase();
  }
  $("#acctIn").innerHTML = initials
    ? `<span class="av">${esc(initials)}</span>`
    : ic("user");
  a.setAttribute(
    "aria-label",
    admin ? "Admin panel" : u ? "My account" : "Sign in or create an account",
  );
  a.title = admin ? "Admin panel" : u ? "My account" : "Account";
  const m = $("#macct");
  if (m) m.textContent = admin ? "Admin panel" : u ? "My account" : "Sign in";
}

/* --- mega menu --- */
let megaT,
  megaSel = null;
function buildMega() {
  const L = live();
  const rows = CATS.map((c) => {
    const items = L.filter((p) => p.cat === c.id);
    return { c, n: items.length, rep: items[0] || L[0] };
  });
  const first = rows.find((r) => r.rep) || {};
  $("#mega").innerHTML = `
    <div class="mega-cats">
      ${rows
      .map(
        (
          r,
          i,
        ) => `<a class="mc" style="--i:${i}" href="#/shop/${enc(r.c.id)}" data-rep="${r.rep ? r.rep.id : ""}">
        <span class="mc-ic">${ic(r.c.ic)}</span>
        <span class="mc-t"><b>${esc(r.c.id)}</b><small>${esc(r.c.note)}</small></span>
        <span class="mc-n num">${r.n}</span></a>`,
      )
      .join("")}
      <a class="mc mc-all" style="--i:5" href="#/shop"><span class="mc-t"><b>Browse all ${L.length} products</b></span><span class="mc-go">${ic("chev")}</span></a>
    </div>
    <a class="mega-feat" id="megaFeat" href="#/p/${first.rep ? first.rep.id : ""}">
      <span class="mf-img" id="mfImg"></span>
      <span class="mf-cap"><small id="mfCat"></small><b id="mfName"></b><em class="num" id="mfPrice"></em></span>
    </a>`;
  showMegaRep(first.rep, true);
}
function showMegaRep(p, instant) {
  if (!p) return;
  const box = $("#mfImg");
  if (!box) return;
  const old = box.lastElementChild;
  const im = document.createElement("img");
  im.src = imgOf(p);
  im.alt = "";
  im.dataset.w = isWhite(p) ? 1 : 0;
  if (!instant) im.className = "mf-in";
  box.appendChild(im);
  if (old) setTimeout(() => old.remove(), 420);
  $("#mfCat").textContent = p.cat;
  $("#mfName").textContent = p.name;
  $("#mfPrice").textContent = inr(p.price);
  $("#megaFeat").setAttribute("href", "#/p/" + p.id);
}
function openMega() {
  clearTimeout(megaT);
  $("#mega").classList.add("open");
  $("#shopbtn").setAttribute("aria-expanded", "true");
  document.body.classList.add("mega-open");
}
function closeMega(d) {
  clearTimeout(megaT);
  const run = () => {
    $("#mega").classList.remove("open");
    $("#shopbtn").setAttribute("aria-expanded", "false");
    document.body.classList.remove("mega-open");
  };
  d === 0 ? run() : (megaT = setTimeout(run, d == null ? 170 : d));
}

/* --- search overlay --- */
let sSel = -1,
  sList = [];
function openSearch() {
  closeMega(0);
  closeMenu();
  $("#search").classList.add("open");
  document.body.classList.add("search-open");
  $("#searchbtn").setAttribute("aria-expanded", "true");
  renderSearch($("#sq").value);
  setTimeout(() => $("#sq").focus(), 120);
}
function closeSearch() {
  $("#search").classList.remove("open");
  document.body.classList.remove("search-open");
  $("#searchbtn").setAttribute("aria-expanded", "false");
}
function searchScore(p, q) {
  const n = p.name.toLowerCase(),
    c = p.cat.toLowerCase(),
    b = (p.blurb || "").toLowerCase();
  let s = 0;
  q.split(/\s+/)
    .filter(Boolean)
    .forEach((w) => {
      if (n.split(/\s+/).some((x) => x.startsWith(w))) s += 6;
      else if (n.includes(w)) s += 4;
      if (c.includes(w)) s += 3;
      if (b.includes(w)) s += 1;
      if (p.id.toLowerCase() === w) s += 9;
    });
  return s;
}
function renderSearch(q) {
  q = (q || "").trim().toLowerCase();
  sSel = -1;
  const box = $("#sres");
  if (!q) {
    sList = [];
    box.innerHTML = `<p class="sr-h">People often look for</p>
      <div class="sr-chips">${["Crystal lamp", "Photo calendar", "Toy car", "Jute bag", "Chopping board", "Water bottle"].map((t) => `<button class="chip" onclick="pickSuggest('${t}')">${esc(t)}</button>`).join("")}</div>`;
    return;
  }
  sList = live()
    .map((p) => ({ p, s: searchScore(p, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
  if (!sList.length) {
    box.innerHTML = `<div class="sr-empty"><b>Nothing matches “${esc(q)}”</b><span>Try a shorter word, or browse a shelf.</span>
      <div class="sr-chips">${CATS.map((c) => `<a class="chip" href="#/shop/${enc(c.id)}" onclick="closeSearch()">${esc(c.id)}</a>`).join("")}</div></div>`;
    return;
  }
  box.innerHTML =
    sList
      .slice(0, 6)
      .map(
        (
          p,
          i,
        ) => `<a class="srow" href="#/p/${p.id}" data-i="${i}" onclick="closeSearch()" style="--i:${i}">
      <span class="sr-img">${pimg(p, "")}</span>
      <span class="sr-t"><b>${hilite(p.name, q)}</b><small>${esc(p.cat)}</small></span>
      <span class="sr-p num">${inr(p.price)}</span></a>`,
      )
      .join("") +
    `<button class="sr-all" onclick="searchAll()">See all ${sList.length} ${sList.length === 1 ? "result" : "results"} for “${esc(q)}”</button>`;
}
function hilite(t, q) {
  const ws = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!ws.length) return esc(t);
  return esc(t).replace(
    new RegExp("(" + ws.join("|") + ")", "ig"),
    "<mark>$1</mark>",
  );
}
function pickSuggest(t) {
  $("#sq").value = t;
  renderSearch(t);
  $("#sq").focus();
}
function searchAll() {
  S.query = $("#sq").value.trim();
  closeSearch();
  if (currentRoute() === "shop") render();
  else go("shop");
}
function moveSearchSel(d) {
  const rows = $$("#sres .srow");
  if (!rows.length) return;
  sSel = (sSel + d + rows.length) % rows.length;
  rows.forEach((r, i) => r.classList.toggle("sel", i === sSel));
  rows[sSel].scrollIntoView({ block: "nearest" });
}

/* --- mobile menu --- */
function openMenu() {
  closeMega(0);
  closeSearch();
  document.body.classList.add("menu-open", "noscroll");
  $("#burger").setAttribute("aria-expanded", "true");
  $("#burger").setAttribute("aria-label", "Close menu");
}
function closeMenu() {
  document.body.classList.remove("menu-open");
  if (!$("#modal").classList.contains("on"))
    document.body.classList.remove("noscroll");
  const b = $("#burger");
  if (b) {
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-label", "Open menu");
  }
}

/* --- theme --- */
function setTheme(t, persist) {
  document.documentElement.setAttribute("data-theme", t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === "dark" ? "#06301F" : "#0C4A32";
  if (persist) DB.write("theme", t);
}
function toggleTheme() {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  document.documentElement.classList.add("theming");
  setTheme(next, true);
  setTimeout(() => document.documentElement.classList.remove("theming"), 700);
}

/* --- scroll: the bar shrinks into a floating pill, a thin line tracks progress --- */
let scTick = false;
function onScroll() {
  if (scTick) return;
  scTick = true;
  requestAnimationFrame(() => {
    scTick = false;
    const y = scrollY,
      h = document.documentElement.scrollHeight - innerHeight;
    document.body.classList.toggle("scrolled", y > 24);
    $("#nav").style.setProperty(
      "--sp",
      h > 0 ? Math.min(1, y / h).toFixed(4) : 0,
    );
    const st = $("#totop");
    if (st) st.classList.toggle("on", y > 900);
    if (typeof sweepReveal === "function") sweepReveal();
  });
}

/* --- magnetic buttons (fine pointers only) --- */
let magEl = null;
function magMove(e) {
  const m = e.target.closest && e.target.closest(".mag");
  if (magEl && magEl !== m) {
    magEl.style.transform = "";
    magEl = null;
  }
  if (!m) return;
  const r = m.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / r.width,
    dy = (e.clientY - (r.top + r.height / 2)) / r.height;
  m.style.transform = `translate(${(dx * 9).toFixed(1)}px,${(dy * 9).toFixed(1)}px)`;
  magEl = m;
}

function initNav() {
  buildMega();
  paintNav();
  badges();
  /* lamp follows hover / focus */
  const box = $("#navlinks");
  box.addEventListener("mouseover", (e) => {
    const a = e.target.closest(".nl");
    if (a) placeLamp(a);
  });
  box.addEventListener("mouseleave", () => placeLamp($("#navlinks .nl.on")));
  box.addEventListener("focusin", (e) => {
    const a = e.target.closest(".nl");
    if (a) placeLamp(a);
  });
  box.addEventListener("focusout", () => placeLamp($("#navlinks .nl.on")));
  addEventListener("resize", () => placeLamp($("#navlinks .nl.on")));
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => placeLamp($("#navlinks .nl.on")));
  /* mega */
  const sb = $("#shopbtn"),
    mg = $("#mega");
  sb.addEventListener("mouseenter", openMega);
  sb.addEventListener("mouseleave", () => closeMega());
  sb.addEventListener("focus", () => {
    if (sb.matches(":focus-visible")) openMega();
  });
  sb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openMega();
      const f = $("#mega .mc");
      if (f) f.focus();
    }
  });
  mg.addEventListener("mouseenter", () => clearTimeout(megaT));
  mg.addEventListener("mouseleave", () => closeMega());
  mg.addEventListener("mouseover", (e) => {
    const r = e.target.closest(".mc[data-rep]");
    if (r) {
      const id = r.dataset.rep;
      if (id && id !== megaSel) {
        megaSel = id;
        showMegaRep(findP(id));
      }
    }
  });
  mg.addEventListener("focusin", (e) => {
    const r = e.target.closest(".mc[data-rep]");
    if (r && r.dataset.rep) showMegaRep(findP(r.dataset.rep));
  });
  mg.addEventListener("focusout", (e) => {
    if (!mg.contains(e.relatedTarget) && e.relatedTarget !== sb) closeMega(50);
  });
  mg.addEventListener("click", () => closeMega(0));
  /* search */
  $("#searchbtn").onclick = () =>
    $("#search").classList.contains("open") ? closeSearch() : openSearch();
  $("#search").addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("search-scrim") || e.target.id === "search")
      closeSearch();
  });
  $("#sq").addEventListener("input", (e) => renderSearch(e.target.value));
  $("#sq").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSearchSel(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSearchSel(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = $$("#sres .srow")[sSel];
      if (r) {
        closeSearch();
        go(r.getAttribute("href"));
      } else if ($("#sq").value.trim()) searchAll();
    }
  });
  $("#sclear").onclick = () => {
    $("#sq").value = "";
    renderSearch("");
    $("#sq").focus();
  };
  /* mobile menu, theme */
  $("#burger").onclick = () =>
    document.body.classList.contains("menu-open") ? closeMenu() : openMenu();
  $("#mmenu").addEventListener("click", (e) => {
    if (e.target.closest("a")) closeMenu();
  });
  $("#themebtn").onclick = toggleTheme;
  /* global keys */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(
      (document.activeElement || {}).tagName || "",
    );
    if (e.key === "Escape") {
      closeModal();
      closeMega(0);
      closeSearch();
      closeMenu();
    } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      openSearch();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
    }
  });
  /* scroll + magnets */
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();
  if (FINE.matches && !REDUCED.matches)
    document.addEventListener("pointermove", magMove, { passive: true });
  document.addEventListener("pointerleave", () => {
    if (magEl) {
      magEl.style.transform = "";
      magEl = null;
    }
  });
  /* delegated navigation for data-go */
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]");
    if (g) {
      go(g.dataset.go);
    }
  });

  /* global clean-url link interception for SPA navigation */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    if (
      a.target === "_blank" ||
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:") ||
      href === "#" ||
      href.startsWith("#totop") ||
      href.startsWith("#main") ||
      href.indexOf("/print") > -1 ||
      href.indexOf("/invoice") > -1
    ) {
      return;
    }

    e.preventDefault();
    if (href.startsWith("#/")) {
      go(href.slice(2));
      return;
    }

    const base = getAppBase();
    if (base && href.startsWith(base)) {
      go(href.slice(base.length));
      return;
    }

    go(href);
  });
}
function go(h) {
  let clean = String(h || "").replace(/^#\/?/, "");
  clean = clean.replace(/^\/+|\/+$/g, "");
  const base = getAppBase();
  const bClean = (base || "").replace(/^\/+|\/+$/g, "");
  if (bClean && clean.startsWith(bClean)) {
    clean = clean.slice(bClean.length).replace(/^\/+/, "");
  }
  const fullUrl = (base ? base : "") + (clean ? "/" + clean : "/");
  if (window.location.pathname !== fullUrl) {
    if (window.history && window.history.pushState) {
      window.history.pushState(null, "", fullUrl);
    } else {
      window.location.href = fullUrl;
    }
  }
  render();
}

/* =====================================================================
   SHARED PARTIALS
   ===================================================================== */
function emptyBlock(icon, title, text, btn) {
  return `<div class="empty"><div class="empty-ic">${ic(icon)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn || ""}</div>`;
}
const emptyShop = () =>
  `<div class="wrap">${emptyBlock("bag", "The shelves are empty", "Every listing is hidden or deleted. Sign in from the account page to put products back.", `<a class="btn btn-p" href="#/account">Open account</a>`)}</div>`;

function pcard(p, i) {
  if (!p) return "";
  const off = offOf(p),
    ages = agesOf(p),
    out = (p.stock != null ? Number(p.stock) : 99) < 1;
  const isWished = Array.isArray(S.wish) && S.wish.includes(p.id);
  return `<article class="pc rv" style="--i:${(i || 0) % 8}">
    <div class="pc-img" onclick="go('#/p/${p.id}')">
      ${pimg(p, "", 'loading="lazy" decoding="async" width="600" height="600"')}
      <span class="tagp"><i class="tagp-hole"></i><b class="num">${inr(p.price)}</b>${Number(p.mrp) > Number(p.price) ? `<s class="num">${inr(p.mrp)}</s>` : ""}</span>
      ${out ? `<span class="stamp stamp-out">Sold out</span>` : off >= 8 ? `<span class="stamp">Save ${off}%</span>` : ""}
      <button class="wish${isWished ? " on" : ""}" onclick="event.stopPropagation();toggleWish('${p.id}',this)" aria-label="Save ${esc(p.name)} to wishlist">${ic("heart")}</button>
      <button class="qadd" onclick="event.stopPropagation();addToCart('${p.id}',1,this)" aria-label="Add ${esc(p.name)} to cart" ${out ? "disabled" : ""}>${ic("plus")}<span>Add to cart</span></button>
    </div>
    <div class="pc-body">
      <div class="pc-meta"><a class="pc-cat" href="#/shop/${enc(p.cat || '')}">${esc(p.cat || '')}</a>${ages ? `<span class="pc-age">Ages ${ages}</span>` : ""}</div>
      <h3 class="pc-name"><a href="#/p/${p.id}">${esc(p.name)}</a></h3>
      ${Number(p.reviews) > 0 ? stars(p.rating, p.reviews) : `<span class="newtag">New</span>`}
    </div></article>`;
}
function secHead(title, sub, action) {
  return `<div class="sh"><div><h2 class="split">${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div>${action || ""}</div>`;
}

/* =====================================================================
   HOME
   ===================================================================== */
function vHome() {
  const L = live();
  if (!L || !L.length) return emptyShop();
  const order = ["deer", "duck", "calendar", "jute", "chopping", "moon"];
  let beads = order.map((k) => L.find((p) => p && p.img === k)).filter(Boolean);
  if (beads.length < 4) beads = L.slice(0, 6);
  const hero = beads[0] || L[0] || SEED[0];
  if (!hero) return emptyShop();
  const reviews = L.reduce((a, p) => a + (Number(p.reviews) || 0), 0);
  const avg = reviews
    ? L.reduce((a, p) => a + (Number(p.rating) || 0) * (Number(p.reviews) || 0), 0) / reviews
    : 4.6;
  const R = 42;
  const bimg = (p) =>
    `<img src="${imgOf(p)}" alt="" data-w="${isWhite(p) ? 1 : 0}" loading="lazy">`;
  const beadHTML = beads
    .map((p, i) => {
      const a = ((-90 + (i * 360) / beads.length) * Math.PI) / 180;
      return `<button class="bead${i ? "" : " on"}" style="left:${(50 + R * Math.cos(a)).toFixed(2)}%;top:${(50 + R * Math.sin(a)).toFixed(2)}%" data-id="${p.id}" aria-label="Show ${esc(p.name)}"><span>${bimg(p)}</span></button>`;
    })
    .join("");
  const feat = L.slice(0, 8);
  const cal = calDefaults();

  return `
  <section class="hero" id="hero">
    <canvas id="pulli" aria-hidden="true"></canvas>
    <div class="wrap hero-in">
      <div class="hero-copy">
        <h1 class="hero-h">Gifts worth keeping, from a small shop in Tamil Nadu.</h1>
        <p class="hero-p hr">Hand-carved wood, etched crystal lamps, toys that survive a school bag, and calendars printed with your own photographs. Free delivery across India, seven-day returns, and every order tracked from your account.</p>
        <div class="hero-cta hr">
          <a class="btn btn-glow btn-lg mag" href="#/shop">Shop all gifts</a>
          <a class="btn btn-ghost btn-lg mag" href="#/shop/Customize">Make a photo calendar</a>
        </div>
        <div class="hero-proof hr">
          <span class="rate rate-lg"><i class="stars" style="--r:${avg.toFixed(2)}"></i></span>
          <span><b class="num">${avg.toFixed(1)}</b> from <b class="num" data-count="${reviews}">${reviews.toLocaleString("en-IN")}</b> reviews</span>
        </div>
      </div>

      <div class="garland" id="garland">
        <div class="g-glow"></div>
        <div class="g-spin" id="gSpin">
          <svg class="g-svg" viewBox="-100 -100 200 200" aria-hidden="true">
            <path class="g-scal" pathLength="1" d="${ringPath(84, 24, 0.032)}"/>
            <circle class="g-dash" r="75"/>
            <g class="g-dots">${ringDots(75, 36, 1.5)}</g>
          </svg>
          ${beadHTML}
        </div>
        <div class="g-portal" id="gPortal"><img id="gImg" src="${imgOf(hero)}" alt="${esc(hero.name)}" data-w="${isWhite(hero) ? 1 : 0}" fetchpriority="high"></div>
        <a class="g-tag" id="gTag" href="#/p/${hero.id}">
          <i class="g-hole"></i>
          <span class="g-tag-t"><small id="gtCat">${esc(hero.cat)}</small><b id="gtName">${esc(hero.name)}</b></span>
          <em class="num" id="gtPrice">${inr(hero.price)}</em>
        </a>
        <span class="g-hi" lang="ta">வணக்கம்</span>
      </div>
    </div>
  </section>
  <div class="toran" aria-hidden="true"></div>

  <section class="sec sec-trust">
    <div class="wrap trust">
      <div class="rv" style="--i:0">${ic("shield")}<div><b>Secure payments</b><p>UPI, cards, net banking, or cash on delivery.</p></div></div>
      <div class="rv" style="--i:1">${ic("truck")}<div><b>Free delivery</b><p>Every order, every pin code, no minimum basket.</p></div></div>
      <div class="rv" style="--i:2">${ic("pin")}<div><b>Track every order</b><p>Watch it get packed, shipped and delivered from your account.</p></div></div>
      <div class="rv" style="--i:3">${ic("undo")}<div><b>Seven-day returns</b><p>Unused and in its box? Tell us and we collect it.</p></div></div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      ${secHead("Five shelves to start from", "Most people arrive looking for a gift and leave with something for the house.")}
      <div class="shelves" id="shelves">
        ${CATS.map((c, i) => {
    const n = L.filter((p) => p.cat === c.id).length;
    return `<a class="shelf rv${i === 0 ? " on" : ""}${c.fit ? " fit" : ""}" style="--sb:${c.tint};--i:${i}" href="#/shop/${enc(c.id)}">
            <img src="${IMG[c.pic]}" alt="" loading="lazy" data-w="${WHITE.has(c.pic) ? 1 : 0}">
            <span class="sh-vt">${esc(c.id)}</span>
            <span class="sh-t"><span class="sh-ic">${ic(c.ic)}</span><h3>${esc(c.id)}</h3><p>${esc(c.note)}</p><span class="sh-n"><b class="num">${n}</b> ${n === 1 ? "product" : "products"}</span></span>
          </a>`;
  }).join("")}
      </div>
    </div>
  </section>

  <section class="sec sec-tint">
    <div class="wrap">
      ${secHead("On the shelf now", "Priced for gifting, made to survive daily handling.", `<a class="btn btn-o btn-sm" href="#/shop">See all ${L.length}</a>`)}
      <div class="grid g4">${feat.map(pcard).join("")}</div>
    </div>
  </section>

  ${(() => {
      const cz = L.filter((p) => p.cat === "Customize").slice(0, 4);
      if (!cz.length) return "";
      return `<section class="sec" id="custom-home">
    <div class="wrap">
      ${secHead("Made with your photos", "Personalised gifts, printed to order. Add your pictures and text in the cart.", `<a class="btn btn-o btn-sm" href="#/shop/Customize">See all custom gifts</a>`)}
      <div class="grid g4">${cz.map((p, i) => `<div class="cz-wrap">${pcard(p, i)}${S.admin ? `<button class="btn btn-glow btn-sm cz-edit" onclick="editProduct('${p.id}')">Edit</button>` : ""}</div>`).join("")}</div>
    </div>
  </section>`;
    })()}

  <section class="sec" id="calendar">
    <div class="wrap calx">
      <div class="calx-copy">
        <h2 class="split">See your photo on a calendar before you order</h2>
        <p class="calx-lede">Twelve of your own photographs, printed on 300 gsm matte card and set in a solid wood stand. Try one now. The photo stays on your device. After you order, send us the originals with your order ID and we print a proof for you to approve.</p>
        <label class="drop" id="calDrop" tabindex="0">
          <input type="file" id="calFile" accept="image/*" hidden>
          <span class="drop-ic">${ic("camera")}</span>
          <span class="drop-t"><b>Add a photo</b><small>Drop one here, or tap to pick from your phone</small></span>
        </label>
        <div class="calx-row">
          <div class="field"><label for="calMonth">Start month</label>
            <select id="calMonth">${calMonthOptions(cal)}</select></div>
          <div class="field"><label for="calCap">Caption (optional)</label>
            <input id="calCap" maxlength="26" placeholder="Aarav, age 3" autocomplete="off"></div>
        </div>
        <div class="calx-act">
          <button class="btn btn-p btn-lg" id="calOrder">Order this calendar</button>
          <span class="calx-price"><b class="num">${inr((L.find((p) => p.id === "LTCP501") || L.find((p) => p.cat === "Customize") || { price: 529 }).price)}</b><small>with wooden stand</small></span>
        </div>
      </div>
      <div class="calx-view" aria-label="Calendar preview">
        <div class="calx-card" id="calCard">
          <div class="calx-photo" id="calPhoto"><span class="calx-ph">${ic("camera")}<b>Your photo here</b></span></div>
          <div class="calx-body">
            <div class="calx-mh"><b id="calTitle"></b><span id="calYear" class="num"></span></div>
            <div class="calx-grid" id="calGrid"></div>
            <p class="calx-cap" id="calCapOut"></p>
          </div>
        </div>
        <div class="calx-stand" aria-hidden="true"></div>
      </div>
    </div>
  </section>

  <section class="sec sec-green">
    <div class="wrap">
      <h2 class="split">How an order works</h2>
      <div class="steps" id="steps">
        <svg class="steps-line" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M20 20 C 170 -6, 320 46, 500 20 S 830 -6, 980 20"/></svg>
        <div class="step rv" style="--i:0"><span class="step-n">1</span><h3>Add to cart and sign in</h3><p>Pick what you like. Create a free account once and your addresses are saved for next time.</p></div>
        <div class="step rv" style="--i:1"><span class="step-n">2</span><h3>Choose address and pay</h3><p>Pay with UPI, card or net banking, or keep cash ready and pay when it arrives.</p></div>
        <div class="step rv" style="--i:2"><span class="step-n">3</span><h3>Track it to your door</h3><p>Stocked items ship within 24 hours. Follow every step from Account, then Orders. Seven days to return.</p></div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      ${secHead("What buyers said")}
      <div class="voices">
        <figure class="voice voice-big rv"><span class="rate rate-lg"><i class="stars" style="--r:5"></i></span>
          <blockquote>The custom calendar is the best gift I have given my parents. They asked for one for each of my uncles afterwards.</blockquote>
          <figcaption><b>Rahul M.</b> Bengaluru</figcaption></figure>
        <div class="voice-side">
          <figure class="voice rv" style="--i:1"><span class="rate"><i class="stars" style="--r:5"></i></span>
            <blockquote>Ordered the deer crystal lamp for my sister's birthday. It reached Chennai in three days and the glow is much warmer than the photos suggest.</blockquote>
            <figcaption><b>Priya S.</b> Chennai</figcaption></figure>
          <figure class="voice rv" style="--i:2"><span class="rate"><i class="stars" style="--r:4"></i></span>
            <blockquote>I do not usually buy from small stores online. The tracking page showed every step, and the parcel came a day before the date it promised.</blockquote>
            <figcaption><b>Aishwarya K.</b> Coimbatore</figcaption></figure>
        </div>
      </div>
    </div>
  </section>

  <section class="sec sec-tint">
    <div class="wrap faq-split">
      <div>
        ${secHead("Before you order", "", `<a class="btn btn-o btn-sm" href="#/help">All questions</a>`)}
        ${faqBlock(4)}
      </div>
      <aside class="wa-card rv">
        <span class="wa-card-ic">${ic("chat")}</span>
        <h3>Need help with an order?</h3>
        <p>Our support team is on WhatsApp and email between 9:30 am and 5:30 pm, Monday to Saturday. We reply the same working day.</p>
        <a class="btn btn-glow" href="https://wa.me/${WA}" target="_blank" rel="noopener">Chat with support</a>
      </aside>
    </div>
  </section>`;
}

/* ---- calendar preview ---- */
const cal = { photo: null, url: null, m: 0, y: 2027, cap: "" };
function calDefaults() {
  const d = new Date();
  let m = d.getMonth(),
    y = d.getFullYear();
  if (m >= 8) {
    m = 0;
    y++;
  }
  return { m, y };
}
function calMonthOptions(def) {
  const d = new Date();
  let out = "";
  for (let i = 0; i < 12; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const sel =
      t.getMonth() === def.m && t.getFullYear() === def.y ? " selected" : "";
    out += `<option value="${t.getFullYear()}-${t.getMonth()}"${sel}>${MONTHS[t.getMonth()]} ${t.getFullYear()}</option>`;
  }
  return out;
}
function paintCal(flip) {
  const { m, y } = cal;
  $("#calTitle").textContent = MONTHS[m];
  $("#calYear").textContent = y;
  const first = new Date(y, m, 1).getDay(),
    days = new Date(y, m + 1, 0).getDate();
  let h = ["S", "M", "T", "W", "T", "F", "S"]
    .map((d, i) => `<i class="wd${i === 0 ? " su" : ""}">${d}</i>`)
    .join("");
  for (let i = 0; i < first; i++) h += "<i></i>";
  for (let d = 1; d <= days; d++)
    h += `<i class="${(first + d - 1) % 7 === 0 ? "su" : ""}">${d}</i>`;
  $("#calGrid").innerHTML = h;
  $("#calCapOut").textContent = cal.cap;
  const ph = $("#calPhoto");
  if (cal.url) {
    ph.innerHTML = `<img src="${cal.url}" alt="Your photo on the calendar">`;
    ph.classList.add("has");
  }
  if (flip && !REDUCED.matches) {
    const c = $("#calCard");
    c.classList.remove("flip");
    void c.offsetWidth;
    c.classList.add("flip");
  }
}
function calPick(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    toast("Please choose an image file.", "err");
    return;
  }
  if (cal.url) URL.revokeObjectURL(cal.url);
  cal.url = URL.createObjectURL(file);
  cal.file = file;
  paintCal(true);
  $("#calDrop").classList.add("done");
  $("#calDrop .drop-t").innerHTML =
    `<b>${esc(file.name.length > 28 ? file.name.slice(0, 25) + "…" : file.name)}</b><small>Tap to choose a different photo</small>`;
}
function bindCal() {
  const drop = $("#calDrop"),
    file = $("#calFile");
  if (!drop || !file) return;
  const d = calDefaults();
  cal.m = d.m;
  cal.y = d.y;
  cal.cap = "";
  if (cal.url) {
    URL.revokeObjectURL(cal.url);
    cal.url = null;
  }
  paintCal(false);
  drop.addEventListener("click", (e) => {
    e.preventDefault();
    file.click();
  });
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      file.click();
    }
  });
  file.addEventListener("change", () => calPick(file.files[0]));
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("over");
    }),
  );
  drop.addEventListener("drop", (e) => calPick(e.dataTransfer.files[0]));
  const cm = $("#calMonth");
  if (cm) {
    cm.addEventListener("change", (e) => {
      const [y, m] = e.target.value.split("-").map(Number);
      cal.y = y;
      cal.m = m;
      paintCal(true);
    });
  }
  const cc = $("#calCap");
  if (cc) {
    cc.addEventListener("input", (e) => {
      cal.cap = e.target.value.trim();
      const co = $("#calCapOut");
      if (co) co.textContent = cal.cap;
    });
  }
  const coBtn = $("#calOrder");
  if (coBtn) {
    coBtn.addEventListener("click", async () => {
      const p =
        live().find((x) => x.id === "LTCP501") ||
        live().find((x) => x.cat === "Customize");
      if (!p) {
        toast("Calendars are not available right now.", "err");
        return;
      }
      S.note = `Photo calendar starting ${MONTHS[cal.m]} ${cal.y}.${cal.cap ? ` Caption: ${cal.cap}.` : ""}`;
      addToCart(p.id, 1, $("#calOrder"));
      const l = czLine(
        p.id,
      ); /* whatever they tried on the mockup carries into the cart */
      if (l) {
        l.custom.month = MONTHS[cal.m] + " " + cal.y;
        if (cal.cap && !l.custom.text) l.custom.text = cal.cap;
        if (cal.file && l.custom.photos.length < CZ_MAX) {
          try {
            const ph = await fileToPhoto(cal.file, 800, 0.72);
            l.custom.photos.push({
              src: ph.src,
              name: String(cal.file.name).slice(0, 40),
            });
          } catch (e) { }
        }
        save();
      }
      setTimeout(() => go("#/cart"), 350);
    });
  }
}

/* ---- hero behaviours ---- */
function initPulli() {
  const cv = $("#pulli");
  if (!cv || typeof cv.getContext !== "function") return null;
  const hero = cv.parentElement;
  if (!hero || typeof hero.getBoundingClientRect !== "function") return null;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  let W = 0,
    H = 0,
    dpr = 1,
    px = -999,
    py = -999,
    tx = -999,
    ty = -999,
    raf = 0,
    run = false;
  const gap = 36,
    t0 = performance.now();
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = hero.getBoundingClientRect();
    W = r.width;
    H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!run) draw(performance.now());
  }
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    px += (tx - px) * 0.14;
    py += (ty - py) * 0.14;
    const t = (now - t0) / 1000,
      cols = Math.ceil(W / gap) + 1,
      rows = Math.ceil(H / (gap * 0.5)) + 1;
    for (let j = 0; j < rows; j++) {
      const y = j * gap * 0.5,
        off = j % 2 ? gap / 2 : 0;
      if (j % 2 === 0 && false) continue;
      for (let i = 0; i < cols; i++) {
        const x = i * gap + off;
        if ((i + j) % 2) continue; /* diamond lattice, like a pulli kolam */
        const d = Math.hypot(x - px, y - py),
          k = Math.max(0, 1 - d / 200);
        const w = 0.5 + 0.5 * Math.sin(t * 0.8 + (x + y) * 0.011);
        ctx.beginPath();
        ctx.arc(x, y, 1.3 + k * 3.6 + w * 0.3, 0, 6.2832);
        ctx.fillStyle =
          k > 0.04
            ? `rgba(255,179,32,${(0.2 + k * 0.8).toFixed(3)})`
            : `rgba(233,243,234,${(0.11 + w * 0.06).toFixed(3)})`;
        ctx.fill();
      }
    }
    if (run) raf = requestAnimationFrame(draw);
  }
  function start() {
    if (run || REDUCED.matches) return;
    run = true;
    raf = requestAnimationFrame(draw);
  }
  function stop() {
    run = false;
    cancelAnimationFrame(raf);
  }
  size();
  addEventListener("resize", size);
  const mv = (e) => {
    const r = hero.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
  };
  const lv = () => {
    tx = ty = -999;
  };
  if (FINE.matches) {
    hero.addEventListener("pointermove", mv);
    hero.addEventListener("pointerleave", lv);
  }
  const io = new IntersectionObserver((es) => {
    es[0].isIntersecting ? start() : stop();
  });
  io.observe(hero);
  return () => {
    stop();
    io.disconnect();
    removeEventListener("resize", size);
  };
}
function bindHome() {
  /* garland: click a bead to bring that gift into the portal */
  const beads = $$(".bead"),
    gImg = $("#gImg"),
    tag = $("#gTag");
  beads.forEach((b) =>
    b.addEventListener("click", () => {
      const p = findP(b.dataset.id);
      if (!p) return;
      beads.forEach((x) => x.classList.toggle("on", x === b));
      const box = $("#gPortal"),
        old = box.lastElementChild;
      const nu = document.createElement("img");
      nu.src = imgOf(p);
      nu.alt = p.name;
      nu.dataset.w = isWhite(p) ? 1 : 0;
      nu.className = "g-new";
      box.appendChild(nu);
      setTimeout(() => {
        if (old && old !== nu) old.remove();
        nu.classList.remove("g-new");
        nu.id = "gImg";
      }, 760);
      if (old) old.removeAttribute("id");
      tag.classList.remove("swing");
      void tag.offsetWidth;
      tag.classList.add("swing");
      setTimeout(() => {
        $("#gtCat").textContent = p.cat;
        $("#gtName").textContent = p.name;
        $("#gtPrice").textContent = inr(p.price);
        tag.setAttribute("href", "#/p/" + p.id);
      }, 180);
    }),
  );
  /* hero parallax on the garland */
  const hero = $("#hero");
  if (hero && FINE.matches && !REDUCED.matches) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty(
        "--mx",
        ((e.clientX - r.left) / r.width - 0.5).toFixed(3),
      );
      hero.style.setProperty(
        "--my",
        ((e.clientY - r.top) / r.height - 0.5).toFixed(3),
      );
    });
  }
  /* shelves: the hovered panel opens, the last one stays open */
  $$(".shelf").forEach((s) => {
    const open = () => {
      $$(".shelf").forEach((x) => x.classList.toggle("on", x === s));
    };
    s.addEventListener("mouseenter", open);
    s.addEventListener("focus", open);
  });
  bindCal();
}

/* =====================================================================
   SHOP — Flipkart-style sort tabs + filters (no sidebar)
   ===================================================================== */
const SORTS = [
  ["featured", "Relevance"],
  ["low", "Price: low to high"],
  ["high", "Price: high to low"],
  ["rated", "Rating"],
  ["off", "Discount"],
];
function shopList() {
  let list = live();
  if (S.filter !== "All") list = list.filter((p) => p.cat === S.filter);
  if (S.query) {
    const q = S.query.toLowerCase();
    list = list.filter((p) => searchScore(p, q) > 0);
  }
  if (S.maxPrice != null) list = list.filter((p) => p.price <= S.maxPrice);
  if (S.stockOnly) list = list.filter((p) => p.stock > 0);
  if (S.minRating) list = list.filter((p) => p.rating >= S.minRating);
  const s = S.sort;
  if (s === "low") list = [...list].sort((a, b) => a.price - b.price);
  if (s === "high") list = [...list].sort((a, b) => b.price - a.price);
  if (s === "rated")
    list = [...list].sort(
      (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    );
  if (s === "off") list = [...list].sort((a, b) => offOf(b) - offOf(a));
  return list;
}
const priceCeil = () =>
  Math.max(
    100,
    Math.ceil(Math.max(...live().map((p) => p.price), 100) / 100) * 100,
  );
function vShop(cat) {
  S.filter = cat || "All";
  const ceil = priceCeil();
  if (S.maxPrice != null && S.maxPrice > ceil) S.maxPrice = null;
  const all = live();
  const chips = ["All", ...CATS.map((c) => c.id)]
    .map((c) => {
      const n =
        c === "All" ? all.length : all.filter((p) => p.cat === c).length;
      return `<a class="chip${c === S.filter ? " on" : ""}" href="#/shop${c === "All" ? "" : "/" + enc(c)}">${esc(c)} <b class="num">${n}</b></a>`;
    })
    .join("");
  const title = S.filter === "All" ? "Everything we stock" : S.filter;
  return `
  <div class="wrap">
    <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a><i>/</i><span>${esc(S.filter === "All" ? "All products" : S.filter)}</span></nav>
    <header class="page-head"><h1>${esc(title)}</h1><p id="shopCount"></p></header>
    <div class="chips" id="shopChips">${chips}</div>
    <div class="toolbar">
      <div class="sorts" id="sorts" role="group" aria-label="Sort products"><span class="sorts-l">Sort by</span>
        ${SORTS.map(([k, l]) => `<button class="sort${S.sort === k ? " on" : ""}" data-k="${k}">${l}</button>`).join("")}</div>
      <div class="filters">
        <label class="rng">Up to <b class="num" id="rngOut">${inr(S.maxPrice == null ? ceil : S.maxPrice)}</b>
          <input type="range" id="rng" min="100" max="${ceil}" step="50" value="${S.maxPrice == null ? ceil : S.maxPrice}" aria-label="Maximum price"></label>
        <label class="tgl"><input type="checkbox" id="rate4"${S.minRating ? " checked" : ""}><span></span>4★ &amp; above</label>
        <label class="tgl"><input type="checkbox" id="instock"${S.stockOnly ? " checked" : ""}><span></span>In stock</label>
      </div>
    </div>
    ${S.query ? `<div class="qpill">Showing results for <b>“${esc(S.query)}”</b><button onclick="S.query='';render()" aria-label="Clear search">${ic("x")}</button></div>` : ""}
    <div id="shopGrid" class="grid g4"></div>
  </div>`;
}
function refreshShop() {
  const list = shopList(),
    g = $("#shopGrid");
  if (!g) return;
  $("#shopCount").textContent =
    `${list.length} ${list.length === 1 ? "product" : "products"}${S.query ? ` matching “${S.query}”` : ""}. Prices include GST.`;
  g.innerHTML = list.length
    ? list.map(pcard).join("")
    : `<div class="grid-empty">${emptyBlock("search", "Nothing matches those filters", "Try a shorter search word, or clear the filters and browse a shelf instead.", `<button class="btn btn-p" onclick="clearFilters()">Clear filters</button>`)}</div>`;
  reveal();
}
function clearFilters() {
  S.query = "";
  S.maxPrice = null;
  S.stockOnly = false;
  S.minRating = 0;
  S.sort = "featured";
  render();
}
function bindShop() {
  $$("#sorts .sort").forEach((b) =>
    b.addEventListener("click", () => {
      S.sort = b.dataset.k;
      $$("#sorts .sort").forEach((x) => x.classList.toggle("on", x === b));
      refreshShop();
    }),
  );
  const r = $("#rng");
  r.addEventListener("input", () => {
    const v = +r.value;
    S.maxPrice = v >= priceCeil() ? null : v;
    $("#rngOut").textContent = inr(v);
    refreshShop();
  });
  $("#rate4").addEventListener("change", (e) => {
    S.minRating = e.target.checked ? 4 : 0;
    refreshShop();
  });
  $("#instock").addEventListener("change", (e) => {
    S.stockOnly = e.target.checked;
    refreshShop();
  });
  refreshShop();
}

/* =====================================================================
   PRODUCT PAGE — gallery + zoom, Add to cart / Buy now, pincode check
   ===================================================================== */
let pdQty = 1;
function offerList(p) {
  const o = [
    [
      "truck",
      "<b>Free delivery</b> on every order across India. No minimum basket.",
    ],
    [
      "sparkle",
      `<b>Free ${FREE_GIFT.name}</b> worth ${inr(FREE_GIFT.worth)} when your order is ${inr(FREE_GIFT.min)} or more.`,
    ],
  ];
  S.coupons
    .filter((c) => c.active !== false)
    .slice(0, 2)
    .forEach((c) =>
      o.push(["tag", `<b>Coupon ${esc(c.code)}</b>: ${esc(c.note)}.`]),
    );
  return o.map(([i, t]) => `<li>${ic(i)}<span>${t}</span></li>`).join("");
}
function vProduct(id) {
  const p = findP(id);
  if (!p || (p.active === false && !S.admin))
    return `<div class="wrap">${emptyBlock("bag", "That product is not here", "It may have been taken off the shelf.", `<a class="btn btn-p" href="#/shop">Back to the catalogue</a>`)}</div>`;
  pdQty = 1;
  const gal = galleryOf(p),
    off = offOf(p),
    out = p.stock < 1;
  const rel = live()
    .filter((x) => x.cat === p.cat && x.id !== p.id)
    .slice(0, 4);
  const pin = DB.read("pin", "");
  const hi = Object.entries(p.specs || {}).slice(0, 4);
  return `
  <div class="wrap">
    <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a><i>/</i><a href="#/shop/${enc(p.cat)}">${esc(p.cat)}</a><i>/</i><span>${esc(p.name)}</span></nav>
    <section class="pd">
      <div class="pd-media">
        <div class="pd-thumbs" id="pdThumbs">${thumbsOf(p)
      .map(
        (g, i) =>
          `<button class="pd-th${i ? "" : " on"}" data-i="${i}" data-z="${g.z}" data-x="${g.x}" data-y="${g.y}" aria-label="Show ${g.crop ? "close-up" : "photo"} ${i + 1} of 4"><img src="${g.src}" alt="" data-w="${g.white ? 1 : 0}" style="transform:scale(${g.z});transform-origin:${g.x}% ${g.y}%"></button>`,
      )
      .join("")}</div>
        <div class="pd-stage" id="pdStage">
          <img id="pdMain" src="${gal[0].src}" alt="${esc(p.name)}" data-w="${gal[0].white ? 1 : 0}" width="760" height="760" fetchpriority="high">
          <button class="wish pd-wish${S.wish.includes(p.id) ? " on" : ""}" onclick="toggleWish('${p.id}',this)" aria-label="Save to wishlist">${ic("heart")}</button>
        </div>
        <div class="pd-cta">
          <button class="btn btn-glow btn-lg" ${out ? "disabled" : ""} onclick="addToCart('${p.id}',pdQty,this)">${ic("bag")}Add to cart</button>
          <button class="btn btn-p btn-lg" ${out ? "disabled" : ""} onclick="buyNow('${p.id}',pdQty)">Buy now</button>
        </div>
      </div>
      <div class="pd-info">
        <a class="pd-cat" href="#/shop/${enc(p.cat)}">${esc(p.cat)}</a>
        <h1>${esc(p.name)}</h1>
        <div class="pd-rate">${p.reviews > 0 ? `<span class="rpill">${p.rating.toFixed(1)}${ic("star")}</span><span>${p.reviews} ratings</span>` : `<span class="newtag">New arrival</span>`}</div>
        <div class="pd-price"><b class="num">${inr(p.price)}</b>${p.mrp > p.price ? `<s class="num">${inr(p.mrp)}</s><em>${off}% off</em>` : ""}</div>
        <p class="pd-tax">Inclusive of all taxes. Delivery is free.</p>
        <p class="pd-stock ${out ? "bad" : p.stock < 20 ? "low" : "good"}">${out ? "Currently unavailable" : p.stock < 20 && p.stock < 900 ? `Only ${p.stock} left` : "In stock, ships within 24 hours"}</p>

        ${p.cat === "Customize" ? `<div class="pd-block pd-cz">${ic("camera")}<div><h3>Made with your photos</h3><p>Add to cart, then upload your photos and the text you want printed. We ask for everything we need before you can place the order.</p></div></div>` : ""}
        <div class="pd-block"><h3>Available offers</h3><ul class="offers">${offerList(p)}</ul></div>

        <div class="pd-block pd-deliv"><h3>Delivery</h3>
          <div class="pin"><label class="sr" for="pdPin">Delivery pin code</label>
            ${ic("pin")}<input id="pdPin" inputmode="numeric" maxlength="6" placeholder="Enter pin code" value="${esc(pin)}">
            <button class="pin-go" onclick="checkPin('${p.id}')">Check</button></div>
          <p class="pin-out" id="pinOut">${pin.length === 6 ? pinMsg(p, pin) : "Enter your pin code to see the delivery date."}</p>
        </div>

        <div class="pd-block pd-qtyrow"><h3>Quantity</h3>
          <div class="qty"><button onclick="bumpQty(-1)" aria-label="Reduce quantity">${ic("minus")}</button><span id="pdq" class="num" aria-live="polite">1</span><button onclick="bumpQty(1)" aria-label="Increase quantity">${ic("plus")}</button></div></div>

        <div class="pd-block"><h3>About this item</h3><p class="pd-blurb">${esc(p.blurb)}</p>
          ${hi.length ? `<ul class="hi">${hi.map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("")}</ul>` : ""}</div>

        <div class="pd-block"><h3>Specifications</h3>
          <dl class="spec">${Object.entries(p.specs || {})
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join(
        "",
      )}<div><dt>Product code</dt><dd>${esc(p.id)}</dd></div></dl></div>

        <div class="pd-perks">
          <div>${ic("undo")}<span>7-day easy returns</span></div>
          <div>${ic("shield")}<span>Secure payments</span></div>
          <div>${ic("tag")}<span>Sold by Lemurra Traders</span></div>
        </div>
      </div>
    </section>
    ${rel.length ? `<section class="sec sec-flush"><h2 class="h2s">More from ${esc(p.cat)}</h2><div class="grid g4">${rel.map(pcard).join("")}</div></section>` : ""}
  </div>
  <div class="pd-bar" id="pdBar"><div class="pd-bar-p"><b class="num">${inr(p.price)}</b>${p.mrp > p.price ? `<s class="num">${inr(p.mrp)}</s>` : ""}</div>
    <button class="btn btn-glow" ${out ? "disabled" : ""} onclick="addToCart('${p.id}',pdQty,this)">Add to cart</button>
    <button class="btn btn-p" ${out ? "disabled" : ""} onclick="buyNow('${p.id}',pdQty)">Buy now</button></div>`;
}
function pinMsg(p, pin) {
  if (p.stock < 1) return "This item is currently unavailable.";
  const d = etaFor(pin, [{ id: p.id }]);
  return `Delivery by <b>${fmtDate(d)}</b> to ${esc(pin)}. <b class="ok">Free</b>`;
}
function checkPin(id) {
  const pin = ($("#pdPin").value || "").replace(/\D/g, ""),
    out = $("#pinOut");
  if (pin.length !== 6) {
    out.innerHTML = `<span class="bad">Enter a valid 6-digit pin code.</span>`;
    return;
  }
  DB.write("pin", pin);
  out.innerHTML = pinMsg(findP(id), pin);
}
function bumpQty(d) {
  pdQty = Math.max(1, Math.min(20, pdQty + d));
  $("#pdq").textContent = pdQty;
}
function buyNow(id, qty) {
  const p = findP(id);
  if (!p || p.stock < 1) return;
  if (p.cat === "Customize") {
    addToCart(id, qty || 1);
    toast("Add your photos and text in the cart to continue.");
    go("#/cart");
    return;
  }
  S.buyNow = { id, qty: qty || 1 };
  S.co = { step: 1, addr: null, pay: "upi" };
  go("#/checkout");
}
function bindProduct() {
  const st = $("#pdStage"),
    main = $("#pdMain");
  if (!st) return;
  if (FINE.matches && !REDUCED.matches) {
    st.addEventListener("mousemove", (e) => {
      const r = st.getBoundingClientRect();
      st.style.setProperty(
        "--zx",
        (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%",
      );
      st.style.setProperty(
        "--zy",
        (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%",
      );
    });
  }
  $$("#pdThumbs .pd-th").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#pdThumbs .pd-th").forEach((x) => x.classList.toggle("on", x === b));
      const im = b.querySelector("img");
      main.classList.add("swap");
      setTimeout(() => {
        main.src = im.src;
        main.dataset.w = im.dataset.w;
        main.style.setProperty("--bz", b.dataset.z || 1);
        main.style.setProperty("--bx", (b.dataset.x || 50) + "%");
        main.style.setProperty("--by", (b.dataset.y || 50) + "%");
        main.classList.remove("swap");
      }, 160);
    }),
  );
  const pin = $("#pdPin");
  if (pin)
    pin.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $(".pin-go").click();
      }
    });
}

/* =====================================================================
   CART — Flipkart-style: items on the left, price details on the right
   ===================================================================== */
function giftBar(P) {
  if (P.sell >= FREE_GIFT.min)
    return `<div class="gift ok">${ic("sparkle")}<span><b>A free ${FREE_GIFT.name} worth ${inr(FREE_GIFT.worth)}</b> will be added to this order.</span></div>`;
  const pct = Math.min(100, Math.round((P.sell / FREE_GIFT.min) * 100));
  return `<div class="gift">${ic("sparkle")}<span>Add <b>${inr(FREE_GIFT.min - P.sell)}</b> more to get a free ${FREE_GIFT.name} worth ${inr(FREE_GIFT.worth)}.<i class="gift-bar"><u style="width:${pct}%"></u></i></span></div>`;
}
/* the "Price details" card, shared by cart and checkout */
function priceBox(items, opts) {
  opts = opts || {};
  const P = priceLines(items);
  const cpn = P.coupon && !P.coupon.err;
  return `<aside class="price-box${opts.sticky === false ? "" : " sticky"}" id="priceBox">
    <h3>Price details</h3>
    <div class="pr"><span>Price (${P.count} ${P.count === 1 ? "item" : "items"})</span><span class="num">${inr(P.mrp)}</span></div>
    ${P.discount > 0 ? `<div class="pr ok"><span>Discount</span><span class="num">− ${inr(P.discount)}</span></div>` : ""}
    ${cpn ? `<div class="pr ok"><span>Coupon (${esc(P.coupon.code)}) <button class="lnk" onclick="removeCoupon()">Remove</button></span><span class="num">− ${inr(P.couponOff)}</span></div>` : ""}
    <div class="pr"><span>Delivery charges</span><span><s class="num">${inr(40)}</s> <b class="ok">Free</b></span></div>
    <div class="pr tot"><span>Total amount</span><span class="num">${inr(P.total)}</span></div>
    ${P.saved > 0 ? `<p class="save">You will save ${inr(P.saved)} on this order</p>` : ""}
    ${opts.coupon === true ? couponBox(P) : ""}
    ${giftBar(P)}
    ${opts.foot || ""}
    <p class="safe">${ic("shield")}<span>Safe and secure payments. Easy 7-day returns.</span></p>
  </aside>`;
}
function couponBox(P) {
  const avail = S.coupons.filter((c) => c.active !== false);
  return `<div class="cpn"><label for="cpnIn">Have a coupon?</label>
    <div class="cpn-row"><input id="cpnIn" placeholder="Enter code" autocomplete="off" value="${esc(P.coupon && !P.coupon.err ? "" : "")}" onkeydown="if(event.key==='Enter'){applyCoupon()}"><button class="btn btn-o btn-sm" onclick="applyCoupon()">Apply</button></div>
    ${P.coupon && P.coupon.err ? `<p class="cpn-err">${esc(P.coupon.err)}</p>` : ""}
    ${avail.length ? `<div class="cpn-list">${avail.map((c) => `<button class="cpn-chip${S.coupon === c.code ? " on" : ""}" onclick="applyCoupon('${esc(c.code)}')" title="${esc(c.note)}">${ic("tag")}${esc(c.code)}</button>`).join("")}</div>` : ""}</div>`;
}
function applyCoupon(code) {
  code = (code || ($("#cpnIn") || {}).value || "").trim().toUpperCase();
  if (!code) {
    toast("Enter a coupon code first.", "err");
    return;
  }
  const items = checkoutItems().length ? checkoutItems() : S.cart;
  const P = priceLines(items);

  API.post("/coupons/apply", { code: code, subtotal: P.sell }).then(res => {
    if (res && res.success && res.coupon) {
      const serverCpn = res.coupon;
      const idx = S.coupons.findIndex(x => x.code.toUpperCase() === serverCpn.code.toUpperCase());
      if (idx >= 0) S.coupons[idx] = { ...S.coupons[idx], ...serverCpn, active: true };
      else S.coupons.unshift({ ...serverCpn, active: true });
      DB.write("coupons", S.coupons);

      S.coupon = serverCpn.code;
      DB.write("coupon", serverCpn.code);
      const newP = priceLines(items);
      toast(`Coupon ${serverCpn.code} applied! You save ${inr(newP.couponOff)}.`);
      render();
    } else {
      toast((res && res.message) || `“${code}” is not a valid coupon.`, "err");
    }
  }).catch(err => {
    const c = S.coupons.find((x) => x.code.toUpperCase() === code && x.active !== false);
    if (c) {
      S.coupon = c.code;
      DB.write("coupon", c.code);
      const newP = priceLines(items);
      if (newP.coupon && newP.coupon.err) {
        toast(newP.coupon.err, "err");
      } else {
        toast(`Coupon ${c.code} applied! You save ${inr(newP.couponOff)}.`);
      }
      render();
    } else {
      toast(err.message || `“${code}” is not a valid coupon.`, "err");
    }
  });
}
function removeCoupon() {
  S.coupon = "";
  DB.drop("coupon");
  toast("Coupon removed.");
  render();
}

function vCart() {
  S.buyNow = null;
  if (!S.cart.length)
    return `<div class="wrap">${emptyBlock("bag", "Your cart is empty", "Add items to it now and they will wait here.", `<a class="btn btn-p btn-lg" href="#/shop">Shop now</a>`)}</div>`;
  const P = priceLines(S.cart);
  const pin = DB.read(
    "pin",
    (S.user &&
      S.user.addresses &&
      S.user.addresses[0] &&
      S.user.addresses[0].pin) ||
    "",
  );
  return `
  <div class="wrap">
    <div class="cart-l">
      <div class="cart-main">
        <div class="cart-h"><h1>My cart <span class="num">(${P.count})</span></h1>
          <div class="cart-pin">${ic("pin")}<span>Deliver to <b>${pin ? esc(pin) : "—"}</b></span><button class="lnk" onclick="cartPin()">${pin ? "Change" : "Add pin code"}</button></div></div>
        ${(() => {
      const m = czMissing().length;
      return `<div class="cz-banner" id="czBanner" ${m ? "" : "hidden"}>${ic("camera")}<span><b id="czBannerN">${m}</b> personalised item needs your photos and text before you can place the order.</span></div>`;
    })()}
        <div class="cart-lines">
        ${S.cart
      .map((i) => {
        const p = findP(i.id);
        if (!p) return "";
        const off = offOf(p),
          eta = etaFor(pin || "", [i]);
        return `<div class="ci">
            <a class="ci-img" href="#/p/${p.id}">${pimg(p, "", 'width="120" height="120" loading="lazy"')}</a>
            <div class="ci-body">
              <a class="ci-name" href="#/p/${p.id}">${esc(p.name)}</a>
              <span class="ci-sub">Sold by Lemurra Traders</span>
              <div class="ci-price"><b class="num">${inr(p.price)}</b>${p.mrp > p.price ? `<s class="num">${inr(p.mrp)}</s><em>${off}% off</em>` : ""}</div>
              <span class="ci-eta">Delivery by <b>${fmtDate(eta)}</b> <b class="ok">Free</b></span>
              ${p.stock < i.qty ? `<span class="ci-warn">Only ${p.stock} available. Reduce the quantity to continue.</span>` : ""}
            </div>
            <div class="ci-side">
              <div class="qty"><button onclick="setQty('${p.id}',${i.qty - 1})" aria-label="Reduce quantity">${ic("minus")}</button><span class="num">${i.qty}</span><button onclick="setQty('${p.id}',${i.qty + 1})" aria-label="Increase quantity">${ic("plus")}</button></div>
              <div class="ci-acts"><button class="lnk" onclick="moveToWish('${p.id}')">Move to wishlist</button><button class="lnk bad" onclick="removeLine('${p.id}')">Remove</button></div>
            </div>${isCustom(p) ? czPanel(i, p) : ""}</div>`;
      })
      .join("")}
        </div>
        <div class="cart-foot"><a class="btn btn-o" href="#/shop">Keep shopping</a><button class="btn btn-glow btn-lg" onclick="placeFromCart()">Place order</button></div>
      </div>
      ${priceBox(S.cart)}
    </div>
  </div>`;
}
/* ---------- personalised (Customize) items: photos + text collected in the cart ---------- */
const CZ_MAX = 12;
const isCustom = (p) => !!p && p.cat === "Customize";
const isCalendar = (p) => !!p && /calendar/i.test(p.name);
const czOk = (i) => {
  const c = i.custom || {};
  return (c.photos || []).length > 0 && String(c.text || "").trim().length > 0;
};
const czMissing = () =>
  S.cart.filter((i) => {
    const p = findP(i.id);
    return isCustom(p) && !czOk(i);
  });
function czLine(id) {
  const l = S.cart.find((i) => i.id === id);
  if (l && !l.custom) l.custom = { photos: [], text: "", month: "", note: "" };
  return l;
}
function czMonthOpts(sel) {
  const d = new Date();
  let out = `<option value="">Choose a start month</option>`;
  for (let i = 0; i < 14; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() + i, 1),
      v = MONTHS[t.getMonth()] + " " + t.getFullYear();
    out += `<option${v === sel ? " selected" : ""}>${v}</option>`;
  }
  return out;
}
function czPanel(i, p) {
  const c = i.custom || { photos: [], text: "", month: "", note: "" },
    n = c.photos.length,
    ok = czOk(i),
    id = esc(i.id);
  return `<div class="cz${ok ? " ok" : ""}" id="cz-${id}">
    <div class="cz-h">${ic("camera")}<div><b>Your details for this ${isCalendar(p) ? "calendar" : "item"}</b><small>We need these before we can make it.</small></div>
      <span class="cz-badge">${ok ? "Ready" : "Details needed"}</span></div>
    <div class="cz-b">
      <div class="field"><span class="lbl">Photos <em>(${n} of ${CZ_MAX}${isCalendar(p) ? ", one for each month is ideal" : ""})</em></span>
        <div class="cz-ph">${c.photos.map((ph, k) => `<span class="cz-t"><img src="${ph.src}" alt="Your photo ${k + 1}"><button type="button" aria-label="Remove photo ${k + 1}" onclick="czDel('${id}',${k})">${ic("x")}</button></span>`).join("")}
          ${n < CZ_MAX ? `<label class="cz-add"><input type="file" accept="image/*" multiple hidden onchange="czAdd('${id}',this.files);this.value=''">${ic("upload")}<b>Add</b></label>` : ""}</div>
        <div class="err cz-e-ph"></div></div>
      <div class="field"><label for="czt-${id}">Text to print <em>(name, greeting or caption)</em></label>
        <input id="czt-${id}" maxlength="60" placeholder="e.g. Aarav, age 3 · Happy New Year from the Sharma family" value="${esc(c.text || "")}" oninput="czText('${id}','text',this.value)" autocomplete="off">
        <div class="err cz-e-tx"></div></div>
      ${isCalendar(p) ? `<div class="field"><label for="czm-${id}">Start month</label><select id="czm-${id}" onchange="czText('${id}','month',this.value)">${czMonthOpts(c.month)}</select></div>` : ""}
      <div class="field"><label for="czn-${id}">Anything else we should know? <em>(optional)</em></label>
        <textarea id="czn-${id}" rows="2" maxlength="300" placeholder="Which photo goes on the cover, dates to mark, colours to avoid…" oninput="czText('${id}','note',this.value)">${esc(c.note || "")}</textarea></div>
      ${i.qty > 1 ? `<p class="cz-hint">All ${i.qty} copies will use these photos and this text.</p>` : ""}
    </div></div>`;
}
let _czT = 0;
function czText(id, key, val) {
  const l = czLine(id);
  if (!l) return;
  l.custom[key] = val;
  clearTimeout(_czT);
  _czT = setTimeout(save, 350);
  czRefresh(id);
}
function czRefresh(id) {
  const l = S.cart.find((i) => i.id === id),
    box = document.getElementById("cz-" + id);
  if (!l || !box) return;
  const ok = czOk(l);
  box.classList.toggle("ok", ok);
  box.querySelector(".cz-badge").textContent = ok ? "Ready" : "Details needed";
  if (String((l.custom || {}).text || "").trim())
    box.querySelector(".cz-e-tx").textContent = "";
  const b = $("#czBanner");
  if (b) {
    const m = czMissing().length;
    b.hidden = !m;
    const s = $("#czBannerN");
    if (s) s.textContent = m;
  }
}
async function czAdd(id, files) {
  const l = czLine(id);
  if (!l || !files || !files.length) return;
  const room = CZ_MAX - l.custom.photos.length,
    list = [...files].slice(0, room);
  if (files.length > room)
    toast(
      `Only ${CZ_MAX} photos per item. The first ${room} were added.`,
      "err",
    );
  for (const f of list) {
    try {
      const ph = await fileToPhoto(f, 800, 0.72);
      l.custom.photos.push({ src: ph.src, name: String(f.name).slice(0, 40) });
    } catch (e) {
      toast(e.message, "err");
    }
  }
  save();
  render();
}
function czDel(id, k) {
  const l = czLine(id);
  if (!l) return;
  l.custom.photos.splice(k, 1);
  save();
  render();
}
/* returns true when every personalised item is complete; otherwise scrolls to the first gap */
function czGate() {
  const miss = czMissing();
  if (!miss.length) return true;
  miss.forEach((i) => {
    const box = document.getElementById("cz-" + i.id);
    if (!box) return;
    const c = i.custom || {};
    box.querySelector(".cz-e-ph").textContent = (c.photos || []).length
      ? ""
      : "Add at least one photo.";
    box.querySelector(".cz-e-tx").textContent = String(c.text || "").trim()
      ? ""
      : "Tell us what text to print.";
    box.classList.add("need");
  });
  const first = document.getElementById("cz-" + miss[0].id);
  if (first)
    first.scrollIntoView({
      behavior: REDUCED.matches ? "auto" : "smooth",
      block: "center",
    });
  toast("Please add your photos and text for the personalised item.", "err");
  return false;
}
function moveToWish(id) {
  if (!S.wish.includes(id)) S.wish.push(id);
  S.cart = S.cart.filter((i) => i.id !== id);
  save();
  badges();
  render();
  toast("Moved to wishlist");
}
function placeFromCart() {
  if (!czGate()) return;
  const bad = S.cart.find((i) => {
    const p = findP(i.id);
    return !p || p.stock < i.qty;
  });
  if (bad) {
    toast(
      "Some items are unavailable in that quantity. Please update your cart.",
      "err",
    );
    return;
  }
  S.buyNow = null;
  S.co = { step: 1, addr: null, pay: "upi" };
  go("#/checkout");
}
function cartPin() {
  modal(
    "Delivery pin code",
    `<p class="m-note">We use your pin code to estimate the delivery date.</p><div class="field"><label for="mPin">Pin code</label><input id="mPin" inputmode="numeric" maxlength="6" placeholder="600054" value="${esc(DB.read("pin", ""))}"><div class="err" id="eMPin"></div></div>`,
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="savePin()">Save pin code</button>`,
  );
}
function savePin() {
  const v = ($("#mPin").value || "").replace(/\D/g, "");
  if (v.length !== 6) {
    $("#eMPin").textContent = "Pin codes are six digits.";
    return;
  }
  DB.write("pin", v);
  closeModal();
  render();
  toast("Pin code saved.");
}

/* ---------- WISHLIST ---------- */
function vWish() {
  const list = S.wish.map(findP).filter(Boolean);
  return `<div class="wrap"><header class="page-head"><h1>Wishlist</h1><p>${list.length} saved. Only you can see this list.</p></header>
    ${list.length
      ? `<div class="grid g4">${list.map(pcard).join("")}</div>`
      : emptyBlock(
        "heart",
        "Nothing saved yet",
        "Tap the heart on any product to keep it here for later.",
        `<a class="btn btn-p" href="#/shop">Find something</a>`,
      )
    }</div>`;
}

/* =====================================================================
   CHECKOUT — Login → Delivery address → Order summary → Payment
   ===================================================================== */
const PAYMENTS = [
  {
    k: "razorpay",
    t: "Razorpay (UPI, Cards, Netbanking, Wallets)",
    s: "Instant & 100% secure payment via Razorpay. Supports Google Pay, PhonePe, Paytm, all debit/credit cards & netbanking.",
    i: "shield",
  },
];
const payLabel = (k) => (PAYMENTS.find((p) => p.k === k) || { t: k === "razorpay" ? "Razorpay" : k }).t;

function stepHead(step, n, title, done, sum, fn) {
  const showDone = done && step !== n;
  return `<header class="cs-h"><span class="cs-n${done ? " ok" : ""}">${done ? ic("check") : n}</span>
    <div class="cs-t"><h2>${title}</h2>${showDone ? `<p>${sum}</p>` : ""}</div>
    ${showDone ? `<button class="btn btn-o btn-sm" onclick="${fn}">Change</button>` : ""}</header>`;
}
function addrText(a) {
  a = a || {};
  const line = a.line || a.line1 || "";
  const lm = a.landmark || a.line2 || "";
  return `${esc(line)}${lm ? ", " + esc(lm) : ""}, ${esc(a.city || "")}, ${esc(a.state || "")} – <b>${esc(a.pin || "")}</b>`;
}

function vCheckout() {
  const items = checkoutItems();
  if (!items.length)
    return `<div class="wrap">${emptyBlock("bag", "Nothing to check out", "Your cart is empty. Add something and come back.", `<a class="btn btn-p btn-lg" href="#/shop">Shop now</a>`)}</div>`;
  const u = S.user;
  if (!u) S.co.step = 1;
  else if (S.co.step === 1) S.co.step = 2;
  const step = S.co.step;
  const addrs = (u && u.addresses) || [];
  if (addrs.length && (!S.co.addr || !addrs.some((a) => String(a.id) === String(S.co.addr)))) {
    const def = addrs.find((a) => a.is_default) || addrs[0];
    S.co.addr = def.id;
  }
  if (step > 2 && !addrs.find((a) => String(a.id) === String(S.co.addr))) S.co.step = 2;
  const st = S.co.step,
    addr = addrs.find((a) => String(a.id) === String(S.co.addr));
  const P = priceLines(items);
  const cls = (n) => "cs" + (st === n ? " on" : st > n ? " done" : "");

  return `
  <div class="wrap">
    <div class="co-top"><h1>Checkout</h1><span class="co-secure">${ic("shield")}Secure checkout</span></div>
    <div class="cart-l">
      <div class="cs-list">
        <section class="${cls(1)}">
          ${stepHead(st, 1, "Login", !!u, u ? `<b>${esc(u.name)}</b> &nbsp;${esc(u.email)}` : "", "coChange(1)")}
          ${st === 1 ? `<div class="cs-b">${authFormHTML("co")}</div>` : ""}
        </section>

        <section class="${cls(2)}">
          ${stepHead(st, 2, "Delivery address", st > 2 && !!addr, addr ? `<b>${esc(addr.name)}</b> &nbsp;${addrText(addr)}` : "", "coChange(2)")}
          ${st === 2 ? `<div class="cs-b">${addressStep(addrs)}</div>` : ""}
        </section>

        <section class="${cls(3)}">
          ${stepHead(st, 3, "Order summary", st > 3, `${P.count} ${P.count === 1 ? "item" : "items"}`, "coChange(3)")}
          ${st === 3 ? `<div class="cs-b">${summaryStep(items, addr)}</div>` : ""}
        </section>

        <section class="${cls(4)}">
          ${stepHead(st, 4, "Payment options", false, "", "")}
          ${st === 4 ? `<div class="cs-b">${paymentStep(P)}</div>` : ""}
        </section>
        <p class="co-fine">Delivery dates are estimates. Your order is confirmed the moment you place it, and you can track it from Account, then Orders.</p>
      </div>
      ${priceBox(items, { coupon: true })}
    </div>
  </div>`;
}
function coChange(n) {
  if (n === 1) {
    signOut(true);
  }
  S.co.step = n;
  render();
}

/* --- step 2: address book --- */
function addressStep(addrs) {
  if (!addrs.length) return addrForm(null, true);
  if (addrs.length && (!S.co.addr || !addrs.some((a) => String(a.id) === String(S.co.addr)))) {
    const def = addrs.find((a) => a.is_default) || addrs[0];
    S.co.addr = def.id;
  }
  return `<div class="addr-list" role="radiogroup" aria-label="Saved addresses">
    ${addrs
      .map(
        (a) => {
          const isSel = String(S.co.addr) === String(a.id);
          return `<div class="addr${isSel ? " sel" : ""}" style="cursor:pointer;" onclick="pickAddr('${a.id}')">
      <input type="radio" name="addr" value="${a.id}" ${isSel ? "checked" : ""} onchange="pickAddr('${a.id}')">
      <span class="addr-b"><b>${esc(a.name)}</b><em class="tag-t">${esc(a.type || "Home")}</em><span class="num">${esc(a.phone)}</span>
        <span class="addr-t">${addrText(a)}</span>
        <span class="addr-a" style="${isSel ? 'display:flex;' : 'display:none;'}">
          <button type="button" class="btn btn-glow btn-sm" onclick="event.preventDefault();event.stopPropagation();useAddr('${a.id}')">Deliver here</button>
          <button type="button" class="lnk" onclick="event.preventDefault();event.stopPropagation();editAddr('${a.id}')">Edit</button>
          <button type="button" class="lnk bad" onclick="event.preventDefault();event.stopPropagation();delAddr('${a.id}')">Delete</button>
        </span>
      </span>
    </div>`;
        }
      )
      .join("")}
  </div>
  <details class="addr-new" id="addrNew"><summary>${ic("plus")}Add a new address</summary>${addrForm(null, false)}</details>`;
}
function addrForm(a, first, bare) {
  a = a || {};
  const u = S.user || {};
  return `<div class="addr-form" id="addrForm">
    <div class="grid g2"><div class="field"><label for="aName">Full name</label><input id="aName" value="${esc(a.name || u.name || "")}" autocomplete="name"><div class="err" id="eAName"></div></div>
      <div class="field"><label for="aPhone">10-digit mobile number</label><input id="aPhone" inputmode="numeric" maxlength="10" value="${esc(a.phone || u.phone || "")}" autocomplete="tel"><div class="err" id="eAPhone"></div></div></div>
    <div class="grid g2"><div class="field"><label for="aPin">Pin code</label><input id="aPin" inputmode="numeric" maxlength="6" value="${esc(a.pin || DB.read("pin", ""))}" autocomplete="postal-code"><div class="err" id="eAPin"></div></div>
      <div class="field"><label for="aCity">City / district</label><input id="aCity" value="${esc(a.city || "")}" autocomplete="address-level2"><div class="err" id="eACity"></div></div></div>
    <div class="field"><label for="aLine">Address (house no., building, street, area)</label><textarea id="aLine" rows="2" autocomplete="street-address">${esc(a.line || "")}</textarea><div class="err" id="eALine"></div></div>
    <div class="grid g2"><div class="field"><label for="aState">State</label><select id="aState"><option value="">Select state</option>${STATES.map((s) => `<option${s === a.state ? " selected" : ""}>${s}</option>`).join("")}</select><div class="err" id="eAState"></div></div>
      <div class="field"><label for="aLand">Landmark (optional)</label><input id="aLand" value="${esc(a.landmark || "")}"></div></div>
    <fieldset class="seg"><legend>Address type</legend>
      <label><input type="radio" name="aType" value="Home" ${(a.type || "Home") === "Home" ? "checked" : ""}><span>Home</span></label>
      <label><input type="radio" name="aType" value="Work" ${a.type === "Work" ? "checked" : ""}><span>Work</span></label></fieldset>
    ${bare
      ? ""
      : `<div class="form-act"><button class="btn btn-glow" onclick="saveAddr(${a.id ? `'${a.id}'` : "null"})">Save and deliver here</button>
      ${first ? "" : `<button class="btn btn-o" onclick="render()">Cancel</button>`}</div>`
    }</div>`;
}
function pickAddr(id) {
  S.co.addr = id;
  $$(".addr").forEach((l) => {
    const inp = l.querySelector("input");
    const isSel = inp && String(inp.value) === String(id);
    l.classList.toggle("sel", isSel);
    if (inp) inp.checked = isSel;
    const acts = l.querySelector(".addr-a");
    if (acts) acts.style.display = isSel ? "flex" : "none";
  });
}
function useAddr(id) {
  S.co.addr = id;
  S.co.step = 3;
  render();
}
function saveAddr(id) {
  /* the same form can be on the page and in the edit modal, so read from whichever container is active */
  const root = $("#modal").classList.contains("on") ? $("#modalC") : document;
  const q = (k) => root.querySelector("#" + k);
  const v = (k) => ((q(k) || {}).value || "").trim();
  const E = (k, m) => {
    const e = q(k);
    if (e) e.textContent = m || "";
    return !m;
  };
  const a = {
    id: id || "a" + uid(),
    name: v("aName"),
    phone: v("aPhone").replace(/\D/g, ""),
    pin: v("aPin"),
    city: v("aCity"),
    line: v("aLine"),
    state: v("aState"),
    landmark: v("aLand"),
    type:
      (root.querySelector("input[name=aType]:checked") || {}).value || "Home",
  };
  let ok = E(
    "eAName",
    a.name.length >= 2 ? "" : "Enter the name for delivery.",
  );
  ok =
    E(
      "eAPhone",
      /^[6-9]\d{9}$/.test(a.phone)
        ? ""
        : "Enter a valid 10-digit mobile number.",
    ) && ok;
  ok =
    E("eAPin", /^[1-9]\d{5}$/.test(a.pin) ? "" : "Pin codes are six digits.") &&
    ok;
  ok =
    E("eACity", a.city.length >= 2 ? "" : "Enter your city or district.") && ok;
  ok =
    E(
      "eALine",
      a.line.length >= 8
        ? ""
        : "Enter the full address, at least 8 characters.",
    ) && ok;
  ok = E("eAState", a.state ? "" : "Choose a state.") && ok;
  if (!ok) return;
  S.user.addresses = S.user.addresses || [];
  const i = S.user.addresses.findIndex((x) => x.id === a.id);
  if (i > -1) S.user.addresses[i] = a;
  else S.user.addresses.unshift(a);
  saveUser();
  API.post("/user/addresses", {
    id: (typeof a.id === "number" || (a.id && !a.id.startsWith("a"))) ? a.id : null,
    name: a.name,
    phone: a.phone,
    line1: a.line,
    line2: a.landmark || "",
    city: a.city,
    state: a.state,
    pin: a.pin,
    label: a.type || "Home"
  }).then(res => {
    if (res && res.success && res.address) {
      a.id = res.address.id;
      saveUser();
    }
  });
  DB.write("pin", a.pin);
  const inCheckout = currentRoute().startsWith("checkout");
  if (inCheckout) {
    S.co.addr = a.id;
    S.co.step = 3;
  }
  if ($("#modal").classList.contains("on")) closeModal();
  render();
  toast("Address saved.");
}
function editAddr(id) {
  const a = S.user.addresses.find((x) => x.id === id);
  if (!a) return;
  modal(
    "Edit address",
    addrForm(a, true, true),
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveAddr('${id}')">Save address</button>`,
    { wide: true },
  );
}
function delAddr(id) {
  modal(
    "Delete this address?",
    `<p class="m-note">It will be removed from your saved addresses.</p>`,
    `<button class="btn btn-o" onclick="closeModal()">Keep it</button><button class="btn btn-d" onclick="confirmDelAddr('${id}')">Delete address</button>`,
  );
}
function confirmDelAddr(id) {
  S.user.addresses = S.user.addresses.filter((a) => a.id !== id);
  saveUser();
  if (S.co.addr === id) S.co.addr = null;
  closeModal();
  render();
  if (typeof id === "number" || (id && !id.startsWith("a"))) {
    API.delete("/user/addresses/" + id);
  }
  toast("Address deleted.");
}

/* --- step 3: order summary --- */
function summaryStep(items, addr) {
  const pin = addr ? addr.pin : "";
  return `<div class="sum-lines">${items
    .map((i) => {
      const p = findP(i.id);
      if (!p) return "";
      return `<div class="ci ci-s">
      <a class="ci-img" href="#/p/${p.id}">${pimg(p, "", 'width="96" height="96" loading="lazy"')}</a>
      <div class="ci-body"><a class="ci-name" href="#/p/${p.id}">${esc(p.name)}</a><span class="ci-sub">Sold by Lemurra Traders</span>
        <div class="ci-price"><b class="num">${inr(p.price * i.qty)}</b>${p.mrp > p.price ? `<s class="num">${inr(p.mrp * i.qty)}</s>` : ""}</div>
        <span class="ci-eta">Delivery by <b>${fmtDate(etaFor(pin, [i]))}</b> <b class="ok">Free</b></span></div>
      <div class="ci-side"><div class="qty"><button onclick="coQty('${p.id}',${i.qty - 1})" aria-label="Reduce quantity">${ic("minus")}</button><span class="num">${i.qty}</span><button onclick="coQty('${p.id}',${i.qty + 1})" aria-label="Increase quantity">${ic("plus")}</button></div></div>${isCustom(p) ? czPanel(i, p) : ""}</div>`;
    })
    .join("")}</div>
    <div class="field"><label for="coNote">Note for this order (optional)</label><textarea id="coNote" rows="2" maxlength="300" placeholder="Gift wrapping, delivery timing, personalisation details…">${esc(S.note || "")}</textarea></div>
    <div class="form-act"><button class="btn btn-glow btn-lg" onclick="coNext()">Continue</button></div>`;
}
function coQty(id, q) {
  if (q < 1) {
    if (S.buyNow) {
      S.buyNow = null;
      go("#/cart");
    } else removeLine(id);
    return;
  }
  if (S.buyNow) S.buyNow.qty = Math.min(q, 20);
  else setQty(id, q);
  render();
}
function coNext() {
  if (!czGate()) return;
  S.note = ($("#coNote") || {}).value || S.note;
  const bad = checkoutItems().find((i) => {
    const p = findP(i.id);
    return !p || p.stock < i.qty;
  });
  if (bad) {
    toast(
      "An item in your order is no longer available in that quantity.",
      "err",
    );
    return;
  }
  S.co.step = 4;
  render();
}

/* --- step 4: payment --- */
function paymentStep(P) {
  S.co.pay = "razorpay";
  const m = "razorpay";
  const cpn = P.coupon && !P.coupon.err;
  return `<div class="pm-list" role="radiogroup" aria-label="Payment method">
    ${PAYMENTS.map(
    (
      x,
    ) => `<label class="pm sel"><input type="radio" name="pay" value="${x.k}" checked onchange="S.co.pay='${x.k}';render()">
      <span class="pm-i">${ic(x.i)}</span><span class="pm-t"><b>${x.t}</b><small>${x.s}</small></span></label>`,
  ).join("")}</div>
    ${cpn ? `
      <div style="margin:12px 0;padding:12px 16px;background:#eef8f1;border-radius:10px;border:1px solid #94d3a2;display:flex;align-items:center;justify-content:space-between;color:#0C4A32;">
        <span style="font-weight:700;display:flex;align-items:center;gap:6px;">${ic("tag")}Coupon ${esc(P.coupon.code)} Applied</span>
        <b class="ok" style="font-size:15px;color:#0C4A32;">− ${inr(P.couponOff)} discount</b>
      </div>
    ` : ""}
    <div style="margin:14px 0;padding:14px 16px;background:#f3f9f5;border-radius:10px;border:1px solid #cce5d7;display:flex;align-items:flex-start;gap:12px;font-size:13.5px;color:#0C4A32;">
      <span style="font-size:18px;margin-top:2px;">${ic("shield")}</span>
      <div>
        <b style="display:block;margin-bottom:2px;">100% Secure Razorpay Payment Gateway</b>
        <span>Pay with UPI (Google Pay, PhonePe, Paytm), debit and credit cards, netbanking, or wallets. We’ll email your order confirmation after payment.</span>
      </div>
    </div>
    <div class="form-act"><button class="btn btn-glow btn-lg" id="payBtn" onclick="payNow()">Pay ${inr(P.total)} with Razorpay</button></div>`;
}
/* Open Razorpay Checkout and return its signed payment response. */
function startPayment(method, amount) {
  return new Promise((resolve, reject) => {
    const u = S.user || {};
    const a = (u.addresses || []).find((x) => String(x.id) === String(S.co.addr)) || {};

    API.post("/payment/razorpay/create-order", {
      amount: amount,
      order_number: "LT-" + Date.now().toString(36).toUpperCase()
    }).then(rzpData => {
      if (!rzpData || !rzpData.success || !rzpData.razorpay_order_id || !rzpData.key) {
        reject(new Error((rzpData && rzpData.message) || "Online payment is unavailable. Please try again later."));
        return;
      }
      if (typeof Razorpay === "undefined") {
        reject(new Error("The secure payment window could not load. Check your connection and try again."));
        return;
      }

      const options = {
        key: rzpData.key,
        amount: rzpData.amount,
        currency: rzpData.currency || "INR",
        name: "Lemurra Traders",
        description: "Payment for order",
        image: IMG.brand || "images/brand.webp",
        order_id: rzpData.razorpay_order_id,
        handler: function (response) {
          resolve({
            method: "razorpay",
            status: "Paid",
            ref: response.razorpay_payment_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature
          });
        },
        prefill: {
          name: a.name || u.name || "",
          email: u.email || a.email || "",
          contact: a.phone || u.phone || ""
        },
        theme: {
          color: "#0C4A32"
        },
        modal: {
          ondismiss: function () {
            reject(new Error("Payment cancelled."));
          }
        }
      };

      try {
        const rzp = new Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          reject(new Error(resp.error && resp.error.description ? resp.error.description : "Payment failed."));
        });
        rzp.open();
      } catch (e) {
        reject(new Error("The secure payment window could not be opened. Please try again."));
      }
    }).catch(err => {
      reject(err);
    });
  });
}
let paying = false;
function payNow() {
  if (paying) return;
  const items = checkoutItems(),
    P = priceLines(items),
    m = "razorpay";
  S.co.pay = "razorpay";
  S.note = ($("#coNote") || {}).value || S.note;
  const bad = items.find((i) => {
    const p = findP(i.id);
    return !p || p.stock < i.qty;
  });
  if (bad) {
    toast(
      "An item in your order is no longer available in that quantity.",
      "err",
    );
    return;
  }
  paying = true;
  startPayment(m, P.total)
    .then((pay) => {
      paying = false;
      finalizeOrder(pay);
    })
    .catch((err) => {
      paying = false;
      toast(err.message || "Payment failed.", "err");
    });
}
function finalizeOrder(pay) {
  if (czMissing().length) {
    toast("Add your photos and text for the personalised item first.", "err");
    go("#/cart");
    return;
  }
  const items = checkoutItems(),
    P = priceLines(items),
    u = S.user,
    a = (u.addresses || []).find((x) => String(x.id) === String(S.co.addr));
  if (!a) {
    S.co.step = 2;
    render();
    return;
  }
  const o = {
    id: newOrderId(),
    when: Date.now(),
    email: u.email,
    customer_email: u.email,
    customer_name: (a && a.name) || u.name,
    customer_phone: (a && a.phone) || u.phone,
    user_id: u.id,
    phone: a.phone,
    items: items.map((i) => {
      const p = findP(i.id);
      const r = {
        id: p.id,
        name: p.name,
        price: p.price,
        mrp: p.mrp || p.price,
        qty: i.qty,
        img: p.img,
        cat: p.cat,
      };
      if (isCustom(p) && i.custom)
        r.custom = {
          photos: (i.custom.photos || []).map((x) => ({
            src: x.src,
            name: x.name,
          })),
          text: String(i.custom.text || "").trim(),
          month: i.custom.month || "",
          note: String(i.custom.note || "").trim(),
        };
      return r;
    }),
    mrp: P.mrp,
    discount: P.discount,
    coupon:
      P.coupon && !P.coupon.err
        ? { code: P.coupon.code, off: P.couponOff }
        : null,
    total: P.total,
    gift: P.gift ? FREE_GIFT.name : null,
    address: { ...a },
    note: (S.note || "").trim(),
    payment: pay,
    status: pay && pay.method === "razorpay" ? "Payment Pending" : "Order Confirmed",
    history: [{ s: pay && pay.method === "razorpay" ? "Payment Pending" : "Order Confirmed", t: Date.now() }],
    eta: etaFor(a.pin, items).getTime(),
    user_id: u ? u.id : null,
    email: u ? u.email : (a && a.email ? a.email : ""),
    customer_email: u ? u.email : (a && a.email ? a.email : ""),
    customer_phone: (a && a.phone) || (u && u.phone) || "",
    customer_name: (a && a.name) || (u && u.name) || "Customer",
    sessionId: API.sessionId(),
    fromUserOrders: true,
  };
  S.orders.unshift(o);
  if (!DB.write("orders", S.orders)) {
    S.orders.shift();
    toast(
      "Browser storage is full, so this order could not be saved. Use fewer or smaller photos and try again.",
      "err",
    );
    go("cart");
    return;
  }
  items.forEach((i) => {
    const p = findP(i.id);
    if (p && p.stock < 900) p.stock = Math.max(0, p.stock - i.qty);
  });
  saveProducts();
  if (S.buyNow) S.buyNow = null;
  else S.cart = [];
  save();
  badges();
  S.note = "";
  S.coupon = "";
  DB.drop("coupon");
  S.co = { step: 1, addr: null, pay: "razorpay" };
  notifyShop(o);
  API.post("/orders/create", {
    items: items.map(i => ({ id: i.id, qty: i.qty, custom: i.custom })),
    shipping_address: a,
    customer_email: u ? u.email : (a && a.email ? a.email : ""),
    customer_name: (a && a.name) || (u ? u.name : "Customer"),
    customer_phone: (a && a.phone) || (u ? u.phone : ""),
    user_id: u ? u.id : null,
    coupon_code: P.coupon && !P.coupon.err ? P.coupon.code : null,
    payment_method: pay && pay.method ? pay.method : "razorpay",
    razorpay_order_id: pay && pay.razorpay_order_id ? pay.razorpay_order_id : null,
    note: (S.note || "").trim()
  }).then(async res => {
    if (!res || !res.success || !res.order) {
      o.status = "Payment Verification Pending";
      DB.write("orders", S.orders);
      toast(
        pay && pay.status === "Paid"
          ? "Payment may have completed, but the order could not be saved. Contact support before trying to pay again."
          : ((res && res.message) || "The order could not be saved. Please try again."),
        "err",
      );
      go("order-placed/" + o.id);
      return;
    }

    const dbOrder = res.order;
    o.id = dbOrder.order_number;
    o.order_number = dbOrder.order_number;
    o.db_id = dbOrder.id;
    o.customer_email = dbOrder.customer_email || (u && u.email) || "";
    o.email = dbOrder.customer_email || (u && u.email) || "";
    o.user_id = dbOrder.user_id || (u && u.id) || null;
    o.status = dbOrder.status || o.status;
    o.fromUserOrders = true;

    if (pay && pay.status === "Paid") {
      const vRes = await API.post("/payment/razorpay/verify", {
        order_number: dbOrder.order_number,
        razorpay_payment_id: pay.razorpay_payment_id,
        razorpay_order_id: pay.razorpay_order_id,
        razorpay_signature: pay.razorpay_signature
      });

      if (vRes && vRes.success) {
        o.status = (vRes.order && vRes.order.status) || "Order Confirmed";
        toast("Payment verified. Your order is confirmed.", "ok");
      } else {
        o.status = "Payment Verification Pending";
        toast(
          ((vRes && vRes.message) || "Payment verification is still pending.") +
            " If money was debited, do not pay again; contact support.",
          "err",
        );
      }
    }

    DB.write("orders", S.orders);
    go("order-placed/" + o.id);
  }).catch(() => {
    o.status = "Payment Verification Pending";
    DB.write("orders", S.orders);
    toast("We couldn't confirm the order with the server. Contact support before trying to pay again.", "err");
    go("order-placed/" + o.id);
  });
}
/* optional: forward each new order to the shop owner (Google Apps Script, Formspree, your own API…) */
function notifyShop(o) {
  if (!ORDER_WEBHOOK) return;
  try {
    fetch(ORDER_WEBHOOK, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(o),
    }).catch(() => { });
  } catch (e) { }
}

/* =====================================================================
   ORDER PLACED / ORDERS / TRACKING
   ===================================================================== */
const findO = (id) => {
  if (!id) return null;
  const sId = String(id).trim();
  const cleanLT = sId.replace(/^LT-/i, "");
  const cleanORD = sId.replace(/^ORD-/i, "");
  return S.orders.find(
    (o) =>
      String(o.id) === sId ||
      String(o.order_number) === sId ||
      String(o.db_id) === sId ||
      (o.order_number && String(o.order_number).replace(/^LT-/i, "") === cleanLT) ||
      (o.id && String(o.id).replace(/^ORD-/i, "") === cleanORD) ||
      (o.db_id && String(o.db_id) === cleanORD)
  );
};

const myOrders = () => {
  if (S.admin) return S.orders || [];
  // When logged in as a customer, ONLY show their own orders
  if (!S.user) return [];
  const uEmail = (S.user.email || "").toLowerCase().trim();
  const uId = S.user.id ? String(S.user.id) : null;
  return (S.orders || []).filter((o) => {
    if (!o) return false;
    // If order has an assigned user_id, it MUST strictly match current user id
    if (o.user_id) {
      return uId ? String(o.user_id) === uId : false;
    }
    // If order has no user_id (unassigned guest order), it must match customer's email
    const oEmail = (o.customer_email || o.email || (o.address && o.address.email) || "").toLowerCase().trim();
    if (uEmail && oEmail && oEmail === uEmail) {
      return true;
    }
    return false;
  });
};
function czView(it, admin) {
  const c = it.custom;
  if (!c) return "";
  return `<div class="cz-view"><h4>${ic("camera")}Personalisation for ${esc(it.name)}</h4>
    <dl><div><dt>Text to print</dt><dd>${esc(c.text || "—")}</dd></div>${c.month ? `<div><dt>Start month</dt><dd>${esc(c.month)}</dd></div>` : ""}${c.note ? `<div><dt>Notes</dt><dd>${esc(c.note)}</dd></div>` : ""}</dl>
    <div class="cz-ph cz-ph-v">${(c.photos || []).map((ph, k) => `<a class="cz-t" href="${ph.src}" ${admin ? `download="${esc(o_safe(it.id))}-photo-${k + 1}.webp"` : 'target="_blank" rel="noopener"'} title="${admin ? "Download photo" : "Open photo"} ${k + 1}"><img src="${ph.src}" alt="Photo ${k + 1}"></a>`).join("")}</div>
    ${admin && (c.photos || []).length ? `<p class="cz-hint">${(c.photos || []).length} photo${c.photos.length > 1 ? "s" : ""}. Tap a photo to download the print-ready file.</p>` : ""}</div>`;
}
const o_safe = (t) => String(t).replace(/[^\w-]/g, "");
function itemsLine(o) {
  return (
    esc(o.items[0].name) +
    (o.items.length > 1 ? ` <em>+${o.items.length - 1} more</em>` : "")
  );
}
function orderThumb(it) {
  const p = findP(it.id);
  return p
    ? pimg(p, "", 'loading="lazy"')
    : `<img src="${IMG[it.img] || IMG.logo}" alt="" data-w="${WHITE.has(it.img) ? 1 : 0}">`;
}
function statusText(o) {
  const lastHist = (o.history && Array.isArray(o.history) && o.history.length) ? o.history[o.history.length - 1] : null;
  const lastTime = lastHist ? lastHist.t : (o.when || Date.now());
  if (o.status === "Delivered")
    return `Delivered on ${fmtDate(lastTime)}`;
  if (o.status === "Cancelled")
    return `Cancelled on ${fmtDate(lastTime)}`;
  return `Delivery expected by ${fmtDate(o.eta || (Date.now() + 4 * 864e5))}`;
}
const payText = (p) => {
  if (!p) return "Razorpay · Paid";
  if (typeof p === "string") return p;
  if (p.method === "cod") return "Cash on delivery";
  return `${payLabel(p.method || "razorpay")} · ${p.status || "Paid"}`;
};

function vOrderPlaced(id) {
  const o = findO(id);
  if (!o)
    return `<div class="wrap">${emptyBlock("inbox", "We could not find that order", "It may belong to a different account or device.", `<a class="btn btn-p" href="#/account" onclick="event.preventDefault();go('account')">Go to my account</a>`)}</div>`;
  const custom = o.items.some((i) => i.cat === "Customize");
  return `<div class="wrap"><section class="placed">
    <div class="done-mark" aria-hidden="true">
      <svg viewBox="-100 -100 200 200"><path class="dm-ring" pathLength="1" d="${ringPath(80, 16, 0.04)}"/><path class="dm-tick" pathLength="1" d="M-30 2 L-8 24 L32 -22"/></svg>
      ${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg;--d:${(i % 3) * 40}ms"></i>`).join("")}
    </div>
    <h1>Order placed successfully</h1>
    <p class="done-sub">Thank you, ${esc(((S.user && S.user.name) || "").split(" ")[0] || "friend")}. Your order is confirmed, and you can follow it from Account, then Orders.</p>
    <div class="done-card">
      <div class="dc-grid">
        <div><small>Order ID</small><b class="num">${esc(o.id)}</b></div>
        <div><small>Delivery by</small><b>${fmtDate(o.eta)}</b></div>
        <div><small>Payment</small><b>${esc(payText(o.payment))}</b></div>
        <div><small>Total</small><b class="num">${inr(o.total)}</b></div>
      </div>
      <div class="dc-items">${o.items.map((it) => `<div class="dc-i"><span class="dc-img">${orderThumb(it)}</span><span><b>${esc(it.name)}</b><small>Qty ${it.qty}</small></span></div>`).join("")}
        ${o.gift ? `<div class="dc-i dc-gift"><span class="dc-img">${ic("sparkle")}</span><span><b>Free ${esc(o.gift)}</b><small>Added to your parcel</small></span></div>` : ""}</div>
      <p class="dc-addr">${ic("pin")}<span>Delivering to <b>${esc(o.address.name)}</b>, ${addrText(o.address)}</span></p>
      ${custom ? `<p class="dc-note">${ic("camera")}<span><b>Personalised item:</b> we have your photos and text. Before we make it, we print a proof and send it to you to approve.</span></p>` : ""}
    </div>
    <div class="done-act">
      <button class="btn btn-p btn-lg" onclick="printInvoice('${o.id}')">${ic("download")}Print / Save Tax Invoice (PDF)</button>
      <a class="btn btn-o btn-lg" href="/order/${o.id}" onclick="event.preventDefault();go('order/${o.id}')">View order details</a>
      <a class="btn btn-o btn-lg" href="/shop" onclick="event.preventDefault();go('shop')">Continue shopping</a>
    </div>
    <div style="margin-top:20px;padding:12px 18px;background:#eef7f2;border-radius:10px;border:1px solid #cce5d7;display:inline-flex;align-items:center;gap:10px;font-size:13.5px;color:#0C4A32;">
      <span>${ic("mail")}</span>
      <span>A full order confirmation email with your itemized details and invoice has been sent to <b>${esc(o.email || (S.user && S.user.email) || "")}</b>.</span>
    </div>
  </section></div>`;
}

const ORDER_FILTERS = [
  ["all", "All"],
  ["active", "In progress"],
  ["Delivered", "Delivered"],
  ["Cancelled", "Cancelled"],
];
let ordFilter = "all";
function ordersPanel() {
  let list = myOrders();
  if (ordFilter === "active")
    list = list.filter(
      (o) => o.status !== "Delivered" && o.status !== "Cancelled",
    );
  else if (ordFilter !== "all")
    list = list.filter((o) => o.status === ordFilter);
  return `<div class="ord-tools">${ORDER_FILTERS.map(([k, l]) => `<button class="chip${ordFilter === k ? " on" : ""}" onclick="ordFilter='${k}';render()">${l}</button>`).join("")}</div>
   ${list.length
      ? `<div class="ord-list">${list
        .map(
          (o) => `<div class="ord rv" style="cursor:pointer;" onclick="go('order/' + '${esc(o.order_number || o.id)}')">
      <span class="ord-img">${orderThumb(o.items && o.items[0])}</span>
      <span class="ord-main"><b>${itemsLine(o)}</b><small class="num">Order ${esc(o.order_number || o.id)} · ${fmtDate(o.when, { day: "numeric", month: "short", year: "numeric" })}</small></span>
      <span class="ord-p num">${inr(o.total)}</span>
      <span class="ord-s"><i class="dot-s ${orderStatusClass(o.status)}"></i><b>${esc(o.status)}</b><small>${statusText(o)}</small></span>
      <div class="ord-acts" onclick="event.stopPropagation()">
        <button class="btn-ord-view" onclick="go('order/' + '${esc(o.order_number || o.id)}')">${ic("eye")}<span>View</span></button>
        <button class="btn-ord-inv" onclick="printInvoice('${esc(o.order_number || o.id)}')">${ic("download")}<span>Invoice</span></button>
      </div>
     </div>`,
        )
        .join("")}</div>`
      : emptyBlock(
        "inbox",
        myOrders().length ? "No orders in this view" : "No orders yet",
        myOrders().length
          ? "Try a different filter."
          : "When you place an order it will be listed here, with live tracking.",
        `<a class="btn btn-p" href="#/shop" onclick="event.preventDefault();go('shop')">Start shopping</a>`,
      )
    }`;
}

const TRACK = [
  "Order Confirmed",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
];
function trackHTML(o) {
  const cancelled = o.status === "Cancelled";
  const steps = cancelled ? ["Order Confirmed", "Cancelled"] : TRACK;
  const cur = cancelled ? 1 : Math.max(0, TRACK.indexOf(o.status));
  const hist = (o.history && Array.isArray(o.history) && o.history.length)
    ? o.history
    : [
      { s: "Order Confirmed", t: o.when || Date.now() },
      ...(o.status && o.status !== "Order Confirmed" ? [{ s: o.status, t: Date.now() }] : [])
    ];
  const when = (s) => {
    const h = hist.find((x) => x.s === s);
    return h
      ? fmtDate(h.t, { day: "numeric", month: "short" }) +
      ", " +
      new Date(h.t).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      })
      : "";
  };
  return `<ol class="track${cancelled ? " is-off" : ""}" style="--n:${steps.length};--p:${cur / (steps.length - 1)}">
    ${steps.map((s, i) => `<li class="${i < cur ? "done" : i === cur ? "now" : ""}"><span class="tk-dot">${i <= cur ? ic(cancelled && i === cur ? "x" : "check") : ""}</span><b>${s}</b><small>${when(s)}</small></li>`).join("")}</ol>`;
}
function vOrder(id) {
  let o = findO(id);

  // Live order status synchronization
  const now = Date.now();
  if (!window._lastOrderFetch || window._lastOrderId !== String(id) || (now - window._lastOrderFetch > 3000)) {
    window._lastOrderFetch = now;
    window._lastOrderId = String(id);
    API.get("/orders/" + encodeURIComponent(id)).then(res => {
      if (res && res.success && res.order) {
        const mapped = mapOrderFromApi(res.order);
        const uId = S.user && S.user.id ? String(S.user.id) : null;
        const uEmail = (S.user && S.user.email ? S.user.email : "").toLowerCase().trim();
        const oUserId = mapped.user_id ? String(mapped.user_id) : null;
        const oEmail = (mapped.customer_email || mapped.email || "").toLowerCase().trim();
        const isMine = S.admin || (uId && oUserId && oUserId === uId) || (uEmail && oEmail && oEmail === uEmail);

        let changed = false;
        if (isMine) {
          const idx = S.orders.findIndex(x =>
            String(x.id) === String(mapped.id) ||
            String(x.order_number) === String(mapped.order_number) ||
            String(x.db_id) === String(mapped.db_id)
          );
          if (idx >= 0) {
            if (S.orders[idx].status !== mapped.status || JSON.stringify(S.orders[idx].history) !== JSON.stringify(mapped.history)) {
              changed = true;
            }
            S.orders[idx] = mapped;
          } else {
            S.orders.unshift(mapped);
            changed = true;
          }
          DB.write("orders", S.orders);
        }
        if (!o || (isMine && changed)) {
          render();
        }
      }
    }).catch(e => { console.warn("Order details fetch notice:", e); });
  }

  if (!o)
    return `<div class="wrap">${emptyBlock("inbox", "Looking for order details…", "Please wait while we load order #" + esc(id) + "…", `<a class="btn btn-p" href="#/account" onclick="event.preventDefault();go('account')">Go to my account</a>`)}</div>`;

  const canCancel =
    !S.admin && (o.status === "Order Confirmed" || o.status === "Packed");
  const a = o.address || {};
  return `<div class="wrap">
    <nav class="crumb" aria-label="Breadcrumb"><a href="/account" onclick="event.preventDefault();go('account')">My account</a><i>/</i><a href="/account" onclick="event.preventDefault();S.ptab='orders';go('account')">Orders</a><i>/</i><span class="num">${esc(o.id)}</span></nav>
    <div class="od">
      <div class="od-main">
        <section class="od-card"><div class="od-h"><div><h1>Order <span class="num">${esc(o.id)}</span></h1><p>Placed on ${fmtDT(o.when)}</p></div>
          <span class="tag ${orderStatusClass(o.status)}">${esc(o.status)}</span></div>
          ${trackHTML(o)}
          <p class="od-eta">${ic(o.status === "Cancelled" ? "x" : o.status === "Delivered" ? "check" : "truck")}<span>${statusText(o)}</span></p></section>
        <section class="od-card"><h2>Items in this order</h2>
          ${(o.items || [])
      .map(
        (
          it,
        ) => `<a class="ci ci-s ci-o" href="/p/${it.id}" onclick="event.preventDefault();go('p/${it.id}')"><span class="ci-img">${orderThumb(it)}</span>
             <span class="ci-body"><b class="ci-name">${esc(it.name)}</b><span class="ci-sub">Qty ${it.qty} · Sold by Lemurra Traders</span></span>
             <span class="ci-price"><b class="num">${inr(it.price * it.qty)}</b>${it.mrp > it.price ? `<s class="num">${inr(it.mrp * it.qty)}</s>` : ""}</span></a>`,
      )
      .join("")}
          ${(o.items || [])
      .filter((it) => it.custom)
      .map((it) => czView(it))
      .join("")}
          ${o.gift ? `<div class="ci ci-s ci-o ci-gift"><span class="ci-img gift-ic">${ic("sparkle")}</span><span class="ci-body"><b class="ci-name">Free ${esc(o.gift)}</b><span class="ci-sub">Included with this order</span></span><span class="ci-price"><b class="ok">Free</b></span></div>` : ""}
          ${o.note ? `<p class="od-note"><b>Your note:</b> ${esc(o.note)}</p>` : ""}</section>
      </div>
      <aside class="od-side">
        <section class="od-card"><h3>Delivery address</h3><p class="od-addr"><b>${esc(a.name || o.customer_name || "Customer")}</b> <em class="tag-t">${esc(a.type || "Home")}</em><br>${addrText(a)}<br><span class="num">${esc(a.phone || o.customer_phone || "")}</span></p></section>
        <section class="od-card"><h3>Payment</h3><p class="od-addr">${esc(payText(o.payment))}${o.payment && o.payment.ref ? `<br><small class="num">Ref ${esc(o.payment.ref)}</small>` : ""}</p></section>
        <section class="od-card"><h3>Price details</h3>
          <div class="pr"><span>Price (${(o.items || []).reduce((n, i) => n + i.qty, 0)} items)</span><span class="num">${inr(o.mrp || o.subtotal || o.total)}</span></div>
          ${o.discount > 0 ? `<div class="pr ok"><span>Discount</span><span class="num">− ${inr(o.discount)}</span></div>` : ""}
          ${o.coupon ? `<div class="pr ok"><span>Coupon (${esc(o.coupon.code || o.coupon_code)})</span><span class="num">− ${inr(o.coupon.off || o.discount)}</span></div>` : ""}
          <div class="pr"><span>Delivery charges</span><b class="ok">Free</b></div>
          <div class="pr tot"><span>Total amount</span><span class="num">${inr(o.total)}</span></div></section>
        <div class="od-act">
          ${S.admin ? `
            <div style="background:var(--sub);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px;width:100%;">
              <label style="display:block;font-size:12px;font-weight:700;color:var(--txt-2);text-transform:uppercase;margin-bottom:6px;">Update Order Status</label>
              <select class="st-sel ${orderStatusClass(o.status)}" style="width:100%;height:38px;" onchange="setOrderStatus('${esc(o.id)}', this.value);render();">
                ${STATUS.map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          <button class="btn btn-ord-inv" style="height:44px;font-size:0.92rem;justify-content:center;width:100%;margin-bottom:8px;" onclick="printInvoice('${esc(o.order_number || o.id)}')">${ic("download")}Download Invoice (PDF)</button>
          ${canCancel ? `<button class="btn btn-d" onclick="cancelOrder('${esc(o.id)}')">Cancel order</button>` : ""}
          ${(a.phone || o.customer_phone) ? `<a class="btn btn-o" href="https://wa.me/91${phoneClean(a.phone || o.customer_phone)}?text=${enc("Hello " + (a.name || o.customer_name || "Customer") + ", this is Lemurra Traders regarding your order " + o.id)}" target="_blank" rel="noopener">${ic("chat")}Message customer</a>` : `<a class="btn btn-o" href="https://wa.me/${WA}?text=${enc("Hello Lemurra support, I need help with order " + o.id)}" target="_blank" rel="noopener">${ic("chat")}Need help?</a>`}
          <button class="btn btn-p" onclick="${S.admin ? "S.tab='orders'" : "S.ptab='orders'"};go('account')">${ic("arrow-left")}Back to orders</button>
        </div>
      </aside>
    </div></div>`;
}

function setOrderStatus(id, status, quiet) {
  let o = findO(id);
  const targetId = (o && (o.order_number || o.id || o.db_id)) || id;
  const oldStatus = o ? o.status : null;
  if (oldStatus === status) return;

  if (o) {
    if (status === "Cancelled" && oldStatus !== "Cancelled") {
      (o.items || []).forEach((it) => {
        const p = findP(it.id);
        if (p && p.stock < 900) p.stock += it.qty;
      });
    }
    o.status = status;
    o.history = (o.history && Array.isArray(o.history) && o.history.length)
      ? o.history
      : [{ s: "Order Confirmed", t: o.when || Date.now() }];
    o.history.push({ s: status, t: Date.now() });
    DB.write("orders", S.orders);
    saveProducts();
    render();
  }

  // SweetAlert2 notification
  const notifySuccess = (orderNo, newSt) => {
    if (quiet) return;
    if (typeof Swal !== "undefined") {
      Swal.fire({
        title: "Order Status Updated!",
        html: `Order <b>#${orderNo}</b> status has been changed to <b style="color:#0C4A32;">"${newSt}"</b>.`,
        icon: "success",
        confirmButtonColor: "#0C4A32",
        confirmButtonText: "OK",
        timer: 3000,
        timerProgressBar: true
      });
    } else {
      toast(`Order #${orderNo} marked as ${newSt}.`, "ok");
    }
  };

  API.post("/admin/orders/" + encodeURIComponent(targetId) + "/status", { status: status, _method: "PATCH" })
    .then(res => {
      notifySuccess(targetId, status);
      refreshAdminData();
    })
    .catch(err => {
      notifySuccess(targetId, status);
      refreshAdminData();
    });
}

function cancelOrder(id) {
  modal(
    "Cancel this order?",
    `<p class="m-note">Tell us why. This helps us improve.</p>
     <div class="field"><label for="cReason">Reason for cancellation</label><select id="cReason">${["Ordered by mistake", "Found a better price elsewhere", "Delivery is taking too long", "Want to change the address or product", "Other"].map((r) => `<option>${r}</option>`).join("")}</select></div>
     <p class="m-note">${findO(id).payment.status === "Paid" ? "Any amount you paid will be refunded to the original payment method within 5 to 7 working days." : "You have not been charged for this order."}</p>`,
    `<button class="btn btn-o" onclick="closeModal()">Keep my order</button><button class="btn btn-d" onclick="confirmCancel('${id}')">Cancel order</button>`,
  );
}
function confirmCancel(id) {
  const r = $("#cReason").value;
  const o = findO(id);
  if (o) o.cancelReason = r;
  setOrderStatus(id, "Cancelled", true);
  closeModal();
  render();
  toast("Your order has been cancelled.");
}
function printInvoice(id) {
  const o = findO(id);
  const orderNum = (o && (o.order_number || o.id)) || id;
  const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.baseUrl) ? window.APP_CONFIG.baseUrl.replace(/\/+$/, '') : '';
  const printUrl = baseUrl + '/orders/' + encodeURIComponent(orderNum) + '/print?print=1';
  window.open(printUrl, '_blank');
}

/* =====================================================================
   ACCOUNT — one sign-in for everyone. The shop owner's password opens the
   admin panel; any other email + password is a normal customer.
   ===================================================================== */
let authTab = "login";
const GOOGLE_SVG =
  '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.6 14.3a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.7z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 6.7l3.8 3a7.1 7.1 0 0 1 6.4-4.9z"/></svg>';
function setErr(id, msg) {
  const e = $("#" + id);
  if (e) e.textContent = msg || "";
  const inp = e && e.previousElementSibling;
  if (inp && inp.matches && inp.matches("input,select,textarea"))
    inp.setAttribute("aria-invalid", msg ? "true" : "false");
  return !msg;
}
function pwScore(v) {
  let s = 0;
  if (v.length >= 8) s++;
  if (v.length >= 12) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return Math.min(s, 4);
}
function peek(id, btn) {
  const i = $("#" + id);
  const on = i.type === "password";
  i.type = on ? "text" : "password";
  btn.innerHTML = ic(on ? "eyeoff" : "eye");
  btn.setAttribute("aria-label", on ? "Hide password" : "Show password");
}
function demoOauth(w) {
  toast(w + " sign-in needs a server. Use the email form for now.", "err");
}
function forgot() {
  modal(
    "Reset your password",
    `<p class="m-note">Tell us the email on the account. When a mail service is connected this sends a reset link. This build has no mail server, so nothing is sent yet.</p>
     <div class="field"><label for="fEmail">Email address</label><input id="fEmail" type="email" placeholder="you@example.com"></div>`,
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="closeModal();toast('If that email is registered, a reset link would be on its way.')">Send reset link</button>`,
  );
}
function authFormHTML(ctx) {
  return `<div class="tabs" role="tablist">
      <button class="${authTab === "login" ? "on" : ""}" onclick="authTab='login';render()" role="tab" aria-selected="${authTab === "login"}">Sign in</button>
      <button class="${authTab === "reg" ? "on" : ""}" onclick="authTab='reg';render()" role="tab" aria-selected="${authTab === "reg"}">Create account</button></div>
    ${authTab === "login"
      ? `
      <div class="field"><label for="lEmail">Email address</label><input id="lEmail" type="text" inputmode="email" autocomplete="username" placeholder="you@example.com"><div class="err" id="eLEmail"></div></div>
      <div class="field"><label for="lPass">Password</label><div class="ctl"><input id="lPass" type="password" autocomplete="current-password" placeholder="Your password" onkeydown="if(event.key==='Enter')doLogin()">
        <button class="eye" onclick="peek('lPass',this)" aria-label="Show password">${ic("eye")}</button></div><div class="err" id="eLPass"></div></div>
      <div class="rowsplit"><label class="chk"><input type="checkbox" id="lRemember" checked> Stay signed in</label>
        <a class="lnk" onclick="forgot()" tabindex="0">Forgot password?</a></div>
      <button class="btn btn-p btn-lg btn-block" onclick="doLogin()">Sign in</button>
      <p class="auth-alt">New to Lemurra? <a class="lnk" onclick="authTab='reg';render()" tabindex="0">Create an account</a></p>
    `
      : `
      <div class="field"><label for="rName">Full name</label><input id="rName" autocomplete="name" placeholder="Your name"><div class="err" id="eRName"></div></div>
      <div class="field"><label for="rEmail">Email address</label><input id="rEmail" type="email" autocomplete="email" placeholder="you@example.com"><div class="err" id="eREmail"></div></div>
      <div class="field"><label for="rPhone">Mobile number</label><input id="rPhone" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="10-digit mobile"><div class="err" id="eRPhone"></div></div>
      <div class="field"><label for="rPass">Password</label><div class="ctl"><input id="rPass" type="password" autocomplete="new-password" placeholder="At least 8 characters">
        <button class="eye" onclick="peek('rPass',this)" aria-label="Show password">${ic("eye")}</button></div>
        <div class="bar-t"><i id="pwBar"></i></div><div class="err" id="eRPass"></div></div>
      <div class="field"><label for="rPass2">Confirm password</label><input id="rPass2" type="password" autocomplete="new-password" placeholder="Type it again"><div class="err" id="eRPass2"></div></div>
      <label class="chk"><input type="checkbox" id="rTerms"> I agree to the <a class="lnk" href="#/policies">terms and privacy policy</a>.</label>
      <div class="err" id="eRTerms"></div>
      <button class="btn btn-p btn-lg btn-block" onclick="doRegister()">Create account</button>
      <p class="auth-alt">Already registered? <a class="lnk" onclick="authTab='login';render()" tabindex="0">Sign in</a></p>
    `
    }`;
}
function bindAuth() {
  const pw = $("#rPass"),
    bar = $("#pwBar");
  if (pw && bar)
    pw.addEventListener("input", () => {
      const s = pwScore(pw.value);
      bar.style.width = [0, 28, 55, 80, 100][s] + "%";
      bar.style.background = [
        "transparent",
        "var(--danger)",
        "var(--glow)",
        "var(--leaf)",
        "var(--ok)",
      ][s];
    });
}
function goAccount() {
  if (currentRoute() === "account") render();
  else go("account");
}
function doLogin() {
  const em = $("#lEmail").value.trim(),
    lem = em.toLowerCase(),
    pw = $("#lPass").value;

  if (!pw) {
    return setErr("eLPass", "Enter your password.");
  }

  // Attempt authentication via Laravel backend
  if (!em) {
    return setErr("eLEmail", "Enter your email address.");
  }

  API.post("/auth/login", { email: em, password: pw })
    .then(res => {
      if (res && res.success) {
        S.user = res.user;
        S.admin = !!res.is_admin;
        S.orders = [];
        DB.drop("orders");
        if (res.token) {
          localStorage.setItem("lem.token", res.token);
          document.cookie = "lem_token=" + encodeURIComponent(res.token) + "; path=/; max-age=31536000";
        }
        document.cookie = "lem_email=" + encodeURIComponent(res.user.email) + "; path=/; max-age=31536000";
        document.cookie = "lem_role=" + encodeURIComponent(S.admin ? "admin" : "customer") + "; path=/; max-age=31536000";
        DB.write("user", S.user);
        if (S.admin) DB.write("admin", true);
        else DB.drop("admin");

        if (S.admin) {
          S.tab = "overview";
          toast("Signed in as shop owner. Welcome to the admin panel.");
          refreshAdminData().finally(() => {
            goAccount();
          });
        } else {
          API.post("/cart/sync", { cart: S.cart });
          API.post("/wishlist/sync", { wishlist: S.wish });
          badges();
          toast("Signed in. Welcome back, " + ((res.user.name || "Customer").split(" ")[0]) + ".");
          refreshUserOrders().finally(() => {
            goAccount();
          });
        }
      } else {
        setErr("eLPass", (res && res.message) || "Invalid email or password.");
      }
    })
    .catch(err => {
      setErr("eLPass", err.message || "Invalid credentials.");
    });
}
function doRegister() {
  const n = $("#rName").value.trim(),
    em = $("#rEmail").value.trim().toLowerCase(),
    ph = $("#rPhone").value.replace(/\D/g, "").slice(-10),
    p1 = $("#rPass").value,
    p2 = $("#rPass2").value;
  let ok = setErr("eRName", n.length >= 2 ? "" : "Enter your name.");
  ok =
    setErr(
      "eREmail",
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)
        ? ""
        : "That does not look like an email address.",
    ) && ok;
  ok =
    setErr(
      "eRPhone",
      /^[6-9]\d{9}$/.test(ph) ? "" : "Enter a 10-digit Indian mobile number.",
    ) && ok;
  ok =
    setErr("eRPass", p1.length >= 6 ? "" : "Use at least six characters.") &&
    ok;
  ok =
    setErr("eRPass2", p1 === p2 ? "" : "The two passwords do not match.") && ok;
  ok =
    setErr(
      "eRTerms",
      $("#rTerms").checked ? "" : "Please accept the terms to continue.",
    ) && ok;
  if (!ok) return;

  API.post("/auth/register", { name: n, email: em, phone: ph, password: p1 })
    .then(res => {
      if (res && res.success) {
        S.user = res.user;
        S.admin = false;
        S.orders = [];
        DB.drop("orders");
        if (res.token) localStorage.setItem("lem.token", res.token);
        DB.write("user", S.user);
        API.post("/cart/sync", { cart: S.cart });
        API.post("/wishlist/sync", { wishlist: S.wish });
        badges();
        render();
        toast("Account created. Welcome to Lemurra Traders!");
        goAccount();
      } else {
        setErr("eREmail", (res && res.message) || "Registration failed.");
      }
    })
    .catch(err => {
      setErr("eREmail", err.message || "Registration failed.");
    });
}
function signOut(quiet) {
  API.post("/auth/logout");
  localStorage.removeItem("lem.token");
  localStorage.removeItem("lem.user");
  localStorage.removeItem("lem.admin");
  localStorage.removeItem("lem_email");
  localStorage.removeItem("lem_role");

  // Thoroughly clear cookies on all potential paths
  const clearCookie = (name) => {
    ["/", "/lemurra-traders", "/lemurra-traders/public", ""].forEach((p) => {
      document.cookie = name + "=; path=" + p + "; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    });
  };
  clearCookie("lem_token");
  clearCookie("lem_email");
  clearCookie("lem_role");

  S.user = null;
  S.admin = false;
  DB.drop("user");
  DB.drop("admin");
  S.orders = [];
  DB.drop("orders");
  S.tab = "overview";
  S.ptab = "orders";
  S.wish = [];
  DB.write("wish", []);
  if (!quiet) {
    S.cart = [];
    DB.write("cart", []);
  }
  badges();
  authTab = "login";
  S.co = { step: 1, addr: null, pay: "razorpay" };
  if (!quiet) {
    toast("Signed out successfully.");
    go("account");
  }
}
function adminOut() {
  signOut(false);
}

function vAuth() {
  return `<div class="wrap"><section class="auth">
    <div class="auth-art">
      <svg class="auth-ring" viewBox="-100 -100 200 200" aria-hidden="true"><path pathLength="1" d="${ringPath(84, 24, 0.032)}"/><g>${ringDots(72, 30, 1.6)}</g></svg>
      <div class="auth-art-in">
        <img class="auth-logo" src="${IMG.brandfull}" alt="Lemurra Traders" width="240" height="225">
        <h2>Your addresses and orders, in one place.</h2>
        <ul>
          <li>${ic("check")}Save addresses once and check out in seconds</li>
          <li>${ic("check")}Track every order from confirmed to delivered</li>
          <li>${ic("check")}Keep a wishlist that survives a browser restart</li>
          <li>${ic("check")}Your details stay on this device. This site has no server</li>
        </ul>
      </div>
    </div>
    <div class="auth-card">
      <h1>${authTab === "login" ? "Welcome back" : "Create your account"}</h1>
      <p class="auth-sub">${authTab === "login" ? "Sign in to see your orders and check out faster." : "It takes under a minute and you only do it once."}</p>
      ${authFormHTML("page")}
    </div></section></div>`;
}

/* =====================================================================
   PROFILE (customers)
   ===================================================================== */
function vAccount() {
  return S.admin ? vAdmin() : S.user ? vProfile() : vAuth();
}
function vProfile() {
  const u = S.user,
    tab = S.ptab || "orders";
  const now = Date.now();
  if (tab === "orders" && (!window._lastUserOrdersFetch || (now - window._lastUserOrdersFetch > 5000))) {
    window._lastUserOrdersFetch = now;
    refreshUserOrders().then(() => {
      render();
    }).catch(() => { });
  }
  const initials = u.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const addrs = u.addresses || [];
  const tabs = [
    ["orders", "Orders"],
    ["profile", "Profile"],
    ["addresses", "Addresses"],
  ];
  let body = "";
  if (tab === "orders") body = ordersPanel();
  else if (tab === "profile")
    body = `<div class="panel"><div class="panel-h"><h3>Personal information</h3><button class="btn btn-o btn-sm" onclick="editProfile()">${ic("edit")}Edit</button></div>
      <dl class="spec spec-p"><div><dt>Name</dt><dd>${esc(u.name)}</dd></div><div><dt>Email</dt><dd>${esc(u.email)}</dd></div><div><dt>Mobile</dt><dd class="num">${esc(u.phone || "Not added")}</dd></div>
      <div><dt>Saved addresses</dt><dd class="num">${addrs.length}</dd></div></dl></div>
      <div class="grid g3 kpis"><div class="kpi"><span>Orders placed</span><b class="num">${myOrders().length}</b></div><div class="kpi"><span>Saved items</span><b class="num">${S.wish.length}</b></div><div class="kpi"><span>In cart</span><b class="num">${cartCount()}</b></div></div>`;
  else
    body = `<div class="panel"><div class="panel-h"><h3>Saved addresses</h3><button class="btn btn-p btn-sm" onclick="addAddr()">${ic("plus")}Add address</button></div>
      ${addrs.length
        ? `<div class="addr-grid">${addrs
          .map(
            (
              a,
            ) => `<div class="addr-card"><b>${esc(a.name)}</b><em class="tag-t">${esc(a.type || "Home")}</em><p>${addrText(a)}</p><p class="num">${esc(a.phone)}</p>
         <div class="addr-a"><button class="lnk" onclick="editAddr('${a.id}')">Edit</button><button class="lnk bad" onclick="delAddr('${a.id}')">Delete</button></div></div>`,
          )
          .join("")}</div>`
        : `<div class="panel-pad">${emptyBlock("pin", "No saved addresses", "Add one now and it will be ready at checkout.", `<button class="btn btn-p" onclick="addAddr()">Add an address</button>`)}</div>`
      }</div>`;
  return `<div class="wrap">
    <div class="prof-h"><span class="mark mark-lg">${esc(initials)}</span>
      <div><h1>Hello, ${esc(u.name.split(" ")[0])}</h1><p>${esc(u.email)}</p></div>
      <button class="btn btn-o btn-sm" onclick="signOut()">${ic("logout")}Sign out</button></div>
    <div class="atabs" role="tablist" id="ptabs"><i class="atab-i"></i>${tabs.map(([k, l]) => `<button role="tab" class="${tab === k ? "on" : ""}" onclick="S.ptab='${k}';render()">${l}</button>`).join("")}</div>
    <div class="ptab-body">${body}</div></div>`;
}
function addAddr() {
  modal(
    "Add a new address",
    addrForm(null, true, true),
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveAddr(null)">Save address</button>`,
    { wide: true },
  );
}
function editProfile() {
  const u = S.user;
  modal(
    "Edit your details",
    `<div class="field"><label for="pName">Full name</label><input id="pName" value="${esc(u.name)}"></div>
    <div class="field"><label for="pPhone">Mobile number</label><input id="pPhone" inputmode="numeric" maxlength="10" value="${esc(u.phone || "")}"><div class="err" id="ePPhone"></div></div>`,
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveProfile()">Save changes</button>`,
  );
}
function saveProfile() {
  const ph = $("#pPhone").value.replace(/\D/g, "");
  if (ph && !/^[6-9]\d{9}$/.test(ph))
    return setErr("ePPhone", "Enter a valid 10-digit mobile number.");
  const newName = $("#pName").value.trim() || S.user.name;
  S.user = { ...S.user, name: newName, phone: ph };
  saveUser();
  // Persist to backend
  API.post("/auth/profile", { name: newName, phone: ph }).then(res => {
    if (res && res.success && res.user) {
      S.user = { ...S.user, ...res.user, addresses: res.user.addresses || S.user.addresses || [] };
      DB.write("user", S.user);
    }
  }).catch(() => { });
  closeModal();
  render();
  toast("Details saved successfully.");
}
function editAdminProfile() {
  const u = S.user || {};
  modal(
    "Edit Admin Profile",
    `<div class="field"><label for="apName">Full name</label><input id="apName" value="${esc(u.name || 'Admin')}"></div>
    <div class="field"><label for="apEmail">Email address</label><input id="apEmail" type="email" value="${esc(u.email || 'admin@lemurra.in')}"><div class="err" id="eApEmail"></div></div>
    <div class="field"><label for="apPhone">Mobile number</label><input id="apPhone" inputmode="numeric" maxlength="10" value="${esc(u.phone || '')}"><div class="err" id="eApPhone"></div></div>
    <hr style="margin:16px 0;border:none;border-top:1px solid #eef4f0;">
    <p style="font-size:13px;color:#5a7368;margin:0 0 10px;">Leave password blank to keep it unchanged.</p>
    <div class="field"><label for="apPass">New password</label><div class="ctl"><input id="apPass" type="password" placeholder="New password (min 6 chars)"><button class="eye" onclick="peek('apPass',this)" aria-label="Show password">${ic('eye')}</button></div><div class="err" id="eApPass"></div></div>
    <div class="field"><label for="apPass2">Confirm new password</label><input id="apPass2" type="password" placeholder="Repeat new password"><div class="err" id="eApPass2"></div></div>`,
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-p" onclick="saveAdminProfile()">Save changes</button>`,
  );
}
function saveAdminProfile() {
  const name = $("#apName").value.trim();
  const email = $("#apEmail").value.trim().toLowerCase();
  const ph = $("#apPhone").value.replace(/\D/g, "");
  const pass = $("#apPass").value;
  const pass2 = $("#apPass2").value;
  let ok = true;
  if (!name) { toast("Name cannot be empty.", "err"); return; }
  if (ph && !/^[6-9]\d{9}$/.test(ph)) { setErr("eApPhone", "Enter a valid 10-digit mobile number."); ok = false; }
  if (pass && pass.length < 6) { setErr("eApPass", "Password must be at least 6 characters."); ok = false; }
  if (pass && pass !== pass2) { setErr("eApPass2", "Passwords do not match."); ok = false; }
  if (!ok) return;
  const payload = { name, phone: ph };
  if (email && email !== (S.user && S.user.email || '').toLowerCase()) payload.email = email;
  if (pass) payload.password = pass;
  API.post("/auth/profile", payload).then(res => {
    if (res && res.success) {
      if (res.user) {
        S.user = { ...S.user, ...res.user, addresses: res.user.addresses || S.user.addresses || [] };
        DB.write("user", S.user);
      }
      closeModal();
      render();
      toast("Admin profile updated successfully.");
    } else {
      toast((res && res.message) || "Failed to save. Please try again.", "err");
    }
  }).catch(() => toast("Could not connect to server.", "err"));
}

/* =====================================================================
   ADMIN PANEL — lives inside the Account page, opened by the owner's password
   ===================================================================== */
function saveProducts() {
  const ok = DB.write("products", S.products);
  if (!ok)
    toast(
      "Browser storage is full. Remove a photo or a product to save changes.",
      "err",
    );
  return ok;
}
const isLow = (p) => p.stock < 20 && p.stock < 900;
let ofil = "all",
  apq = "",
  apcat = "All";

function adminProfilePanel() {
  const u = S.user || {};
  const adminEmail = u.email || 'admin@lemurra.in';
  const initials = (u.name || 'A').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  return `<div class="panel" style="max-width:600px;">
    <div class="panel-h">
      <h3>Admin Profile</h3>
      <button class="btn btn-o btn-sm" onclick="editAdminProfile()">${ic('edit')}Edit profile</button>
    </div>
    <div style="display:flex;align-items:center;gap:18px;padding:20px 20px 0;">
      <span class="mark mark-lg" style="width:68px;height:68px;font-size:1.6rem;flex-shrink:0;">${esc(initials)}</span>
      <div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--leaf);">${esc(u.name || 'Admin')}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:2px;">${esc(adminEmail)}</div>
        <span class="tag ok" style="margin-top:6px;display:inline-block;">Administrator</span>
      </div>
    </div>
    <dl class="spec spec-p" style="margin:20px;">
      <div><dt>Full name</dt><dd>${esc(u.name || '—')}</dd></div>
      <div><dt>Email</dt><dd>${esc(adminEmail)}</dd></div>
      <div><dt>Mobile</dt><dd class="num">${esc(u.phone || 'Not set')}</dd></div>
      <div><dt>Role</dt><dd>Shop Administrator</dd></div>
    </dl>
    <div style="padding:0 20px 20px;">
      <div style="background:#f7faf8;border:1px solid #e0ece5;border-radius:8px;padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:13px;color:#5a7368;"><strong>Official emails:</strong></p>
        <p style="margin:0;font-size:13px;color:#374a41;">
          admin@lemurra.in &nbsp;·&nbsp; support@lemurra.in &nbsp;·&nbsp; lemurratraders@gmail.com
        </p>
        <p style="margin:8px 0 0;font-size:13px;color:#374a41;">
          <strong>Phone:</strong> +91-6383408380 &nbsp;·&nbsp;
          <strong>GSTIN:</strong> 33FJHPR1675D1Z5
        </p>
      </div>
    </div>
  </div>`;
}

function vAdmin() {
  const ps = S.products,
    os = S.orders,
    t = S.tab || "overview";
  const revenue = os
    .filter((o) => o.status !== "Cancelled")
    .reduce((n, o) => n + o.total, 0);
  const todo = os.filter(
    (o) => o.status === "Order Confirmed" || o.status === "Packed",
  ).length;
  const low = ps.filter(isLow);
  const byCat = CATS.map((c) => ({
    name: c.id,
    n: ps.filter((p) => p.cat === c.id).length,
  }));
  const max = Math.max(1, ...byCat.map((c) => c.n));
  const tabs = [
    ["overview", "Overview"],
    ["orders", "Orders" + (todo ? ` <b class="cnt">${todo}</b>` : "")],
    ["customers", "Customers"],
    ["products", "Products"],
    ["coupons", "Coupons"],
    ["blog", "Blog"],
    ["adminprofile", "My Profile"],
  ];
  const show = (k) => (t === k ? "" : "hidden");
  return `<div class="wrap">
  <div class="adm-h">
    <div><h1>Admin panel</h1><p>Signed in as <b>${esc((S.user && S.user.email) || "")}</b></p></div>
    <div class="adm-act"><a class="btn btn-o btn-sm" href="#/">View shop</a><button class="btn btn-p btn-sm" onclick="editProduct(null)">${ic("plus")}Add product</button><button class="btn btn-o btn-sm" onclick="adminOut()">${ic("logout")}Sign out</button></div>
  </div>
  <div class="atabs" id="atabs" role="tablist"><i class="atab-i"></i>${tabs.map(([k, l]) => `<button role="tab" data-k="${k}" class="${t === k ? "on" : ""}" onclick="admTab('${k}')">${l}</button>`).join("")}</div>

  <div class="apanel" data-p="overview" ${show("overview")}>
    <div class="kpis kpis5">
      <div class="kpi"><span>Orders</span><b class="num" data-count="${os.length}">${os.length}</b></div>
      <div class="kpi"><span>Revenue</span><b class="num" data-count="${revenue}" data-pre="₹">${inr(revenue)}</b></div>
      <div class="kpi"><span>To process</span><b class="num${todo ? " warn" : ""}" data-count="${todo}">${todo}</b></div>
      <div class="kpi"><span>Live products</span><b class="num">${ps.filter((p) => p.active !== false).length} / ${ps.length}</b></div>
      <div class="kpi"><span>Low stock</span><b class="num${low.length ? " bad" : ""}" data-count="${low.length}">${low.length}</b></div>
    </div>
    <div class="adm-grid">
      <div class="panel"><div class="panel-h"><h3>Recent orders</h3><button class="btn btn-o btn-sm" onclick="admTab('orders')">All orders</button></div>
        ${os.length ? ordersTable(os.slice(0, 5), true) : `<div class="panel-pad">${emptyBlock("inbox", "No orders yet", "Orders placed on this device appear here the moment they are confirmed.")}</div>`}</div>
      <div class="panel"><div class="panel-h"><h3>Products per shelf</h3></div>
        <div class="panel-pad"><div class="bars">${byCat.map((c) => `<div class="bar-r"><span>${esc(c.name)}</span><span class="bar-t"><i data-w="${Math.round((c.n / max) * 100)}"></i></span><span class="num">${c.n}</span></div>`).join("")}</div>
        ${low.length ? `<div class="reorder"><h4>Reorder soon</h4>${low.map((p) => `<div><span>${esc(p.name)}</span><b class="num">${p.stock}</b></div>`).join("")}</div>` : ""}</div></div>
    </div>
  </div>

  <div class="apanel" data-p="orders" ${show("orders")}>
    <div class="rep-modes" role="tablist" aria-label="Order views">${[
      ["list", "Order list"],
      ["daily", "Daily report"],
      ["weekly", "Weekly report"],
      ["monthly", "Monthly report"],
    ]
      .map(
        ([k, l]) =>
          `<button role="tab" class="${repMode === k ? "on" : ""}" onclick="setRepMode('${k}')">${l}</button>`,
      )
      .join("")}</div>
    ${repMode === "list"
      ? `
    <div class="ord-tools">${[["all", "All"], ...STATUS.map((s) => [s, s])].map(([k, l]) => `<button class="chip${ofil === k ? " on" : ""}" onclick="ofil='${k}';render()">${l}${k === "all" ? ` <b class="num">${os.length}</b>` : ` <b class="num">${os.filter((o) => o.status === k).length}</b>`}</button>`).join("")}</div>
    <div class="panel">${(() => {
        const list = ofil === "all" ? os : os.filter((o) => o.status === ofil);
        return list.length
          ? ordersTable(list, false)
          : `<div class="panel-pad">${emptyBlock("inbox", "No orders here", "Nothing matches this filter yet.")}</div>`;
      })()}</div>`
      : reportHTML(repMode)
    }
  </div>

  <div class="apanel" data-p="customers" ${show("customers")}>${customersHTML()}</div>

  <div class="apanel" data-p="products" ${show("products")}>
    <div class="ap-tools">
      <div class="ap-search">${ic("search")}<input id="apq" type="search" placeholder="Search products" value="${esc(apq)}" aria-label="Search products" oninput="apq=this.value;filterAdminProducts()"></div>
      <select id="apcat" aria-label="Filter by shelf" onchange="apcat=this.value;filterAdminProducts()"><option>All</option>${CATS.map((c) => `<option${apcat === c.id ? " selected" : ""}>${c.id}</option>`).join("")}</select>
      <span class="grow"></span>
      <button class="btn btn-o btn-sm" onclick="exportCatalogue()">${ic("download")}Backup</button>
      <label class="btn btn-o btn-sm">${ic("upload")}Restore<input type="file" accept="application/json" hidden onchange="importCatalogue(this.files[0])"></label>
      <button class="btn btn-o btn-sm" onclick="resetCatalogue()">Reset</button>
      <button class="btn btn-p btn-sm" onclick="editProduct(null)">${ic("plus")}Add product</button>
    </div>
    <div class="panel"><div class="tblwrap"><table class="data" id="apTable">
      <thead><tr><th></th><th>Product</th><th>Shelf</th><th>Price</th><th>MRP</th><th>Stock</th><th>Status</th><th></th></tr></thead>
      <tbody>${ps
      .map(
        (
          p,
        ) => `<tr data-n="${esc((p.name + " " + p.id).toLowerCase())}" data-c="${esc(p.cat)}">
        <td><span class="thumb">${pimg(p, "", 'loading="lazy"')}</span></td>
        <td><b>${esc(p.name)}</b><small>${esc(p.id)}</small></td>
        <td>${esc(p.cat)}</td><td class="num">${inr(p.price)}</td><td class="num muted">${p.mrp ? inr(p.mrp) : "—"}</td>
        <td class="num${isLow(p) ? " bad" : ""}">${p.stock}</td>
        <td><span class="tag ${p.active !== false ? "ok" : "off"}">${p.active !== false ? "Live" : "Hidden"}</span></td>
        <td class="acts"><button class="btn btn-o btn-sm" onclick="editProduct('${p.id}')">Edit</button>
          <button class="btn btn-o btn-sm" onclick="toggleActive('${p.id}')">${p.active !== false ? "Hide" : "Show"}</button>
          <button class="btn btn-d btn-sm" onclick="delProduct('${p.id}')">Delete</button></td></tr>`,
      )
      .join("")}</tbody></table>
      <div class="panel-pad" id="apEmpty" hidden>${emptyBlock("search", "No products match", "Try a different search or shelf.")}</div></div></div>
  </div>

  <div class="apanel" data-p="blog" ${show("blog")}>
    <div class="ap-tools"><span class="grow"></span><button class="btn btn-p btn-sm" onclick="editBlog(null)">${ic("plus")}Add post</button></div>
    <div class="panel"><div class="tblwrap"><table class="data">
      <thead><tr><th></th><th>Post</th><th>Category</th><th>Date</th><th></th></tr></thead>
      <tbody>${BLOGS.length
      ? blogSorted()
        .map(
          (b) => `<tr>
        <td><span class="thumb">${blogCover(b)}</span></td>
        <td><b>${esc(b.title)}</b><small>${esc(b.slug)}</small></td>
        <td>${esc(b.cat)}</td><td class="num">${blogDate(b.date)}</td>
        <td class="acts"><button class="btn btn-o btn-sm" onclick="editBlog('${esc(b.slug)}')">Edit</button>
          <a class="btn btn-o btn-sm" href="#/blog/${enc(b.slug)}">View</a>
          <button class="btn btn-d btn-sm" onclick="delBlog('${esc(b.slug)}')">Delete</button></td></tr>`,
        )
        .join("")
      : `<tr><td colspan="5" class="muted">No posts yet.</td></tr>`
    }</tbody></table></div></div>
  </div>

  <div class="apanel" data-p="coupons" ${show("coupons")}>
    <div class="panel"><div class="panel-h"><h3>Coupons</h3></div>
      <div class="tblwrap"><table class="data"><thead><tr><th>Code</th><th>Discount</th><th>Minimum order</th><th>Status</th><th></th></tr></thead>
        <tbody>${S.coupons.length
      ? S.coupons
        .map(
          (
            c,
          ) => `<tr><td><b class="num">${esc(c.code)}</b><small>${esc(c.note || "")}</small></td>
          <td class="num">${c.type === "pct" ? c.value + "%" + (c.max ? ` (up to ${inr(c.max)})` : "") : inr(c.value)}</td><td class="num">${inr(c.min || 0)}</td>
          <td><span class="tag ${c.active !== false ? "ok" : "off"}">${c.active !== false ? "Active" : "Paused"}</span></td>
          <td class="acts"><button class="btn btn-o btn-sm" onclick="toggleCoupon('${esc(c.code)}')">${c.active !== false ? "Pause" : "Activate"}</button><button class="btn btn-d btn-sm" onclick="delCoupon('${esc(c.code)}')">Delete</button></td></tr>`,
        )
        .join("")
      : `<tr><td colspan="5" class="muted">No coupons yet.</td></tr>`
    }</tbody></table></div>
      <div class="cpn-form"><h4>Add a coupon</h4>
        <div class="grid g4">
          <div class="field"><label for="cCode">Code</label><input id="cCode" maxlength="16" placeholder="FESTIVE15"></div>
          <div class="field"><label for="cType">Type</label><select id="cType"><option value="pct">Percent off</option><option value="flat">Flat amount off</option></select></div>
          <div class="field"><label for="cVal">Value</label><input id="cVal" type="number" min="1" placeholder="15"></div>
          <div class="field"><label for="cMin">Minimum order (₹)</label><input id="cMin" type="number" min="0" placeholder="499"></div>
        </div>
        <div class="err" id="eCpn"></div>
        <button class="btn btn-p btn-sm" onclick="addCoupon()">Add coupon</button></div>
    </div>
  </div>

  <div class="apanel" data-p="adminprofile" ${show("adminprofile")}>
    ${adminProfilePanel()}
  </div>

  </div>`;
}
function ordersTable(list, compact) {
  return `<div class="tblwrap"><table class="data${compact ? " data-compact" : ""}"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th>${compact ? "" : "<th>Payment</th>"}<th>Status</th><th></th></tr></thead>
    <tbody>${list
      .map(
        (
          o,
        ) => `<tr style="cursor:pointer;" onclick="if(!event.target.closest('select') && !event.target.closest('button')) adminOrder('${esc(o.order_number || o.id)}')">
      <td><b class="num" style="color:var(--leaf);text-decoration:underline;">${esc(o.order_number || o.id)}</b><small>${fmtDate(o.when, { day: "numeric", month: "short" })}</small></td>
      <td>${esc((o.address && o.address.name) || o.customer_name || "Customer")}<small class="num">${esc((o.address && o.address.phone) || o.customer_phone || "")}</small></td>
      <td>${(o.items || []).reduce((n, i) => n + i.qty, 0)} <small>${esc((o.items && o.items[0] && o.items[0].name) || "Item")}${(o.items || []).length > 1 ? ` +${o.items.length - 1}` : ""}</small>${(o.items || []).some((i) => i.custom) ? `<small class="cz-flag">${ic("camera")}Personalised</small>` : ""}</td>
      <td class="num">${inr(o.total)}</td>${compact ? "" : `<td><small>${esc(payText(o.payment))}</small></td>`}
      <td onclick="event.stopPropagation()"><select class="st-sel ${orderStatusClass(o.status)}" onchange="setOrderStatus('${esc(o.order_number || o.id)}',this.value)" aria-label="Order status">${STATUS.map((s) => `<option${s === o.status ? " selected" : ""}>${s}</option>`).join("")}</select></td>
      <td class="acts"><button class="btn btn-o btn-sm" onclick="event.stopPropagation();adminOrder('${esc(o.order_number || o.id)}')">View</button></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
}
function adminOrder(id) {
  let o = findO(id);
  if (!o) {
    API.get('/orders/' + id).then(res => {
      if (res && res.success && res.order) {
        const mapped = mapOrderFromApi(res.order);
        const idx = S.orders.findIndex(x => x.id === mapped.id || x.id === mapped.order_number);
        if (idx >= 0) S.orders[idx] = mapped;
        else S.orders.unshift(mapped);
        DB.write("orders", S.orders);
        renderAdminOrderModal(mapped);
      } else {
        toast("Order not found.", "err");
      }
    });
    return;
  }
  renderAdminOrderModal(o);
}
function renderAdminOrderModal(o) {
  if (!o) return;
  const a = o.address || {};
  const cName = a.name || o.customer_name || "Customer";
  const cPhone = a.phone || o.customer_phone || "";
  const cEmail = o.email || o.customer_email || "";
  const msg = `Hello ${cName}, this is Lemurra Traders about your order ${o.id}.`;
  const hist = (o.history && Array.isArray(o.history) && o.history.length) ? o.history : [
    { s: "Order Confirmed", t: o.when || Date.now() },
    ...(o.status && o.status !== "Order Confirmed" ? [{ s: o.status, t: Date.now() }] : [])
  ];

  modal(
    "Order " + (o.order_number || o.id),
    `<div class="ao"><div><h4>Customer</h4><p><b>${esc(cName)}</b><br><span class="num">${esc(cPhone)}</span><br>${esc(cEmail)}</p>
      <h4>Deliver to</h4><p>${addrText(a)}</p>
      <h4>Payment</h4><p>${esc(payText(o.payment))}</p>
      ${o.note ? `<h4>Customer note</h4><p>${esc(o.note)}</p>` : ""}
      ${o.cancelReason ? `<h4>Cancellation reason</h4><p>${esc(o.cancelReason)}</p>` : ""}</div>
     <div><h4>Items</h4>${(o.items || []).map((i) => `<div class="ao-i"><span class="thumb">${orderThumb(i)}</span><span><b>${esc(i.name)}</b><small>Qty ${i.qty} · ${inr(i.price)}</small></span><b class="num">${inr(i.price * i.qty)}</b></div>`).join("")}
      ${o.gift ? `<div class="ao-i"><span class="thumb gift-ic">${ic("sparkle")}</span><span><b>Free ${esc(o.gift)}</b><small>Pack with this order</small></span><b class="ok">Free</b></div>` : ""}
      ${(o.items || [])
      .filter((i) => i.custom)
      .map((i) => czView(i, true))
      .join("")}
      <div class="ao-t"><span>Total</span><b class="num">${inr(o.total)}</b></div>
      <h4>History</h4><ol class="ao-h">${hist.map((h) => `<li><b>${esc(h.s)}</b><small>${fmtDT(h.t)}</small></li>`).join("")}</ol></div></div>`,
    `<button class="btn btn-o" onclick="printInvoice('${o.order_number || o.id}')">${ic("download")}Invoice</button>
    ${cPhone ? `<a class="btn btn-o" href="https://wa.me/91${phoneClean(cPhone)}?text=${enc(msg)}" target="_blank" rel="noopener">${ic("chat")}Message customer</a>` : ""}
    <a class="btn btn-o" href="/order/${o.order_number || o.id}" onclick="event.preventDefault();closeModal();go('order/${o.order_number || o.id}')">Full View</a>
    <button class="btn btn-p" onclick="closeModal()">Done</button>`,
    { wide: true },
  );
}
/* ---------- ORDER REPORTS: daily / weekly / monthly ---------- */
let repMode = "list",
  repOff = 0;
function setRepMode(m) {
  repMode = m;
  repOff = 0;
  render();
}
function repShift(d) {
  repOff = Math.max(0, repOff + d);
  render();
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function repRange(mode, off) {
  const t = startOfDay(new Date());
  let a, b;
  if (mode === "daily") {
    a = new Date(t);
    a.setDate(a.getDate() - off);
    b = new Date(a);
    b.setDate(b.getDate() + 1);
  } else if (mode === "weekly") {
    a = new Date(t);
    a.setDate(a.getDate() - ((a.getDay() + 6) % 7) - 7 * off);
    b = new Date(a);
    b.setDate(b.getDate() + 7);
  } /* Monday to Sunday */ else {
    a = new Date(t.getFullYear(), t.getMonth() - off, 1);
    b = new Date(t.getFullYear(), t.getMonth() - off + 1, 1);
  }
  return { a: +a, b: +b };
}
function repLabel(mode, r) {
  const f = (d, o) => new Date(d).toLocaleDateString("en-IN", o),
    last = r.b - 864e5;
  if (mode === "daily")
    return f(r.a, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  if (mode === "weekly")
    return (
      f(r.a, { day: "numeric", month: "short" }) +
      " to " +
      f(last, { day: "numeric", month: "short", year: "numeric" })
    );
  return f(r.a, { month: "long", year: "numeric" });
}
function repShort(mode, r) {
  const f = (d, o) => new Date(d).toLocaleDateString("en-IN", o);
  if (mode === "daily") return f(r.a, { day: "numeric", month: "short" });
  if (mode === "weekly") return f(r.a, { day: "numeric", month: "short" });
  return f(r.a, { month: "short", year: "2-digit" });
}
const inRange = (o, r) => o.when >= r.a && o.when < r.b;
function repStats(list) {
  const live = list.filter((o) => o.status !== "Cancelled");
  const revenue = live.reduce((n, o) => n + o.total, 0),
    items = live.reduce(
      (n, o) => n + o.items.reduce((m, i) => m + i.qty, 0),
      0,
    );
  return {
    orders: list.length,
    live: live.length,
    revenue,
    items,
    avg: live.length ? Math.round(revenue / live.length) : 0,
    cancelled: list.length - live.length,
    custom: list.filter((o) => o.items.some((i) => i.custom)).length,
    open: list.filter(
      (o) => o.status === "Order Confirmed" || o.status === "Packed",
    ).length,
  };
}
function repDelta(now, before) {
  if (!before)
    return now ? `<small class="up">New</small>` : `<small>No change</small>`;
  const d = Math.round(((now - before) / before) * 100);
  return `<small class="${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "▲ " : d < 0 ? "▼ " : ""}${Math.abs(d)}% vs previous ${repMode === "daily" ? "day" : repMode === "weekly" ? "week" : "month"}</small>`;
}
function reportHTML(mode) {
  const os = S.orders,
    r = repRange(mode, repOff),
    prev = repRange(mode, repOff + 1);
  const list = os.filter((o) => inRange(o, r)),
    st = repStats(list),
    pv = repStats(os.filter((o) => inRange(o, prev)));
  const unit = mode === "daily" ? "day" : mode === "weekly" ? "week" : "month",
    N = mode === "daily" ? 14 : mode === "weekly" ? 8 : 12;
  const trend = [];
  for (let k = N - 1; k >= 0; k--) {
    const rr = repRange(mode, repOff + k);
    trend.push({ r: rr, ...repStats(os.filter((o) => inRange(o, rr))) });
  }
  const maxRev = Math.max(1, ...trend.map((t) => t.revenue));
  const prod = {};
  list
    .filter((o) => o.status !== "Cancelled")
    .forEach((o) =>
      o.items.forEach((i) => {
        const x = prod[i.id] || (prod[i.id] = { name: i.name, qty: 0, rev: 0 });
        x.qty += i.qty;
        x.rev += i.price * i.qty;
      }),
    );
  const top = Object.values(prod)
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 8);
  const pay = {};
  list
    .filter((o) => o.status !== "Cancelled")
    .forEach((o) => {
      const k =
        o.payment && o.payment.method === "cod"
          ? "Cash on delivery"
          : "Paid online";
      pay[k] = (pay[k] || 0) + 1;
    });
  const title =
    mode === "daily"
      ? "Daily order report"
      : mode === "weekly"
        ? "Weekly order report"
        : "Monthly order report";
  return `<div class="rep">
    <div class="rep-h"><div><h3>${title}</h3><p>${repLabel(mode, r)}${repOff === 0 ? ` <em class="tag ok">Current ${unit}</em>` : ""}</p></div>
      <div class="rep-nav"><button class="btn btn-o btn-sm" onclick="repShift(1)" aria-label="Previous ${unit}">← Previous ${unit}</button>
        <button class="btn btn-o btn-sm" onclick="repShift(-1)" ${repOff === 0 ? "disabled" : ""} aria-label="Next ${unit}">Next ${unit} →</button>
        <button class="btn btn-o btn-sm" onclick="repCSV('${mode}')" ${list.length ? "" : "disabled"}>${ic("download")}CSV</button>
        <button class="btn btn-p btn-sm" onclick="repPrint('${mode}')" ${list.length ? "" : "disabled"}>${ic("download")}Print / PDF</button></div></div>
    <div class="kpis kpis5 rep-k">
      <div class="kpi"><span>Orders</span><b class="num">${st.orders}</b>${repDelta(st.orders, pv.orders)}</div>
      <div class="kpi"><span>Revenue</span><b class="num">${inr(st.revenue)}</b>${repDelta(st.revenue, pv.revenue)}</div>
      <div class="kpi"><span>Items sold</span><b class="num">${st.items}</b>${repDelta(st.items, pv.items)}</div>
      <div class="kpi"><span>Average order</span><b class="num">${inr(st.avg)}</b><small>Cancelled excluded</small></div>
      <div class="kpi"><span>Cancelled</span><b class="num${st.cancelled ? " bad" : ""}">${st.cancelled}</b><small>${st.open} still to process · ${st.custom} personalised</small></div>
    </div>
    <div class="adm-grid">
      <div class="panel"><div class="panel-h"><h3>Last ${N} ${unit}s</h3><small class="muted">Revenue</small></div>
        <div class="panel-pad"><div class="bars rep-bars">${trend.map((t) => `<div class="bar-r${t.r.a === r.a ? " cur" : ""}"><span>${repShort(mode, t.r)}</span><span class="bar-t"><i style="width:${Math.round((t.revenue / maxRev) * 100)}%"></i></span><span class="num">${t.orders}</span></div>`).join("")}</div>
          <p class="rep-cap">Bar = revenue (${inr(maxRev)} at full width). Number = orders.</p></div></div>
      <div class="panel"><div class="panel-h"><h3>Best sellers this ${unit}</h3></div>
        ${top.length
      ? `<div class="tblwrap"><table class="data data-s"><thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>${top.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td class="num">${x.qty}</td><td class="num">${inr(x.rev)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="panel-pad">${emptyBlock("inbox", "Nothing sold", "No completed orders in this " + unit + ".")}</div>`
    }
        ${Object.keys(pay).length
      ? `<div class="panel-pad rep-pay">${Object.entries(pay)
        .map(([k, v]) => `<span class="tag info">${k}: ${v}</span>`)
        .join(" ")}</div>`
      : ""
    }</div>
    </div>
    <div class="panel"><div class="panel-h"><h3>Orders in this ${unit} <span class="num">(${list.length})</span></h3></div>
      ${list.length ? ordersTable(list, false) : `<div class="panel-pad">${emptyBlock("inbox", "No orders", "No orders were placed in this " + unit + ". Use Previous to look further back.")}</div>`}</div>
  </div>`;
}
function repRows(mode) {
  const r = repRange(mode, repOff);
  return { r, list: S.orders.filter((o) => inRange(o, r)) };
}
function repCSV(mode) {
  const { r, list } = repRows(mode),
    q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [
    [
      "Order ID",
      "Date",
      "Customer",
      "Phone",
      "Email",
      "Items",
      "Quantity",
      "Total (INR)",
      "Payment",
      "Status",
      "Personalised",
    ],
  ];
  list.forEach((o) =>
    rows.push([
      o.id,
      new Date(o.when).toLocaleString("en-IN"),
      o.address.name,
      o.address.phone,
      o.email,
      o.items.map((i) => i.name + " x" + i.qty).join("; "),
      o.items.reduce((n, i) => n + i.qty, 0),
      o.total,
      payText(o.payment),
      o.status,
      o.items.some((i) => i.custom) ? "Yes" : "No",
    ]),
  );
  const blob = new Blob(
    ["\ufeff" + rows.map((x) => x.map(q).join(",")).join("\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lemurra-${mode}-orders-${new Date(r.a).toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Report downloaded.");
}
function repPrint(mode) {
  const { r, list } = repRows(mode),
    st = repStats(list);
  const w = window.open("", "_blank");
  if (!w) {
    toast("Allow pop-ups to print the report.", "err");
    return;
  }
  w.document
    .write(`<!doctype html><title>${mode} order report</title><style>body{font:13px/1.5 Roboto,Arial,sans-serif;margin:32px;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:7px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.k{display:flex;gap:28px;flex-wrap:wrap;margin:14px 0}.k div{min-width:110px}.k b{display:block;font-size:20px}</style>
    <h1>Lemurra Traders — ${mode[0].toUpperCase() + mode.slice(1)} order report</h1><p>${esc(repLabel(mode, r))} · generated ${fmtDT(Date.now())}</p>
    <div class="k"><div>Orders<b>${st.orders}</b></div><div>Revenue<b>${inr(st.revenue)}</b></div><div>Items sold<b>${st.items}</b></div><div>Average order<b>${inr(st.avg)}</b></div><div>Cancelled<b>${st.cancelled}</b></div></div>
    <table><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Payment</th><th>Status</th><th>Total</th></tr>${list.map((o) => `<tr><td>${esc(o.id)}</td><td>${fmtDT(o.when)}</td><td>${esc(o.address.name)}<br>${esc(o.address.phone)}</td><td>${o.items.map((i) => esc(i.name) + " × " + i.qty).join("<br>")}</td><td>${esc(payText(o.payment))}</td><td>${esc(o.status)}</td><td>${inr(o.total)}</td></tr>`).join("")}</table>
    <script>onload=()=>print()<\/script>`);
  w.document.close();
}

/* ---------- CUSTOMERS: every account, with its orders, wishlist and addresses ---------- */
let custQ = "";
function customerList() {
  const accs = DB.read("accounts", {}),
    map = {};
  Object.keys(accs).forEach((k) => {
    const a = accs[k];
    map[k] = {
      email: k,
      name: a.name,
      phone: a.phone,
      joined: a.joined,
      last: a.last,
      addresses: a.addresses || [],
      wish: a.wish || [],
      account: true,
      demo: !!a.demo,
    };
  });
  S.orders.forEach((o) => {
    const k = String(o.email || "").toLowerCase();
    if (!k) return;
    if (!map[k])
      map[k] = {
        email: k,
        name: o.address.name,
        phone: o.address.phone,
        joined: null,
        last: null,
        addresses: [],
        wish: [],
        account: false,
      };
  });
  return Object.values(map)
    .map((c) => {
      const os = S.orders.filter(
        (o) => String(o.email || "").toLowerCase() === c.email,
      ),
        live = os.filter((o) => o.status !== "Cancelled");
      return { ...c, orders: os, spent: live.reduce((n, o) => n + o.total, 0) };
    })
    .sort((a, b) => (b.last || b.joined || 0) - (a.last || a.joined || 0));
}
function customersHTML() {
  const all = customerList(),
    q = custQ.trim().toLowerCase();
  const list = q
    ? all.filter((c) =>
      (c.name + " " + c.email + " " + (c.phone || ""))
        .toLowerCase()
        .includes(q),
    )
    : all;
  return `<div class="ap-tools"><div class="ap-search">${ic("search")}<input type="search" placeholder="Search name, email or phone" value="${esc(custQ)}" aria-label="Search customers" oninput="custQ=this.value;custFilter()"></div>
      <span class="grow"></span><span class="muted">${all.length} customer${all.length === 1 ? "" : "s"}</span></div>
    <div class="panel"><div class="tblwrap" id="custWrap">${custTable(list)}</div></div>`;
}
function custTable(list) {
  if (!list.length)
    return `<div class="panel-pad">${emptyBlock("user", "No customers yet", "Accounts appear here as soon as someone registers or places an order.")}</div>`;
  return `<table class="data"><thead><tr><th>Customer</th><th>Contact</th><th>Signed up</th><th>Orders</th><th>Spent</th><th>Wishlist</th><th></th></tr></thead><tbody>${list
    .map(
      (c) => `<tr>
    <td><b>${esc(c.name || "—")}</b>${c.demo ? ` <span class="tag info">Demo</span>` : ""}${c.account ? "" : `<small>No account (guest)</small>`}</td>
    <td>${esc(c.email)}<small class="num">${esc(c.phone || "")}</small></td>
    <td>${c.joined ? fmtDate(c.joined, { day: "numeric", month: "short", year: "numeric" }) : "—"}<small>${c.last ? "Last sign-in " + fmtDate(c.last, { day: "numeric", month: "short" }) : ""}</small></td>
    <td class="num">${c.orders.length}</td><td class="num">${inr(c.spent)}</td><td class="num">${c.wish.filter((id) => findP(id)).length}</td>
    <td class="acts"><button class="btn btn-o btn-sm" onclick="adminCustomer('${esc(c.email)}')">View account</button></td></tr>`,
    )
    .join("")}</tbody></table>`;
}
function custFilter() {
  const q = custQ.trim().toLowerCase();
  const all = customerList();
  const w = $("#custWrap");
  if (w)
    w.innerHTML = custTable(
      q
        ? all.filter((c) =>
          (c.name + " " + c.email + " " + (c.phone || ""))
            .toLowerCase()
            .includes(q),
        )
        : all,
    );
}
function adminCustomer(email) {
  const c = customerList().find((x) => x.email === email);
  if (!c) return;
  const wl = c.wish.map(findP).filter(Boolean),
    addrs = c.addresses || [];
  modal(
    "Customer account",
    `<div class="ao"><div>
      <h4>Profile</h4><p><b>${esc(c.name || "—")}</b><br>${esc(c.email)}<br><span class="num">${esc(c.phone || "No mobile added")}</span></p>
      <h4>Account</h4><p>${c.account ? `Signed up ${c.joined ? fmtDT(c.joined) : "—"}${c.last ? `<br>Last sign-in ${fmtDT(c.last)}` : ""}` : "Ordered without a saved account."}</p>
      <h4>Saved addresses (${addrs.length})</h4>${addrs.length ? addrs.map((a) => `<p class="cu-a"><b>${esc(a.name)}</b> <em class="tag-t">${esc(a.type || "Home")}</em><br>${addrText(a)}<br><span class="num">${esc(a.phone)}</span></p>`).join("") : `<p class="muted">None saved.</p>`}
      <h4>Wishlist (${wl.length})</h4>${wl.length ? wl.map((p) => `<div class="ao-i"><span class="thumb">${pimg(p, "", 'loading="lazy"')}</span><span><b>${esc(p.name)}</b><small>${esc(p.cat)}</small></span><b class="num">${inr(p.price)}</b></div>`).join("") : `<p class="muted">Nothing saved yet.</p>`}</div>
     <div><h4>Orders (${c.orders.length}) · ${inr(c.spent)} spent</h4>
      ${c.orders.length ? c.orders.map((o) => `<div class="ao-i cu-o"><span><b class="num">${esc(o.id)}</b><small>${fmtDate(o.when, { day: "numeric", month: "short", year: "numeric" })} · ${o.items.reduce((n, i) => n + i.qty, 0)} item${o.items.reduce((n, i) => n + i.qty, 0) > 1 ? "s" : ""}${o.items.some((i) => i.custom) ? " · personalised" : ""}</small></span><span class="tag ${orderStatusClass(o.status)}">${esc(o.status)}</span><b class="num">${inr(o.total)}</b><button class="btn btn-o btn-sm" onclick="closeModal();setTimeout(()=>adminOrder('${o.id}'),80)">View</button></div>`).join("") : `<p class="muted">No orders yet.</p>`}</div></div>`,
    `${c.phone ? `<a class="btn btn-o" href="https://wa.me/91${phoneClean(c.phone)}" target="_blank" rel="noopener">${ic("chat")}Message customer</a>` : ""}<button class="btn btn-p" onclick="closeModal()">Done</button>`,
    { wide: true },
  );
}
function admTab(k) {
  S.tab = k;
  $$("#atabs button").forEach((b) =>
    b.classList.toggle("on", b.dataset.k === k),
  );
  $$(".apanel").forEach((p) => {
    const on = p.dataset.p === k;
    p.hidden = !on;
    if (on) {
      p.classList.remove("enter");
      void p.offsetWidth;
      p.classList.add("enter");
    }
  });
  placeTab("#atabs");
  if (k === "overview") bindAdmin();
}
function placeTab(sel) {
  const box = $(sel);
  if (!box) return;
  const on = box.querySelector("button.on"),
    i = box.querySelector(".atab-i");
  if (!on || !i) return;
  i.style.width = on.offsetWidth + "px";
  i.style.transform = `translateX(${on.offsetLeft}px)`;
}
function bindAdmin() {
  requestAnimationFrame(() => {
    $$(".bar-t i").forEach((i) => (i.style.width = i.dataset.w + "%"));
  });
}
function filterAdminProducts() {
  const q = apq.trim().toLowerCase();
  let n = 0;
  $$("#apTable tbody tr").forEach((r) => {
    const ok =
      (!q || r.dataset.n.includes(q)) &&
      (apcat === "All" || r.dataset.c === apcat);
    r.hidden = !ok;
    if (ok) n++;
  });
  $("#apEmpty").hidden = n > 0;
  $("#apTable").style.display = n ? "" : "none";
}

/* ---- products: hide / delete / reset / backup ---- */
function toggleActive(id) {
  const p = findP(id);
  p.active = p.active === false;
  if (saveProducts()) {
    render();
    toast(
      p.name + (p.active ? " is live again." : " is hidden from the shop."),
    );
  }
}
function delProduct(id) {
  const p = findP(id);
  modal(
    "Delete this product?",
    `<p class="m-note">“${esc(p.name)}” will be removed from the catalogue. Anything already in a cart will drop out too. Past orders are not affected.</p>`,
    `<button class="btn btn-o" onclick="closeModal()">Keep it</button><button class="btn btn-d" onclick="confirmDel('${id}')">Delete product</button>`,
  );
}
function confirmDel(id) {
  S.products = S.products.filter((p) => p.id !== id);
  S.cart = S.cart.filter((i) => i.id !== id);
  S.wish = S.wish.filter((w) => w !== id);
  saveProducts();
  save();
  badges();
  buildMega();
  closeModal();
  render();
  API.delete("/admin/products/" + id);
  toast("Product deleted.");
}
function resetCatalogue() {
  modal(
    "Reset the catalogue?",
    `<p class="m-note">This puts the original ${SEED.length} products back and discards every product you added or edited here.</p>`,
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-d" onclick="doReset()">Reset catalogue</button>`,
  );
}
function doReset() {
  S.products = SEED.map((p) => ({ ...p, active: true }));
  saveProducts();
  buildMega();
  closeModal();
  render();
  toast("Catalogue reset.");
}
function exportCatalogue() {
  const blob = new Blob(
    [
      JSON.stringify({
        app: "lemurra",
        v: 3,
        when: Date.now(),
        products: S.products,
        coupons: S.coupons,
      }),
    ],
    { type: "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    "lemurra-catalogue-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Backup downloaded.");
}
function importCatalogue(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (
        !d ||
        !Array.isArray(d.products) ||
        !d.products.every((p) => p && p.id && p.name && p.price > 0)
      )
        throw new Error("bad");
      modal(
        "Restore this backup?",
        `<p class="m-note">This replaces the current catalogue with <b>${d.products.length} products</b> from the file. Your orders are not touched.</p>`,
        `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="doRestore">Restore</button>`,
      );
      $("#doRestore").onclick = () => {
        S.products = d.products;
        if (Array.isArray(d.coupons)) {
          S.coupons = d.coupons;
          DB.write("coupons", S.coupons);
        }
        saveProducts();
        buildMega();
        closeModal();
        render();
        toast("Catalogue restored.");
      };
    } catch (e) {
      toast("That file is not a Lemurra backup.", "err");
    }
  };
  r.readAsText(file);
}

/* ---- coupons ---- */
function addCoupon() {
  const code = ($("#cCode").value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ""),
    type = $("#cType").value,
    val = +$("#cVal").value,
    min = +$("#cMin").value || 0;
  if (code.length < 3)
    return setErr("eCpn", "Use a code of at least three letters or numbers.");
  if (S.coupons.some((c) => c.code === code))
    return setErr("eCpn", "That code already exists.");
  if (!(val > 0) || (type === "pct" && val > 90))
    return setErr(
      "eCpn",
      "Enter a discount value. Percentages can be at most 90.",
    );
  const max = type === "pct" ? Math.round(Math.max(150, min * 0.3)) : 0;
  const note =
    type === "pct"
      ? `${val}% off${min ? " on orders above " + inr(min) : ""}`
      : `${inr(val)} off${min ? " on orders above " + inr(min) : ""}`;

  const c = {
    code,
    type,
    value: val,
    min,
    max,
    active: true,
    note
  };
  S.coupons.unshift(c);
  DB.write("coupons", S.coupons);
  S.tab = "coupons";
  render();
  toast("Coupon " + code + " added.");

  API.post("/admin/coupons", {
    code: c.code,
    type: c.type,
    value: c.value,
    min: c.min,
    max: c.max,
    active: true,
    note: c.note
  }).then(res => {
    if (res && res.success && res.coupon) {
      c.id = res.coupon.id;
      DB.write("coupons", S.coupons);
    }
  }).catch(() => { });
}
function toggleCoupon(code) {
  const c = S.coupons.find((x) => x.code === code);
  if (!c) return;
  c.active = c.active === false;
  DB.write("coupons", S.coupons);
  render();
  API.post("/admin/coupons", {
    code: c.code,
    type: c.type,
    value: c.value,
    min: c.min || 0,
    max: c.max || 0,
    active: c.active,
    note: c.note || ""
  }).catch(() => { });
}
function delCoupon(code) {
  const c = S.coupons.find((x) => x.code === code);
  const idOrCode = (c && c.id) ? c.id : code;
  S.coupons = S.coupons.filter((c) => c.code !== code);
  if (S.coupon === code) {
    S.coupon = "";
    DB.drop("coupon");
  }
  DB.write("coupons", S.coupons);
  render();
  toast("Coupon deleted.");
  API.delete("/admin/coupons/" + idOrCode).catch(() => { });
}

/* =====================================================================
   ADD / EDIT PRODUCT — with photo upload and a live card preview
   ===================================================================== */
let PF = null;
const CODE_PREFIX = {
  "Home Decor": "LTHD",
  Kids: "LTKD",
  "Home Utility": "LTHU",
  Accessories: "LTAC",
  Customize: "LTCU",
};
function suggestCode(cat) {
  const pre = CODE_PREFIX[cat] || "LTPR";
  let n = S.products.filter((p) => p.id.startsWith(pre)).length + 1,
    id;
  do {
    id = pre + String(n++).padStart(3, "0");
  } while (findP(id));
  return id;
}
/* shrink an uploaded photo to a web-sized WebP so it fits in browser storage; detect a white backdrop */
function fileToPhoto(file, max, q) {
  max = max || 900;
  q = q || 0.82;
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type))
      return rej(new Error(`“${file.name}” is not an image.`));
    if (file.size > 15 * 1024 * 1024)
      return rej(new Error(`“${file.name}” is larger than 15 MB.`));
    const url = URL.createObjectURL(file),
      im = new Image();
    im.onload = () => {
      const r = Math.min(1, max / Math.max(im.width, im.height)),
        w = Math.max(1, Math.round(im.width * r)),
        h = Math.max(1, Math.round(im.height * r));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, w, h);
      x.drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let white = false;
      try {
        const pts = [
          [2, 2],
          [w - 3, 2],
          [2, h - 3],
          [w - 3, h - 3],
          [w >> 1, 2],
          [w >> 1, h - 3],
          [2, h >> 1],
          [w - 3, h >> 1],
        ];
        white = pts.every(([px, py]) => {
          const d = x.getImageData(px, py, 1, 1).data;
          return d[0] > 236 && d[1] > 236 && d[2] > 236;
        });
      } catch (e) { }
      let out = c.toDataURL("image/webp", q);
      if (out.indexOf("data:image/webp") !== 0)
        out = c.toDataURL("image/jpeg", Math.min(0.9, q + 0.02));
      res({ src: out, white });
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error(`Could not read “${file.name}”.`));
    };
    im.src = url;
  });
}
function editProduct(id) {
  const p = id ? findP(id) : null;
  PF = {
    editId: id || null,
    imgs: p ? galleryOf(p) : [],
    specs: p
      ? Object.entries(p.specs || {})
      : [
        ["Material", ""],
        ["Size", ""],
      ],
  };
  const b = p || {
    name: "",
    cat: "Home Decor",
    price: "",
    mrp: "",
    stock: 10,
    blurb: "",
  };
  modal(
    id ? "Edit product" : "Add a product",
    `<div class="pf">
     <div class="pf-form">
       <div class="field"><label for="fName">Product name</label><input id="fName" value="${esc(b.name)}" placeholder="What buyers will see" oninput="pfPreview()"></div>
       <div class="grid g2">
         <div class="field"><label for="fCat">Shelf</label><select id="fCat" onchange="pfCat()">${CATS.map((c) => `<option${c.id === b.cat ? " selected" : ""}>${c.id}</option>`).join("")}</select></div>
         <div class="field"><label for="fId">Product code</label><input id="fId" value="${esc(id || suggestCode(b.cat))}" ${id ? "disabled" : ""}></div>
         <div class="field"><label for="fPrice">Selling price (₹)</label><input id="fPrice" type="number" min="1" value="${b.price}" oninput="pfPreview()"></div>
         <div class="field"><label for="fMrp">MRP (₹), optional</label><input id="fMrp" type="number" min="0" value="${b.mrp || ""}" oninput="pfPreview()"></div>
         <div class="field"><label for="fStock">Units in stock</label><input id="fStock" type="number" min="0" value="${b.stock}"></div>
       </div>
       <div class="field"><label for="fBlurb">Description</label><textarea id="fBlurb" rows="3" placeholder="Two sentences on what it is and who it suits">${esc(id ? b.blurb : "")}</textarea></div>
       <div class="pf-sec"><h4>Photos <small>Up to 4. The first one is the main photo.</small></h4><div id="pfPhotos"></div>
         <div class="pf-lib"><label for="pfLib">Or pick one of the shop's existing photos</label>
           <select id="pfLib" onchange="pfLibPick(this.value)"><option value="">Choose a photo…</option>${Object.keys(
      IMG,
    )
      .filter((k) => k !== "logo")
      .map((k) => `<option value="${k}">${k}</option>`)
      .join("")}</select></div></div>
       <div class="pf-sec"><h4>Details <small>Shown in the specifications table.</small></h4><div id="pfSpecs"></div>
         <button class="btn btn-o btn-sm" onclick="pfAddSpec()">${ic("plus")}Add a detail</button></div>
       <div class="err" id="eForm"></div>
     </div>
     <aside class="pf-prev"><h4>Live preview</h4><div id="pfCard" inert></div><p class="m-note">This is how the product appears in the shop.</p></aside>
   </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-glow" onclick="saveProduct()">${id ? "Save changes" : "Add to catalogue"}</button>`,
    { wide: true },
  );
  pfPaint();
  pfSpecs();
}
function pfCat() {
  if (!PF.editId) $("#fId").value = suggestCode($("#fCat").value);
  pfPreview();
}
function pfPaint() {
  $("#pfPhotos").innerHTML = `<div class="pf-ph">
    ${PF.imgs
      .map(
        (
          g,
          i,
        ) => `<div class="pf-th${i === 0 ? " main" : ""}"><img src="${g.src}" alt="Photo ${i + 1}" data-w="${g.white ? 1 : 0}">
       <button class="pf-x" onclick="pfRemove(${i})" aria-label="Remove photo ${i + 1}">${ic("x")}</button>
       ${i === 0 ? `<span class="pf-badge">Main</span>` : `<button class="pf-mk" onclick="pfMain(${i})">Make main</button>`}</div>`,
      )
      .join("")}
    ${PF.imgs.length < 4 ? `<label class="pf-add" id="pfDrop"><input type="file" accept="image/*" multiple hidden id="pfFile">${ic("upload")}<b>Upload photo</b><small>Drop or tap. JPG, PNG, WebP</small></label>` : ""}</div>`;
  const f = $("#pfFile"),
    d = $("#pfDrop");
  if (f)
    f.addEventListener("change", () => {
      pfFiles([...f.files]);
      f.value = "";
    });
  if (d) {
    ["dragenter", "dragover"].forEach((ev) =>
      d.addEventListener(ev, (e) => {
        e.preventDefault();
        d.classList.add("over");
      }),
    );
    ["dragleave", "drop"].forEach((ev) =>
      d.addEventListener(ev, (e) => {
        e.preventDefault();
        d.classList.remove("over");
      }),
    );
    d.addEventListener("drop", (e) => pfFiles([...e.dataTransfer.files]));
  }
  pfPreview();
}
async function pfFiles(files) {
  const room = 4 - PF.imgs.length;
  if (!files.length) return;
  if (files.length > room)
    toast(
      `Only ${room} more photo${room === 1 ? "" : "s"} can be added.`,
      "err",
    );
  const box = $("#pfDrop");
  if (box) box.classList.add("busy");
  for (const f of files.slice(0, room)) {
    try {
      PF.imgs.push(await fileToPhoto(f));
    } catch (e) {
      toast(e.message, "err");
    }
  }
  pfPaint();
}
function pfRemove(i) {
  PF.imgs.splice(i, 1);
  pfPaint();
}
function pfMain(i) {
  const [g] = PF.imgs.splice(i, 1);
  PF.imgs.unshift(g);
  pfPaint();
}
function pfLibPick(k) {
  if (!k) return;
  const g = { src: IMG[k], white: WHITE.has(k) };
  if (PF.imgs.length) PF.imgs[0] = g;
  else PF.imgs.push(g);
  $("#pfLib").value = "";
  pfPaint();
}
function pfSpecs() {
  $("#pfSpecs").innerHTML =
    PF.specs
      .map(
        (
          s,
          i,
        ) => `<div class="sp-row"><input class="sk" placeholder="e.g. Material" value="${esc(s[0])}" aria-label="Detail name"><input class="sv" placeholder="e.g. Acacia wood" value="${esc(s[1])}" aria-label="Detail value">
      <button class="pf-x2" onclick="pfDelSpec(${i})" aria-label="Remove detail">${ic("x")}</button></div>`,
      )
      .join("") || `<p class="m-note">No details yet.</p>`;
}
function pfReadSpecs() {
  return $$("#pfSpecs .sp-row").map((r) => [
    r.querySelector(".sk").value.trim(),
    r.querySelector(".sv").value.trim(),
  ]);
}
function pfAddSpec() {
  PF.specs = pfReadSpecs();
  if (PF.specs.length >= 8) {
    toast("Eight details is the maximum.", "err");
    return;
  }
  PF.specs.push(["", ""]);
  pfSpecs();
  const r = $$("#pfSpecs .sk");
  r[r.length - 1].focus();
}
function pfDelSpec(i) {
  PF.specs = pfReadSpecs();
  PF.specs.splice(i, 1);
  pfSpecs();
}
function pfPreview() {
  const c = $("#pfCard");
  if (!c) return;
  const v = (k) => ($("#" + k) || {}).value || "";
  const main = PF.imgs[0];
  const tmp = {
    id: "PREVIEW",
    name: v("fName").trim() || "Your product name",
    cat: v("fCat") || "Home Decor",
    price: +v("fPrice") || 0,
    mrp: +v("fMrp") || 0,
    stock: 1,
    rating: 0,
    reviews: 0,
    img: "logo",
    photo: main ? main.src : IMG.logo,
    white: main ? main.white : false,
    specs: {},
  };
  c.innerHTML = pcard(tmp, 0).replace('class="pc rv"', 'class="pc"');
}
function saveProduct() {
  const v = (k) => ($("#" + k).value || "").trim(),
    E = (m) => {
      setErr("eForm", m);
      const e = $("#eForm");
      if (e) e.scrollIntoView({ block: "nearest" });
      return false;
    };
  const editing = PF.editId,
    cur = editing ? findP(editing) : null;
  const name = v("fName"),
    code = (editing || v("fId")).toUpperCase(),
    price = +v("fPrice"),
    mrp = +v("fMrp") || 0,
    stock = Math.max(0, Math.floor(+v("fStock") || 0));
  if (name.length < 3)
    return E("Give the product a name of at least three characters.");
  if (!/^[A-Z0-9-]{3,}$/.test(code))
    return E(
      "Product codes use letters, numbers and dashes, at least three characters.",
    );
  if (!editing && findP(code)) return E("That product code is already in use.");
  if (!(price > 0)) return E("Set a selling price above zero.");
  if (mrp && mrp < price) return E("MRP cannot be below the selling price.");
  if (!PF.imgs.length)
    return E(
      "Add at least one photo. Upload one, or pick from the shop's existing photos.",
    );
  const specs = {};
  pfReadSpecs().forEach(([k, val]) => {
    if (k && val) specs[k] = val;
  });
  const main = PF.imgs[0],
    lib = Object.entries(IMG).find(
      ([k, src]) => k !== "logo" && src === main.src,
    );
  const body = {
    name,
    cat: v("fCat"),
    price,
    mrp,
    stock,
    blurb: v("fBlurb") || "No description yet.",
    specs,
    gallery: PF.imgs.slice(1).map((g) => ({ src: g.src, white: g.white })),
  };
  if (lib) {
    body.img = lib[0];
    body.photo = null;
    body.white = false;
  } else {
    body.photo = main.src;
    body.white = main.white;
    body.img = (cur && cur.img) || "logo";
  }
  const next = editing
    ? S.products.map((p) => (p.id === editing ? { ...p, ...body } : p))
    : [
      { id: code, ...body, rating: 0, reviews: 0, active: true },
      ...S.products,
    ];
  if (!DB.write("products", next)) {
    E(
      "Browser storage is full. Remove a photo or another product, then try again.",
    );
    toast("Browser storage is full.", "err");
    return;
  }
  S.products = next;
  buildMega();
  closeModal();
  render();
  if (editing) {
    API.put("/admin/products/" + editing, { ...body, id: editing });
  } else {
    API.post("/admin/products", { id: code, ...body });
  }
  toast(
    editing ? "Product updated." : "Product added. It is live in the shop now.",
  );
}

/* =====================================================================
   CONTENT PAGES
   ===================================================================== */
const FAQS = [
  [
    "How do I place an order?",
    "Add items to your cart and press Place order. Sign in or create a free account, choose a delivery address, check your order and pay. You get an order ID straight away.",
  ],
  [
    "How can I pay?",
    "UPI, debit or credit card, net banking, or cash on delivery. Online payments go through a secure payment gateway. We never see or store your card details.",
  ],
  [
    "What does delivery cost?",
    "Nothing, on every order, to every pin code in India. No minimum basket. Valid till December 2026.",
  ],
  [
    "How long does delivery take?",
    "Three to six working days for stocked items, and Tamil Nadu is usually quickest. Personalised calendars take four to six working days to make, then ship. Your estimated delivery date is shown before you pay.",
  ],
  [
    "How do I track my order?",
    "Open Account, then Orders, and pick the order. You can watch it move from Order Confirmed to Packed, Shipped, Out for Delivery and Delivered.",
  ],
  [
    "Can I cancel or return something?",
    "You can cancel from the order page until it ships. Returns are accepted within seven days of delivery if the item is unused and in its original box. Personalised items can only be returned if they arrive damaged or wrongly printed.",
  ],
  [
    "How do I send photos for a custom calendar?",
    "Place the order first, then send your pictures to support with your order ID, on WhatsApp or by email. We send a layout proof before printing.",
  ],
  [
    "Do you take bulk or corporate orders?",
    "Yes. Ten units or more are priced lower. Message support with quantities and we will send a quote.",
  ],
];
function faqBlock(n) {
  return (
    `<div class="faq">` +
    FAQS.slice(0, n || FAQS.length)
      .map(
        ([q, a], i) =>
          `<details class="acc"${i === 0 ? " open" : ""}><summary><span>${esc(q)}</span>${ic("plus")}</summary><div class="acc-b"><div class="acc-i">${esc(a)}</div></div></details>`,
      )
      .join("") +
    `</div>`
  );
}
function vHelp() {
  return `<div class="wrap"><header class="page-head"><h1>Help</h1><p>The questions we answer most often. For anything else, contact support between 9:30 am and 5:30 pm, Monday to Saturday.</p></header>
    <div class="help-l"><div>${faqBlock()}</div>
    <aside class="card help-c"><h3>Reach a person</h3>
      <dl class="spec"><div><dt>WhatsApp</dt><dd><a class="lnk" href="https://wa.me/${WA}" target="_blank" rel="noopener">+91 63834 08380</a></dd></div>
        <div><dt>Orders</dt><dd>admin@lemurra.in</dd></div><div><dt>Support</dt><dd>support@lemurra.in</dd></div>
        <div><dt>Hours</dt><dd>Mon to Sat, 9:30 am to 5:30 pm IST</dd></div></dl>
      <a class="btn btn-glow btn-block" href="https://wa.me/${WA}" target="_blank" rel="noopener">${ic("chat")}Chat with support</a></aside></div></div>`;
}
function vServices() {
  const items = [
    [
      "Online storefronts",
      "A catalogue, cart and checkout like this one. Built static, so it loads fast and costs almost nothing to host.",
    ],
    [
      "Brand and packaging",
      "Wordmark, label design and print-ready artwork for small-batch products.",
    ],
    [
      "Product photography",
      "Plain-background shots and lifestyle sets, edited for marketplace listings.",
    ],
    [
      "Marketplace listings",
      "Getting your catalogue onto Amazon, Flipkart and Meesho with titles that actually get found.",
    ],
    [
      "Print and gifting",
      "Calendars, greeting cards and corporate gift sets, printed in small runs.",
    ],
    [
      "Maintenance",
      "Someone to call when the site breaks, stock needs updating, or a festival banner has to go up by Friday.",
    ],
  ];
  return `<div class="wrap"><header class="page-head page-head-row"><div><h1>Digital services</h1><p>Alongside the shop, we build and run small online stores for other makers in Tamil Nadu. Same approach: keep it simple, keep it fast, answer the phone.</p></div>
      <a class="btn btn-glow" href="https://wa.me/${WA}" target="_blank" rel="noopener">Ask for a quote</a></header>
    <div class="grid g3">${items.map(([t, d], i) => `<div class="svc rv" style="--i:${i}"><span class="svc-n">${ic(["grid", "sparkle", "camera", "tag", "calendar", "shield"][i])}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>
    <div class="band rv"><div><h2>Tell us what you sell</h2><p>Send a message with what you make and roughly what you need. We reply the same working day with a price and a rough timeline.</p></div>
      <a class="btn btn-glow btn-lg" href="https://wa.me/${WA}" target="_blank" rel="noopener">Start a conversation</a></div></div>`;
}
function vPolicies() {
  const P = [
    [
      "Returns",
      "Seven days from delivery, unused and in the original packaging. Open the order in Account, then Orders, or contact support with the order ID and a photograph. We arrange the pickup and refund to the original payment method within five to seven working days of the item reaching us. Personalised calendars and custom-printed goods can only be returned if they arrive damaged or printed wrongly.",
    ],
    [
      "Shipping",
      "Free across India on every order, no minimum, valid till December 2026. Stocked items leave within 24 hours of your order and usually arrive in three to six working days. Personalised items take four to six working days to make before they ship. Tracking is shown on your order page.",
    ],
    [
      "Cancellation",
      "You can cancel an order yourself from its page until it has shipped. Prepaid orders are refunded to the original payment method within five to seven working days. Once an order has shipped, use the returns process instead.",
    ],
    [
      "Privacy",
      "We collect your name, mobile number, email and delivery addresses, and we use them to deliver your order and to help you if something goes wrong. We do not sell them and we do not pass them to anyone except the courier. In this version of the website your account and orders are stored in your own browser. You can clear them any time from your browser settings.",
    ],
    [
      "Terms of use",
      "Prices include GST and can change without notice. Product photographs are of the actual item; colours may look slightly different on your screen. If something is out of stock after you have paid, we refund in full.",
    ],
    [
      "Payments",
      "Online payments are handled by the payment gateway, which processes UPI, card and net-banking details directly. We never see, handle or store card numbers. Cash on delivery is available on every order.",
    ],
  ];
  return `<div class="wrap"><header class="page-head"><h1>Policies</h1><p>Written in plain language. If anything here is unclear, ask us before you order.</p></header>
    <div class="faq narrow">${P.map(([t, b], i) => `<details class="acc"${i === 0 ? " open" : ""}><summary><span>${esc(t)}</span>${ic("plus")}</summary><div class="acc-b"><div class="acc-i">${esc(b)}</div></div></details>`).join("")}</div></div>`;
}

/* =====================================================================
   BLOG — posts live in the BLOGS array. Add a post by copying one object.
   body blocks:  ["h","Heading"]  ["p","Paragraph"]  ["ul",["item","item"]]
   shop: product ids shown under "Shop this story"
   ===================================================================== */
const BLOG_CATS = [
  "Gift guides",
  "Home decor",
  "Kids",
  "Care & tips",
  "Behind the scenes",
];
const BLOGS = [
  {
    slug: "how-to-plan-a-photo-calendar",
    title: "How to plan a photo calendar people keep on their desk",
    cat: "Gift guides",
    date: "2026-09-18",
    read: 5,
    cover: "calendar3",
    intro:
      "A personalised calendar is the gift that gets looked at every single morning. Here is how to pick twelve photographs that earn their month.",
    shop: ["LTCP501", "LTCP502", "LTCP503"],
    body: [
      ["h", "Start with the twelve, not the cover"],
      [
        "p",
        "Most people pick a cover photograph first and then scramble for eleven more. Do it the other way round. Scroll through your phone, pull out thirty photographs you like, and cut down to twelve. The cover will be obvious once you can see the whole set.",
      ],
      ["h", "Match the photo to the month"],
      [
        "p",
        "A monsoon walk suits a June or July page. A festival-lights picture belongs in October or November. You do not have to be strict, but a photograph that fits its month feels planned rather than random.",
      ],
      ["h", "Portrait or landscape?"],
      [
        "ul",
        [
          "Portrait suits single people, couples and children.",
          "Landscape suits group photographs, family trips and wide scenery.",
          "Mixed sets work, but every landscape photograph will be cropped in a portrait calendar, so check the faces.",
        ],
      ],
      ["h", "Send the sharpest files you have"],
      [
        "p",
        "A photograph that looks fine on a phone screen can turn soft on a printed page. Send the original file from your gallery, not a copy that came through a chat app, which shrinks the picture. Bright, evenly lit photographs print best.",
      ],
      ["h", "Keep the text short"],
      [
        "p",
        "A name, an occasion or a short line under the cover is enough. The month pages are for the photographs. If you are ordering for an office, keep the wording simple so it suits everyone who receives one.",
      ],
      [
        "p",
        "When you order, the cart asks for your photographs, the text to print and the month to start from, and we send a layout proof before printing.",
      ],
    ],
  },
  {
    slug: "crystal-lamps-housewarming-gift",
    title: "Why a crystal LED lamp is the easiest housewarming gift",
    cat: "Gift guides",
    date: "2026-09-04",
    read: 4,
    cover: "deer",
    intro:
      "It is small, it comes in a gift carton, it suits every room and it does not need a manual. That is most of what a housewarming gift has to do.",
    shop: ["LTHD008", "LTHD006"],
    body: [
      ["h", "It fits any home"],
      [
        "p",
        "New homes are full of boxes and half-decided corners. A small lamp with a warm glow goes on a bedside table, a study desk or a prayer shelf without needing space to be made for it.",
      ],
      ["h", "How it works"],
      [
        "p",
        "A design is laser-etched inside a block of optical crystal. The wooden base holds an LED that shines up through the crystal, so the figure seems to float in light. Power comes from a USB cable or batteries, depending on the model.",
      ],
      ["h", "Choosing between the two"],
      [
        "ul",
        [
          "The deer is calm and modern. It suits bedrooms and living rooms.",
          "Ganesha is a traditional choice for housewarmings, new offices and festivals.",
        ],
      ],
      ["h", "Looking after it"],
      [
        "p",
        "Wipe the crystal with a soft dry cloth. Keep it away from water and from direct afternoon sun, which can warm the base. The gift carton doubles as storage.",
      ],
    ],
  },
  {
    slug: "styling-a-wooden-sculpture",
    title: "Styling a hand-carved wooden sculpture at home",
    cat: "Home decor",
    date: "2026-08-21",
    read: 5,
    cover: "ballet",
    intro:
      "A single carved figure can anchor a whole shelf. The trick is to give it room, a plain backdrop and one companion at most.",
    shop: ["LTWS102", "LTWF103"],
    body: [
      ["h", "Give it space"],
      [
        "p",
        "Carved wood has lines and shadows that need air around them. Leave a hand's width on each side. A crowded shelf makes even a fine sculpture look like clutter.",
      ],
      ["h", "Choose a plain background"],
      [
        "p",
        "A painted wall, a plain curtain or a bare shelf lets the grain do the talking. Busy wallpaper competes with it.",
      ],
      ["h", "Pair it with one thing"],
      [
        "ul",
        [
          "A small plant in a clay pot.",
          "A brass or ceramic bowl.",
          "A crystal lamp, so the sculpture is lit in the evening.",
        ],
      ],
      ["h", "Where it looks best"],
      [
        "p",
        "Console tables in a hallway, the top of a bookshelf, or a low table in the living room. A taller figure suits a floor corner beside a sofa.",
      ],
      ["h", "Care"],
      [
        "p",
        "Dust it with a dry cloth. Avoid water and harsh cleaners. Once or twice a year, rub in a few drops of natural oil to keep the wood from drying out.",
      ],
    ],
  },
  {
    slug: "toys-that-last-past-the-first-week",
    title: "Choosing toys that last longer than the first week",
    cat: "Kids",
    date: "2026-08-07",
    read: 4,
    cover: "duck",
    intro:
      "Some toys are loved for an afternoon and forgotten. Others stay in the toy box for years. There are a few things to look for.",
    shop: ["LTKT201", "LTTH020", "LTTH010"],
    body: [
      ["h", "Check the age label first"],
      [
        "p",
        "The age on the box is about safety as well as fun. Small parts are a risk for children under three. Buy for the age of the child, not the age you hope they will act.",
      ],
      ["h", "Look for something they can do, not just watch"],
      [
        "p",
        "A toy that moves once and stops is finished in minutes. A pull-back car can be raced again and again. A toy that climbs its own stairs invites the child to set it up over and over.",
      ],
      ["h", "Weight is a good sign"],
      [
        "p",
        "Diecast metal cars feel heavier than plastic ones, and they take knocks better. Opening doors and rubber tyres give children more to explore.",
      ],
      [
        "ul",
        [
          "Round edges, no loose small parts for young children.",
          "Batteries that are easy for an adult to change.",
          "Material that is tested and safe for children.",
        ],
      ],
      ["h", "Rotate, do not pile up"],
      [
        "p",
        "Keep a few toys out and put the rest away. Swap them every couple of weeks. Old toys feel new again.",
      ],
    ],
  },
  {
    slug: "care-for-wooden-kitchen-boards",
    title: "How to look after a wooden chopping board for years",
    cat: "Care & tips",
    date: "2026-07-24",
    read: 3,
    cover: "chopping",
    intro:
      "A good board can outlast most things in your kitchen. It only asks for five minutes of care a month.",
    shop: ["LTCB122"],
    body: [
      ["h", "Wash by hand, quickly"],
      [
        "p",
        "Use warm water, a little mild soap and a brush. Do not soak the board and never put it in a dishwasher, because heat and water make wood warp and crack.",
      ],
      ["h", "Dry it on its edge"],
      [
        "p",
        "Stand the board upright so air reaches both faces. Drying it flat traps damp on one side and can bend it.",
      ],
      ["h", "Oil it once a month"],
      [
        "p",
        "When the board starts to look pale or dry, wipe on a thin layer of food-safe oil, leave it for a few hours, then wipe off the extra. Coconut or mineral oil both work.",
      ],
      ["h", "Freshen and de-stain"],
      [
        "ul",
        [
          "Rub half a lemon with coarse salt to lift smells and stains.",
          "Rinse and dry well afterwards, then oil.",
          "Use one side for onions and garlic if you like.",
        ],
      ],
    ],
  },
  {
    slug: "carrying-less-jute-and-sling-bags",
    title: "Carry less: choosing a sling bag for everyday",
    cat: "Care & tips",
    date: "2026-07-10",
    read: 4,
    cover: "jute",
    intro:
      "A sling bag should hold what you need and nothing else. Here is how to pick between natural jute and everyday nylon.",
    shop: ["LTJSB017", "LTCB016"],
    body: [
      ["h", "Decide what goes in first"],
      [
        "p",
        "Phone, wallet, keys, a bottle and maybe a tablet. If that is your day, you need a small bag, not a big one. A smaller bag stops you carrying things you never use.",
      ],
      ["h", "Jute"],
      [
        "p",
        "Natural jute is light and airy, and it looks better as it softens with use. Keep it dry. If it gets damp, let it dry in the shade, and spot clean with a soft cloth.",
      ],
      ["h", "Water-resistant nylon"],
      [
        "p",
        "Nylon is the better choice for commuting or the rainy season. A hidden back pocket keeps a phone or cards safe in crowds.",
      ],
      [
        "ul",
        [
          "Adjustable strap so you can wear it across the chest or on the hip.",
          "A zip or clasp that closes firmly.",
          "Padding on the strap if you carry a tablet.",
        ],
      ],
    ],
  },
  {
    slug: "a-day-at-lemurra-traders",
    title: "From Avadi to your door: how an order leaves our shop",
    cat: "Behind the scenes",
    date: "2026-06-26",
    read: 4,
    cover: "brandfull",
    intro:
      "We are a small trading house in Avadi, Tamil Nadu. Here is what happens between you pressing Place order and the parcel reaching you.",
    shop: [],
    body: [
      ["h", "We check every order by hand"],
      [
        "p",
        "When an order arrives, someone reads it, confirms the stock and checks the delivery address and pin code. If anything looks wrong, we call before we pack.",
      ],
      ["h", "Stocked items leave within a day"],
      [
        "p",
        "Toys, bags, lamps and boards are packed in a box with padding, and handed to the courier. Fragile items such as crystal get extra care.",
      ],
      ["h", "Personalised orders take a little longer"],
      [
        "p",
        "Calendars are made to order. We lay out your photographs, send a proof, print after you approve, and then ship. That is why they take four to six working days.",
      ],
      ["h", "Tracking"],
      [
        "p",
        "Open Account, then Orders, to follow your parcel from Order Confirmed through Packed, Shipped and Out for Delivery. If you need us, WhatsApp support answers between 9:30 am and 5:30 pm, Monday to Saturday.",
      ],
    ],
  },
];
/* posts edited in the admin panel are kept in this browser and replace the built-in list */
(function loadBlogs() {
  const saved = DB.read("blogs", null);
  if (Array.isArray(saved) && saved.length) BLOGS.splice(0, BLOGS.length, ...saved);
})();
const blogBySlug = (s) => BLOGS.find((b) => b.slug === s);
const blogSorted = () =>
  BLOGS.slice().sort((a, b) => b.date.localeCompare(a.date));
const blogDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const blogCover = (b, cls = "") =>
  `<img class="${cls}" src="${b.photo || IMG[b.cover] || IMG.logo}" alt="" loading="lazy" data-w="${b.photo ? 0 : WHITE.has(b.cover) ? 1 : 0}">`;
const blogState = { cat: "All", q: "" };

function blogCard(b, i) {
  return `<article class="bl-card rv" style="--i:${(i || 0) % 6}">
    <a class="bl-img" href="#/blog/${enc(b.slug)}" tabindex="-1" aria-hidden="true">${blogCover(b)}</a>
    <div class="bl-body">
      <div class="bl-meta"><button class="bl-cat" onclick="blogCat('${esc(b.cat).replace(/'/g, "\\'")}')">${esc(b.cat)}</button><span>${blogDate(b.date)}</span><span>${b.read} min read</span></div>
      <h3><a href="#/blog/${enc(b.slug)}">${esc(b.title)}</a></h3>
      <p>${esc(b.intro)}</p>
      <a class="bl-more" href="#/blog/${enc(b.slug)}">Read the article ${ic("chev", "bl-arr")}</a>
    </div></article>`;
}
function blogFiltered() {
  const q = blogState.q.trim().toLowerCase();
  return blogSorted().filter(
    (b) =>
      (blogState.cat === "All" || b.cat === blogState.cat) &&
      (!q || (b.title + " " + b.intro + " " + b.cat).toLowerCase().includes(q)),
  );
}
function blogMenu() {
  const cnt = (c) =>
    c === "All" ? BLOGS.length : BLOGS.filter((b) => b.cat === c).length;
  return `<nav class="bl-menu" aria-label="Blog categories"><div class="chips bl-chips">${[
    "All",
    ...BLOG_CATS,
  ]
    .map(
      (c) =>
        `<button class="chip${blogState.cat === c ? " on" : ""}" aria-pressed="${blogState.cat === c}" onclick="blogCat('${c.replace(/'/g, "\\'")}')">${esc(c)} <b>${cnt(c)}</b></button>`,
    )
    .join("")}</div>
    <label class="bl-search">${ic("search")}<input id="blQ" type="search" placeholder="Search the blog" value="${esc(blogState.q)}" aria-label="Search the blog" autocomplete="off"></label></nav>`;
}
function blogResults() {
  const L = blogFiltered();
  if (!L.length)
    return emptyBlock(
      "search",
      "No articles found",
      "Try another word, or pick a different category.",
      `<button class="btn btn-p" onclick="blogCat('All',true)">Show all articles</button>`,
    );
  const feat = blogState.cat === "All" && !blogState.q.trim();
  const first = feat ? L[0] : null,
    rest = feat ? L.slice(1) : L;
  return (
    (first
      ? `<article class="bl-feat rv"><a class="bl-feat-img" href="#/blog/${enc(first.slug)}" tabindex="-1" aria-hidden="true">${blogCover(first)}</a>
      <div class="bl-feat-b"><span class="bl-flag">Latest</span><div class="bl-meta"><span>${esc(first.cat)}</span><span>${blogDate(first.date)}</span><span>${first.read} min read</span></div>
      <h2><a href="#/blog/${enc(first.slug)}">${esc(first.title)}</a></h2><p>${esc(first.intro)}</p>
      <a class="btn btn-p" href="#/blog/${enc(first.slug)}">Read the article</a></div></article>`
      : "") +
    (rest.length
      ? `<div class="grid g3 bl-grid">${rest.map(blogCard).join("")}</div>`
      : "")
  );
}
function blogCat(c, clearQ) {
  blogState.cat = c;
  if (clearQ) blogState.q = "";
  render();
}
function vBlog() {
  return `<div class="wrap"><header class="page-head"><h1>The Lemurra blog</h1><p>Gift ideas, home styling, toy advice and care tips, written by the people who pack your orders.</p></header>
    ${blogMenu()}<div id="blRes">${blogResults()}</div></div>`;
}
function bindBlog() {
  const q = $("#blQ");
  if (!q) return;
  q.oninput = () => {
    blogState.q = q.value;
    const r = $("#blRes");
    r.innerHTML = blogResults();
    $$(".rv", r).forEach((n) => n.classList.add("in", "now"));
  };
}
function blogGo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const y =
    el.getBoundingClientRect().top +
    scrollY -
    (parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--head"),
    ) || 100) -
    16;
  window.scrollTo({ top: y, behavior: REDUCED.matches ? "auto" : "smooth" });
}
function vBlogPost(slug) {
  const b = blogBySlug(slug);
  if (!b) return notFoundView();
  const heads = b.body
    .filter((x) => x[0] === "h")
    .map((x, i) => ({ t: x[1], id: "bh" + i }));
  let hi = 0;
  const body = b.body
    .map((x) => {
      if (x[0] === "h") return `<h2 id="${heads[hi++].id}">${esc(x[1])}</h2>`;
      if (x[0] === "ul")
        return `<ul>${x[1].map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
      return `<p>${esc(x[1])}</p>`;
    })
    .join("");
  const all = blogSorted(),
    k = all.findIndex((z) => z.slug === slug),
    prev = all[k + 1],
    next = all[k - 1];
  const rel = all
    .filter((z) => z.slug !== slug && z.cat === b.cat)
    .concat(all.filter((z) => z.slug !== slug && z.cat !== b.cat))
    .slice(0, 3);
  const prods = (b.shop || [])
    .map(findP)
    .filter((p) => p && p.active !== false);
  return `<div class="wrap bl-wrap">
    <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Home</a><i>/</i><a href="#/blog">Blog</a><i>/</i><span>${esc(b.cat)}</span></nav>
    <header class="bl-head"><div class="bl-meta"><a class="bl-cat" href="#/blog" onclick="blogState.cat='${esc(b.cat).replace(/'/g, "\\'")}'">${esc(b.cat)}</a><span>${blogDate(b.date)}</span><span>${b.read} min read</span></div>
      <h1>${esc(b.title)}</h1><p class="bl-lede">${esc(b.intro)}</p></header>
    <div class="bl-hero">${blogCover(b)}</div>
    <div class="bl-layout">
      <article class="bl-article">${body}
        <div class="bl-share"><span>Enjoyed this? Send it to someone.</span><a class="btn btn-glow" href="https://wa.me/?text=${enc(b.title + " — https://www.lemurra.in/#/blog/" + b.slug)}" target="_blank" rel="noopener">${ic("chat")}Share on WhatsApp</a></div>
      </article>
      <aside class="bl-side">
        <div class="card bl-toc"><h3>In this article</h3><ol>${heads.map((h) => `<li><a href="#/blog/${enc(slug)}" onclick="event.preventDefault();blogGo('${h.id}')">${esc(h.t)}</a></li>`).join("")}</ol></div>
        ${prods.length ? `<div class="card bl-shop"><h3>Shop this story</h3>${prods.map((p) => `<a class="bl-prod" href="#/p/${p.id}"><span class="bl-pi">${pimg(p, "", 'loading="lazy"')}</span><span><b>${esc(p.name)}</b><em class="num">${inr(p.price)}</em></span></a>`).join("")}</div>` : ""}
      </aside>
    </div>
    <div class="bl-pn">${prev ? `<a href="#/blog/${enc(prev.slug)}"><small>Earlier</small><b>${esc(prev.title)}</b></a>` : "<span></span>"}${next ? `<a class="r" href="#/blog/${enc(next.slug)}"><small>Newer</small><b>${esc(next.title)}</b></a>` : "<span></span>"}</div>
    <section class="bl-rel"><div class="sh"><div><h2>More from the blog</h2></div><a class="btn btn-o" href="#/blog" onclick="blogState.cat='All'">All articles</a></div>
      <div class="grid g3 bl-grid">${rel.map(blogCard).join("")}</div></section></div>`;
}

/* ---------- blog editing (admin) ---------- */
let BF = null;
const blogToText = (body) =>
  (body || [])
    .map((x) =>
      x[0] === "h"
        ? "## " + x[1]
        : x[0] === "ul"
          ? x[1].map((t) => "- " + t).join("\n")
          : x[1],
    )
    .join("\n\n");
function blogFromText(t) {
  return t
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      if (/^##\s+/.test(b)) return ["h", b.replace(/^##\s+/, "").trim()];
      const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.every((l) => /^[-•*]\s+/.test(l)))
        return ["ul", lines.map((l) => l.replace(/^[-•*]\s+/, ""))];
      return ["p", lines.join(" ")];
    });
}
const slugify = (t) =>
  t
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
function editBlog(slug) {
  const b = slug ? blogBySlug(slug) : null;
  BF = { editSlug: slug || null, photo: b ? b.photo || null : null };
  const cur = b || {
    title: "",
    cat: BLOG_CATS[0],
    date: new Date().toISOString().slice(0, 10),
    read: 4,
    cover: "calendar",
    intro: "",
    shop: [],
    body: [],
  };
  modal(
    slug ? "Edit blog post" : "Add a blog post",
    `<div class="pf-form">
      <div class="field"><label for="bTitle">Title</label><input id="bTitle" value="${esc(cur.title)}" placeholder="Post title"></div>
      <div class="grid g2">
        <div class="field"><label for="bSlug">Web address (slug)</label><input id="bSlug" value="${esc(slug || "")}" ${slug ? "disabled" : ""} placeholder="made-from-the-title"></div>
        <div class="field"><label for="bCat">Category</label><select id="bCat">${BLOG_CATS.map((c) => `<option${c === cur.cat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="field"><label for="bDate">Date</label><input id="bDate" type="date" value="${esc(cur.date)}"></div>
        <div class="field"><label for="bRead">Minutes to read</label><input id="bRead" type="number" min="1" value="${cur.read}"></div>
      </div>
      <div class="field"><label for="bIntro">Short intro</label><textarea id="bIntro" rows="2" placeholder="One or two sentences shown on the blog list">${esc(cur.intro)}</textarea></div>
      <div class="grid g2">
        <div class="field"><label for="bCover">Cover photo</label><select id="bCover">${Object.keys(IMG).filter((k) => k !== "logo").map((k) => `<option value="${k}"${k === cur.cover ? " selected" : ""}>${k}</option>`).join("")}</select></div>
        <div class="field"><label for="bUp">Or upload your own</label><input id="bUp" type="file" accept="image/*" onchange="blogPhoto(this.files[0])"><small id="bPhotoNote">${BF.photo ? "An uploaded photo is in use. It replaces the choice on the left." : ""}</small></div>
      </div>
      <div class="field"><label for="bBody">Article text</label><textarea id="bBody" rows="12" placeholder="Write paragraphs separated by a blank line.">${esc(blogToText(cur.body))}</textarea>
        <small>Separate paragraphs with a blank line. Start a line with <b>##</b> for a heading, or start every line of a block with <b>-</b> for a bullet list.</small></div>
      <div class="field"><label>Products shown in “Shop this story”</label>
        <div class="bf-prods">${S.products.map((p) => `<label class="bf-p"><input type="checkbox" value="${esc(p.id)}"${(cur.shop || []).includes(p.id) ? " checked" : ""}> ${esc(p.name)}</label>`).join("")}</div></div>
      <div class="err" id="eBlog"></div>
    </div>`,
    `<button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-glow" onclick="saveBlog()">${slug ? "Save changes" : "Publish post"}</button>`,
    { wide: true },
  );
  if (!slug) {
    const t = $("#bTitle"),
      sl = $("#bSlug");
    t.oninput = () => {
      if (!sl.dataset.touched) sl.value = slugify(t.value);
    };
    sl.oninput = () => (sl.dataset.touched = "1");
  }
}
function blogPhoto(file) {
  if (!file) return;
  fileToPhoto(file, 1200, 0.8)
    .then((r) => {
      BF.photo = r.src;
      const n = $("#bPhotoNote");
      if (n) n.textContent = "New photo ready. It will be used as the cover.";
    })
    .catch((e) => setErr("eBlog", e.message));
}
function saveBlog() {
  const v = (k) => ($("#" + k).value || "").trim(),
    E = (m) => {
      setErr("eBlog", m);
      return false;
    };
  const editing = BF.editSlug,
    title = v("bTitle"),
    slug = editing || slugify(v("bSlug") || title),
    body = blogFromText($("#bBody").value || ""),
    intro = v("bIntro"),
    date = v("bDate"),
    read = Math.max(1, Math.round(+v("bRead") || 1));
  if (title.length < 3) return E("Give the post a title of at least three characters.");
  if (!slug) return E("The web address cannot be empty.");
  if (!editing && blogBySlug(slug)) return E("Another post already uses that web address.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return E("Pick a date for the post.");
  if (intro.length < 10) return E("Add a short intro of a sentence or two.");
  if (!body.length) return E("Write the article text.");
  const rec = {
    slug,
    title,
    cat: v("bCat"),
    date,
    read,
    cover: v("bCover"),
    intro,
    shop: $$(".bf-p input:checked").map((c) => c.value),
    body,
  };
  if (BF.photo) rec.photo = BF.photo;
  const next = editing
    ? BLOGS.map((b) => (b.slug === editing ? rec : b))
    : [rec, ...BLOGS];
  if (!DB.write("blogs", next))
    return E("Browser storage is full. Use a smaller cover photo or remove a post.");
  BLOGS.splice(0, BLOGS.length, ...next);
  closeModal();
  render();
  toast(editing ? "Post updated." : "Post published.");
}
function delBlog(slug) {
  const b = blogBySlug(slug);
  if (!b) return;
  modal(
    "Delete this post?",
    `<p class="m-note">“${esc(b.title)}” will be removed from the blog.</p>`,
    `<button class="btn btn-o" onclick="closeModal()">Keep it</button><button class="btn btn-d" onclick="confirmDelBlog('${esc(slug)}')">Delete post</button>`,
  );
}
function confirmDelBlog(slug) {
  const next = BLOGS.filter((b) => b.slug !== slug);
  DB.write("blogs", next);
  BLOGS.splice(0, BLOGS.length, ...next);
  closeModal();
  render();
  toast("Post deleted.");
}

/* ---------- footer ---------- */
function paintFoot() {
  $("#foot").innerHTML = `
  <div class="wrap foot-g">
    <div class="foot-brand">
      <a class="brand brand-foot" href="#/">${brandMark()}<span class="brand-name">Lemurra<small>Traders</small></span></a>
      <p>A small trading house in Avadi, Tamil Nadu. Handmade decor, practical household goods and personalised gifts, delivered anywhere in India.</p>
      <div class="foot-soc">
        <a href="https://www.instagram.com/lemurra.in/" target="_blank" rel="noopener" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg></a>
        <a href="https://www.youtube.com/@lemurratraders" target="_blank" rel="noopener" aria-label="YouTube"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none"/></svg></a>
      </div>
    </div>
    <div><h4>Shop</h4>${CATS.map((c) => `<a href="#/shop/${enc(c.id)}">${esc(c.id)}</a>`).join("")}<a href="#/shop">Everything</a></div>
    <div><h4>Your account</h4><a href="#/account">Sign in or register</a><a href="#/account" onclick="S.ptab='orders'">My orders</a><a href="#/wishlist">Wishlist</a><a href="#/cart">Cart</a></div>
    <div><h4>Company</h4><a href="#/services">Digital services</a><a href="#/blog">Blog</a><a href="#/help">Help &amp; FAQ</a><a href="#/policies">Returns &amp; shipping</a><a href="#/policies">Privacy</a></div>
    <div><h4>Support</h4><a href="https://wa.me/${WA}" target="_blank" rel="noopener">WhatsApp +91 63834 08380</a><p>admin@lemurra.in</p><p>support@lemurra.in</p><p class="dim">Mon to Sat, 9:30 am to 5:30 pm IST</p></div>
  </div>
  <div class="wrap foot-b"><span>© ${new Date().getFullYear()} Lemurra Traders. All rights reserved.</span><span>Secure payments · Free delivery across India · 7-day returns</span></div>`;
}

/* =====================================================================
   ROUTER, REVEALS, TOP BAR, BOOT
   ===================================================================== */
const notFoundView = () =>
  `<div class="wrap">${emptyBlock("search", "That page does not exist", "The link may be old, or mistyped.", `<a class="btn btn-p" href="#/">Go to the home page</a>`)}</div>`;
function bindAcct() {
  bindAuth();
  if (S.admin) {
    bindAdmin();
    placeTab("#atabs");
  } else placeTab("#ptabs");
}
const dec = decodeURIComponent;
const ROUTES = [
  [
    /^$/,
    () => [
      vHome(),
      bindHome,
      "Lemurra Traders — Gifts, decor and everyday goods from Tamil Nadu",
    ],
  ],
  [
    /^shop\/(.+)$/,
    (m) => [vShop(dec(m[1])), bindShop, dec(m[1]) + " — Lemurra Traders"],
  ],
  [
    /^shop$/,
    () => [vShop(null), bindShop, "All products — Lemurra Traders"],
  ],
  [
    /^p\/(.+)$/,
    (m) => [
      vProduct(dec(m[1])),
      bindProduct,
      ((findP(dec(m[1])) || {}).name || "Product") + " — Lemurra Traders",
    ],
  ],
  [/^cart$/, () => [vCart(), null, "My cart — Lemurra Traders"]],
  [
    /^checkout$/,
    () => [vCheckout(), bindAuth, "Checkout — Lemurra Traders"],
  ],
  [
    /^order-placed\/(.+)$/,
    (m) => [vOrderPlaced(dec(m[1])), null, "Order placed — Lemurra Traders"],
  ],
  [
    /^order\/(.+)$/,
    (m) => [vOrder(dec(m[1])), null, "Order details — Lemurra Traders"],
  ],
  [/^wishlist$/, () => [vWish(), null, "Wishlist — Lemurra Traders"]],
  [
    /^(account|admin)$/,
    () => [
      vAccount(),
      bindAcct,
      (S.admin ? "Admin panel" : S.user ? "My account" : "Sign in") +
      " — Lemurra Traders",
    ],
  ],
  [
    /^services$/,
    () => [vServices(), null, "Digital services — Lemurra Traders"],
  ],
  [
    /^blog\/(.+)$/,
    (m) => [
      vBlogPost(dec(m[1])),
      null,
      ((blogBySlug(dec(m[1])) || {}).title || "Blog") + " — Lemurra Traders",
    ],
  ],
  [/^blog$/, () => [vBlog(), bindBlog, "Blog — Lemurra Traders"]],
  [/^help$/, () => [vHelp(), null, "Help — Lemurra Traders"]],
  [/^policies$/, () => [vPolicies(), null, "Policies — Lemurra Traders"]],
];
let lastRoute = null,
  cleanups = [];
function render() {
  try {
    const rPath = currentRoute();
    const same = rPath === lastRoute;
    cleanups.forEach((f) => {
      try {
        f();
      } catch (e) { }
    });
    cleanups = [];
    let html = "",
      after = null,
      title = "Lemurra Traders";
    for (const [re, fn] of ROUTES) {
      const m = rPath.match(re);
      if (m) {
        const r = fn(m);
        html = r[0];
        after = r[1];
        title = r[2];
        break;
      }
    }
    if (!html) {
      html = notFoundView();
    }
    document.title = title;
    const isHome = rPath === "";
    document.body.classList.toggle(
      "hero-dark",
      isHome && !!$("#main") && html.indexOf('id="hero"') > -1,
    );
    const v = $("#main");
    if (v) {
      v.innerHTML = html;
      splitHeads(v);
      v.classList.remove("route-in");
      if (!same && !REDUCED.matches) {
        void v.offsetWidth;
        v.classList.add("route-in");
      }
    }
    paintFoot();
    paintNav();
    if (v) initAcc(v);
    if (after) {
      try {
        after();
      } catch (ae) {
        console.warn("Route after() error:", ae);
      }
    }
    if (isHome) {
      try {
        const c = initPulli();
        if (c) cleanups.push(c);
      } catch (pe) {
        console.warn("Pulli canvas init error:", pe);
      }
    }
    try {
      reveal(same);
    } catch (re) { }
    if (!same) {
      closeMega(0);
      closeSearch();
      closeMenu();
      window.scrollTo({ top: 0, behavior: "instant" });
      lastRoute = rPath;
    }
    onScroll();
  } catch (err) {
    console.error("render() fatal error:", err);
  }
}
window.addEventListener("popstate", render);
window.addEventListener("hashchange", render);

/* ---------- headlines: each word rises out of a mask ---------- */
function splitHeads(root) {
  $$(".hero-h,.split", root).forEach((h) => {
    if (h.dataset.sp) return;
    h.dataset.sp = "1";
    const t = h.textContent.trim();
    h.setAttribute("aria-label", t);
    h.innerHTML = t
      .split(/\s+/)
      .map(
        (w, i) =>
          `<span class="w" aria-hidden="true"><span style="--i:${i}">${esc(w)}</span></span>`,
      )
      .join(" ");
  });
}

/* ---------- reveal on scroll ---------- */
let io;
function countUp(n) {
  const to = +n.dataset.count,
    pre = n.dataset.pre || "",
    dur = 1100,
    t0 = performance.now();
  if (REDUCED.matches || !isFinite(to)) {
    return;
  }
  (function step(t) {
    const k = Math.min(1, (t - t0) / dur),
      e = 1 - Math.pow(1 - k, 3),
      val = Math.round(to * e);
    n.textContent = pre
      ? pre + val.toLocaleString("en-IN")
      : val.toLocaleString("en-IN");
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function reveal(instant) {
  if (io) io.disconnect();
  const nodes = $$(".rv,.split,.steps,.calx-view,[data-count]");
  if (instant || REDUCED.matches || !("IntersectionObserver" in window)) {
    nodes.forEach((n) => n.classList.add("in", "now"));
    return;
  }
  io = new IntersectionObserver(
    (es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        showIn(e.target);
        io.unobserve(e.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  nodes.forEach((n) => io.observe(n));
}
function showIn(n) {
  if (n.classList.contains("in")) return;
  n.classList.add("in");
  if (n.dataset.count != null) countUp(n);
}
/* safety net: fast scrolling (End key, anchor jumps) can outrun the observer, so anything at or above the fold line is revealed here */
function sweepReveal() {
  const line = innerHeight * 0.92;
  $$(
    ".rv:not(.in),.split:not(.in),.steps:not(.in),.calx-view:not(.in),[data-count]:not(.in)",
  ).forEach((n) => {
    if (n.getBoundingClientRect().top < line) showIn(n);
  });
}

/* ---------- animated accordions ---------- */
function initAcc(root) {
  $$("details.acc", root).forEach((d) => {
    const s = d.querySelector("summary"),
      b = d.querySelector(".acc-b");
    s.addEventListener("click", (e) => {
      e.preventDefault();
      if (REDUCED.matches) {
        d.open = !d.open;
        return;
      }
      const ease = "cubic-bezier(.22,.9,.28,1)";
      if (d.open) {
        const h = b.offsetHeight;
        b.style.overflow = "hidden";
        d.classList.remove("open");
        b.animate(
          [
            { height: h + "px", opacity: 1 },
            { height: "0px", opacity: 0 },
          ],
          { duration: 260, easing: ease },
        ).onfinish = () => {
          d.open = false;
          b.style.overflow = "";
        };
      } else {
        d.open = true;
        d.classList.add("open");
        const h = b.offsetHeight;
        b.style.overflow = "hidden";
        b.animate(
          [
            { height: "0px", opacity: 0 },
            { height: h + "px", opacity: 1 },
          ],
          { duration: 320, easing: ease },
        ).onfinish = () => {
          b.style.overflow = "";
        };
      }
    });
    if (d.open) d.classList.add("open");
  });
}

/* ---------- announcement bar: rotates the shop's live offers ---------- */
function initTopbar() {
  const box = $("#tbMsgs");
  if (!box) return;
  const c = (Array.isArray(S.coupons) ? S.coupons : []).find((x) => x && x.active !== false);
  const msgs = [
    `Free delivery on every order across India. Valid till December 2026.`,
    `Shop for ${inr(FREE_GIFT.min)} or more and get a free ${FREE_GIFT.name} worth ${inr(FREE_GIFT.worth)}.`,
    c
      ? `Use code ${c.code}: ${c.note}.`
      : `Cash on delivery available on every order.`,
  ];
  box.innerHTML = msgs
    .map((m, i) => `<span class="tb-m${i ? "" : " on"}">${esc(m)}</span>`)
    .join("");
  if (REDUCED.matches) return;
  let i = 0;
  const els = $$(".tb-m", box);
  if (!els || els.length <= 1) return;
  setInterval(() => {
    if (!els[i]) return;
    els[i].classList.remove("on");
    i = (i + 1) % els.length;
    if (els[i]) els[i].classList.add("on");
  }, 4200);
}

/* ---------- boot ---------- */
function boot() {
  try {
    setTheme(
      DB.read(
        "theme",
        matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light",
      ),
    );
    const ring = $("#bootRing");
    if (ring) ring.setAttribute("d", ringPath(70, 18, 0.04));
    const dots = $("#bootDots");
    if (dots) dots.innerHTML = ringDots(58, 24, 1.6);
    $$("img[data-brand]").forEach((i) => (i.src = IMG.brand));
    initNav();
    initTopbar();
    badges();
    render();
    const tt = $("#totop");
    if (tt)
      tt.onclick = () =>
        window.scrollTo({
          top: 0,
          behavior: REDUCED.matches ? "auto" : "smooth",
        });
  } catch (e) {
    console.error("boot initialisation notice:", e);
  }

  let booted = false;
  const t0 = performance.now();
  const done = () => {
    if (booted) return;
    booted = true;
    const wait = Math.max(0, 800 - (performance.now() - t0));
    setTimeout(() => {
      const b = $("#boot");
      document.body.classList.add("ready");
      if (b) {
        b.classList.add("done");
        setTimeout(() => {
          if (b && b.parentNode) b.remove();
        }, 900);
      }
      if (typeof window.dismissBootLoader === "function") {
        window.dismissBootLoader();
      }
      placeLamp($("#navlinks .nl.on"));
    }, wait);
  };
  if (document.readyState === "complete") done();
  else addEventListener("load", done);
  setTimeout(done, 1200); /* never trap the visitor behind the loader */
}
boot();
syncWithBackend();
