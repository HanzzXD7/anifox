'use strict';

const {
  allowGetOnly,
  handleServerError,
  isUuid,
  requireUser,
  sendJson,
  supabaseSelect
} = require('./_lib/stream-api');

module.exports = async function handler(req, res) {
  if (!allowGetOnly(req, res)) return;

  const episodeId = String(req.query?.episode_id || '').trim();
  if (!isUuid(episodeId)) {
    return sendJson(res, 400, { error: 'episode_id harus berupa UUID yang valid.' });
  }

  try {
    const user = await requireUser(req);
    if (!user?.id) {
      return sendJson(res, 401, { error: 'Silakan login untuk menonton.' });
    }

    const params = new URLSearchParams({
      select: 'id,episode_number,title,cloudflare_video_uid',
      id: 'eq.' + episodeId,
      is_published: 'eq.true',
      limit: '1'
    });
    const rows = await supabaseSelect('anifox_episodes', params);
    const episode = rows[0];

    if (!episode || !episode.cloudflare_video_uid) {
      return sendJson(res, 404, { error: 'Sumber video episode belum tersedia.' });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    const customerCode = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;

    if (!accountId || !apiToken || !customerCode) {
      return sendJson(res, 503, { error: 'Cloudflare Stream belum dikonfigurasi.' });
    }

    const tokenResponse = await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' +
        encodeURIComponent(accountId) + '/stream/' +
        encodeURIComponent(episode.cloudflare_video_uid) + '/token',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 15 * 60
        })
      }
    );

    const tokenPayload = await tokenResponse.json();
    const signedToken = tokenPayload?.result?.token;

    if (!tokenResponse.ok || !tokenPayload?.success || !signedToken) {
      console.error('Cloudflare Stream token request failed:', tokenPayload?.errors || tokenResponse.status);
      return sendJson(res, 502, { error: 'Cloudflare gagal menyiapkan pemutaran video.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, {
      episode_id: episode.id,
      episode_number: episode.episode_number,
      title: episode.title,
      type: 'hls',
      expires_in: 900,
      url: 'https://customer-' + customerCode +
        '.cloudflarestream.com/' + signedToken + '/manifest/video.m3u8'
    });
  } catch (error) {
    return handleServerError(res, error, 'stream');
  }
};
