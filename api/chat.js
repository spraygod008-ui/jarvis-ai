module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return res.status(401).json({ error: "Sign in required." });
  }

  try {
    // Verify the Supabase session server-side; never trust browser-only checks.
    const authResponse = await fetch("https://brpszcevzqwuiuvqcfri.supabase.co/auth/v1/user", {
      headers: {
        "apikey": "sb_publishable_oj-G9SY6GeqioBpgRUryHw_YjktCaU9",
        "Authorization": `Bearer ${accessToken}`
      }
    });
    if (!authResponse.ok) {
      return res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
    }
    const user = await authResponse.json();
    if ((user.email || "").toLowerCase() !== "spraygod008@gmail.com") {
      return res.status(403).json({ error: "This JARVIS instance is private." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenRouter API key is not configured in Vercel." });
    }

    const message = req.body && req.body.message;
    if (typeof message !== "string" || !message.trim() || message.length > 4000) {
      return res.status(400).json({ error: "Please enter a message (maximum 4000 characters)." });
    }

    const systemPrompt = [
      "You are JARVIS, a capable personal AI assistant inspired by a calm, precise cinematic AI.",
      "Speak naturally and confidently. Match the user's language: Hindi, English, or Hinglish.",
      "If the user writes Hindi in Devanagari, reply in Hindi. If the user uses Hinglish, Hinglish is welcome.",
      "Be helpful, accurate, concise, and transparent about limitations.",
      "Do not claim to control the user's computer, access files, or perform actions unless a connected tool actually did so.",
      "Ask for confirmation before any consequential action."
    ].join(" ");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jarvis-ai-nu-seven.vercel.app",
        "X-Title": "JARVIS AI"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message.trim() }
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenRouter API error:", response.status, data);
      return res.status(502).json({ error: data.error?.message || "OpenRouter could not process your request." });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({ error: "OpenRouter returned an empty response. Please try again." });
    }
    return res.status(200).json({ reply: reply.trim() });
  } catch (error) {
    console.error("JARVIS backend error:", error);
    const timedOut = error && error.name === "TimeoutError";
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? "OpenRouter took too long to respond. Please try again." : "Something went wrong while contacting JARVIS AI."
    });
  }
};