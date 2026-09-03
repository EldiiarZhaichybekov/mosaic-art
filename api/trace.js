/*
 * Serverless proxy: image → AI → outer-contour polygon.
 *
 * The browser never talks to the AI provider directly (google domains are
 * blocked in mainland China, and providers may not serve generative APIs from
 * some regions); instead the client POSTs a downscaled JPEG data URL to this
 * function, which calls the selected provider's vision model and returns a
 * clean JSON polygon of the main object's silhouette.
 *
 * Provider is chosen by `body.provider`: "gemini" (default) or "deepseek".
 *
 * Gemini:
 *   key   = process.env.GEMINI_API_KEY  (model: GEMINI_MODEL, default gemini-3.6-flash)
 *   call  = https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *
 * DeepSeek (OpenAI-compatible):
 *   key   = process.env.DEEPSEEK_API_KEY  (model: DEEPSEEK_MODEL, default deepseek-v4-flash-vision-exp)
 *   call  = https://api.deepseek.com/chat/completions
 *
 * Keys live only in Vercel → Settings → Environment Variables; never commit a
 * key here — the repository is public and GitHub secret scanning blocks pushes
 * that contain one. Without a key the function returns a clear 500 and the
 * client falls back to the geometric tracer.
 *
 * CommonJS (module.exports) — the most compatible format for Vercel api/*.js.
 */

function json(res, status, obj) {
  res.status(status).json(obj);
}

/* fetchJSON with a hard timeout: a slow provider must fail fast and let the
 * client fall back to the geometric tracer instead of hanging the function. */
async function fetchJSON(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* Turn whatever the model returned into a clean list of [x, y] pairs in image
 * pixel coordinates. Throws on anything unusable. */
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

/* Parse a JSON polygon out of the model's text reply; robust to ```json fences
 * and to surrounding prose. */
function parseContourText(text) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { /* fall through to text-slice */ }
  if (parsed === null && typeof text === "string") {
    try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch (e) {}
  }
  if (parsed === null) throw new Error("model reply is not valid JSON");
  return sanitizeContour(parsed);
}

const PROMPT =
  "You are a precise silhouette tracer. Identify the SINGLE MAIN object in this image " +
  "(the prominent subject; ignore the background and any secondary objects) and return " +
  "ONLY its outer silhouette as one closed polygon.\n\n" +
  "Trace the outer boundary PRECISELY and IN DETAIL: include every protrusion, concavity, " +
  "thin and elongated part of the subject — such as wings, wing membranes and fingers, head, " +
  "ears, tail, limbs and feet. Do NOT simplify, smooth away, or drop narrow features; keep " +
  "the real outline, not an abstracted blob.\n\n" +
  "The polygon is ONE closed loop with no holes and no inner contours — only the outermost " +
  "edge. Exclude the background, shadows and reflections; do not merge the subject with the " +
  "sky, ground, or any other object.\n\n" +
  "Use 60 to 170 points, spread evenly around the boundary and denser where the contour is " +
  "curvy or has thin/spiky features. Coordinates are image pixel coordinates: x = column " +
  "(0..width), y = row (0..height), origin top-left, in the same space as the supplied " +
  "image.\n\n" +
  "Return JSON: {\"points\": [[x, y], ...]}.";

/* Gemini: structured-output generateContent. */
async function callGemini(key, model, mimeType, base64) {
  const gResp = await fetchJSON(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: PROMPT },
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
    },
    45000
  );

  const gData = await gResp.json();
  if (!gResp.ok) {
    const msg = (gData && gData.error && gData.error.message) || ("Gemini HTTP " + gResp.status);
    throw new Error(msg);
  }
  const text = gData && gData.candidates && gData.candidates[0] &&
               gData.candidates[0].content && gData.candidates[0].content.parts &&
               gData.candidates[0].content.parts[0] && gData.candidates[0].content.parts[0].text;
  if (!text) throw new Error("empty Gemini response");
  return { points: parseContourText(text), provider: "gemini", model };
}

/* DeepSeek: OpenAI-compatible chat completions with a vision model. */
async function callDeepSeek(key, model, mimeType, base64) {
  const dResp = await fetchJSON("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + base64 } },
        ],
      }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  }, 45000);

  const dData = await dResp.json();
  if (!dResp.ok) {
    const msg = (dData && dData.error && dData.error.message) || ("DeepSeek HTTP " + dResp.status);
    throw new Error(msg);
  }
  const text = dData && dData.choices && dData.choices[0] &&
               dData.choices[0].message && dData.choices[0].message.content;
  if (!text) throw new Error("empty DeepSeek response");
  return { points: parseContourText(text), provider: "deepseek", model };
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

  const provider = (body.provider === "deepseek") ? "deepseek" : "gemini";

  if (provider === "deepseek") {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return json(res, 500, { error: "DEEPSEEK_API_KEY not configured" });
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash-vision-exp";
    try {
      return json(res, 200, await callDeepSeek(key, model, mimeType, base64));
    } catch (err) {
      return json(res, 502, { error: err.message || String(err) });
    }
  }

  // --- Gemini (default) ---
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(res, 500, { error: "GEMINI_API_KEY not configured" });
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  try {
    return json(res, 200, await callGemini(key, model, mimeType, base64));
  } catch (err) {
    return json(res, 502, { error: err.message || String(err) });
  }
};
