/* ─────────────────────────────────────────────────────────────────────────────
   Delhi Climate — Missing Data Visualisation & Imputation
   main.js  |  Depends on Chart.js (loaded via CDN in template)
───────────────────────────────────────────────────────────────────────────── */

'use strict';

/* ── State ───────────────────────────────────────────────────────────────── */
let RAW_DATA       = [];   // original records from server
let FILLED_DATA    = [];   // imputed values (same length as RAW_DATA)
let FILLED_INDICES = new Set();
let lineChart      = null;

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const getCol  = () => document.getElementById('col-select').value;
const getAlgo = () => document.getElementById('algo-select').value;

function getMissingIndices(col, data) {
  return data.reduce((acc, r, i) => { if (r[col] === null) acc.push(i); return acc; }, []);
}

/* ── Boot: fetch raw data then render ────────────────────────────────────── */
async function boot() {
  const res  = await fetch('/api/data/');
  const json = await res.json();
  RAW_DATA = json.data;
  renderAll();
}

/* ── Fill missing via Django API ─────────────────────────────────────────── */
async function fillMissing() {
  const col  = getCol();
  const algo = getAlgo();
  const btn  = document.getElementById('btn-fill');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memproses…';

  try {
    const res  = await fetch('/api/impute/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
      body:    JSON.stringify({ col, algo }),
    });
    const json = await res.json();

    FILLED_INDICES = new Set(json.missing_indices);
    FILLED_DATA    = json.filled;

    document.getElementById('btn-reset').disabled = false;
    const card = document.getElementById('st-filled-card');
    card.style.display = '';
    document.getElementById('st-filled').textContent = FILLED_INDICES.size;

    renderAll();
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Isi Data Kosong';
  }
}

/* ── Reset ───────────────────────────────────────────────────────────────── */
function resetData() {
  FILLED_DATA    = [];
  FILLED_INDICES = new Set();
  document.getElementById('btn-reset').disabled  = true;
  document.getElementById('st-filled-card').style.display = 'none';
  renderAll();
}

/* ── Update algo description box ─────────────────────────────────────────── */
function updateAlgoDesc() {
  const algo = getAlgo();
  const meta = ALGO_META[algo];
  document.getElementById('algo-desc').innerHTML =
    `<strong>${meta.name}</strong>${meta.desc}`;
}

/* ── Candle (bar) chart ──────────────────────────────────────────────────── */
function renderCandleChart() {
  const col        = getCol();
  const isFilled   = FILLED_INDICES.size > 0;
  const origMissing = new Set(getMissingIndices(col, RAW_DATA));

  // Build current values: merge original + imputed
  const currVals = RAW_DATA.map((r, i) => {
    if (origMissing.has(i) && isFilled) return FILLED_DATA[i];
    return r[col];
  });

  const known   = currVals.filter(v => v !== null);
  const minV    = Math.min(...known);
  const maxV    = Math.max(...known);
  const range   = maxV - minV || 1;

  const n      = RAW_DATA.length;
  const barW   = 7, gap = 2, padL = 44, padT = 20, padB = 22;
  const svgH   = 280;
  const chartH = svgH - padT - padB;
  const totalW = n * (barW + gap) + padL + 10;

  const toY = v => padT + (1 - (v - minV) / range) * chartH;

  /* grid lines */
  const tickCount = 5;
  let svg = `<svg width="${totalW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block">`;

  for (let t = 0; t <= tickCount; t++) {
    const v = minV + range * t / tickCount;
    const y = toY(v);
    svg += `<line x1="${padL - 4}" y1="${y}" x2="${totalW - 4}" y2="${y}"
              stroke="rgba(128,128,120,.15)" stroke-width=".5"/>`;
    svg += `<text x="${padL - 6}" y="${y + 3.5}" text-anchor="end"
              font-size="9" fill="rgba(128,128,120,.8)">${v.toFixed(1)}</text>`;
  }

  /* bars */
  for (let i = 0; i < n; i++) {
    const x    = padL + i * (barW + gap);
    const v    = currVals[i];
    const prev = i > 0 ? currVals[i - 1] : v;

    const isOrigMissing   = origMissing.has(i);
    const isFilledNow     = isOrigMissing && isFilled;
    const isStillMissing  = v === null;

    let fill, stroke;
    if (isStillMissing) {
      fill = 'rgba(226,75,74,.70)'; stroke = 'rgba(226,75,74,.90)';
    } else if (isFilledNow) {
      fill = 'rgba(29,158,117,.75)'; stroke = 'rgba(29,158,117,.90)';
    } else if (prev !== null && v !== null && v >= prev) {
      fill = 'rgba(50,102,173,.55)'; stroke = 'rgba(50,102,173,.70)';
    } else {
      fill = 'rgba(113,113,108,.40)'; stroke = 'rgba(113,113,108,.55)';
    }

    if (isStillMissing) {
      const yMid = padT + chartH / 2;
      svg += `<rect x="${x}" y="${yMid - 14}" width="${barW}" height="28"
                fill="${fill}" stroke="${stroke}" stroke-width=".5" rx="1"/>`;
      svg += `<line x1="${x + barW / 2}" y1="${padT}" x2="${x + barW / 2}" y2="${padT + chartH}"
                stroke="${stroke}" stroke-width=".5" stroke-dasharray="3,2"/>`;
    } else {
      const yHigh = toY(Math.max(v, prev !== null ? prev : v));
      const yLow  = toY(Math.min(v, prev !== null ? prev : v));
      const h     = Math.max(yLow - yHigh, 2);
      const yMid  = toY(v);
      svg += `<line x1="${x + barW / 2}" y1="${padT}" x2="${x + barW / 2}" y2="${yMid}"
                stroke="${stroke}" stroke-width=".5" stroke-dasharray="2,2"/>`;
      svg += `<rect x="${x}" y="${yHigh}" width="${barW}" height="${h}"
                fill="${fill}" stroke="${stroke}" stroke-width=".5" rx="1"/>`;
      svg += `<line x1="${x + barW / 2}" y1="${yMid}" x2="${x + barW / 2}" y2="${padT + chartH}"
                stroke="${stroke}" stroke-width=".5" stroke-dasharray="2,2"/>`;
    }

    /* date label every 14 days */
    if (i % 14 === 0) {
      const lbl = RAW_DATA[i].date.slice(5);
      svg += `<text x="${x + barW / 2}" y="${svgH - 5}" text-anchor="middle"
                font-size="8" fill="rgba(128,128,120,.8)">${lbl}</text>`;
    }
  }

  svg += '</svg>';
  document.getElementById('candle-container').innerHTML = svg;

  /* badges */
  const stillMissing = getMissingIndices(col, RAW_DATA.map((r, i) => ({
    ...r, [col]: currVals[i]
  }))).length;
  document.getElementById('missing-count-badge').textContent = `${stillMissing} hilang`;

  const filledBadge = document.getElementById('filled-count-badge');
  if (FILLED_INDICES.size > 0) {
    filledBadge.style.display = '';
    filledBadge.textContent   = `${FILLED_INDICES.size} terisi`;
  } else {
    filledBadge.style.display = 'none';
  }
}

/* ── Line chart ──────────────────────────────────────────────────────────── */
function renderLineChart() {
  const col      = getCol();
  const labels   = RAW_DATA.map(r => r.date.slice(5));
  const rawVals  = RAW_DATA.map(r => r[col]);
  const origMiss = new Set(getMissingIndices(col, RAW_DATA));

  const datasets = [
    {
      label: 'Nilai asli',
      data:  rawVals,
      borderColor: '#3266ad',
      backgroundColor: 'rgba(50,102,173,.08)',
      borderWidth: 1.5,
      pointRadius: rawVals.map((_, i) => origMiss.has(i) ? 4 : 2),
      pointBackgroundColor: rawVals.map((_, i) => origMiss.has(i) ? 'rgba(226,75,74,.6)' : '#3266ad'),
      tension: 0.3,
      spanGaps: false,
    },
  ];

  if (FILLED_INDICES.size > 0) {
    const pts = RAW_DATA.map((_, i) => (origMiss.has(i) ? FILLED_DATA[i] : null));
    datasets.push({
      label: 'Imputasi',
      data:  pts,
      borderColor: '#1d9e75',
      borderWidth: 0,
      pointRadius: pts.map(v => v !== null ? 5 : 0),
      pointBackgroundColor: '#1d9e75',
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
      showLine: false,
    });
  }

  if (lineChart) lineChart.destroy();
  const ctx = document.getElementById('lineChart').getContext('2d');
  lineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => ctx.raw !== null ? `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(2)}` : null,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(128,128,120,.10)' } },
      },
    },
  });

  let legHtml = `
    <span><span class="dot" style="background:#3266ad;border-radius:50%"></span>Nilai asli</span>
    <span><span class="dot" style="background:rgba(226,75,74,.6);border-radius:50%"></span>Posisi hilang</span>`;
  if (FILLED_INDICES.size > 0) {
    legHtml += `<span><span class="dot" style="background:#1d9e75;border-radius:50%"></span>Nilai imputasi</span>`;
  }
  document.getElementById('line-legend').innerHTML = legHtml;
}

/* ── Missing-value detail table ──────────────────────────────────────────── */
function renderTable() {
  const col      = getCol();
  const origMiss = new Set(getMissingIndices(col, RAW_DATA));
  document.getElementById('col-label-table').textContent = col;

  let html = '';
  origMiss.forEach(i => {
    const r      = RAW_DATA[i];
    const filled = FILLED_INDICES.size > 0 ? FILLED_DATA[i] : null;
    const filledStr = filled !== null ? Number(filled).toFixed(3) : '—';
    const status    = filled !== null
      ? '<span class="badge success">Terisi</span>'
      : '<span class="badge danger">Kosong</span>';

    html += `<tr>
      <td>${i}</td>
      <td>${r.date}</td>
      <td><span class="badge danger">null</span></td>
      <td>${filledStr}</td>
      <td>${status}</td>
    </tr>`;
  });

  document.getElementById('missing-tbody').innerHTML =
    html || '<tr><td colspan="5" style="color:var(--text-muted);text-align:center">Tidak ada data hilang pada kolom ini</td></tr>';
}

/* ── Render everything ───────────────────────────────────────────────────── */
function renderAll() {
  renderCandleChart();
  renderLineChart();
  renderTable();
}

/* ── CSRF helper ─────────────────────────────────────────────────────────── */
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* ── Event listeners ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('algo-select').addEventListener('change', updateAlgoDesc);
  document.getElementById('col-select').addEventListener('change', () => {
    if (FILLED_INDICES.size > 0) resetData();
    else renderAll();
  });
  document.getElementById('btn-fill').addEventListener('click', fillMissing);
  document.getElementById('btn-reset').addEventListener('click', resetData);

  updateAlgoDesc();
  boot();
});
