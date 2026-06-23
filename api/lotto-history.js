const MODEL = 'gemini-2.5-flash';

function getSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim().replace(/\/$/, '');

  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  ).trim();

  if (!url || !key) {
    throw new Error(
      'Supabase 환경 변수가 없습니다. Vercel에 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(service_role)를 설정한 뒤 재배포하세요.'
    );
  }

  return { url, key };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const detail = data?.message || data?.hint || data?.error || text || res.statusText;
      throw new Error(`Supabase ${res.status}: ${detail}`);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

function validateGame(game) {
  if (!game || !Array.isArray(game.main) || game.main.length !== 6) return false;
  const main = game.main.map(n => Number(n));
  const bonus = game.bonus == null ? null : Number(game.bonus);
  const all = bonus == null ? main : [...main, bonus];
  if (all.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  if (new Set(all).size !== all.length) return false;
  return true;
}

function validateGames(games) {
  return Array.isArray(games) && games.length > 0 && games.every(validateGame);
}

function normalizeGames(games) {
  return games.map(g => ({
    main: g.main.map(n => Number(n)).sort((a, b) => a - b),
    bonus: g.bonus == null ? null : Number(g.bonus)
  }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET' && req.query?.health === '1') {
      const { url } = getSupabaseConfig();
      await supabaseRequest('lotto_draws?select=id&limit=1', { method: 'GET' });
      return res.status(200).json({ ok: true, supabaseUrl: url });
    }

    const clientId = req.method === 'GET'
      ? req.query.clientId
      : req.body?.clientId;

    if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
      return res.status(400).json({ error: 'clientId가 필요합니다.' });
    }

    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
      const rows = await supabaseRequest(
        `lotto_draws?client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=${limit}`,
        { method: 'GET' }
      );
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { source = 'draw', games, meta = {} } = req.body || {};

      if (!['draw', 'saju'].includes(source)) {
        return res.status(400).json({ error: 'source는 draw 또는 saju여야 합니다.' });
      }
      if (!validateGames(games)) {
        return res.status(400).json({ error: 'games 형식이 올바르지 않습니다.' });
      }

      const normalized = normalizeGames(games);
      const rows = await supabaseRequest('lotto_draws', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          client_id: clientId,
          source,
          games: normalized,
          meta
        })
      });

      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) {
        return res.status(502).json({ error: 'Supabase에 저장했지만 응답을 받지 못했습니다.' });
      }

      return res.status(201).json(row);
    }

    if (req.method === 'DELETE') {
      await supabaseRequest(
        `lotto_draws?client_id=eq.${encodeURIComponent(clientId)}`,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: '지원하지 않는 메서드입니다.' });
  } catch (err) {
    console.error('lotto-history error:', err);
    const message = err.name === 'AbortError'
      ? 'Supabase 연결 시간이 초과되었습니다. SUPABASE_URL을 확인하세요.'
      : (err.message || '저장소 요청에 실패했습니다.');
    return res.status(500).json({ error: message });
  }
};
