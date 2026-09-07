import base64
import unittest
from unittest.mock import patch
import cv2
import numpy as np
from api import contour
from contour_geometry import analyze_structure, bridge_gaps, geometry


class GeometryTests(unittest.TestCase):
    def test_bridge_requires_evidence_and_inside_mask(self):
        mask = np.full((256, 256), 255, np.uint8)
        observed = np.zeros_like(mask)
        observed[128, 70:126] = 255
        observed[128, 130:185] = 255
        geo = geometry(mask)
        blank = np.zeros(mask.shape, np.float32)
        _, result, _ = bridge_gaps(observed, blank, mask > 0, geo)
        self.assertFalse(result.any())
        evidence = blank.copy(); evidence[128, 126:130] = .5
        _, result, records = bridge_gaps(observed, evidence, mask > 0, geo)
        self.assertTrue(result[128, 127])
        self.assertTrue(any(r["accepted"] for r in records))
        valid = mask > 0; valid[128, 127] = False
        self.assertFalse(bridge_gaps(observed, evidence, valid, geo)[1].any())
        self.assertFalse(bridge_gaps(observed, evidence, mask > 0, geo, threshold=1.1)[1].any())

    def test_symmetry_never_invents_missing_lines(self):
        mask = np.zeros((256, 256), np.uint8)
        cv2.ellipse(mask, (128, 128), (100, 80), 0, 0, 360, 255, -1)
        bgr = np.full((256, 256, 3), 220, np.uint8)
        cv2.line(bgr, (70, 90), (100, 160), (170, 170, 170), 2)
        result = analyze_structure(bgr, mask)
        self.assertTrue(result["observed"].any())
        self.assertFalse(result["final"][:, 130:].any())

    def test_weak_line_survives_at_multiple_resolutions(self):
        for side in (256, 512):
            mask = np.zeros((side, side), np.uint8)
            cv2.rectangle(mask, (side//8, side//8), (7*side//8, 7*side//8), 255, -1)
            bgr = np.full((side, side, 3), 210, np.uint8)
            cv2.line(bgr, (side//4, side//2), (3*side//4, side//2), (190,190,190), max(1, side//256))
            result = analyze_structure(bgr, mask)
            self.assertGreater(np.count_nonzero(result["observed"]), side * .25)
            self.assertFalse(np.any(result["final"][mask == 0]))


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = contour.app.test_client()
        image = np.zeros((128,128,4), np.uint8)
        image[20:110,20:110] = [180,180,180,255]
        raw = cv2.imencode(".png", image)[1].tobytes()
        self.payload = {"image": "data:image/png;base64," + base64.b64encode(raw).decode(), "debug": True}

    def test_success_retry_and_errors(self):
        for payload, expected, code in [({},400,"INVALID_IMAGE"), ({"image":42},400,"INVALID_IMAGE"),
            ({"image":"data:image/png;base64,%%%"},400,"INVALID_IMAGE"),
            ({**self.payload,"canvas":[float("nan"),400]},400,"INVALID_REQUEST"),
            ({"image":"data:image/gif;base64,AAAA"},415,"UNSUPPORTED_FORMAT")]:
            response = self.client.post("/api/contour", json=payload)
            self.assertEqual(response.status_code, expected)
            self.assertEqual(response.json["error"]["code"], code)
        response = self.client.post("/api/contour", json=self.payload, headers={"X-Request-ID":"test-success"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Request-ID"], "test-success")
        self.assertIn("reconstructed", response.json["diagnostics"])
        self.assertLess(len(response.data), 4_250_000)

    def test_large_body_and_processing_failure(self):
        response = self.client.post("/api/contour", data=b" " * 4_250_001, content_type="application/json")
        self.assertEqual(response.status_code, 413)
        with patch.object(contour, "internal_structural_edges", side_effect=RuntimeError("test failure")):
            with self.assertLogs(contour.logger, level="ERROR") as logs:
                response = self.client.post("/api/contour", json=self.payload)
            self.assertIn("structural_edges", str(logs.output))
            self.assertNotIn("test failure", response.get_data(as_text=True))
            self.assertEqual(response.status_code, 500)

    def test_dimensions_checked_before_full_decode(self):
        with patch.object(contour.Image, "open") as header, patch.object(cv2, "imdecode") as decoder:
            header.return_value.__enter__.return_value.size = (10000, 10000)
            response = self.client.post("/api/contour", json=self.payload)
            self.assertEqual(response.status_code, 413)
            decoder.assert_not_called()


if __name__ == "__main__":
    unittest.main()
