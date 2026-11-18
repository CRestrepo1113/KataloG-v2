import io
import math
import random
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance
from app.config import settings

_rembg = None
_rembg_session = None

def get_rembg_and_session():
    """Lazily initializes and caches rembg and model (silueta / u2netp) for low-memory environments."""
    global _rembg, _rembg_session
    if _rembg is None:
        import rembg
        _rembg = rembg
        try:
            _rembg_session = rembg.new_session("silueta")
        except Exception:
            try:
                _rembg_session = rembg.new_session("u2netp")
            except Exception:
                _rembg_session = rembg.new_session("u2net")
    return _rembg, _rembg_session

# Official KataloG Brand Standardized Blue Palette (RGB) #B9E0FD
STANDARDIZED_BLUE_RGB = (185, 224, 253)
PASTEL_PALETTE = [
    {"name": "Azul Cielo Pastel", "rgb": STANDARDIZED_BLUE_RGB},
]

def remove_background_and_crop(image_bytes: bytes) -> Image.Image:
    """
    Removes background using high-precision neural network and crops tightly around the primary subject.
    Eliminates outer tags, side objects, and background cloth.
    """
    # Step 1: Open and optimize resolution for fast neural inference
    input_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    max_dim = 700
    if max(input_img.size) > max_dim:
        input_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

    # Step 2: Execute rembg segmentation
    rembg_mod, session = get_rembg_and_session()
    no_bg_image = rembg_mod.remove(input_img, session=session)



    # Step 2: Get bounding box of main non-transparent subject
    bbox = no_bg_image.getbbox()
    if bbox:
        # Crop tightly to the plushie object
        cropped = no_bg_image.crop(bbox)

        # Add 4% padding around object
        w, h = cropped.size
        pad_x = int(w * 0.04)
        pad_y = int(h * 0.04)

        padded = Image.new("RGBA", (w + 2 * pad_x, h + 2 * pad_y), (0, 0, 0, 0))
        padded.paste(cropped, (pad_x, pad_y))
        return padded

    return no_bg_image

def select_harmonious_pastel(no_bg_image: Image.Image) -> tuple:
    """Analyzes the product's fur/colors and selects the most aesthetic matching pastel shade."""
    small = no_bg_image.resize((100, 100))
    pixels = small.getdata()

    r_sum, g_sum, b_sum, count = 0, 0, 0, 0
    for p in pixels:
        if len(p) == 4 and p[3] > 120:  # Solid pixel threshold
            r_sum += p[0]
            g_sum += p[1]
            b_sum += p[2]
            count += 1

    if count == 0:
        return random.choice(PASTEL_PALETTE)["rgb"]

    avg_r, avg_g, avg_b = r_sum / count, g_sum / count, b_sum / count

    # Calculate contrast/harmony score with pastel colors
    best_pastel = PASTEL_PALETTE[0]["rgb"]
    max_score = -1

    for item in PASTEL_PALETTE:
        pr, pg, pb = item["rgb"]
        dist = math.sqrt((avg_r - pr)**2 + (avg_g - pg)**2 + (avg_b - pb)**2)
        if dist > max_score:
            max_score = dist
            best_pastel = item["rgb"]

    return best_pastel

def create_studio_composition(no_bg_image: Image.Image, pastel_rgb: tuple) -> Image.Image:
    """
    Applies lighting enhancement, sharpness boost, studio canvas placement, and floor contact shadow.
    """
    canvas_size = 800
    background = Image.new("RGBA", (canvas_size, canvas_size), pastel_rgb + (255,))

    # 1. Enhance lighting, contrast, and color richness of plushie
    enhancer_contrast = ImageEnhance.Contrast(no_bg_image)
    enhanced = enhancer_contrast.enhance(1.12)

    enhancer_color = ImageEnhance.Color(enhanced)
    enhanced = enhancer_color.enhance(1.08)

    enhancer_sharpness = ImageEnhance.Sharpness(enhanced)
    enhanced = enhancer_sharpness.enhance(1.22)

    # 2. Scale plushie to fit comfortably in studio canvas (82% size)
    max_obj_size = int(canvas_size * 0.82)
    scale = min(max_obj_size / enhanced.width, max_obj_size / enhanced.height)
    new_w = int(enhanced.width * scale)
    new_h = int(enhanced.height * scale)

    resized_obj = enhanced.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Center object on studio stage
    pos_x = (canvas_size - new_w) // 2
    pos_y = (canvas_size - new_h) // 2

    # Composite plushie object directly onto clean studio pastel background
    obj_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    obj_layer.paste(resized_obj, (pos_x, pos_y))

    final_img = Image.alpha_composite(background, obj_layer)
    return final_img.convert("RGB")

def process_product_image(image_bytes: bytes) -> bytes:

    """
    Complete AI Image Pipeline:
    - Removes background using IS-Net model.
    - Crops tightly to plushie.
    - Enhances lighting & sharpness.
    - Composites on harmonic studio pastel canvas with contact shadow.
    - Generates high quality WebP.
    """
    # Step 1: High precision background removal & crop
    no_bg = remove_background_and_crop(image_bytes)

    # Step 2: Select matching pastel tone
    pastel_color = select_harmonious_pastel(no_bg)

    # Step 3: Studio composition with lighting & floor shadow
    studio_img = create_studio_composition(no_bg, pastel_color)

    # Step 4: Convert & compress to WebP
    out_buf = io.BytesIO()
    studio_img.save(out_buf, format="WEBP", quality=92, optimize=True)
    return out_buf.getvalue()
