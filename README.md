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
npx wrangler pages deploy dist --project-name=comfy-universal-studio
```

### Option 2: Cloudflare Dashboard (Git Integration)
1. Push this repository to GitHub/GitLab.
2. In the Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Set build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Deploy!
