"""Regenerate vector-only regression data from the existing real sources.
No source images, base64 data, paths or credentials are copied into fixtures.
"""
import json
import sys
from pathlib import Path
import cv2
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.contour import compute_contour

root = Path(__file__).resolve().parents[2]
sources = [('bat', root/'bat_source.webp'), ('butterfly', root/'test_butterfly.webp')]
if len(sys.argv) > 1:
    sources.append(('reference', Path(sys.argv[1])))
cases = {}
for name, path in sources:
    result = compute_contour(cv2.imread(str(path), cv2.IMREAD_UNCHANGED))
    copy_points = lambda points: [[float(v) for v in p] for p in points]
    cases[name] = {'contour': copy_points(result['contour']),
                   'internal_lines': [copy_points(p) for p in result['internal_lines']]}
    print(name, len(result['internal_lines']))
cases['asymmetric'] = {'contour': [[30,140],[90,45],[230,70],[340,160],[295,240],[145,345],[55,245],[30,140]],
 'internal_lines': [[[55,245],[120,190]],[[121,189],[210,120]],[[145,345],[155,265],[185,205]],[[190,200],[270,175]],[[95,120],[99,124]],[[104,126],[108,130]],[[109,129],[112,135]]]}
target = Path(__file__).parent/'fixtures'/'optimized-cases.json'
target.write_text(json.dumps(cases, separators=(',', ':')))
