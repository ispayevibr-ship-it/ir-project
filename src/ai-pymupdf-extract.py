#!/usr/bin/env python3
"""Optional offline PyMuPDF geometry/text extractor for IR Project.

Usage: python src/ai-pymupdf-extract.py input.pdf
Output: one JSON object on stdout. Does not alter PDF or database.
Requires: pip install pymupdf
"""
import json
import sys
import re

def extract(filename):
    import fitz
    result = {"parser": "pymupdf", "pages": []}
    with fitz.open(filename) as document:
        if len(document) > 80:
            raise ValueError("PDF contains more than 80 pages")
        for number, page in enumerate(document, 1):
            if page.rect.width <= 0 or page.rect.height <= 0:
                raise ValueError("Invalid page geometry")
            fragments = []
            for block in page.get_text("dict").get("blocks", []):
                if "lines" not in block:
                    continue
                for line in block["lines"]:
                    for span in line.get("spans", []):
                        value = span.get("text", "").strip()
                        if not value:
                            continue
                        bbox = span["bbox"]
                        fragments.append({
                            "text": value[:500],
                            "x": round(bbox[0], 2),
                            "y": round(page.rect.height - bbox[3], 2),
                            "width": round(bbox[2] - bbox[0], 2),
                            "height": round(bbox[3] - bbox[1], 2),
                        })
                        if len(fragments) >= 1000:
                            break
                    if len(fragments) >= 1000:
                        break
                if len(fragments) >= 1000:
                    break
            # Only signed/elevation-shaped annotations are candidates.
            # These are observations, NOT verified element elevations.
            level_pattern = re.compile(r"(?<![\\d])(?:[+\\-−]\\s*\\d{1,2}|0)[,.]\\d{3}(?!\\d)")
            levels = []
            for fragment in fragments:
                for match in level_pattern.finditer(fragment["text"]):
                    label = match.group(0)
                    normalized = label.replace("−", "-").replace(" ", "").replace(",", ".")
                    try:
                        millimeters = round(float(normalized) * 1000)
                    except ValueError:
                        continue
                    levels.append({"label": label, "millimeters": millimeters,
                                   "x": fragment["x"], "y": fragment["y"]})
            result["pages"].append({
                "page": number,
                "widthPt": round(page.rect.width, 2),
                "heightPt": round(page.rect.height, 2),
                "rotation": page.rotation,
                "fragments": fragments,
                "levelCandidates": levels,
                "hasTextLayer": bool(fragments),
                "truncated": len(fragments) >= 1000,
            })
    return result

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: ai-pymupdf-extract.py input.pdf")
    try:
        print(json.dumps(extract(sys.argv[1]), ensure_ascii=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
