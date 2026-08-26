/*
 * Serverless proxy: image → Gemini → outer-contour polygon.
 *
 * The browser never talks to Google directly (google domains are blocked in
 * mainland China and Google does not serve generative APIs there); instead the
 * client POSTs a downscaled JPEG data URL to this function, which calls
 * Gemini's generateContent with a structured-output schema and returns a clean
 * JSON polygon of the main object's silhouette.
 *
 * API key: process.env.GEMINI_API_KEY (Vercel dashboard → Settings → Environment
 * Variables → GEMINI_API_KEY → redeploy). The FALLBACK_KEY constant below is
 * only a stop-gap for the user's temporary key and MUST be removed once the env
 * var is set — the repository is public, so a key committed here is exposed.
 *
 * Model: process.env.GEMINI_MODEL (default gemini-2.0-flash, free tier).
 *
 * CommonJS (module.exports) — the most compatible format for Vercel api/*.js.
 */

const FALLBACK_KEY = ""; // temporary key goes here until env var is configured

function json(res, status, obj) {
  res.status(status).json(obj);
}

/*
 * Accept whatever Gemini returned and reduce it to a clean list of [x, y]
 * pairs in image pixel coordinates. Throws on anything unusable.
 */
function sanitizeContour(raw) {
  let arr = raw;
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.points)) arr = raw.points;
    else if (Array.isArray(raw.contour)) arr = raw.contour;
    else if (Array.isArray(raw.polygon)) arr = raw.polygon;
  }
  if (!Array.isArray(arr)) throw new Error("no polygon in response");
  const pts = [];
  for (const p of arr) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]), y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pts.push([x, y]);
  }
  if (pts.length < 8) throw new Error("polygon too small: " + pts.length + " points");
  // cap the density so downstream DP simplification stays fast
  if (pts.length > 300) {
    const step = pts.length / 300;
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[Math.floor(i)]);
    return out;
  }
  return pts;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });

  const body = req.body || {};
  const image = body.image; // "data:image/jpeg;base64,..." (client downscales first)
  if (!image || typeof image !== "string") return json(res, 400, { error: "image (data URL) required" });
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(image);
  if (!m) return json(res, 400, { error: "image must be a base64 data URL" });
  const mimeType = m[1] || "image/jpeg";
  const base64 = m[2];

  const key = process.env.GEMINI_API_KEY || FALLBACK_KEY;
  if (!key) return json(res, 500, { error: "GEMINI_API_KEY not configured" });

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const prompt =
    "Find the MAIN object in this image (the prominent subject). Return its outer " +
    "silhouette boundary as ONE closed polygon. Ignore the background, shadows, " +
    "reflections and small internal details. Use 16 to 120 points, in image pixel " +
    "coordinates (x = column, y = row, origin top-left). Do not include holes or " +
    "inner contours — only the outer edge. Return JSON: {\"points\": [[x, y], ...]}.";

  try {
    const gResp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                points: {
                  type: "ARRAY",
                  items: { type: "ARRAY", items: { type: "NUMBER" } },
                },
              },
              required: ["points"],
            },
          },
        }),
      }
    );

    const gData = await gResp.json();
    if (!gResp.ok) {
      const msg = (gData && gData.error && gData.error.message) || ("Gemini HTTP " + gResp.status);
      return json(res, 502, { error: msg });
    }
    const text = gData && gData.candidates && gData.candidates[0] &&
                 gData.candidates[0].content && gData.candidates[0].content.parts &&
                 gData.candidates[0].content.parts[0] && gData.candidates[0].content.parts[0].text;
    if (!text) return json(res, 502, { error: "empty Gemini response" });

    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { /* fall through to text-slice */ }
    if (parsed === null && typeof text === "string") {
      try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch (e) {}
    }

    const points = sanitizeContour(parsed);
    return json(res, 200, { points, model });
  } catch (err) {
    return json(res, 502, { error: err.message || String(err) });
  }
};
