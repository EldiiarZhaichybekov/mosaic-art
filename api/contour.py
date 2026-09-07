#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
api/contour.py — серверная функция (Vercel Python + OpenCV).
========================================================
Принимает картинку (base64 data URL) и возвращает:
  - dashes  : список пунктиров, каждый ровно 30.000 мм (полилинии в мм, 0..400)
  - contour : полный внешний контур (мм, 0..400) — для подложки/проверки
  - meta    : canvas, bbox, длина контура, кол-во штрихов, gap

Тот же алгоритм, что в локальном bat_contour.py: сегментация (B-R) от голубого
неба -> морфология -> внешний контур (RETR_EXTERNAL) -> заливка holes ->
approxPolyDP (малый eps) -> px->мм (пропорционально, 88% ширины) ->
arc-length -> разбиение на штрихи ровно 30 мм с равным зазором (без короткого хвоста).
"""
import base64
import io
import math
import re

import numpy as np
import cv2
from flask import Flask, request, jsonify

app = Flask(__name__)


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    return resp

CANVAS = 400.0        # мм
FILL = 0.88
DASH_MM = 30.0
GAP_TGT = 1.0        # малый зазор: штрихи вплотную, но остаются штрихами
MAX_DASH = 150
MAX_SIDE = 1024       # ограничение размера загружаемого изображения


def decode_dataurl(dataurl):
    m = re.match(r"^data:([^;]+);base64,(.+)$", dataurl or "")
    if not m:
        return None
    raw = base64.b64decode(m.group(2))
    buf = np.frombuffer(raw, np.uint8)
    # Keep alpha when it exists: a supplied transparency mask is stronger
    # evidence than any colour-based foreground guess.
    return cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)


def split_image(img):
    """Return BGR pixels and an optional alpha matte."""
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), None
    if img.shape[2] == 4:
        return img[:, :, :3], img[:, :, 3]
    return img[:, :, :3], None


def largest_outer_contour(mask):
    """Keep one outer silhouette and intentionally discard interior detail."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise RuntimeError("no foreground contour")
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 16:
        raise RuntimeError("foreground contour is too small")
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
        cv2.grabCut(bgr, gc_mask, None, bg_model, fg_model, 5, cv2.GC_INIT_WITH_MASK)
        mask = np.where(
            (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0
        ).astype(np.uint8)
    except cv2.error:
        # Retain a deterministic colour-distance fallback for unusually flat
        # images where GrabCut cannot initialise a foreground GMM.
        mask = (candidate * 255).astype(np.uint8)
    return mask


def extract_foreground_contour(img):
    """Return a high-fidelity outer contour in processed-image pixels."""
    bgr, alpha = split_image(img)
    # Some WebP files carry isolated transparent pixels despite being ordinary
    # opaque photographs. Treat alpha as a mask only when it covers a material
    # part of the image, not when it is merely encoder residue.
    alpha_coverage = float(np.mean(alpha < 250)) if alpha is not None else 0.0
    if alpha is not None and alpha_coverage > 0.01:
        # Preserve semi-transparent silhouettes while excluding a fully
        # transparent background. There is no colour segmentation in this path.
        mask = np.where(alpha > 8, 255, 0).astype(np.uint8)
        method = "alpha"
    else:
        mask = border_background_mask(bgr)
        method = "lab-grabcut"
    contour, solid = largest_outer_contour(mask)
    return contour, solid, method


def compute_contour(img, canvas_w=None, canvas_h=None):
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

    # Segmentation establishes the object mask; only its largest external
    # boundary survives. Surface lines and holes never become exported paths.
    c_out, _solid, method = extract_foreground_contour(img)
    points = c_out.reshape(-1, 2).astype(float)

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
    return {"dashes": dashes, "contour": contour, "contour_px": contour_px,
            "solid_cells": None, "meta": meta}


@app.route("/", methods=["POST"])
@app.route("/api/contour", methods=["POST"])
@app.route("/api/contour/", methods=["POST"])
@app.route("/<path:path>", methods=["POST"])
def trace(path="/"):
    data = request.get_json(force=True, silent=True) or {}
    img = decode_dataurl(data.get("image"))
    if img is None:
        return jsonify({"error": "image (data URL) required"}), 400
    canvas = data.get("canvas") or []
    cw = canvas[0] if len(canvas) > 0 else CANVAS
    ch = canvas[1] if len(canvas) > 1 else CANVAS
    try:
        res = compute_contour(img, cw, ch)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": str(exc)}), 500
    return jsonify(res)


@app.route("/", methods=["GET"])
@app.route("/api/contour", methods=["GET"])
@app.route("/api/contour/", methods=["GET"])
def ping(path="/"):
    return jsonify({"ok": True, "service": "contour", "opencv": cv2.__version__})
