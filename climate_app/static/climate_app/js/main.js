'use strict';

/* ── State ──────────────────────────────────────────────────────────────── */
let RAW      = [];   // data mentah dari server (ada null)
let IMPUTED  = [];   // data setelah imputasi
let SUMMARY  = {};   // { col: [{index, date, imputed}] }
let FILLED   = false;
let ACTIVE   = 'wind_speed';
let lineChart = null;

/* ── Boot: ambil data dari Django ────────────────────────────────────────── */
async function boot() {
  const res  = await fetch('/api/data/');
  const json = await res.json();
  RAW = json.data;
  renderCandle();
  renderLine();
  renderMissingTable();
}

/* ── Pilih kolom (chip) ──────────────────────────────────────────────────── */
function selectCol(col, el) {
  ACTIVE = col;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderCandle();
  renderLine();
}

/* ── Isi semua data kosong ───────────────────────────────────────────────── */
async function fillMissing() {
  const btn = document.getElementById('btn-fill');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Memproses…';

  try {
    const res  = await fetch('/api/impute/', { method: 'POST' });
    const json = await res.json();

    IMPUTED = json.data;
    SUMMARY = json.summary;
    FILLED  = true;

    /* update stat card */
    document.getElementById('card-filled').style.display = '';
    document.getElementById('val-filled').textContent    = json.total_filled;

    /* aktifkan tombol download & reset */
    document.getElementById('btn-download').disabled = false;
    document.getElementById('btn-reset').disabled    = false;

    /* update badge missing di setiap kolom → 0 */
    Object.keys(SUMMARY).forEach(col => {
      const el = document.getElementById(`miss-${col}`);
      if (el) el.innerHTML = '<span class="badge green">Lengkap</span>';
    });

    renderCandle();
    renderLine();
    renderDetailTable();
  } catch (err) {
    alert('Gagal: ' + err);
  } finally {
    btn.disabled = false;
    btn.innerHTML =
      '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
      '<path d="M12 5v14M5 12h14"/></svg>Isi Semua Data Kosong';
  }
}

/* ── Download Excel ──────────────────────────────────────────────────────── */
function downloadExcel() {
  window.location.href = '/api/download/';
}

/* ── Reset ───────────────────────────────────────────────────────────────── */
function resetData() {
  IMPUTED = []; SUMMARY = {}; FILLED = false;
  document.getElementById('card-filled').style.display  = 'none';
  document.getElementById('btn-download').disabled      = true;
  document.getElementById('btn-reset').disabled         = true;
  document.getElementById('detail-body').innerHTML =
    '<tr><td colspan="4" class="empty">Tekan "Isi Semua Data Kosong" terlebih dahulu</td></tr>';
  /* reload agar badge missing kembali dari server */
  location.reload();
}

/* ── Candle chart ────────────────────────────────────────────────────────── */
function renderCandle() {
  const col    = ACTIVE;
  const data   = FILLED ? IMPUTED : RAW;
  const vals   = data.map(r => r[col]);
  const known  = vals.filter(v => v !== null);
  if (!known.length) return;

  const minV = Math.min(...known), maxV = Math.max(...known);
  const range = maxV - minV || 1;

  const n = data.length;
  const barW = 7, gap = 2;
  const padL = 48, padT = 18, padB = 26;
  const svgH  = 280;
  const chartH = svgH - padT - padB;
  const totalW = n * (barW + gap) + padL + 8;
  const toY = v => padT + (1 - (v - minV) / range) * chartH;

  let s = `<svg width="${totalW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block">`;

  /* grid lines */
  for (let t = 0; t <= 5; t++) {
    const v = minV + range * t / 5;
    const y = toY(v);
    s += `<line x1="${padL-4}" y1="${y}" x2="${totalW-4}" y2="${y}" stroke="rgba(120,120,115,.13)" stroke-width=".5"/>`;
    s += `<text x="${padL-8}" y="${y+3.5}" text-anchor="end" font-size="9" fill="rgba(120,120,115,.75)">${v.toFixed(1)}</text>`;
  }

  /* batang */
  for (let i = 0; i < n; i++) {
    const x    = padL + i * (barW + gap);
    const v    = vals[i];
    const prev = i > 0 ? vals[i - 1] : v;
    const wasNull  = RAW[i][col] === null;
    const isFill   = wasNull && FILLED;
    const isMiss   = v === null;

    let fill, stroke;
    if (isMiss)      { fill = 'rgba(220,59,58,.70)'; stroke = 'rgba(220,59,58,.90)'; }
    else if (isFill) { fill = 'rgba(24,150,110,.75)'; stroke = 'rgba(24,150,110,.90)'; }
    else if (prev !== null && v >= prev)
                     { fill = 'rgba(45,95,163,.55)'; stroke = 'rgba(45,95,163,.70)'; }
    else             { fill = 'rgba(110,110,104,.38)'; stroke = 'rgba(110,110,104,.55)'; }

    if (isMiss) {
      const ym = padT + chartH / 2;
      s += `<rect x="${x}" y="${ym-13}" width="${barW}" height="26" fill="${fill}" stroke="${stroke}" stroke-width=".5" rx="1"/>`;
      s += `<line x1="${x+barW/2}" y1="${padT}" x2="${x+barW/2}" y2="${padT+chartH}" stroke="${stroke}" stroke-width=".6" stroke-dasharray="3,2"/>`;
    } else {
      const yH = toY(Math.max(v, prev ?? v));
      const yL = toY(Math.min(v, prev ?? v));
      const h  = Math.max(yL - yH, 2);
      const ym = toY(v);
      s += `<line x1="${x+barW/2}" y1="${padT}" x2="${x+barW/2}" y2="${ym}" stroke="${stroke}" stroke-width=".5" stroke-dasharray="2,2"/>`;
      s += `<rect x="${x}" y="${yH}" width="${barW}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width=".5" rx="1"/>`;
      s += `<line x1="${x+barW/2}" y1="${ym}" x2="${x+barW/2}" y2="${padT+chartH}" stroke="${stroke}" stroke-width=".5" stroke-dasharray="2,2"/>`;
    }

    if (i % 14 === 0) {
      s += `<text x="${x+barW/2}" y="${svgH-7}" text-anchor="middle" font-size="8" fill="rgba(110,110,104,.75)">${RAW[i].date.slice(5)}</text>`;
    }
  }

  s += '</svg>';
  document.getElementById('candle-wrap').innerHTML = s;

  /* badge */
  const stillMiss = vals.filter(v => v === null).length;
  const bm = document.getElementById('badge-miss');
  bm.textContent     = stillMiss ? `${stillMiss} hilang` : 'Semua lengkap';
  bm.className       = `badge ${stillMiss ? 'red' : 'green'}`;

  const bf = document.getElementById('badge-filled');
  if (FILLED && SUMMARY[col]?.length) {
    bf.style.display = '';
    bf.textContent   = `${SUMMARY[col].length} terisi`;
  } else {
    bf.style.display = 'none';
  }
}

/* ── Line chart ──────────────────────────────────────────────────────────── */
function renderLine() {
  const col     = ACTIVE;
  const rawVals = RAW.map(r => r[col]);
  const origMiss = new Set(rawVals.map((v, i) => v === null ? i : -1).filter(i => i >= 0));
  const labels   = RAW.map(r => r.date.slice(5));

  const datasets = [{
    label: 'Nilai asli',
    data:  rawVals,
    borderColor: '#2d5fa3',
    backgroundColor: 'rgba(45,95,163,.07)',
    borderWidth: 1.5,
    pointRadius:          rawVals.map((_, i) => origMiss.has(i) ? 4 : 2),
    pointBackgroundColor: rawVals.map((_, i) => origMiss.has(i) ? 'rgba(220,59,58,.75)' : '#2d5fa3'),
    tension: 0.3,
    spanGaps: false,
  }];

  if (FILLED && SUMMARY[col]?.length) {
    const pts = RAW.map((_, i) => origMiss.has(i) ? IMPUTED[i][col] : null);
    datasets.push({
      label: 'Imputasi',
      data: pts,
      borderWidth: 0,
      pointRadius:          pts.map(v => v !== null ? 6 : 0),
      pointBackgroundColor: '#18966e',
      pointBorderColor:     '#fff',
      pointBorderWidth:     1.5,
      showLine: false,
    });
  }

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(
    document.getElementById('lineChart').getContext('2d'),
    {
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
              label: c => c.raw !== null
                ? `${c.dataset.label}: ${Number(c.raw).toFixed(2)}`
                : null,
            },
          },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(120,120,115,.09)' } },
        },
      },
    }
  );

  let leg = `
    <li><span class="dot" style="background:#2d5fa3;border-radius:50%"></span>Nilai asli</li>
    <li><span class="dot" style="background:rgba(220,59,58,.65);border-radius:50%"></span>Posisi hilang</li>`;
  if (FILLED)
    leg += `<li><span class="dot" style="background:#18966e;border-radius:50%"></span>Nilai imputasi</li>`;
  document.getElementById('line-legend').innerHTML = leg;
}

/* ── Tabel ringkasan missing (awal, dari server) ─────────────────────────── */
function renderMissingTable() {
  /* sudah dirender server-side di HTML, tidak perlu JS */
}

/* ── Tabel detail setelah imputasi ──────────────────────────────────────── */
function renderDetailTable() {
  /* gabungkan semua kolom, urutkan per indeks */
  const rows = [];
  Object.keys(SUMMARY).forEach(col =>
    SUMMARY[col].forEach(e => rows.push({ col, ...e }))
  );
  rows.sort((a, b) => a.index - b.index || a.col.localeCompare(b.col));

  document.getElementById('detail-label').textContent =
    `(${rows.length} nilai terisi di ${Object.keys(SUMMARY).length} kolom)`;

  const html = rows.map(r => `
    <tr>
      <td>${r.index}</td>
      <td>${r.date}</td>
      <td class="mono">${r.col}</td>
      <td><span class="badge green">${r.imputed}</span></td>
    </tr>`).join('');

  document.getElementById('detail-body').innerHTML =
    html || '<tr><td colspan="4" class="empty">Tidak ada data hilang</td></tr>';
}

/* ── Init ────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', boot);