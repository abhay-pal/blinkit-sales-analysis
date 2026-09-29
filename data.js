/* =============================================================================
   data.js  —  SAMPLE DATA GENERATION
   -----------------------------------------------------------------------------
   This file generates ~10,000 realistic Blinkit-style grocery sales
   transactions entirely in the browser. No backend / API / database needed.

   The main export is:  window.generateBlinkitData()
   which returns an array of transaction objects. Each object is one order line.
   ============================================================================= */

(function () {
  "use strict";

  /* -------------------------------------------------------------------------
     1) A tiny SEEDED random number generator.
        Using a seed means the "random" data is the SAME every time you reload
        the page, so KPIs and charts stay consistent. (Mulberry32 algorithm.)
     ------------------------------------------------------------------------- */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20240921); // fixed seed

  // Helper: random float in [min, max)
  function rFloat(min, max) {
    return min + rand() * (max - min);
  }
  // Helper: random integer in [min, max] inclusive
  function rInt(min, max) {
    return Math.floor(rFloat(min, max + 1));
  }
  // Helper: pick an item using weighted probabilities
  function weightedPick(items) {
    // items = [{ value, weight }, ...]
    const total = items.reduce((s, it) => s + it.weight, 0);
    let r = rand() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it.value;
    }
    return items[items.length - 1].value;
  }
  // Helper: normally distributed value (Box–Muller), clamped to [min, max]
  function rNormal(mean, sd, min, max) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    let val = mean + n * sd;
    if (val < min) val = min;
    if (val > max) val = max;
    return val;
  }

  /* -------------------------------------------------------------------------
     2) Master lists (cities, categories, products, etc.)
        Cities have a "weight" so bigger metros get more orders — realistic.
     ------------------------------------------------------------------------- */
  const CITIES = [
    { value: "Bangalore", weight: 20 },
    { value: "Mumbai", weight: 18 },
    { value: "Delhi", weight: 16 },
    { value: "Hyderabad", weight: 12 },
    { value: "Pune", weight: 9 },
    { value: "Gurgaon", weight: 8 },
    { value: "Chennai", weight: 7 },
    { value: "Noida", weight: 6 },
    { value: "Kolkata", weight: 4 },
  ];

  // Each category has a demand weight (some categories sell more than others)
  // and a realistic price range (min/max unit price in ₹).
  const CATEGORIES = {
    "Fruits & Vegetables": { weight: 16, price: [20, 220], products: [
      "Bananas (1 dozen)", "Tomatoes (1 kg)", "Onions (1 kg)", "Potatoes (1 kg)",
      "Apples (1 kg)", "Baby Spinach (250 g)", "Green Capsicum (500 g)", "Cucumber (500 g)",
    ]},
    "Dairy": { weight: 15, price: [25, 320], products: [
      "Amul Gold Milk (1 L)", "Amul Butter (500 g)", "Nestle Curd (400 g)", "Amul Cheese Slices",
      "Mother Dairy Paneer (200 g)", "Amul Masti Buttermilk", "Ghee (500 ml)", "Fresh Cream (250 ml)",
    ]},
    "Snacks": { weight: 13, price: [10, 150], products: [
      "Lay's Classic Salted", "Kurkure Masala Munch", "Haldiram's Bhujia (200 g)", "Bingo Mad Angles",
      "Dark Fantasy Choco Fills", "Parle-G Biscuits", "Too Yumm Multigrain Chips", "Peanuts (500 g)",
    ]},
    "Beverages": { weight: 12, price: [20, 260], products: [
      "Coca-Cola (750 ml)", "Real Fruit Juice (1 L)", "Red Bull (250 ml)", "Tata Tea Gold (500 g)",
      "Nescafe Classic (100 g)", "Bisleri Water (2 L)", "Sprite (750 ml)", "Bru Instant Coffee",
    ]},
    "Bakery": { weight: 8, price: [25, 180], products: [
      "Britannia Brown Bread", "Whole Wheat Bread", "English Muffins (6 pc)", "Chocolate Croissant",
      "Fruit Cake (250 g)", "Pav (6 pc)", "Rusk (300 g)", "Cookies Assorted",
    ]},
    "Personal Care": { weight: 9, price: [40, 450], products: [
      "Colgate Toothpaste (200 g)", "Dove Shampoo (340 ml)", "Dettol Handwash", "Nivea Body Lotion",
      "Gillette Razor", "Head & Shoulders (180 ml)", "Lifebuoy Soap (4 pc)", "Vaseline Lip Care",
    ]},
    "Household": { weight: 10, price: [30, 520], products: [
      "Surf Excel (1 kg)", "Vim Dishwash Gel", "Harpic Toilet Cleaner", "Lizol Floor Cleaner",
      "Good Knight Refill", "Scotch-Brite Sponge", "Garbage Bags (30 pc)", "Colin Glass Cleaner",
    ]},
    "Frozen Food": { weight: 7, price: [60, 380], products: [
      "McCain French Fries", "Frozen Green Peas (500 g)", "Chicken Nuggets", "Veg Spring Rolls",
      "Amul Ice Cream (700 ml)", "Frozen Paratha (5 pc)", "Fish Fingers", "Sweet Corn (500 g)",
    ]},
    "Staples": { weight: 10, price: [45, 900], products: [
      "Aashirvaad Atta (5 kg)", "India Gate Basmati (1 kg)", "Fortune Oil (1 L)", "Tata Salt (1 kg)",
      "Toor Dal (1 kg)", "Sugar (1 kg)", "Besan (1 kg)", "Poha (1 kg)",
    ]},
  };
  const CATEGORY_LIST = Object.keys(CATEGORIES);

  const ITEM_TYPES = ["Grocery", "FMCG", "Fresh", "Packaged"];
  const PAYMENTS = [
    { value: "UPI", weight: 52 },
    { value: "Card", weight: 20 },
    { value: "COD", weight: 15 },
    { value: "Wallet", weight: 13 },
  ];
  const CUSTOMER_TYPES = [
    { value: "Returning", weight: 62 },
    { value: "New", weight: 38 },
  ];
  const ORDER_STATUS = [
    { value: "Delivered", weight: 92 },
    { value: "Cancelled", weight: 5 },
    { value: "Returned", weight: 3 },
  ];

  /* -------------------------------------------------------------------------
     3) Build a stable set of store / outlet IDs per city (e.g. BLK-101).
     ------------------------------------------------------------------------- */
  const STORES_BY_CITY = {};
  let storeCounter = 100;
  CITIES.forEach((c) => {
    const n = rInt(2, 4); // each city has 2–4 outlets
    STORES_BY_CITY[c.value] = [];
    for (let i = 0; i < n; i++) {
      storeCounter += 1;
      STORES_BY_CITY[c.value].push("BLK-" + storeCounter);
    }
  });

  /* -------------------------------------------------------------------------
     4) The main generator.
     ------------------------------------------------------------------------- */
  function generateBlinkitData(TOTAL = 10000) {
    const rows = [];

    // Date window: last 12 months from "today".
    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    const spanMs = today.getTime() - start.getTime();

    // A per-month growth factor so recent months trend slightly higher (realistic).
    // We build a light weighting so newer dates are a bit more likely.
    for (let i = 0; i < TOTAL; i++) {
      // Pick a date. Bias slightly toward recent months using a squared random.
      const bias = Math.pow(rand(), 0.8); // >? pushes toward 1 (recent)
      const orderDate = new Date(start.getTime() + bias * spanMs);

      const city = weightedPick(CITIES);
      const store = STORES_BY_CITY[city][rInt(0, STORES_BY_CITY[city].length - 1)];

      // Choose category by weight
      const category = weightedPick(
        CATEGORY_LIST.map((c) => ({ value: c, weight: CATEGORIES[c].weight }))
      );
      const catInfo = CATEGORIES[category];
      const product = catInfo.products[rInt(0, catInfo.products.length - 1)];
      const itemType = ITEM_TYPES[rInt(0, ITEM_TYPES.length - 1)];

      // Quantity: mostly 1–3, occasionally higher
      const quantity = weightedPick([
        { value: 1, weight: 45 },
        { value: 2, weight: 28 },
        { value: 3, weight: 15 },
        { value: 4, weight: 7 },
        { value: 5, weight: 3 },
        { value: rInt(6, 10), weight: 2 },
      ]);

      // Unit price within the category's realistic range, rounded to nearest ₹
      const unitPrice = Math.round(rFloat(catInfo.price[0], catInfo.price[1]));

      // Discount %: many orders 0, some with 5–40%
      const discount = weightedPick([
        { value: 0, weight: 40 },
        { value: 5, weight: 15 },
        { value: 10, weight: 18 },
        { value: 15, weight: 12 },
        { value: 20, weight: 8 },
        { value: 30, weight: 5 },
        { value: 40, weight: 2 },
      ]);

      const grossSales = unitPrice * quantity;
      const netSales = Math.round(grossSales * (1 - discount / 100));

      // Order status (small % cancelled / returned)
      const status = weightedPick(ORDER_STATUS);

      // Customer rating: mostly 3–5. Cancelled orders often unrated → we still
      // give a rating but skew cancelled/returned lower.
      let rating;
      if (status === "Delivered") {
        rating = Math.round(rNormal(4.3, 0.7, 1, 5) * 10) / 10;
      } else {
        rating = Math.round(rNormal(3.1, 1.0, 1, 5) * 10) / 10;
      }

      // Delivery time in minutes: normal ~ 8–35, delivered only meaningful
      const deliveryTime = Math.round(rNormal(15, 6, 6, 55));

      rows.push({
        orderId: "ORD" + String(1000000 + i),
        orderDate: orderDate,                        // JS Date object
        dateStr: orderDate.toISOString().slice(0, 10), // YYYY-MM-DD
        city: city,
        store: store,
        category: category,
        product: product,
        itemType: itemType,
        quantity: quantity,
        unitPrice: unitPrice,
        discount: discount,
        grossSales: grossSales,
        netSales: netSales,
        rating: rating,
        deliveryTime: deliveryTime,
        status: status,
        payment: weightedPick(PAYMENTS),
        customerType: weightedPick(CUSTOMER_TYPES),
      });
    }

    // Sort by date ascending (nicer for trend charts / raw table)
    rows.sort((a, b) => a.orderDate - b.orderDate);
    return rows;
  }

  // Expose to the global scope so script.js can use it.
  window.generateBlinkitData = generateBlinkitData;
  window.BLINKIT_META = {
    cities: CITIES.map((c) => c.value).sort(),
    categories: CATEGORY_LIST.slice().sort(),
    storesByCity: STORES_BY_CITY,
    allStores: Object.values(STORES_BY_CITY).flat().sort(),
    statuses: ["Delivered", "Cancelled", "Returned"],
    customerTypes: ["New", "Returning"],
  };
})();
