
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API key missing in Vercel" });
  }

  try {
    const message = req.body?.message;

    if (typeof message !== "string" ||
        !message.trim() || message.length > 4000) {
      return res.status(400).json({ error: "Invalid message" });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text:
              "You are JARVIS, a helpful personal assistant. Reply in the same language as the user, Hindi or English.\n\n" + message
            }]
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);
      return res.status(502).json({ error: "Gemini request failed" });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "")
      .join("");

    return res.status(200).json({
      reply: reply || "I could not generate a response."
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};
