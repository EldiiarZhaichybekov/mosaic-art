"""Analyst-picked raw structure, shortest-path measurement only; no filtering."""
import json
import heapq
import math
import cv2
import numpy as np
from contour_geometry import edge_graph

d=json.load(open('/private/tmp/bat-audit.json'))
candidates=255-cv2.imread('/private/tmp/bat-audit-candidates.png',0)
_,graph=edge_graph(candidates)
# Two visually selected points on the same descending internal wing boundary.
anchors=[(731,217),(718,277)]
nodes=[]
for x,y in anchors:nodes.append(min(graph,key=lambda p:(p[1]-x)**2+(p[0]-y)**2))
start,end=nodes;dist={start:0};parent={};heap=[(0,start)]
while heap:
    value,p=heapq.heappop(heap)
    if value!=dist[p]:continue
    if p==end:break
    for q in graph[p]:
        nd=value+math.dist(p,q)
        if nd<dist.get(q,float('inf')):dist[q]=nd;parent[q]=p;heapq.heappush(heap,(nd,q))
p=end;path=[p]
while p!=start:p=parent[p];path.append(p)
path=path[::-1];edges={tuple(sorted((a,b))) for a,b in zip(path,path[1:])};ids=[]
for r in d['segments']:
    points=[tuple(p[::-1]) for p in r['path']]
    if any(tuple(sorted((a,b))) in edges for a,b in zip(points,points[1:])):ids.append(r['id'])
observed=255-cv2.imread('/private/tmp/bat-audit-observed.png',0)
output={'anchors_xy':anchors,'path_length':dist[end],'path_pixels':len(path),
        'path_pixels_missing_observed':sum(observed[y,x]==0 for y,x in path),
        'segment_ids':ids,'rejected_ids':[i for i in ids if not d['segments'][i]['accepted']]}
output['path_pixels_missing_observed']=int(output['path_pixels_missing_observed'])
im=cv2.imread('/private/tmp/bat-audit-original.png');overlay=im.copy()
for i in ids:
    r=d['segments'][i];p=np.array(r['path'],np.int32)
    cv2.polylines(overlay,[p],False,(0,150,0) if r['accepted'] else (0,0,255),2)
crop=np.hstack([im[190:300,690:765],overlay[190:300,690:765]])
cv2.imwrite('/private/tmp/bat-audit-path.png',cv2.resize(crop,None,fx=4,fy=4,interpolation=cv2.INTER_NEAREST))
print(json.dumps(output,indent=2));open('/private/tmp/bat-audit-path.json','w').write(json.dumps(output))
