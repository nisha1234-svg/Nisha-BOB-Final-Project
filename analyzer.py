"""
AquaGuard AI – Water Pollution Analysis Module
===============================================
Uses OpenCV image-processing techniques to estimate potential
pollution risk in water body images.

IMPORTANT DISCLAIMER:
  These are EXPERIMENTAL ESTIMATES based on pixel-level colour
  and texture analysis only.  They do NOT constitute scientific
  confirmation of actual water pollution.  Always consult
  certified environmental agencies for authoritative assessments.

Methodology (transparent):
  1. Colour analysis  – dominant hues outside the healthy blue/green
     water palette (brownish, yellowish, greyish tones) suggest
     possible turbidity or contamination.
  2. Turbidity proxy  – standard deviation of brightness in the image;
     higher variance in non-sky regions correlates with suspended
     sediments or foam.
  3. Green-band excess – algae blooms produce unusually high green
     channel values relative to blue.
  4. Dark-patch detection – oil slicks and heavy sediment cause very
     dark, low-saturation regions on water surfaces.
  5. Composite score    – weighted sum normalised to 0–100.
"""

import cv2
import numpy as np
from dataclasses import dataclass, field
from typing import Tuple


@dataclass
class AnalysisResult:
    risk_level: str           # "Low" | "Medium" | "High"
    risk_score: float         # 0–100
    color_score: float
    turbidity_score: float
    algae_score: float
    dark_patch_score: float
    dominant_colors: list
    explanation: str
    recommendations: list
    confidence: str           # "Low" | "Moderate" | "High"
    disclaimer: str = (
        "⚠️ EXPERIMENTAL ESTIMATE: This analysis is based solely on image "
        "pixel data and does NOT confirm actual water pollution. It is intended "
        "for educational and awareness purposes only. For authoritative results, "
        "consult certified environmental testing laboratories."
    )


def analyze_water_image(image_path: str) -> AnalysisResult:
    """
    Analyse a water-body image and return a structured risk estimate.
    """
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise ValueError(f"Cannot read image: {image_path}")

    # Resize to a standard size for consistent analysis
    img_bgr = cv2.resize(img_bgr, (640, 480))
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2Lab)

    color_score = _color_anomaly_score(img_hsv, img_rgb)
    turbidity_score = _turbidity_score(img_lab)
    algae_score = _algae_bloom_score(img_rgb)
    dark_patch_score = _dark_patch_score(img_hsv)
    dominant_colors = _dominant_colors(img_rgb)

    # Weighted composite (weights sum to 1.0)
    composite = (
        color_score * 0.35
        + turbidity_score * 0.25
        + algae_score * 0.20
        + dark_patch_score * 0.20
    )
    composite = float(np.clip(composite, 0, 100))

    risk_level, explanation, recommendations, confidence = _classify(
        composite, color_score, turbidity_score, algae_score, dark_patch_score
    )

    return AnalysisResult(
        risk_level=risk_level,
        risk_score=round(composite, 1),
        color_score=round(color_score, 1),
        turbidity_score=round(turbidity_score, 1),
        algae_score=round(algae_score, 1),
        dark_patch_score=round(dark_patch_score, 1),
        dominant_colors=dominant_colors,
        explanation=explanation,
        recommendations=recommendations,
        confidence=confidence,
    )


# ---------------------------------------------------------------------------
# Sub-analysis helpers
# ---------------------------------------------------------------------------

def _color_anomaly_score(hsv: np.ndarray, rgb: np.ndarray) -> float:
    """
    Score how far the image colours deviate from healthy water hues
    (deep blues and blue-greens, hue ≈ 90–220 °).
    Brown, yellow, grey, and red hues suggest sediment / industrial runoff.
    """
    h, s, v = cv2.split(hsv)

    # Mask out very dark (sky at dusk) or very bright pixels (sun glare)
    active = (v > 30) & (v < 240) & (s > 20)
    if active.sum() < 500:
        return 20.0  # not enough usable pixels

    active_h = h[active].astype(float) * 2  # OpenCV hue is 0–179 → 0–358

    # Healthy water: hue 170–230 ° (blues) and 100–170 ° (blue-greens)
    healthy_mask = (active_h >= 100) & (active_h <= 230)
    anomaly_ratio = 1.0 - (healthy_mask.sum() / active_h.size)

    # Extra weight for reddish-brown (hue 0–30 and 330–360)
    red_brown = ((active_h <= 30) | (active_h >= 330)).sum() / active_h.size
    yellow = ((active_h > 30) & (active_h <= 70)).sum() / active_h.size

    score = (anomaly_ratio * 50) + (red_brown * 30) + (yellow * 20)
    return float(np.clip(score, 0, 100))


def _turbidity_score(lab: np.ndarray) -> float:
    """
    Proxy for turbidity via lightness channel variance and mean.
    Murky, sediment-laden water shows higher variance and a brighter
    (milky) or darker L* than clean water.
    """
    l_channel = lab[:, :, 0].astype(float)
    std_l = float(np.std(l_channel))
    mean_l = float(np.mean(l_channel))

    # High std → variable brightness (foam, debris, sediment patches)
    std_score = np.clip((std_l - 20) / 60 * 100, 0, 100)

    # Very bright or very dark lightness → murky / oil-covered water
    brightness_dev = abs(mean_l - 100) / 100  # 100 ≈ neutral mid-grey in Lab
    brightness_score = np.clip(brightness_dev * 100, 0, 100)

    return float((std_score * 0.6 + brightness_score * 0.4))


def _algae_bloom_score(rgb: np.ndarray) -> float:
    """
    Detect green-channel dominance suggesting algae blooms.
    Healthy water: blue ≥ green.  Bloom: green >> blue.
    """
    r = rgb[:, :, 0].astype(float)
    g = rgb[:, :, 1].astype(float)
    b = rgb[:, :, 2].astype(float)

    denom = b + 1.0
    green_excess = (g - b) / denom  # positive → more green than blue

    bloom_pixels = (green_excess > 0.3).sum()
    ratio = bloom_pixels / green_excess.size

    # Also penalise yellowish-green (r≈g >> b)
    yellow_green = ((g > 100) & (r > 80) & (b < 80)).sum() / green_excess.size

    score = ratio * 70 + yellow_green * 30
    return float(np.clip(score * 100, 0, 100))


def _dark_patch_score(hsv: np.ndarray) -> float:
    """
    Oil slicks and heavy pollution manifest as very dark, low-saturation
    irregular patches across the water surface.
    """
    h, s, v = cv2.split(hsv)

    dark_low_sat = ((v < 60) & (s < 50)).sum()
    ratio = dark_low_sat / v.size

    score = ratio * 200  # amplified because dark patches are strongly indicative
    return float(np.clip(score, 0, 100))


def _dominant_colors(rgb: np.ndarray, k: int = 5) -> list:
    """
    k-means clustering to find dominant RGB colours in the image.
    """
    pixels = rgb.reshape(-1, 3).astype(np.float32)
    # Sample at most 5000 pixels for speed
    if pixels.shape[0] > 5000:
        idx = np.random.choice(pixels.shape[0], 5000, replace=False)
        pixels = pixels[idx]

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(
        pixels, k, None, criteria, 5, cv2.KMEANS_RANDOM_CENTERS
    )
    counts = np.bincount(labels.flatten(), minlength=k)
    total = counts.sum()
    sorted_idx = np.argsort(-counts)

    result = []
    for i in sorted_idx:
        r, g, b = int(centers[i][0]), int(centers[i][1]), int(centers[i][2])
        hex_color = f"#{r:02x}{g:02x}{b:02x}"
        pct = round(float(counts[i]) / total * 100, 1)
        result.append({"hex": hex_color, "rgb": [r, g, b], "percent": pct})
    return result


def _classify(
    composite: float,
    color: float,
    turbidity: float,
    algae: float,
    dark: float,
) -> Tuple[str, str, list, str]:
    """
    Map composite score to risk level with explanation and recommendations.
    """
    # Determine primary driver
    scores = {
        "Colour Anomaly": color,
        "Turbidity": turbidity,
        "Algae Bloom Indicators": algae,
        "Dark Patch Detection": dark,
    }
    primary_driver = max(scores, key=scores.get)

    driver_explanations = {
        "Colour Anomaly": (
            "The image shows colour tones (brownish, yellowish, or reddish) "
            "that differ from typical clear-water hues, which may indicate "
            "sediment runoff, industrial discharge, or organic matter."
        ),
        "Turbidity": (
            "The image shows uneven brightness distribution, which can be a "
            "visual proxy for turbidity — suspended particles, sediment, or "
            "foam that scatter light through the water."
        ),
        "Algae Bloom Indicators": (
            "Elevated green-channel values relative to blue suggest possible "
            "algae or cyanobacteria bloom conditions, often linked to excess "
            "nutrients (eutrophication) from agricultural or urban runoff."
        ),
        "Dark Patch Detection": (
            "Dark, low-saturation regions detected on the water surface may "
            "indicate oil sheens, dense organic matter, or heavy sedimentation."
        ),
    }

    if composite < 25:
        risk_level = "Low"
        explanation = (
            "The image characteristics are broadly consistent with typical "
            "clean water appearance.  No strong visual anomalies detected. "
            f"Primary indicator assessed: {primary_driver}."
        )
        recs = [
            "Continue routine monitoring of this water body.",
            "Maintain current environmental protection measures.",
            "Document baseline images periodically for comparison.",
            "Report any sudden changes in water appearance to local authorities.",
        ]
        confidence = "Moderate"
    elif composite < 55:
        risk_level = "Medium"
        explanation = (
            f"Moderate visual anomalies detected. {driver_explanations[primary_driver]} "
            "Further investigation is advisable."
        )
        recs = [
            "Collect water samples for laboratory chemical analysis.",
            "Investigate upstream sources of potential runoff.",
            "Increase monitoring frequency in this area.",
            "Notify local environmental protection authorities.",
            "Check for nearby agricultural or industrial discharge points.",
        ]
        confidence = "Moderate"
    else:
        risk_level = "High"
        explanation = (
            f"Significant visual anomalies detected. {driver_explanations[primary_driver]} "
            "Multiple risk indicators are elevated, warranting urgent attention."
        )
        recs = [
            "🚨 Urgently collect water samples for certified laboratory testing.",
            "Alert local environmental and water management authorities immediately.",
            "Identify and document potential pollution point sources.",
            "Restrict recreational and fishing activities until testing confirms safety.",
            "Document evidence with GPS coordinates, timestamps, and photographs.",
            "Consider contacting national environmental protection agencies.",
        ]
        confidence = "Low"  # image-only analysis is least reliable at extremes

    return risk_level, explanation, recs, confidence

# ============================================================
# Satellite Water Pollution Explorer – Analysis Extension
# Added below the existing AnalysisResult / analyze_water_image
# ============================================================


import base64
import io
from typing import Optional


@dataclass
class SatelliteAnalysisResult:
    """Result of analysing a satellite/aerial water image with overlay."""
    risk_level: str                # "Low" | "Medium" | "High"
    risk_score: float              # 0–100
    color_score: float
    turbidity_score: float
    algae_score: float
    dark_patch_score: float
    dominant_colors: list
    explanation: str
    recommendations: list
    confidence: str
    # Satellite-specific fields
    location_name: str
    latitude: Optional[float]
    longitude: Optional[float]
    image_date: Optional[str]
    water_type: str
    overlay_image_b64: str         # base64-encoded PNG of annotated image
    detected_regions: list         # list of {label, color, bbox, pixel_count}
    satellite_links: list          # list of {name, url, description}
    disclaimer: str = (
        "⚠️ EXPERIMENTAL VISUAL ESTIMATE: Analysis is based solely on image pixel data. "
        "It does NOT confirm actual water pollution or chemical contamination. "
        "Satellite images may have been retrieved from external services and reflect "
        "real-world conditions only at the time of capture. For authoritative water "
        "quality results, consult certified environmental testing laboratories."
    )
    source_note: str = ""


def analyze_satellite_image(
    image_path: str,
    location_name: str = "Unknown",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    image_date: Optional[str] = None,
    water_type: str = "unknown",
) -> SatelliteAnalysisResult:
    """
    Analyse a satellite/aerial water image.
    Returns the standard risk metrics PLUS a base64-encoded annotated overlay
    image highlighting suspicious regions with colour-coded bounding boxes.

    Detected region types:
      - Algae bloom (bright green patches)
      - Turbid/brown water (brownish/yellowish hue)
      - Dark patch / possible oil (very dark low-saturation areas)
      - Colour anomaly (hues outside normal water palette)
    """
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise ValueError(f"Cannot read image: {image_path}")

    # Work at 640×480 for consistent analysis
    orig_h, orig_w = img_bgr.shape[:2]
    img_bgr = cv2.resize(img_bgr, (640, 480))
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    img_lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2Lab)

    # --- Standard scores ---
    color_score     = _color_anomaly_score(img_hsv, img_rgb)
    turbidity_score = _turbidity_score(img_lab)
    algae_score     = _algae_bloom_score(img_rgb)
    dark_score      = _dark_patch_score(img_hsv)
    dominant_colors = _dominant_colors(img_rgb)

    composite = float(np.clip(
        color_score * 0.35 + turbidity_score * 0.25 +
        algae_score * 0.20 + dark_score * 0.20,
        0, 100
    ))

    risk_level, explanation, recommendations, confidence = _classify(
        composite, color_score, turbidity_score, algae_score, dark_score
    )

    # --- Build annotated overlay ---
    overlay_bgr, detected_regions = _build_overlay(img_bgr, img_rgb, img_hsv)

    # Convert overlay to base64 PNG
    _, buf = cv2.imencode(".png", overlay_bgr)
    overlay_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

    # --- Satellite resource links ---
    sat_links = _satellite_links(latitude, longitude, image_date)

    return SatelliteAnalysisResult(
        risk_level=risk_level,
        risk_score=round(composite, 1),
        color_score=round(color_score, 1),
        turbidity_score=round(turbidity_score, 1),
        algae_score=round(algae_score, 1),
        dark_patch_score=round(dark_score, 1),
        dominant_colors=dominant_colors,
        explanation=explanation,
        recommendations=recommendations,
        confidence=confidence,
        location_name=location_name,
        latitude=latitude,
        longitude=longitude,
        image_date=image_date,
        water_type=water_type,
        overlay_image_b64=overlay_b64,
        detected_regions=detected_regions,
        satellite_links=sat_links,
        source_note=(
            "Image provided by user upload. No satellite imagery was retrieved "
            "automatically. Satellite resource links are provided for manual "
            "reference — click to open in your browser."
        ) if not sat_links else (
            "Satellite links generated from coordinates. No imagery was "
            "fetched automatically; click a link to view imagery in an "
            "external browser."
        )
    )


# ---------------------------------------------------------------------------
# Overlay builder
# ---------------------------------------------------------------------------

def _build_overlay(
    img_bgr: np.ndarray,
    img_rgb: np.ndarray,
    img_hsv: np.ndarray,
) -> tuple:
    """
    Draw colour-coded region highlights on a copy of img_bgr.
    Returns (annotated_bgr, detected_regions_list).
    """
    annotated = img_bgr.copy()
    h, w = img_bgr.shape[:2]
    detected = []

    r = img_rgb[:, :, 0].astype(float)
    g = img_rgb[:, :, 1].astype(float)
    b = img_rgb[:, :, 2].astype(float)
    hue, sat, val = cv2.split(img_hsv)

    # ---- 1. Algae bloom mask (green dominance) ----
    algae_mask = (
        (g > 90) &
        ((g - b) / (b + 1.0) > 0.28) &
        (val.astype(float) > 40) &
        (sat.astype(float) > 30)
    ).astype(np.uint8) * 255

    algae_mask = _morphology_clean(algae_mask)
    regions_algae = _mask_to_regions(algae_mask, annotated,
        color_bgr=(0, 200, 60), label="Algae / Bloom Indicator")
    detected.extend(regions_algae)

    # ---- 2. Brown/turbid water ----
    hue_deg = hue.astype(float) * 2.0  # 0–358
    turbid_mask = (
        (
            ((hue_deg >= 10) & (hue_deg <= 40))   # orange-brown
            | ((hue_deg > 40) & (hue_deg <= 70))  # yellow
        ) &
        (sat.astype(float) > 30) &
        (val.astype(float) > 30)
    ).astype(np.uint8) * 255

    turbid_mask = _morphology_clean(turbid_mask)
    regions_turbid = _mask_to_regions(turbid_mask, annotated,
        color_bgr=(0, 140, 255), label="Turbid / Brown Water")
    detected.extend(regions_turbid)

    # ---- 3. Dark patch / possible oil ----
    dark_mask = (
        (val < 55) & (sat < 45)
    ).astype(np.uint8) * 255

    dark_mask = _morphology_clean(dark_mask, min_area=400)
    regions_dark = _mask_to_regions(dark_mask, annotated,
        color_bgr=(30, 30, 180), label="Dark Patch / Possible Oil")
    detected.extend(regions_dark)

    # ---- 4. Colour anomaly (red/pink hues – unusual for water) ----
    red_mask = (
        (
            (hue_deg <= 20) | (hue_deg >= 340)
        ) &
        (sat.astype(float) > 50) &
        (val.astype(float) > 50)
    ).astype(np.uint8) * 255

    red_mask = _morphology_clean(red_mask, min_area=300)
    regions_red = _mask_to_regions(red_mask, annotated,
        color_bgr=(50, 50, 220), label="Colour Anomaly (Red/Pink Hue)")
    detected.extend(regions_red)

    # ---- Legend bar at bottom ----
    _draw_legend(annotated)

    return annotated, detected


def _morphology_clean(mask: np.ndarray, min_area: int = 600) -> np.ndarray:
    """Remove noise and small blobs from a binary mask."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_DILATE, kernel, iterations=1)

    # Remove small contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cleaned = np.zeros_like(mask)
    for cnt in contours:
        if cv2.contourArea(cnt) >= min_area:
            cv2.drawContours(cleaned, [cnt], -1, 255, -1)
    return cleaned


def _mask_to_regions(
    mask: np.ndarray,
    annotated: np.ndarray,
    color_bgr: tuple,
    label: str,
) -> list:
    """
    Find contours in mask, draw bounding rectangles and semi-transparent fills
    on `annotated`, and return region metadata.
    """
    regions = []
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 500:
            continue

        x, y, bw, bh = cv2.boundingRect(cnt)

        # Semi-transparent fill
        overlay = annotated.copy()
        cv2.drawContours(overlay, [cnt], -1, color_bgr, -1)
        cv2.addWeighted(overlay, 0.30, annotated, 0.70, 0, annotated)

        # Bounding box
        cv2.rectangle(annotated, (x, y), (x + bw, y + bh), color_bgr, 2)

        # Small label
        font_scale = 0.38
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
        cy = max(y - 4, th + 2)
        cv2.rectangle(annotated, (x, cy - th - 2), (x + tw + 4, cy + 2), color_bgr, -1)
        cv2.putText(
            annotated, label, (x + 2, cy),
            cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), 1, cv2.LINE_AA
        )

        hex_color = "#{:02x}{:02x}{:02x}".format(*color_bgr[::-1])  # BGR → RGB
        regions.append({
            "label": label,
            "color": hex_color,
            "bbox": {"x": int(x), "y": int(y), "w": int(bw), "h": int(bh)},
            "pixel_count": int(area),
        })

    return regions


def _draw_legend(img: np.ndarray) -> None:
    """Draw a compact colour legend at the bottom-left of the image."""
    legend_items = [
        ((0, 200, 60),   "Algae/Bloom"),
        ((0, 140, 255),  "Turbid Water"),
        ((30, 30, 180),  "Dark Patch/Oil"),
        ((50, 50, 220),  "Colour Anomaly"),
    ]
    h, w = img.shape[:2]
    x0, y0 = 6, h - 6 - len(legend_items) * 16
    # Dark background for readability
    bg_h = len(legend_items) * 16 + 6
    cv2.rectangle(img, (x0 - 2, y0 - 4), (x0 + 130, y0 + bg_h), (20, 20, 20), -1)
    for i, (color, text) in enumerate(legend_items):
        cy = y0 + i * 16 + 10
        cv2.rectangle(img, (x0, cy - 7), (x0 + 10, cy + 3), color, -1)
        cv2.putText(img, text, (x0 + 14, cy), cv2.FONT_HERSHEY_SIMPLEX,
                    0.35, (220, 220, 220), 1, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# Satellite resource link generator (free, no-auth sources)
# ---------------------------------------------------------------------------

def _satellite_links(
    latitude: Optional[float],
    longitude: Optional[float],
    image_date: Optional[str],
) -> list:
    """
    Generate direct deep-links to free satellite imagery portals.
    No API keys are needed — these open in the user's browser.
    Returns an empty list if no coordinates are provided.
    """
    if latitude is None or longitude is None:
        return []

    lat, lng = round(latitude, 5), round(longitude, 5)
    # Build a reasonable bounding box (≈10 km buffer)
    delta = 0.05
    bbox = f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}"

    # Sentinel Hub EO Browser – True Colour composite, Sentinel-2
    # Format: zoom/lat/lng in the URL
    eo_zoom = 12
    eo_url = (
        f"https://apps.sentinel-hub.com/eo-browser/?zoom={eo_zoom}"
        f"&lat={lat}&lng={lng}&themeId=DEFAULT-THEME"
        f"&datasetId=S2L2A&layerId=1_TRUE_COLOR"
        + (f"&toTime={image_date}T23%3A59%3A59.000Z" if image_date else "")
    )

    # NASA Earthdata Worldview – Corrected Reflectance (True Color) MODIS Terra
    wv_date = image_date or "2024-01-01"
    wv_url = (
        f"https://worldview.earthdata.nasa.gov/"
        f"?v={bbox}&t={wv_date}"
        f"&l=VIIRS_SNPP_CorrectedReflectance_TrueColor(hidden),"
        f"MODIS_Terra_CorrectedReflectance_TrueColor,Coastlines_15m,"
        f"Reference_Labels_15m(hidden)"
    )

    # Copernicus Open Access Hub (search page, no direct tile link)
    cop_url = (
        f"https://browser.dataspace.copernicus.eu/"
        f"?zoom={eo_zoom}&lat={lat}&lng={lng}"
        + (f"&fromTime={image_date}T00%3A00%3A00.000Z"
           f"&toTime={image_date}T23%3A59%3A59.000Z" if image_date else "")
    )

    # Google Maps satellite view (no API key, just the embed URL)
    gm_url = (
        f"https://www.google.com/maps/@{lat},{lng},{eo_zoom}z/data=!3m1!1e3"
    )

    # OpenStreetMap for reference
    osm_url = f"https://www.openstreetmap.org/?mlat={lat}&mlon={lng}#map=12/{lat}/{lng}"

    return [
        {
            "name": "Sentinel Hub EO Browser",
            "url": eo_url,
            "description": (
                "Free Sentinel-2 true-colour imagery (10 m). "
                "Requires free registration on the EO Browser site. "
                "Opens near your selected coordinates."
            ),
            "icon": "bi-satellite",
            "requires_auth": True,
        },
        {
            "name": "NASA Earthdata Worldview",
            "url": wv_url,
            "description": (
                "Free MODIS & VIIRS true-colour and false-colour imagery "
                "(250 m). No registration required. Great for large water bodies."
            ),
            "icon": "bi-globe2",
            "requires_auth": False,
        },
        {
            "name": "Copernicus Data Space Browser",
            "url": cop_url,
            "description": (
                "ESA Copernicus Data Space – Sentinel-2 archive (10 m). "
                "Free account required. Supports date filtering and band selection."
            ),
            "icon": "bi-layers",
            "requires_auth": True,
        },
        {
            "name": "Google Maps Satellite",
            "url": gm_url,
            "description": (
                "Google Maps satellite view at your location. "
                "No sign-in required for browsing. Image dates vary."
            ),
            "icon": "bi-map",
            "requires_auth": False,
        },
        {
            "name": "OpenStreetMap Reference",
            "url": osm_url,
            "description": (
                "OpenStreetMap for geographic context and waterway features."
            ),
            "icon": "bi-geo-alt",
            "requires_auth": False,
        },
    ]
