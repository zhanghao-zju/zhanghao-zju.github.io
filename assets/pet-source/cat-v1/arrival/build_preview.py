#!/usr/bin/env python3
"""Build reproducible cat-v1 arrival source frames and review material.

This script operates only on production source artwork under assets/pet-source.
It does not read from or write to the deployed public/pet runtime.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "core"
WALK = ROOT / "walk"
ARRIVAL = ROOT / "arrival"
BOOK = ARRIVAL / "book"
POSES = ARRIVAL / "poses"
FRAMES = ARRIVAL / "frames"
REVIEW = ARRIVAL / "review"
EYE_REVIEW = ROOT / "layers" / "eyes" / "rework"

SOURCE_CANVAS = (1024, 1536)
ARRIVAL_CANVAS = (384, 576)
WALK_OFFSET_Y = 64
WALK_BASELINE_Y = 544


def load_rgba(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    return image


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def resize_rgba(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize RGBA via premultiplied color to avoid colored transparent fringes."""
    if image.size == size:
        return image.copy()
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def with_opacity(image: Image.Image, opacity: float) -> Image.Image:
    result = image.copy()
    result.putalpha(result.getchannel("A").point(lambda p: round(p * opacity)))
    return result


def compose_static(core_dir: Path, eye_state: str = "normal") -> Image.Image:
    canvas = Image.new("RGBA", SOURCE_CANVAS)
    # Mirrors the renderer stacking context: shadow, tail, body, head-group, paw.
    for name in ("shadow", "tail", "body"):
        canvas.alpha_composite(load_rgba(core_dir / f"{name}.png"))

    for name in ("ear-left", "ear-right", "head"):
        canvas.alpha_composite(load_rgba(core_dir / f"{name}.png"))

    for name in ("eye-base-left", "eye-base-right", "pupil-left", "pupil-right"):
        canvas.alpha_composite(load_rgba(core_dir / f"{name}.png"))

    if eye_state in {"half", "closed"}:
        for side in ("left", "right"):
            canvas.alpha_composite(load_rgba(core_dir / f"eyelid-{eye_state}-{side}.png"))

    canvas.alpha_composite(load_rgba(core_dir / "mouth-closed.png"))
    canvas.alpha_composite(load_rgba(core_dir / "paw.png"))
    return canvas


def compose_static_before(eye_state: str = "normal") -> Image.Image:
    canvas = Image.new("RGBA", SOURCE_CANVAS)
    for name in ("shadow", "tail", "body"):
        canvas.alpha_composite(load_rgba(CORE / f"{name}.png"))
    for name in ("ear-left", "ear-right", "head"):
        canvas.alpha_composite(load_rgba(CORE / f"{name}.png"))
    before = EYE_REVIEW / "before"
    for name in ("eye-base-left", "eye-base-right", "pupil-left", "pupil-right"):
        canvas.alpha_composite(load_rgba(before / f"{name}.png"))
    if eye_state == "half":
        for side in ("left", "right"):
            canvas.alpha_composite(load_rgba(before / f"eyelid-half-{side}.png"))
    elif eye_state == "closed":
        for side in ("left", "right"):
            canvas.alpha_composite(load_rgba(CORE / f"eyelid-closed-{side}.png"))
    canvas.alpha_composite(load_rgba(CORE / "mouth-closed.png"))
    canvas.alpha_composite(load_rgba(CORE / "paw.png"))
    return canvas


def place_cropped(
    sprite: Image.Image,
    canvas_size: tuple[int, int],
    target_width: int,
    left: int,
    top: int | None = None,
    bottom: int | None = None,
) -> Image.Image:
    bbox = alpha_bbox(sprite)
    if not bbox:
        return Image.new("RGBA", canvas_size)
    crop = sprite.crop(bbox)
    target_height = round(crop.height * target_width / crop.width)
    crop = resize_rgba(crop, (target_width, target_height))
    if bottom is not None:
        top = bottom - target_height
    if top is None:
        raise ValueError("top or bottom is required")
    canvas = Image.new("RGBA", canvas_size)
    canvas.alpha_composite(crop, (left, top))
    return canvas


def embed_walk(frame: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", ARRIVAL_CANVAS)
    canvas.alpha_composite(frame, (0, WALK_OFFSET_Y))
    return canvas


def walk_pose(frame: Image.Image, width: int, height: int, left: int, baseline: int) -> Image.Image:
    bbox = alpha_bbox(frame)
    assert bbox is not None
    crop = frame.crop(bbox).resize((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", ARRIVAL_CANVAS)
    canvas.alpha_composite(crop, (left, baseline - height))
    return canvas


def glow_layer(center: tuple[int, int], radius: int, color: tuple[int, int, int], alpha: int) -> Image.Image:
    layer = Image.new("RGBA", ARRIVAL_CANVAS)
    pixels = layer.load()
    cx, cy = center
    x0, x1 = max(0, cx - radius), min(ARRIVAL_CANVAS[0], cx + radius + 1)
    y0, y1 = max(0, cy - radius), min(ARRIVAL_CANVAS[1], cy + radius + 1)
    for y in range(y0, y1):
        for x in range(x0, x1):
            distance = math.hypot(x - cx, y - cy) / radius
            if distance >= 1:
                continue
            falloff = (1 - distance) ** 2.25
            pixels[x, y] = (*color, round(alpha * falloff))
    return clear_border(layer)


def clear_border(image: Image.Image, pixels: int = 6) -> Image.Image:
    """Guarantee a transparent outer safety margin on full-canvas effect sprites."""
    result = image.copy()
    draw = ImageDraw.Draw(result)
    width, height = result.size
    draw.rectangle((0, 0, width - 1, pixels - 1), fill=(0, 0, 0, 0))
    draw.rectangle((0, height - pixels, width - 1, height - 1), fill=(0, 0, 0, 0))
    draw.rectangle((0, 0, pixels - 1, height - 1), fill=(0, 0, 0, 0))
    draw.rectangle((width - pixels, 0, width - 1, height - 1), fill=(0, 0, 0, 0))
    return result


def transition_flash() -> Image.Image:
    """Soft opaque-centered flash that conceals the landing-to-seated redraw."""
    flash = Image.new("RGBA", ARRIVAL_CANVAS)
    flash.alpha_composite(glow_layer((200, 312), 178, (116, 199, 255), 176))
    flash.alpha_composite(glow_layer((200, 316), 116, (218, 244, 255), 225))
    flash.alpha_composite(glow_layer((200, 320), 66, (255, 252, 225), 245))
    return clear_border(flash)


def particle_layer(phase: int, intensity: float = 1.0) -> Image.Image:
    rng = random.Random(7619)
    layer = Image.new("RGBA", ARRIVAL_CANVAS)
    glow = Image.new("RGBA", ARRIVAL_CANVAS)
    draw = ImageDraw.Draw(layer)
    glow_draw = ImageDraw.Draw(glow)
    palette = [(105, 211, 255), (132, 174, 255), (255, 226, 135), (221, 246, 255)]
    for index in range(34):
        angle = rng.uniform(0, math.tau)
        radius_x = rng.uniform(72, 151)
        radius_y = rng.uniform(22, 83)
        base_x = 201 + math.cos(angle) * radius_x
        base_y = 408 + math.sin(angle) * radius_y
        drift = ((phase * 11 + index * 7) % 31) - 15
        x = round(base_x + math.sin(index + phase * 0.8) * 8)
        y = round(base_y - phase * 7 - drift * 0.35)
        size = 1 + (index % 3)
        color = palette[index % len(palette)]
        a = round((88 + (index * 19) % 130) * intensity)
        if a <= 0:
            continue
        glow_draw.ellipse((x - size * 3, y - size * 3, x + size * 3, y + size * 3), fill=(*color, min(100, a // 2)))
        if index % 4 == 0:
            draw.line((x - size * 2, y, x + size * 2, y), fill=(*color, a), width=1)
            draw.line((x, y - size * 2, x, y + size * 2), fill=(*color, a), width=1)
        else:
            draw.ellipse((x - size, y - size, x + size, y + size), fill=(*color, a))
    glow = glow.filter(ImageFilter.GaussianBlur(5))
    glow.alpha_composite(layer)
    return clear_border(glow)


def magic_book_frame(book: Image.Image, phase: int, opacity: float, intensity: float) -> Image.Image:
    canvas = Image.new("RGBA", ARRIVAL_CANVAS)
    canvas.alpha_composite(glow_layer((202, 414), 108, (82, 170, 255), round(100 * intensity)))
    canvas.alpha_composite(with_opacity(book, opacity))
    canvas.alpha_composite(particle_layer(phase, intensity))
    return clear_border(canvas)


def background_composite(sprite: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    bg = Image.new("RGBA", sprite.size, (*color, 255))
    bg.alpha_composite(sprite)
    return bg.convert("RGB")


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def labeled_sheet(images: list[Image.Image], labels: list[str], columns: int, bg: tuple[int, int, int]) -> Image.Image:
    cell_w, cell_h = 220, 354
    rows = math.ceil(len(images) / columns)
    sheet = Image.new("RGB", (columns * cell_w, rows * cell_h), bg)
    draw = ImageDraw.Draw(sheet)
    label_font = font(16)
    for index, image in enumerate(images):
        col, row = index % columns, index // columns
        thumb = image.copy()
        thumb.thumbnail((190, 302), Image.Resampling.LANCZOS)
        x = col * cell_w + (cell_w - thumb.width) // 2
        y = row * cell_h + 34 + (302 - thumb.height) // 2
        if thumb.mode == "RGBA":
            cell = Image.new("RGBA", thumb.size, (*bg, 255))
            cell.alpha_composite(thumb)
            thumb_rgb = cell.convert("RGB")
        else:
            thumb_rgb = thumb.convert("RGB")
        sheet.paste(thumb_rgb, (x, y))
        draw.text((col * cell_w + 12, row * cell_h + 9), labels[index], font=label_font, fill=(245, 248, 255) if sum(bg) < 300 else (39, 51, 72))
    return sheet


def save_eye_review() -> None:
    before = [compose_static_before(state) for state in ("normal", "half", "closed")]
    after = [compose_static(CORE, state) for state in ("normal", "half", "closed")]
    images = []
    labels = []
    for state, old, new in zip(("normal", "half", "closed"), before, after):
        images.extend((old, new))
        labels.extend((f"before · {state}", f"after · {state}"))
    labeled_sheet(images, labels, 3, (247, 244, 238)).save(REVIEW / "eyes-before-after-light.png")
    labeled_sheet(images, labels, 3, (25, 31, 43)).save(REVIEW / "eyes-before-after-dark.png")

    display = []
    display_labels = []
    for state, image in zip(("normal", "half", "closed"), after):
        display.append(resize_rgba(image, (172, 258)))
        display_labels.append(f"172×258 · {state}")
    labeled_sheet(display, display_labels, 3, (247, 244, 238)).save(REVIEW / "eyes-display-size.png")

    face_box = (430, 165, 840, 555)
    closeups = []
    closeup_labels = []
    for state, old, new in zip(("normal", "half", "closed"), before, after):
        closeups.extend((old.crop(face_box), new.crop(face_box)))
        closeup_labels.extend((f"before · {state}", f"after · {state}"))
    labeled_sheet(closeups, closeup_labels, 3, (247, 244, 238)).save(REVIEW / "eyes-face-closeup-light.png")
    labeled_sheet(closeups, closeup_labels, 3, (25, 31, 43)).save(REVIEW / "eyes-face-closeup-dark.png")


def main() -> None:
    for directory in (BOOK, POSES, FRAMES, REVIEW):
        directory.mkdir(parents=True, exist_ok=True)

    static_source = compose_static(CORE, "normal")
    static = resize_rgba(static_source, ARRIVAL_CANVAS)
    static_source.save(REVIEW / "static-normal-transparent-source.png")
    static.save(REVIEW / "static-normal-transparent-384x576.png")

    book_source = load_rgba(BOOK / "book-standalone-source.png")
    book = resize_rgba(book_source, ARRIVAL_CANVAS)
    book.save(BOOK / "book-standalone-384x576.png")

    air_source = load_rgba(POSES / "jump-air-source.png")
    land_source = load_rgba(POSES / "jump-land-source.png")
    air_high = place_cropped(air_source, ARRIVAL_CANVAS, 270, 57, top=8)
    air_low = place_cropped(air_source, ARRIVAL_CANVAS, 282, 51, top=35)
    land = place_cropped(land_source, ARRIVAL_CANVAS, 300, 42, bottom=386)
    air_high.save(POSES / "jump-air-high-384x576.png")
    air_low.save(POSES / "jump-air-low-384x576.png")
    land.save(POSES / "jump-land-384x576.png")

    book_magic = [
        magic_book_frame(book, 0, 0.16, 0.35),
        magic_book_frame(book, 1, 0.44, 0.62),
        magic_book_frame(book, 2, 0.76, 0.9),
        magic_book_frame(book, 3, 1.0, 1.0),
    ]
    for index, frame in enumerate(book_magic, 1):
        frame.save(BOOK / f"book-magic-{index:02d}.png")

    walk8 = load_rgba(WALK / "walk-08.png")
    walk_normal = embed_walk(walk8)
    crouch_soft = walk_pose(walk8, 314, 406, 26, WALK_BASELINE_Y)
    crouch_deep = walk_pose(walk8, 306, 374, 31, WALK_BASELINE_Y)

    frames: list[Image.Image] = []

    # 01–03: the book materializes while the final walking pose compresses into takeoff.
    for cat, magic in zip((walk_normal, crouch_soft, crouch_deep), book_magic[:3]):
        frame = Image.new("RGBA", ARRIVAL_CANVAS)
        frame.alpha_composite(magic)
        frame.alpha_composite(cat)
        frames.append(frame)

    # 04–05: airborne keys, with the fully materialized book behind the cat.
    for index, cat in enumerate((air_high, air_low), 3):
        frame = Image.new("RGBA", ARRIVAL_CANVAS)
        frame.alpha_composite(magic_book_frame(book, index, 1.0, 1.05))
        frame.alpha_composite(cat)
        frames.append(frame)

    # 06: soft landing on the upper cover.
    frame = Image.new("RGBA", ARRIVAL_CANVAS)
    frame.alpha_composite(magic_book_frame(book, 5, 1.0, 0.86))
    frame.alpha_composite(land)
    frames.append(frame)

    # 07: an opaque-centered magic veil masks the pose handoff without double imaging.
    frame = Image.new("RGBA", ARRIVAL_CANVAS)
    frame.alpha_composite(book)
    frame.alpha_composite(transition_flash())
    frame.alpha_composite(particle_layer(6, 1.15))
    frames.append(clear_border(frame))

    # 08–09: settle with a small vertical overshoot, then return to the exact final pose.
    settled_small = resize_rgba(static, (372, 558))
    frame = Image.new("RGBA", ARRIVAL_CANVAS)
    frame.alpha_composite(settled_small, (6, 10))
    frame.alpha_composite(particle_layer(7, 0.58))
    frames.append(frame)

    frame = Image.new("RGBA", ARRIVAL_CANVAS)
    frame.alpha_composite(static, (0, 3))
    frame.alpha_composite(particle_layer(8, 0.3))
    frames.append(frame)

    # 10 is intentionally pixel-identical to the layered static composite at rest.
    frames.append(static.copy())

    for index, frame in enumerate(frames, 1):
        frame.save(FRAMES / f"arrival-{index:02d}.png")

    durations = [120, 105, 95, 90, 90, 105, 110, 120, 100, 160]
    preview = [background_composite(frame, (246, 248, 252)) for frame in frames]
    preview[0].save(
        REVIEW / "arrival-preview.gif",
        save_all=True,
        append_images=preview[1:],
        duration=durations,
        loop=0,
        disposal=2,
    )
    labeled_sheet(frames, [f"{i:02d} · {durations[i - 1]} ms" for i in range(1, 11)], 5, (247, 244, 238)).save(REVIEW / "arrival-frames-light.png")
    labeled_sheet(frames, [f"{i:02d} · {durations[i - 1]} ms" for i in range(1, 11)], 5, (25, 31, 43)).save(REVIEW / "arrival-frames-dark.png")

    book_review = [book, *book_magic]
    labeled_sheet(book_review, ["book isolated", "magic 01", "magic 02", "magic 03", "magic 04"], 5, (247, 244, 238)).save(REVIEW / "book-magic-light.png")
    labeled_sheet(book_review, ["book isolated", "magic 01", "magic 02", "magic 03", "magic 04"], 5, (25, 31, 43)).save(REVIEW / "book-magic-dark.png")

    # The historical "before" eye layers are local QA material and intentionally
    # excluded from Git. Keep production-frame regeneration usable in a clean clone.
    if (EYE_REVIEW / "before").is_dir():
        save_eye_review()

    core_names = [
        "body", "head", "ear-left", "ear-right", "eye-base-left", "eye-base-right",
        "pupil-left", "pupil-right", "eyelid-half-left", "eyelid-half-right",
        "eyelid-closed-left", "eyelid-closed-right", "mouth-closed", "mouth-small",
        "mouth-open", "mouth-smile", "paw", "tail", "shadow",
    ]
    core_checks = {}
    for name in core_names:
        image = load_rgba(CORE / f"{name}.png")
        core_checks[name] = {
            "size": list(image.size),
            "mode": image.mode,
            "bbox": list(alpha_bbox(image) or ()),
            "pass": image.size == SOURCE_CANVAS and image.mode == "RGBA" and alpha_bbox(image) is not None,
        }

    walk_checks = {}
    for index in range(1, 9):
        path = WALK / f"walk-{index:02d}.png"
        image = load_rgba(path)
        bbox = alpha_bbox(image)
        walk_checks[path.name] = {
            "size": list(image.size),
            "bbox": list(bbox or ()),
            "baselineY": bbox[3] if bbox else None,
            "pass": image.size == (384, 512) and image.mode == "RGBA" and bbox is not None and bbox[3] == 480,
        }

    def green_edge_count(image: Image.Image) -> int:
        count = 0
        pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
        for red, green, blue, alpha in pixels:
            if 0 < alpha < 220 and green > red + 70 and green > blue + 70:
                count += 1
        return count

    chroma_checks = {
        "book": green_edge_count(book_source),
        "jumpAir": green_edge_count(air_source),
        "jumpLand": green_edge_count(land_source),
    }

    arrival_checks = {}
    for index, frame in enumerate(frames, 1):
        bbox = alpha_bbox(frame)
        corners = [frame.getpixel(point)[3] for point in ((0, 0), (383, 0), (0, 575), (383, 575))]
        arrival_checks[f"arrival-{index:02d}.png"] = {
            "size": list(frame.size),
            "bbox": list(bbox or ()),
            "cornerAlpha": corners,
            "pass": frame.size == ARRIVAL_CANVAS and frame.mode == "RGBA" and bbox is not None and max(corners) == 0,
        }

    eye_correction = {}
    for name in (
        "eye-base-left", "eye-base-right", "pupil-left", "pupil-right",
        "eyelid-half-left", "eyelid-half-right",
    ):
        old_image = load_rgba(EYE_REVIEW / "before" / f"{name}.png")
        new_image = load_rgba(CORE / f"{name}.png")
        eye_correction[name] = {
            "beforeBbox": list(alpha_bbox(old_image) or ()),
            "afterBbox": list(alpha_bbox(new_image) or ()),
            "canvas": list(new_image.size),
        }

    report = {
        "sourceCanvas": {"width": 1024, "height": 1536, "origin": "top-left"},
        "arrivalCanvas": {"width": 384, "height": 576, "origin": "top-left"},
        "walkReuse": {"canvas": [384, 512], "pasteOffset": [0, WALK_OFFSET_Y], "footBaselineY": WALK_BASELINE_Y},
        "arrivalDurationsMs": durations,
        "finalFrameMatchesStaticComposite": frames[-1].tobytes() == static.tobytes(),
        "eyeCorrection": eye_correction,
        "qa": {
            "core": core_checks,
            "walk": walk_checks,
            "arrival": arrival_checks,
            "lowAlphaChromaGreenPixels": chroma_checks,
            "allCorePass": all(item["pass"] for item in core_checks.values()),
            "allWalkPass": all(item["pass"] for item in walk_checks.values()),
            "allArrivalPass": all(item["pass"] for item in arrival_checks.values()),
            "allChromaEdgesPass": max(chroma_checks.values()) == 0,
        },
        "files": {},
    }
    for path in sorted([*BOOK.glob("*.png"), *POSES.glob("*.png"), *FRAMES.glob("*.png")]):
        image = load_rgba(path)
        report["files"][str(path.relative_to(ROOT))] = {
            "size": list(image.size),
            "mode": image.mode,
            "bbox": list(alpha_bbox(image) or ()),
            "alphaExtrema": list(image.getchannel("A").getextrema()),
        }
    (REVIEW / "mechanical-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
