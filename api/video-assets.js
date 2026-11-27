module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "Sign in required." });
  try {
    const auth = await fetch("https://brpszcevzqwuiuvqcfri.supabase.co/auth/v1/user", {
      headers: {
        apikey: "sb_publishable_oj-G9SY6GeqioBpgRUryHw_YjktCaU9",
        Authorization: "Bearer " + token
      }
    });
    if (!auth.ok) return res.status(401).json({ error: "Session invalid. Please sign in again." });
    const user = await auth.json();
    if ((user.email || "").toLowerCase() !== "spraygod008@gmail.com") {
      return res.status(403).json({ error: "This JARVIS instance is private." });
    }
    const key = process.env.PIXABAY_API_KEY;
    if (!key) return res.status(503).json({ error: "PIXABAY_API_KEY is missing in Vercel Environment Variables." });
    const q = String(req.query.q || "").trim().slice(0, 100);
    const orientation = req.query.orientation === "vertical" ? "vertical" : "horizontal";
    if (!q) return res.status(400).json({ error: "Enter a scene keyword." });
    const url = "https://pixabay.com/api/videos/?key=" + encodeURIComponent(key) +
      "&q=" + encodeURIComponent(q) + "&video_type=film&per_page=12&safesearch=true";
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { return res.status(502).json({ error: "Pixabay returned an invalid response." }); }
    if (!response.ok) return res.status(response.status).json({ error: data.message || "Pixabay search failed." });
    const videos = (data.hits || []).map(v => {
      const files = v.videos || {};
      const candidates = [files.large, files.medium, files.small].filter(Boolean);
      const chosen = candidates.find(f => orientation === "vertical" ? f.height >= f.width : f.width >= f.height) || candidates[0];
      return {
        id: v.id,
        tags: v.tags || "",
        duration: v.duration || 0,
        pageURL: v.pageURL,
        user: v.user || "Pixabay contributor",
        previewURL: v.userImageURL || "",
        thumbnail: v.videos?.tiny?.thumbnail || "",
        videoURL: chosen?.url || "",
        width: chosen?.width || 0,
        height: chosen?.height || 0
      };
    }).filter(v => v.videoURL);
    return res.status(200).json({ total: data.total || 0, videos, source: "Pixabay" });
  } catch (error) {
    console.error("JARVIS stock footage error:", error);
    return res.status(error && error.name === "TimeoutError" ? 504 : 500).json({
      error: error && error.name === "TimeoutError" ? "Stock footage search timed out." : "Could not search stock footage."
    });
  }
};
