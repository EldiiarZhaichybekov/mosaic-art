import unittest
import cv2
import numpy as np
from contour_geometry import analyze_structure


class InstrumentationTests(unittest.TestCase):
    def test_audit_does_not_change_decisions_or_pixels(self):
        mask=np.zeros((256,256),np.uint8);mask[20:230,20:230]=255
        image=np.full((256,256,3),210,np.uint8)
        cv2.line(image,(60,60),(190,180),(150,150,150),2)
        cv2.line(image,(60,180),(190,60),(180,180,180),2)
        normal=analyze_structure(image,mask)
        audit={};instrumented=analyze_structure(image,mask,audit=audit)
        for key in normal:
            if key!='metadata':np.testing.assert_array_equal(normal[key],instrumented[key])
        for key in ('segments','bridges','observed_threshold','reconstruction_threshold'):
            self.assertEqual(normal['metadata'][key],instrumented['metadata'][key])
        self.assertEqual(len(audit['records']),normal['metadata']['segment_count'])
        self.assertFalse(np.any((audit['observed']>0)&(audit['final']==0)))
