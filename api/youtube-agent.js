module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
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

    const { task, input, channel } = req.body || {};

    if (task === "analytics") {
      const youtubeToken = req.headers["x-youtube-access-token"];
      if (!youtubeToken) return res.status(401).json({ error: "YouTube permission missing. Go back to JARVIS and click Connect YouTube again." });

      const ytHeaders = { Authorization: "Bearer " + youtubeToken };
      const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true", { headers: ytHeaders });
      const channelData = await channelResponse.json();
      if (!channelResponse.ok) return res.status(403).json({ error: channelData.error?.message || "YouTube API permission failed. Reconnect YouTube." });
      const ch = channelData.items?.[0];
      if (!ch) return res.status(404).json({ error: "No YouTube channel found for this Google account." });

      let recentVideos = [];
      const playlistId = ch.contentDetails?.relatedPlaylists?.uploads;
      if (playlistId) {
        const playlistResponse = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=5&playlistId=" + encodeURIComponent(playlistId), { headers: ytHeaders });
        const playlistData = await playlistResponse.json();
        const ids = (playlistData.items || []).map(x => x.contentDetails?.videoId).filter(Boolean);
        if (ids.length) {
          const videosResponse = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=" + ids.map(encodeURIComponent).join(","), { headers: ytHeaders });
          const videosData = await videosResponse.json();
          if (videosResponse.ok) recentVideos = (videosData.items || []).map(v => ({
            title: v.snippet?.title || "Untitled",
            publishedAt: v.snippet?.publishedAt || null,
            views: Number(v.statistics?.viewCount || 0),
            likes: Number(v.statistics?.likeCount || 0),
            comments: Number(v.statistics?.commentCount || 0)
          }));
        }
      }

      const analytics = {
        channel: ch.snippet?.title || "YouTube channel",
        subscribers: ch.statistics?.hiddenSubscriberCount ? "Hidden" : Number(ch.statistics?.subscriberCount || 0),
        totalViews: Number(ch.statistics?.viewCount || 0),
        videoCount: Number(ch.statistics?.videoCount || 0),
        recentVideos,
        source: "YouTube Data API v3",
        limitation: "This overview does not include YouTube Studio revenue, watch time, impressions, or audience-retention reports."
      };
      return res.status(200).json({ task, result: JSON.stringify(analytics, null, 2), analytics });
    }
    const allowedTasks = [
      "script", "package", "edit", "comment", "plan", "viral",
      "retention", "shorts", "seo", "chapters", "audit"
    ];
    if (!allowedTasks.includes(task)) {
      return res.status(400).json({ error: "Choose a valid YouTube task." });
    }
    if (typeof input !== "string" || !input.trim() || input.length > 12000) {
      return res.status(400).json({ error: "Enter task details (maximum 12,000 characters)." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured in Vercel." });

    const taskGuides = {
      script: "Write a compelling YouTube video script. Start with 3 hook options, then a strong opening, structured scenes/sections, narration, visual suggestions, and a satisfying ending. Score the hooks and explain the best one.",
      package: "Create 5 title and thumbnail-concept pairs. Each pair must work together, avoid misleading clickbait, and include a concise thumbnail text suggestion. Rank the pairs and explain why the top pair is strongest.",
      edit: "Turn the supplied transcript into an editor-friendly edit decision list with timestamps when available, cuts, b-roll, captions, pacing notes, and sections to remove. Never invent timestamps.",
      comment: "Classify supplied comments by sentiment and intent. Draft short, respectful creator replies. Flag spam, harassment, and questions needing a human decision; do not post replies.",
      plan: "Create a practical 7-day YouTube content plan with formats, working titles, audience promise, production notes, and a realistic publishing cadence.",
      viral: "Generate niche and topic research hypotheses, repeatable formats, audience pains, and 15 testable video ideas. Clearly label predictions as hypotheses, not guaranteed viral outcomes.",
      retention: "Analyze supplied retention data or transcript. Identify likely drop-off risks, weak openings, pacing issues, curiosity gaps, and specific fixes. Do not invent analytics that were not provided.",
      shorts: "Extract 5 to 10 Shorts concepts from the supplied long-form idea or transcript. For each provide a hook, short script, visual beats, and a closing line. Do not invent source timestamps.",
      seo: "Create a searchable title, natural description, relevant tags/keywords, chapters if timestamps are supplied, and a pinned-comment suggestion. Avoid keyword stuffing and never promise rankings.",
      chapters: "Create YouTube chapters from the supplied transcript and timestamps. Timestamps must be grounded in supplied data; if none are provided, return chapter headings without fabricated times.",
      audit: "Audit the channel information supplied. Review positioning, titles, thumbnails, content mix, consistency, and next steps. Separate evidence from assumptions and list missing data."
    };

    const systemPrompt = [
      "You are JARVIS YouTube Agent, a practical YouTube strategy and production assistant.",
      "Reply in Hindi/Hinglish when the user uses it; otherwise match the user's language.",
      "Use clear headings, actionable advice, and creator-friendly formatting.",
      "Channel context: " + (typeof channel === "string" ? channel.slice(0, 300) : "Not specified") + ".",
      "Task instructions: " + taskGuides[task],
      "Do not claim to have accessed YouTube Studio, channel analytics, comments, or videos unless supplied in this request.",
      "Do not publish, upload, delete, edit, or reply on YouTube. This endpoint only creates drafts and analysis.",
      "Never invent metrics, transcript content, timestamps, or search-volume data."
    ].join(" ");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jarvis-ai-nu-seven.vercel.app",
        "X-Title": "JARVIS YouTube Agent"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input.trim() }
        ]
      }),
      signal: AbortSignal.timeout(45000)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("YouTube Agent provider error:", response.status, data);
      return res.status(502).json({ error: data.error?.message || "AI provider request failed." });
    }
    const result = data.choices?.[0]?.message?.content;
    if (typeof result !== "string" || !result.trim()) {
      return res.status(502).json({ error: "AI provider returned an empty result." });
    }
    return res.status(200).json({ result: result.trim(), task });
  } catch (error) {
    console.error("JARVIS YouTube Agent error:", error);
    return res.status(error && error.name === "TimeoutError" ? 504 : 500).json({
      error: error && error.name === "TimeoutError" ? "The request timed out. Please try again." : "YouTube Agent could not complete this request."
    });
  }
};
