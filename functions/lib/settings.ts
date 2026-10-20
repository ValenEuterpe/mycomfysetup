import { Env } from "./comfy";
import { getWorkflow, DEFAULT_WORKFLOW_ID } from "./workflows";

/**
 * Per-chat settings for the Telegram bot, persisted in the
 * TELEGRAM_SETTINGS KV namespace. "Set once, use until changed".
 */
export interface ChatSettings {
  modelId: string;
  ratio: string;
  /** Anima-only quality/character prefix prepended to every user prompt. */
  prefill: string;
  /** Anima-only negative prompt used when the run does not supply one. */
  negative: string;
}

export type AwaitingField = "prompt" | "prefill" | "negative";

export interface LastRun {
  positive: string;
  negative?: string;
  workflowId: string;
  ratio: string;
  seed: string;
}

const keyFor = (chatId: string | number) => `tg:${chatId}`;
const awaitKeyFor = (chatId: string | number) => `tg:${chatId}:await`;
const lastKeyFor = (chatId: string | number) => `tg:${chatId}:last`;

export function defaultSettings(): ChatSettings {
  const wf = getWorkflow(DEFAULT_WORKFLOW_ID);
  return {
    modelId: DEFAULT_WORKFLOW_ID,
    ratio: "1:1",
    prefill: wf?.prefillDefault ?? "",
    negative: wf?.negativeDefault ?? "",
  };
}

function isAvailable(env: Env): boolean {
  return Boolean(env.TELEGRAM_SETTINGS);
}

export async function getSettings(
  env: Env,
  chatId: string | number
): Promise<ChatSettings> {
  const defaults = defaultSettings();
  if (!isAvailable(env)) return defaults;
  try {
    const raw = await env.TELEGRAM_SETTINGS!.get(keyFor(chatId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export async function saveSettings(
  env: Env,
  chatId: string | number,
  patch: Partial<ChatSettings>
): Promise<boolean> {
  if (!isAvailable(env)) return false;
  const current = await getSettings(env, chatId);
  await env.TELEGRAM_SETTINGS!.put(
    keyFor(chatId),
    JSON.stringify({ ...current, ...patch })
  );
  return true;
}

export async function resetSettings(env: Env, chatId: string | number): Promise<boolean> {
  if (!isAvailable(env)) return false;
  await env.TELEGRAM_SETTINGS!.put(keyFor(chatId), JSON.stringify(defaultSettings()));
  return true;
}

/**
 * Marks a pending ForceReply-style input (what the next message from this
 * chat is treated as). Short TTL so stale states self-expire.
 */
export async function setAwaiting(
  env: Env,
  chatId: string | number,
  field: AwaitingField | null
): Promise<void> {
  if (!isAvailable(env)) return;
  const key = awaitKeyFor(chatId);
  if (field === null) {
    await env.TELEGRAM_SETTINGS!.delete(key);
    return;
  }
  await env.TELEGRAM_SETTINGS!.put(key, field, { expirationTtl: 300 });
}

export async function getAwaiting(env: Env, chatId: string | number): Promise<AwaitingField | null> {
  if (!isAvailable(env)) return null;
  return (await env.TELEGRAM_SETTINGS!.get(awaitKeyFor(chatId))) as AwaitingField | null;
}

export async function setLastRun(env: Env, chatId: string | number, run: LastRun): Promise<void> {
  if (!isAvailable(env)) return;
  await env.TELEGRAM_SETTINGS!.put(lastKeyFor(chatId), JSON.stringify(run));
}

export async function getLastRun(env: Env, chatId: string | number): Promise<LastRun | null> {
  if (!isAvailable(env)) return null;
  try {
    const raw = await env.TELEGRAM_SETTINGS!.get(lastKeyFor(chatId));
    return raw ? (JSON.parse(raw) as LastRun) : null;
  } catch {
    return null;
  }
}
