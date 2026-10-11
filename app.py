"""
AquaGuard AI – Flask Application Factory
"""

import os
import uuid
import json
from pathlib import Path
from dataclasses import asdict

import requests as http_requests

from flask import (
    Flask, render_template, request, jsonify,
    send_from_directory, abort, url_for
)
from werkzeug.utils import secure_filename

from config import Config
from database import (
    mongo, save_analysis, get_all_analyses,
    get_analysis_by_id, get_dashboard_stats, get_map_points, delete_analysis,
    save_satellite_analysis, get_all_satellite_analyses,
    get_satellite_analysis_by_id, delete_satellite_analysis,
)
from analyzer import analyze_water_image, analyze_satellite_image
from rivers_data import TOP_POLLUTED_RIVERS, TOP_CLEAN_RIVERS, DISEASE_RISKS


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Ensure upload folder exists
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)

    # MongoDB init
    mongo.init_app(app)

    # -----------------------------------------------------------------------
    # Utility
    # -----------------------------------------------------------------------

    def allowed_file(filename: str) -> bool:
        return (
            "." in filename
            and filename.rsplit(".", 1)[1].lower()
            in app.config["ALLOWED_EXTENSIONS"]
        )

    # -----------------------------------------------------------------------
    # Pages
    # -----------------------------------------------------------------------

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/dashboard")
    def dashboard():
        return render_template("dashboard.html")

    @app.route("/history")
    def history():
        return render_template("history.html")

    @app.route("/map")
    def map_view():
        return render_template("map.html")

    @app.route("/satellite")
    def satellite():
        return render_template("satellite.html")

    @app.route("/report/<analysis_id>")
    def report(analysis_id):
        record = get_analysis_by_id(analysis_id)
        if not record:
            abort(404)
        return render_template("report.html", record=record)

    @app.route("/satellite/report/<analysis_id>")
    def satellite_report(analysis_id):
        record = get_satellite_analysis_by_id(analysis_id)
        if not record:
            abort(404)
        return render_template("satellite_report.html", record=record)

    @app.route("/about")
    def about():
        return render_template("about.html")

    # -----------------------------------------------------------------------
    # API – Original analysis
    # -----------------------------------------------------------------------

    @app.route("/api/analyze", methods=["POST"])
    def api_analyze():
        """
        Accepts multipart/form-data with:
          - image       : image file (required unless demo_mode=true)
          - location    : text description (optional)
          - water_type  : ocean | river | lake | reservoir | other
          - latitude    : float (optional)
          - longitude   : float (optional)
          - demo_mode   : "true" to use a built-in sample image
        """
        demo_mode = request.form.get("demo_mode", "false").lower() == "true"
        demo_sample = request.form.get("demo_sample", "ocean1")

        if demo_mode:
            sample_path = _get_sample_image_path(demo_sample)
            if not sample_path:
                return jsonify({"error": "Demo sample not found"}), 404
            image_path = sample_path
            image_filename = Path(sample_path).name
        else:
            if "image" not in request.files:
                return jsonify({"error": "No image file provided"}), 400
            file = request.files["image"]
            if file.filename == "":
                return jsonify({"error": "No file selected"}), 400
            if not allowed_file(file.filename):
                return jsonify({"error": "File type not allowed"}), 400

            ext = file.filename.rsplit(".", 1)[1].lower()
            image_filename = f"{uuid.uuid4().hex}.{ext}"
            image_path = os.path.join(app.config["UPLOAD_FOLDER"], image_filename)
            file.save(image_path)

        # Run analysis
        try:
            result = analyze_water_image(image_path)
        except Exception as e:
            return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

        result_dict = asdict(result)

        # Build record for MongoDB
        record = {
            "image_filename": image_filename,
            "image_url": url_for("serve_upload", filename=image_filename, _external=False),
            "location_name": request.form.get("location", "Unknown Location"),
            "water_type": request.form.get("water_type", "unknown"),
            "latitude": _safe_float(request.form.get("latitude")),
            "longitude": _safe_float(request.form.get("longitude")),
            "demo_mode": demo_mode,
            **result_dict,
        }

        analysis_id = save_analysis(record)
        record["id"] = analysis_id

        return jsonify({"success": True, "analysis": record})

    @app.route("/api/analyses", methods=["GET"])
    def api_analyses():
        limit = min(int(request.args.get("limit", 50)), 200)
        return jsonify(get_all_analyses(limit))

    @app.route("/api/analyses/<analysis_id>", methods=["GET"])
    def api_analysis_detail(analysis_id):
        record = get_analysis_by_id(analysis_id)
        if not record:
            return jsonify({"error": "Not found"}), 404
        return jsonify(record)

    @app.route("/api/analyses/<analysis_id>", methods=["DELETE"])
    def api_delete_analysis(analysis_id):
        success = delete_analysis(analysis_id)
        if not success:
            return jsonify({"error": "Not found or already deleted"}), 404
        return jsonify({"success": True})

    @app.route("/api/dashboard/stats", methods=["GET"])
    def api_dashboard_stats():
        return jsonify(get_dashboard_stats())

    @app.route("/api/map/points", methods=["GET"])
    def api_map_points():
        return jsonify(get_map_points())

    @app.route("/api/demo/samples", methods=["GET"])
    def api_demo_samples():
        """Return list of available demo sample images."""
        samples_dir = Path("static/samples")
        samples = []
        if samples_dir.exists():
            for f in sorted(samples_dir.glob("*.jpg")) + sorted(samples_dir.glob("*.png")):
                key = f.stem
                samples.append({
                    "key": key,
                    "name": key.replace("_", " ").replace("-", " ").title(),
                    "url": url_for("static", filename=f"samples/{f.name}"),
                })
        return jsonify(samples)

    # -----------------------------------------------------------------------
    # API – Satellite Water Pollution Explorer
    # -----------------------------------------------------------------------

    @app.route("/api/satellite/geocode", methods=["GET"])
    def api_satellite_geocode():
        """
        Geocode a place name → {lat, lon, display_name} using Nominatim (free, no key).
        Rate limit: 1 req/sec per Nominatim policy.
        """
        q = request.args.get("q", "").strip()
        if not q:
            return jsonify({"error": "Query parameter 'q' is required"}), 400

        try:
            resp = http_requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "format": "json", "limit": 5},
                headers={"User-Agent": app.config.get("GEOCODER_UA", "AquaGuardAI/1.0")},
                timeout=8,
            )
            resp.raise_for_status()
            results = resp.json()
            if not results:
                return jsonify({"results": [], "message": "No locations found for that query."})

            simplified = [
                {
                    "display_name": r.get("display_name", ""),
                    "lat": float(r["lat"]),
                    "lon": float(r["lon"]),
                    "type": r.get("type", ""),
                    "class": r.get("class", ""),
                }
                for r in results[:5]
            ]
            return jsonify({"results": simplified})

        except http_requests.exceptions.Timeout:
            return jsonify({"error": "Geocoding service timed out. Try again."}), 503
        except http_requests.exceptions.ConnectionError:
            return jsonify({"error": "Cannot reach geocoding service. Check your internet connection."}), 503
        except Exception as e:
            return jsonify({"error": f"Geocoding failed: {str(e)}"}), 500

    @app.route("/api/satellite/analyze", methods=["POST"])
    def api_satellite_analyze():
        """
        Analyse a water image for the Satellite Explorer.

        Form fields:
          - image        : image file (required unless demo_sample is set)
          - demo_sample  : key of a sample image (optional)
          - location     : location name (required)
          - water_type   : ocean | river | lake | reservoir | other
          - latitude     : float (optional but recommended)
          - longitude    : float (optional but recommended)
          - image_date   : YYYY-MM-DD (optional, for satellite link generation)
        """
        location_name = request.form.get("location", "").strip() or "Unknown Location"
        water_type    = request.form.get("water_type", "unknown")
        latitude      = _safe_float(request.form.get("latitude"))
        longitude     = _safe_float(request.form.get("longitude"))
        image_date    = request.form.get("image_date", "").strip() or None
        demo_sample   = request.form.get("demo_sample", "").strip()

        # Resolve image path
        if demo_sample:
            sample_path = _get_sample_image_path(demo_sample)
            if not sample_path:
                return jsonify({"error": f"Demo sample '{demo_sample}' not found"}), 404
            image_path = sample_path
            image_filename = Path(sample_path).name
        elif "image" in request.files and request.files["image"].filename:
            file = request.files["image"]
            if not allowed_file(file.filename):
                return jsonify({"error": "File type not allowed"}), 400
            ext = file.filename.rsplit(".", 1)[1].lower()
            image_filename = f"{uuid.uuid4().hex}.{ext}"
            image_path = os.path.join(app.config["UPLOAD_FOLDER"], image_filename)
            file.save(image_path)
        else:
            return jsonify({"error": "No image provided. Upload a file or select a demo sample."}), 400

        # Run satellite analysis (with overlay generation)
        try:
            result = analyze_satellite_image(
                image_path,
                location_name=location_name,
                latitude=latitude,
                longitude=longitude,
                image_date=image_date,
                water_type=water_type,
            )
        except Exception as e:
            return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

        result_dict = asdict(result)

        # Don't store the large b64 overlay in MongoDB – store a flag instead
        overlay_b64 = result_dict.pop("overlay_image_b64", "")

        db_record = {
            "image_filename": image_filename,
            "image_url": url_for("serve_upload", filename=image_filename, _external=False),
            "analysis_type": "satellite",
            **result_dict,
        }

        from datetime import datetime, timezone as _tz
        analysis_id = save_satellite_analysis(db_record)
        db_record["id"] = analysis_id
        db_record["analyzed_at"] = datetime.now(_tz.utc).isoformat()
        db_record["overlay_image_b64"] = overlay_b64  # returned in response but not stored in DB

        return jsonify({"success": True, "analysis": db_record})

    @app.route("/api/satellite/analyses", methods=["GET"])
    def api_satellite_analyses():
        limit = min(int(request.args.get("limit", 50)), 200)
        return jsonify(get_all_satellite_analyses(limit))

    @app.route("/api/satellite/analyses/<analysis_id>", methods=["GET"])
    def api_satellite_analysis_detail(analysis_id):
        record = get_satellite_analysis_by_id(analysis_id)
        if not record:
            return jsonify({"error": "Not found"}), 404
        return jsonify(record)

    @app.route("/api/satellite/analyses/<analysis_id>", methods=["DELETE"])
    def api_satellite_delete(analysis_id):
        success = delete_satellite_analysis(analysis_id)
        if not success:
            return jsonify({"error": "Not found or already deleted"}), 404
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # API – Rivers reference data
    # -----------------------------------------------------------------------

    @app.route("/api/rivers/polluted", methods=["GET"])
    def api_rivers_polluted():
        """Return the top 5 most polluted rivers with disease/health risk data."""
        enriched = []
        for river in TOP_POLLUTED_RIVERS:
            r = dict(river)
            r["health_risks"] = DISEASE_RISKS.get(river["disease_profile"], DISEASE_RISKS["high_generic"])
            enriched.append(r)
        return jsonify({"rivers": enriched, "data_note": (
            "Data sourced from WHO, UNEP, WRI, CPCB, and peer-reviewed environmental reports. "
            "Figures represent published estimates — not real-time sensor readings."
        )})

    @app.route("/api/rivers/clean", methods=["GET"])
    def api_rivers_clean():
        """Return the top 5 cleanest rivers with quality indicators."""
        enriched = []
        for river in TOP_CLEAN_RIVERS:
            r = dict(river)
            r["health_risks"] = DISEASE_RISKS.get(river["disease_profile"], DISEASE_RISKS["low_risk"])
            enriched.append(r)
        return jsonify({"rivers": enriched, "data_note": (
            "Data sourced from EEA, ICPR, SYKE, ECCC, and national water quality monitoring programmes. "
            "Figures represent published estimates — not real-time sensor readings."
        )})

    @app.route("/api/map/click-analyze", methods=["POST"])
    def api_map_click_analyze():
        """
        Analyse a water body that the user clicked on the map.

        JSON body:
          - lat          : float (required)
          - lon          : float (required)
          - water_type   : ocean | river | lake | reservoir | other (optional)
          - location_name: string (optional)
          - demo_sample  : override sample key (optional)
        """
        data = request.get_json(silent=True) or {}
        lat = _safe_float(data.get("lat"))
        lon = _safe_float(data.get("lon"))
        water_type = data.get("water_type", "river")
        location_name = data.get("location_name", "Selected Location")
        demo_sample_override = data.get("demo_sample", "")

        if lat is None or lon is None:
            return jsonify({"error": "lat and lon are required"}), 400

        # Choose representative sample image based on water type and location
        if demo_sample_override:
            sample_key = demo_sample_override
        else:
            sample_key = _choose_sample_for_location(lat, lon, water_type)

        sample_path = _get_sample_image_path(sample_key)
        if not sample_path:
            # Fallback
            sample_path = _get_sample_image_path("river_algae")
            sample_key = "river_algae"

        if not sample_path:
            return jsonify({"error": "No sample image available for analysis"}), 404

        try:
            result = analyze_satellite_image(
                sample_path,
                location_name=location_name,
                latitude=lat,
                longitude=lon,
                image_date=None,
                water_type=water_type,
            )
        except Exception as e:
            return jsonify({"error": f"Analysis failed: {str(e)}"}), 500

        from dataclasses import asdict as _asdict
        result_dict = _asdict(result)
        overlay_b64 = result_dict.pop("overlay_image_b64", "")

        # Determine disease/health risk profile based on risk level & scores
        health_profile = _pick_disease_profile(
            result.risk_level,
            result.algae_score,
            result.dark_patch_score,
        )
        health_risks = DISEASE_RISKS.get(health_profile, DISEASE_RISKS["low_risk"])

        db_record = {
            "image_filename": Path(sample_path).name,
            "image_url": url_for("static", filename=f"samples/{Path(sample_path).name}", _external=False),
            "analysis_type": "map_click",
            "clicked_lat": lat,
            "clicked_lon": lon,
            **result_dict,
        }

        analysis_id = save_satellite_analysis(db_record)

        return jsonify({
            "success": True,
            "analysis": {
                **db_record,
                "id": analysis_id,
                "overlay_image_b64": overlay_b64,
                "image_url": url_for("static", filename=f"samples/{Path(sample_path).name}", _external=False),
                "sample_key": sample_key,
            },
            "health_risks": health_risks,
            "disclaimer": (
                "⚠️ This analysis uses a representative sample image for the selected "
                "water body type. It is an educational estimate only — NOT a real-time "
                "satellite reading of the clicked location. For actual water quality at "
                "this location, consult official monitoring authorities."
            ),
        })

    # -----------------------------------------------------------------------
    # Static file serving for uploads
    # -----------------------------------------------------------------------

    @app.route("/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    # -----------------------------------------------------------------------
    # Error handlers
    # -----------------------------------------------------------------------

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found"}), 404
        return render_template("404.html"), 404

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "File too large. Maximum size is 16 MB."}), 413

    @app.errorhandler(500)
    def internal_error(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Internal server error", "detail": str(e)}), 500
        return render_template("500.html"), 500

    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(value) -> float | None:
    try:
        return float(value) if value else None
    except (TypeError, ValueError):
        return None


def _get_sample_image_path(sample_key: str) -> str | None:
    samples_dir = Path("static/samples")
    for ext in ["jpg", "jpeg", "png"]:
        candidate = samples_dir / f"{sample_key}.{ext}"
        if candidate.exists():
            return str(candidate)
    return None


def _choose_sample_for_location(lat: float, lon: float, water_type: str) -> str:
    """
    Pick a representative sample image key based on geographic region and water type.
    The images are representative illustrative samples — they are never presented as
    actual satellite imagery of the clicked coordinates.
    """
    # Polar / Arctic regions → clean
    if abs(lat) > 60:
        return "lake_clean"

    # Tropical / equatorial band with heavy industry corridors
    if -10 < lat < 35 and 60 < lon < 130:
        # South/Southeast Asia industrial corridor
        return "river_oil"

    # South Asia
    if 8 < lat < 37 and 60 < lon < 92:
        return "river_algae"

    # Central/South America
    if -40 < lat < 10 and -80 < lon < -35:
        return "ocean_turbid"

    # Ocean click
    if water_type in ("ocean", "sea"):
        return "ocean_clean"

    # Lake / reservoir
    if water_type in ("lake", "reservoir"):
        return "lake_clean"

    # Default river
    return "river_algae"


def _pick_disease_profile(risk_level: str, algae_score: float, dark_score: float) -> str:
    """Map analysis result to a disease risk profile key."""
    if risk_level == "Low":
        return "low_risk"
    if algae_score > 40:
        return "algae_bloom"
    if dark_score > 45:
        return "industrial"
    if risk_level == "High":
        return "high_generic"
    return "turbid_sediment"
