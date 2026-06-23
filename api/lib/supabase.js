function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
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
    const message = data?.message || data?.error || text || res.statusText;
    throw new Error(message);
  }

  return data;
}

function validateGame(game) {
  if (!game || !Array.isArray(game.main) || game.main.length !== 6) return false;
  const bonus = game.bonus;
  const all = bonus == null ? [...game.main] : [...game.main, bonus];
  if (all.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  if (new Set(all).size !== all.length) return false;
  return true;
}

function validateGames(games) {
  return Array.isArray(games) && games.length > 0 && games.every(validateGame);
}

module.exports = { supabaseRequest, validateGames };
