// ===== DOM refs =====
const routesListEl = document.getElementById("routesList");
const routesStatusEl = document.getElementById("routesStatus");
const detailsEl = document.getElementById("routeDetails");
const detailsStatusEl = document.getElementById("detailsStatus");
const selectedRouteLabelEl = document.getElementById("selectedRouteLabel");
const mapStatusEl = document.getElementById("mapStatus");


const createRouteForm = document.getElementById("createRouteForm");
const routeNumberInput = document.getElementById("routeNumberInput");

const addStopForm = document.getElementById("addStopForm");
const addStopStatusEl = document.getElementById("addStopStatus");

const stopNameEl = document.getElementById("stopName");
const stopLatEl = document.getElementById("stopLat");
const stopLonEl = document.getElementById("stopLon");
const stopOrderEl = document.getElementById("stopOrder");
const pickupTimeEl = document.getElementById("pickupTime");

// Merge UI
const mergeBaseRouteLabelEl = document.getElementById("mergeBaseRouteLabel");
const donorRouteSelectEl = document.getElementById("donorRouteSelect");
const loadDonorStopsBtn = document.getElementById("loadDonorStopsBtn");
const selectAllDonorStopsBtn = document.getElementById("selectAllDonorStopsBtn");
const mergeSelectedStopsBtn = document.getElementById("mergeSelectedStopsBtn");
const donorStopsListEl = document.getElementById("donorStopsList");
const mergeStatusEl = document.getElementById("mergeStatus");

// Draft UI (optional container in HTML: <div id="draftBar"></div>)
const draftBarEl = document.getElementById("draftBar");

// Map UI (IMPORTANT: routeMap must NOT be overwritten by detailsEl.innerHTML)
let routeMapEl = document.getElementById("routeMap");

let selectedRouteId = null;
let selectedRouteIsDraft = false;
let selectedRouteSourceId = null;

// Leaflet state
let leafletMap = null;
let leafletMarkersLayer = null;
let leafletLine = null;
let leafletRoutingControl = null;
let mapRenderSeq = 0;
let _leafletIconFixed = false;

// ===== Routing config (free now, swappable later) =====
const ROUTING = {
  // OSRM public endpoint (fine for demos, not guaranteed for production)
  osrmServiceUrl: "https://router.project-osrm.org/route/v1",
  osrmNearestUrl: "https://router.project-osrm.org/nearest/v1/driving",
  snapStopsToRoad: false, // optional (can be slow/unreliable on demo endpoints)
  snapConcurrency: 4,
  snapTimeoutMs: 1200,
  snapWarnMeters: 30,
};

// ===== helpers =====
function getRouteId(obj) {
  // routes list uses {id}, details endpoint uses {routeId}
  return obj?.routeId ?? obj?.id ?? null;
}

function isFiniteNumber(n) {
  return Number.isFinite(Number(n));
}

// Haversine distance (meters) for "snap moved too far" warnings
function metersBetween(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function withTimeout(promiseFactory, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(t);
  }
}

// ===== API helpers =====
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost(url, bodyObj) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function apiPatch(url, bodyObj) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
}

// ===== UI helpers =====
function clearStatus() {
  routesStatusEl.textContent = "";
  detailsStatusEl.textContent = "";
  if (addStopStatusEl) addStopStatusEl.textContent = "";
  if (mergeStatusEl) mergeStatusEl.textContent = "";
}

function routeLabel(route) {
  return route.routeNumber ?? "(no routeNumber)";
}

function renderRoutes(routes) {
  routesListEl.innerHTML = "";

  routes.forEach((route) => {
    const id = getRouteId(route);

    const li = document.createElement("li");
    li.innerHTML = `
      <span><strong>${routeLabel(route)}</strong></span>
      <span class="badge">id ${id ?? "?"}</span>
    `;
    li.addEventListener("click", () => {
      if (id != null) loadRouteDetails(id);
    });
    routesListEl.appendChild(li);
  });

  if (routes.length === 0) {
    routesListEl.innerHTML = `<li><span class="muted">No routes yet. Add one above.</span></li>`;
  }

  // Populate donor dropdown with all routes
  if (donorRouteSelectEl) {
    donorRouteSelectEl.innerHTML = "";
    routes.forEach((r) => {
      const id = getRouteId(r);
      const opt = document.createElement("option");
      opt.value = String(id ?? "");
      opt.textContent = `Route ${r.routeNumber} (id ${id})`;
      donorRouteSelectEl.appendChild(opt);
    });
  }
}

// ===== Leaflet map helpers =====
function fixLeafletDefaultIconsOnce() {
  if (_leafletIconFixed) return;
  if (typeof L === "undefined") return;
  if (!L.Icon || !L.Icon.Default) return;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });

  _leafletIconFixed = true;
}

function ensureMap() {
  if (typeof L === "undefined") return null; // Leaflet not loaded

  // IMPORTANT: if you ever re-render HTML and the map div gets recreated, re-grab it:
  if (!routeMapEl) routeMapEl = document.getElementById("routeMap");
  if (!routeMapEl) return null;

  fixLeafletDefaultIconsOnce();

  if (!leafletMap) {
    leafletMap = L.map(routeMapEl, { zoomControl: true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(leafletMap);

    leafletMarkersLayer = L.layerGroup().addTo(leafletMap);

    // Default view (LA-ish). We'll fitBounds when a route loads.
    leafletMap.setView([34.0522, -118.2437], 10);
  }

  return leafletMap;
}

// ---- OSRM snapping (optional) ----
async function osrmNearest(lat, lon, signal) {
  const url = `${ROUTING.osrmNearestUrl}/${lon},${lat}?number=1`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM nearest failed: ${res.status}`);
  const data = await res.json();
  const wp = data?.waypoints?.[0];
  if (!wp?.location) throw new Error("OSRM nearest returned no location");
  const [snappedLon, snappedLat] = wp.location;
  return { latitude: snappedLat, longitude: snappedLon };
}

async function snapStopsToRoad(cleanStops) {
  const CONCURRENCY = ROUTING.snapConcurrency ?? 4;
  const out = [];

  for (let i = 0; i < cleanStops.length; i += CONCURRENCY) {
    const chunk = cleanStops.slice(i, i + CONCURRENCY);
    const snappedChunk = await Promise.all(
      chunk.map(async (s) => {
        try {
          const snapped = await withTimeout(
            (signal) => osrmNearest(s.latitude, s.longitude, signal),
            ROUTING.snapTimeoutMs ?? 1200
          );

          const movedMeters = metersBetween(
            s.latitude,
            s.longitude,
            snapped.latitude,
            snapped.longitude
          );

          return { ...s, ...snapped, _snapped: true, _snapMovedMeters: movedMeters };
        } catch {
          return { ...s, _snapped: false, _snapMovedMeters: 0 };
        }
      })
    );
    out.push(...snappedChunk);
  }

  return out;
}

function setMapStatus(msg, isError = false) {
  if (!mapStatusEl) return;
  mapStatusEl.textContent = msg || "";
  mapStatusEl.style.color = isError ? "#b00020" : "#2e7d32";
}

function drawFallbackLine(map, stopsArr) {
  const latlngs = stopsArr.map((s) => [s.latitude, s.longitude]);
  if (leafletLine) { leafletLine.remove(); leafletLine = null; }
  leafletLine = L.polyline(latlngs).addTo(map);
  map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] });
}


// ===== Map rendering =====
async function renderRouteMap(stops) {
  const map = ensureMap();
  if (!map) return;

  const mySeq = ++mapRenderSeq; // prevents stale route callbacks from applying

  // Leaflet sometimes needs this after layout changes
  setTimeout(() => map.invalidateSize(), 0);

  // Clear previous markers/lines/routes
  if (leafletMarkersLayer) leafletMarkersLayer.clearLayers();
  if (leafletLine) { leafletLine.remove(); leafletLine = null; }
  if (leafletRoutingControl) {
    map.removeControl(leafletRoutingControl);
    leafletRoutingControl = null;
  }

  const clean = (stops ?? [])
    .filter((s) => isFiniteNumber(s.latitude) && isFiniteNumber(s.longitude))
    .map((s) => ({
      ...s,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      stopOrder: Number(s.stopOrder),
    }))
    .sort((a, b) => a.stopOrder - b.stopOrder);

  if (clean.length === 0) {
    setMapStatus("");
    return;
  }

  // Optional snapping (off by default)
  let used = clean;
  if (ROUTING.snapStopsToRoad) {
    setMapStatus("Snapping stops to roads…");
    try {
      used = await snapStopsToRoad(clean);
    } catch {
      // ignore snap failure, use original points
      used = clean;
    }
  }

  // Markers
  used.forEach((s) => {
    const latlng = [s.latitude, s.longitude];

    const movedNote =
      s._snapped && s._snapMovedMeters > (ROUTING.snapWarnMeters ?? 30)
        ? `<br/><span class="muted">⚠ snapped ~${Math.round(s._snapMovedMeters)}m</span>`
        : "";

    const label = `<strong>#${s.stopOrder}</strong> ${s.name ?? "Stop"}${movedNote}`;
    L.marker(latlng).bindPopup(label).addTo(leafletMarkersLayer);
  });

  // If routing plugin missing, fallback immediately
  if (!(L.Routing && L.Routing.control && L.Routing.osrmv1)) {
    setMapStatus("Routing plugin missing — showing straight line.", true);
    drawFallbackLine(map, used);
    return;
  }

  setMapStatus("Routing…");

  // Router with timeout (prevents hanging on demo server)
  const router = L.Routing.osrmv1({
    serviceUrl: ROUTING.osrmServiceUrl,
    timeout: ROUTING.routeTimeoutMs ?? 8000, // ms
    profile: "driving",
  });

  leafletRoutingControl = L.Routing.control({
    waypoints: used.map((s) => L.latLng(s.latitude, s.longitude)),
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    routeWhileDragging: false,
    show: false,
    createMarker: () => null,
    router,
  }).addTo(map);

  // Guard against stale callbacks if user clicked another route
  const safe = (fn) => (...args) => {
    if (mySeq !== mapRenderSeq) return;
    fn(...args);
  };

  leafletRoutingControl.on(
    "routesfound",
    safe((e) => {
      setMapStatus("Routed ✅");
      const r = e.routes?.[0];
      if (r?.bounds) map.fitBounds(r.bounds, { padding: [20, 20] });
    })
  );

  leafletRoutingControl.on(
    "routingerror",
    safe(() => {
      // remove routing overlay and fallback
      try { map.removeControl(leafletRoutingControl); } catch {}
      leafletRoutingControl = null;

      setMapStatus("Routing failed — showing straight line.", true);
      drawFallbackLine(map, used);
    })
  );
}


// ===== Draft bar =====
function setDraftBar(details) {
  if (!draftBarEl) return;

  if (details?.draft) {
    const src = details.sourceRouteId ?? "(unknown)";
    const draftId = getRouteId(details);

    draftBarEl.style.display = "block";
    draftBarEl.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <div>
          <strong>Viewing Draft</strong>
          <span class="muted"> (from route id ${src})</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="publishDraftBtn" type="button">Save Draft as New Route</button>
          <button class="btn danger" id="deleteDraftBtn" type="button">Delete Draft</button>
        </div>
      </div>
    `;

    const publishBtn = document.getElementById("publishDraftBtn");
    publishBtn?.addEventListener("click", async () => {
      try {
        if (draftId == null) throw new Error("Draft id missing from details response");

        const suggested = (details.routeNumber ?? "").replace("-DRAFT", "");
        const newName = prompt("Name for the new route?", suggested);
        if (newName === null) return;

        if (mergeStatusEl) mergeStatusEl.textContent = "Saving draft as new route...";

        const createdDetails = await apiPost(`/routes/${draftId}/publish`, {
          routeNumber: newName.trim() || suggested,
          deleteDraft: true,
        });

        const newRouteId = getRouteId(createdDetails);
        if (newRouteId == null) throw new Error("New route id missing from publish response");

        await loadRoutes();
        await loadRouteDetails(newRouteId);

        if (mergeStatusEl) mergeStatusEl.textContent = `Saved as new route (id ${newRouteId}).`;
      } catch (err) {
        if (mergeStatusEl) mergeStatusEl.textContent = `Could not save draft: ${err.message}`;
      }
    });

    const deleteBtn = document.getElementById("deleteDraftBtn");
    deleteBtn?.addEventListener("click", async () => {
      const ok = confirm("Delete this draft route?");
      if (!ok) return;

      try {
        if (draftId == null) throw new Error("Draft id missing from details response");
        await apiDelete(`/routes/${draftId}/draft`);

        if (mergeStatusEl) mergeStatusEl.textContent = "Draft deleted.";

        if (details.sourceRouteId) {
          await loadRouteDetails(details.sourceRouteId);
        } else {
          selectedRouteId = null;
          selectedRouteIsDraft = false;
          selectedRouteSourceId = null;
          detailsEl.innerHTML = `<p class="muted">Select a route to view stops.</p>`;
          if (selectedRouteLabelEl) selectedRouteLabelEl.textContent = "";
          if (mergeBaseRouteLabelEl) mergeBaseRouteLabelEl.textContent = "";
        }

        await loadRoutes();
      } catch (err) {
        if (mergeStatusEl) mergeStatusEl.textContent = `Could not delete draft: ${err.message}`;
      }
    });
  } else {
    draftBarEl.style.display = "none";
    draftBarEl.innerHTML = "";
  }
}

// ===== Route details rendering =====
function renderRouteDetails(details) {
  selectedRouteIsDraft = !!details.draft;
  selectedRouteSourceId = details.sourceRouteId ?? null;

  const stops = details.stops ?? [];
  const routeId = getRouteId(details);

  const titleText = details.draft
    ? `Route ${details.routeNumber} (id ${routeId}) — DRAFT`
    : `Route ${details.routeNumber} (id ${routeId})`;

  setDraftBar(details);

  const headerHtml = `
    <h3 class="title" style="display:flex; gap:12px; align-items:center; justify-content:space-between;">
      <span>${titleText}</span>
      <span style="display:flex; gap:8px; align-items:center;">
        <input
          id="renameRouteInput"
          class="mini"
          type="text"
          value="${details.routeNumber ?? ""}"
          placeholder="Route name"
        />
        <button class="btn" id="renameRouteBtn" type="button">Rename</button>
        <button class="btn danger" id="deleteRouteBtn" type="button">Delete Route</button>
      </span>
    </h3>
  `;

  if (stops.length === 0) {
    detailsEl.innerHTML = `
      ${headerHtml}
      <p class="muted">No stops attached to this route yet.</p>
    `;
    wireRouteHeaderActions(routeId);
    renderRouteMap(stops);
    return;
  }

  const rows = stops
    .map(
      (s) => `
      <tr data-routestop-id="${s.routeStopId}">
        <td>
          <input class="mini" type="number" min="1" step="1" value="${s.stopOrder}" data-field="stopOrder" />
        </td>
        <td>
          <input class="mini" type="text" value="${s.pickupTime ?? ""}" data-field="pickupTime" />
        </td>
        <td>${s.name}</td>
        <td>${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}</td>
        <td class="actions">
          <button class="btn" data-action="save">Save</button>
          <button class="btn danger" data-action="delete">Delete</button>
        </td>
      </tr>
    `
    )
    .join("");

  detailsEl.innerHTML = `
    ${headerHtml}
    <table class="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Pickup</th>
          <th>Stop</th>
          <th>Lat/Lon</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wireRouteHeaderActions(routeId);
  renderRouteMap(stops);
}

function wireRouteHeaderActions(routeId) {
  const renameBtn = document.getElementById("renameRouteBtn");
  const renameInput = document.getElementById("renameRouteInput");
  const deleteBtn = document.getElementById("deleteRouteBtn");

  renameBtn?.addEventListener("click", async () => {
    const newName = (renameInput?.value ?? "").trim();
    if (!newName) {
      detailsStatusEl.textContent = "Route name cannot be empty.";
      return;
    }

    try {
      await apiPatch(`/routes/${routeId}`, { routeNumber: newName });
      await loadRoutes();
      await loadRouteDetails(routeId);
      detailsStatusEl.textContent = "Route renamed.";
    } catch (err) {
      detailsStatusEl.textContent = `Rename failed: ${err.message}`;
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    const ok = confirm("Delete this route and all its stops? This cannot be undone.");
    if (!ok) return;

    try {
      await apiDelete(`/routes/${routeId}`);
      await loadRoutes();

      selectedRouteId = null;
      selectedRouteIsDraft = false;
      selectedRouteSourceId = null;

      detailsEl.innerHTML = `<p class="muted">Select a route to view stops.</p>`;
      if (selectedRouteLabelEl) selectedRouteLabelEl.textContent = "";
      if (mergeBaseRouteLabelEl) mergeBaseRouteLabelEl.textContent = "";
      if (draftBarEl) {
        draftBarEl.style.display = "none";
        draftBarEl.innerHTML = "";
      }

      detailsStatusEl.textContent = "Route deleted.";
    } catch (err) {
      detailsStatusEl.textContent = `Delete failed: ${err.message}`;
    }
  });
}

// ===== Data loaders =====
async function loadRoutes() {
  clearStatus();
  try {
    const routes = await apiGet("/routes?includeDrafts=true");
    renderRoutes(routes);
  } catch (e) {
    routesStatusEl.textContent = `Could not load routes: ${e.message}`;
  }
}

async function loadRouteDetails(routeId) {
  selectedRouteId = routeId;

  if (selectedRouteLabelEl) selectedRouteLabelEl.textContent = String(routeId);
  if (mergeBaseRouteLabelEl) mergeBaseRouteLabelEl.textContent = String(routeId);

  clearStatus();
  detailsEl.innerHTML = `<p class="muted">Loading route ${routeId}…</p>`;

  try {
    const details = await apiGet(`/routes/${routeId}/details`);
    renderRouteDetails(details);
  } catch (e) {
    detailsStatusEl.textContent = `Could not load route details: ${e.message}`;
    detailsEl.innerHTML = `<p class="muted">Select a route to view stops.</p>`;
    setDraftBar(null);
  }
}

// ===== Event: Create Route =====
createRouteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  const routeNumber = routeNumberInput.value.trim();
  if (!routeNumber) return;

  try {
    await apiPost("/routes", { routeNumber });
    routeNumberInput.value = "";
    await loadRoutes();
  } catch (err) {
    routesStatusEl.textContent = `Could not create route: ${err.message}`;
  }
});

// ===== Event: Add Stop to Route =====
addStopForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  if (!selectedRouteId) {
    addStopStatusEl.textContent = "Select a route first.";
    return;
  }

  const name = stopNameEl.value.trim();
  const latitude = Number(stopLatEl.value);
  const longitude = Number(stopLonEl.value);
  const stopOrder = Number(stopOrderEl.value);
  const pickupTime = pickupTimeEl.value.trim();

  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(stopOrder)) {
    addStopStatusEl.textContent = "Fill out all fields.";
    return;
  }

  addStopStatusEl.textContent = "Adding stop...";

  try {
    const stop = await apiPost("/stops", { name, latitude, longitude });
    await apiPost("/route-stops", {
      routeId: selectedRouteId,
      stopId: stop.id,
      stopOrder,
      pickupTime: pickupTime || null,
    });

    await loadRouteDetails(selectedRouteId);

    stopNameEl.value = "";
    stopLatEl.value = "";
    stopLonEl.value = "";
    stopOrderEl.value = "";
    pickupTimeEl.value = "";

    addStopStatusEl.textContent = "";
  } catch (err) {
    addStopStatusEl.textContent = `Could not add stop: ${err.message}`;
  }
});

// ===== Event: Save/Delete in Route Details table =====
detailsEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const tr = btn.closest("tr");
  if (!tr) return;

  const routeStopId = tr.getAttribute("data-routestop-id");
  if (!routeStopId) return;

  const action = btn.getAttribute("data-action");
  const stopOrderInput = tr.querySelector('input[data-field="stopOrder"]');
  const pickupTimeInput = tr.querySelector('input[data-field="pickupTime"]');

  try {
    if (action === "save") {
      const stopOrder = Number(stopOrderInput.value);
      const pickupTime = pickupTimeInput.value.trim();

      if (!Number.isFinite(stopOrder) || stopOrder < 1) {
        detailsStatusEl.textContent = "Stop order must be a number >= 1.";
        return;
      }

      await apiPatch(`/route-stops/${routeStopId}`, {
        stopOrder,
        pickupTime: pickupTime || null,
      });

      await loadRouteDetails(selectedRouteId);
    }

    if (action === "delete") {
      const ok = confirm("Remove this stop from the route?");
      if (!ok) return;

      await apiDelete(`/route-stops/${routeStopId}`);
      await loadRouteDetails(selectedRouteId);
    }
  } catch (err) {
    detailsStatusEl.textContent = err.message;
  }
});

// ===== Merge helpers =====
async function loadDonorStops(donorRouteId) {
  if (!donorStopsListEl) return;

  mergeStatusEl.textContent = "";
  donorStopsListEl.innerHTML = "<p class='muted'>Loading donor stops...</p>";

  const details = await apiGet(`/routes/${donorRouteId}/details`);
  const stops = details.stops ?? [];

  if (stops.length === 0) {
    donorStopsListEl.innerHTML = "<p class='muted'>No stops on donor route.</p>";
    return;
  }

  donorStopsListEl.innerHTML = stops
    .map(
      (s) => `
    <label style="display:flex; gap:10px; align-items:center; margin:6px 0;">
      <input type="checkbox" class="donorStopCb" value="${s.routeStopId}">
      <span>
        <strong>#${s.stopOrder}</strong> ${s.name}
        <span class="muted">(routeStopId ${s.routeStopId})</span>
      </span>
    </label>
  `
    )
    .join("");
}

loadDonorStopsBtn?.addEventListener("click", async () => {
  mergeStatusEl.textContent = "";
  donorStopsListEl.innerHTML = "";

  if (!selectedRouteId) {
    mergeStatusEl.textContent = "Select a base route first.";
    return;
  }

  const donorId = Number(donorRouteSelectEl.value);
  if (!donorId) {
    mergeStatusEl.textContent = "Select a donor route.";
    return;
  }

  if (donorId === selectedRouteId) {
    mergeStatusEl.textContent = "Donor route must be different than base route.";
    return;
  }

  try {
    await loadDonorStops(donorId);
  } catch (err) {
    mergeStatusEl.textContent = `Could not load donor stops: ${err.message}`;
  }
});

selectAllDonorStopsBtn?.addEventListener("click", () => {
  document.querySelectorAll(".donorStopCb").forEach((cb) => (cb.checked = true));
});

mergeSelectedStopsBtn?.addEventListener("click", async () => {
  mergeStatusEl.textContent = "";

  if (!selectedRouteId) {
    mergeStatusEl.textContent = "Select a base route first.";
    return;
  }

  const donorId = Number(donorRouteSelectEl.value);
  if (!donorId || donorId === selectedRouteId) {
    mergeStatusEl.textContent = "Pick a donor route that is different than base route.";
    return;
  }

  const selectedRouteStopIds = Array.from(document.querySelectorAll(".donorStopCb"))
    .filter((cb) => cb.checked)
    .map((cb) => Number(cb.value))
    .filter((n) => Number.isFinite(n));

  if (selectedRouteStopIds.length === 0) {
    mergeStatusEl.textContent = "Select at least one donor stop.";
    return;
  }

  mergeStatusEl.textContent = "Merging (creating draft)...";

  try {
    const draftDetails = await apiPost(`/routes/${selectedRouteId}/merge`, {
      fromRouteId: donorId,
      routeStopIds: selectedRouteStopIds,
      strategy: "PROXIMITY",
    });

    const draftId = getRouteId(draftDetails);
    if (draftId == null) throw new Error("Draft id missing from merge response");

    mergeStatusEl.textContent = `Draft created (id ${draftId}). Loading...`;

    await loadRoutes();
    await loadRouteDetails(draftId);

    donorStopsListEl.innerHTML = "";
    mergeStatusEl.textContent = "Done.";
  } catch (err) {
    mergeStatusEl.textContent = `Merge failed: ${err.message}`;
  }
});

// ===== Boot =====
loadRoutes();
