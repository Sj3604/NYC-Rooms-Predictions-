const $ = (id) => document.getElementById(id);

// Order matches model.classes_ (alphabetical in scikit-learn)
const CLASSES = [
  { name: "Entire home/apt", emoji: "🏠" },
  { name: "Private room", emoji: "🛏️" },
  { name: "Shared room", emoji: "👥" },
];

const BOROUGHS = {
  Manhattan: { lat: 40.7831, lng: -73.9712, hoods: ["Harlem", "Upper West Side", "Upper East Side", "Midtown", "Hell's Kitchen", "East Village", "Chelsea", "West Village", "Lower East Side", "Washington Heights"] },
  Brooklyn: { lat: 40.6782, lng: -73.9442, hoods: ["Williamsburg", "Bedford-Stuyvesant", "Bushwick", "Crown Heights", "Greenpoint", "Park Slope"] },
  Queens: { lat: 40.7282, lng: -73.7949, hoods: ["Astoria", "Long Island City", "Flushing", "Ridgewood", "Jamaica"] },
  Bronx: { lat: 40.8448, lng: -73.8648, hoods: ["Mott Haven", "Kingsbridge", "Fordham"] },
  "Staten Island": { lat: 40.5795, lng: -74.1502, hoods: ["St. George", "Tompkinsville"] },
};

const RULES = {
  latitude: [-90, 90], longitude: [-180, 180], price: [0.01, Infinity],
  minimum_nights: [1, 365], number_of_reviews: [0, Infinity],
  reviews_per_month: [0, Infinity], calculated_host_listings_count: [0, Infinity],
  availability_365: [0, 365],
};

const apiBase = "https://nyc-rooms-predictions-grhe.onrender.com"; // change if your FastAPI runs elsewhere

function localStorageSafe(k, v) {
  try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; }
}

/* ---------- Borough chips ---------- */
const chipBox = $("chips");
Object.keys(BOROUGHS).forEach((b) => {
  const c = document.createElement("button");
  c.type = "button"; c.className = "chip"; c.textContent = b;
  c.onclick = () => selectBorough(b);
  chipBox.appendChild(c);
});

function selectBorough(b) {
  const d = BOROUGHS[b];
  $("neighbourhood_group").value = b;
  $("latitude").value = d.lat; $("longitude").value = d.lng;
  $("hoods").innerHTML = d.hoods.map((h) => `<option value="${h}">`).join("");
  if (!d.hoods.includes($("neighbourhood").value)) $("neighbourhood").value = d.hoods[0];
  [...chipBox.children].forEach((c) => c.classList.toggle("active", c.textContent === b));
}
$("neighbourhood_group").addEventListener("change", (e) => e.target.value && selectBorough(e.target.value));

/* ---------- Slider badge ---------- */
$("availability_365").addEventListener("input", (e) => ($("availBadge").textContent = e.target.value));

/* ---------- API status ---------- */
async function checkStatus() {
  const s = $("status");
  try {
    const r = await fetch(apiBase + "/", { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw 0;
    s.className = "status online"; $("statusText").textContent = "API online";
  } catch {
    s.className = "status offline"; $("statusText").textContent = "API offline";
  }
}
checkStatus(); setInterval(checkStatus, 10000);

/* ---------- Helpers ---------- */
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 4000);
}
function validate() {
  let ok = true;
  Object.entries(RULES).forEach(([k, [min, max]]) => {
    const el = $(k), v = parseFloat(el.value);
    const bad = el.value === "" || isNaN(v) || v < min || v > max;
    el.classList.toggle("invalid", bad);
    if (bad) ok = false;
  });
  ["neighbourhood_group", "neighbourhood"].forEach((k) => {
    const bad = !$(k).value.trim();
    $(k).classList.toggle("invalid", bad);
    if (bad) ok = false;
  });
  return ok;
}
function countUp(el, to, ms = 1000) {
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min((t - t0) / ms, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = (to * e).toFixed(1) + "%";
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function ripple(e) {
  const b = e.currentTarget, r = document.createElement("span"), d = Math.max(b.clientWidth, b.clientHeight);
  const rect = b.getBoundingClientRect();
  r.className = "ripple";
  r.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - rect.left - d / 2}px;top:${e.clientY - rect.top - d / 2}px`;
  b.appendChild(r); setTimeout(() => r.remove(), 600);
}
document.querySelectorAll(".btn").forEach((b) => b.addEventListener("click", ripple));

/* ---------- Demo mode (only for previewing the UI without the API) ---------- */
function demoPredict(p) {
  let a = 1, b = 1, c = 0.2;
  a += p.price > 120 ? 2 : 0; b += p.price <= 120 ? 1.5 : 0; c += p.price < 50 ? 1.2 : 0;
  a += p.minimum_nights > 5 ? 0.5 : 0; b += p.number_of_reviews > 20 ? 0.8 : 0;
  const s = a + b + c;
  const probs = [a / s, b / s, c / s];
  return { Predicted_room_type: CLASSES[probs.indexOf(Math.max(...probs))].name, Probability: probs };
}

/* ---------- Submit ---------- */
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return toast("Please fix the highlighted fields.");

  const payload = {
    latitude: parseFloat($("latitude").value),
    longitude: parseFloat($("longitude").value),
    price: parseFloat($("price").value),
    minimum_nights: parseInt($("minimum_nights").value, 10),
    number_of_reviews: parseInt($("number_of_reviews").value, 10),
    reviews_per_month: parseFloat($("reviews_per_month").value),
    calculated_host_listings_count: parseInt($("calculated_host_listings_count").value, 10),
    availability_365: parseInt($("availability_365").value, 10),
    neighbourhood_group: $("neighbourhood_group").value.trim(),
    neighbourhood: $("neighbourhood").value.trim(),
  };

  const btn = $("submitBtn");
  btn.classList.add("loading"); btn.disabled = true;
  try {
    let data;
    if ($("demo").checked) {
      await new Promise((r) => setTimeout(r, 900));
      data = demoPredict(payload);
    } else {
      const res = await fetch(apiBase + "/predict", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.detail === "string" ? j.detail : `Server error (${res.status})`);
      }
      data = await res.json();
    }
    showResult(data);
  } catch (err) {
    toast(err instanceof TypeError ? "Cannot reach the API. Is FastAPI running? (or tick Demo mode)" : err.message);
  } finally {
    btn.classList.remove("loading"); btn.disabled = false;
  }
});

function showResult(data) {
  const probs = data.Probability;
  const topIdx = probs.indexOf(Math.max(...probs));
  const meta = CLASSES.find((c) => c.name === data.Predicted_room_type) || CLASSES[topIdx];

  $("placeholder").style.display = "none";
  const r = $("result");
  r.classList.remove("show"); void r.offsetWidth; r.classList.add("show");
  $("resEmoji").textContent = meta.emoji;
  $("resType").textContent = data.Predicted_room_type;
  const ring = $("ringFg");
  ring.style.strokeDashoffset = 339.3;
  countUp($("ringNum"), probs[topIdx] * 100);
  requestAnimationFrame(() => requestAnimationFrame(() => (ring.style.strokeDashoffset = 339.3 * (1 - probs[topIdx]))));

  $("bars").innerHTML = probs.map((p, i) => `
    <div class="bar ${i === topIdx ? "top" : ""}">
      <div class="bar-top"><span>${CLASSES[i]?.emoji || ""} ${CLASSES[i]?.name || "Class " + i}</span><span class="pct">0%</span></div>
      <div class="track"><div class="fill f${i % 3}"></div></div>
    </div>`).join("");
  requestAnimationFrame(() => {
    document.querySelectorAll(".fill").forEach((f, i) => (f.style.width = probs[i] * 100 + "%"));
    document.querySelectorAll(".pct").forEach((el, i) => countUp(el, probs[i] * 100));
  });
}

/* ---------- Reset ---------- */
$("resetBtn").addEventListener("click", () => {
  $("form").reset(); $("availBadge").textContent = 180;
  [...chipBox.children].forEach((c) => c.classList.remove("active"));
  $("ringFg").style.strokeDashoffset = 339.3;
  $("result").classList.remove("show"); $("placeholder").style.display = "block";
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
});

/* ---------- Moving particle network background ---------- */
(function () {
  const cv = $("bg"), ctx = cv.getContext("2d");
  if (!ctx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let w, h, pts = [], mouse = { x: -999, y: -999 };
  function size() {
    w = cv.width = innerWidth; h = cv.height = innerHeight;
    pts = Array.from({ length: Math.min(80, Math.floor((w * h) / 18000)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45, r: Math.random() * 1.8 + 0.6,
    }));
  }
  addEventListener("resize", size);
  addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  (function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 120) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = "rgba(240,219,165,.75)"; ctx.fill();
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < 130) {
        ctx.strokeStyle = `rgba(160,175,255,${0.22 * (1 - d / 130)})`;
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  })();
  size();
})();
