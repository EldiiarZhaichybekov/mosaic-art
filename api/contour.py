#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
api/contour.py — серверная функция (Vercel Python + OpenCV).
========================================================
Принимает картинку (base64 data URL) и возвращает:
  - dashes  : список пунктиров, каждый ровно 30.000 мм (полилинии в мм, 0..400)
  - contour : полный внешний контур (мм, 0..400) — для подложки/проверки
  - meta    : canvas, bbox, длина контура, кол-во штрихов, gap

Алгоритм намеренно разделён на независимые этапы: сегментация объекта,
внешняя граница и диагностическое выделение внутренних структурных линий.
Детальный результат содержит внешнюю границу и принятые внутренние линии.
Очищенный результат ссылается на подмножество этих же внутренних линий.
"""
import base64
import binascii
import io
import logging
import math
import re
import time
import traceback
import uuid
import os
from contextlib import contextmanager
import json
from contour_geometry import analyze_structure, edge_graph
from contour_refinement import refine_lines

import numpy as np
import cv2
from flask import Flask, request, jsonify, g, has_request_context, send_from_directory
from pathlib import Path
from werkzeug.exceptions import BadRequest
from werkzeug.exceptions import RequestEntityTooLarge
from PIL import Image, UnidentifiedImageError

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4_250_000


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Request-ID"
    resp.headers["Access-Control-Expose-Headers"] = "X-Request-ID"
    resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    return resp

CANVAS = 400.0        # мм
FILL = 0.88
DASH_MM = 30.0
GAP_TGT = 1.0        # малый зазор: штрихи вплотную, но остаются штрихами
MAX_DASH = 150
MAX_SIDE = 1024       # ограничение размера загружаемого изображения
MAX_UPLOAD_BYTES = 3 * 1024 * 1024  # JSON/base64 stays safely below Vercel's 4.5 MB body limit
MAX_IMAGE_PIXELS = 24_000_000

logger = logging.getLogger("drawacrl.contour")
class JsonLogFilter(logging.Filter):
    def filter(self, record):
        if isinstance(record.msg, dict):
            record.msg = json.dumps(record.msg, ensure_ascii=False)
        return True


logger.addFilter(JsonLogFilter())
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


class ContourError(Exception):
    def __init__(self, code, message, status=400, stage="request"):
        super().__init__(message)
        self.code = code
        self.status = status
        self.stage = stage


def decode_dataurl(dataurl):
    if not isinstance(dataurl, str):
        raise ContourError("INVALID_IMAGE", "Image must be a data URL", 400, "decode_data_url")
    m = re.match(r"^data:([^;]+);base64,(.+)$", dataurl or "")
    if not m:
        raise ContourError("INVALID_IMAGE", "Expected a base64 image data URL", 400, "decode_data_url")
    mime = m.group(1).lower()
    if mime not in ("image/png", "image/jpeg", "image/webp"):
        raise ContourError("UNSUPPORTED_FORMAT", "Unsupported image format", 415, "validate_upload")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ContourError("INVALID_IMAGE", "Invalid base64 image data", 400, "decode_data_url") from exc
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ContourError("IMAGE_TOO_LARGE", "Image file exceeds the upload limit", 413, "validate_upload")
    try:
        with Image.open(io.BytesIO(raw)) as header:
            w, h = header.size
            if w * h > MAX_IMAGE_PIXELS or min(w, h) < 2:
                raise ContourError("IMAGE_TOO_LARGE", "Image dimensions exceed the processing limit", 413, "validate_dimensions")
            if header.format not in ("PNG", "JPEG", "WEBP"):
                raise ContourError("UNSUPPORTED_FORMAT", "Unsupported image encoding", 415, "validate_upload")
    except Image.DecompressionBombError as exc:
        raise ContourError("IMAGE_TOO_LARGE", "Image dimensions exceed decoder limit", 413, "validate_dimensions") from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ContourError("INVALID_IMAGE", "Invalid image header", 400, "decode_image") from exc
    buf = np.frombuffer(raw, np.uint8)
    # Keep alpha when it exists: a supplied transparency mask is stronger
    # evidence than any colour-based foreground guess.
    try:
        image = cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)
    except cv2.error as exc:
        raise ContourError("INVALID_IMAGE", "OpenCV image decoding failed", 400, "decode_image") from exc
    if image is None or image.size == 0:
        raise ContourError("INVALID_IMAGE", "OpenCV could not decode the image", 400, "decode_image")
    h, w = image.shape[:2]
    if h * w > MAX_IMAGE_PIXELS:
        raise ContourError("IMAGE_TOO_LARGE", "Image dimensions exceed the processing limit", 413, "validate_dimensions")
    return image, mime, len(raw)


def split_image(img):
    """Return BGR pixels and an optional alpha matte."""
    # OpenCV preserves 16-bit PNG depth. LAB/GrabCut require 8-bit pixels;
    # normalize both colour and alpha using the encoding range, not image contrast.
    if img.dtype == np.uint16:
        img = ((img.astype(np.uint32) + 128) // 257).astype(np.uint8)
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), None
    if img.shape[2] == 4:
        return img[:, :, :3], img[:, :, 3]
    return img[:, :, :3], None


def largest_outer_contour(mask):
    """Keep one outer silhouette and intentionally discard interior detail."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise ContourError("NO_FOREGROUND", "Mask contains no foreground", 422, "segmentation")
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 16:
        raise ContourError("NO_VALID_CONTOUR", "Foreground has no usable area", 422, "contour_validation")
    solid = np.zeros(mask.shape, np.uint8)
    cv2.drawContours(solid, [contour], -1, 255, -1)
    # CHAIN_APPROX_NONE preserves the sampled boundary. Do not simplify it:
    # thin features, sharp tips and small concavities must remain observable.
    contours, _ = cv2.findContours(solid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(contours, key=cv2.contourArea), solid


def border_background_mask(bgr):
    """Segment an object against an arbitrary border-connected background.

    The old implementation assumed a blue sky (B-R < 35). Here the actual
    border pixels establish a LAB background model, then GrabCut refines the
    transition at image edges. No closing/opening is applied after GrabCut,
    because those kernels erase narrow legs, antennae and concavities.
    """
    h, w = bgr.shape[:2]
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    band = max(4, int(round(min(h, w) * 0.035)))
    samples = np.concatenate((
        lab[:band, :, :].reshape(-1, 3), lab[-band:, :, :].reshape(-1, 3),
        lab[:, :band, :].reshape(-1, 3), lab[:, -band:, :].reshape(-1, 3),
    ))
    median = np.median(samples, axis=0)
    # Robust channel scale: gradients and compressed photos do not make a
    # single outlying border pixel redefine foreground.
    scale = np.median(np.abs(samples - median), axis=0) * 1.4826 + 2.0
    dist = np.sqrt(np.sum(((lab - median) / scale) ** 2, axis=2))
    sample_dist = np.sqrt(np.sum(((samples - median) / scale) ** 2, axis=1))
    bg_limit = max(3.0, float(np.percentile(sample_dist, 97.5)) * 1.25)

    gc_mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    gc_mask[dist <= bg_limit] = cv2.GC_BGD
    gc_mask[dist >= bg_limit * 1.45] = cv2.GC_PR_FGD
    # The frame is the most reliable part of a photographed background.
    gc_mask[:2, :] = cv2.GC_BGD
    gc_mask[-2:, :] = cv2.GC_BGD
    gc_mask[:, :2] = cv2.GC_BGD
    gc_mask[:, -2:] = cv2.GC_BGD

    # A small definite foreground seed prevents GrabCut from converging to an
    # all-background solution on low-contrast photographs.
    candidate = (dist >= bg_limit * 1.45).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, 8)
    if count > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        seed = (labels == largest).astype(np.uint8)
        seed = cv2.erode(seed, np.ones((3, 3), np.uint8), iterations=1)
        gc_mask[seed > 0] = cv2.GC_FGD

    bg_model = np.zeros((1, 65), np.float64)
    fg_model = np.zeros((1, 65), np.float64)
    try:
        cv2.setRNGSeed(0)
        cv2.grabCut(bgr, gc_mask, None, bg_model, fg_model, 5, cv2.GC_INIT_WITH_MASK)
        mask = np.where(
            (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0
        ).astype(np.uint8)
    except cv2.error as exc:
        # Retain a deterministic colour-distance fallback for unusually flat
        # images where GrabCut cannot initialise a foreground GMM.
        mask = (candidate * 255).astype(np.uint8)
        logger.warning({"event":"segmentation_fallback","request_id":getattr(g,"request_id",None) if has_request_context() else None,"stage":"grabcut","error":str(exc)})
    return mask


def extract_foreground_contour(img):
    """Return a high-fidelity outer contour in processed-image pixels."""
    bgr, alpha = split_image(img)
    # Some WebP files carry isolated transparent pixels despite being ordinary
    # opaque photographs. Treat alpha as a mask only when it covers a material
    # part of the image, not when it is merely encoder residue.
    alpha_coverage = float(np.mean(alpha < 250)) if alpha is not None else 0.0
    if alpha is not None and np.max(alpha) <= 8:
        raise ContourError("NO_FOREGROUND", "Image is fully transparent", 422, "alpha_mask")
    if alpha is not None and alpha_coverage > 0.01 and np.mean(alpha <= 8) > .01:
        # Preserve semi-transparent silhouettes while excluding a fully
        # transparent background. There is no colour segmentation in this path.
        mask = np.where(alpha > 8, 255, 0).astype(np.uint8)
        method = "alpha"
    else:
        mask = border_background_mask(bgr)
        method = "lab-grabcut"
    try:
        contour, solid = largest_outer_contour(mask)
    except ContourError as initial:
        # Only failed baseline masks enter this fallback. Otsu polarity must
        # explain a mostly background border, and cannot simply select the frame.
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        if int(gray.max())-int(gray.min()) < 2:
            raise initial
        _, threshold = cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        for alternate in (threshold,255-threshold):
            border = np.concatenate((alternate[0],alternate[-1],alternate[:,0],alternate[:,-1]))
            if np.mean(border>0) > .25 or not .0001 < np.mean(alternate>0) < .95:
                continue
            try:
                contour, solid = largest_outer_contour(alternate)
                mask = alternate
                method = "luminance-fallback"
                break
            except ContourError:
                continue
        else:
            raise initial
    logger.info({"event":"mask_validated","method":method,"area_ratio":float(np.mean(solid>0)),
                 "components":int(cv2.connectedComponents(mask)[0]-1), "alpha_coverage":alpha_coverage,
                 "border_touch_ratio":float(np.mean(np.concatenate((solid[0],solid[-1],solid[:,0],solid[:,-1]))>0)),
                 "bbox":list(cv2.boundingRect(contour)),"perimeter":float(cv2.arcLength(contour,True)),
                 "request_id":getattr(g,"request_id",None) if has_request_context() else None})
    return contour, solid, method


def internal_structural_edges(bgr, solid, contour):
    return analyze_structure(bgr, solid)


def png_data_url(image, max_side=420):
    """Encode compact diagnostics without affecting the original upload/export."""
    h, w = image.shape[:2]
    if max(h, w) > max_side:
        scale = max_side / float(max(h, w))
        image = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    # JPEG keeps the optional diagnostic grid well under Vercel's response-body
    # limit. It never participates in contour extraction or export.
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        raise RuntimeError("could not encode diagnostic image")
    return "data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii")


def build_diagnostics(bgr, solid, contour, analysis):
    """Six inspectable stages, all raster-only diagnostics for this iteration."""
    raw, structural = analysis["raw"], analysis["final"]
    mask_view = cv2.cvtColor(solid, cv2.COLOR_GRAY2BGR)
    outer = bgr.copy()
    cv2.drawContours(outer, [contour], -1, (20, 20, 235), 1, cv2.LINE_AA)
    raw_view = np.full_like(bgr, 255)
    raw_view[raw > 0] = (40, 40, 40)
    structural_view = np.full_like(bgr, 255)
    structural_view[structural > 0] = (10, 10, 10)
    combined = np.full_like(bgr, 255)
    combined[structural > 0] = (20, 20, 20)
    cv2.drawContours(combined, [contour], -1, (20, 20, 20), 1, cv2.LINE_AA)
    dashed = bgr.copy()
    points = contour.reshape(-1, 2)
    # Tiny screen-pixel dashes are intentionally diagnostic, not physical 30 mm.
    for start in range(0, len(points), 5):
        segment = points[start:start + 3]
        if len(segment) > 1:
            cv2.polylines(dashed, [segment.reshape(-1, 1, 2)], False, (20, 20, 235), 1, cv2.LINE_AA)
    result = {
        "mask": png_data_url(mask_view), "outer": png_data_url(outer),
        "raw_edges": png_data_url(raw_view), "structural": png_data_url(structural_view),
        "combined": png_data_url(combined), "dashed": png_data_url(dashed),
    }
    result["original"] = png_data_url(bgr)
    for key in ("candidates", "individual", "path_rescued", "rejected", "observed", "reconstruction_candidates", "reconstructed"):
        result[key] = png_data_url(255 - analysis[key])
    return result


@contextmanager
def pipeline_stage(timings, name):
    timings["stage"] = name
    started = time.perf_counter()
    if has_request_context():
        logger.info({"event": "stage_start", "stage": name, "request_id": getattr(g, "request_id", None)})
    try:
        yield
    finally:
        timings[name + "_ms"] = round((time.perf_counter() - started) * 1000, 1)
        if has_request_context():
            logger.info({"event": "stage_end", "stage": name, "request_id": getattr(g, "request_id", None), "duration_ms": timings[name + "_ms"]})


def compute_contour(img, canvas_w=None, canvas_h=None, timings=None):
    timings = timings if timings is not None else {}
    started = time.perf_counter()
    cw = float(canvas_w or CANVAS)
    ch = float(canvas_h or CANVAS)
    H0, W0 = img.shape[:2]
    image_scale = 1.0
    # ограничиваем сторону, чтобы не считать огромные фото
    if max(H0, W0) > MAX_SIDE:
        sc = MAX_SIDE / float(max(H0, W0))
        img = cv2.resize(img, (int(W0 * sc), int(H0 * sc)), interpolation=cv2.INTER_AREA)
        image_scale = sc
    H, W = img.shape[:2]
    timings["resize_ms"] = round((time.perf_counter() - started) * 1000, 1)

    # Segmentation establishes the object mask; only its largest external
    # boundary survives. Surface lines and holes never become exported paths.
    stage_started = time.perf_counter()
    with pipeline_stage(timings, "segmentation"):
        c_out, solid, method = extract_foreground_contour(img)
    timings["segmentation_ms"] = round((time.perf_counter() - stage_started) * 1000, 1)
    bgr, _alpha = split_image(img)
    stage_started = time.perf_counter()
    with pipeline_stage(timings, "structural_edges"):
        analysis = internal_structural_edges(bgr, solid, c_out)
    timings["structural_edges_ms"] = round((time.perf_counter() - stage_started) * 1000, 1)
    points = c_out.reshape(-1, 2).astype(float)
    timings["stage"] = "export_geometry"

    # 5) px -> мм: пропорционально, по большей стороне, центр холста
    x0, y0 = points.min(axis=0)
    x1, y1 = points.max(axis=0)
    bw_px, bh_px = x1 - x0, y1 - y0
    cx_px, cy_px = (x0 + x1) / 2, (y0 + y1) / 2
    scale_mm = (FILL * min(cw, ch)) / max(bw_px, bh_px)
    mm = (points - [cx_px, cy_px]) * scale_mm
    mm[:, 0] += cw / 2
    mm[:, 1] += ch / 2
    n = len(mm)

    # 6) arc-length + разбиение на штрихи ровно DASH_MM
    d2 = np.sqrt(((np.vstack([mm, mm])[1:] - np.vstack([mm, mm])[:-1]) ** 2).sum(axis=1))
    mm2 = np.vstack([mm, mm])
    pos2 = np.concatenate([[0.0], np.cumsum(d2)])
    L = float(np.sqrt(((mm - np.roll(mm, -1, axis=0)) ** 2).sum(axis=1)).sum())

    def interp_at(s):
        s = float(s)
        j = int(np.searchsorted(pos2, s, side="right") - 1)
        j = max(0, min(len(mm2) - 2, j))
        a, b2 = mm2[j], mm2[j + 1]
        seg = d2[j]
        if seg <= 1e-12:
            return a.copy()
        t = min(max((s - pos2[j]) / seg, 0.0), 1.0)
        return a * (1.0 - t) + b2 * t

    def dash_path(s0, s1):
        pts = [interp_at(s0)]
        for j in np.where((pos2 > s0) & (pos2 < s1))[0]:
            pts.append(mm2[j])
        pts.append(interp_at(s1))
        arr = np.array(pts)
        keep = [0]
        for i in range(1, len(arr)):
            if np.hypot(*(arr[i] - arr[keep[-1]])) > 1e-7:
                keep.append(i)
        return arr[keep]

    k = max(1, min(MAX_DASH, int(L // (DASH_MM + GAP_TGT))))
    period = L / k
    gap = period - DASH_MM

    dashes = []
    for i in range(k):
        arr = dash_path(i * period, i * period + DASH_MM)
        dashes.append([[float(x), float(y)] for x, y in arr])

    contour = [[float(x), float(y)] for x, y in mm]
    contour_px = [[float(x / image_scale), float(y / image_scale)] for x, y in points]
    # The same final observed/rescued/reconstructed geometry drives canvas and
    # exports. No second filtering/simplification step is applied here.
    vector_started = time.perf_counter()
    internal_px, _ = edge_graph(analysis["final"])
    internal_lines = []
    for path in internal_px:
        transformed = (path.astype(float) - [cx_px, cy_px]) * scale_mm + [cw/2, ch/2]
        internal_lines.append(transformed.tolist())
    timings["vectorization_ms"] = round((time.perf_counter()-vector_started)*1000,2)
    refined = {"status":"unavailable","indices":[],"error":{"code":"REFINEMENT_ERROR"}}
    refine_started = time.perf_counter()
    try:
        indices, refinement = refine_lines(internal_px, solid, analysis["evidence"])
        refined = {"status":"ok","indices":indices,
                   "summary":{k:v for k,v in refinement.items() if k != "paths"}}
        analysis["metadata"]["refinement"] = {**refinement,"paths":refinement["paths"][:1000],
                                               "paths_truncated":len(refinement["paths"])>1000}
    except Exception:
        # Refinement is optional: detailed geometry remains a successful result.
        logger.error({"event":"refinement_failure","request_id":getattr(g,"request_id",None) if has_request_context() else None,
                      "stage":"refinement","traceback":traceback.format_exc()})
    timings["refinement_ms"] = round((time.perf_counter()-refine_started)*1000,2)

    mx0, my0 = mm.min(axis=0)
    mx1, my1 = mm.max(axis=0)
    meta = {
        "canvas": [cw, ch],
        "bbox_mm": [round(mx1 - mx0, 1), round(my1 - my0, 1)],
        "contour_len": round(L, 3),
        "dash_count": k,
        "gap": round(gap, 3),
        "dash_len": DASH_MM,
        "method": method,
        "image_size": [W0, H0],
        "contour_points": len(contour_px),
    }
    stage_started = time.perf_counter()
    with pipeline_stage(timings, "diagnostics"):
        diagnostics = build_diagnostics(bgr, solid, c_out, analysis)
    timings["diagnostics_ms"] = round((time.perf_counter() - stage_started) * 1000, 1)
    timings["total_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return {"dashes": dashes, "contour": contour, "contour_px": contour_px,
            "internal_lines": internal_lines, "refined": refined,
            "solid_cells": None, "diagnostics": diagnostics, "debug": analysis["metadata"], "meta": meta}


@app.route("/", methods=["POST"])
@app.route("/api/contour", methods=["POST"])
@app.route("/api/contour/", methods=["POST"])
@app.route("/<path:path>", methods=["POST"])
def trace(path="/"):
    supplied_id = request.headers.get("X-Request-ID", "")
    request_id = supplied_id if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", supplied_id) else uuid.uuid4().hex
    g.request_id = request_id
    logger.info({"event": "request_start", "request_id": request_id, "body_bytes": request.content_length})
    began = time.perf_counter()
    timings = {"stage": "parse_json"}
    mime = None
    file_bytes = None
    dimensions = None
    try:
        try:
            data = request.get_json(force=True, silent=False) or {}
        except BadRequest as exc:
            raise ContourError("INVALID_REQUEST", "Request JSON could not be parsed", 400, "parse_json") from exc
        if not isinstance(data, dict):
            raise ContourError("INVALID_REQUEST", "Request JSON must be an object", 400, "parse_json")
        # Log only metadata, never the encoded image itself. This also leaves
        # useful context when base64 validation fails before decoding.
        encoded_image = data.get("image") or ""
        match = re.match(r"^data:([^;]+);base64,(.*)$", encoded_image) if isinstance(encoded_image, str) else None
        if match:
            mime = match.group(1).lower()
            file_bytes = (len(match.group(2).rstrip("=")) * 3) // 4
        decode_started = time.perf_counter()
        timings["stage"] = "decode_image"
        img, mime, file_bytes = decode_dataurl(data.get("image"))
        dimensions = [int(img.shape[1]), int(img.shape[0])]
        timings["decode_ms"] = round((time.perf_counter() - decode_started) * 1000, 1)
        canvas = data.get("canvas") or []
        if not isinstance(canvas, list) or len(canvas) > 2 or any(
                isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 1 <= v <= 2000 for v in canvas):
            raise ContourError("INVALID_REQUEST", "Invalid canvas dimensions", 400, "validate_canvas")
        cw = canvas[0] if len(canvas) > 0 else CANVAS
        ch = canvas[1] if len(canvas) > 1 else CANVAS
        res = compute_contour(img, cw, ch, timings)
        timings.update(res["debug"]["timings_ms"])
        if data.get("debug") is not True:
            res.pop("debug", None)
            res.pop("diagnostics", None)
        timings["stage"] = "serialize"
        payload = jsonify(res)
        if payload.calculate_content_length() > 4_250_000:
            raise ContourError("RESPONSE_TOO_LARGE", "Result exceeds response budget", 422, "serialize")
        timings["total_ms"] = round((time.perf_counter() - began) * 1000, 1)
        logger.info({"event": "contour_success", "request_id": request_id,
                     "mime": mime, "file_bytes": file_bytes, "image_size": dimensions,
                     "timings_ms": timings, "response_bytes": payload.calculate_content_length()})
        payload.headers["X-Request-ID"] = request_id
        return payload
    except ContourError as exc:
        timings["total_ms"] = round((time.perf_counter() - began) * 1000, 1)
        logger.warning({"event": "contour_rejected", "request_id": request_id,
                        "code": exc.code, "stage": exc.stage, "mime": mime,
                        "file_bytes": file_bytes, "image_size": dimensions,
                        "timings_ms": timings, "error": str(exc)})
        response = jsonify({"error": {"code": exc.code, "message": "Image could not be processed"},
                            "request_id": request_id})
        response.status_code = exc.status
        response.headers["X-Request-ID"] = request_id
        return response
    except RequestEntityTooLarge:
        logger.warning(json.dumps({"event": "contour_rejected", "request_id": request_id, "stage": "parse_json", "code": "IMAGE_TOO_LARGE", "body_bytes": request.content_length}))
        response = jsonify({"error": {"code": "IMAGE_TOO_LARGE"}, "request_id": request_id})
        response.status_code = 413
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as exc:  # noqa: BLE001
        timings["total_ms"] = round((time.perf_counter() - began) * 1000, 1)
        logger.error({"event": "contour_failure", "request_id": request_id,
                      "stage": timings.get("stage"), "mime": mime, "file_bytes": file_bytes,
                      "image_size": dimensions, "timings_ms": timings,
                      "error_type": type(exc).__name__, "error": str(exc),
                      "traceback": traceback.format_exc()})
        response = jsonify({"error": {"code": "INTERNAL_ERROR", "message": "Contour processing failed"},
                            "request_id": request_id})
        response.status_code = 500
        response.headers["X-Request-ID"] = request_id
        return response


@app.route("/", methods=["GET"])
@app.route("/api/contour", methods=["GET"])
@app.route("/api/contour/", methods=["GET"])
def ping(path="/"):
    if request.path == "/":
        return send_from_directory(str(Path(__file__).resolve().parent.parent), "index.html")
    return jsonify({"ok": True, "service": "contour", "opencv": cv2.__version__,
                    "pipeline": "dual-output-v2", "revision": os.environ.get("VERCEL_GIT_COMMIT_SHA")})
