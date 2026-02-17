/**
 * SSE write helper.
 * event/data 포맷을 표준화해 프론트의 EventSource 파서가 안정적으로 읽게 한다.
 */
export const writeSSE = (res, event, payload) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.write(`event: ${event}\n`);
  body
    .toString()
    .split('\n')
    .forEach((line) => {
      res.write(`data: ${line}\n`);
    });
  res.write('\n');
};

/**
 * 최종 텍스트를 delta 이벤트로 쪼개서 스트리밍 전송한다.
 */
export const streamText = (res, fullText, chunkSize = 48) => {
  if (!fullText) {
    return;
  }
  for (let start = 0; start < fullText.length; start += chunkSize) {
    writeSSE(res, 'delta', {
      chunk: fullText.slice(start, start + chunkSize),
    });
  }
};

/**
 * Route planner(JSON 문자열) 결과를 안전하게 파싱한다.
 */
export const parseRoutePlan = (planningText) => {
  try {
    const parsed = JSON.parse(planningText);
    if (parsed && typeof parsed === 'object' && typeof parsed.route === 'string') {
      return {
        route: parsed.route === 'chat_only' ? 'chat_only' : 'local_mcp',
        query: typeof parsed.query === 'string' ? parsed.query.trim() : '',
        explanation:
          typeof parsed.explanation === 'string' && parsed.explanation.trim()
            ? parsed.explanation.trim()
            : '',
      };
    }
  } catch {
    // noop
  }

  return null;
};

