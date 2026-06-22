const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `당신은 사주(四柱)와 오행(五行)에 기반해 로또 6/45 번호를 추천하는 전문 상담 챗봇입니다.

규칙:
- 사용자의 성별과 생년월일(양력)을 바탕으로 사주를 간략히 분석합니다.
- 천간·지지, 오행(木火土金水), 십성, 용신·희신 개념을 활용해 번호를 선정합니다.
- 1~45 중 중복 없이 6개의 본번호와 1개의 보너스 번호를 추천합니다.
- 각 번호가 사주와 어떻게 연결되는지 구체적으로 설명합니다.
- 로또는 확률 게임이며 당첨을 보장하지 않는다는 점을 한 번 언급합니다.
- 친절하고 이해하기 쉬운 한국어로 답변합니다.
- 추가 질문이 있으면 reply 필드에서 자연스럽게 이어서 답합니다.

반드시 아래 JSON 형식만 출력하세요:
{
  "sajuSummary": "사주 핵심 요약 (2~4문장)",
  "numbers": [6개 정수, 오름차순],
  "bonus": 보너스 정수,
  "explanation": "번호별·오행별 추천 근거 상세 설명",
  "reply": "사용자에게 전달할 대화체 메시지"
}`;

function validateNumbers(numbers, bonus) {
  if (!Array.isArray(numbers) || numbers.length !== 6) return false;
  const all = [...numbers, bonus];
  if (all.some(n => !Number.isInteger(n) || n < 1 || n > 45)) return false;
  if (new Set(all).size !== 7) return false;
  return numbers.every((n, i) => i === 0 || numbers[i - 1] < n);
}

function parseGeminiJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(raw);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 지원합니다.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수에 추가해 주세요.'
    });
  }

  try {
    const { gender, birthDate, message, history = [] } = req.body || {};

    if (!gender || !birthDate) {
      return res.status(400).json({ error: '성별과 생년월일을 입력해 주세요.' });
    }

    const genderLabel = gender === 'male' ? '남성' : gender === 'female' ? '여성' : gender;
    const conversation = history
      .slice(-6)
      .map(h => `${h.role === 'user' ? '사용자' : '상담사'}: ${h.content}`)
      .join('\n');

    const userPrompt = [
      `[사용자 정보]`,
      `성별: ${genderLabel}`,
      `생년월일(양력): ${birthDate}`,
      message ? `\n[현재 질문]\n${message}` : '\n[요청]\n위 사주에 맞는 로또 번호 6개와 보너스 1개를 추천하고 근거를 설명해 주세요.',
      conversation ? `\n[이전 대화]\n${conversation}` : ''
    ].join('\n');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.9,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: {
                sajuSummary: { type: 'string' },
                numbers: {
                  type: 'array',
                  items: { type: 'integer' }
                },
                bonus: { type: 'integer' },
                explanation: { type: 'string' },
                reply: { type: 'string' }
              },
              required: ['sajuSummary', 'numbers', 'bonus', 'explanation', 'reply']
            }
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errBody);
      return res.status(502).json({ error: 'Gemini API 호출에 실패했습니다.' });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'Gemini 응답을 파싱할 수 없습니다.' });
    }

    let result;
    try {
      result = parseGeminiJson(text);
    } catch {
      return res.status(502).json({ error: '추천 결과 형식이 올바르지 않습니다.' });
    }

    result.numbers = result.numbers.map(Number).sort((a, b) => a - b);
    result.bonus = Number(result.bonus);

    if (!validateNumbers(result.numbers, result.bonus)) {
      return res.status(502).json({ error: '추천 번호가 로또 규칙에 맞지 않습니다. 다시 시도해 주세요.' });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('saju-lotto error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
