/* ============================================================
   AquaGuard AI – Dashboard Page
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ---- Fetch stats ----
  fetch('/api/dashboard/stats')
    .then(r => r.json())
    .then(stats => {
      renderKPIs(stats);
      renderRiskPie(stats.risk_distribution);
      renderTypeDonut(stats.water_type_distribution);
      renderTrendLine(stats.trend_data);
    })
    .catch(err => console.error('Stats load error:', err));

  // ---- Fetch recent analyses ----
  fetch('/api/analyses?limit=10')
    .then(r => r.json())
    .then(renderRecentTable)
    .catch(err => console.error('Analyses load error:', err));

  // ---- KPIs ----
  function renderKPIs(s) {
    document.getElementById('kpiTotal').textContent = s.total_analyses;
    document.getElementById('kpiHigh').textContent  = s.high_risk_count;
    document.getElementById('kpiAvg').textContent   = s.average_score;
    document.getElementById('kpiLow').textContent   = s.risk_distribution.Low || 0;
  }

  // ---- Risk Pie ----
  function renderRiskPie(dist) {
    const ctx = document.getElementById('riskPieChart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Low', 'Medium', 'High'],
        datasets: [{
          data: [dist.Low || 0, dist.Medium || 0, dist.High || 0],
          backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
          borderColor: '#fff',
          borderWidth: 3,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed} analyses`
            }
          }
        },
        cutout: '60%',
      }
    });
  }

  // ---- Water Type Donut ----
  function renderTypeDonut(dist) {
    const ctx = document.getElementById('typeDonutChart').getContext('2d');
    const labels = Object.keys(dist).map(k =>
      k.charAt(0).toUpperCase() + k.slice(1).replace('_', ' ')
    );
    const colors = ['#0d5e9e','#0ea5a0','#1679aa','#38bdf8','#7c3aed','#a855f7'];
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: Object.values(dist),
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 3,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 } } },
        },
        cutout: '55%',
      }
    });
  }

  // ---- Trend Line ----
  function renderTrendLine(trend) {
    const ctx = document.getElementById('trendLineChart').getContext('2d');
    if (!trend || !trend.length) {
      ctx.canvas.parentElement.innerHTML =
        '<p class="text-muted text-center py-4 small">Not enough data yet to show a trend.</p>';
      return;
    }
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: trend.map(d => d.date),
        datasets: [{
          label: 'Avg Risk Score',
          data: trend.map(d => d.avg_score),
          borderColor: '#0ea5a0',
          backgroundColor: 'rgba(14,165,160,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#0d5e9e',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: 'Risk Score (0–100)' },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          x: {
            grid: { display: false },
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `Date: ${items[0].label}`,
              label: item => ` Avg Score: ${item.parsed.y}`
            }
          }
        }
      }
    });
  }

  // ---- Recent Table ----
  function renderRecentTable(analyses) {
    const tbody = document.getElementById('recentTableBody');
    if (!analyses.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No analyses yet.</td></tr>';
      return;
    }
    tbody.innerHTML = analyses.map(a => `
      <tr>
        <td>${a.location_name || '—'}</td>
        <td>${waterTypeLabel(a.water_type)}</td>
        <td>${riskPill(a.risk_level)}</td>
        <td><strong>${a.risk_score}</strong>/100</td>
        <td>${formatDate(a.analyzed_at)}</td>
        <td>
          <a href="/report/${a.id}" class="btn btn-sm aq-btn-secondary py-0">Report</a>
        </td>
      </tr>
    `).join('');
  }

});
