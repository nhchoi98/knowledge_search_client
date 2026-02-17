/**
 * OpenAI 호출 전용 클라이언트 팩토리.
 * 서버 전역 설정(키/모델)을 캡슐화해서, 다른 모듈은 callOpenAI 함수만 사용하도록 분리한다.
 */
export const createOpenAIClient = ({ apiKey, model }) => {
  const OPENAI_API_KEY = apiKey || '';
  const OPENAI_MODEL = model || 'gpt-4o-mini';

  const callOpenAI = async ({ messages, responseFormat = 'text' }) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: responseFormat === 'json' ? { type: 'json_object' } : { type: 'text' },
        messages,
        temperature: 0.2,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || 'OpenAI 호출 실패';
      throw new Error(`OpenAI API 오류 (${response.status}): ${message}`);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item?.text === 'string') {
            return item.text;
          }
          return '';
        })
        .join('\n');
    }

    return '';
  };

  return { callOpenAI };
};

