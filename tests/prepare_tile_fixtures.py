"""Generate ephemeral physical-layout inputs from existing real images."""
import json
import sys
from pathlib import Path
import cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from api.contour import compute_contour
for name in ['bat_source','test_butterfly']:
    source=Path(__file__).resolve().parents[2]/(name+'.webp')
    if source.exists():
        result=compute_contour(cv2.imread(str(source),cv2.IMREAD_UNCHANGED))
        Path('/private/tmp/tiles-'+name+'.json').write_text(json.dumps(result))
