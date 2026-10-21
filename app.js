/* ----------------------------------------------------
   CycloTrek France - Core Application Logic
---------------------------------------------------- */

// App State
const state = {
  map: null,
  waypoints: [], // Array of { id, lat, lng, name, marker }
  routes: {}, // Stores GeoJSON for each profile: { trekking, fastbike, safety }
  activeProfile: 'trekking', // default active profile
  activeRouteData: null, // Stores active route geometry and properties
  showCampings: false,
  showWater: false,
  showWays: true,
  poiMarkers: [],
  activeOverlayLayers: {},
  hoverMapMarker: null, // Temporary marker for elevation chart sync
  mapStyle: 'sobre', // sobre, relief, cyclosm
  lastOverpassBbox: '',
  overpassTimeout: null,
};

// Map Tile Layers Configuration
const tileLayers = {
  sobre: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }),
  relief: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  }),
  cyclosm: L.tileLayer('https://{s}.tile-cyclosm.openapi.fr/cyclosm/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" title="CyclOSM - OpenStreetMap cycling map">CyclOSM</a> | Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }),
  cyclingOverlay: L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    maxZoom: 18,
    opacity: 0.85,
    attribution: 'Cycling routes &copy; <a href="https://cycling.waymarkedtrails.org">Waymarked Trails</a>'
  })
};

// Icons definitions (SVG inline representations)
const svgIcons = {
  camp: `<div class="poi-marker-container"><i data-lucide="tent"></i></div>`,
  water: `<div class="poi-marker-container water"><i data-lucide="droplet"></i></div>`
};

// Weather Code mapping to WMO codes (descriptions + icons)
const weatherCodes = {
  0: { desc: 'Ciel dégagé', icon: 'sun' },
  1: { desc: 'Principalement dégagé', icon: 'sun-dim' },
  2: { desc: 'Partiellement nuageux', icon: 'cloud-sun' },
  3: { desc: 'Couvert', icon: 'cloud' },
  45: { desc: 'Brouillard', icon: 'cloud-fog' },
  48: { desc: 'Brouillard givrant', icon: 'cloud-fog' },
  51: { desc: 'Bruine légère', icon: 'cloud-drizzle' },
  53: { desc: 'Bruine modérée', icon: 'cloud-drizzle' },
  55: { desc: 'Bruine dense', icon: 'cloud-drizzle' },
  61: { desc: 'Pluie faible', icon: 'cloud-rain' },
  63: { desc: 'Pluie modérée', icon: 'cloud-rain' },
  65: { desc: 'Pluie forte', icon: 'cloud-rain' },
  80: { desc: 'Averses de pluie faibles', icon: 'cloud-lightning' },
  81: { desc: 'Averses de pluie modérées', icon: 'cloud-lightning' },
  82: { desc: 'Averses de pluie violentes', icon: 'cloud-lightning' },
  95: { desc: 'Orage faible ou modéré', icon: 'cloud-lightning' },
  96: { desc: 'Orage avec grêle légère', icon: 'cloud-lightning' },
};

/* ----------------------------------------------------
   Initialization
---------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initUIEvents();
  showToast('Bienvenue sur CycloTrek ! Cliquez sur la carte pour tracer votre premier parcours.', 'info', 5000);
});

// Initialize Leaflet Map
function initMap() {
  // Center on France
  state.map = L.map('map', {
    zoomControl: false, // Disabling to custom position
    center: [46.603354, 1.888334],
    zoom: 6,
    minZoom: 5
  });

  // Default layers
  tileLayers.sobre.addTo(state.map);
  tileLayers.cyclingOverlay.addTo(state.map);
  state.activeOverlayLayers['cycling'] = tileLayers.cyclingOverlay;

  // Custom position zoom control
  L.control.zoom({
    position: 'bottomright'
  }).addTo(state.map);

  // Map click handler (add waypoints)
  state.map.on('click', (e) => {
    // Prevent adding waypoint if clicking on markers/POIs
    if (e.originalEvent.target.closest('.leaflet-marker-icon')) return;
    addWaypointAtLatLng(e.latlng);
  });

  // Map move/zoom handlers for Overpass API POIs loading
  state.map.on('moveend', () => {
    if (state.showCampings || state.showWater) {
      debounceLoadPOIs();
    }
  });

  // Init icon render (for Lucide)
  lucide.createIcons();
}

// Initialize UI Events
function initUIEvents() {
  // Address search
  const searchInput = document.getElementById('address-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const searchResults = document.getElementById('search-results');

  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query.length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
      searchResults.classList.add('hidden');
    }

    clearTimeout(searchTimeout);
    if (query.length > 2) {
      searchTimeout = setTimeout(() => searchAddress(query), 400);
    }
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    searchResults.classList.add('hidden');
    searchInput.focus();
  });

  // Close search list on outer click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchResults.classList.add('hidden');
    }
  });

  // Toggles in top bar
  document.getElementById('toggle-campings-btn').addEventListener('click', (e) => {
    state.showCampings = !state.showCampings;
    e.currentTarget.classList.toggle('active', state.showCampings);
    togglePOICollection('camping', state.showCampings);
  });

  document.getElementById('toggle-water-btn').addEventListener('click', (e) => {
    state.showWater = !state.showWater;
    e.currentTarget.classList.toggle('active', state.showWater);
    togglePOICollection('water', state.showWater);
  });

  document.getElementById('toggle-ways-btn').addEventListener('click', (e) => {
    state.showWays = !state.showWays;
    e.currentTarget.classList.toggle('active', state.showWays);
    if (state.showWays) {
      tileLayers.cyclingOverlay.addTo(state.map);
      state.activeOverlayLayers['cycling'] = tileLayers.cyclingOverlay;
    } else {
      if (state.map.hasLayer(tileLayers.cyclingOverlay)) {
        state.map.removeLayer(tileLayers.cyclingOverlay);
      }
      delete state.activeOverlayLayers['cycling'];
    }
  });

  document.getElementById('map-style-btn').addEventListener('click', () => {
    const styles = ['sobre', 'relief', 'cyclosm'];
    let idx = styles.indexOf(state.mapStyle);
    idx = (idx + 1) % styles.length;
    const nextStyle = styles[idx];
    
    // Remove current
    state.map.removeLayer(tileLayers[state.mapStyle]);
    // Add next
    tileLayers[nextStyle].addTo(state.map);
    state.mapStyle = nextStyle;
    
    // Ensure overlays are in front
    if (state.showWays) {
      tileLayers.cyclingOverlay.bringToFront();
    }
    
    showToast(`Style de carte changé : ${nextStyle.toUpperCase()}`, 'info', 2000);
  });

  // Clear Route
  document.getElementById('clear-route-btn').addEventListener('click', clearRoute);

  // Garmin Sync Modal
  document.getElementById('garmin-guide-btn').addEventListener('click', () => {
    openLocalModal('modal-garmin');
  });

  // Export GPX
  document.getElementById('export-gpx-btn').addEventListener('click', exportGPX);

  // Info Modal
  document.getElementById('info-btn').addEventListener('click', () => {
    openLocalModal('modal-about');
  });

  // Close modals
  document.querySelectorAll('.close-modal-btn, [data-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Find parent modal
      const modalId = e.currentTarget.getAttribute('data-modal') || e.currentTarget.closest('.modal-overlay').id;
      closeLocalModal(modalId);
    });
  });

  // Setup Elevation Profile Interactive hover
  const svg = document.getElementById('elevation-svg');
  svg.addEventListener('mousemove', handleElevationHover);
  svg.addEventListener('mouseleave', handleElevationLeave);
  svg.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      handleElevationHover(e.touches[0]);
    }
  });
  svg.addEventListener('touchend', handleElevationLeave);
}

/* ----------------------------------------------------
   Waypoints Logic
---------------------------------------------------- */

// Add waypoint at lat/lng with address lookup
async function addWaypointAtLatLng(latlng) {
  const id = Date.now() + Math.random().toString(36).substring(2, 7);
  const index = state.waypoints.length + 1;
  
  // Custom pin icon with index number
  const isEnd = index > 1; // Mark as end pin if not first
  const pinIcon = L.divIcon({
    className: 'waypoint-pin',
    html: `<div class="waypoint-pin-container ${isEnd ? 'end' : ''}"><span>${index}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  // Create marker
  const marker = L.marker([latlng.lat, latlng.lng], {
    icon: pinIcon,
    draggable: true
  }).addTo(state.map);

  const waypoint = {
    id: id,
    lat: latlng.lat,
    lng: latlng.lng,
    name: `Étape ${index} (Chargement...)`,
    marker: marker
  };

  state.waypoints.push(waypoint);
  updateWaypointsUI();
  
  // Drag end listener
  marker.on('dragend', async (e) => {
    const newLatLng = marker.getLatLng();
    waypoint.lat = newLatLng.lat;
    waypoint.lng = newLatLng.lng;
    waypoint.name = `Étape réajustée (Chargement...)`;
    updateWaypointsUI();
    
    // Resolve address
    waypoint.name = await reverseGeocode(newLatLng.lat, newLatLng.lng);
    updateWaypointsUI();
    calculateRoutes();
  });

  // Click listener to select/focus
  marker.on('click', () => {
    state.map.panTo(marker.getLatLng());
  });

  // Reverse geocode to get nice name
  waypoint.name = await reverseGeocode(latlng.lat, latlng.lng);
  updateWaypointsUI();
  
  // Recalculate routes
  calculateRoutes();
}

// Reverse Geocode coordinates using Nominatim
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`;
    const res = await fetch(url, { headers: { 'User-Agent': 'CycloTrekFranceAgent' } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    
    // Extract town or village or road name
    const addr = data.address;
    const placeName = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.hamlet || addr.road || 'Lieu inconnu';
    const dept = addr.county ? ` (${addr.county.replace('département de ', '')})` : '';
    return `${placeName}${dept}`;
  } catch (err) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// Search Address via Nominatim
async function searchAddress(query) {
  const resultsDropdown = document.getElementById('search-results');
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=fr&limit=5`;
    const res = await fetch(url, { headers: { 'User-Agent': 'CycloTrekFranceAgent' } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    
    resultsDropdown.innerHTML = '';
    
    if (data.length === 0) {
      resultsDropdown.innerHTML = `<div class="search-result-item" style="cursor:default;color:var(--text-muted);">Aucun résultat trouvé en France</div>`;
      resultsDropdown.classList.remove('hidden');
      return;
    }

    data.forEach(item => {
      const el = document.createElement('div');
      el.className = 'search-result-item';
      el.innerHTML = `<i data-lucide="map-pin"></i> <span>${item.display_name}</span>`;
      el.addEventListener('click', () => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        state.map.setView([lat, lon], 12);
        resultsDropdown.classList.add('hidden');
        document.getElementById('address-input').value = '';
        document.getElementById('clear-search-btn').classList.add('hidden');
        addWaypointAtLatLng({ lat, lng: lon });
      });
      resultsDropdown.appendChild(el);
    });
    
    resultsDropdown.classList.remove('hidden');
    lucide.createIcons({ attrs: { class: 'search-result-item-icon' } });
  } catch (err) {
    resultsDropdown.innerHTML = `<div class="search-result-item" style="cursor:default;color:var(--danger);">Erreur lors de la recherche</div>`;
    resultsDropdown.classList.remove('hidden');
  }
}

// Delete waypoint by ID
function deleteWaypoint(id) {
  const idx = state.waypoints.findIndex(w => w.id === id);
  if (idx !== -1) {
    // Remove marker from map
    state.map.removeLayer(state.waypoints[idx].marker);
    state.waypoints.splice(idx, 1);
    
    // Rename and restructure indexes for pins
    state.waypoints.forEach((w, i) => {
      const index = i + 1;
      const isEnd = index > 1;
      const newIcon = L.divIcon({
        className: 'waypoint-pin',
        html: `<div class="waypoint-pin-container ${isEnd ? 'end' : ''}"><span>${index}</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });
      w.marker.setIcon(newIcon);
      if (w.name.startsWith('Étape') || w.name.includes('Lieu inconnu')) {
        w.name = w.name.replace(/Étape \d+/, `Étape ${index}`);
      }
    });

    updateWaypointsUI();
    calculateRoutes();
  }
}

// Clear all routes & waypoints
function clearRoute() {
  state.waypoints.forEach(w => state.map.removeLayer(w.marker));
  state.waypoints = [];
  
  clearRenderedRoutes();
  
  state.routes = {};
  state.activeRouteData = null;
  
  // Hide active sections
  document.getElementById('section-alternatives').classList.add('hidden');
  document.getElementById('section-elevation').classList.add('hidden');
  document.getElementById('section-weather').classList.add('hidden');
  document.getElementById('section-actions').classList.add('hidden');
  document.getElementById('clear-route-btn').classList.add('hidden');
  document.getElementById('add-waypoint-tip').classList.remove('hidden');
  
  updateWaypointsUI();
  showToast('Itinéraire réinitialisé.', 'success', 3000);
}

// Update UI list for waypoints
function updateWaypointsUI() {
  const container = document.getElementById('waypoints-list');
  const tip = document.getElementById('add-waypoint-tip');
  const clearBtn = document.getElementById('clear-route-btn');
  
  container.innerHTML = '';
  
  if (state.waypoints.length === 0) {
    tip.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    return;
  }
  
  tip.classList.add('hidden');
  clearBtn.classList.remove('hidden');
  
  state.waypoints.forEach((w, i) => {
    const item = document.createElement('div');
    item.className = 'waypoint-item';
    item.innerHTML = `
      <div class="waypoint-badge">${i + 1}</div>
      <div class="waypoint-info">
        <div class="waypoint-name" title="${w.name}">${w.name}</div>
      </div>
      <button class="btn-icon delete-wp-btn" data-id="${w.id}" title="Retirer ce point">
        <i data-lucide="trash"></i>
      </button>
    `;
    
    // Add delete action
    item.querySelector('.delete-wp-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWaypoint(w.id);
    });
    
    // Map center focus on click
    item.addEventListener('click', () => {
      state.map.panTo([w.lat, w.lng]);
    });
    
    container.appendChild(item);
  });
  
  lucide.createIcons();
}

/* ----------------------------------------------------
   BRouter Cycling Routing Engine Integration
---------------------------------------------------- */

// Clear routing graphics from Leaflet
function clearRenderedRoutes() {
  Object.keys(state.routes).forEach(profile => {
    if (state.routes[profile] && state.routes[profile].layer) {
      state.map.removeLayer(state.routes[profile].layer);
    }
  });
}

// Calculate routes using BRouter parallel API requests
async function calculateRoutes() {
  if (state.waypoints.length < 2) {
    clearRenderedRoutes();
    document.getElementById('section-alternatives').classList.add('hidden');
    document.getElementById('section-elevation').classList.add('hidden');
    document.getElementById('section-weather').classList.add('hidden');
    document.getElementById('section-actions').classList.add('hidden');
    return;
  }

  // Format lonlats list: lon1,lat1|lon2,lat2
  const lonlats = state.waypoints.map(w => `${w.lng.toFixed(6)},${w.lat.toFixed(6)}`).join('|');
  
  const profiles = [
    { key: 'trekking', name: 'Chemins (VTC)', color: '#2ecc71' },
    { key: 'fastbike', name: 'Route (Rapide)', color: '#3498db' },
    { key: 'safety', name: 'Sécurisé (Pistes)', color: '#e67e22' }
  ];

  clearRenderedRoutes();
  
  // Show loading state in alternatives
  const altSection = document.getElementById('section-alternatives');
  const altList = document.getElementById('alternatives-list');
  altSection.classList.remove('hidden');
  altList.innerHTML = `
    <div class="weather-loader">
      <div class="spinner"></div>
      <span>Calcul des tracés optimaux en cours...</span>
    </div>
  `;

  // Fetch profiles in parallel
  const fetches = profiles.map(p => {
    const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${p.key}&alternativeidx=0&format=geojson`;
    return fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch routing for ${p.key}`);
        return res.json();
      })
      .then(geojson => {
        return { profile: p.key, name: p.name, color: p.color, geojson: geojson };
      })
      .catch(err => {
        console.error(err);
        return { profile: p.key, name: p.name, color: p.color, error: true };
      });
  });

  const results = await Promise.all(fetches);
  altList.innerHTML = '';
  
  let validRoutesCount = 0;
  
  results.forEach(res => {
    if (res.error) {
      showToast(`Impossible de charger l'itinéraire ${res.name}`, 'error', 3000);
      return;
    }
    
    validRoutesCount++;
    
    // Parse track info
    const feature = res.geojson.features[0];
    const props = feature.properties;
    
    const distanceMeters = parseFloat(props['track-length'] || 0);
    const durationSeconds = parseFloat(props['total-time'] || 0);
    const ascent = Math.round(parseFloat(props['ascend'] || 0));
    const descent = Math.round(parseFloat(props['descend'] || 0));
    
    // Save in state
    state.routes[res.profile] = {
      geojson: res.geojson,
      distance: distanceMeters,
      duration: durationSeconds,
      ascent: ascent,
      descent: descent,
      color: res.color,
      name: res.name
    };
    
    // Draw on map
    renderRouteOnMap(res.profile);
  });
  
  if (validRoutesCount === 0) {
    altList.innerHTML = `<div class="add-waypoint-tip" style="border-color:var(--danger);color:var(--danger);"><i data-lucide="alert-triangle"></i> Aucun itinéraire n'a pu être calculé. Vérifiez vos points de passage.</div>`;
    lucide.createIcons();
    return;
  }

  // Set default active if current not in results
  if (!state.routes[state.activeProfile]) {
    state.activeProfile = Object.keys(state.routes)[0];
  }
  
  setActiveRoute(state.activeProfile);
  updateAlternativesUI();
}

// Render specific route layer on Leaflet map
function renderRouteOnMap(profile) {
  const route = state.routes[profile];
  if (!route) return;

  const isActive = profile === state.activeProfile;
  
  // Style config
  const style = {
    color: route.color,
    weight: isActive ? 6 : 4,
    opacity: isActive ? 0.9 : 0.45,
    dashArray: isActive ? null : '4, 8'
  };

  // Create layer
  route.layer = L.geoJSON(route.geojson, {
    style: style,
    onEachFeature: (feature, layer) => {
      // Click route to select it
      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setActiveRoute(profile);
      });
      // Mouse effects
      layer.on('mouseover', () => {
        if (state.activeProfile !== profile) {
          layer.setStyle({ opacity: 0.8, weight: 5 });
        }
      });
      layer.on('mouseout', () => {
        if (state.activeProfile !== profile) {
          layer.setStyle({ opacity: 0.45, weight: 4 });
        }
      });
    }
  }).addTo(state.map);

  // Bring active layer to front
  if (isActive) {
    route.layer.bringToFront();
  }
}

// Set active route profile
function setActiveRoute(profile) {
  if (!state.routes[profile]) return;

  state.activeProfile = profile;
  state.activeRouteData = state.routes[profile];

  // Refresh styles on map
  Object.keys(state.routes).forEach(p => {
    const route = state.routes[p];
    if (route && route.layer) {
      const isActive = p === state.activeProfile;
      route.layer.setStyle({
        weight: isActive ? 6 : 4,
        opacity: isActive ? 0.9 : 0.45,
        dashArray: isActive ? null : '4, 8'
      });
      if (isActive) {
        route.layer.bringToFront();
      }
    }
  });

  // Fit bounds on first calculation
  const activeLayer = state.routes[profile].layer;
  if (activeLayer) {
    state.map.fitBounds(activeLayer.getBounds(), { padding: [50, 50] });
  }

  // Update Sidebar widgets
  updateAlternativesUI();
  updateTrekSummaryUI();
  drawElevationProfile();
  loadLiveWeather();
}

// Update the Alternatives comparison UI
function updateAlternativesUI() {
  const altList = document.getElementById('alternatives-list');
  altList.innerHTML = '';

  Object.keys(state.routes).forEach(profile => {
    const route = state.routes[profile];
    const isActive = profile === state.activeProfile;
    
    const distKm = (route.distance / 1000).toFixed(1);
    const timeHrMin = formatDuration(route.duration);
    
    const card = document.createElement('div');
    card.className = `alternative-card ${isActive ? 'active' : ''}`;
    card.setAttribute('data-profile', profile);
    card.innerHTML = `
      <div class="alt-header">
        <span class="alt-name"><i data-lucide="bike" style="color:${route.color}"></i> ${route.name}</span>
        ${isActive ? '<span class="alt-badge">Sélectionné</span>' : ''}
      </div>
      <div class="alt-details">
        <span class="alt-primary-metric">${timeHrMin}</span>
        <div class="alt-detail-item">
          <i data-lucide="milestone"></i>
          <span>${distKm} km</span>
        </div>
        <div class="alt-detail-item">
          <i data-lucide="trending-up"></i>
          <span style="color:var(--danger)">+${route.ascent}m</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      setActiveRoute(profile);
    });

    altList.appendChild(card);
  });

  lucide.createIcons();
}

// Update overall trek stats and steps summary
function updateTrekSummaryUI() {
  const route = state.activeRouteData;
  if (!route) return;

  document.getElementById('section-actions').classList.remove('hidden');

  // Stats
  document.getElementById('summary-distance').innerText = `${(route.distance / 1000).toFixed(1)} km`;
  document.getElementById('summary-duration').innerText = formatDuration(route.duration);
  document.getElementById('summary-elevation-gain').innerText = `+${route.ascent}m`;
  document.getElementById('summary-elevation-loss').innerText = `-${route.descent}m`;

  // Draw stages timeline (waypoints)
  const timeline = document.getElementById('stages-timeline');
  timeline.innerHTML = '';

  // Get coords to calculate intermediate distances
  const coords = route.geojson.features[0].geometry.coordinates; // arrays of [lon, lat, ele]
  
  state.waypoints.forEach((w, i) => {
    const isStart = i === 0;
    const isEnd = i === state.waypoints.length - 1;
    
    let stageDistance = '';
    if (i > 0) {
      // Calculate distance along path to this waypoint
      // We can locate the waypoint coordinate in the path and get the cumulative distance
      const distSoFar = getWaypointCumulativeDistance(w, coords);
      stageDistance = `Cumul: ${distSoFar.toFixed(1)} km`;
    }

    const step = document.createElement('div');
    step.className = `stage-step ${isEnd ? 'step-end' : ''}`;
    step.innerHTML = `
      <div class="stage-info">
        <div class="stage-title">${isStart ? 'Départ : ' : isEnd ? 'Arrivée : ' : 'Étape : '}${w.name}</div>
        ${stageDistance ? `<div class="stage-distance">${stageDistance}</div>` : ''}
      </div>
    `;
    timeline.appendChild(step);
  });
}

// Helper to find cumulative distance of waypoint along the routing path coordinates
function getWaypointCumulativeDistance(waypoint, pathCoords) {
  // Find index of pathCoords closest to waypoint
  let minDistance = Infinity;
  let closestIndex = 0;
  
  for (let i = 0; i < pathCoords.length; i++) {
    const d = getDirectDistance(waypoint.lat, waypoint.lng, pathCoords[i][1], pathCoords[i][0]);
    if (d < minDistance) {
      minDistance = d;
      closestIndex = i;
    }
  }

  // Calculate cumulative distance up to closestIndex
  let totalD = 0;
  for (let i = 1; i <= closestIndex; i++) {
    totalD += getDirectDistance(pathCoords[i-1][1], pathCoords[i-1][0], pathCoords[i][1], pathCoords[i][0]);
  }
  
  return totalD;
}

/* ----------------------------------------------------
   Elevation Profile SVG Rendering
---------------------------------------------------- */

// Calculate details and draw elevation SVG
function drawElevationProfile() {
  const route = state.activeRouteData;
  if (!route) return;

  document.getElementById('section-elevation').classList.remove('hidden');

  const coords = route.geojson.features[0].geometry.coordinates;
  if (coords.length < 2) return;

  // Process coordinates to get cumulative distance list
  let cumulativeDist = 0;
  const data = [{ dist: 0, ele: coords[0][2] || 0, lat: coords[0][1], lng: coords[0][0] }];
  
  for (let i = 1; i < coords.length; i++) {
    const segmentD = getDirectDistance(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
    cumulativeDist += segmentD;
    data.push({
      dist: cumulativeDist,
      ele: coords[i][2] || 0,
      lat: coords[i][1],
      lng: coords[i][0]
    });
  }

  // Save parsed data to access on hover
  state.activeRouteData.parsedCoords = data;

  const totalDist = cumulativeDist;
  const elevations = data.map(d => d.ele);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  
  // Set labels
  document.getElementById('elevation-lbl-start').innerText = '0 km';
  document.getElementById('elevation-lbl-middle').innerText = `Alt: ${minEle}m - ${maxEle}m`;
  document.getElementById('elevation-lbl-end').innerText = `${totalDist.toFixed(1)} km`;
  document.getElementById('elevation-summary').innerText = `▲ +${route.ascent}m | ▼ -${route.descent}m`;

  // Draw SVG Path
  const svg = document.getElementById('elevation-svg');
  const width = 300;
  const height = 120;
  const paddingBottom = 15;
  const paddingTop = 10;
  const chartHeight = height - paddingBottom - paddingTop;

  // Map coordinate to SVG coordinate space
  const getX = (dist) => (dist / totalDist) * width;
  const getY = (ele) => {
    const range = (maxEle - minEle) || 1;
    return height - paddingBottom - ((ele - minEle) / range) * chartHeight;
  };

  // Generate SVG paths
  let pathStr = `M ${getX(data[0].dist)} ${getY(data[0].ele)}`;
  let areaStr = `M ${getX(data[0].dist)} ${height - paddingBottom} L ${getX(data[0].dist)} ${getY(data[0].ele)}`;

  for (let i = 1; i < data.length; i++) {
    const x = getX(data[i].dist);
    const y = getY(data[i].ele);
    pathStr += ` L ${x} ${y}`;
    areaStr += ` L ${x} ${y}`;
  }

  areaStr += ` L ${getX(data[data.length - 1].dist)} ${height - paddingBottom} Z`;

  // Draw inside SVG
  svg.innerHTML = `
    <!-- Gradient definition -->
    <defs>
      <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.35" />
        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.0" />
      </linearGradient>
    </defs>
    <!-- Filled area -->
    <path d="${areaStr}" fill="url(#elevationGrad)" />
    <!-- Top outline line -->
    <path d="${pathStr}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Dynamic Cursor components (invisible initially) -->
    <line id="ele-guide-line" x1="0" y1="${paddingTop}" x2="0" y2="${height - paddingBottom}" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="3, 3" class="hidden" />
    <circle id="ele-guide-circle" r="5" fill="var(--primary)" stroke="#ffffff" stroke-width="2" class="hidden" />
  `;
}

// Elevation hover sync with map
function handleElevationHover(e) {
  const route = state.activeRouteData;
  if (!route || !route.parsedCoords) return;

  const svg = document.getElementById('elevation-svg');
  const rect = svg.getBoundingClientRect();
  
  // Calculate relative X coordinate in range [0, 300]
  const clientX = e.clientX - rect.left;
  const svgX = (clientX / rect.width) * 300;

  if (svgX < 0 || svgX > 300) {
    handleElevationLeave();
    return;
  }

  // Map to target distance along the track
  const data = route.parsedCoords;
  const totalDist = data[data.length - 1].dist;
  const targetDist = (svgX / 300) * totalDist;

  // Binary search to find closest point
  let low = 0;
  let high = data.length - 1;
  let closestIdx = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (Math.abs(data[mid].dist - targetDist) < Math.abs(data[closestIdx].dist - targetDist)) {
      closestIdx = mid;
    }
    if (data[mid].dist < targetDist) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const point = data[closestIdx];

  // Update SVG Guide components
  const svg = document.getElementById('elevation-svg');
  const width = 300;
  const height = 120;
  const paddingBottom = 15;
  const paddingTop = 10;
  const chartHeight = height - paddingBottom - paddingTop;
  
  const elevations = data.map(d => d.ele);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);

  const getX = (dist) => (dist / totalDist) * width;
  const getY = (ele) => {
    const range = (maxEle - minEle) || 1;
    return height - paddingBottom - ((ele - minEle) / range) * chartHeight;
  };

  const xCoord = getX(point.dist);
  const yCoord = getY(point.ele);

  const guideLine = document.getElementById('ele-guide-line');
  const guideCircle = document.getElementById('ele-guide-circle');
  const tooltip = document.getElementById('elevation-chart-tooltip');

  if (guideLine && guideCircle) {
    guideLine.setAttribute('x1', xCoord);
    guideLine.setAttribute('x2', xCoord);
    guideLine.classList.remove('hidden');

    guideCircle.setAttribute('cx', xCoord);
    guideCircle.setAttribute('cy', yCoord);
    guideCircle.classList.remove('hidden');
  }

  // Update Tooltip
  tooltip.innerText = `${point.dist.toFixed(1)} km • Alt: ${Math.round(point.ele)}m`;
  tooltip.classList.remove('hidden');
  // Center tooltip over cursor
  const tooltipRect = tooltip.getBoundingClientRect();
  const leftPos = ((xCoord / 300) * rect.width);
  tooltip.style.left = `${leftPos}px`;

  // Draw pulsing cursor on map at coordinate
  if (state.hoverMapMarker) {
    state.hoverMapMarker.setLatLng([point.lat, point.lng]);
  } else {
    const hoverIcon = L.divIcon({
      className: 'hover-sync-marker',
      html: `<div style="width:16px;height:16px;background:var(--primary);border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px rgba(0,0,0,0.3);animation:pulse 1.2s infinite;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    state.hoverMapMarker = L.marker([point.lat, point.lng], { icon: hoverIcon }).addTo(state.map);
  }
}

// Hide interactive cursors when leaving elevation chart area
function handleElevationLeave() {
  const guideLine = document.getElementById('ele-guide-line');
  const guideCircle = document.getElementById('ele-guide-circle');
  const tooltip = document.getElementById('elevation-chart-tooltip');

  if (guideLine) guideLine.classList.add('hidden');
  if (guideCircle) guideCircle.classList.add('hidden');
  if (tooltip) tooltip.classList.add('hidden');

  if (state.hoverMapMarker) {
    state.map.removeLayer(state.hoverMapMarker);
    state.hoverMapMarker = null;
  }
}

/* ----------------------------------------------------
   Live Weather (Open-Meteo)
---------------------------------------------------- */

// Fetch weather for start, mid, and end waypoints
async function loadLiveWeather() {
  if (state.waypoints.length < 2 || !state.activeRouteData) return;

  const weatherWidget = document.getElementById('weather-widget');
  const weatherContent = document.getElementById('weather-content');
  
  document.getElementById('section-weather').classList.remove('hidden');
  weatherWidget.innerHTML = `
    <div class="weather-loader">
      <div class="spinner"></div>
      <span>Récupération des prévisions météo...</span>
    </div>
  `;

  // Select points to load weather (Start, Middle, End)
  const steps = [];
  steps.push({ label: 'Départ', name: state.waypoints[0].name, lat: state.waypoints[0].lat, lng: state.waypoints[0].lng });
  
  if (state.waypoints.length > 2) {
    // Pick real middle waypoint
    const midIdx = Math.floor(state.waypoints.length / 2);
    steps.push({ label: 'Mi-parcours', name: state.waypoints[midIdx].name, lat: state.waypoints[midIdx].lat, lng: state.waypoints[midIdx].lng });
  } else {
    // Interpolate center from route geometry coords
    const coords = state.activeRouteData.geojson.features[0].geometry.coordinates;
    const midCoord = coords[Math.floor(coords.length / 2)];
    steps.push({ label: 'Milieu', name: 'Mi-parcours', lat: midCoord[1], lng: midCoord[0] });
  }

  steps.push({ label: 'Arrivée', name: state.waypoints[state.waypoints.length - 1].name, lat: state.waypoints[state.waypoints.length - 1].lat, lng: state.waypoints[state.waypoints.length - 1].lng });

  try {
    const promises = steps.map(s => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lng}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;
      return fetch(url)
        .then(res => {
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then(data => {
          return { step: s, weather: data.current };
        })
        .catch(err => {
          return { step: s, error: true };
        });
    });

    const results = await Promise.all(promises);
    
    // Clear and build cards
    weatherWidget.innerHTML = `<div class="weather-content" id="weather-content"></div>`;
    const container = document.getElementById('weather-content');

    results.forEach(res => {
      if (res.error) return;

      const w = res.weather;
      const wDetails = weatherCodes[w.weather_code] || { desc: 'Météo variable', icon: 'cloud-sun' };
      
      const card = document.createElement('div');
      card.className = 'weather-card';
      card.innerHTML = `
        <span class="weather-card-title" title="${res.step.name}">${res.step.label}</span>
        <i data-lucide="${wDetails.icon}" class="weather-icon"></i>
        <span class="weather-temp">${Math.round(w.temperature_2m)}°C</span>
        <span class="weather-desc">${wDetails.desc}</span>
        <span class="weather-wind">
          <i data-lucide="wind" style="width:10px;height:10px;"></i>
          ${Math.round(w.wind_speed_10m)} km/h
        </span>
      `;
      container.appendChild(card);
    });

    lucide.createIcons();

  } catch (err) {
    weatherWidget.innerHTML = `<span style="font-size:12px;color:var(--danger);text-align:center;width:100%;">Échec du chargement de la météo.</span>`;
  }
}

/* ----------------------------------------------------
   Campsites & Water points (Overpass API)
---------------------------------------------------- */

// Debounce wrapper for loading POIs to prevent Overpass spamming
function debounceLoadPOIs() {
  clearTimeout(state.overpassTimeout);
  state.overpassTimeout = setTimeout(loadPOIsFromOverpass, 450);
}

// Toggle layer view of Campsites / Water Points
function togglePOICollection(type, isVisible) {
  if (isVisible) {
    debounceLoadPOIs();
  } else {
    // Clear specific markers
    clearPOIMarkers(type);
  }
}

// Remove POI markers from map based on category
function clearPOIMarkers(type) {
  const remaining = [];
  state.poiMarkers.forEach(m => {
    if (m.type === type) {
      state.map.removeLayer(m.marker);
    } else {
      remaining.push(m);
    }
  });
  state.poiMarkers = remaining;
}

// Query Overpass API for campsites & water points in active bounding box
async function loadPOIsFromOverpass() {
  const zoom = state.map.getZoom();
  
  // Enforce Zoom Level to prevent large downloads
  if (zoom < 12) {
    if (state.showCampings || state.showWater) {
      showToast('Zoomez sur la carte pour afficher les campings et points d'eau.', 'warning', 3500);
    }
    return;
  }

  // Get bounding box
  const bounds = state.map.getBounds();
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  
  // Skip if same viewport bounds
  if (state.lastOverpassBbox === bbox) return;
  state.lastOverpassBbox = bbox;

  // Build Query
  let query = '[out:json][timeout:15];(';
  if (state.showCampings) {
    query += `node["tourism"="camp_site"](${bbox});`;
  }
  if (state.showWater) {
    query += `node["amenity"="drinking_water"](${bbox});`;
  }
  query += ');out body;';

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    
    // Clear loaded POIs first to avoid duplicates
    if (state.showCampings) clearPOIMarkers('camping');
    if (state.showWater) clearPOIMarkers('water');

    data.elements.forEach(el => {
      const isCamp = el.tags.tourism === 'camp_site';
      const type = isCamp ? 'camping' : 'water';
      
      const pinMarkup = isCamp ? svgIcons.camp : svgIcons.water;
      const customIcon = L.divIcon({
        className: 'custom-marker-poi',
        html: pinMarkup,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([el.lat, el.lon], { icon: customIcon }).addTo(state.map);

      // Save tags and details on click
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openPOIDetailModal(el, type);
      });

      state.poiMarkers.push({
        id: el.id,
        type: type,
        marker: marker,
        data: el
      });
    });

    // Re-trigger lucide icons rendering inside map layer
    lucide.createIcons();

  } catch (err) {
    console.error('Overpass error', err);
    showToast('Erreur lors de la récupération des campings et points d\'eau.', 'error', 3000);
  }
}

// Open POI details modal
function openPOIDetailModal(element, type) {
  const modal = document.getElementById('modal-poi');
  const title = document.getElementById('poi-title');
  const body = document.getElementById('poi-body');
  const addBtn = document.getElementById('poi-add-waypoint-btn');

  const tags = element.tags;
  const isCamp = type === 'camping';

  // Customize header
  title.innerHTML = isCamp 
    ? `<i data-lucide="tent" class="color-primary"></i> ${tags.name || 'Camping sans nom'}`
    : `<i data-lucide="droplet" style="color:var(--secondary)"></i> Point d'eau Potable`;

  // Customize body
  let bodyHTML = `
    <span class="poi-tag ${isCamp ? '' : 'water'}">${isCamp ? 'Camping' : 'Eau Potable'}</span>
  `;

  if (isCamp) {
    bodyHTML += `
      <p><strong>Nom :</strong> ${tags.name || 'Non spécifié'}</p>
      <div class="poi-meta">
        <div class="poi-meta-row"><div class="poi-meta-label">Opérateur :</div><div class="poi-meta-value">${tags.operator || 'Inconnu'}</div></div>
        <div class="poi-meta-row"><div class="poi-meta-label">Téléphone :</div><div class="poi-meta-value">${tags.phone || 'Non répertorié'}</div></div>
        <div class="poi-meta-row"><div class="poi-meta-label">Site Web :</div><div class="poi-meta-value">${tags.website ? `<a href="${tags.website}" target="_blank">${tags.website}</a>` : 'Aucun site enregistré'}</div></div>
        <div class="poi-meta-row"><div class="poi-meta-label">Description :</div><div class="poi-meta-value">${tags.description || 'Aucune description disponible'}</div></div>
      </div>
    `;
  } else {
    bodyHTML += `
      <p>Un point d'accès public et gratuit à de l'eau potable.</p>
      <div class="poi-meta">
        <div class="poi-meta-row"><div class="poi-meta-label">Emplacement :</div><div class="poi-meta-value">${tags.description || 'Sur la voie publique'}</div></div>
        <div class="poi-meta-row"><div class="poi-meta-label">Potabilité :</div><div class="poi-meta-value">${tags.drinking_water === 'yes' ? 'Oui (Confirmé)' : 'Oui'}</div></div>
      </div>
    `;
  }

  body.innerHTML = bodyHTML;
  
  // Set up Add waypoint action
  // Remove previous listener to avoid stack
  const newAddBtn = addBtn.cloneNode(true);
  addBtn.replaceWith(newAddBtn);
  
  newAddBtn.addEventListener('click', () => {
    closeLocalModal('modal-poi');
    const pointName = isCamp ? (tags.name || 'Camping') : 'Point d\'eau';
    addWaypointAtLatLng({ lat: element.lat, lng: element.lon });
    showToast(`${pointName} ajouté comme point de passage.`, 'success', 3000);
  });

  openLocalModal('modal-poi');
  lucide.createIcons();
}

/* ----------------------------------------------------
   Garmin GPX 1.1 Export Engine
---------------------------------------------------- */

// Export active path to GPX 1.1 with elevation
function exportGPX() {
  const route = state.activeRouteData;
  if (!route) {
    showToast('Veuillez d\'abord tracer un itinéraire pour pouvoir l\'exporter.', 'warning', 3000);
    return;
  }

  const coords = route.geojson.features[0].geometry.coordinates; // [lon, lat, ele]
  const trekName = `CycloTrek_${state.activeProfile}_${Math.round(route.distance/1000)}km`;
  const timeString = new Date().toISOString();

  // Create XML markup
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CycloTrek France" 
  xmlns="http://www.topografix.com/GPX/1/1" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${trekName}</name>
    <desc>Itinéraire vélo généré par CycloTrek France (${route.name})</desc>
    <time>${timeString}</time>
  </metadata>
  <trk>
    <name>${trekName}</name>
    <desc>Type d'itinéraire : ${route.name}</desc>
    <trkseg>`;

  coords.forEach(pt => {
    const lon = pt[0].toFixed(6);
    const lat = pt[1].toFixed(6);
    const ele = pt[2] ? `<ele>${pt[2].toFixed(1)}</ele>` : '';
    gpx += `
      <trkpt lat="${lat}" lon="${lon}">${ele}</trkpt>`;
  });

  gpx += `
    </trkseg>
  </trk>
</gpx>`;

  // Trigger download
  try {
    const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trekName}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('GPX exporté avec succès ! Prêt pour transfert Garmin.', 'success', 4000);
    
    // Open instructions modal automatically to help the user
    setTimeout(() => {
      openLocalModal('modal-garmin');
    }, 1200);

  } catch (err) {
    showToast('Erreur lors de la génération du fichier GPX.', 'error', 3000);
  }
}

/* ----------------------------------------------------
   UI Modals & Toast Alerts System
---------------------------------------------------- */

// Open local Modal window
function openLocalModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    // Accessibility focus or overlay animation trigger
  }
}

// Close local Modal window
function closeLocalModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Show Toast alert card
function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-octagon';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'info') iconName = 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Trigger animation next frame
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Remove element after duration
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, duration);
}

/* ----------------------------------------------------
   Mathematical Helpers
---------------------------------------------------- */

// Haversine formula to compute direct distance between two coordinates in km
function getDirectDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth Radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Format duration from seconds to human text: 2h35
function formatDuration(sec) {
  const hr = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (hr > 0) {
    return `${hr}h${min.toString().padStart(2, '0')}`;
  }
  return `${min} min`;
}
