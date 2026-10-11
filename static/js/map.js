/* ============================================================
   AquaGuard AI – Map Page (v2: click-to-analyse + river rankings)
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ──────────────────────────────────────────────
     1. MAP INITIALISATION
  ────────────────────────────────────────────── */
  const map = L.map('pollutionMap').setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // ── User-analysis markers ──
  fetch('/api/map/points')
    .then(r => r.json())
    .then(points => {
      document.getElementById('mapPointCount').textContent =
        `${points.length} user analysis location(s) plotted`;

      if (!points.length) {
        L.popup()
          .setLatLng([20, 0])
          .setContent(
            '<div style="text-align:center;padding:.5rem;">' +
            '<strong>No geo-tagged user analyses yet.</strong><br>' +
            '<small>Add latitude &amp; longitude when submitting an analysis.</small></div>'
          )
          .openOn(map);
        return;
      }

      const colorMap = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' };

      points.forEach(p => {
        if (p.latitude == null || p.longitude == null) return;
        const color = colorMap[p.risk_level] || '#3b82d4';
        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius: 10, color, fillColor: color, fillOpacity: 0.75, weight: 2,
        }).addTo(map);

        marker.bindPopup(`
          <div style="min-width:180px;">
            <strong>${p.location_name || 'Unknown Location'}</strong><br>
            <span style="font-size:0.85rem;">
              Type: ${waterTypeLabel(p.water_type)}<br>
              Risk: <b style="color:${color}">${p.risk_level}</b>
              &nbsp;(${p.risk_score}/100)<br>
              Date: ${formatDate(p.analyzed_at)}<br>
              <a href="/report/${p.id}" style="color:#0ea5a0;">View Report &rarr;</a>
            </span>
          </div>
        `);
        marker.on('mouseover', function () { this.openPopup(); });
      });

      const bounds = points
        .filter(p => p.latitude != null && p.longitude != null)
        .map(p => [p.latitude, p.longitude]);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
      else if (bounds.length === 1) map.setView(bounds[0], 8);
    })
    .catch(err => console.error('Map points error:', err));

  /* ──────────────────────────────────────────────
     2. MAP CLICK → ANALYSE WATER BODY
  ────────────────────────────────────────────── */
  let clickMarker = null;

  map.on('click', function (e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    // Remove previous click marker
    if (clickMarker) map.removeLayer(clickMarker);
    clickMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#0db0a8;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',
        iconAnchor: [9, 9],
      })
    }).addTo(map);

    // Show panel in loading state
    const panel = document.getElementById('mapClickInfo');
    panel.style.display = 'block';
    document.getElementById('clickAnalysisLoading').style.display = 'block';
    document.getElementById('clickAnalysisResult').style.display = 'none';
    document.getElementById('clickLocationName').textContent =
      `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    // Scroll panel into view
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Determine water type hint from zoom level / rough heuristic
    const waterType = guessWaterType(lat, lon);

    fetch('/api/map/click-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, water_type: waterType, location_name: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          showClickError(data.error);
          return;
        }
        renderClickAnalysis(data);
      })
      .catch(err => {
        console.error('Click-analyse error:', err);
        showClickError('Analysis request failed. Please check your connection.');
      });
  });

  document.getElementById('closeClickPanel').addEventListener('click', function () {
    document.getElementById('mapClickInfo').style.display = 'none';
    if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; }
  });

  function showClickError(msg) {
    document.getElementById('clickAnalysisLoading').style.display = 'none';
    document.getElementById('clickAnalysisResult').style.display = 'block';
    document.getElementById('clickDisclaimer').textContent = '⚠️ ' + msg;
  }

  function renderClickAnalysis(data) {
    const a = data.analysis;
    const hr = data.health_risks;

    document.getElementById('clickAnalysisLoading').style.display = 'none';
    document.getElementById('clickAnalysisResult').style.display = 'block';

    // Disclaimer
    document.getElementById('clickDisclaimer').textContent = data.disclaimer || '';

    // Sample image
    const imgEl = document.getElementById('clickSampleImg');
    imgEl.src = a.image_url || '';
    imgEl.alt = `Representative ${a.water_type || 'water'} sample image`;

    // Overlay
    const overlayEl = document.getElementById('clickOverlayImg');
    if (a.overlay_image_b64) {
      overlayEl.src = 'data:image/png;base64,' + a.overlay_image_b64;
      overlayEl.style.display = 'block';
      overlayEl.previousElementSibling.style.display = 'block';
    } else {
      overlayEl.style.display = 'none';
      overlayEl.previousElementSibling.style.display = 'none';
    }

    // Risk badge
    const riskClass = { Low: 'aq-risk-low', Medium: 'aq-risk-medium', High: 'aq-risk-high' };
    const riskIcon  = { Low: 'bi-check-circle-fill', Medium: 'bi-exclamation-circle-fill', High: 'bi-x-circle-fill' };
    const badge = document.getElementById('clickRiskBadge');
    badge.className = 'aq-risk-badge-lg ' + (riskClass[a.risk_level] || 'aq-risk-medium');
    badge.innerHTML = `<i class="bi ${riskIcon[a.risk_level] || 'bi-question-circle'}"></i>`;
    document.getElementById('clickRiskLabel').textContent = a.risk_level + ' Risk';
    document.getElementById('clickRiskScore').textContent = a.risk_score;
    document.getElementById('clickConfidence').textContent = a.confidence;

    // Score bars
    setBar('clickColorScore', 'clickColorBar', a.color_score);
    setBar('clickTurbScore',  'clickTurbBar',  a.turbidity_score);
    setBar('clickAlgaeScore', 'clickAlgaeBar', a.algae_score);
    setBar('clickDarkScore',  'clickDarkBar',  a.dark_patch_score);

    document.getElementById('clickExplanation').textContent = a.explanation || '';

    // Detected Regions
    const regionsEl = document.getElementById('clickRegionsContent');
    if (a.detected_regions && a.detected_regions.length) {
      regionsEl.innerHTML = a.detected_regions.map(r => `
        <div class="d-flex align-items-center gap-2 mb-1">
          <span style="width:12px;height:12px;border-radius:3px;background:${r.color};flex-shrink:0;display:inline-block;"></span>
          <span class="fw-semibold">${esc(r.label)}</span>
          <span class="text-muted">${r.pixel_count.toLocaleString()} px</span>
        </div>
      `).join('');
    } else {
      regionsEl.textContent = 'No suspicious regions detected in this sample image.';
    }

    // Diseases
    const diseasesEl = document.getElementById('clickDiseasesContent');
    if (hr && hr.diseases && hr.diseases.length) {
      diseasesEl.innerHTML = hr.diseases.map(d => `
        <div class="aq-disease-item aq-disease-${(d.risk || 'low').toLowerCase()} mb-2">
          <div class="fw-semibold">${esc(d.name)}
            <span class="badge ${riskBadgeClass(d.risk)} ms-1 fw-normal" style="font-size:.7rem">${esc(d.risk)} Risk</span>
          </div>
          <div class="text-muted small">${esc(d.pathogen)}</div>
          <div class="small mt-1">${esc(d.description)}</div>
        </div>
      `).join('');
    } else {
      diseasesEl.textContent = 'No specific health risks identified at this risk level.';
    }

    // Safety
    const safetyEl = document.getElementById('clickSafetyContent');
    if (hr && hr.safety && hr.safety.length) {
      safetyEl.innerHTML = '<ul class="mb-0 ps-3">' +
        hr.safety.map(s => `<li class="mb-1 small">${esc(s)}</li>`).join('') +
        '</ul>';
    } else {
      safetyEl.textContent = 'Follow standard water safety precautions.';
    }

    // Satellite Links
    const satEl = document.getElementById('clickSatLinksContent');
    if (a.satellite_links && a.satellite_links.length) {
      satEl.innerHTML = a.satellite_links.map(l => `
        <div class="mb-2">
          <a href="${esc(l.url)}" target="_blank" rel="noopener" class="aq-source-chip me-2">
            <i class="bi ${esc(l.icon || 'bi-link')}"></i>${esc(l.name)}
            ${l.requires_auth ? '<span class="text-muted">(login req.)</span>' : ''}
          </a>
          <span class="text-muted small">${esc(l.description)}</span>
        </div>
      `).join('');
    } else {
      satEl.innerHTML = '<p class="text-muted small mb-0">No satellite links available — coordinates not provided.</p>';
    }

    // Switch to first tab
    activateTab('tab-regions');
  }

  /* ──────────────────────────────────────────────
     3. TAB SYSTEM (click panel)
  ────────────────────────────────────────────── */
  document.querySelectorAll('.aq-tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      activateTab(this.dataset.tab);
    });
  });

  function activateTab(tabId) {
    document.querySelectorAll('.aq-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.aq-tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === tabId);
    });
  }

  /* ──────────────────────────────────────────────
     4. RIVER RANKINGS
  ────────────────────────────────────────────── */
  let currentRiverData = null; // for modal actions

  // Load both in parallel
  Promise.all([
    fetch('/api/rivers/polluted').then(r => r.json()),
    fetch('/api/rivers/clean').then(r => r.json()),
  ]).then(([pollutedRes, cleanRes]) => {
    renderRiverList(
      pollutedRes.rivers || [],
      'pollutedRiversList',
      'polluted',
      'pollutedDataNote',
      pollutedRes.data_note
    );
    renderRiverList(
      cleanRes.rivers || [],
      'cleanRiversList',
      'clean',
      'cleanDataNote',
      cleanRes.data_note
    );
  }).catch(err => {
    console.error('River data error:', err);
    document.getElementById('pollutedRiversList').innerHTML =
      '<p class="text-danger small p-3">Failed to load river data.</p>';
    document.getElementById('cleanRiversList').innerHTML =
      '<p class="text-danger small p-3">Failed to load river data.</p>';
  });

  function renderRiverList(rivers, containerId, type, noteId, note) {
    const container = document.getElementById(containerId);
    if (!rivers.length) {
      container.innerHTML = '<p class="text-muted small">No data available.</p>';
      return;
    }

    const badgeClass = type === 'polluted' ? 'aq-rank-polluted' : 'aq-rank-clean';
    const scoreBarClass = type === 'polluted' ? 'aq-score-polluted' : 'aq-score-clean';

    container.innerHTML = rivers.map((r, i) => {
      const score = type === 'polluted' ? r.risk_score_estimate : (100 - r.risk_score_estimate);
      const barWidth = Math.min(score, 100);
      const levelBadge = buildWqiPill(r.pollution_level || r.water_quality);
      const country = r.country ? ` — <span class="text-muted">${esc(r.country)}</span>` : '';

      return `
        <div class="aq-river-card p-2 mb-2" data-river-index="${i}" data-river-type="${type}">
          <div class="d-flex align-items-center gap-2">
            <div class="aq-rank-badge ${badgeClass}">${r.rank}</div>
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold text-truncate">${esc(r.name)}${country}</div>
              <div class="d-flex align-items-center gap-2 mt-1">
                ${levelBadge}
                <span class="text-muted small">Score: ${r.risk_score_estimate}/100</span>
                <span class="text-muted small ms-auto">${esc(r.continent)}</span>
              </div>
              <div class="aq-score-bar-wrap mt-1">
                <div class="aq-score-bar ${scoreBarClass}" style="width:${barWidth}%"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (note) document.getElementById(noteId).textContent = '📊 ' + note;

    // Click handler — open modal
    container.querySelectorAll('.aq-river-card').forEach(card => {
      card.addEventListener('click', function () {
        const idx = parseInt(this.dataset.riverIndex);
        const rtype = this.dataset.riverType;
        openRiverModal(rivers[idx], rtype);
      });
    });
  }

  function openRiverModal(river, type) {
    currentRiverData = { river, type };
    const isPolluted = type === 'polluted';

    document.getElementById('riverDetailModalLabel').textContent =
      `#${river.rank} — ${river.name}`;

    const header = document.getElementById('riverModalHeader');
    header.style.background = isPolluted
      ? 'linear-gradient(90deg,#7f1d1d,#dc2626)'
      : 'linear-gradient(90deg,#14532d,#15803d)';
    header.querySelector('.modal-title').style.color = '#fff';
    header.querySelector('.btn-close').style.filter = 'invert(1)';

    const pollutants = isPolluted ? river.primary_pollutants : river.quality_indicators;
    const pollutantLabel = isPolluted ? 'Primary Pollutants' : 'Quality Indicators';
    const levelLabel = isPolluted ? river.pollution_level : river.water_quality;
    const wqiLabel = river.wqi_estimate;

    const hr = river.health_risks || {};
    const diseases = hr.diseases || [];
    const safety = hr.safety || [];

    const sourcesHtml = (river.sources || []).map(s =>
      `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="aq-source-chip me-1">
        <i class="bi bi-box-arrow-up-right"></i>${esc(s.name)}
      </a>`
    ).join('');

    const diseaseHtml = diseases.length
      ? diseases.map(d => `
          <div class="aq-disease-item aq-disease-${(d.risk || 'low').toLowerCase()} mb-2">
            <div class="fw-semibold">${esc(d.name)}
              <span class="badge ${riskBadgeClass(d.risk)} ms-1 fw-normal" style="font-size:.7rem">${esc(d.risk)} Risk</span>
            </div>
            <div class="text-muted small">${esc(d.pathogen)}</div>
            <div class="small mt-1">${esc(d.description)}</div>
          </div>`).join('')
      : '<p class="text-muted small">No specific disease risks identified.</p>';

    const safetyHtml = safety.length
      ? '<ul class="mb-0 ps-3">' + safety.map(s => `<li class="small mb-1">${esc(s)}</li>`).join('') + '</ul>'
      : '<p class="text-muted small">Follow standard water safety precautions.</p>';

    document.getElementById('riverModalBody').innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-6 col-md-3">
          <div class="aq-kpi-card">
            <div class="aq-kpi-icon"><i class="bi bi-geo-alt-fill"></i></div>
            <div style="font-size:.8rem;font-weight:700;color:var(--aq-blue)">${esc(river.country)}</div>
            <div class="aq-kpi-label">Country / Region</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="aq-kpi-card ${isPolluted ? 'aq-kpi-danger' : 'aq-kpi-success'}">
            <div class="aq-kpi-icon"><i class="bi ${isPolluted ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}"></i></div>
            <div class="aq-kpi-value">${river.risk_score_estimate}</div>
            <div class="aq-kpi-label">Risk Score Estimate / 100</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="aq-kpi-card">
            <div class="aq-kpi-icon"><i class="bi bi-bar-chart-line"></i></div>
            <div style="font-size:.78rem;font-weight:700;color:var(--aq-blue)">${buildWqiPill(levelLabel)}</div>
            <div class="aq-kpi-label">Pollution / Quality Level</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="aq-kpi-card">
            <div class="aq-kpi-icon"><i class="bi bi-activity"></i></div>
            <div style="font-size:.72rem;font-weight:600;color:var(--aq-blue)">${esc(wqiLabel || '—')}</div>
            <div class="aq-kpi-label">WQI Estimate</div>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <strong>${esc(pollutantLabel)}:</strong>
        <ul class="mt-1 mb-0 ps-3">
          ${(pollutants || []).map(p => `<li class="small">${esc(p)}</li>`).join('')}
        </ul>
      </div>

      <div class="mb-3">
        <strong>Key Facts:</strong>
        <p class="small text-muted mt-1 mb-0">${esc(river.key_facts || '')}</p>
      </div>

      <hr/>
      <h6 class="fw-bold"><i class="bi bi-heart-pulse me-1 text-danger"></i>Associated Health Risks &amp; Diseases</h6>
      <div class="mb-3">${diseaseHtml}</div>

      <h6 class="fw-bold"><i class="bi bi-shield-check me-1 text-success"></i>Safety Recommendations</h6>
      <div class="mb-3">${safetyHtml}</div>

      <hr/>
      <h6 class="fw-bold"><i class="bi bi-journal-text me-1"></i>Data Sources</h6>
      <div class="d-flex flex-wrap gap-2 mt-1">${sourcesHtml}</div>
      <p class="text-muted small mt-2 mb-0">
        <i class="bi bi-info-circle me-1"></i>
        Published data represents reported estimates, not real-time sensor readings.
        Conditions may have changed since publication. Always consult national authorities for current status.
      </p>
    `;

    const modal = new bootstrap.Modal(document.getElementById('riverDetailModal'));
    modal.show();
  }

  // "Go to Location on Map" from modal
  document.getElementById('riverGoToMapBtn').addEventListener('click', function () {
    if (!currentRiverData) return;
    const r = currentRiverData.river;
    bootstrap.Modal.getInstance(document.getElementById('riverDetailModal')).hide();
    map.setView([r.latitude, r.longitude], 9);

    // Remove previous click marker
    if (clickMarker) map.removeLayer(clickMarker);
    clickMarker = L.marker([r.latitude, r.longitude], {
      icon: L.divIcon({
        className: '',
        html: `<div style="padding:2px 8px;background:#0a5491;color:#fff;font-size:.7rem;font-weight:700;border-radius:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3)">${r.name}</div>`,
        iconAnchor: [0, 0],
      })
    }).addTo(map);
  });

  // "Analyse This River" from modal
  document.getElementById('riverAnalyzeBtn').addEventListener('click', function () {
    if (!currentRiverData) return;
    const r = currentRiverData.river;
    const type = currentRiverData.type;

    bootstrap.Modal.getInstance(document.getElementById('riverDetailModal')).hide();

    // Trigger click-analysis for this river's coordinates with its sample image
    const panel = document.getElementById('mapClickInfo');
    panel.style.display = 'block';
    document.getElementById('clickAnalysisLoading').style.display = 'block';
    document.getElementById('clickAnalysisResult').style.display = 'none';
    document.getElementById('clickLocationName').textContent = r.name;

    map.setView([r.latitude, r.longitude], 9);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    fetch('/api/map/click-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: r.latitude,
        lon: r.longitude,
        water_type: 'river',
        location_name: r.name,
        demo_sample: r.sample_image_key || '',
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) { showClickError(data.error); return; }
        renderClickAnalysis(data);
      })
      .catch(err => {
        console.error('River analyse error:', err);
        showClickError('Analysis request failed.');
      });
  });

  /* ──────────────────────────────────────────────
     5. HELPERS
  ────────────────────────────────────────────── */

  function setBar(labelId, barId, score) {
    document.getElementById(labelId).textContent = (score || 0).toFixed(1);
    document.getElementById(barId).style.width = Math.min(score || 0, 100) + '%';
  }

  function riskBadgeClass(risk) {
    if (!risk) return 'bg-secondary';
    const r = risk.toLowerCase();
    if (r === 'high') return 'bg-danger';
    if (r === 'medium') return 'bg-warning text-dark';
    return 'bg-success';
  }

  function buildWqiPill(level) {
    if (!level) return '';
    const l = level.toLowerCase();
    let cls = 'aq-wqi-medium';
    if (l.includes('extreme') || l.includes('critically')) cls = 'aq-wqi-extreme';
    else if (l.includes('very high') || l.includes('highly')) cls = 'aq-wqi-high';
    else if (l.includes('excellent')) cls = 'aq-wqi-exc';
    else if (l.includes('good') || l.includes('clean') || l.includes('low')) cls = 'aq-wqi-good';
    return `<span class="aq-wqi-pill ${cls}">${esc(level)}</span>`;
  }

  function guessWaterType(lat, lon) {
    // Very rough ocean heuristic — if coordinates are far from any major landmass
    // and near large ocean lat/lon bands, suggest ocean; otherwise river.
    // Intentionally very simplified — not a real geocoder.
    const absLat = Math.abs(lat);
    if (absLat < 70 && (lon < -100 || lon > 110 || (lat > 30 && lon < -20))) return 'ocean';
    return 'river';
  }

  function waterTypeLabel(type) {
    const labels = { river: 'River', ocean: 'Ocean', lake: 'Lake', reservoir: 'Reservoir', other: 'Other' };
    return labels[type] || type || 'Unknown';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

});
