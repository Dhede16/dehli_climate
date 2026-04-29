# Delhi Climate — Visualisasi & Imputasi Data Hilang

Aplikasi web Django untuk memvisualisasikan dan mengisi nilai hilang
pada dataset iklim harian Delhi (Jan–Apr 2017).

## Struktur Proyek

```
delhi_climate/
├── manage.py
├── requirements.txt
├── data/
│   └── DailyDelhiClimateTest.csv
│
├── delhi_climate/          ← konfigurasi Django
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
│
└── climate_app/            ← aplikasi utama
    ├── views.py            ← logika backend + algoritma imputasi
    ├── urls.py
    ├── templates/
    │   └── climate_app/
    │       └── index.html  ← template HTML (Django template language)
    └── static/
        └── climate_app/
            ├── css/
            │   └── style.css   ← semua styling
            └── js/
                └── main.js     ← candle chart, line chart, fetch API
```

## Cara Menjalankan

```bash
# 1. Install dependensi
pip install -r requirements.txt

# 2. Jalankan server
python manage.py runserver

# 3. Buka browser
http://127.0.0.1:8000/
```

## API Endpoints

| Endpoint       | Method | Keterangan                              |
|---------------|--------|-----------------------------------------|
| `/`            | GET    | Halaman utama dashboard                 |
| `/api/data/`   | GET    | Data mentah JSON (114 baris)            |
| `/api/impute/` | POST   | Imputasi data hilang untuk kolom+algoritma tertentu |

### Contoh request `/api/impute/`

```json
POST /api/impute/
Content-Type: application/json

{ "col": "wind_speed", "algo": "spline" }
```

### Response

```json
{
  "col": "wind_speed",
  "algo": "spline",
  "algo_name": "Cubic Spline Interpolation",
  "filled": [2.74, 2.89, ..., 12.15],
  "missing_indices": [25, 27, 30, ...]
}
```

## Algoritma Imputasi Cubic Spline Interpolation

Algoritma Imputasi Cubic Spline Interpolation adalah metode numerik untuk mengisi nilai data yang hilang (missing values) dengan cara membangun kurva mulus yang melewati titik-titik data yang diketahui. Metode ini menggunakan polinomial kubik piecewise (potongan-potongan) derajat tiga yang bergabung pada titik-titik data (knots), memastikan kelancaran turunan pertama dan kedua.
