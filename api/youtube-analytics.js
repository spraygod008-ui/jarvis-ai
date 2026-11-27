module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionToken = (req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
  if (!sessionToken) return res.status(401).json({ error: "Sign in required." });

  try {
    const auth = await fetch("https://brpszcevzqwuiuvqcfri.supabase.co/auth/v1/user", {
      headers: {
        apikey: "sb_publishable_oj-G9SY6GeqioBpgRUryHw_YjktCaU9",
        Authorization: "Bearer " + sessionToken
      }
    });
    if (!auth.ok) return res.status(401).json({ error: "Session invalid. Please sign in again." });
    const user = await auth.json();
    if ((user.email || "").toLowerCase() !== "spraygod008@gmail.com") {
      return res.status(403).json({ error: "This JARVIS instance is private." });
    }

    const youtubeToken = req.body && req.body.youtubeAccessToken;
    if (typeof youtubeToken !== "string" || !youtubeToken.trim() || youtubeToken.length > 10000) {
      return res.status(400).json({ error: "YouTube permission missing. Reconnect YouTube from the JARVIS home page." });
    }

    const googleFetch = async (url) => {
      const response = await fetch(url, {
        headers: { Authorization: "Bearer " + youtubeToken }
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data.error && data.error.message ? data.error.message : "YouTube API request failed.";
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }
      return data;
    };

    const channelData = await googleFetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true"
    );
    const channel = channelData.items && channelData.items[0];
    if (!channel) return res.status(200).json({ channel: { title: "No channel found" }, latestVideos: [] });

    const uploadsId = channel.contentDetails && channel.contentDetails.relatedPlaylists &&
      channel.contentDetails.relatedPlaylists.uploads;
    let latestVideos = [];
    if (uploadsId) {
      const playlist = await googleFetch(
        "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=" +
        encodeURIComponent(uploadsId) + "&maxResults=5"
      );
      const ids = (playlist.items || [])
        .map(item => item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId)
        .filter(Boolean);
      if (ids.length) {
        const videos = await googleFetch(
          "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=" +
          ids.map(encodeURIComponent).join(",")
        );
        latestVideos = (videos.items || []).map(video => ({
          title: video.snippet && video.snippet.title || "Untitled video",
          viewCount: video.statistics && video.statistics.viewCount || "0",
          likeCount: video.statistics && video.statistics.likeCount || "0",
          commentCount: video.statistics && video.statistics.commentCount || "0"
        }));
      }
    }

    return res.status(200).json({
      channel: {
        title: channel.snippet && channel.snippet.title || "YouTube channel",
        statistics: channel.statistics || {}
      },
      latestVideos
    });
  } catch (error) {
    console.error("JARVIS YouTube analytics error:", error);
    const status = error.status === 403 ? 403 : error.status === 401 ? 401 : 502;
    return res.status(status).json({
      error: status === 403
        ? "Google denied YouTube API access. Confirm the youtube.readonly scope is enabled and reconnect YouTube."
        : status === 401
          ? "YouTube permission expired. Reconnect YouTube from the JARVIS home page."
          : "Could not load YouTube analytics. Please try again."
    });
  }
};
