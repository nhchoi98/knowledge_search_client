/**
 * MCP 응답/대화 포맷 공통 유틸.
 * 여러 계층(route/orchestrator/mcp runtime)에서 재사용한다.
 */
export const normalizeMCPResponse = (payload) => {
  if (!payload) {
    return {
      action: 'local-mcp',
      answer: '로컬 MCP에서 비어 있는 응답을 받았습니다.',
    };
  }

  if (typeof payload.action === 'string' && typeof payload.answer === 'string') {
    return {
      action: payload.action,
      answer: payload.answer,
    };
  }

  const answer =
    (typeof payload.answer === 'string' && payload.answer) ||
    (typeof payload.content === 'string' && payload.content) ||
    (typeof payload.message === 'string' && payload.message) ||
    JSON.stringify(payload, null, 2);

  return {
    action: payload.action || 'local-mcp',
    answer,
  };
};

export const resolveConversation = (rawConversation) => {
  if (!Array.isArray(rawConversation)) {
    return [];
  }

  return rawConversation
    .filter(
      (item) =>
        item &&
        typeof item.role === 'string' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.text === 'string',
    )
    .map((item) => ({
      role: item.role,
      content: item.text,
    }));
};

export const proxyResponse = (result, extras = {}) => {
  return {
    ...result.data,
    ...extras,
    mcpStatus: result.status,
  };
};

