"""Minimal Pillow-compatible image-header reader for the contour function.

The contour pipeline decodes pixels with OpenCV. It only needs Pillow's
``Image.open`` API to reject oversized PNG/JPEG/WebP inputs before decoding.
Keeping that tiny interface locally avoids bundling the full Pillow binary
distribution in the serverless function.
"""


class UnidentifiedImageError(OSError):
    pass


class DecompressionBombError(Exception):
    pass


def _dimensions(raw):
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        if len(raw) < 24 or raw[12:16] != b"IHDR":
            raise UnidentifiedImageError("Invalid PNG header")
        return "PNG", int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")

    if raw.startswith(b"\xff\xd8"):
        sof_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                       0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
        offset = 2
        while offset < len(raw):
            while offset < len(raw) and raw[offset] != 0xFF:
                offset += 1
            while offset < len(raw) and raw[offset] == 0xFF:
                offset += 1
            if offset >= len(raw):
                break
            marker = raw[offset]
            offset += 1
            if marker in (0xD8, 0xD9):
                continue
            if marker == 0xDA or offset + 2 > len(raw):
                break
            length = int.from_bytes(raw[offset:offset + 2], "big")
            if length < 2 or offset + length > len(raw):
                break
            if marker in sof_markers and length >= 7:
                height = int.from_bytes(raw[offset + 3:offset + 5], "big")
                width = int.from_bytes(raw[offset + 5:offset + 7], "big")
                return "JPEG", width, height
            offset += length
        raise UnidentifiedImageError("Invalid JPEG header")

    if len(raw) >= 20 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        kind = raw[12:16]
        if kind == b"VP8X" and len(raw) >= 30:
            return ("WEBP", 1 + int.from_bytes(raw[24:27], "little"),
                    1 + int.from_bytes(raw[27:30], "little"))
        if kind == b"VP8L" and len(raw) >= 25 and raw[20] == 0x2F:
            bits = int.from_bytes(raw[21:25], "little")
            return "WEBP", 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
        if kind == b"VP8 " and len(raw) >= 30 and raw[23:26] == b"\x9d\x01\x2a":
            return ("WEBP", int.from_bytes(raw[26:28], "little") & 0x3FFF,
                    int.from_bytes(raw[28:30], "little") & 0x3FFF)
        raise UnidentifiedImageError("Invalid WebP header")

    raise UnidentifiedImageError("Unsupported image header")


class _Header:
    def __init__(self, raw):
        self.format, width, height = _dimensions(raw)
        self.size = (width, height)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class Image:
    DecompressionBombError = DecompressionBombError

    @staticmethod
    def open(stream):
        return _Header(stream.read())
