"""Local visual regression; writes generated previews only to the supplied dir."""
import sys
import time
from pathlib import Path
import cv2
import numpy as np
from api.contour import compute_contour
import base64

dest = Path(sys.argv[1])
for name in ("bat_source.webp", "test_butterfly.webp"):
    source = Path("..") / name
    start = time.perf_counter()
    result = compute_contour(cv2.imread(str(source), cv2.IMREAD_UNCHANGED))
    tiles = []
    for key in ("original", "raw_edges", "candidates", "rejected", "observed", "reconstructed", "outer", "combined"):
        raw = base64.b64decode(result["diagnostics"][key].split(",")[1])
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        h,w = image.shape[:2]; scale = min(360/w,240/h)
        image = cv2.resize(image,(round(w*scale),round(h*scale)))
        tile = np.full((270,360,3),245,np.uint8)
        tile[30:30+image.shape[0],:image.shape[1]] = image
        cv2.putText(tile,key,(8,20),cv2.FONT_HERSHEY_SIMPLEX,.5,(40,40,40),1)
        tiles.append(tile)
    cv2.imwrite(str(dest / (source.stem + ".jpg")), np.vstack([np.hstack(tiles[:4]),np.hstack(tiles[4:])]))
    meta=result["debug"]
    print(name,round(time.perf_counter()-start,2),"seconds",meta["segment_count"],"segments",meta["bridge_count"],"bridges")
