"""Downstream subset selection: never move, smooth or invent detailed pixels."""
import math
import time
import cv2
import numpy as np
from contour_geometry import rescue_paths


def refine_lines(chains, mask, evidence):
    started = time.perf_counter()
    _, _, w, h = cv2.boundingRect(mask)
    diagonal = math.hypot(w, h)
    records = [{"individually_accepted": True, "edge_confidence": 1.} for _ in chains]
    # Reuse tangent-compatible graph continuations, but not their rescue decision.
    _, paths = rescue_paths(chains, records, mask.shape, diagonal, evidence, evidence)
    groups = [p["segment_ids"] for p in paths]
    continuity_by_group = {tuple(p["segment_ids"]):p["continuity"] for p in paths}
    grouped = {i for group in groups for i in group}
    groups += [[i] for i in range(len(chains)) if i not in grouped]
    endpoints = {}
    for chain in chains:
        for point in (chain[0], chain[-1]):
            key = tuple(point)
            endpoints[key] = endpoints.get(key, 0) + 1
    raster = np.zeros(mask.shape, np.uint8)
    for p in chains:
        raster[p[:, 1], p[:, 0]] = 1
    window = max(5, round(diagonal * .1))
    density = cv2.boxFilter(raster.astype(np.float32), -1, (window, window), normalize=False) / window
    ranked = []
    for ids in groups:
        pixels = np.vstack([chains[i] for i in ids])
        x, y = pixels.T
        length = sum(float(np.linalg.norm(np.diff(chains[i], axis=0), axis=1).sum()) for i in ids)
        vectors = []
        for i in ids:
            p = chains[i].astype(float)
            span = max(1, round(diagonal * .008))
            v = p[np.minimum(np.arange(len(p))+span,len(p)-1)] - p[np.maximum(np.arange(len(p))-span,0)]
            v /= np.maximum(1e-9, np.linalg.norm(v, axis=1))[:, None]
            vectors.append(v)
        vectors = np.vstack(vectors)
        turns = np.arccos(np.clip(np.sum(vectors[1:]*vectors[:-1],axis=1),-1,1))
        coherence = continuity_by_group.get(tuple(ids), math.exp(-float(turns.mean())) if len(turns) else 1.)
        junctions = sum(endpoints[tuple(chains[i][s])] > 2 for i in ids for s in (0,-1))
        confidence = float(evidence[y,x].mean())
        crowded = float(density[y,x].mean())
        # Importance combines length, continuation, inherited gradient evidence,
        # and junction participation. Density is a penalty, not a global cap.
        score = .4*min(1.,length/(diagonal*.15)) + .2*coherence + .25*confidence + .15*min(1.,junctions/2) - .08*max(0.,crowded-2)
        ranked.append(dict(ids=ids,pixels=pixels,vectors=vectors,length=length,score=score,
                           confidence=confidence,junctions=junctions,density=crowded))
    # Spatial, orientation-aware NMS. Each pixel stores the direction of the
    # strongest retained nearby path; crossings do not have parallel overlap.
    occupied = np.zeros(mask.shape, bool)
    directions = np.zeros((*mask.shape,2), np.float32)
    cell = max(4, round(diagonal*.1))
    loads = {}
    radius = max(1, round(diagonal*.005))
    kept, decisions = [], []
    for item in sorted(ranked,key=lambda r:(-r["score"],r["ids"][0])):
        p,v = item["pixels"],item["vectors"]
        x,y = p.T
        parallel = np.abs(np.sum(directions[y,x]*v,axis=1)) >= math.cos(math.radians(20))
        overlap = float(np.mean(occupied[y,x] & parallel))
        cells = {(int(px)//cell,int(py)//cell) for px,py in p}
        local_load = sum(loads.get(c,0) for c in cells)/max(1,len(cells))
        short = item["length"] < diagonal*.035
        reason = "retained"
        if overlap >= .8: reason = "redundant"
        elif short and item["junctions"] < 2 and item["score"] < .58: reason = "low_importance"
        elif item["length"] < diagonal*.09 and local_load > cell*2 and item["score"] < .65: reason = "local_density"
        elif item["score"] < .27: reason = "low_importance"
        decisions.append({k:value for k,value in item.items() if k not in ("pixels","vectors") } | {"overlap":overlap,"reason":reason})
        if reason != "retained": continue
        kept.extend(item["ids"])
        for c in cells: loads[c] = loads.get(c,0)+len(p)/max(1,len(cells))
        for dy in range(-radius,radius+1):
            for dx in range(-radius,radius+1):
                if dx*dx+dy*dy > radius*radius: continue
                xx,yy = x+dx,y+dy
                valid = (xx>=0)&(yy>=0)&(xx<mask.shape[1])&(yy<mask.shape[0])
                xx,yy,vv = xx[valid],yy[valid],v[valid]
                free = ~occupied[yy,xx]
                directions[yy[free],xx[free]] = vv[free]
                occupied[yy,xx] = True
    counts = {reason:sum(len(d["ids"]) for d in decisions if d["reason"]==reason) for reason in ("retained","redundant","low_importance","local_density")}
    return sorted(kept), {"detailed_count":len(chains),"refined_count":len(kept),
                         "suppression":counts,"simplification_ratio":1-len(kept)/len(chains) if chains else 0.,
                         "refinement_ms":round((time.perf_counter()-started)*1000,2),"paths":decisions}
