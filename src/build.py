"""Baut ../index.html: setzt qr.js und das Logo (als data-URI) in index.src.html ein.

    python src/build.py
"""
import base64
import io
from pathlib import Path

from PIL import Image

here = Path(__file__).resolve().parent
src = (here / "index.src.html").read_text(encoding="utf-8")
qr = (here / "qr.js").read_text(encoding="utf-8")

logo = Image.open(here / "icon" / "final.png").convert("RGBA").resize((180, 180), Image.LANCZOS)
logo = logo.quantize(colors=32, method=Image.Quantize.FASTOCTREE)
buf = io.BytesIO()
logo.save(buf, "PNG", optimize=True)
uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

out = src.replace("/*QR*/", qr).replace("%%LOGO%%", uri)
target = here.parent / "index.html"
target.write_text(out, encoding="utf-8")
print(f"{target.name}: {len(out) // 1024} KB")
