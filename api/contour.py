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
EPS_PX = 1.5
MAX_SIDE = 1024       # ограничение размера загружаемого изображения


def decode_dataurl(dataurl):
    m = re.match(r"^data:([^;]+);base64,(.+)$", dataurl or "")
    if not m:
        return None
    raw = base64.b64decode(m.group(2))
    buf = np.frombuffer(raw, np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def compute_contour(img, canvas_w=None, canvas_h=None):
    cw = float(canvas_w or CANVAS)
    ch = float(canvas_h or CANVAS)
    H, W = img.shape[:2]
    # ограничиваем сторону, чтобы не считать огромные фото
    if max(H, W) > MAX_SIDE:
        sc = MAX_SIDE / float(max(H, W))
        img = cv2.resize(img, (int(W * sc), int(H * sc)), interpolation=cv2.INTER_AREA)
        H, W = img.shape[:2]

    # 1) сегментация: тёплый/тёмный объект на голубом небе (B - R мало)
    B = img[:, :, 0].astype(np.int16)
    R = img[:, :, 2].astype(np.int16)
    mask = ((B - R) < 35).astype(np.uint8) * 255

    # 2) морфология: замыкание + открытие (5x5)
    k = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  k, iterations=1)

    # 3) внешний контур: самая большая внешняя область, заливка holes
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        raise RuntimeError("no contour")
    c_big = max(cnts, key=cv2.contourArea)
    solid = np.zeros((H, W), np.uint8)
    cv2.drawContours(solid, [c_big], -1, 255, -1)

    cnts2, _ = cv2.findContours(solid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c_out = max(cnts2, key=cv2.contourArea)

    # 4) лёгкое упрощение (только пиксельный шум, геометрию сохраняем)
    simpl = cv2.approxPolyDP(c_out, EPS_PX, True).reshape(-1, 2).astype(float)

    # 5) px -> мм: пропорционально, по большей стороне, центр холста
    x0, y0 = simpl.min(axis=0)
    x1, y1 = simpl.max(axis=0)
    bw_px, bh_px = x1 - x0, y1 - y0
    cx_px, cy_px = (x0 + x1) / 2, (y0 + y1) / 2
    scale_mm = (FILL * min(cw, ch)) / max(bw_px, bh_px)
    mm = (simpl - [cx_px, cy_px]) * scale_mm
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

    mx0, my0 = mm.min(axis=0)
    mx1, my1 = mm.max(axis=0)
    meta = {
        "canvas": [cw, ch],
        "bbox_mm": [round(mx1 - mx0, 1), round(my1 - my0, 1)],
        "contour_len": round(L, 3),
        "dash_count": k,
        "gap": round(gap, 3),
        "dash_len": DASH_MM,
    }
    return {"dashes": dashes, "contour": contour, "solid_cells": None, "meta": meta}


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
