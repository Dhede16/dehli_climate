import json
import math
import pandas as pd
from django.shortcuts import render
from django.http import JsonResponse
from django.conf import settings


# ─── Data loading ────────────────────────────────────────────────────────────

def load_data():
    """Load CSV and return list of dicts with None for NaN."""
    df = pd.read_csv(settings.DATA_FILE)
    records = df.to_dict(orient='records')
    for row in records:
        for k, v in row.items():
            if isinstance(v, float) and math.isnan(v):
                row[k] = None
    return records


# ─── Imputation algorithms ───────────────────────────────────────────────────

def impute_cubic_spline(arr):
    """
    Cubic Hermite spline interpolation.
    Fills gaps using smooth cubic curves fitted between known anchor points.
    Considers values both before AND after each gap (unlike forward/backward fill).
    """
    n = len(arr)
    known = [{'i': i, 'v': arr[i]} for i in range(n) if arr[i] is not None]
    result = list(arr)

    for k in range(len(known) - 1):
        i0, v0 = known[k]['i'], known[k]['v']
        i1, v1 = known[k + 1]['i'], known[k + 1]['v']
        d = i1 - i0

        m0 = ((known[k + 1]['v'] - known[k - 1]['v']) / (known[k + 1]['i'] - known[k - 1]['i'])
              if k > 0 else (v1 - v0) / d)
        m1 = ((known[k + 2]['v'] - known[k]['v']) / (known[k + 2]['i'] - known[k]['i'])
              if k < len(known) - 2 else (v1 - v0) / d)

        for x in range(i0 + 1, i1):
            t = (x - i0) / d
            h00 = 2*t**3 - 3*t**2 + 1
            h10 = t**3 - 2*t**2 + t
            h01 = -2*t**3 + 3*t**2
            h11 = t**3 - t**2
            result[x] = h00*v0 + h10*d*m0 + h01*v1 + h11*d*m1

    # Edge padding
    if known:
        first, last = known[0], known[-1]
        for i in range(first['i']):
            result[i] = first['v']
        for i in range(last['i'] + 1, n):
            result[i] = last['v']

    return result


def impute_seasonal(arr):
    """
    Seasonal decomposition imputation.
    Splits the series into trend (local linear regression) + seasonal component
    (7-day period estimated from known values), then fills gaps with trend + seasonal.
    """
    n = len(arr)
    known = [{'i': i, 'v': arr[i]} for i in range(n) if arr[i] is not None]
    if len(known) < 2:
        return list(arr)

    xs = [p['i'] for p in known]
    ys = [p['v'] for p in known]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs) or 1
    slope = num / den
    intercept = mean_y - slope * mean_x

    period = 7
    seasonal = []
    for p in range(period):
        pts = [pt['v'] - (slope * pt['i'] + intercept) for pt in known if pt['i'] % period == p]
        seasonal.append(sum(pts) / len(pts) if pts else 0.0)

    result = list(arr)
    for i in range(n):
        if result[i] is None:
            result[i] = slope * i + intercept + seasonal[i % period]
    return result


def impute_weighted_moving_avg(arr, k=5):
    """
    Weighted Moving Average (WMA).
    Fills each gap with a distance-weighted average of the nearest K known
    neighbours on both sides. Closer neighbours receive higher weight (1/distance).
    """
    result = list(arr)
    for i in range(len(arr)):
        if arr[i] is not None:
            continue
        numerator = denominator = 0.0
        for j in range(max(0, i - k), min(len(arr), i + k + 1)):
            if arr[j] is not None:
                w = 1.0 / (abs(j - i) + 1)
                numerator += arr[j] * w
                denominator += w
        if denominator > 0:
            result[i] = numerator / denominator
    return result


def impute_loess(arr, radius=7):
    """
    Local Linear Regression (LOESS-like).
    Fits a weighted linear model within a ±radius window around each gap.
    Captures local trends without being influenced by distant data points.
    """
    result = list(arr)
    for i in range(len(arr)):
        if arr[i] is not None:
            continue
        lo, hi = max(0, i - radius), min(len(arr) - 1, i + radius)
        pts = [{'j': j, 'v': arr[j]} for j in range(lo, hi + 1) if arr[j] is not None]
        if len(pts) < 2:
            if len(pts) == 1:
                result[i] = pts[0]['v']
            continue
        mx = sum(p['j'] for p in pts) / len(pts)
        my = sum(p['v'] for p in pts) / len(pts)
        num = sum((p['j'] - mx) * (p['v'] - my) for p in pts)
        den = sum((p['j'] - mx) ** 2 for p in pts) or 1
        slope = num / den
        result[i] = my + slope * (i - mx)
    return result


def impute_knn(data, col, k=5):
    """
    K-Nearest Neighbours (KNN) imputation.
    Finds K most similar rows using all other numeric columns as features
    (Euclidean distance in normalised feature space, blended with temporal proximity).
    Fills the gap with a distance-weighted average of the K neighbours' values.
    """
    features = [c for c in ['meantemp', 'humidity', 'wind_speed', 'meanpressure'] if c != col]
    result = [dict(row) for row in data]
    missing_idx = [i for i, r in enumerate(data) if r[col] is None]
    avail_idx   = [i for i, r in enumerate(data) if r[col] is not None]

    def normalize(feature):
        vals = [data[i][feature] for i in range(len(data)) if data[i][feature] is not None]
        mn, mx = min(vals), max(vals)
        rng = mx - mn or 1
        return [(data[i][feature] - mn) / rng if data[i][feature] is not None else None
                for i in range(len(data))]

    norms = {f: normalize(f) for f in features}

    for mi in missing_idx:
        dists = []
        for ai in avail_idx:
            sq = cnt = 0
            for f in features:
                a, b = norms[f][ai], norms[f][mi]
                if a is not None and b is not None:
                    sq += (a - b) ** 2
                    cnt += 1
            feat_dist = math.sqrt(sq / cnt) if cnt else 1.0
            pos_dist  = math.sqrt(((mi - ai) / len(data)) ** 2)
            dists.append({'ai': ai, 'dist': feat_dist * 0.9 + pos_dist * 0.1})

        dists.sort(key=lambda d: d['dist'])
        neighbours = dists[:k]
        total_w = sum(1 / (d['dist'] + 1e-6) for d in neighbours)
        result[mi][col] = sum(data[d['ai']][col] / (d['dist'] + 1e-6)
                              for d in neighbours) / total_w

    return result


# ─── Views ───────────────────────────────────────────────────────────────────

COLUMNS = ['meantemp', 'humidity', 'wind_speed', 'meanpressure']

ALGO_META = {
    'spline': {
        'name': 'Cubic Spline Interpolation',
        'desc': (
            'Mengisi nilai kosong dengan menghubungkan titik-titik data yang ada '
            'menggunakan kurva kubik yang mulus. Algoritma ini mempertahankan '
            'kelancaran perubahan dan cocok untuk data deret waktu yang berubah '
            'bertahap (suhu, tekanan). Berbeda dengan forward/backward fill, '
            'metode ini mempertimbangkan nilai sebelum DAN sesudah titik kosong.'
        ),
    },
    'seasonal': {
        'name': 'Dekomposisi Musiman',
        'desc': (
            'Menguraikan deret waktu menjadi komponen tren + musiman + residual. '
            'Nilai kosong diisi dengan menambahkan nilai tren (dari regresi lokal) '
            'dengan pola musiman yang diestimasi dari data yang ada. Cocok untuk '
            'data iklim yang memiliki pola periodik mingguan atau bulanan.'
        ),
    },
    'moving_avg': {
        'name': 'Moving Average Tertimbang (WMA)',
        'desc': (
            'Menghitung rata-rata tertimbang dari K titik tetangga terdekat yang '
            'tersedia, dengan bobot berbanding terbalik terhadap jaraknya (titik '
            'lebih dekat = bobot lebih besar). Lebih akurat dari simple moving '
            'average karena memperhatikan kedekatan temporal titik referensi.'
        ),
    },
    'regression': {
        'name': 'Regresi Linear Lokal (LOESS)',
        'desc': (
            'Membangun model regresi linear dari titik-titik data dalam jendela '
            'lokal di sekitar setiap nilai kosong. Model ini dilatih hanya pada '
            'data terdekat (radius ±7 hari), sehingga bisa menangkap tren lokal '
            'dengan baik tanpa terpengaruh data jauh yang mungkin memiliki pola berbeda.'
        ),
    },
    'knn': {
        'name': 'K-Nearest Neighbors (KNN)',
        'desc': (
            'Menemukan K data terdekat berdasarkan nilai kolom lain (fitur pendamping). '
            'Nilai kosong diisi dengan rata-rata tertimbang dari nilai K tetangga paling '
            'mirip secara multivariat. Algoritma ini memanfaatkan korelasi antar kolom '
            '(misal: suhu tinggi → kelembaban rendah) untuk estimasi lebih akurat.'
        ),
    },
}


def index(request):
    """Render the main dashboard page."""
    data = load_data()
    missing_per_col = {col: sum(1 for r in data if r[col] is None) for col in COLUMNS}
    affected_rows   = sum(1 for r in data if any(r[c] is None for c in COLUMNS))
    total_missing   = sum(missing_per_col.values())
    worst_col       = max(missing_per_col, key=missing_per_col.get)

    context = {
        'total_rows':    len(data),
        'total_missing': total_missing,
        'affected_rows': affected_rows,
        'worst_col':     worst_col,
        'worst_count':   missing_per_col[worst_col],
        'missing_per_col': missing_per_col,
        'algo_meta':     ALGO_META,
        'columns':       COLUMNS,
    }
    return render(request, 'climate_app/index.html', context)


def api_data(request):
    """Return raw dataset as JSON."""
    return JsonResponse({'data': load_data()})


def api_impute(request):
    """
    POST endpoint: impute missing values for a given column using the chosen algorithm.
    Request body: { "col": "wind_speed", "algo": "spline" }
    Response:     { "filled": [...114 floats...], "missing_indices": [...] }
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        body = json.loads(request.body)
        col  = body.get('col', 'wind_speed')
        algo = body.get('algo', 'spline')
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if col not in COLUMNS:
        return JsonResponse({'error': f'Unknown column: {col}'}, status=400)
    if algo not in ALGO_META:
        return JsonResponse({'error': f'Unknown algorithm: {algo}'}, status=400)

    data = load_data()
    arr  = [r[col] for r in data]
    missing_indices = [i for i, v in enumerate(arr) if v is None]

    if algo == 'spline':
        filled = impute_cubic_spline(arr)
    elif algo == 'seasonal':
        filled = impute_seasonal(arr)
    elif algo == 'moving_avg':
        filled = impute_weighted_moving_avg(arr)
    elif algo == 'regression':
        filled = impute_loess(arr)
    elif algo == 'knn':
        result = impute_knn(data, col)
        filled = [r[col] for r in result]

    return JsonResponse({
        'col':             col,
        'algo':            algo,
        'algo_name':       ALGO_META[algo]['name'],
        'filled':          filled,
        'missing_indices': missing_indices,
    })
