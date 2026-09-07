"""Smoke test using a generated geometric image; no private photograph upload."""
import base64
import json
import sys
import urllib.request
import cv2
import numpy as np

image=np.zeros((256,256,4),np.uint8)
cv2.circle(image,(128,128),100,(210,210,210,255),-1)
cv2.line(image,(70,100),(180,170),(70,70,70,255),2)
encoded=cv2.imencode('.png',image)[1].tobytes()
payload=json.dumps({'image':'data:image/png;base64,'+base64.b64encode(encoded).decode(),'canvas':[400,400]}).encode()
url=sys.argv[1].rstrip('/')+'/api/contour'
request=urllib.request.Request(url,data=payload,headers={'Content-Type':'application/json','X-Request-ID':'synthetic-lineart-smoke'})
with urllib.request.urlopen(request,timeout=25) as response:
    body=json.load(response)
    assert response.status==200
    assert len(body['contour'])>100 and len(body['internal_lines'])>0
    assert 'debug' not in body and 'diagnostics' not in body
    print('PASS',url,'external points',len(body['contour']),'internal paths',len(body['internal_lines']),'request ID',response.headers.get('X-Request-ID'))
