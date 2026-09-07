"""Read-only pipeline audit and standalone clickable segment inspector.

Usage: PYTHONPATH=. python tests/diagnose_segments.py image /tmp/output-prefix
This never changes decisions. Near connections are diagnostic measurements only.
Outputs original-resolution PNG stages, complete JSON and an offline HTML viewer.
"""
import base64
from collections import Counter, defaultdict
import hashlib
import heapq
import json
import math
from pathlib import Path
import sys
import cv2
import numpy as np
from api.contour import MAX_SIDE, extract_foreground_contour, split_image, build_diagnostics
from contour_geometry import analyze_structure, OBSERVED_THRESHOLD


def diagnose(image):
    if max(image.shape[:2]) > MAX_SIDE:
        s = MAX_SIDE / max(image.shape[:2])
        image = cv2.resize(image, (int(image.shape[1]*s), int(image.shape[0]*s)), interpolation=cv2.INTER_AREA)
    contour, mask, method = extract_foreground_contour(image)
    bgr, _ = split_image(image)
    audit = {}
    result = analyze_structure(bgr, mask, audit=audit)
    frame_id = hashlib.sha256(image.tobytes()).hexdigest()[:12]
    raw_count, raw_labels = cv2.connectedComponents(result['raw'], connectivity=8)
    count, candidate_labels = cv2.connectedComponents(result['candidates'], connectivity=8)
    threshold_length = max(2., audit['geometry']['diagonal']*.004)
    lookup = {r['id']: r for r in audit['records']}
    segments = []
    endpoint_map = defaultdict(list)
    pixels_by_segment = defaultdict(list)
    for i, path in enumerate(audit['chains']):
        canonical = min(path.astype('<i4').tobytes(), path[::-1].astype('<i4').tobytes())
        stable = frame_id + '-' + hashlib.sha256(canonical).hexdigest()[:12]
        x,y = path.T
        r = dict(lookup[i])
        why = []
        if r['length'] < threshold_length:
            why.append('length_below_minimum')
        if r['score'] < OBSERVED_THRESHOLD:
            why.append('score_below_threshold')
        r['individual_rejections'] = why.copy()
        if r.get('path_rescued'): why = []
        stride = audit['sampling_stride']
        r.update(stable_id=stable, source_component=int(raw_labels[y[0],x[0]]),
                 candidate_component=int(candidate_labels[y[0],x[0]]),
                 bbox=[int(x.min()),int(y.min()),int(x.max()),int(y.max())],
                 gradient_mean=float(audit['gradient'][y,x].mean()),
                 gradient_median=float(np.median(audit['gradient'][y,x])),
                 edge_median=float(np.median(audit['evidence'][y,x])),
                 component_pixels=int(audit['stats'][audit['labels'][y[0],x[0]],cv2.CC_STAT_AREA]),
                 endpoint_degrees=[len(audit['graph'][tuple(p[::-1])]) for p in (path[0],path[-1])],
                 sampling_stride=stride, sampled_points=len(path[::stride]),
                 curvature=-math.log(r['continuity']) if len(path[::stride])>2 else None,
                 continuity_is_default=len(path[::stride])<=2,
                 symmetry_contribution=.05*r['symmetry'],
                 threshold=OBSERVED_THRESHOLD, min_length=threshold_length,
                 exact_rejections=why,
                 observed_fraction=float(np.mean(audit['observed'][y,x]>0)),
                 structural_fraction=float(np.mean(audit['final'][y,x]>0)),
                 final_fraction=float(np.mean(audit['final'][y,x]>0)),
                 path=path.tolist())
        # Exact weighted score terms: changing none of their source values.
        r['score_terms'] = {'length':.24*min(1.,r['length']/max(1.,audit['geometry']['diagonal']*.09)),
            'persistence':.2*r['persistence'],'strength':.18*r['edge_confidence'],
            'continuity':.16*r['continuity'],'component':.13*r['connected'],
            'junction':.04*min(1,r['junctions']),'symmetry':.05*r['symmetry']}
        for end in (0,-1):
            endpoint_map[tuple(path[end])].append(i)
        for point in path:
            pixels_by_segment[tuple(point)].append(i)
        segments.append(r)

    # Diagnostic graph of segments sharing a raster vertex. It does not feed
    # back into analyze_structure or bridge_gaps.
    touching = [set() for _ in segments]
    for ids in endpoint_map.values():
        for i in ids:
            touching[i].update(j for j in ids if j != i)
    groups = defaultdict(list)
    for r in segments:
        groups[r['candidate_component']].append(r['id'])
    clusters = []
    for cid, ids in groups.items():
        nodes = {}
        for i in ids:
            path = audit['chains'][i]
            a,b = tuple(path[0]),tuple(path[-1])
            nodes.setdefault(a,[]).append((b,segments[i]['length']))
            nodes.setdefault(b,[]).append((a,segments[i]['length']))
        def farthest(start):
            distances={start:0.}; heap=[(0.,start)]
            while heap:
                d,p=heapq.heappop(heap)
                if d != distances[p]: continue
                for q,w in nodes[p]:
                    nd=d+w
                    if nd<distances.get(q,float('inf')):
                        distances[q]=nd;heapq.heappush(heap,(nd,q))
            return max(distances,key=distances.get),max(distances.values())
        a,_=farthest(next(iter(nodes))); _,diam=farthest(a)
        cluster={'id':cid,'segments':ids,'fragments':len(ids),
                 'total_length':sum(segments[i]['length'] for i in ids),
                 'accepted_length':sum(segments[i]['length'] for i in ids if segments[i]['accepted']),
                 'junctions':sum(len(v)>2 for v in nodes.values()),
                 'geodesic_diameter_lower_bound':diam}
        clusters.append(cluster)
    # Near-endpoint measurements: no speculative union or new filtering.
    radius=max(2.,audit['geometry']['diagonal']*.004)
    endpoints=[];buckets=defaultdict(list);near=[]
    for i,path in enumerate(audit['chains']):
        for p in (path,path[::-1]):
            tangent=(p[0]-p[min(len(p)-1,max(2,round(radius)))]).astype(float)
            tangent/=max(1e-6,np.linalg.norm(tangent))
            idx=len(endpoints); endpoints.append((i,p[0],tangent))
            buckets[tuple((p[0]//radius).astype(int))].append(idx)
    for e,(i,a,ta) in enumerate(endpoints):
        k=tuple((a//radius).astype(int))
        for dx in (-1,0,1):
            for dy in (-1,0,1):
                for f in buckets.get((k[0]+dx,k[1]+dy),[]):
                    j,b,tb=endpoints[f]
                    if f<=e or i==j:continue
                    gap=float(np.linalg.norm(b-a))
                    if not 0<gap<=radius:continue
                    near.append({'a':i,'b':j,'gap':gap,'orientation_dot':float(ta@-tb),
                                 'gap_alignment':min(float(ta@((b-a)/gap)),float(tb@((a-b)/gap)))})
    for i,r in enumerate(segments):
        r['touching_ids']=sorted(touching[i])
        r['structural_connectivity']=len(touching[i])
    reason_counts=Counter('+'.join(r['exact_rejections']) or 'accepted' for r in segments)
    coverage=np.zeros_like(mask)
    for p in audit['chains']:coverage[p[:,1],p[:,0]]=255
    stages={k:result[k] for k in ('raw','candidates','individual','path_rescued','observed','rejected','reconstructed','final')}
    stages['original']=bgr
    # Full-resolution pre-encoding compositor audit, including outer outline.
    composed=np.full_like(bgr,255);composed[result['final']>0]=20
    cv2.drawContours(composed,[contour],-1,(20,20,20),1,cv2.LINE_AA)
    diagnostics=build_diagnostics(bgr,mask,contour,result)
    stages['composed']=composed
    stages['production_preview']=cv2.imdecode(np.frombuffer(base64.b64decode(diagnostics['combined'].split(',')[1]),np.uint8),cv2.IMREAD_COLOR)
    summary={'frame_id':frame_id,'processed_size':[mask.shape[1],mask.shape[0]],'method':method,
             'min_length':threshold_length,'score_threshold':OBSERVED_THRESHOLD,
             'pixels':{k:int(np.count_nonzero(result[k])) for k in ('raw','candidates','observed','rejected','reconstructed','final')},
             'raw_components':raw_count-1,'candidate_components':count-1,
             'untraced_candidate_pixels':int(np.count_nonzero((result['candidates']>0)&(coverage==0))),
             'reasons':dict(reason_counts),'segment_count':len(segments),
             'accepted_missing_final':int(np.count_nonzero((result['observed']>0)&(result['final']==0))),
             'final_missing_composed':int(np.count_nonzero((result['final']>0)&(composed[:,:,0]>20))),
             'near_radius':radius,'preview_size':[stages['production_preview'].shape[1],stages['production_preview'].shape[0]]}
    return {'summary':summary,'segments':segments,'clusters':clusters,'near':near,'paths':audit['paths']},stages


def main():
    source,prefix=Path(sys.argv[1]),Path(sys.argv[2])
    data,stages=diagnose(cv2.imread(str(source),cv2.IMREAD_UNCHANGED))
    data['source']=source.name
    images={}
    for key,im in stages.items():
        display=255-im if im.ndim==2 else im
        cv2.imwrite(str(prefix)+'-'+key+'.png',display)
        images[key]='data:image/png;base64,'+base64.b64encode(cv2.imencode('.png',display)[1]).decode()
    Path(str(prefix)+'.json').write_text(json.dumps(data),encoding='utf8')
    template=Path(__file__).with_name('segment_inspector.html').read_text()
    payload=json.dumps({'data':data,'images':images}).replace('</','<\\/')
    Path(str(prefix)+'.html').write_text(template.replace('/*AUDIT_DATA*/',payload),encoding='utf8')
    print(json.dumps(data['summary'],indent=2))


if __name__=='__main__':main()
