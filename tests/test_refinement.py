import base64
import unittest
from pathlib import Path
from unittest.mock import patch
import cv2
import numpy as np
from api import contour
from contour_refinement import refine_lines


class RefinedTests(unittest.TestCase):
    def test_available_butterfly(self):
        source=Path(__file__).resolve().parents[2]/'test_butterfly.webp'
        if not source.exists():self.skipTest('Local butterfly source unavailable')
        result=contour.compute_contour(cv2.imread(str(source),cv2.IMREAD_UNCHANGED))
        self.assertEqual(result['refined']['status'],'ok')
        self.assertGreater(len(result['refined']['indices']),0)
        self.assertLess(len(result['refined']['indices']),len(result['internal_lines']))

    def test_parallel_noise_crossing_and_subset(self):
        mask=np.full((256,256),255,np.uint8)
        chains=[np.array([[x,y] for x in range(30,220)]) for y in (100,101)]
        chains += [np.array([[125,y] for y in range(30,220)]),np.array([[x,180] for x in range(20,23)])]
        keep,meta=refine_lines(chains,mask,np.ones(mask.shape,np.float32))
        self.assertIn(0,keep)
        self.assertNotIn(1,keep)
        self.assertIn(2,keep)
        self.assertNotIn(3,keep)
        self.assertEqual(meta['suppression']['redundant'],1)

    def test_dense_detail_and_short_connected_paths(self):
        mask=np.full((256,256),255,np.uint8)
        chains=[np.array([[x,y] for x in range(70,100)]) for y in range(70,121,5)]
        keep,meta=refine_lines(chains,mask,np.ones(mask.shape,np.float32))
        self.assertGreater(meta['suppression']['local_density'],0)
        self.assertGreater(len(keep),0)
        self.assertLess(len(keep),len(chains))
        chains=[np.array([[x,128] for x in range(a,b+1)]) for a,b in [(20,100),(100,104),(104,220)]]
        keep,_=refine_lines(chains,mask,np.ones(mask.shape,np.float32))
        self.assertIn(1,keep)  # A short connector survives through path context.

    def test_formats_and_alpha(self):
        for extension, channels, depth in [('.png',3,np.uint8),('.png',4,np.uint8),('.jpg',3,np.uint8),('.png',4,np.uint16)]:
            with self.subTest(extension=extension,channels=channels,depth=depth):
                image=np.full((128,128,channels),255,np.uint8)
                image[24:105,24:105,:3]=20
                if channels==4:
                    image[:,:,3]=0;image[24:105,24:105,3]=255
                if depth==np.uint16:image=image.astype(np.uint16)*257
                raw=cv2.imencode(extension,image)[1].tobytes()
                response=contour.app.test_client().post('/api/contour',json={'image':'data:image/'+('jpeg' if extension=='.jpg' else 'png')+';base64,'+base64.b64encode(raw).decode()})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.json['refined']['status'],'ok')

    def test_uniform_alpha_opaque_low_contrast_and_inverted(self):
        for bg,fg,alpha in [(255,0,255),(0,255,255),(150,140,255),(255,0,128)]:
            image=np.full((128,128,4),bg,np.uint8);image[:,:,3]=alpha
            image[25:105,25:105,:3]=fg
            c,mask,method=contour.extract_foreground_contour(image)
            self.assertLess(np.mean(mask>0),.6)
            self.assertGreater(cv2.contourArea(c),5000)
            self.assertNotEqual(method,'alpha')

    def test_safe_fallback_and_real_errors(self):
        image=np.full((128,128,3),255,np.uint8);image[25:105,25:105]=0
        with patch.object(contour,'border_background_mask',return_value=np.zeros((128,128),np.uint8)):
            self.assertEqual(contour.extract_foreground_contour(image)[2],'luminance-fallback')
        for image in (np.zeros((128,128,4),np.uint8),np.full((128,128,3),255,np.uint8)):
            with self.assertRaises(contour.ContourError) as error:contour.extract_foreground_contour(image)
            self.assertEqual(error.exception.code,'NO_FOREGROUND')

    def test_refinement_failure_preserves_detailed(self):
        image=np.zeros((128,128,4),np.uint8);image[20:110,20:110]=[200,200,200,255]
        baseline=contour.compute_contour(image)
        with patch.object(contour,'refine_lines',side_effect=RuntimeError('injected refinement failure')):
            result=contour.compute_contour(image)
        self.assertEqual(result['contour'],baseline['contour'])
        self.assertEqual(result['internal_lines'],baseline['internal_lines'])
        self.assertEqual(result['refined']['status'],'unavailable')
