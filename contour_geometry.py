"""Class-independent observed-edge scoring and evidence-gated gap repair.

All coordinates below are processed-image pixels. No mask skeleton is drawn.
The sparse edge graph is used only for measurements and endpoint tangents.
"""
import math
import time
from collections import defaultdict
import cv2
import numpy as np

RECONSTRUCTION_THRESHOLD = .78
OBSERVED_THRESHOLD = .56


def rescue_paths(chains, records, shape, diagonal, evidence, support):
    """Pair tangent-compatible chain ends at observed vertices, never whole CCs.

    Only existing candidate edges enter a path. Missing pixels remain the
    responsibility of the independently evidence-gated reconstruction pass.
    Endpoint indexing and bounded vertex degree avoid all-pairs chain searches.
    """
    ends = defaultdict(list)
    span = max(3, round(diagonal * .006))
    tangents = {}
    for i, chain in enumerate(chains):
        for side, path in enumerate((chain, chain[::-1])):
            if np.array_equal(chain[0], chain[-1]):
                continue
            delta = (path[min(span, len(path)-1)] - path[0]).astype(float)
            delta /= max(1e-9, np.linalg.norm(delta))
            tangents[i, side] = delta
            ends[tuple(path[0])].append((i, side))
    links = {}
    for endpoints in ends.values():
        pairs = []
        for k, a in enumerate(endpoints):
            for b in endpoints[k+1:]:
                if a[0] == b[0]:
                    continue
                alignment = float(-tangents[a] @ tangents[b])
                if alignment >= math.cos(math.radians(35)):
                    pairs.append((-alignment, a, b))
        for _, a, b in sorted(pairs):
            if a not in links and b not in links:
                links[a], links[b] = b, a
    visited, paths = set(), []
    starts = [(i,s) for i in range(len(chains)) for s in (0,1) if (i,s) not in links]
    starts += [(i,0) for i in range(len(chains))]
    rescued = np.zeros(shape, np.uint8)
    for start in starts:
        if start[0] in visited:
            continue
        sequence, pieces, current = [], [], start
        while current[0] not in visited:
            i, side = current
            visited.add(i); sequence.append(i)
            p = chains[i] if side == 0 else chains[i][::-1]
            pieces.append(p if not pieces else p[1:])
            nxt = links.get((i, 1-side))
            if nxt is None:
                break
            current = nxt
        path = np.vstack(pieces)
        if len(sequence) < 2 or len(path) < 3:
            continue
        x,y = path.T
        length = float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum())
        # Measure path curvature above the tangent-estimation scale so raster
        # stair steps do not masquerade as independent abrupt turns.
        sampled = path[::max(3, round(diagonal*.012))].astype(float)
        if not np.array_equal(sampled[-1],path[-1]):
            sampled = np.vstack((sampled,path[-1]))
        vectors = np.diff(sampled,axis=0)
        vectors /= np.maximum(1e-9,np.linalg.norm(vectors,axis=1))[:,None]
        angles = np.arccos(np.clip(np.sum(vectors[1:]*vectors[:-1],axis=1),-1,1))
        continuity = math.exp(-float(np.mean(angles))) if len(angles) else 0.
        mean = float(np.mean(evidence[y,x])); median = float(np.median(evidence[y,x]))
        persistence = float(np.mean(support[y,x]))
        score = .30*min(1.,length/max(1.,diagonal*.09))+.25*continuity+.25*mean+.20*persistence
        reasons = []
        if length < diagonal*.055: reasons.append("short_path")
        if continuity < .7: reasons.append("irregular_turns")
        if mean < .25 or median < .2: reasons.append("weak_path_evidence")
        # Scale support is a score contribution, not a veto: translucent
        # structures may have coherent fine-scale evidence only.
        if score < .68: reasons.append("low_path_score")
        accepted = not reasons
        pid = len(paths)
        paths.append({"id":pid,"segment_ids":sequence,"length":length,"continuity":continuity,
                      "edge_mean":mean,"edge_median":median,"persistence":persistence,
                      "score":score,"threshold":.68,"accepted":accepted,"reasons":reasons})
        for i in sequence:
            r=records[i]
            r.update(path_id=pid,path_score=score,path_continuity=continuity)
            # A long path cannot rescue a locally unsupported branch. Actual
            # short candidate connectors use the path's measured continuity.
            if accepted and not r["individually_accepted"] and r["edge_confidence"] >= .15:
                p=chains[i];rescued[p[:,1],p[:,0]]=255
                r.update(accepted=True,path_rescued=True,reason="coherent_observed_path")
    return rescued, paths


def thin_edges(edges):
    """Zhang–Suen thinning of observed edge pixels, never of the object mask."""
    a = np.pad((edges > 0).astype(np.uint8), 1)
    for _ in range(32):
        changed = False
        for phase in (0, 1):
            c = a[1:-1, 1:-1]
            p = [a[:-2, 1:-1], a[:-2, 2:], a[1:-1, 2:], a[2:, 2:],
                 a[2:, 1:-1], a[2:, :-2], a[1:-1, :-2], a[:-2, :-2]]
            n = sum(p)
            transitions = sum(((p[i] == 0) & (p[(i + 1) % 8] == 1)).astype(np.uint8) for i in range(8))
            if phase == 0:
                constraint = (p[0] * p[2] * p[4] == 0) & (p[2] * p[4] * p[6] == 0)
            else:
                constraint = (p[0] * p[2] * p[6] == 0) & (p[0] * p[4] * p[6] == 0)
            remove = (c > 0) & (n >= 2) & (n <= 6) & (transitions == 1) & constraint
            changed |= bool(np.any(remove))
            c[remove] = 0
        if not changed:
            break
    return a[1:-1, 1:-1] * 255


def geometry(mask):
    y, x = np.nonzero(mask)
    points = np.column_stack((x, y)).astype(float)
    center = points.mean(axis=0)
    values, vectors = np.linalg.eigh(np.cov(points.T))
    axes = vectors[:, ::-1].T
    sample = points[::max(1, len(points) // 12000)]
    best, axis = 0., axes[0]
    # Both PCA axes are plausible reflection axes; do not assume elongation
    # implies bilateral symmetry. Approximate IoU is only a soft bonus.
    for candidate in axes:
        delta = sample - center
        mirror = np.rint(center + 2 * (delta @ candidate)[:, None] * candidate - delta).astype(int)
        inside = (mirror[:, 0] >= 0) & (mirror[:, 0] < mask.shape[1]) & (mirror[:, 1] >= 0) & (mirror[:, 1] < mask.shape[0])
        hit = np.zeros(len(sample), bool)
        hit[inside] = mask[mirror[inside, 1], mirror[inside, 0]] > 0
        overlap = float(hit.mean())
        score = overlap / max(1e-6, 2 - overlap)
        if score > best:
            best, axis = score, candidate
    bbox = cv2.boundingRect(mask)
    return {"centroid": center.tolist(), "bbox": list(bbox), "axes": axes.tolist(),
            "orientation_rad": float(math.atan2(axes[0, 1], axes[0, 0])),
            "symmetry_axis": axis.tolist(), "symmetry": best,
            "components": int(cv2.connectedComponents(mask)[0] - 1),
            "diagonal": math.hypot(bbox[2], bbox[3])}


def edge_graph(edges):
    """Trace chains between endpoints/junctions without smoothing their pixels."""
    pixels = set(map(tuple, np.argwhere(edges > 0)))
    neighbors = {}
    for y, x in sorted(pixels):
        ns = []
        for dy, dx in ((-1, 0), (0, -1), (0, 1), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            p = (y + dy, x + dx)
            if p in pixels:
                # Avoid triangular shortcuts on ordinary staircase edges.
                if dy and dx and ((y + dy, x) in pixels or (y, x + dx) in pixels):
                    continue
                ns.append(p)
        neighbors[(y, x)] = ns
    visited, chains = set(), []
    starts = [p for p in neighbors if len(neighbors[p]) != 2]
    for start in starts + list(neighbors):
        for nxt in neighbors[start]:
            edge = tuple(sorted((start, nxt)))
            if edge in visited:
                continue
            path = [start]
            prev, cur = start, nxt
            visited.add(edge)
            while True:
                path.append(cur)
                if len(neighbors[cur]) != 2 or cur == start:
                    break
                target = next(p for p in neighbors[cur] if p != prev)
                edge = tuple(sorted((cur, target)))
                if edge in visited:
                    break
                visited.add(edge)
                prev, cur = cur, target
            chains.append(np.array([(x, y) for y, x in path], np.int32))
    return chains, neighbors


def mirrored_support(points, evidence, geo):
    if geo["symmetry"] < .7:
        return 0.
    center, axis = np.array(geo["centroid"]), np.array(geo["symmetry_axis"])
    delta = points - center
    p = np.rint(center + 2 * (delta @ axis)[:, None] * axis - delta).astype(int)
    valid = (p[:, 0] >= 0) & (p[:, 0] < evidence.shape[1]) & (p[:, 1] >= 0) & (p[:, 1] < evidence.shape[0])
    hit = np.zeros(len(p))
    hit[valid] = evidence[p[valid, 1], p[valid, 0]]
    return float(hit.mean()) * geo["symmetry"]


def bridge_gaps(observed, weak_evidence, valid, geo, threshold=RECONSTRUCTION_THRESHOLD):
    chains, graph = edge_graph(observed)
    diagonal = geo["diagonal"]
    max_gap = max(2., diagonal * .018)
    endpoints = []
    for i, path in enumerate(chains):
        if len(path) < max(4, diagonal * .008):
            continue
        for p in (path, path[::-1]):
            if len(graph[tuple(p[0][::-1])]) != 1:
                continue
            tangent = (p[0] - p[min(len(p) - 1, max(3, round(diagonal * .008)))]).astype(float)
            tangent /= max(1e-6, np.linalg.norm(tangent))
            endpoints.append((i, p[0], tangent))
    candidates, accepted = np.zeros_like(observed), np.zeros_like(observed)
    records, used = [], set()
    # Grid bounds candidate search on highly textured images.
    buckets = {}
    for i, (_, point, _) in enumerate(endpoints):
        key = tuple((point // max_gap).astype(int))
        buckets.setdefault(key, []).append(i)
    proposals = []
    for i, (chain, a, ta) in enumerate(endpoints):
        key = tuple((a // max_gap).astype(int))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in buckets.get((key[0] + dx, key[1] + dy), []):
                    if j <= i or endpoints[j][0] == chain:
                        continue
                    _, b, tb = endpoints[j]
                    length = float(np.linalg.norm(b - a))
                    if not 1.5 < length <= max_gap:
                        continue
                    direction = (b - a) / length
                    alignment = min(float(ta @ direction), float(tb @ -direction))
                    if alignment < .85:
                        continue
                    line = np.rint(np.linspace(a, b, max(3, math.ceil(length * 2)))).astype(np.int32)
                    line = np.unique(line, axis=0)
                    # Exclude endpoints: their existing edges cannot substantiate
                    # an otherwise empty gap. Require evidence THROUGH the gap.
                    interior = line[(np.linalg.norm(line - a, axis=1) > 1) & (np.linalg.norm(line - b, axis=1) > 1)]
                    if not len(interior):
                        continue
                    evidence = weak_evidence[interior[:, 1], interior[:, 0]]
                    coverage = float(np.mean(evidence >= .18))
                    strength = float(np.mean(evidence))
                    inside = bool(np.all(valid[line[:, 1], line[:, 0]]))
                    symmetry = mirrored_support(interior, weak_evidence, geo)
                    confidence = .45 * alignment + .35 * min(1., strength / .45) + .15 * coverage + .05 * symmetry
                    keep = inside and coverage >= .7 and strength >= .18 and confidence >= threshold
                    cv2.line(candidates, tuple(a), tuple(b), 255, 1)
                    record = {"from": a.tolist(), "to": b.tolist(), "length": length,
                              "score": confidence, "edge_confidence": strength, "coverage": coverage,
                              "continuity": alignment, "symmetry": symmetry, "accepted": False,
                              "reason": "eligible" if keep else "insufficient_evidence_or_geometry"}
                    records.append(record)
                    if keep:
                        proposals.append((confidence, i, j, record))
    for _, i, j, record in sorted(proposals, key=lambda p: (-p[0], p[1], p[2])):
        if i in used or j in used:
            record["reason"] = "endpoint_already_linked"
            continue
        a, b = tuple(record["from"]), tuple(record["to"])
        link = np.zeros_like(observed)
        cv2.line(link, a, b, 255, 1)
        link[a[1], a[0]] = link[b[1], b[0]] = 0
        if np.any((link > 0) & ((observed > 0) | (accepted > 0))):
            record["reason"] = "would_cross_existing_line"
            continue
        accepted |= link
        used.update((i, j))
        record.update(accepted=True, reason="supported_tangent_bridge")
    return candidates, accepted, records


def analyze_structure(bgr, mask, audit=None):
    started = time.perf_counter()
    geo = geometry(mask)
    timings = {"geometry_ms": round((time.perf_counter() - started) * 1000, 2)}
    stage_start = time.perf_counter()
    diagonal = geo["diagonal"]
    unit = max(.7, diagonal / 1000.)
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    valid = distance > max(1., diagonal * .0015)
    denoised = cv2.bilateralFilter(bgr, max(3, round(unit * 5) | 1), 25, max(2., unit * 5))
    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    scales, magnitudes = [], []
    for sigma in (.8 * unit, 1.8 * unit, 3.4 * unit):
        edges = np.zeros_like(mask)
        magnitude = np.zeros(mask.shape, np.float32)
        for channel in cv2.split(lab):
            blurred = cv2.GaussianBlur(channel, (0, 0), sigma)
            gx = cv2.Sobel(blurred, cv2.CV_32F, 1, 0)
            gy = cv2.Sobel(blurred, cv2.CV_32F, 0, 1)
            grad = cv2.magnitude(gx, gy)
            values = grad[valid & (grad > 0)]
            # Strict Canny hysteresis needs a threshold BELOW a uniform edge's
            # magnitude; its exact percentile would erase perfectly even lines.
            high = max(10., float(np.percentile(values, 82)) * .85) if len(values) else 10.
            edges |= cv2.Canny(blurred, high * .3, high, L2gradient=True)
            magnitude = np.maximum(magnitude, grad)
        scales.append(edges * valid.astype(np.uint8))
        magnitudes.append(magnitude)
    raw = scales[0]
    timings["edge_extraction_ms"] = round((time.perf_counter()-stage_start)*1000,2)
    radius = max(1, round(unit))
    kernel = np.ones((radius * 2 + 1,) * 2, np.uint8)
    support = sum((cv2.dilate(e, kernel) > 0).astype(np.float32) for e in scales) / 3.
    grad = magnitudes[0]
    # Local normalization allows faint coherent lines near bright/translucent
    # surfaces to compete without boosting every low-contrast region equally.
    window = max(3, round(diagonal * .035) | 1)
    local = cv2.sqrt(cv2.boxFilter(grad * grad, -1, (window, window)))
    global_ref = max(6., float(np.percentile(grad[valid], 85))) if np.any(valid) else 6.
    evidence = np.clip(grad / np.maximum(global_ref * .2, local * 1.8), 0, 1) * valid
    candidate_started = time.perf_counter()
    candidates = thin_edges(raw)
    timings["candidate_construction_ms"] = round((time.perf_counter()-candidate_started)*1000,2)
    graph_started = time.perf_counter()
    chains, graph = edge_graph(candidates)
    timings["graph_ms"] = round((time.perf_counter()-graph_started)*1000,2)
    timings["edges_and_graph_ms"] = round((time.perf_counter() - stage_start) * 1000, 2)
    stage_start = time.perf_counter()
    _, labels, stats, _ = cv2.connectedComponentsWithStats(candidates, 8)
    observed = np.zeros_like(mask)
    records = []
    neighborhood = cv2.dilate(raw, kernel) / 255.
    for i, path in enumerate(chains):
        x, y = path.T
        length = float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum())
        stride = max(2, round(diagonal * .006))
        sampled = path[::stride].astype(float)
        if len(sampled) > 2:
            vectors = np.diff(sampled, axis=0)
            vectors /= np.maximum(1e-6, np.linalg.norm(vectors, axis=1))[:, None]
            curvature = float(np.mean(np.arccos(np.clip(np.sum(vectors[1:] * vectors[:-1], axis=1), -1, 1))))
            smoothness = math.exp(-curvature)
        else:
            smoothness = .5
        persistence = float(support[y, x].mean())
        strength = float(evidence[y, x].mean())
        connected = min(1., float(stats[labels[y[0], x[0]], cv2.CC_STAT_AREA]) / max(1., diagonal * .18))
        junctions = sum(len(graph[tuple(p[::-1])]) > 2 for p in (path[0], path[-1]))
        symmetry = mirrored_support(path, neighborhood, geo)
        length_score = min(1., length / max(1., diagonal * .09))
        score = (.24 * length_score + .2 * persistence + .18 * strength + .16 * smoothness
                 + .13 * connected + .04 * min(1, junctions) + .05 * symmetry)
        # Short isolated one-pixel noise is excluded, but neither low contrast
        # nor a missing coarse-scale detection can veto an otherwise good line.
        accepted = length >= max(2., diagonal * .004) and score >= OBSERVED_THRESHOLD
        if accepted:
            observed[y, x] = 255
        records.append({"id": i, "start": path[0].tolist(), "end": path[-1].tolist(),
                        "length": length, "score": score, "edge_confidence": strength,
                        "persistence": persistence, "continuity": smoothness,
                        "connected": connected, "junctions": junctions, "symmetry": symmetry,
                        "boundary_distance": float(distance[y, x].mean()), "accepted": accepted,
                        "reason": "observed_geometry" if accepted else "short_spur_or_low_combined_score"})
        records[-1].update(individually_accepted=accepted,path_rescued=False,path_id=None,
                           individual_reason=records[-1]["reason"],path_score=None)
    timings["scoring_ms"] = round((time.perf_counter() - stage_start) * 1000, 2)
    individually_accepted = observed.copy()
    stage_start = time.perf_counter()
    rescued, paths = rescue_paths(chains, records, mask.shape, diagonal, evidence, support)
    observed |= rescued
    timings["path_analysis_ms"] = round((time.perf_counter() - stage_start) * 1000, 2)
    stage_start = time.perf_counter()
    proposals, repaired, bridges = bridge_gaps(observed, evidence, valid, geo)
    timings["reconstruction_ms"] = round((time.perf_counter() - stage_start) * 1000, 2)
    rejected = cv2.bitwise_and(candidates, cv2.bitwise_not(observed))
    geo["edge_endpoints"] = sum(len(n) == 1 for n in graph.values())
    geo["edge_junctions"] = sum(len(n) > 2 for n in graph.values())
    # Opt-in local instrumentation only. No scoring, drawing or API-output
    # changes; retain all pre-truncation segments for the diagnostic harness.
    if audit is not None:
        audit.update(raw=raw, candidates=candidates, chains=chains, graph=graph,
                     labels=labels, stats=stats, records=records, gradient=grad,
                     evidence=evidence, distance=distance, observed=observed,
                     reconstructed=repaired, final=observed | repaired, geometry=geo,
                     sampling_stride=max(2, round(diagonal * .006)))
        audit.update(paths=paths,individual=individually_accepted,path_rescued=rescued)
    records.sort(key=lambda r: (-r["length"], r["id"]))
    return {"raw": raw, "candidates": candidates, "individual": individually_accepted,
            "path_rescued": rescued, "observed": observed, "rejected": rejected,
            "reconstruction_candidates": proposals, "reconstructed": repaired, "final": observed | repaired,
            "metadata": {"geometry": geo, "timings_ms": timings, "segments": records[:2000], "bridges": bridges[:1000],
                         "paths": paths[:1500], "path_count":len(paths),
                         "rescued_segments":sum(r["path_rescued"] for r in records),
                         "segment_count": len(records), "bridge_count": len(bridges),
                         "metadata_truncated": len(records) > 2000 or len(bridges) > 1000 or len(paths)>1500,
                         "observed_threshold": OBSERVED_THRESHOLD,
                         "reconstruction_threshold": RECONSTRUCTION_THRESHOLD}}
