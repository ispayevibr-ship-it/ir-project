#!/usr/bin/env python3
"""IR Project AI PaddleOCR-VL 1.6 worker source.

Bundle as a self-contained, signed Windows binary with PaddleOCR and PaddlePaddle
through the offline publisher. Never invoke this file using an untrusted system
Python executable in production. All model directories are supplied locally.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--layout", required=True)
    ap.add_argument("--vision", required=True)
    return ap.parse_args()


def extract_blocks(value, output, seen, depth=0):
    if depth > 16 or len(output) >= 600:
        return
    if isinstance(value, list):
        for item in value:
            extract_blocks(item, output, seen, depth + 1)
    elif isinstance(value, dict):
        text = value.get("block_content")
        if not isinstance(text, str):
            text = value.get("rec_text")
        if not isinstance(text, str):
            text = value.get("text")
        bbox = value.get("block_bbox", value.get("bbox"))
        kind = value.get("block_label", value.get("type", "text"))
        if isinstance(text, str) and text.strip():
            if not isinstance(bbox, (list, tuple)) or len(bbox) < 4:
                bbox = None
            else:
                try:
                    bbox = [float(x) for x in bbox[:4]]
                except (TypeError, ValueError):
                    bbox = None
            entry = {"text": text[:1400], "type": str(kind)[:60], "bbox": bbox}
            key = (entry["text"], str(bbox))
            if key not in seen:
                seen.add(key)
                output.append(entry)
        for nested in value.values():
            if isinstance(nested, (list, dict)):
                extract_blocks(nested, output, seen, depth + 1)


def main():
    args = parse_args()
    inp, out = Path(args.input).resolve(), Path(args.output).resolve()
    layout, vision = Path(args.layout).resolve(), Path(args.vision).resolve()
    if not inp.is_file() or inp.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        raise RuntimeError("Expected a local PNG or JPEG image")
    if not layout.is_dir() or not vision.is_dir():
        raise RuntimeError("Offline layout and vision models are missing")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    os.environ["HTTP_PROXY"] = ""
    os.environ["HTTPS_PROXY"] = ""
    os.environ["ALL_PROXY"] = ""

    # Official PaddleOCR Python API (pipeline v1.6); explicit model paths
    # prevent auto-resolving either model from an online model repository.
    from paddleocr import PaddleOCRVL

    pipe = PaddleOCRVL(
        pipeline_version="v1.6",
        layout_detection_model_dir=str(layout),
        vl_rec_model_dir=str(vision),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )
    blocks, seen = [], set()
    with tempfile.TemporaryDirectory() as destination:
        dest = Path(destination)
        parsed = list(pipe.predict(input=str(inp)))
        if not parsed:
            raise RuntimeError("PaddleOCR returned no document result")
        for idx, item in enumerate(parsed):
            target = dest / str(idx)
            target.mkdir()
            item.save_to_json(save_path=str(target))
            written = list(target.glob("*.json"))
            if not written:
                raise RuntimeError("PaddleOCR did not export the structured result")
            for filepath in written:
                raw = json.loads(filepath.read_text(encoding="utf-8"))
                extract_blocks(raw, blocks, seen)
    payload = {
        "schema": "ir-paddleocr-vl-json-1",
        "text": "\n".join(x["text"] for x in blocks)[:60000],
        "blocks": blocks,
        "complete": True,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, out)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write("PaddleOCR-VL offline worker failed: " + str(exc)[:450] + "\n")
        sys.exit(1)
