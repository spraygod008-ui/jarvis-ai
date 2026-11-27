module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const suppliedSecret = req.headers["x-telegram-bot-api-secret-token"] || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized webhook." });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = String(process.env.TELEGRAM_OWNER_ID || "");
  if (!botToken || !ownerId) {
    return res.status(500).json({ error: "Telegram bot is not fully configured." });
  }

  const message = req.body && req.body.message;
  if (!message || !message.from || !message.chat || message.chat.type !== "private") {
    return res.status(200).json({ ok: true });
  }

  // Strict personal-account allowlist. Ignore everyone else without replying.
  if (String(message.from.id) !== ownerId || String(message.chat.id) !== ownerId) {
    return res.status(200).json({ ok: true });
  }

  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!text) {
    await sendTelegram(botToken, message.chat.id, "Abhi main text messages samajh sakta hoon. Voice aur video support agle stage mein add karenge.");
    return res.status(200).json({ ok: true });
  }

  if (text === "/start" || text === "/help") {
    await sendTelegram(botToken, message.chat.id, "नमस्ते! मैं JARVIS हूँ। अब आप मुझसे यहीं Hindi, Hinglish या English में बात कर सकते हैं।\n\nCommands:\n/start — शुरू करें\n/help — मदद\n/yt — YouTube Agent mode\n\nYouTube पर कोई भी upload अभी Private रहेगा; Public करने से पहले आपकी approval ज़रूरी होगी।");
    return res.status(200).json({ ok: true });
  }

  if (text.length > 4000) {
    await sendTelegram(botToken, message.chat.id, "Message 4000 characters se chhota rakho, bro.");
    return res.status(200).json({ ok: true });
  }

  try {
    const youtubeRequest = text === "/yt" || text.startsWith("/yt ") ||
      /raahi\s*motion|youtube|\bshorts?\b|\bvideo\b|\bscript\b|thumbnail|upload/i.test(text);

    if (youtubeRequest) {
      const task = /thumbnail|title|seo|description|tags/i.test(text) && !/script|scene|story|narration/i.test(text)
        ? "package"
        : "script";
      const agentResponse = await fetch("https://jarvis-ai-nu-seven.vercel.app/api/youtube-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-jarvis-internal-secret": expectedSecret
        },
        body: JSON.stringify({
          task,
          input: text.replace(/^\/yt\s*/i, "").trim() || "Create a Hindi YouTube Short plan with script, scenes, title and description.",
          channel: "RAAHI MOTION — Hindi faceless travel and cinematic YouTube channel"
        }),
        signal: AbortSignal.timeout(50000)
      });
      const agentData = await agentResponse.json();
      if (!agentResponse.ok) {
        console.error("Telegram YouTube Agent error:", agentResponse.status, agentData);
        await sendTelegram(botToken, message.chat.id, "YouTube Agent abhi response nahi de paaya. Thodi der baad dobara try karo.");
        return res.status(200).json({ ok: true });
      }
      const result = typeof agentData.result === "string" ? agentData.result.trim() : "";
      await sendTelegram(botToken, message.chat.id, result.slice(0, 3900) || "YouTube Agent se khaali response mila.");
      return res.status(200).json({ ok: true, agent: "youtube-agent", task });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await sendTelegram(botToken, message.chat.id, "JARVIS AI key Vercel mein configured nahi hai.");
      return res.status(200).json({ ok: true });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jarvis-ai-nu-seven.vercel.app",
        "X-Title": "JARVIS Telegram"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          {
            role: "system",
            content: [
              "You are JARVIS, a private personal AI assistant.",
              "Reply naturally in the language used by the user: Hindi, Hinglish, or English.",
              "Be accurate, concise, and transparent about limitations.",
              "Do not claim to have performed actions or accessed services unless a connected tool actually did so.",
              "Ask for explicit confirmation before consequential actions.",
              "YouTube uploads must remain Private unless the owner explicitly approves public publishing."
            ].join(" ")
          },
          { role: "user", content: text }
        ]
      }),
      signal: AbortSignal.timeout(25000)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Telegram JARVIS OpenRouter error:", response.status, data);
      await sendTelegram(botToken, message.chat.id, "AI service abhi busy hai. Thodi der baad dobara try karo.");
      return res.status(200).json({ ok: true });
    }

    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply || typeof reply !== "string") {
      await sendTelegram(botToken, message.chat.id, "Mujhe is baar AI ka response nahi mila. Dobara try karo.");
      return res.status(200).json({ ok: true });
    }

    await sendTelegram(botToken, message.chat.id, reply.trim().slice(0, 4000));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram JARVIS error:", error);
    try {
      await sendTelegram(botToken, message.chat.id, "JARVIS se connection mein problem aayi. Thodi der baad try karo.");
    } catch (_) {}
    return res.status(200).json({ ok: true });
  }
};

async function sendTelegram(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Telegram sendMessage failed:", response.status, detail);
  }
}
