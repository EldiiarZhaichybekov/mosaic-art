"""Render analyst-selected segments; IDs belong to the recorded local audits."""
import json
import cv2
import numpy as np

examples=[('bat',179),('bat',1803),('bat',4605),('bat',4392),
          ('butterfly',344),('butterfly',1089),('butterfly',19),('butterfly',1248)]
tiles=[]
for name,segment in examples:
    data=json.load(open('/private/tmp/'+name+'-audit.json'))
    r=data['segments'][segment]
    image=cv2.imread('/private/tmp/'+name+'-audit-original.png')
    x0,y0,x1,y1=r['bbox'];pad=35
    x0=max(0,x0-pad);y0=max(0,y0-pad);x1=min(image.shape[1],x1+pad);y1=min(image.shape[0],y1+pad)
    path=np.array(r['path'],np.int32)
    overlay=image.copy();cv2.polylines(overlay,[path],False,(0,0,255),2)
    crops=[]
    for im in (image,overlay):
        crop=im[y0:y1,x0:x1];s=min(210/crop.shape[1],180/crop.shape[0]);crop=cv2.resize(crop,(round(crop.shape[1]*s),round(crop.shape[0]*s)))
        tile=np.full((210,220,3),245,np.uint8);tile[30:30+crop.shape[0],:crop.shape[1]]=crop;crops.append(tile)
    tile=np.hstack(crops);cv2.putText(tile,f'{name} #{segment} score={r["score"]:.3f}',(8,20),cv2.FONT_HERSHEY_SIMPLEX,.5,(20,20,20),1);tiles.append(tile)
cv2.imwrite('/private/tmp/audit-examples.jpg',np.vstack([np.hstack(tiles[i:i+2]) for i in range(0,8,2)]))
