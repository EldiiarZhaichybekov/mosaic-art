"""Full request/decoder/segmentation/geometry contract, not just decoder mocks."""
import base64
import unittest
import cv2
import numpy as np
from api import contour


class UploadMatrixTests(unittest.TestCase):
    def test_supported_inputs_and_recovery(self):
        client = contour.app.test_client()
        cases = [
            ('jpeg', '.jpg', 'image/jpeg', 180, 260, 245, 25, None),
            ('rgb_light', '.png', 'image/png', 240, 160, 245, 25, None),
            ('rgb_dark', '.png', 'image/png', 160, 240, 15, 220, None),
            ('low_contrast', '.png', 'image/png', 200, 240, 200, 180, None),
            ('opaque_rgba', '.png', 'image/png', 240, 200, 245, 25, 255),
            ('transparent', '.png', 'image/png', 240, 200, 245, 25, 0),
            ('partial_alpha', '.png', 'image/png', 240, 200, 245, 25, 100),
            ('large_resolution', '.png', 'image/png', 1800, 2400, 245, 25, None),
        ]
        for name, ext, mime, height, width, bg, fg, alpha in cases:
            with self.subTest(name=name):
                image = np.full((height, width, 3 if alpha is None else 4), bg, np.uint8)
                if alpha is not None:
                    image[:, :, 3] = alpha
                color = (fg, fg, fg) if alpha is None else (fg, fg, fg, 255)
                cv2.ellipse(image, (width//2, height//2), (width//3, height//3), 0, 0, 360, color, -1)
                raw = cv2.imencode(ext, image)[1].tobytes()
                payload = {'image': 'data:'+mime+';base64,'+base64.b64encode(raw).decode()}
                with self.assertLogs(contour.logger, level='INFO') as logs:
                    response = client.post('/api/contour', json=payload, headers={'X-Request-ID': 'matrix-'+name})
                self.assertEqual(response.status_code, 200, response.json)
                self.assertGreater(len(response.json['contour']), 3)
                self.assertEqual(response.json['request_id'], 'matrix-'+name)
                self.assertIn('alpha_present', str(logs.output))
                self.assertNotIn(payload['image'], str(logs.output))
        response = client.post('/api/contour', json={'image': 'data:image/png;base64,AAAA'})
        self.assertEqual(response.json['error']['code'], 'INVALID_IMAGE')
        self.assertEqual(client.post('/api/contour', json=payload).status_code, 200)


if __name__ == '__main__':
    unittest.main()
