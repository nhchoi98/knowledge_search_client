/**
 * A2A 기반 오케스트레이션 런타임.
 * - Plan Agent: 실행 계획 수립
 * - MCP/Chat Agent: 실행 전담
 * - Output Agent: 스트림 출력 전담
 *
 * 모든 세부 의존성은 팩토리 인자로 주입받아 index.js 라우터를 얇게 유지한다.
 */
export const createOrchestrationRuntime = ({
  localMcpEndpoint,
  buildRouteDecisionPrompt,
  chatOnlyPrompt,
  callOpenAI,
  callLocalMCP,
  resolveConversation,
  proxyResponse,
  planExecutionFromManifest,
  shouldRetryForPathIssue,
  buildRetryExecutionPlan,
  evaluateGitHubPRReadiness,
  parseRoutePlan,
  streamText,
  writeSSE,
}) => {
  const A2A_PROTOCOL_VERSION = 'a2a.v1';

  const AGENT_IDS = {
    orchestrator: 'orchestrator',
    plan: 'plan-agent',
    mcp: 'mcp-agent',
    output: 'output-agent',
    chat: 'chat-agent',
  };

  const createA2AMessage = ({ from, to, type, requestId, payload = {} }) => ({
    protocol: A2A_PROTOCOL_VERSION,
    requestId,
    from,
    to,
    type,
    timestamp: Date.now(),
    payload,
  });

  const createRequestId = () => `req_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

  const runPlanAgent = async ({ prompt, localEndpoint, emit }) => {
    const requestId = createRequestId();
    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.orchestrator,
        to: AGENT_IDS.plan,
        type: 'plan.request',
        requestId,
        payload: { prompt },
      }),
    );

    const planning = await callOpenAI({
      responseFormat: 'json',
      messages: [
        { role: 'system', content: buildRouteDecisionPrompt() },
        { role: 'user', content: `사용자 요청: ${prompt}` },
      ],
    });

    const plan = parseRoutePlan(planning) || {
      route: 'local_mcp',
      query: prompt,
      explanation: '',
    };
    const executionAgent = plan.route === 'local_mcp' ? AGENT_IDS.mcp : AGENT_IDS.chat;
    let executionPlan = null;
    let manifestContext = null;
    if (plan.route === 'local_mcp') {
      const manifestPlanning = await planExecutionFromManifest({
        prompt,
        routedQuery: plan.query || prompt,
        localEndpoint,
      });
      executionPlan = manifestPlanning.executionPlan;
      manifestContext = manifestPlanning.context;
    }

    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.plan,
        to: AGENT_IDS.orchestrator,
        type: 'plan.response',
        requestId,
        payload: {
          ...plan,
          executionAgent,
          hasExecutionPlan: !!executionPlan,
          workflow: executionPlan?.workflow?.type || null,
          manifestOk: manifestContext?.ok === true,
          manifestStatus: manifestContext?.manifestAttempt?.status || manifestContext?.status || 0,
        },
      }),
    );

    return {
      requestId,
      plan,
      executionAgent,
      executionPlan,
      manifestContext,
    };
  };

  const runMCPAgent = async ({
    requestId,
    prompt,
    localEndpoint,
    conversation,
    explanation,
    executionPlan,
    emit,
  }) => {
    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.orchestrator,
        to: AGENT_IDS.mcp,
        type: 'execution.request',
        requestId,
        payload: {
          prompt,
          localEndpoint: localEndpoint || localMcpEndpoint,
          tool: executionPlan?.tool || null,
        },
      }),
    );

    const localResult = await callLocalMCP({
      prompt,
      localEndpoint,
      conversation: resolveConversation(conversation),
      useLLMPlanner: false,
      preplannedToolPlan: executionPlan,
      eventEmitter: (type, payload) => {
        emit?.(
          'a2a',
          createA2AMessage({
            from: AGENT_IDS.mcp,
            to: AGENT_IDS.orchestrator,
            type: 'execution.progress',
            requestId,
            payload: { type, ...payload },
          }),
        );
      },
    });

    const response = proxyResponse(localResult, {
      route: 'local_mcp',
      routedQuery: prompt,
      explanation,
    });

    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.mcp,
        to: AGENT_IDS.orchestrator,
        type: 'execution.response',
        requestId,
        payload: {
          status: response.mcpStatus || 200,
          tool: response.tool || null,
        },
      }),
    );

    return response;
  };

  const runChatAgent = async ({ requestId, prompt, explanation, emit }) => {
    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.orchestrator,
        to: AGENT_IDS.chat,
        type: 'execution.request',
        requestId,
        payload: { prompt },
      }),
    );

    const answer = await callOpenAI({
      responseFormat: 'text',
      messages: [
        { role: 'system', content: chatOnlyPrompt },
        { role: 'user', content: prompt },
      ],
    });

    const response = {
      action: 'chat-only',
      answer,
      route: 'chat_only',
      routedQuery: prompt,
      explanation,
      mcpStatus: 200,
    };

    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.chat,
        to: AGENT_IDS.orchestrator,
        type: 'execution.response',
        requestId,
        payload: { status: 200 },
      }),
    );

    return response;
  };

  const EXECUTION_AGENT_REGISTRY = {
    [AGENT_IDS.mcp]: runMCPAgent,
    [AGENT_IDS.chat]: runChatAgent,
  };

  const runOrchestration = async ({ prompt, localEndpoint, conversation, emit }) => {
    const { requestId, plan, executionAgent, executionPlan, manifestContext } = await runPlanAgent({
      prompt,
      localEndpoint,
      emit,
    });
    const execute = EXECUTION_AGENT_REGISTRY[executionAgent] || runMCPAgent;
    const routedPrompt = plan.query || prompt;
    if (executionAgent === AGENT_IDS.mcp && !executionPlan) {
      return {
        requestId,
        executionAgent,
        plan,
        executionPlan: null,
        retried: false,
        manifestContext,
        response: {
          action: 'local-mcp',
          answer:
            'Plan Agent가 manifest/tools 정보를 기반으로 실행 계획을 만들지 못했습니다. 로컬 MCP manifest/tools/list 상태를 확인해 주세요.',
          route: 'local_mcp',
          routedQuery: routedPrompt,
          explanation: plan.explanation,
          requiresInput: true,
          missing: 'execution_plan',
          mcpStatus: 200,
        },
      };
    }

    let response = await execute({
      requestId,
      prompt: routedPrompt,
      localEndpoint,
      conversation,
      explanation: plan.explanation,
      executionPlan,
      emit,
    });
    let retried = false;
    let workflowState = null;

    // GitHub PR workflow: sync_status 사전 점검 통과 시에만 create_pr 실행.
    if (executionAgent === AGENT_IDS.mcp && executionPlan?.workflow?.type === 'github_pr') {
      workflowState = {
        type: 'github_pr',
        precheckTool: executionPlan.tool,
        createPrTool: executionPlan.workflow.createPR?.tool || 'create_pr',
        attempted: false,
        proceeded: false,
        reason: '',
      };

      if ((response?.mcpStatus || 200) < 400) {
        const readiness = evaluateGitHubPRReadiness(response);
        if (readiness.canProceed && executionPlan.workflow.createPR?.tool) {
          workflowState.attempted = true;
          workflowState.proceeded = true;
          emit?.(
            'a2a',
            createA2AMessage({
              from: AGENT_IDS.orchestrator,
              to: AGENT_IDS.plan,
              type: 'plan.workflow_continue',
              requestId,
              payload: {
                workflow: 'github_pr',
                step: 'create_pr',
              },
            }),
          );

          const createPRPlan = {
            tool: executionPlan.workflow.createPR.tool,
            toolArguments: executionPlan.workflow.createPR.toolArguments || {},
            routedQuery: routedPrompt,
            explanation: 'github_pr_workflow_execute',
          };

          response = await execute({
            requestId,
            prompt: routedPrompt,
            localEndpoint,
            conversation,
            explanation: plan.explanation,
            executionPlan: createPRPlan,
            emit,
          });
        } else {
          workflowState.reason = readiness.reason;
          response = {
            ...response,
            answer: readiness.reason
              ? `${readiness.reason}\n\n${response.answer || ''}`.trim()
              : response.answer,
            requiresInput: true,
            missing: 'workspace_state',
          };
        }
      }
    }

    if (executionAgent === AGENT_IDS.mcp && shouldRetryForPathIssue(response)) {
      const retryPlan = buildRetryExecutionPlan(executionPlan);
      if (retryPlan) {
        retried = true;
        emit?.(
          'a2a',
          createA2AMessage({
            from: AGENT_IDS.orchestrator,
            to: AGENT_IDS.plan,
            type: 'plan.retry',
            requestId,
            payload: {
              reason: 'paths_not_found',
              retryPaths: retryPlan?.toolArguments?.paths || [],
            },
          }),
        );

        response = await execute({
          requestId,
          prompt: routedPrompt,
          localEndpoint,
          conversation,
          explanation: plan.explanation,
          executionPlan: retryPlan,
          emit,
        });
      }
    }

    return {
      requestId,
      executionAgent,
      plan,
      executionPlan,
      retried,
      workflowState,
      manifestContext,
      response,
    };
  };

  /**
   * Output Agent: 응답 텍스트 스트리밍 + final/done 이벤트를 책임진다.
   */
  const runOutputAgentStream = ({ res, response, requestId, emit }) => {
    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.orchestrator,
        to: AGENT_IDS.output,
        type: 'output.request',
        requestId,
        payload: {
          mode: 'stream',
        },
      }),
    );

    streamText(res, String(response?.answer || ''));
    writeSSE(res, 'final', response);
    writeSSE(res, 'done', { ok: true });

    emit?.(
      'a2a',
      createA2AMessage({
        from: AGENT_IDS.output,
        to: AGENT_IDS.orchestrator,
        type: 'output.done',
        requestId,
        payload: {
          delivered: true,
        },
      }),
    );
  };

  return {
    A2A_PROTOCOL_VERSION,
    runOrchestration,
    runOutputAgentStream,
  };
};

