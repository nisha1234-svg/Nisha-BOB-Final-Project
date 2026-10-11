/* ============================================================
   AquaGuard AI – Satellite Water Pollution Explorer
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ---- Map setup ----
  const map = L.map('satelliteMap').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Satellite imagery tile layer option (Esri World Imagery, free)
  const esriSat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' }
  );
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });
  L.control.layers(
    { 'OpenStreetMap': osm, 'Satellite (Esri)': esriSat },
    {},
    { position: 'topright' }
  ).addTo(map);

  let marker = null;

  function setMarker(lat, lng) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', function () {
        const pos = marker.getLatLng();
        updateCoordDisplay(pos.lat, pos.lng);
      });
    }
    updateCoordDisplay(lat, lng);
  }

  map.on('click', function (e) {
    setMarker(e.latlng.lat, e.latlng.lng);
  });

  function updateCoordDisplay(lat, lng) {
    document.getElementById('coordDisplay').classList.remove('d-none');
    document.getElementById('coordText').textContent =
      `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
  }

  // Set today as default date
  const today = new Date().toISOString().split('T')[0];
  const datePicker = document.getElementById('imageDate');
  datePicker.max = today;
  datePicker.value = today;

  // ---- Geocoding / search ----
  const searchBtn  = document.getElementById('searchBtn');
  const searchInput = document.getElementById('locationSearch');
  const geocodeResults = document.getElementById('geocodeResults');

  let geocodeDebounce = null;

  searchBtn.addEventListener('click', () => doGeocode(searchInput.value));
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doGeocode(searchInput.value); }
  });

  function doGeocode(query) {
    query = query.trim();
    if (!query) return;
    geocodeResults.innerHTML = '<div class="list-group-item text-muted small"><span class="spinner-border spinner-border-sm me-2"></span>Searching…</div>';

    fetch(`/api/satellite/geocode?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          geocodeResults.innerHTML = `<div class="list-group-item small text-danger"><i class="bi bi-exclamation-circle me-1"></i>${data.error}</div>`;
          return;
        }
        if (!data.results || !data.results.length) {
          geocodeResults.innerHTML = '<div class="list-group-item small text-muted">No results found.</div>';
          return;
        }
        geocodeResults.innerHTML = data.results.map((r, i) => `
          <button type="button" class="list-group-item list-group-item-action geocode-result-item small py-2"
            data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHtml(r.display_name)}">
            <i class="bi bi-geo-alt-fill text-aq-teal me-1"></i>
            ${escapeHtml(r.display_name.length > 80 ? r.display_name.slice(0, 80) + '…' : r.display_name)}
          </button>
        `).join('');
        geocodeResults.querySelectorAll('.geocode-result-item').forEach(btn => {
          btn.addEventListener('click', function () {
            const lat = parseFloat(this.dataset.lat);
            const lon = parseFloat(this.dataset.lon);
            const name = this.dataset.name;
            map.setView([lat, lon], 11);
            setMarker(lat, lon);
            document.getElementById('satLocationName').value = name.split(',')[0].trim();
            geocodeResults.innerHTML = '';
          });
        });
      })
      .catch(err => {
        geocodeResults.innerHTML = `<div class="list-group-item small text-danger"><i class="bi bi-x-circle me-1"></i>Network error: ${err.message}</div>`;
      });
  }

  // ---- Upload drop zone ----
  const satDropZone   = document.getElementById('satDropZone');
  const satImageInput = document.getElementById('satImageInput');
  const satPreviewWrap= document.getElementById('satPreviewWrap');
  const satPreview    = document.getElementById('satImagePreview');
  const satClearBtn   = document.getElementById('satClearBtn');

  satDropZone.addEventListener('click', () => satImageInput.click());
  satDropZone.addEventListener('dragover', e => { e.preventDefault(); satDropZone.classList.add('drag-over'); });
  satDropZone.addEventListener('dragleave', () => satDropZone.classList.remove('drag-over'));
  satDropZone.addEventListener('drop', e => {
    e.preventDefault();
    satDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) setSatImage(file);
  });
  satImageInput.addEventListener('change', () => {
    if (satImageInput.files[0]) setSatImage(satImageInput.files[0]);
  });
  satClearBtn.addEventListener('click', () => {
    satImageInput.value = '';
    satPreviewWrap.classList.add('d-none');
    satDropZone.style.display = '';
  });

  function setSatImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
      satPreview.src = e.target.result;
      satPreviewWrap.classList.remove('d-none');
      satDropZone.style.display = 'none';
    };
    reader.readAsDataURL(file);
    const dt = new DataTransfer();
    dt.items.add(file);
    satImageInput.files = dt.files;
  }

  // ---- Demo sample grid ----
  const satSampleGrid = document.getElementById('satSampleGrid');
  const satDemoKey    = document.getElementById('satDemoKey');

  fetch('/api/demo/samples')
    .then(r => r.json())
    .then(samples => {
      if (!samples.length) {
        satSampleGrid.innerHTML = '<div class="col-12 text-muted small">No samples found.</div>';
        return;
      }
      satSampleGrid.innerHTML = samples.map(s => `
        <div class="col-4">
          <div class="aq-sample-card" data-key="${s.key}" data-name="${s.name}">
            <img src="${s.url}" alt="${s.name}" />
            <div class="p-1 text-center small text-truncate">${s.name}</div>
          </div>
        </div>
      `).join('');

      const first = satSampleGrid.querySelector('.aq-sample-card');
      if (first) {
        first.classList.add('selected');
        satDemoKey.value = first.dataset.key;
      }

      satSampleGrid.addEventListener('click', function (e) {
        const card = e.target.closest('.aq-sample-card');
        if (!card) return;
        satSampleGrid.querySelectorAll('.aq-sample-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        satDemoKey.value = card.dataset.key;
      });
    })
    .catch(() => {
      satSampleGrid.innerHTML = '<div class="col-12 text-muted small">Could not load samples.</div>';
    });

  // ---- Analyse button ----
  const analyzeBtn = document.getElementById('satAnalyzeBtn');
  const progressDiv = document.getElementById('satProgress');
  const placeholder = document.getElementById('satResultsPlaceholder');
  const resultsPanel = document.getElementById('satResultsPanel');

  analyzeBtn.addEventListener('click', function () {
    const locationName = document.getElementById('satLocationName').value.trim()
      || 'Unknown Location';
    const waterType = document.getElementById('waterType').value;
    const imageDate = datePicker.value;

    // Determine if using upload tab or demo tab
    const activeTab = document.querySelector('#imageSourceTab .nav-link.active');
    const isDemo = activeTab && activeTab.textContent.includes('Demo');

    const formData = new FormData();
    formData.append('location', locationName);
    formData.append('water_type', waterType);
    if (imageDate) formData.append('image_date', imageDate);

    // Coordinates from marker
    if (marker) {
      const pos = marker.getLatLng();
      formData.append('latitude', pos.lat.toFixed(6));
      formData.append('longitude', pos.lng.toFixed(6));
    }

    if (isDemo) {
      const demoKey = satDemoKey.value;
      if (!demoKey) {
        showAlert('Please select a demo sample image first.', 'warning');
        return;
      }
      formData.append('demo_sample', demoKey);
    } else {
      if (!satImageInput.files[0]) {
        showAlert('Please upload an image or switch to Demo Mode.', 'warning');
        return;
      }
      formData.append('image', satImageInput.files[0]);
    }

    // Show progress
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analysing…';
    progressDiv.classList.remove('d-none');
    placeholder.classList.add('d-none');
    resultsPanel.classList.add('d-none');

    fetch('/api/satellite/analyze', {
      method: 'POST',
      body: formData,
    })
    .then(r => r.json())
    .then(data => {
      progressDiv.classList.add('d-none');
      if (data.error) {
        showAlert(`<i class="bi bi-x-circle me-2"></i>${data.error}`);
        placeholder.classList.remove('d-none');
        return;
      }
      renderSatResults(data.analysis);
    })
    .catch(err => {
      progressDiv.classList.add('d-none');
      showAlert(`<i class="bi bi-x-circle me-2"></i>Network error: ${err.message}`);
      placeholder.classList.remove('d-none');
    })
    .finally(() => {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = '<i class="bi bi-cpu me-2"></i>Analyse Image';
    });
  });

  // ---- Render results ----
  function renderSatResults(a) {
    resultsPanel.classList.remove('d-none');
    placeholder.classList.add('d-none');
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Score ring
    const ring = document.getElementById('satScoreRing');
    ring.className = `sat-score-ring ring-${riskClass(a.risk_level)}`;
    document.getElementById('satScoreNum').textContent = a.risk_score;

    // Risk label
    const iconMap = {
      Low:    'bi-check-circle-fill',
      Medium: 'bi-exclamation-circle-fill',
      High:   'bi-exclamation-triangle-fill'
    };
    document.getElementById('satRiskLabel').innerHTML =
      `<i class="bi ${iconMap[a.risk_level] || 'bi-circle'} me-2 text-${a.risk_level === 'High' ? 'danger' : a.risk_level === 'Medium' ? 'warning' : 'success'}"></i>${a.risk_level} Visual Risk`;

    document.getElementById('satLocationTag').textContent =
      `📍 ${a.location_name || 'Unknown'}`;
    document.getElementById('satDateTag').textContent =
      a.image_date ? `📅 ${a.image_date}` : '📅 No date set';
    document.getElementById('satConfidenceBadge').textContent =
      `Confidence: ${a.confidence}`;
    document.getElementById('satAnalyzedAt').textContent =
      a.analyzed_at ? `Analysed: ${formatDate(a.analyzed_at)}` : '';

    // Thumbnail
    if (a.image_url) {
      const thumb = document.getElementById('satThumbImg');
      thumb.src = a.image_url;
      thumb.classList.remove('d-none');
    }

    // Overlay image
    if (a.overlay_image_b64) {
      const img = document.getElementById('overlayImg');
      img.src = `data:image/png;base64,${a.overlay_image_b64}`;

      // Download button
      const dlBtn = document.getElementById('downloadOverlayBtn');
      dlBtn.onclick = function () {
        const link = document.createElement('a');
        link.download = `aquaguard_overlay_${(a.location_name || 'analysis').replace(/\s+/g, '_')}.png`;
        link.href = img.src;
        link.click();
      };
    }

    // Detected regions
    const regionsDiv = document.getElementById('detectedRegions');
    regionsDiv.innerHTML = '';
    if (a.detected_regions && a.detected_regions.length) {
      a.detected_regions.forEach(r => {
        const pill = document.createElement('span');
        pill.className = 'sat-region-pill';
        pill.innerHTML = `<span class="sat-region-dot" style="background:${r.color};"></span>${r.label}`;
        regionsDiv.appendChild(pill);
      });
    } else {
      regionsDiv.innerHTML = '<span class="text-muted small">No distinct suspicious regions detected.</span>';
    }

    // Score bars
    setSatBar('satColorBar',  'satColorVal',  a.color_score);
    setSatBar('satTurbBar',   'satTurbVal',   a.turbidity_score);
    setSatBar('satAlgaeBar',  'satAlgaeVal',  a.algae_score);
    setSatBar('satDarkBar',   'satDarkVal',   a.dark_patch_score);

    const compScore = document.getElementById('satCompositeScore');
    compScore.textContent = `${a.risk_score}/100`;
    compScore.style.color = riskColor(a.risk_level);

    // Satellite links
    const linksList = document.getElementById('satLinksList');
    linksList.innerHTML = '';
    if (a.satellite_links && a.satellite_links.length) {
      document.getElementById('satLinksCard').classList.remove('d-none');
      a.satellite_links.forEach(link => {
        const col = document.createElement('div');
        col.className = 'col-md-6';
        col.innerHTML = `
          <a href="${link.url}" target="_blank" rel="noopener noreferrer"
            class="sat-link-card text-decoration-none">
            <div class="d-flex align-items-start gap-2">
              <i class="bi ${link.icon || 'bi-link-45deg'} text-aq-teal mt-1 fs-5"></i>
              <div>
                <div class="fw-semibold small">${link.name}
                  <span class="sat-auth-badge badge ms-1 ${link.requires_auth ? 'bg-warning text-dark' : 'bg-success'}">
                    ${link.requires_auth ? 'Login required' : 'No login'}
                  </span>
                </div>
                <div class="text-muted" style="font-size:.75rem;">${link.description}</div>
              </div>
            </div>
          </a>
        `;
        linksList.appendChild(col);
      });
    } else {
      document.getElementById('satLinksCard').classList.add('d-none');
    }

    // Interpretation
    document.getElementById('satExplanation').textContent = a.explanation || '';
    document.getElementById('satSourceNote').textContent = a.source_note || '';

    const recList = document.getElementById('satRecommendations');
    recList.innerHTML = '';
    if (a.recommendations) {
      a.recommendations.forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        recList.appendChild(li);
      });
    }

    // Dominant colours
    const swatches = document.getElementById('satColorSwatches');
    swatches.innerHTML = '';
    if (a.dominant_colors) {
      a.dominant_colors.forEach(c => {
        const div = document.createElement('div');
        div.className = 'text-center small';
        div.innerHTML = `
          <div class="aq-swatch-box" style="background:${c.hex};"
            title="RGB(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})"></div>
          <div class="mt-1">${c.percent}%</div>
          <div class="text-muted" style="font-size:.7rem;">${c.hex}</div>
        `;
        swatches.appendChild(div);
      });
    }

    // Disclaimer
    document.getElementById('satDisclaimer').textContent = a.disclaimer || '';

    // Report link
    if (a.id) {
      document.getElementById('satViewReportBtn').href = `/satellite/report/${a.id}`;
    }

    // Update map marker if coordinates returned
    if (a.latitude && a.longitude) {
      setMarker(a.latitude, a.longitude);
      map.setView([a.latitude, a.longitude], 10);
    }

    // Refresh history
    loadHistory();
  }

  function setSatBar(barId, valId, score) {
    setTimeout(() => {
      document.getElementById(barId).style.width = score + '%';
    }, 50);
    document.getElementById(valId).textContent = `${score}/100`;
  }

  // ---- Load history ----
  function loadHistory() {
    fetch('/api/satellite/analyses?limit=20')
      .then(r => r.json())
      .then(renderHistory)
      .catch(err => {
        document.getElementById('satHistoryBody').innerHTML =
          `<tr><td colspan="7" class="text-center text-muted small py-3">Error loading history.</td></tr>`;
      });
  }

  function renderHistory(analyses) {
    const tbody = document.getElementById('satHistoryBody');
    if (!analyses.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3 small">No satellite analyses yet.</td></tr>';
      return;
    }
    tbody.innerHTML = analyses.map(a => {
      const regions = (a.detected_regions || []).length;
      return `
        <tr>
          <td class="small">${a.location_name || '—'}</td>
          <td class="small">${waterTypeLabel(a.water_type)}</td>
          <td>${riskPill(a.risk_level)}</td>
          <td class="small"><strong>${a.risk_score}</strong>/100</td>
          <td class="small">${a.image_date || formatDate(a.analyzed_at)}</td>
          <td class="small">${regions > 0 ? `<span class="badge bg-warning text-dark">${regions}</span>` : '<span class="badge bg-success">0</span>'}</td>
          <td>
            <a href="/satellite/report/${a.id}" class="btn btn-sm aq-btn-secondary py-0">Report</a>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Load history on page load
  loadHistory();

  // Refresh button
  document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);

  // ---- Helpers ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

});
