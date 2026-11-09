/**
 * AniFoX — Animbus metadata endpoint.
 *
 * This endpoint exposes basic anime metadata only.
 * It intentionally does not return stream URLs, video IDs, server lists,
 * iframe URLs, or downloadable media resources.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const slug = String(req.query?.slug || '').trim();

  if (!slug || slug.length > 120 || !/^[a-z0-9-]+$/i.test(slug)) {
    return res.status(400).json({
      error: 'Slug tidak valid. Gunakan huruf, angka, dan tanda hubung.'
    });
  }

  try {
    const { getAnime } = await import('animbus');
    const anime = await getAnime(slug);

    if (!anime) {
      return res.status(404).json({
        error: 'Metadata anime tidak ditemukan.'
      });
    }

    const episodes = Array.isArray(anime.streamingEpisodes)
      ? anime.streamingEpisodes.length
      : null;

    res.setHeader(
      'Cache-Control',
      's-maxage=300, stale-while-revalidate=600'
    );

    return res.status(200).json({
      provider: 'Animbus',
      title: typeof anime.title === 'string' ? anime.title : null,
      episodeCount: episodes
    });
  } catch (error) {
    console.error('AniFoX Animbus metadata error:', error);

    return res.status(502).json({
      error: 'Layanan metadata Animbus sedang tidak tersedia.'
    });
  }
};
