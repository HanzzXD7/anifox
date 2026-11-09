'use strict';

const {
  allowGetOnly,
  handleServerError,
  sendJson,
  supabaseSelect
} = require('./_lib/stream-api');

module.exports = async function handler(req, res) {
  if (!allowGetOnly(req, res)) return;

  const id = String(req.query?.id || '').trim();
  const slug = String(req.query?.slug || '').trim();

  if ((!id && !slug) || (id && slug) || id.length > 36 || slug.length > 100) {
    return sendJson(res, 400, { error: 'Isi id atau slug anime yang valid.' });
  }

  try {
    const params = new URLSearchParams({
      select: 'id,slug,title,synopsis,poster_url,banner_url,release_year,genres',
      is_published: 'eq.true',
      limit: '1'
    });
    params.set(id ? 'id' : 'slug', 'eq.' + (id || slug));

    const rows = await supabaseSelect('anifox_anime', params);
    if (!rows.length) return sendJson(res, 404, { error: 'Anime tidak ditemukan.' });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return sendJson(res, 200, { data: rows[0] });
  } catch (error) {
    return handleServerError(res, error, 'anime detail');
  }
};
