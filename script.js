/* =============================================================================
   script.js  —  Blinkit Multi-Page Analytics Dashboard
   -----------------------------------------------------------------------------
   HOW IT WORKS (read this first):
     1. data.js generates ONE dataset of ~10,000 transactions (the source of truth).
     2. The global filter bar produces FILTERED (a subset of that one dataset).
        -> Every page, KPI, chart, table and insight is computed from FILTERED,
           so a filter like City = Gurgaon affects ALL five pages.
     3. Navigation is a Single Page App: clicking a sidebar tab hides/shows a
        <section class="page"> and re-renders only that page (no browser reload).
     4. To avoid Chart.js sizing bugs on hidden canvases, we destroy all charts
        and rebuild only the charts of the page currently on screen.
   ============================================================================= */

/* =============================================================================
   SECTION 0 — GLOBAL STATE
   ============================================================================= */
const ALL_DATA = window.generateBlinkitData(10000);   // the single dataset
const META = window.BLINKIT_META;
let FILTERED = ALL_DATA.slice();                       // current filtered subset
let currentPage = "home";
const charts = {};                                    // live Chart.js instances

const ON_TIME_MAX = 20; // an order is "on-time" if delivered within 20 minutes

// Blinkit palette
const CO = {
  green: "#0c831f", greenL: "#1aa532", yellow: "#f8cb46", yellowD: "#e6b93a",
  blue: "#4f83ff", orange: "#ff9f40", purple: "#8e63ff", red: "#e0464b", grey: "#c3cad6",
  palette: ["#0c831f","#f8cb46","#4f83ff","#ff9f40","#8e63ff","#1aa532","#e0464b","#00b8a9","#ff6b9d","#6c757d"],
};

// Approx map coordinates [lon, lat] for the bubble "map".
const CITY_COORDS = {
  Delhi:[77.21,28.61], Gurgaon:[77.03,28.46], Noida:[77.39,28.53],
  Mumbai:[72.87,19.07], Bangalore:[77.59,12.97], Hyderabad:[78.48,17.38],
  Pune:[73.85,18.52], Chennai:[80.27,13.08], Kolkata:[88.36,22.57],
};

/* =============================================================================
   SECTION 1 — SMALL FORMAT HELPERS
   ============================================================================= */
function formatINR(n) {                 // short: ₹12.5L / ₹1.2Cr / ₹8.5K
  if (n == null || isNaN(n)) return "₹0";
  const a = Math.abs(n);
  if (a >= 1e7) return "₹" + (n/1e7).toFixed(2) + "Cr";
  if (a >= 1e5) return "₹" + (n/1e5).toFixed(2) + "L";
  if (a >= 1e3) return "₹" + (n/1e3).toFixed(1) + "K";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function formatINRFull(n){ return "₹" + Math.round(n||0).toLocaleString("en-IN"); }
function formatInt(n){ return Math.round(n||0).toLocaleString("en-IN"); }

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthLabel(d){ return MONTHS[d.getMonth()] + " " + d.getFullYear(); }
function monthKey(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0"); }

/* =============================================================================
   SECTION 2 — SVG ICON SET (inline outline icons, Lucide-style)
   Used for KPI cards and insight bullets — no emoji, no external library.
   ============================================================================= */
function svg(inner){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
const ICONS = {
  rupee: svg('<path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/>'),
  cart: svg('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.6 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>'),
  receipt: svg('<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>'),
  star: svg('<path d="M12 2 15.1 8.3 22 9.3l-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2l-5-4.9 6.9-1Z"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  xcircle: svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  truck: svg('<path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'),
  check: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  percent: svg('<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  return: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>'),
  box: svg('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'),
  layers: svg('<path d="m12.8 2.2 8.6 3.8a1 1 0 0 1 0 1.8l-8.6 3.8a2 2 0 0 1-1.6 0L2.6 7.8a1 1 0 0 1 0-1.8l8.6-3.8a2 2 0 0 1 1.6 0Z"/><path d="m22 12.5-9.2 4.1a2 2 0 0 1-1.6 0L2 12.5"/>'),
  tag: svg('<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  mappin: svg('<path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
  store: svg('<path d="m2 7 2-4h16l2 4"/><path d="M4 7v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7"/><path d="M9 21v-6h6v6"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  trendup: svg('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
  trenddown: svg('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>'),
  globe: svg('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  hash: svg('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>'),
  coins: svg('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/>'),
};

/* =============================================================================
   SECTION 3 — AGGREGATION HELPERS (the analytical engine)
   All of these run on FILTERED, so they always respect the global filters.
   ============================================================================= */

// Group by a field and compute every metric we might need per group.
function groupBy(field, data = FILTERED) {
  const m = {};
  data.forEach((r) => {
    let g = m[r[field]];
    if (!g) g = m[r[field]] = { key: r[field], orders:0, qty:0, gross:0, net:0,
      ratingSum:0, delivSum:0, delivered:0, cancelled:0, returned:0, onTime:0 };
    g.orders++; g.qty += r.quantity; g.gross += r.grossSales; g.net += r.netSales; g.ratingSum += r.rating;
    if (r.status === "Delivered") { g.delivered++; g.delivSum += r.deliveryTime; if (r.deliveryTime <= ON_TIME_MAX) g.onTime++; }
    else if (r.status === "Cancelled") g.cancelled++;
    else if (r.status === "Returned") g.returned++;
  });
  return Object.values(m).map((g) => ({
    ...g,
    avgRating: g.orders ? g.ratingSum / g.orders : 0,
    avgDeliv: g.delivered ? g.delivSum / g.delivered : 0,
    aov: g.orders ? g.net / g.orders : 0,
    cancelRate: g.orders ? g.cancelled / g.orders * 100 : 0,
    returnRate: g.orders ? g.returned / g.orders * 100 : 0,
  }));
}

// Simple "sum of net sales by field", sorted high -> low.
function salesBy(field, data = FILTERED) {
  return groupBy(field, data).map((g) => ({ key: g.key, value: g.net }))
    .sort((a, b) => b.value - a.value);
}
function countBy(field, data = FILTERED) {
  const m = {}; data.forEach((r) => { m[r[field]] = (m[r[field]] || 0) + 1; }); return m;
}

// Monthly aggregates (chronological) for trend/gross-net/delivery charts.
function monthlyAgg(data = FILTERED) {
  const m = {};
  data.forEach((r) => {
    const k = monthKey(r.orderDate);
    let g = m[k]; if (!g) g = m[k] = { key:k, label:monthLabel(r.orderDate), net:0, gross:0, orders:0, delivSum:0, delivered:0 };
    g.net += r.netSales; g.gross += r.grossSales; g.orders++;
    if (r.status === "Delivered") { g.delivered++; g.delivSum += r.deliveryTime; }
  });
  return Object.values(m).sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => ({ ...g, avgDeliv: g.delivered ? g.delivSum / g.delivered : 0 }));
}

// Month-over-Month growth % = (last - prev) / prev * 100.
function momGrowth() {
  const s = monthlyAgg();
  if (s.length < 2) return { pct: 0, label: "", ok: false };
  const cur = s[s.length-1].net, prev = s[s.length-2].net;
  return { pct: prev ? (cur-prev)/prev*100 : 0, label: s[s.length-1].label, ok: true };
}

// Delivery-time buckets over delivered orders.
const DELIVERY_BUCKETS = [
  { label:"Under 10 min", test:(t)=>t<10 },
  { label:"10–15 min",    test:(t)=>t>=10&&t<=15 },
  { label:"16–20 min",    test:(t)=>t>=16&&t<=20 },
  { label:"21–30 min",    test:(t)=>t>=21&&t<=30 },
  { label:"Above 30 min", test:(t)=>t>30 },
];
function deliveryBuckets() {
  const d = FILTERED.filter((r) => r.status === "Delivered");
  return DELIVERY_BUCKETS.map((b) => ({ label:b.label, count:d.filter((r)=>b.test(r.deliveryTime)).length }));
}

// Net sales grouped by discount level.
function discountAgg() {
  const buckets = [0,5,10,15,20,30,40], m = {};
  FILTERED.forEach((r) => { m[r.discount] = (m[r.discount] || 0) + r.netSales; });
  return buckets.map((b) => ({ label: b + "%", value: m[b] || 0 }));
}

// Per-product stats for the Sales & Products table.
function productStats() {
  const m = {};
  FILTERED.forEach((r) => {
    let p = m[r.product];
    if (!p) p = m[r.product] = { product:r.product, category:r.category, orders:0, qty:0, sales:0, ratingSum:0 };
    p.orders++; p.qty += r.quantity; p.sales += r.netSales; p.ratingSum += r.rating;
  });
  return Object.values(m).map((p) => ({ ...p, rating: p.orders ? p.ratingSum/p.orders : 0 }));
}

/* =============================================================================
   SECTION 4 — CHART HELPERS
   ============================================================================= */
Chart.defaults.font.family = "'Segoe UI', Roboto, sans-serif";
Chart.defaults.color = "#6b7280";

function destroyAllCharts() {
  Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
}
function makeChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  charts[id] = new Chart(el, config);
}

// Reusable option builders keep the code short & consistent.
const anim = { duration: 650 };
function moneyYScale(){ return { y:{ beginAtZero:true, ticks:{ callback:(v)=>formatINR(v) }, grid:{ color:"#eef1f6" } }, x:{ grid:{ display:false } } }; }
function moneyXScale(){ return { x:{ beginAtZero:true, ticks:{ callback:(v)=>formatINR(v) }, grid:{ color:"#eef1f6" } }, y:{ grid:{ display:false } } }; }
function moneyTip(axis){ return { callbacks:{ label:(c)=> " " + formatINRFull(axis==="x"?c.parsed.x:c.parsed.y) } }; }

// Horizontal bar of {key,value} rows.
function hBar(id, rows, color, isMoney=true) {
  makeChart(id, {
    type: "bar",
    data: { labels: rows.map(r=>r.key), datasets: [{
      data: rows.map(r=>Math.round(r.value)),
      backgroundColor: color, borderRadius: 6, maxBarThickness: 24,
    }]},
    options: { indexAxis:"y", responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{display:false}, tooltip: isMoney ? moneyTip("x") : { callbacks:{ label:(c)=>" "+formatInt(c.parsed.x) } } },
      scales: isMoney ? moneyXScale() : { x:{ beginAtZero:true, ticks:{ callback:(v)=>formatInt(v) }, grid:{color:"#eef1f6"} }, y:{ grid:{display:false} } },
    },
  });
}
// Vertical bar of {key,value} rows.
function vBar(id, rows, colors, opts={}) {
  const { money=true, suffix="", decimals=0 } = opts;
  makeChart(id, {
    type: "bar",
    data: { labels: rows.map(r=>r.key), datasets: [{
      data: rows.map(r=>+(+r.value).toFixed(decimals)),
      backgroundColor: colors, borderRadius: 6, maxBarThickness: 46,
    }]},
    options: { responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{display:false}, tooltip: money ? moneyTip("y") : { callbacks:{ label:(c)=>" "+formatInt(c.parsed.y)+suffix } } },
      scales: money ? moneyYScale() : { y:{ beginAtZero:true, ticks:{ callback:(v)=>formatInt(v)+suffix }, grid:{color:"#eef1f6"} }, x:{ grid:{display:false}, ticks:{font:{size:11}} } },
    },
  });
}
// Donut of labels/data with percentage tooltips.
function donut(id, labels, data, colors, money=false) {
  makeChart(id, {
    type: "doughnut",
    data: { labels, datasets:[{ data, backgroundColor:colors, borderWidth:2, borderColor:"#fff", hoverOffset:6 }]},
    options: { responsive:true, maintainAspectRatio:false, cutout:"62%", animation:anim,
      plugins:{ legend:{ position:"bottom", labels:{ usePointStyle:true, padding:14 } },
        tooltip:{ callbacks:{ label:(c)=>{
          const total = c.dataset.data.reduce((a,b)=>a+b,0);
          const pct = total ? (c.parsed/total*100).toFixed(1) : 0;
          const val = money ? formatINRFull(c.parsed) : formatInt(c.parsed);
          return ` ${c.label}: ${val} (${pct}%)`;
        } } } },
    },
  });
}

/* =============================================================================
   SECTION 5 — KPI CARD BUILDER
   ============================================================================= */
function kpiCard(icon, label, value, sub, subClass="neutral", accent="green") {
  return `<div class="kpi-card accent-${accent}">
    <div class="kpi-icon">${ICONS[icon]||""}</div>
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub ${subClass}">${sub||""}</div>
  </div>`;
}

/* =============================================================================
   SECTION 6 — INSIGHT BUILDER
   ============================================================================= */
function renderInsights(containerId, items) {
  const el = document.getElementById(containerId);
  if (!items.length) {
    el.innerHTML = `<div class="insight"><div class="dot">${ICONS.hash}</div><p>No data matches the current filters.</p></div>`;
    return;
  }
  el.innerHTML = items.map((it) =>
    `<div class="insight"><div class="dot">${ICONS[it.icon]||ICONS.trendup}</div><p>${it.text}</p></div>`
  ).join("");
}

/* =============================================================================
   SECTION 7 — PAGE 1: HOME / EXECUTIVE OVERVIEW
   ============================================================================= */
function renderHome() {
  const d = FILTERED, orders = d.length;
  const totalSales = d.reduce((s,r)=>s+r.netSales,0);
  const aov = orders ? totalSales/orders : 0;
  const avgRating = orders ? d.reduce((s,r)=>s+r.rating,0)/orders : 0;
  const delivered = d.filter(r=>r.status==="Delivered");
  const avgDeliv = delivered.length ? delivered.reduce((s,r)=>s+r.deliveryTime,0)/delivered.length : 0;
  const cancelled = d.filter(r=>r.status==="Cancelled").length;
  const cancelRate = orders ? cancelled/orders*100 : 0;
  const mom = momGrowth();

  document.getElementById("homeKpis").innerHTML =
    kpiCard("rupee","Total Sales",formatINR(totalSales),formatINRFull(totalSales)+" net","neutral","green") +
    kpiCard("cart","Total Orders",formatInt(orders),"Transactions","neutral","yellow") +
    kpiCard("receipt","Avg Order Value",formatINRFull(aov),"Per order","neutral","blue") +
    kpiCard("star","Avg Rating",avgRating.toFixed(2)+" ★", avgRating>=4?"Excellent":avgRating>=3.5?"Good":"Needs work", avgRating>=4?"up":avgRating>=3.5?"neutral":"down","orange") +
    kpiCard("clock","Avg Delivery Time",avgDeliv.toFixed(1)+" min","Delivered orders","neutral","purple") +
    kpiCard("xcircle","Cancellation Rate",cancelRate.toFixed(1)+"%",formatInt(cancelled)+" cancelled",cancelRate<=6?"up":"down","red");

  // Charts
  const trend = monthlyAgg();
  makeChart("c_home_trend", {
    type:"line",
    data:{ labels:trend.map(t=>t.label), datasets:[{ label:"Net Sales", data:trend.map(t=>Math.round(t.net)),
      borderColor:CO.green, backgroundColor:"rgba(12,131,31,0.10)", fill:true, tension:.35, borderWidth:3,
      pointRadius:3, pointBackgroundColor:CO.green, pointHoverRadius:6 }]},
    options:{ responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{display:false}, tooltip:moneyTip("y") }, scales:moneyYScale() },
  });
  const momNote = document.getElementById("homeMomNote");
  momNote.textContent = mom.ok ? `MoM: ${mom.pct>=0?"▲":"▼"} ${Math.abs(mom.pct).toFixed(1)}%` : "MoM: n/a";
  momNote.style.color = mom.pct>=0 ? CO.green : CO.red;

  hBar("c_home_category", salesBy("category"), CO.green);
  const st = countBy("status");
  donut("c_home_status", META.statuses, META.statuses.map(s=>st[s]||0), [CO.green,CO.red,CO.orange]);
  vBar("c_home_cities", salesBy("city").slice(0,5), salesBy("city").slice(0,5).map((_,i)=>CO.palette[i%CO.palette.length]));

  // Insights
  const cityRows = salesBy("city"), catRows = salesBy("category");
  let ret=0,tot=0; d.forEach(r=>{ tot+=r.netSales; if(r.customerType==="Returning") ret+=r.netSales; });
  const ins = [];
  if (mom.ok) ins.push({ icon: mom.pct>=0?"trendup":"trenddown", text:`Sales <b>${mom.pct>=0?"increased":"decreased"} ${Math.abs(mom.pct).toFixed(1)}%</b> in ${mom.label} vs the previous month.` });
  if (cityRows.length) ins.push({ icon:"mappin", text:`<b>${cityRows[0].key}</b> generated the highest sales (${formatINR(cityRows[0].value)}).` });
  if (catRows.length) ins.push({ icon:"layers", text:`<b>${catRows[0].key}</b> is the highest-selling category (${((catRows[0].value/totalSales)*100||0).toFixed(1)}% of sales).` });
  if (tot) ins.push({ icon:"users", text:`Returning customers contributed <b>${(ret/tot*100).toFixed(1)}%</b> of total sales.` });
  renderInsights("homeInsights", ins);
}

/* =============================================================================
   SECTION 8 — PAGE 2: LOGISTICS
   ============================================================================= */
function renderLogistics() {
  const d = FILTERED, orders = d.length;
  const delivered = d.filter(r=>r.status==="Delivered");
  const avgDeliv = delivered.length ? delivered.reduce((s,r)=>s+r.deliveryTime,0)/delivered.length : 0;
  const onTime = delivered.filter(r=>r.deliveryTime<=ON_TIME_MAX).length;
  const onTimePct = delivered.length ? onTime/delivered.length*100 : 0;
  const cancelled = d.filter(r=>r.status==="Cancelled").length;
  const returned = d.filter(r=>r.status==="Returned").length;

  document.getElementById("logKpis").innerHTML =
    kpiCard("truck","Delivered Orders",formatInt(delivered.length),`${orders?((delivered.length/orders)*100).toFixed(1):0}% of orders`,"up","green") +
    kpiCard("clock","Avg Delivery Time",avgDeliv.toFixed(1)+" min","Per delivered order","neutral","blue") +
    kpiCard("check","On-Time Delivery",onTimePct.toFixed(1)+"%",`≤ ${ON_TIME_MAX} min`, onTimePct>=80?"up":"down","yellow") +
    kpiCard("xcircle","Cancellation Rate",(orders?cancelled/orders*100:0).toFixed(1)+"%",formatInt(cancelled)+" cancelled", (orders?cancelled/orders*100:0)<=6?"up":"down","red") +
    kpiCard("return","Return Rate",(orders?returned/orders*100:0).toFixed(1)+"%",formatInt(returned)+" returned","neutral","orange");

  const cityG = groupBy("city");
  vBar("c_log_delivcity", cityG.map(g=>({key:g.key,value:g.avgDeliv})).sort((a,b)=>a.value-b.value),
       cityG.map(()=>CO.blue), { money:false, suffix:" m", decimals:1 });

  const m = monthlyAgg();
  makeChart("c_log_delivtrend", {
    type:"line",
    data:{ labels:m.map(x=>x.label), datasets:[{ label:"Avg Delivery (min)", data:m.map(x=>+x.avgDeliv.toFixed(1)),
      borderColor:CO.purple, backgroundColor:"rgba(142,99,255,0.10)", fill:true, tension:.35, borderWidth:3, pointRadius:3, pointHoverRadius:6 }]},
    options:{ responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(c)=>" "+c.parsed.y+" min" } } },
      scales:{ y:{ beginAtZero:false, ticks:{ callback:(v)=>v+" m" }, grid:{color:"#eef1f6"} }, x:{ grid:{display:false} } } },
  });

  const buckets = deliveryBuckets();
  vBar("c_log_buckets", buckets.map(b=>({key:b.label,value:b.count})), buckets.map(()=>CO.green), { money:false });
  const topB = buckets.slice().sort((a,b)=>b.count-a.count)[0];
  document.getElementById("logBucketNote").textContent = topB && topB.count ? `Most common: ${topB.label}` : "Delivered orders";

  vBar("c_log_cancelcity", cityG.map(g=>({key:g.key,value:g.cancelRate})).sort((a,b)=>b.value-a.value),
       cityG.map(()=>CO.red), { money:false, suffix:"%", decimals:1 });

  const stores = groupBy("store").map(g=>({key:g.key,value:g.delivered})).sort((a,b)=>b.value-a.value).slice(0,10);
  hBar("c_log_stores", stores, CO.green, false);

  // Insights
  const byDeliv = cityG.slice().sort((a,b)=>a.avgDeliv-b.avgDeliv);
  const storeStats = groupBy("store").filter(g=>g.orders>=20).sort((a,b)=>b.cancelRate-a.cancelRate);
  const ins = [];
  if (byDeliv.length) ins.push({ icon:"truck", text:`Fastest delivery city: <b>${byDeliv[0].key}</b> (${byDeliv[0].avgDeliv.toFixed(1)} min avg).` });
  if (byDeliv.length) ins.push({ icon:"clock", text:`Slowest delivery city: <b>${byDeliv[byDeliv.length-1].key}</b> (${byDeliv[byDeliv.length-1].avgDeliv.toFixed(1)} min avg).` });
  if (storeStats.length) ins.push({ icon:"store", text:`Store <b>${storeStats[0].key}</b> has the highest cancellation rate (${storeStats[0].cancelRate.toFixed(1)}%).` });
  if (topB && topB.count) ins.push({ icon:"check", text:`Most delivered orders fall in the <b>${topB.label}</b> window (${formatInt(topB.count)} orders).` });
  renderInsights("logInsights", ins);
}

/* =============================================================================
   SECTION 9 — PAGE 3: FINANCIAL
   ============================================================================= */
function renderFinancial() {
  const d = FILTERED, orders = d.length;
  const gross = d.reduce((s,r)=>s+r.grossSales,0);
  const net = d.reduce((s,r)=>s+r.netSales,0);
  const discountAmt = gross - net;
  const aov = orders ? net/orders : 0;
  const mom = momGrowth();

  document.getElementById("finKpis").innerHTML =
    kpiCard("coins","Gross Sales",formatINR(gross),formatINRFull(gross),"neutral","yellow") +
    kpiCard("rupee","Net Sales",formatINR(net),formatINRFull(net),"neutral","green") +
    kpiCard("tag","Total Discount",formatINR(discountAmt),`${gross?((discountAmt/gross)*100).toFixed(1):0}% of gross`,"down","red") +
    kpiCard("receipt","Avg Order Value",formatINRFull(aov),"Per order","neutral","blue") +
    kpiCard(mom.pct>=0?"trendup":"trenddown","MoM Sales Growth",(mom.ok?(mom.pct>=0?"+":"")+mom.pct.toFixed(1)+"%":"n/a"), mom.ok?"vs previous month":"", mom.pct>=0?"up":"down","purple");

  const m = monthlyAgg();
  makeChart("c_fin_grossnet", {
    type:"bar",
    data:{ labels:m.map(x=>x.label), datasets:[
      { label:"Gross", data:m.map(x=>Math.round(x.gross)), backgroundColor:CO.yellow, borderRadius:5, maxBarThickness:22 },
      { label:"Net", data:m.map(x=>Math.round(x.net)), backgroundColor:CO.green, borderRadius:5, maxBarThickness:22 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{ position:"top", labels:{ usePointStyle:true } }, tooltip:moneyTip("y") },
      scales:moneyYScale() },
  });

  makeChart("c_fin_trend", {
    type:"line",
    data:{ labels:m.map(x=>x.label), datasets:[{ label:"Net Sales", data:m.map(x=>Math.round(x.net)),
      borderColor:CO.green, backgroundColor:"rgba(12,131,31,0.10)", fill:true, tension:.35, borderWidth:3, pointRadius:3, pointHoverRadius:6 }]},
    options:{ responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{display:false}, tooltip:moneyTip("y") }, scales:moneyYScale() },
  });
  const finNote = document.getElementById("finMomNote");
  finNote.textContent = mom.ok ? `MoM: ${mom.pct>=0?"▲":"▼"} ${Math.abs(mom.pct).toFixed(1)}%` : "MoM: n/a";
  finNote.style.color = mom.pct>=0 ? CO.green : CO.red;

  vBar("c_fin_discount", discountAgg().map(x=>({key:x.label,value:x.value})), discountAgg().map(()=>CO.orange));

  const paySales = salesBy("payment");
  donut("c_fin_payment", paySales.map(p=>p.key), paySales.map(p=>Math.round(p.value)),
        [CO.green,CO.blue,CO.yellow,CO.purple,CO.orange], true);

  vBar("c_fin_city", salesBy("city"), salesBy("city").map((_,i)=>CO.palette[i%CO.palette.length]));

  // Insights
  const ins = [];
  if (mom.ok) ins.push({ icon: mom.pct>=0?"trendup":"trenddown", text:`Net sales <b>${mom.pct>=0?"grew":"fell"} ${Math.abs(mom.pct).toFixed(1)}%</b> month-over-month in ${mom.label}.` });
  ins.push({ icon:"tag", text:`Discounts reduced revenue by <b>${formatINR(discountAmt)}</b> (${gross?((discountAmt/gross)*100).toFixed(1):0}% of gross sales).` });
  if (paySales.length) ins.push({ icon:"coins", text:`<b>${paySales[0].key}</b> is the top payment method by revenue (${formatINR(paySales[0].value)}).` });
  const cityRows = salesBy("city");
  if (cityRows.length) ins.push({ icon:"mappin", text:`<b>${cityRows[0].key}</b> is the highest revenue city (${formatINR(cityRows[0].value)}).` });
  renderInsights("finInsights", ins);
}

/* =============================================================================
   SECTION 10 — PAGE 4: SALES & PRODUCTS
   ============================================================================= */
let tableSort = { key:"sales", dir:"desc" };
let productSearch = "";

function renderSales() {
  const d = FILTERED, orders = d.length;
  const totalSales = d.reduce((s,r)=>s+r.netSales,0);
  const qtySold = d.reduce((s,r)=>s+r.quantity,0);
  const numProducts = new Set(d.map(r=>r.product)).size;
  const avgRating = orders ? d.reduce((s,r)=>s+r.rating,0)/orders : 0;
  const avgPerOrder = orders ? totalSales/orders : 0;

  document.getElementById("salesKpis").innerHTML =
    kpiCard("rupee","Total Sales",formatINR(totalSales),formatINRFull(totalSales),"neutral","green") +
    kpiCard("box","Quantity Sold",formatInt(qtySold),"Units","neutral","yellow") +
    kpiCard("layers","Products",formatInt(numProducts),"Distinct products","neutral","blue") +
    kpiCard("star","Avg Product Rating",avgRating.toFixed(2)+" ★", avgRating>=4?"Excellent":"Good", avgRating>=4?"up":"neutral","orange") +
    kpiCard("receipt","Avg Sales / Order",formatINRFull(avgPerOrder),"Per order","neutral","purple");

  hBar("c_sp_category", salesBy("category"), CO.green);
  const catG = groupBy("category");
  vBar("c_sp_qty", catG.map(g=>({key:g.key,value:g.qty})).sort((a,b)=>b.value-a.value), catG.map(()=>CO.yellow), { money:false });

  const prods = productStats();
  hBar("c_sp_top", prods.slice().sort((a,b)=>b.sales-a.sales).slice(0,10).map(p=>({key:p.product,value:p.sales})), CO.green);
  hBar("c_sp_bottom", prods.slice().sort((a,b)=>a.sales-b.sales).slice(0,10).map(p=>({key:p.product,value:p.sales})), CO.red);

  const catRate = groupBy("category").map(g=>({key:g.key,value:g.avgRating})).sort((a,b)=>b.value-a.value);
  makeChart("c_sp_rating", {
    type:"bar",
    data:{ labels:catRate.map(r=>r.key), datasets:[{ data:catRate.map(r=>+r.value.toFixed(2)),
      backgroundColor:catRate.map(r=> r.value>=4?CO.green : r.value>=3.5?CO.yellow : CO.red), borderRadius:6, maxBarThickness:46 }]},
    options:{ responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(c)=>" "+c.parsed.y.toFixed(2)+" ★" } } },
      scales:{ y:{ beginAtZero:true, max:5, grid:{color:"#eef1f6"} }, x:{ grid:{display:false}, ticks:{font:{size:11}} } } },
  });

  renderProductTable();
}

function renderProductTable() {
  let rows = productStats();
  if (productSearch) {
    const q = productSearch.toLowerCase();
    rows = rows.filter(r => r.product.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
  }
  const { key, dir } = tableSort;
  rows.sort((a,b) => {
    let r = (typeof a[key]==="string") ? a[key].localeCompare(b[key]) : a[key]-b[key];
    return dir==="asc" ? r : -r;
  });

  // Conditional-formatting thresholds (computed from the full filtered set).
  const all = productStats();
  const maxSales = Math.max(...all.map(s=>s.sales), 0);
  const topSeller = all.slice().sort((a,b)=>b.sales-a.sales)[0];
  const lowThreshold = maxSales * 0.15;

  const body = document.getElementById("productTableBody");
  body.innerHTML = rows.map((s) => {
    let badge = "";
    if (topSeller && s.product===topSeller.product) badge = `<span class="badge badge-top">Top</span>`;
    else if (s.sales >= maxSales*0.7) badge = `<span class="badge badge-high">High</span>`;
    else if (s.sales <= lowThreshold) badge = `<span class="badge badge-low">Low</span>`;
    const lowRate = s.rating < 3.5 ? ` <span class="badge badge-lowrate">Low rated</span>` : "";
    const rClass = s.rating>=4 ? "rating-good" : s.rating<3.5 ? "rating-bad" : "";
    const rowClass = (topSeller && s.product===topSeller.product) || s.sales>=maxSales*0.7 ? "row-top" : (s.sales<=lowThreshold ? "row-low" : "");
    return `<tr class="${rowClass}">
      <td>${s.product} ${badge}${lowRate}</td>
      <td>${s.category}</td>
      <td class="num">${formatInt(s.orders)}</td>
      <td class="num">${formatInt(s.qty)}</td>
      <td class="num">${formatINRFull(s.sales)}</td>
      <td class="num ${rClass}">${s.rating.toFixed(2)} ★</td>
    </tr>`;
  }).join("");

  document.querySelectorAll("#productTable thead th").forEach((th) => {
    const a = th.querySelector(".arrow"); if (!a) return;
    a.textContent = th.dataset.key===key ? (dir==="asc"?"▲":"▼") : "";
  });
}

/* =============================================================================
   SECTION 11 — PAGE 5: GEOGRAPHICAL
   ============================================================================= */
function renderGeo() {
  const cityG = groupBy("city");
  const totalNet = cityG.reduce((s,g)=>s+g.net,0);
  const numCities = cityG.length;
  const topCity = cityG.slice().sort((a,b)=>b.net-a.net)[0];
  const topStore = groupBy("store").slice().sort((a,b)=>b.net-a.net)[0];
  const avgPerCity = numCities ? totalNet/numCities : 0;

  document.getElementById("geoKpis").innerHTML =
    kpiCard("globe","Cities",formatInt(numCities),"Active markets","neutral","blue") +
    kpiCard("mappin","Top Sales City",topCity?topCity.key:"—",topCity?formatINR(topCity.net):"","up","green") +
    kpiCard("store","Top Store",topStore?topStore.key:"—",topStore?formatINR(topStore.net):"","up","yellow") +
    kpiCard("rupee","Avg Sales / City",formatINR(avgPerCity),"Across markets","neutral","purple");

  // ---- "Map": a bubble chart positioned by real coordinates ----
  const maxNet = Math.max(...cityG.map(g=>g.net), 1);
  const points = cityG.filter(g=>CITY_COORDS[g.key]).map(g=>({
    x: CITY_COORDS[g.key][0], y: CITY_COORDS[g.key][1],
    r: 8 + (g.net/maxNet)*30, city: g.key, net: g.net,
  }));
  // Custom plugin: write city names next to bubbles.
  const labelPlugin = {
    id: "cityLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart; const meta = chart.getDatasetMeta(0);
      ctx.save(); ctx.font = "600 11px Segoe UI"; ctx.fillStyle = "#22303f"; ctx.textAlign = "center";
      meta.data.forEach((pt, i) => { const p = points[i]; if (p) ctx.fillText(p.city, pt.x, pt.y - pt.options.radius - 4); });
      ctx.restore();
    },
  };
  makeChart("c_geo_map", {
    type:"bubble",
    data:{ datasets:[{ data:points, backgroundColor:"rgba(12,131,31,0.55)", borderColor:CO.green, borderWidth:1.5 }]},
    options:{ responsive:true, maintainAspectRatio:false, animation:anim,
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(c)=>` ${c.raw.city}: ${formatINRFull(c.raw.net)}` } } },
      scales:{ x:{ min:66, max:98, display:false }, y:{ min:6, max:40, display:false } } },
    plugins:[labelPlugin],
  });

  vBar("c_geo_sales", cityG.map(g=>({key:g.key,value:g.net})).sort((a,b)=>b.value-a.value), cityG.map((_,i)=>CO.palette[i%CO.palette.length]));
  vBar("c_geo_orders", cityG.map(g=>({key:g.key,value:g.orders})).sort((a,b)=>b.value-a.value), cityG.map(()=>CO.blue), { money:false });
  vBar("c_geo_aov", cityG.map(g=>({key:g.key,value:g.aov})).sort((a,b)=>b.value-a.value), cityG.map(()=>CO.purple));
  vBar("c_geo_deliv", cityG.map(g=>({key:g.key,value:g.avgDeliv})).sort((a,b)=>a.value-b.value), cityG.map(()=>CO.orange), { money:false, suffix:" m", decimals:1 });
  vBar("c_geo_cancel", cityG.map(g=>({key:g.key,value:g.cancelRate})).sort((a,b)=>b.value-a.value), cityG.map(()=>CO.red), { money:false, suffix:"%", decimals:1 });

  const byDeliv = cityG.slice().sort((a,b)=>a.avgDeliv-b.avgDeliv);
  const ins = [];
  if (topCity) ins.push({ icon:"mappin", text:`<b>${topCity.key}</b> leads with ${formatINR(topCity.net)} in net sales (${totalNet?((topCity.net/totalNet)*100).toFixed(1):0}% of total).` });
  if (topStore) ins.push({ icon:"store", text:`Top outlet is <b>${topStore.key}</b> with ${formatINR(topStore.net)} in sales.` });
  if (byDeliv.length) ins.push({ icon:"truck", text:`<b>${byDeliv[0].key}</b> has the fastest average delivery (${byDeliv[0].avgDeliv.toFixed(1)} min).` });
  const worst = cityG.slice().sort((a,b)=>b.cancelRate-a.cancelRate)[0];
  if (worst) ins.push({ icon:"xcircle", text:`<b>${worst.key}</b> has the highest cancellation rate (${worst.cancelRate.toFixed(1)}%).` });
  renderInsights("geoInsights", ins);
}

/* =============================================================================
   SECTION 12 — PAGE ROUTER
   Renders ONLY the active page (and rebuilds its charts) after any change.
   ============================================================================= */
const PAGES = {
  home:      { el:"page-home",      render:renderHome },
  logistics: { el:"page-logistics", render:renderLogistics },
  financial: { el:"page-financial", render:renderFinancial },
  sales:     { el:"page-sales",     render:renderSales },
  geo:       { el:"page-geo",       render:renderGeo },
};

function showPage(page) {
  currentPage = page;
  // Toggle visible section.
  Object.keys(PAGES).forEach((p) => { document.getElementById(PAGES[p].el).hidden = (p !== page); });
  // Toggle active nav button.
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  // Rebuild charts fresh for the visible page (avoids hidden-canvas sizing bugs).
  destroyAllCharts();
  PAGES[page].render();
}

/* =============================================================================
   SECTION 13 — FILTERS (global — affect every page)
   ============================================================================= */
function fillSelect(id, values, allLabel) {
  document.getElementById(id).innerHTML =
    `<option value="all">${allLabel}</option>` + values.map((v)=>`<option value="${v}">${v}</option>`).join("");
}

function applyFilters() {
  const city = document.getElementById("fCity").value;
  const category = document.getElementById("fCategory").value;
  const store = document.getElementById("fStore").value;
  const status = document.getElementById("fStatus").value;
  const customer = document.getElementById("fCustomer").value;
  const from = document.getElementById("fDateFrom").value;
  const to = document.getElementById("fDateTo").value;

  FILTERED = ALL_DATA.filter((r) => {
    if (city !== "all" && r.city !== city) return false;
    if (category !== "all" && r.category !== category) return false;
    if (store !== "all" && r.store !== store) return false;
    if (status !== "all" && r.status !== status) return false;
    if (customer !== "all" && r.customerType !== customer) return false;
    if (from && r.dateStr < from) return false;
    if (to && r.dateStr > to) return false;
    return true;
  });

  document.getElementById("filterSummary").textContent =
    `Showing ${formatInt(FILTERED.length)} of ${formatInt(ALL_DATA.length)} transactions`;

  // Re-render whichever page is currently open.
  destroyAllCharts();
  PAGES[currentPage].render();
}

function initFilters() {
  fillSelect("fCity", META.cities, "All Cities");
  fillSelect("fCategory", META.categories, "All Categories");
  fillSelect("fStore", META.allStores, "All Stores");
  fillSelect("fStatus", META.statuses, "All Status");
  fillSelect("fCustomer", META.customerTypes, "All Customers");

  const minDate = ALL_DATA[0].dateStr, maxDate = ALL_DATA[ALL_DATA.length-1].dateStr;
  const fFrom = document.getElementById("fDateFrom"), fTo = document.getElementById("fDateTo");
  fFrom.min = fTo.min = minDate; fFrom.max = fTo.max = maxDate;
  fFrom.value = minDate; fTo.value = maxDate;

  // Changing city narrows the store list to that city.
  document.getElementById("fCity").addEventListener("change", (e) => {
    const c = e.target.value;
    fillSelect("fStore", c==="all" ? META.allStores : (META.storesByCity[c]||[]), "All Stores");
    applyFilters();
  });
  ["fCategory","fStore","fStatus","fCustomer","fDateFrom","fDateTo"]
    .forEach((id)=>document.getElementById(id).addEventListener("change", applyFilters));

  document.getElementById("resetFilters").addEventListener("click", () => {
    document.getElementById("fCity").value = "all";
    fillSelect("fStore", META.allStores, "All Stores");
    document.getElementById("fCategory").value = "all";
    document.getElementById("fStatus").value = "all";
    document.getElementById("fCustomer").value = "all";
    fFrom.value = minDate; fTo.value = maxDate;
    applyFilters();
  });
}

/* =============================================================================
   SECTION 14 — RAW DATA MODAL (searchable + paginated)
   ============================================================================= */
const RAW_PAGE_SIZE = 50;
let rawPage = 1, rawSearchTerm = "";

function rawRows() {
  if (!rawSearchTerm) return ALL_DATA;
  const q = rawSearchTerm.toLowerCase();
  return ALL_DATA.filter((r) =>
    r.orderId.toLowerCase().includes(q) || r.city.toLowerCase().includes(q) ||
    r.store.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) ||
    r.category.toLowerCase().includes(q) || r.status.toLowerCase().includes(q) ||
    r.payment.toLowerCase().includes(q));
}
function renderRawTable() {
  const rows = rawRows();
  const totalPages = Math.max(1, Math.ceil(rows.length/RAW_PAGE_SIZE));
  if (rawPage > totalPages) rawPage = totalPages;
  const start = (rawPage-1)*RAW_PAGE_SIZE;
  document.getElementById("rawTableBody").innerHTML = rows.slice(start, start+RAW_PAGE_SIZE).map((r)=>`
    <tr><td>${r.orderId}</td><td>${r.dateStr}</td><td>${r.city}</td><td>${r.store}</td>
    <td>${r.category}</td><td>${r.product}</td><td>${r.itemType}</td>
    <td class="num">${r.quantity}</td><td class="num">${r.unitPrice}</td><td class="num">${r.discount}</td>
    <td class="num">${r.grossSales}</td><td class="num">${r.netSales}</td><td class="num">${r.rating.toFixed(1)}</td>
    <td class="num">${r.deliveryTime}</td><td>${r.status}</td><td>${r.payment}</td><td>${r.customerType}</td></tr>`).join("");
  document.getElementById("rawCount").textContent = `${formatInt(rows.length)} rows` + (rawSearchTerm?" (filtered)":"");
  document.getElementById("rawPageInfo").textContent = `Page ${rawPage} of ${totalPages}`;
  document.getElementById("rawFirst").disabled = rawPage===1;
  document.getElementById("rawPrev").disabled = rawPage===1;
  document.getElementById("rawNext").disabled = rawPage===totalPages;
  document.getElementById("rawLast").disabled = rawPage===totalPages;
}
function initRawModal() {
  const modal = document.getElementById("rawModal");
  const open = () => { modal.classList.add("open"); rawPage=1; renderRawTable(); };
  const close = () => modal.classList.remove("open");
  document.getElementById("btnRawData").addEventListener("click", open);
  document.getElementById("rawClose").addEventListener("click", close);
  modal.addEventListener("click", (e)=>{ if (e.target===modal) close(); });
  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") close(); });
  document.getElementById("rawSearch").addEventListener("input", (e)=>{ rawSearchTerm=e.target.value.trim(); rawPage=1; renderRawTable(); });
  document.getElementById("rawFirst").addEventListener("click", ()=>{ rawPage=1; renderRawTable(); });
  document.getElementById("rawPrev").addEventListener("click", ()=>{ rawPage--; renderRawTable(); });
  document.getElementById("rawNext").addEventListener("click", ()=>{ rawPage++; renderRawTable(); });
  document.getElementById("rawLast").addEventListener("click", ()=>{ rawPage=Math.ceil(rawRows().length/RAW_PAGE_SIZE); renderRawTable(); });
}

/* =============================================================================
   SECTION 15 — CSV DOWNLOAD (full 10,000 rows)
   ============================================================================= */
function downloadCsv() {
  const headers = ["Order ID","Order Date","City","Store/Outlet ID","Product Category","Product Name",
    "Item Type","Quantity","Unit Price","Discount %","Gross Sales","Net Sales","Customer Rating",
    "Delivery Time (min)","Order Status","Payment Method","Customer Type"];
  const lines = [headers.join(",")];
  ALL_DATA.forEach((r)=>lines.push([r.orderId,r.dateStr,`"${r.city}"`,r.store,`"${r.category}"`,`"${r.product}"`,
    r.itemType,r.quantity,r.unitPrice,r.discount,r.grossSales,r.netSales,r.rating.toFixed(1),
    r.deliveryTime,r.status,r.payment,r.customerType].join(",")));
  const blob = new Blob([lines.join("\n")], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "blinkit_sales_data.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =============================================================================
   SECTION 16 — WIRE UP EVERYTHING & BOOT
   ============================================================================= */
function init() {
  initFilters();
  initRawModal();

  // Sidebar navigation (SPA — no page reload).
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPage(btn.dataset.page);
      document.body.classList.remove("sidebar-open"); // close mobile drawer
    });
  });

  // Mobile sidebar toggle + backdrop.
  document.getElementById("menuToggle").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  document.getElementById("backdrop").addEventListener("click", () => document.body.classList.remove("sidebar-open"));

  // Product table: sorting + search (Sales page).
  document.querySelectorAll("#productTable thead th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (tableSort.key===key) tableSort.dir = tableSort.dir==="asc" ? "desc" : "asc";
      else { tableSort.key = key; tableSort.dir = (key==="product"||key==="category") ? "asc" : "desc"; }
      renderProductTable();
    });
  });
  document.getElementById("spSearch").addEventListener("input", (e) => { productSearch = e.target.value.trim(); renderProductTable(); });

  // CSV buttons.
  document.getElementById("btnDownloadCsv").addEventListener("click", downloadCsv);
  document.getElementById("btnDownloadCsv2").addEventListener("click", downloadCsv);

  // First render.
  applyFilters();     // builds FILTERED + summary
  showPage("home");   // render the Home page
}

document.addEventListener("DOMContentLoaded", init);
