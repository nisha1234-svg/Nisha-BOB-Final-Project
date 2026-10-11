/* ============================================================
   AquaGuard AI – Analyze Page Logic
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ---- DOM references ----
  const uploadForm    = document.getElementById('uploadForm');
  const demoForm      = document.getElementById('demoForm');
  const imageInput    = document.getElementById('imageInput');
  const dropZone      = document.getElementById('dropZone');
  const imagePreview  = document.getElementById('imagePreview');
  const previewWrap   = document.getElementById('imagePreviewWrap');
  const clearBtn      = document.getElementById('clearImageBtn');
  const analyzeBtn    = document.getElementById('analyzeBtn');
  const demoAnalyzeBtn= document.getElementById('demoAnalyzeBtn');
  const geoBtn        = document.getElementById('geolocateBtn');
  const progressDiv   = document.getElementById('analysisProgress');
  const resultsPanel  = document.getElementById('resultsPanel');
  const placeholder   = document.getElementById('resultsPlaceholder');
  const sampleGrid    = document.getElementById('sampleGrid');

  // ---- Load demo samples ----
  fetch('/api/demo/samples')
    .then(r => r.json())
    .then(samples => {
      if (!samples.length) {
        sampleGrid.innerHTML = '<div class="col-12 text-muted small">No sample images found.</div>';
        return;
      }
      sampleGrid.innerHTML = samples.map(s => `
        <div class="col-4">
          <div class="aq-sample-card" data-key="${s.key}" data-name="${s.name}">
            <img src="${s.url}" alt="${s.name}" />
            <div class="p-1 text-center small text-truncate">${s.name}</div>
          </div>
        </div>
      `).join('');

      // Select first by default
      const first = sampleGrid.querySelector('.aq-sample-card');
      if (first) {
        first.classList.add('selected');
        document.getElementById('demoSampleKey').value = first.dataset.key;
        document.getElementById('demoLocation').value = first.dataset.name;
        demoAnalyzeBtn.disabled = false;
      }

      sampleGrid.addEventListener('click', function (e) {
        const card = e.target.closest('.aq-sample-card');
        if (!card) return;
        sampleGrid.querySelectorAll('.aq-sample-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('demoSampleKey').value = card.dataset.key;
        document.getElementById('demoLocation').value = card.dataset.name;
        demoAnalyzeBtn.disabled = false;
      });
    })
    .catch(() => {
      sampleGrid.innerHTML = '<div class="col-12 text-muted small">Could not load samples.</div>';
    });

  // ---- Drop Zone ----
  dropZone.addEventListener('click', () => imageInput.click());

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
    }
  });

  imageInput.addEventListener('change', () => {
    if (imageInput.files[0]) setImageFile(imageInput.files[0]);
  });

  clearBtn.addEventListener('click', () => {
    imageInput.value = '';
    previewWrap.classList.add('d-none');
    dropZone.style.display = '';
    analyzeBtn.disabled = true;
  });

  function setImageFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      imagePreview.src = e.target.result;
      previewWrap.classList.remove('d-none');
      dropZone.style.display = 'none';
      analyzeBtn.disabled = false;
    };
    reader.readAsDataURL(file);
    // Transfer file to input
    const dt = new DataTransfer();
    dt.items.add(file);
    imageInput.files = dt.files;
  }

  // Start disabled until image selected
  analyzeBtn.disabled = true;

  // ---- Geolocation ----
  if (geoBtn) {
    geoBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showAlert('Geolocation is not supported by your browser.', 'warning');
        return;
      }
      geoBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Locating…';
      geoBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        pos => {
          uploadForm.querySelector('[name=latitude]').value = pos.coords.latitude.toFixed(6);
          uploadForm.querySelector('[name=longitude]').value = pos.coords.longitude.toFixed(6);
          geoBtn.innerHTML = '<i class="bi bi-geo-alt-fill me-1"></i>Location set';
          geoBtn.disabled = false;
        },
        () => {
          showAlert('Unable to get location. Please enter coordinates manually.', 'warning');
          geoBtn.innerHTML = '<i class="bi bi-geo-alt me-1"></i>Use my location';
          geoBtn.disabled = false;
        }
      );
    });
  }

  // ---- Form Submit Helper ----
  function submitAnalysis(formData, btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analysing…';
    progressDiv.classList.remove('d-none');
    placeholder.classList.add('d-none');
    resultsPanel.classList.add('d-none');

    fetch('/api/analyze', {
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
      renderResults(data.analysis);
    })
    .catch(err => {
      progressDiv.classList.add('d-none');
      showAlert(`<i class="bi bi-x-circle me-2"></i>Network error: ${err.message}`);
      placeholder.classList.remove('d-none');
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerHTML = btn.id === 'analyzeBtn'
        ? '<i class="bi bi-search me-2"></i>Analyze Image'
        : '<i class="bi bi-play-circle me-2"></i>Run Demo Analysis';
    });
  }

  // ---- Upload Form Submit ----
  uploadForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!imageInput.files[0]) {
      showAlert('Please select an image file first.', 'warning');
      return;
    }
    submitAnalysis(new FormData(uploadForm), analyzeBtn);
  });

  // ---- Demo Form Submit ----
  demoForm.addEventListener('submit', e => {
    e.preventDefault();
    const key = document.getElementById('demoSampleKey').value;
    if (!key) {
      showAlert('Please select a sample image.', 'warning');
      return;
    }
    submitAnalysis(new FormData(demoForm), demoAnalyzeBtn);
  });

  // ---- Render Results ----
  function renderResults(a) {
    resultsPanel.classList.remove('d-none');
    placeholder.classList.add('d-none');

    // Scroll to results
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Risk badge
    const badge = document.getElementById('riskBadge');
    const iconMap = { Low: 'bi-check-circle-fill', Medium: 'bi-exclamation-circle-fill', High: 'bi-exclamation-triangle-fill' };
    badge.className = `aq-risk-badge aq-risk-${riskClass(a.risk_level)} fs-4`;
    badge.innerHTML = `<i class="bi ${iconMap[a.risk_level] || 'bi-circle'}"></i>`;

    document.getElementById('riskLabel').textContent = `${a.risk_level} Risk — Score: ${a.risk_score}/100`;
    document.getElementById('analysisTimestamp').textContent = a.analyzed_at ? formatDate(a.analyzed_at) : '';

    const conf = document.getElementById('confidenceBadge');
    conf.textContent = `Confidence: ${a.confidence}`;
    conf.className = 'badge aq-badge-confidence';

    // Score bars (animate)
    setBar('colorBar',     'colorScoreVal',     a.color_score);
    setBar('turbidityBar', 'turbidityScoreVal', a.turbidity_score);
    setBar('algaeBar',     'algaeScoreVal',     a.algae_score);
    setBar('darkBar',      'darkScoreVal',      a.dark_patch_score);

    const cs = document.getElementById('compositeScore');
    cs.textContent = `${a.risk_score}/100`;
    cs.style.color = riskColor(a.risk_level);

    // Colour swatches
    const swatchContainer = document.getElementById('colorSwatches');
    swatchContainer.innerHTML = '';
    if (a.dominant_colors) {
      a.dominant_colors.forEach(c => {
        const div = document.createElement('div');
        div.className = 'text-center small';
        div.innerHTML = `
          <div class="aq-swatch-box" style="background:${c.hex};"
            title="RGB(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})"></div>
          <div class="mt-1">${c.percent}%</div>
          <div class="text-muted" style="font-size:0.7rem;">${c.hex}</div>
        `;
        swatchContainer.appendChild(div);
      });
    }

    // Explanation
    document.getElementById('explanationText').textContent = a.explanation;

    const recList = document.getElementById('recommendationsList');
    recList.innerHTML = '';
    if (a.recommendations) {
      a.recommendations.forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        recList.appendChild(li);
      });
    }

    document.getElementById('disclaimerText').textContent = a.disclaimer;

    // Report link
    document.getElementById('viewReportBtn').href = `/report/${a.id}`;
  }

  function setBar(barId, valId, score) {
    const bar = document.getElementById(barId);
    const val = document.getElementById(valId);
    setTimeout(() => { bar.style.width = score + '%'; }, 50);
    val.textContent = `${score}/100`;
  }
});
