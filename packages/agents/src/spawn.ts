import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentSpec } from '@agent-forge/shared';
import { evaluateToolUse } from './hooks.js';

export interface RunOptions {
  spec: AgentSpec;
  prompt: string;
  cwd: string;
  appendSystem?: string;
  onMessage?: (msg: SDKMessage) => void;
  onToolBlocked?: (toolName: string, reason: string) => void;
  resume?: string;
}

export interface RunResult {
  text: string;
  sessionId: string | null;
  stopReason: string;
  messages: SDKMessage[];
  durationMs: number;
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

  const sdkOptions: Options = {
    model: opts.spec.model,
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
  };
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first < 0 || last < 0) throw new Error('no JSON object found in output');
  return JSON.parse(candidate.slice(first, last + 1));
}
