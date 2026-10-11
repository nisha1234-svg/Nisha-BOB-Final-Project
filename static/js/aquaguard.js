/* ============================================================
   AquaGuard AI – Shared Utilities
   ============================================================ */

/**
 * Format ISO date string to readable local format.
 */
function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Return a Bootstrap/CSS class name suffix for a risk level.
 */
function riskClass(level) {
  const map = { Low: 'low', Medium: 'medium', High: 'high' };
  return map[level] || 'low';
}

/**
 * Return a colour hex for map markers.
 */
function riskColor(level) {
  const map = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' };
  return map[level] || '#3b82d4';
}

/**
 * Water type display name.
 */
function waterTypeLabel(type) {
  const map = {
    ocean: 'Ocean / Sea', river: 'River / Stream',
    lake: 'Lake / Pond', reservoir: 'Reservoir',
    wetland: 'Wetland', other: 'Other'
  };
  return map[type] || type;
}

/**
 * Render a risk pill span.
 */
function riskPill(level) {
  return `<span class="aq-risk-pill-${riskClass(level)}">${level}</span>`;
}

/**
 * Show a toast-like alert at top of page.
 */
function showAlert(message, type = 'danger') {
  const container = document.getElementById('alertContainer')
    || document.querySelector('.container-xl');
  const div = document.createElement('div');
  div.className = `alert alert-${type} alert-dismissible fade show mt-2`;
  div.innerHTML = `${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  container.prepend(div);
  setTimeout(() => div.remove(), 6000);
}
