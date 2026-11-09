'use strict';

const {
  allowGetOnly,
  handleServerError,
  sendJson,
  supabaseSelect
} = require('./_lib/stream-api');

module.exports = async function handler(req, res) {
  if (!allowGetOnly(req, res)) return;

  try {
    const requestedLimit = Number.parseInt(req.query?.limit, 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 24;

    const params = new URLSearchParams({
      select: 'id,slug,title,synopsis,poster_url,banner_url,release_year,genres',
      is_published: 'eq.true',
      order: 'created_at.desc',
      limit: String(limit)
    });

    const anime = await supabaseSelect('anifox_anime', params);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return sendJson(res, 200, { data: anime });
  } catch (error) {
    return handleServerError(res, error, 'anime catalog');
  }
};
