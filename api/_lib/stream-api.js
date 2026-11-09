'use strict';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function allowGetOnly(req, res) {
  if (req.method === 'GET') return true;
  res.setHeader('Allow', 'GET');
  sendJson(res, 405, { error: 'Method not allowed.' });
  return false;
}

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error('Server configuration is incomplete.');
    error.code = 'CONFIG_MISSING';
    throw error;
  }
  return value;
}

async function supabaseSelect(table, params) {
  const baseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const url = new URL(baseUrl + '/rest/v1/' + table);
  url.search = params.toString();

  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const error = new Error('Database request failed.');
    error.code = 'DATABASE_ERROR';
    throw error;
  }

  return response.json();
}

async function requireUser(req) {
  const authorization = req.headers?.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const baseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const publicKey = requiredEnv('SUPABASE_ANON_KEY');
  const response = await fetch(baseUrl + '/auth/v1/user', {
    headers: {
      apikey: publicKey,
      Authorization: 'Bearer ' + match[1]
    }
  });

  if (!response.ok) return null;
  return response.json();
}

function handleServerError(res, error, label) {
  if (error?.code === 'CONFIG_MISSING') {
    return sendJson(res, 503, { error: 'AniFoX Stream API belum dikonfigurasi.' });
  }

  console.error('AniFoX ' + label + ' error:', error);
  return sendJson(res, 502, { error: 'Layanan AniFoX sedang mengalami gangguan.' });
}

module.exports = {
  allowGetOnly,
  handleServerError,
  isUuid,
  requireUser,
  sendJson,
  supabaseSelect
};
