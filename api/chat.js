module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Gemini API key is not configured in Vercel."
    });
  }

  try {
    const message = req.body && req.body.message;

    if (typeof message !== "string" || !message.trim() || message.length > 4000) {
      return res.status(400).json({
        error: "Please enter a message (maximum 4000 characters)."
      });
    }

    const systemPrompt = [
      "You are JARVIS, a capable personal AI assistant inspired by a calm, precise cinematic AI.",
      "Speak naturally and confidently. Match the user's language: Hindi, English, or Hinglish.",
      "If the user writes Hindi in Devanagari, reply in Hindi. If the user uses Hinglish, Hinglish is welcome.",
      "Be helpful, accurate, concise, and transparent about limitations.",
      "Do not claim to control the user's computer, access files, or perform actions unless a connected tool actually did so.",
      "Ask for confirmation before any consequential action."
    ].join(" ");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model: "gemini-3.8-flash",
        input: systemPrompt + "\n\nUser: " + message.trim()
      }),
      signal: AbortSignal.timeout(30000)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data);
      return res.status(502).json({
        error: data.error?.message || "Gemini could not process your request."
      });
    }

    // Interactions REST responses contain generated text in model_output steps.
    const stepText = Array.isArray(data.steps)
      ? data.steps
          .filter(step => step.type === "model_output" && Array.isArray(step.content))
          .flatMap(step => step.content)
          .filter(part => part.type === "text" && typeof part.text === "string")
          .map(part => part.text)
          .join("\n")
      : "";

    const reply = (
      (typeof data.output_text === "string" && data.output_text) ||
      stepText ||
      ""
    ).trim();

    if (!reply) {
      console.error("Gemini returned no text:", data);
      return res.status(502).json({
        error: "Gemini returned an empty response. Please try again."
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("JARVIS backend error:", error);
    const timedOut = error && error.name === "TimeoutError";
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut
        ? "Gemini took too long to respond. Please try again."
        : "Something went wrong while contacting JARVIS AI."
    });
  }
};
