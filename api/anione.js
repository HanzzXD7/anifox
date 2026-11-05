module.exports = async (req, res) => {
  res.setHeader(
    'Cache-Control',
    's-maxage=900, stale-while-revalidate=3600'
  );

  try {
    const channelId = await findChannelId('@AniOneID');

    if (!channelId) {
      throw new Error('Channel ID not found');
    }

    const videos = await getVideos(channelId);

    res.status(200).json({
      source: 'Ani-One Indonesia',
      videos
    });
  } catch (error) {
    res.status(502).json({
      error: 'Ani-One feed unavailable',
      videos: []
    });
  }
};

async function findChannelId(handle) {
  const response = await fetch(
    `https://www.youtube.com/${handle}`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }
  );

  if (!response.ok) {
    throw new Error('Channel page unavailable');
  }

  const html = await response.text();

  const patterns = [
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
    /<meta itemprop="channelId" content="(UC[A-Za-z0-9_-]{22})"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }

  return null;
}

async function getVideos(channelId) {
  const url =
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!response.ok) {
    throw new Error('YouTube RSS error');
  }

  const xml = await response.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  return entries.map(entry => {
    const videoId = getTag(entry, 'yt:videoId');

    return {
      videoId,
      title: getTag(entry, 'title'),
      published: getTag(entry, 'published'),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      source: 'Ani-One Indonesia'
    };
  }).filter(video =>
    /^[A-Za-z0-9_-]{11}$/.test(video.videoId)
  );
}

function getTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(
    new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`)
  );

  return match ? decodeXML(match[1].trim()) : '';
}

function decodeXML(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
