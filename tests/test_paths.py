import unittest
from pathlib import Path
import cv2
import numpy as np
from contour_geometry import edge_graph, rescue_paths, bridge_gaps, geometry
from api.contour import compute_contour


class PathTests(unittest.TestCase):
    def test_fragmented_path_rescued_but_attached_spurs_not(self):
        edges=np.zeros((256,256),np.uint8)
        edges[128,30:220]=255
        for x in range(40,211,10): edges[126:128,x]=255
        edges[50,50:53]=255
        chains,_=edge_graph(edges)
        records=[dict(id=i,individually_accepted=False,accepted=False,path_rescued=False,edge_confidence=.8) for i in range(len(chains))]
        rescued,paths=rescue_paths(chains,records,edges.shape,300,np.full(edges.shape,.8),np.ones(edges.shape))
        self.assertGreater(np.count_nonzero(rescued[128]),180)
        self.assertFalse(rescued[126].any())
        self.assertFalse(rescued[50].any())
        self.assertTrue(any(p['accepted'] and len(p['segment_ids'])>5 for p in paths))

    def test_bridge_rejects_large_gap_and_wrong_direction(self):
        mask=np.full((256,256),255,np.uint8);obs=np.zeros_like(mask)
        obs[128,20:80]=255;obs[128,100:150]=255
        self.assertFalse(bridge_gaps(obs,np.ones(mask.shape),mask>0,geometry(mask))[1].any())
        obs[:]=0;obs[128,20:80]=255;obs[130:180,82]=255
        self.assertFalse(bridge_gaps(obs,np.ones(mask.shape),mask>0,geometry(mask))[1].any())

    def test_known_regression_paths_and_vector_composition(self):
        source=Path('../bat_source.webp')
        if not source.exists():self.skipTest('optional local photo absent')
        result=compute_contour(cv2.imread(str(source),-1))
        records={r['id']:r for r in result['debug']['segments']}
        for sid in (4441,4605):
            self.assertFalse(records[sid]['individually_accepted'])
            self.assertTrue(records[sid]['path_rescued'])
        self.assertTrue(any(not r['accepted'] for r in records.values()))
        self.assertGreater(len(result['internal_lines']),0)
        self.assertGreater(len(result['contour']),100)
        for line in result['internal_lines']:
            self.assertGreaterEqual(len(line),2)
            self.assertTrue(np.isfinite(line).all())
