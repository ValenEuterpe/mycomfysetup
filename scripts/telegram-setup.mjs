#!/usr/bin/env node
/**
 * One-time Telegram bot setup:
 *   node scripts/telegram-setup.mjs [--webhook https://YOUR-SITE.pages.dev/api/telegram]
 *
 * - registers the slash-command menu (the "/" dropdown in Telegram)
 * - optionally registers the webhook URL
 *
 * The bot token is read from the TELEGRAM_BOT_TOKEN env var or .dev.vars.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const COMMANDS = [
  { command: "start", description: "Start & overview" },
  { command: "settings", description: "Model, ratio & prompt settings" },
  { command: "models", description: "Model picker" },
  { command: "model", description: "Set model directly: /model anima" },
  { command: "ratio", description: "Aspect ratio gallery" },
  { command: "prefill", description: "Edit the anima prefill" },
  { command: "negative", description: "Edit the anima negative prompt" },
  { command: "gen", description: "One-shot generation: /gen [model] <prompt>" },
  { command: "help", description: "Usage help" },
];

function readDevVarsToken() {
  const p = path.resolve(process.cwd(), ".dev.vars");
  if (!fs.existsSync(p)) return null;
  const line = fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .find((l) => /^TELEGRAM_BOT_TOKEN\s*=/.test(l));
  return line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : null;
}

const token = process.env.TELEGRAM_BOT_TOKEN || readDevVarsToken();
if (!token) {
  console.error("No TELEGRAM_BOT_TOKEN found (env or .dev.vars).");
  process.exit(1);
}

const args = process.argv.slice(2);
const webhookArgIdx = args.indexOf("--webhook");
const webhookUrl = webhookArgIdx >= 0 ? args[webhookArgIdx + 1] : null;

const call = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return json;
};

const commandsResult = await call("setMyCommands", { commands: COMMANDS });
console.log(
  commandsResult.ok
    ? `Registered ${COMMANDS.length} slash-commands ("/" dropdown).`
    : `setMyCommands failed: ${commandsResult.description}`
);

if (webhookUrl) {
  const { ok, description } = await call("setWebhook", { url: webhookUrl });
  console.log(ok ? `Webhook set: ${webhookUrl}` : `setWebhook failed: ${description}`);
}

const me = await call("getMe", {});
if (me.ok) {
  console.log(`Bot: @${me.result.username} — ready.`);
}
