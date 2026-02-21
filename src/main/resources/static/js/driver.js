/* Driver Mode (read-only)
   - Select a route
   - See stops list + next stop
   - Stop progression (Start / Prev / Next) + saved progress per route
   - Draw street-following route when possible
*/

const routeSelectEl = document.getElementById("driverRouteSelect");
const recenterBtn = document.getElementById("recenterBtn");
const openMapsBtn = document.getElementById("openMapsBtn");
const stopsEl = document.getElementById("driverStops");
const nextEl = document.getElementById("driverNext");
const statusEl = document.getElementById("driverStatus");

const startBtn = document.getElementById("startRouteBtn");
const nextBtn = document.getElementById("nextStopBtn");
const prevBtn = document.getElementById("prevStopBtn");
const openCurrentStopBtn = document.getElementById("openCurrentStopBtn");
const markerByOrder = new Map(); // stopOrder -> Leaflet marker
const resetProgressBtn = document.getElementById("resetProgressBtn");
const offlineBadgeEl = document.getElementById("offlineBadge");


let map = null;
let markersLayer = null;
let routingControl = null;
let lastBounds = null;

let currentRouteId = null;
let currentStops = [];
let currentIndex = -1;

const STORAGE_KEY = "monitorProgress";

// --- Offline route cache (Driver Mode) ---
const ROUTE_CACHE_PREFIX = "driverRouteCache:";

function routeCacheKey(routeId) {
  return `${ROUTE_CACHE_PREFIX}${String(routeId)}`;
}

function saveRouteCache(routeId, stops) {
  try {
    const payload = { savedAt: Date.now(), stops };
    localStorage.setItem(routeCacheKey(routeId), JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

function loadRouteCache(routeId) {
  try {
    const raw = localStorage.getItem(routeCacheKey(routeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.stops)) return null;
    return parsed; // { savedAt, stops }
  } catch {
    return null;
  }
}

// true when we are showing cached stops instead of live API data
let usingCachedRoute = false;

function resetProgressForCurrentRoute() {
  if (!currentRouteId) return;

  const key = String(currentRouteId);
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

  delete data[key];

  // If empty, remove the whole storage key; otherwise save updated object
  if (Object.keys(data).length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  currentIndex = -1;
  updateCurrentStopCard();
  renderStopsList(currentStops);

  setStatus("Progress reset ✅");
}

resetProgressBtn?.addEventListener("click", () => {
  // optional confirm to prevent accidental taps
  const ok = confirm("Reset progress for this route?");
  if (!ok) return;

  resetProgressForCurrentRoute();
});

function openStopInMaps(stop) {
  if (!stop) return;

  const lat = stop.latitude;
  const lon = stop.longitude;
  const label = encodeURIComponent(stopLabel(stop));

  // Apple Maps (works great on iOS, also opens in browser elsewhere)
  const apple = `https://maps.apple.com/?ll=${lat},${lon}&q=${label}`;

  // Google Maps universal link
  const google = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

  // Prefer Apple Maps on iPhone/iPad; otherwise Google
  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent);
  window.open(isApple ? apple : google, "_blank", "noopener");
}

openCurrentStopBtn?.addEventListener("click", () => {
  if (currentIndex < 0) return;
  openStopInMaps(currentStops[currentIndex]);
});



function setStatus(msg, isError = false, title = "") {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#b00020" : "#2e7d32";
  statusEl.title = title || "";
}

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function stopLabel(s) {
  return s?.name || s?.stopName || "Stop";
}

function saveProgress() {
  if (!currentRouteId) return;
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  data[currentRouteId] = currentIndex;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadProgress(routeId) {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  return data[String(routeId)] ?? -1;
}

function updateCurrentStopCard() {
  const card = document.getElementById("currentStopContent");
  if (!card) return;

  if (currentIndex < 0 || !currentStops[currentIndex]) {
    card.textContent = "Route not started.";
    return;
  }

  const s = currentStops[currentIndex];
  card.innerHTML = `
    <div><strong>#${s.stopOrder}</strong> ${stopLabel(s)}</div>
    <div>Pickup: ${s.pickupTime || "—"}</div>
    <div>Lat: ${s.latitude}</div>
    <div>Lon: ${s.longitude}</div>
  `;
}

/**
 * Centering fix for bottom sheet layouts:
 * - invalidateSize() so Leaflet recalculates container dimensions
 * - setView() to the stop
 * - optional panBy() upward so the marker isn't hidden behind the sheet
 */
function focusStopOnMap(s) {
  const m = ensureMap();
  if (!m) return;

  m.invalidateSize(true);

  const zoom = Math.max(m.getZoom(), 15);

  // How much of the map is covered by the sheet?
  const sheet = document.querySelector(".driver-sheet");
  const sheetH = sheet ? sheet.getBoundingClientRect().height : 0;

  // Offset so the marker lands in the center of the *visible* map area
  // (center shift = sheet height / 2) + a little padding
  const offsetY = Math.round(sheetH / 2 + 12);

  const target = L.latLng(s.latitude, s.longitude);

  // Convert target -> pixel point at chosen zoom, then offset the center
  const point = m.project(target, zoom);
  const shiftedPoint = point.add([0, offsetY]); // move center "down" so marker appears higher
  const shiftedCenter = m.unproject(shiftedPoint, zoom);

  m.setView(shiftedCenter, zoom, { animate: true });
}

function highlightCurrentStopOnMap() {
  if (currentIndex < 0) return;

  const s = currentStops[currentIndex];
  if (!s) return;

  focusStopOnMap(s);

  const marker = markerByOrder.get(s.stopOrder);
  if (marker) {
    marker.openPopup();

    const el = marker.getElement?.();
    if (el) {
      el.classList.add("marker-highlight");
      setTimeout(() => el.classList.remove("marker-highlight"), 900);
    }
  }
}

function renderStopsList(stops = currentStops) {
  if (!stopsEl) return;

  currentStops = stops || [];
  stopsEl.innerHTML = "";

  currentStops.forEach((s, idx) => {
    const li = document.createElement("li");
    const t = s.pickupTime ? ` • ${s.pickupTime}` : "";
    li.innerHTML = `<strong>#${s.stopOrder}</strong> ${stopLabel(s)}<span class="muted">${t}</span>`;

    if (idx === currentIndex) li.classList.add("active");
    if (idx === currentIndex + 1) li.classList.add("is-next");

    li.addEventListener("click", () => focusStopOnMap(s));

    stopsEl.appendChild(li);
  });

  if (nextEl) {
    const nextIdx = currentIndex >= 0 ? currentIndex + 1 : 0;
    const n = currentStops[nextIdx];
    nextEl.innerHTML = n
      ? `Next: <strong>#${n.stopOrder}</strong> ${stopLabel(n)} ${n.pickupTime ? `(${n.pickupTime})` : ""}`
      : "No stops.";
  }
}

function ensureMap() {
  if (map) return map;
  if (typeof L === "undefined") return null;

  map = L.map("routeMap", { zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  map.setView([34.0522, -118.2437], 10);

  // Fix layout issues on mobile / sheet overlays
  setTimeout(() => map.invalidateSize(true), 50);
  window.addEventListener("resize", () => setTimeout(() => map.invalidateSize(true), 50));

  return map;
}

function clearRouteRendering() {
  if (markersLayer) markersLayer.clearLayers();

  if (routingControl && map) {
    try {
      map.removeControl(routingControl);
    } catch {}
  }
  routingControl = null;
  lastBounds = null;
}

function buildGoogleMapsLink(stops) {
  if (!stops || stops.length < 2) return null;

  const origin = `${stops[0].latitude},${stops[0].longitude}`;
  const dest = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;
  const waypoints = stops
    .slice(1, -1)
    .map((s) => `${s.latitude},${s.longitude}`)
    .join("|");

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination: dest,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

async function renderRouteOnMap(stops) {
  const m = ensureMap();
  if (!m) return;

  clearRouteRendering();

  if (!stops || stops.length === 0) {
    setStatus("");
    return;
  }

  // Markers
markerByOrder.clear();

stops.forEach((s) => {
  const marker = L.marker([s.latitude, s.longitude]);
  marker.bindPopup(`<strong>#${s.stopOrder}</strong> ${stopLabel(s)}`);
  marker.addTo(markersLayer);
  markerByOrder.set(s.stopOrder, marker);
});

  // If offline OR using cached data, skip OSRM and just fit markers
  if (usingCachedRoute || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    setStatus("Offline — showing cached stops (markers only).");
    lastBounds = L.latLngBounds(stops.map((s) => [s.latitude, s.longitude]));
    m.fitBounds(lastBounds, { padding: [20, 20] });
    return;
  }

  // If routing plugin missing, fit markers only
  if (!(L.Routing && L.Routing.control && L.Routing.osrmv1)) {
    setStatus("Routing plugin missing — showing markers only.", true);
    lastBounds = L.latLngBounds(stops.map((s) => [s.latitude, s.longitude]));
    m.fitBounds(lastBounds, { padding: [20, 20] });
    return;
  }

  setStatus("Routing…");

  const router = L.Routing.osrmv1({
    serviceUrl: "https://router.project-osrm.org/route/v1",
    profile: "driving",
  });

  routingControl = L.Routing.control({
    waypoints: stops.map((s) => L.latLng(s.latitude, s.longitude)),
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    routeWhileDragging: false,
    show: false,
    createMarker: () => null,
    router,
  }).addTo(m);

  routingControl.on("routesfound", (e) => {
    setStatus("Routed ✅");
    const r = e.routes?.[0];
    if (r?.bounds) {
      lastBounds = r.bounds;
      m.fitBounds(r.bounds, { padding: [20, 20] });
    }
  });

  routingControl.on("routingerror", () => {
    setStatus("Routing failed — showing markers.", true);
    try {
      m.removeControl(routingControl);
    } catch {}
    routingControl = null;

    lastBounds = L.latLngBounds(stops.map((s) => [s.latitude, s.longitude]));
    m.fitBounds(lastBounds, { padding: [20, 20] });
  });

  setTimeout(() => m.invalidateSize(true), 50);
}

async function loadRoutes() {
  setStatus("Loading routes…");

  try {
    const routes = await apiGet("/routes?includeDrafts=false");

    if (routeSelectEl) {
      routeSelectEl.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select route…";
      routeSelectEl.appendChild(placeholder);

      routes.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = String(r.routeId ?? r.id);
        opt.textContent = r.routeNumber ?? "(unnamed)";
        routeSelectEl.appendChild(opt);
      });
    }

    setStatus("");
  } catch (e) {
    setStatus(`Could not load routes: ${e.message}`, true);
  }
}

async function loadRouteDetails(routeId) {
  if (!routeId) return;

  setStatus("Loading route…");

  try {
    const details = await apiGet(`/routes/${routeId}/details`);

    const stops = (details.stops || [])
      .filter((s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
      .map((s) => ({
        ...s,
        name: s.name ?? s.stopName ?? "Stop",
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        stopOrder: Number(s.stopOrder),
      }))
      .sort((a, b) => a.stopOrder - b.stopOrder);

      usingCachedRoute = false;
      saveRouteCache(routeId, stops);

    // --- Win 1 state ---
    currentRouteId = String(routeId);
    currentIndex = loadProgress(currentRouteId);
    renderStopsList(stops);
    updateCurrentStopCard();
    // -------------------

    await renderRouteOnMap(stops);
    if (currentIndex >= 0) highlightCurrentStopOnMap();

    const link = buildGoogleMapsLink(stops);
    if (openMapsBtn) {
      openMapsBtn.href = link || "#";
      openMapsBtn.style.pointerEvents = link ? "auto" : "none";
      openMapsBtn.style.opacity = link ? "1" : "0.5";
    }

    localStorage.setItem("driverRouteId", String(routeId));
    setStatus("");

    // After everything renders, force Leaflet to recalc size (sheet layout)
    setTimeout(() => map?.invalidateSize(true), 50);
  } catch (e) {
    // Try cached route stops
    const cached = loadRouteCache(routeId);

    if (cached) {
      usingCachedRoute = true;

      const stops = (cached.stops || [])
        .filter((s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
        .map((s) => ({
          ...s,
          name: s.name ?? s.stopName ?? "Stop",
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          stopOrder: Number(s.stopOrder),
        }))
        .sort((a, b) => a.stopOrder - b.stopOrder);

      currentRouteId = String(routeId);
      currentIndex = loadProgress(currentRouteId);
      renderStopsList(stops);
      updateCurrentStopCard();

      await renderRouteOnMap(stops);
      if (currentIndex >= 0) highlightCurrentStopOnMap();

      // Keep Open Maps usable even offline
      const link = buildGoogleMapsLink(stops);
      if (openMapsBtn) {
        openMapsBtn.href = link || "#";
        openMapsBtn.style.pointerEvents = link ? "auto" : "none";
        openMapsBtn.style.opacity = link ? "1" : "0.5";
      }

      const when = new Date(cached.savedAt).toLocaleString();
      setStatus(`Offline — loaded cached route (${when}).`);
      return;
    }

usingCachedRoute = false;

// Symbol only + tooltip (no visible text instruction)
setStatus("📡", true, "Offline: this route isn’t cached yet. Go online once to cache it.");
  }
}

// Controls (Win 1)
startBtn?.addEventListener("click", () => {
  if (!currentStops.length) return;
  currentIndex = 0;
  saveProgress();
  updateCurrentStopCard();
  renderStopsList(currentStops);

  highlightCurrentStopOnMap();
});

nextBtn?.addEventListener("click", () => {
  if (currentIndex < currentStops.length - 1) {
    currentIndex++;
    saveProgress();
    updateCurrentStopCard();
    renderStopsList(currentStops);

    highlightCurrentStopOnMap();
  }
});

prevBtn?.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    saveProgress();
    updateCurrentStopCard();
    renderStopsList(currentStops);

    highlightCurrentStopOnMap();
  }
});

// Route selection
routeSelectEl?.addEventListener("change", () => {
  const id = routeSelectEl.value;
  loadRouteDetails(id);
});

// Recenter
recenterBtn?.addEventListener("click", () => {
  if (!map) map = ensureMap();
  if (!map) return;

  map.invalidateSize(true);

  if (lastBounds) {
    map.fitBounds(lastBounds, { padding: [20, 20] });
    return;
  }

  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 15);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 5000 }
  );
});

function updateOfflineBadge() {
  if (!offlineBadgeEl) return;
  offlineBadgeEl.hidden = (navigator.onLine !== false); // show only when offline
}

window.addEventListener("online", () => {
  updateOfflineBadge();
  // clear any "go online" tooltip once you're back online
  setStatus("", false, "");
});

window.addEventListener("offline", () => {
  updateOfflineBadge();
});

(async function init() {
  ensureMap();
  updateOfflineBadge();

  // Helpful warning if but tons are missing from driver.html
  if (!startBtn || !prevBtn || !nextBtn) {
    setStatus("Driver controls missing: add Start/Prev/Next buttons to driver.html (IDs: startRouteBtn, prevStopBtn, nextStopBtn).", true);
  }

  await loadRoutes();

  const remembered = localStorage.getItem("driverRouteId");
  if (remembered && routeSelectEl) {
    routeSelectEl.value = remembered;
    if (routeSelectEl.value === remembered) {
      loadRouteDetails(remembered);
    }
  }
})();