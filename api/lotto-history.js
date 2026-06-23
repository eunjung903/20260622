const { supabaseRequest, validateGames } = require('./lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
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
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { source = 'draw', games, meta = {} } = req.body || {};

      if (!['draw', 'saju'].includes(source)) {
        return res.status(400).json({ error: 'source는 draw 또는 saju여야 합니다.' });
      }
      if (!validateGames(games)) {
        return res.status(400).json({ error: 'games 형식이 올바르지 않습니다.' });
      }

      const rows = await supabaseRequest('lotto_draws', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          client_id: clientId,
          source,
          games,
          meta
        })
      });

      return res.status(201).json(rows[0]);
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
    const message = err.message?.includes('SUPABASE')
      ? err.message
      : '저장소 요청에 실패했습니다.';
    return res.status(500).json({ error: message });
  }
};
