// ===== DOM refs =====
const routesListEl = document.getElementById("routesList");
const routesStatusEl = document.getElementById("routesStatus");
const detailsEl = document.getElementById("routeDetails");
const detailsStatusEl = document.getElementById("detailsStatus");
const selectedRouteLabelEl = document.getElementById("selectedRouteLabel");

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

let selectedRouteId = null;

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
    const li = document.createElement("li");
    li.innerHTML = `
      <span><strong>${routeLabel(route)}</strong></span>
      <span class="badge">id ${route.id}</span>
    `;
    li.addEventListener("click", () => loadRouteDetails(route.id));
    routesListEl.appendChild(li);
  });

  if (routes.length === 0) {
    routesListEl.innerHTML = `<li><span class="muted">No routes yet. Add one above.</span></li>`;
  }

  // Populate donor dropdown with all routes
  if (donorRouteSelectEl) {
    donorRouteSelectEl.innerHTML = "";
    routes.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = `Route ${r.routeNumber} (id ${r.id})`;
      donorRouteSelectEl.appendChild(opt);
    });
  }
}

function renderRouteDetails(details) {
  const stops = details.stops ?? [];
  const title = `Route ${details.routeNumber} (id ${details.routeId})`;

  if (stops.length === 0) {
    detailsEl.innerHTML = `
      <h3 class="title">${title}</h3>
      <p class="muted">No stops attached to this route yet.</p>
    `;
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
    <h3 class="title">${title}</h3>
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
}

// ===== Data loaders =====
async function loadRoutes() {
  clearStatus();
  try {
    const routes = await apiGet("/routes");
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

  mergeStatusEl.textContent = "Merging...";

  try {
    await apiPost(`/routes/${selectedRouteId}/merge`, {
      fromRouteId: donorId,
      routeStopIds: selectedRouteStopIds,
      strategy: "PROXIMITY",
    });

    mergeStatusEl.textContent = "Merged! Reloading base route...";
    await loadRouteDetails(selectedRouteId);

    mergeStatusEl.textContent = "Done.";
  } catch (err) {
    mergeStatusEl.textContent = `Merge failed: ${err.message}`;
  }
});

// ===== Boot =====
loadRoutes();
