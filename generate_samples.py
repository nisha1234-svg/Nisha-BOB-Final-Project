"""
Generate synthetic water sample images for the AquaGuard AI demo.
Run once: python generate_samples.py
"""

import os
import numpy as np
import cv2

OUTPUT_DIR = "static/samples"
os.makedirs(OUTPUT_DIR, exist_ok=True)

W, H = 640, 480

def add_waves(img, intensity=15):
    """Add subtle wave-like noise."""
    noise = np.random.randint(-intensity, intensity, img.shape, dtype=np.int16)
    return np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

def gradient(h, w, color_top, color_bottom):
    """Vertical gradient image."""
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for row in range(h):
        t = row / h
        img[row] = [
            int(color_top[c] * (1 - t) + color_bottom[c] * t)
            for c in range(3)
        ]
    return img

samples = {
    # Ocean – clean deep blue water
    "ocean_clean": {
        "base": gradient(H, W, (30, 80, 160), (10, 40, 120)),
        "desc": "Clean ocean: deep blue",
    },
    # Ocean – slightly turbid / coastal brownish
    "ocean_turbid": {
        "base": gradient(H, W, (80, 120, 155), (60, 90, 110)),
        "desc": "Turbid coastal water",
    },
    # River – algae bloom (green-dominant)
    "river_algae": {
        "base": gradient(H, W, (40, 130, 60), (20, 100, 30)),
        "desc": "River with algae bloom",
    },
    # Lake – polluted brownish
    "lake_polluted": {
        "base": gradient(H, W, (100, 85, 55), (70, 60, 30)),
        "desc": "Polluted lake",
    },
    # Lake – clean
    "lake_clean": {
        "base": gradient(H, W, (20, 100, 160), (10, 70, 130)),
        "desc": "Clean mountain lake",
    },
    # River – oil spill + industrial orange-brown discharge (High risk)
    "river_oil": {
        "base": gradient(H, W, (20, 18, 22), (12, 10, 14)),
        "desc": "River with oil sheen (High risk)",
    },
    # Reservoir – heavily polluted: murky brownish-green (High risk)
    "reservoir_polluted": {
        "base": gradient(H, W, (110, 95, 45), (85, 70, 25)),
        "desc": "Heavily polluted reservoir (High risk)",
    },
    # Wetland – healthy
    "wetland_healthy": {
        "base": gradient(H, W, (15, 80, 50), (10, 60, 35)),
        "desc": "Healthy wetland",
    },
}

def add_texture(img, sample_key):
    """Add contextually appropriate textures/patches."""
    out = img.copy()

    if "oil" in sample_key:
        # Dark oily patches
        for _ in range(8):
            cx = np.random.randint(50, W - 50)
            cy = np.random.randint(50, H - 50)
            cv2.ellipse(out, (cx, cy),
                        (np.random.randint(40, 90), np.random.randint(20, 50)),
                        np.random.randint(0, 180), 0, 360,
                        (10, 10, 12), -1)
            # Iridescent sheen hint
            cv2.ellipse(out, (cx, cy),
                        (np.random.randint(15, 30), np.random.randint(8, 18)),
                        np.random.randint(0, 180), 0, 360,
                        (40, 30, 50), -1)

    if "algae" in sample_key:
        # Green bloom patches
        for _ in range(12):
            cx = np.random.randint(30, W - 30)
            cy = np.random.randint(30, H - 30)
            cv2.circle(out, (cx, cy), np.random.randint(20, 60),
                       (30, np.random.randint(140, 180), 30), -1)

    if "polluted" in sample_key:
        # Brownish foam/debris streaks
        for _ in range(6):
            pt1 = (np.random.randint(0, W), np.random.randint(0, H))
            pt2 = (np.random.randint(0, W), np.random.randint(0, H))
            cv2.line(out, pt1, pt2,
                     (np.random.randint(130, 160), np.random.randint(100, 130), 60),
                     np.random.randint(4, 10))

    if "turbid" in sample_key:
        # Sediment patches
        for _ in range(10):
            cx = np.random.randint(0, W)
            cy = np.random.randint(0, H)
            cv2.ellipse(out, (cx, cy),
                        (np.random.randint(30, 80), np.random.randint(15, 40)),
                        np.random.randint(0, 180), 0, 360,
                        (120, 110, 80), -1)

    if "reservoir_polluted" in sample_key:
        # Heavy brownish-orange chemical patches
        for _ in range(14):
            cx = np.random.randint(0, W)
            cy = np.random.randint(0, H)
            cv2.ellipse(out, (cx, cy),
                        (np.random.randint(40, 100), np.random.randint(20, 60)),
                        np.random.randint(0, 180), 0, 360,
                        (np.random.randint(140, 180), np.random.randint(90, 120), 20), -1)
        # Yellow/orange streaks
        for _ in range(6):
            pt1 = (np.random.randint(0, W), np.random.randint(0, H))
            pt2 = (np.random.randint(0, W), np.random.randint(0, H))
            cv2.line(out, pt1, pt2, (200, 140, 30), np.random.randint(5, 12))

    return out


for key, meta in samples.items():
    img = meta["base"].copy()
    img = add_waves(img, intensity=12)
    img = add_texture(img, key)
    # Final Gaussian blur to smooth synthetic look
    img = cv2.GaussianBlur(img, (7, 7), 0)
    path = os.path.join(OUTPUT_DIR, f"{key}.jpg")
    cv2.imwrite(path, cv2.cvtColor(img, cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(f"Saved: {path}  ({meta['desc']})")

print(f"\nDone! {len(samples)} sample images created in {OUTPUT_DIR}/")
