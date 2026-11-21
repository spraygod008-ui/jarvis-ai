
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Gemini API key is not configured."
    });
  }

  try {
    const message = req.body?.message;

    if (typeof message !== "string" ||
        !message.trim() ||
        message.length > 4000) {
      return res.status(400).json({
        error: "Please enter a message (maximum 4000 characters)."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.8-flash",
          input:
            "You are JARVIS, a helpful personal AI assistant. " +
            "Speak naturally in Hindi or English, matching the user's language. " +
            "Be friendly, intelligent and concise.\n\nUser: " +
            message
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(502).json({
        error: "Gemini could not process your request."
      });
    }

    return res.status(200).json({
      reply: data.output_text || "I could not generate a response."
    });

  } catch (error) {
    console.error("JARVIS error:", error);

    return res.status(500).json({
      error: "Something went wrong. Please try again."
    });
  }
};
