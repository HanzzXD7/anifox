'use strict';

const {
  allowGetOnly,
  handleServerError,
  isUuid,
  sendJson,
  supabaseSelect
} = require('./_lib/stream-api');

module.exports = async function handler(req, res) {
  if (!allowGetOnly(req, res)) return;

  const animeId = String(req.query?.anime_id || '').trim();
  if (!isUuid(animeId)) {
    return sendJson(res, 400, { error: 'anime_id harus berupa UUID yang valid.' });
  }

  try {
    const params = new URLSearchParams({
      select: 'id,episode_number,title,cloudflare_video_uid',
      anime_id: 'eq.' + animeId,
      is_published: 'eq.true',
      order: 'episode_number.asc',
      limit: '500'
    });

    const rows = await supabaseSelect('anifox_episodes', params);
    const episodes = rows.map(({ cloudflare_video_uid, ...episode }) => ({
      ...episode,
      has_stream: Boolean(cloudflare_video_uid)
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return sendJson(res, 200, { data: episodes });
  } catch (error) {
    return handleServerError(res, error, 'episode catalog');
  }
};
