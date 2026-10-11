# AquaGuard AI – Water Pollution Detection System

> **Supporting UN SDG 14: Life Below Water**

A complete, modern, responsive web application for experimental image-based water pollution risk estimation.  Built with Python Flask, OpenCV, MongoDB Atlas, Leaflet.js, and Chart.js.

---

## ⚠️ Important Disclaimer

Results produced by AquaGuard AI are **experimental estimates based on pixel-level image analysis only**.  They do **not** confirm actual water pollution and must not be used as a substitute for certified laboratory water-quality testing.  Always consult qualified environmental agencies for authoritative assessments.

---

## Features

| Feature | Description |
|---|---|
| Image Upload | Upload PNG/JPG/WebP images of oceans, rivers, lakes |
| Demo Mode | 8 built-in synthetic sample images, no upload needed |
| CV Analysis | Colour anomaly, turbidity proxy, algae bloom indicator, dark-patch detection |
| Risk Levels | Low / Medium / High with score breakdown and explanations |
| Interactive Map | Leaflet.js map with colour-coded risk markers |
| Dashboard | Chart.js pie, donut, and trend charts with KPI cards |
| History | Filterable grid of all past analyses |
| Reports | Printable per-analysis report pages |
| MongoDB | All results stored in MongoDB Atlas (free tier) |
| Responsive | Bootstrap 5 – works on desktop and mobile |

---

## Technology Stack

- **Backend:** Python 3.11+, Flask 3.x
- **Image Analysis:** OpenCV (opencv-python-headless), NumPy
- **Database:** MongoDB Atlas (free tier) via PyMongo / Flask-PyMongo
- **Frontend:** Bootstrap 5, Vanilla JavaScript
- **Maps:** Leaflet.js + OpenStreetMap (free)
- **Charts:** Chart.js 4.x
- **Deployment:** Gunicorn

---

## Quick Start

### 1 – Clone / download the project

```bash
cd aquaguard-ai
```

### 2 – Create a virtual environment

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate
```

### 3 – Install dependencies

```bash
pip install -r requirements.txt
```

### 4 – Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```
SECRET_KEY=your-long-random-secret
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/aquaguard?retryWrites=true&w=majority
```

#### Getting a free MongoDB Atlas URI

1. Create a free account at <https://www.mongodb.com/atlas>
2. Create a **Free (M0)** cluster
3. Under **Database Access** create a user with read/write permissions
4. Under **Network Access** add `0.0.0.0/0` (or your IP)
5. Click **Connect → Drivers** and copy the connection string
6. Replace `<password>` in the string and paste it as `MONGO_URI` in `.env`

> **Local MongoDB alternative:** set `MONGO_URI=mongodb://localhost:27017/aquaguard` and run MongoDB locally.

### 5 – Generate sample images (first run only)

```bash
python generate_samples.py
```

### 6 – Run the development server

```bash
python run.py
```

Open <http://localhost:5000> in your browser.

---

## Production Deployment

```bash
gunicorn "app:create_app()" --workers 3 --bind 0.0.0.0:8000
```

Set `FLASK_DEBUG=False` in `.env` before deploying.

---

## Project Structure

```
aquaguard-ai/
├── app.py                  # Flask app factory & routes
├── analyzer.py             # OpenCV image analysis module
├── database.py             # MongoDB operations
├── config.py               # Configuration from environment
├── run.py                  # Development server entry point
├── generate_samples.py     # One-time sample image generator
├── requirements.txt
├── .env.example
├── uploads/                # User-uploaded images (auto-created)
├── static/
│   ├── css/aquaguard.css
│   ├── js/
│   │   ├── aquaguard.js    # Shared utilities
│   │   ├── analyze.js      # Upload/demo page
│   │   ├── dashboard.js    # Charts
│   │   ├── history.js      # History grid
│   │   └── map.js          # Leaflet map
│   └── samples/            # Demo images (8 synthetic samples)
└── templates/
    ├── base.html
    ├── index.html          # Analyze page
    ├── dashboard.html
    ├── history.html
    ├── map.html
    ├── report.html
    ├── about.html
    ├── 404.html
    └── 500.html
```

---

## Analysis Methodology

The composite risk score (0–100) is a weighted sum of four independent sub-scores:

| Indicator | Weight | Method |
|---|---|---|
| Colour Anomaly | 35 % | Hue analysis in HSV space – deviation from healthy water hues |
| Turbidity Proxy | 25 % | Lightness channel (L*) variance in CIE Lab space |
| Algae Bloom | 20 % | Green–blue channel ratio in RGB space |
| Dark Patches | 20 % | Low-value, low-saturation pixel fraction |

Thresholds: 0–24 = Low, 25–54 = Medium, 55–100 = High.

Full implementation with inline documentation: `analyzer.py`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | (required) | Flask secret key |
| `MONGO_URI` | `mongodb://localhost:27017/aquaguard` | MongoDB connection string |
| `FLASK_DEBUG` | `False` | Enable debug mode |
| `UPLOAD_FOLDER` | `uploads` | Directory for uploaded images |
| `MAX_CONTENT_LENGTH` | `16777216` | Max upload size in bytes (16 MB) |

---

## License

MIT License – free to use, modify, and distribute.

---

*Built for UN SDG 14: Life Below Water*
