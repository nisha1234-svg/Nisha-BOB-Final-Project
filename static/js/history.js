/* ============================================================
   AquaGuard AI – History Page
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  let allAnalyses = [];

  // ---- Load data ----
  fetch('/api/analyses?limit=200')
    .then(r => r.json())
    .then(data => {
      allAnalyses = data;
      renderGrid(data);
      document.getElementById('recordCount').textContent = `${data.length} record(s)`;
    })
    .catch(() => {
      document.getElementById('historyGrid').innerHTML =
        '<div class="col-12 text-center text-danger py-4">Failed to load history.</div>';
    });

  // ---- Filters ----
  const filterSearch = document.getElementById('filterSearch');
  const filterRisk   = document.getElementById('filterRisk');
  const filterType   = document.getElementById('filterType');
  const clearBtn     = document.getElementById('clearFilters');

  [filterSearch, filterRisk, filterType].forEach(el => {
    el.addEventListener('input', applyFilters);
    el.addEventListener('change', applyFilters);
  });
  clearBtn.addEventListener('click', () => {
    filterSearch.value = '';
    filterRisk.value = '';
    filterType.value = '';
    applyFilters();
  });

  function applyFilters() {
    const q    = filterSearch.value.toLowerCase();
    const risk = filterRisk.value;
    const type = filterType.value;
    const filtered = allAnalyses.filter(a => {
      const locMatch  = !q    || (a.location_name || '').toLowerCase().includes(q);
      const riskMatch = !risk || a.risk_level === risk;
      const typeMatch = !type || a.water_type === type;
      return locMatch && riskMatch && typeMatch;
    });
    renderGrid(filtered);
    document.getElementById('recordCount').textContent = `${filtered.length} record(s)`;
  }

  // ---- Render Grid ----
  function renderGrid(analyses) {
    const grid    = document.getElementById('historyGrid');
    const noRes   = document.getElementById('noResults');

    if (!analyses.length) {
      grid.innerHTML = '';
      noRes.classList.remove('d-none');
      return;
    }
    noRes.classList.add('d-none');

    grid.innerHTML = analyses.map(a => {
      const thumbHtml = a.image_url
        ? `<img src="${a.image_url}" class="aq-history-thumb" alt="Water image" loading="lazy" />`
        : `<div class="aq-history-thumb-placeholder"><i class="bi bi-water"></i></div>`;

      const iconMap = { Low: 'bi-check-circle-fill', Medium: 'bi-exclamation-circle-fill', High: 'bi-exclamation-triangle-fill' };

      return `
        <div class="col-sm-6 col-lg-4 col-xl-3">
          <div class="aq-history-card">
            ${thumbHtml}
            <div class="p-2">
              <div class="d-flex justify-content-between align-items-center mb-1">
                ${riskPill(a.risk_level)}
                <span class="small text-muted">${a.risk_score}/100</span>
              </div>
              <h6 class="mb-0 small fw-semibold text-truncate" title="${a.location_name || ''}">
                ${a.location_name || 'Unknown Location'}
              </h6>
              <div class="small text-muted">${waterTypeLabel(a.water_type)}</div>
              <div class="small text-muted mb-2">${formatDate(a.analyzed_at)}</div>
              <div class="d-flex gap-1">
                <a href="/report/${a.id}" class="btn btn-sm aq-btn-secondary flex-grow-1 py-0">
                  <i class="bi bi-file-earmark-text me-1"></i>Report
                </a>
                <button class="btn btn-sm btn-outline-danger py-0"
                  onclick="deleteAnalysis('${a.id}', this)" title="Delete">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ---- Delete ----
  window.deleteAnalysis = function(id, btn) {
    if (!confirm('Delete this analysis? This action cannot be undone.')) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    fetch(`/api/analyses/${id}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          allAnalyses = allAnalyses.filter(a => a.id !== id);
          applyFilters();
        } else {
          showAlert(data.error || 'Delete failed.');
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-trash"></i>';
        }
      })
      .catch(() => {
        showAlert('Network error while deleting.');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash"></i>';
      });
  };

});
