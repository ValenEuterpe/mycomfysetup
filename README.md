# ComfyUI Universal Studio & Dynamic API Exporter

A lightweight, serverless, universal web studio and dynamic API exporter for **ComfyUI** workflows, designed to run seamlessly on **Cloudflare Pages** or **Cloudflare Workers**.

---

## Features

- **Universal ComfyUI Endpoint**:
  - Connects to any ComfyUI server, GPU instance, or Cloudflare Worker relay.
  - Full support for endpoints with auth keys:
    `https://comfy-relay.chaoticmindintheuniverse.workers.dev/?key=somepersonalkeymaybeher`
  - Real-time connection testing, latency monitor, and GPU queue depth display.
  - Remembers recent endpoints in your browser's local storage.

- **Dynamic Workflow JSON Parser**:
  - Upload or drag-and-drop any ComfyUI API JSON (such as `anima-base-api (1).json`).
  - Automatically analyzes the graph topology, separates graph wiring from literal parameters, and extracts:
    - **Prompts**: Positive & Negative prompt textareas (auto-detected via KSampler wiring and metadata).
    - **Dimensions & Aspect Ratio**: Quick visual ratio presets (1:1, 16:9, 9:16, 4:3, 3:4, 21:9) and custom width/height with snap multiples.
    - **Sampling & Generation**: Seed (with "Randomize on queue" and "Dice" roll), Steps slider, CFG slider, Denoise, Sampler dropdown, Scheduler dropdown.
    - **Media Uploads**: File dropzone for Image-to-Image / Image-to-Video workflows with direct relay upload to `/upload/image`.
    - **Model / LoRA Loaders**: UNET, Checkpoint, and LoRA filename inputs with strength controls.
    - **Advanced Graph Inputs**: Collapsible inspector allowing fine-tuning of any literal value in any node.

- **Dynamic API & Code Exporter**:
  - **cURL**: Ready-to-run terminal curl command with injected workflow payload.
  - **TypeScript / JavaScript**: Clean `fetch()` client script.
  - **Python**: Clean `requests` client script.
  - **JSON Schema**: Draft-07 JSON Schema describing all extracted parameters, types, defaults, and bounds.
  - **OpenAPI 3.0**: Complete OpenAPI specification for wrapping the workflow in an external API.
  - **Injected Workflow JSON**: Copy or download the complete ComfyUI API JSON with your configured inputs.

- **Open & Zero-Login**:
  - No user accounts, passwords, or database setup required.
  - All configurations, presets, and history are kept strictly on your machine in `localStorage`.

- **Cloudflare Edge Proxy**:
  - Includes a Cloudflare Pages Function at `/api/proxy` to bypass browser CORS restrictions transparently if your ComfyUI relay restricts direct cross-origin browser requests.

- **Password Gate**:
  - The whole site (pages + API) is protected by a password stored in the `SITE_PASSWORD` secret.
  - Login is handled by a Cloudflare Pages Function; a signed HttpOnly session cookie (30 days) is issued on success.

- **Secrets-backed Relay Endpoint**:
  - The ComfyUI relay URL and key live in Cloudflare secrets (`COMFY_RELAY_URL`, `COMFY_RELAY_KEY`) and are delivered to the (already authenticated) browser via `/api/config`.

- **Telegram Bot Generation**:
  - Generate directly from Telegram — just send any text, or use `/gen [model] <positive> [| negative]`.
  - Ships with two built-in workflows: **anima** (Anima Base T2I, supports negative prompt + prefill) and **kroma** (Krea-2 generate + upscale, no negative prompt — it is zeroed out by design at cfg 1).
  - Per-user persistent settings (model, aspect ratio, anima prefill / negative prompt) stored in the `TELEGRAM_SETTINGS` KV namespace — "set once, use until changed".
  - Styled inline-keyboard UI: settings panel, model & ratio pickers, ForceReply prompt editing, live status updates, Regenerate button.
  - Finished images are uploaded straight into the chat by the worker.

- **Delivery Toggles**:
  - The generation page has toggles for **Load in browser** and **Send to Telegram**.
  - With "Load in browser" off and "Send to Telegram" on, finished images are relayed to Telegram and never displayed in the browser.

---

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Start local dev server
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## Deployment to Cloudflare Pages

### Option 1: Direct Wrangler CLI Deployment
```bash
# Build the production bundle
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=nsfwimage
```

### Option 2: Cloudflare Dashboard (Git Integration)
1. Push this repository to GitHub/GitLab.
2. In the Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Set build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Deploy!

## Secrets Configuration

| Secret | Purpose |
| --- | --- |
| `SITE_PASSWORD` | Password that locks the studio (leave unset to keep the site open) |
| `AUTH_SECRET` | Optional separate cookie-signing secret (defaults to `SITE_PASSWORD`) |
| `COMFY_RELAY_URL` | Your ComfyUI server / relay endpoint (injected into the studio automatically) |
| `COMFY_RELAY_KEY` | Optional auth key sent to the relay (`Bearer` / `X-Api-Key`) |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Optional secret token Telegram echoes in the webhook header |
| `TELEGRAM_CHAT_ID` | Default chat used by the page's "Send to Telegram" toggle |

Set secrets with the CLI:

```bash
npx wrangler pages secret put SITE_PASSWORD --project-name=nsfwimage
npx wrangler pages secret put COMFY_RELAY_URL --project-name=nsfwimage
npx wrangler pages secret put COMFY_RELAY_KEY --project-name=nsfwimage
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name=nsfwimage
```

(Or via Dashboard → your Pages project → Settings → Environment variables. For local dev, put them in `.dev.vars` — it is gitignored.)

## Telegram Bot Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Bind the settings KV namespace (per-user settings persistence). The binding is already declared in `wrangler.toml`; if you redeploy to a different Cloudflare account, recreate it:

   ```bash
   npx wrangler kv namespace create TELEGRAM_SETTINGS
   # then put the returned id into wrangler.toml under [[kv_namespaces]]
   ```

3. After deployment, register the webhook once (replace the token and your site URL):

   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://YOUR-SITE.pages.dev/api/telegram"
   ```

4. In your chat:
   - `/start` — welcome + quick access to settings
   - any plain text — generate instantly using your saved settings
   - `/settings` — settings panel (model, ratio, prefill, negative)
   - `/models` or `/model anima` — pick / set the model (persisted)
   - `/ratio 16:9` or `/ratio` — set the aspect ratio via picker (persisted)
   - `/prefill` — edit the anima prefill (ForceReply dialog; `reset` / `(clear)` supported)
   - `/negative` — edit the anima negative prompt (same flow)
   - `/gen kroma a man in a cabriolet car` — one-shot generation with one-shot overrides
   - `/gen anima a dog in the street | blurry, low quality` — negative prompt for that run only

   With **anima**, prompts become `masterpiece, best quality, score_9, score_8, safe, @silvana, <your text>` automatically (the prefill is user-editable/clearable via `/prefill`). The negative prompt (`worst quality, low quality, score_1…`) is likewise anima-only and user-editable via `/negative`. **Kroma** ignores prefill/negative by design (cfg 1 with zeroed negative conditioning) but supports aspect ratio.

### Bot-driven server flow

```
Telegram message -> /api/telegram (Pages Function)
                   loads per-chat settings from TELEGRAM_SETTINGS KV
                   builds workflow from functions/lib/workflows.ts registry
                   -> POST relay /prompt -> poll /history -> GET /view
                   -> sendPhoto / sendDocument to the chat
```

### Page-driven delivery

Generation started in the studio keeps running in your browser; with
**Send to Telegram** enabled the finished media refs are POSTed to the
auth-protected `/api/deliver` endpoint, which downloads from the relay
and uploads straight to `TELEGRAM_CHAT_ID` — nothing is shown in the
browser if **Load in browser** is off.
