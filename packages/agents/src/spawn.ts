import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentSpec, Complexity } from '@agent-forge/shared';
import { evaluateToolUse } from './hooks.js';

export interface RunOptions {
  spec: AgentSpec;
  prompt: string;
  cwd: string;
  appendSystem?: string;
  onMessage?: (msg: SDKMessage) => void;
  onToolBlocked?: (toolName: string, reason: string) => void;
  resume?: string;
  /**
   * Triage-assessed complexity of the task. When set and AGENT_FORGE_AUTO_TIER
   * is not 'off', the orchestrator picks Opus for complex tasks and Sonnet for
   * everything else. Explicit AGENT_FORGE_MODEL env still wins.
   */
  complexity?: Complexity;
}

const SONNET = 'claude-sonnet-4-6';
const OPUS = 'claude-opus-4-7';

export function pickModel(args: { spec: AgentSpec; complexity?: Complexity }): string {
  // 1) Explicit env overrides win — operator knows best.
  if (args.spec.role === 'triage') {
    return process.env.AGENT_FORGE_TRIAGE_MODEL ?? args.spec.model;
  }
  if (process.env.AGENT_FORGE_MODEL) {
    return process.env.AGENT_FORGE_MODEL;
  }
  // 2) Auto-tier driven by triage's complexity verdict.
  const tier = (process.env.AGENT_FORGE_AUTO_TIER ?? 'on').toLowerCase();
  if (tier !== 'off' && args.complexity) {
    if (tier === 'eager') {
      // Anything non-trivial gets Opus.
      return args.complexity === 'simple' ? SONNET : OPUS;
    }
    // 'on' (default) and 'conservative' both mean: only complex → Opus.
    return args.complexity === 'complex' ? OPUS : SONNET;
  }
  // 3) Fall back to the agent's own MD-declared model.
  return args.spec.model;
}

export interface RunResult {
  text: string;
  sessionId: string | null;
  stopReason: string;
  messages: SDKMessage[];
  durationMs: number;
  usage: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    turns: number;
  };
}

function renderSystemPrompt(spec: AgentSpec, extra?: string): string {
  return [
    `# Role: ${spec.display_name ?? spec.id} (${spec.role})`,
    '',
    spec.body_md,
    '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

function allowedToolNames(spec: AgentSpec): string[] {
  const out = new Set<string>();
  for (const t of spec.tools) {
    if (t.startsWith('Bash(')) out.add('Bash');
    else out.add(t);
  }
  return Array.from(out);
}

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const start = Date.now();
  const collected: SDKMessage[] = [];
  let sessionId: string | null = null;
  let stopReason = 'unknown';
  let finalText = '';

  const tools = allowedToolNames(opts.spec);

  const effectiveModel = pickModel({ spec: opts.spec, complexity: opts.complexity });

  const sdkOptions: Options = {
    model: effectiveModel,
    cwd: opts.cwd,
    tools,
    allowedTools: tools,
    maxTurns: opts.spec.max_turns,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    systemPrompt: renderSystemPrompt(opts.spec, opts.appendSystem),
    resume: opts.resume,
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== 'PreToolUse') {
                return { continue: true };
              }
              const decision = evaluateToolUse({
                spec: opts.spec,
                cwd: opts.cwd,
                toolName: input.tool_name,
                toolInput: input.tool_input as Record<string, unknown>,
              });
              if (decision.action === 'block') {
                opts.onToolBlocked?.(input.tool_name, decision.reason);
                return {
                  decision: 'block',
                  reason: decision.reason,
                  systemMessage: `BLOCKED ${input.tool_name}: ${decision.reason}`,
                };
              }
              return { continue: true };
            },
          ],
        },
      ],
    },
  };

  let lastAssistantText = '';
  let usage = {
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    turns: 0,
  };

  for await (const message of query({ prompt: opts.prompt, options: sdkOptions })) {
    collected.push(message);
    opts.onMessage?.(message);
    if ('session_id' in message && typeof message.session_id === 'string') {
      sessionId = message.session_id;
    }
    if (message.type === 'assistant') {
      const blocks = (message as { message?: { content?: unknown[] } }).message?.content;
      if (Array.isArray(blocks)) {
        const text = blocks
          .filter(
            (b): b is { type: 'text'; text: string } =>
              typeof b === 'object' &&
              b !== null &&
              (b as { type?: string }).type === 'text' &&
              typeof (b as { text?: unknown }).text === 'string'
          )
          .map((b) => b.text)
          .join('\n')
          .trim();
        if (text) lastAssistantText = text;
      }
    }
    if (message.type === 'result') {
      stopReason = message.subtype ?? 'success';
      if (message.subtype === 'success' && typeof message.result === 'string') {
        finalText = message.result;
      }
      usage.turns = (message as { num_turns?: number }).num_turns ?? 0;
      usage.costUsd = (message as { total_cost_usd?: number }).total_cost_usd ?? 0;
      const modelUsage = (message as { modelUsage?: Record<string, Record<string, number>> })
        .modelUsage;
      if (modelUsage) {
        for (const mu of Object.values(modelUsage)) {
          usage.inputTokens += mu.inputTokens ?? 0;
          usage.outputTokens += mu.outputTokens ?? 0;
          usage.cacheReadTokens += mu.cacheReadInputTokens ?? 0;
          usage.cacheCreationTokens += mu.cacheCreationInputTokens ?? 0;
        }
      }
    }
  }

  // Fall back to the last assistant text when the SDK didn't surface a final result
  // (e.g. error_max_turns) — the agent may still have produced usable output.
  if (!finalText && lastAssistantText) finalText = lastAssistantText;

  return {
    text: finalText,
    sessionId,
    stopReason,
    messages: collected,
    durationMs: Date.now() - start,
    usage,
  };
}

export interface JsonRunResult<T> {
  value: T;
  raw: string;
  sessionId: string | null;
  attempts: number;
  usage: RunResult['usage'];
  durationMs: number;
}

export async function runAgentForJson<T>(args: {
  opts: RunOptions;
  parse: (raw: unknown) => T;
  maxAttempts?: number;
}): Promise<JsonRunResult<T>> {
  const max = args.maxAttempts ?? 2;
  let lastErr: Error | null = null;
  let lastText = '';
  let sessionId: string | null = args.opts.resume ?? null;
  const aggUsage: RunResult['usage'] = {
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    turns: 0,
  };
  let totalDuration = 0;

  for (let attempt = 1; attempt <= max; attempt++) {
    const opts: RunOptions = {
      ...args.opts,
      resume: attempt === 1 ? args.opts.resume : sessionId ?? args.opts.resume,
      prompt:
        attempt === 1
          ? args.opts.prompt
          : `Your previous response could not be parsed as a JSON object. Reply with ONE valid JSON object and nothing else. No prose, no fences, no apologies. Start with { and end with }. Previous error: ${lastErr?.message ?? 'invalid JSON'}`,
    };
    const run = await runAgent(opts);
    sessionId = run.sessionId;
    lastText = run.text;
    aggUsage.costUsd += run.usage.costUsd;
    aggUsage.inputTokens += run.usage.inputTokens;
    aggUsage.outputTokens += run.usage.outputTokens;
    aggUsage.cacheReadTokens += run.usage.cacheReadTokens;
    aggUsage.cacheCreationTokens += run.usage.cacheCreationTokens;
    aggUsage.turns += run.usage.turns;
    totalDuration += run.durationMs;
    try {
      const raw = extractJsonObject(run.text);
      return {
        value: args.parse(raw),
        raw: run.text,
        sessionId: run.sessionId,
        attempts: attempt,
        usage: aggUsage,
        durationMs: totalDuration,
      };
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw new Error(
    `runAgentForJson: gave up after ${max} attempts. last text head: ${lastText.slice(0, 200)} — ${lastErr?.message}`
  );
}

function findBalancedObjects(s: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

export function extractJsonObject(text: string): unknown {
  const candidates: string[] = [];

  // 1) All fenced ```json blocks
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) candidates.push(m[1]!.trim());

  // 2) All balanced top-level objects in raw text
  candidates.push(...findBalancedObjects(text));

  let lastError = '';
  // Prefer the LAST candidate (agents often think-out-loud, then conclude).
  for (let i = candidates.length - 1; i >= 0; i--) {
    const slice = candidates[i]!.trim();
    if (!slice.startsWith('{') || !slice.endsWith('}')) continue;
    try {
      return JSON.parse(slice);
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(
    lastError
      ? `no parseable JSON object found in output (last error: ${lastError})`
      : 'no JSON object found in output'
  );
}
