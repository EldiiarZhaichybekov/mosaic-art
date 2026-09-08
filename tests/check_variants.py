"""Local fixture measurement and before/after previews (outputs outside repo)."""
from pathlib import Path
import sys
import cv2
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from api.contour import compute_contour

root=Path(__file__).resolve().parents[2]
for name in ['bat_source.webp','test_butterfly.webp','_diag/synth_busy.png','_diag/synth_thin.png','_diag/synth_dark_on_light.png','_diag/synth_light_on_dark.png']:
    source=root/name
    if not source.exists():continue
    result=compute_contour(cv2.imread(str(source),cv2.IMREAD_UNCHANGED))
    assert result['refined']['status']=='ok'
    indices=result['refined']['indices']
    assert all(0<=i<len(result['internal_lines']) for i in indices)
    print(name,len(result['internal_lines']),len(indices),result['refined']['summary'])
    views=[]
    for lines in (result['internal_lines'],[result['internal_lines'][i] for i in indices]):
        view=np.full((600,600,3),255,np.uint8)
        cv2.polylines(view,[np.rint(np.array(result['contour'])*1.5).astype(np.int32)],True,(0,0,0),1,cv2.LINE_AA)
        for line in lines:cv2.polylines(view,[np.rint(np.array(line)*1.5).astype(np.int32)],False,(0,0,0),1,cv2.LINE_AA)
        views.append(view)
    cv2.imwrite('/private/tmp/dual-'+source.stem+'.png',np.hstack(views))
