import React, { useState } from "react";
import {
  Code2,
  Copy,
  Check,
  Terminal,
  FileCode,
  Sparkles,
  Scissors,
  Wand2,
  ExternalLink,
  Bot,
  Layers,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { RATIO_PRESETS } from "../lib/ratios";

interface ApiDocsPageProps {
  onBackToStudio: () => void;
  endpoint?: string;
}

type CodeTab = "curl" | "python-sdk" | "python-requests" | "ts-sdk" | "ts-fetch";

export const ApiDocsPage: React.FC<ApiDocsPageProps> = ({ onBackToStudio, endpoint }) => {
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>("curl");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.pages.dev";
  const activeRelay = endpoint?.trim() || "https://comfy-relay.chaoticmindintheuniverse.workers.dev?key=1357911";

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const aiAgentPromptText = `You are an AI assistant that can generate images using our self-hosted ComfyUI Image Generation API.

### API Endpoint & Auth:
- Base URL: ${baseUrl}/v1
- Endpoint: POST ${baseUrl}/v1/images/generations
- Auth: No API key required (Bearer token can be 'not-needed')
- Headers: Content-Type: application/json

### Available Models & Prompting Rules:
1. "anima" (aliases: "anima-base"):
   - High-quality anime and stylized character generation.
   - TAKES: 'prompt' (positive prompt) AND 'negative_prompt' (unwanted artifacts, deformed hands, etc.).
   - Prefill: True by default (automatically prepends 'masterpiece, best quality...').
   - Optional parameters: 'steps' (default: 30), 'cfg_scale' (default: 4.0), 'size' (e.g. '1024x1024', '16:9', '9:16'), 'seed'.

2. "kroma" (aliases: "krea", "krea-kroma", "krea2"):
   - Photorealistic generation with automatic 2x upscale refinement.
   - TAKES ONLY: 'prompt' (positive prompt). DO NOT rely on 'negative_prompt' (the distilled CFG=1 pipeline zeroes negative conditioning).
   - Optional parameters: 'steps' (default: 8), 'upscale_steps' (default: 4), 'upscale_denoise' (default: 0.14), 'size', 'seed'.

3. "anima-sticker" (aliases: "sticker", "animasticker"):
   - Stylized subject generation with RMBG-2.0 transparent background removal and outline sticker highlight. Returns transparent PNG.
   - TAKES: 'prompt' (positive) AND 'negative_prompt'.
   - Sticker parameters:
     * 'outline_width': integer pixels (default: 2, set 0 for clean cutout without border).
     * 'outline_color': hex color string (default: '#FFFFFF', e.g. '#EC4899', '#F59E0B').
     * 'sensitivity': RMBG sensitivity (default: 1.0, range: 0.1-5.0).
   - Optional parameters: 'steps' (default: 30), 'cfg_scale' (default: 4.0), 'size', 'seed'.

### Standard Request Body Example:
{
  "model": "anima",
  "prompt": "a girl in cybernetic armor in a rain-slicked neo tokyo alley",
  "negative_prompt": "blurry, low quality, deformed hands",
  "size": "16:9",
  "steps": 30,
  "cfg_scale": 4.0,
  "response_format": "url"
}

### Response Format:
{
  "created": 1710000000,
  "data": [
    { "url": "https://<relay>/view?filename=...&subfolder=&type=output" }
  ]
}
`;

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-8 text-zinc-100">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              OpenAI-Compatible
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              v1.0 API
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Code2 className="w-7 h-7 text-indigo-400" />
            Image Generation API Reference
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
            Complete specification for integrating local image generation into external apps, AI agent frameworks,
            scripts, and OpenAI SDK clients.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => copyToClipboard(aiAgentPromptText, "ai-prompt")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-indigo-500/20 transition-all active:scale-95"
            title="Copy system prompt instructions tailored for AI agents"
          >
            {copiedKey === "ai-prompt" ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Copied AI Spec!</span>
              </>
            ) : (
              <>
                <Bot className="w-4 h-4 text-purple-200" />
                <span>Copy for AI Agent</span>
              </>
            )}
          </button>

          <a
            href="/v1/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <span>OpenAPI 3.1 Spec</span>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>

          <button
            type="button"
            onClick={onBackToStudio}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            <span>Studio</span>
          </button>
        </div>
      </div>

      {/* Endpoints & Quick Spec Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-semibold mb-1">API Base URL</div>
          <div className="flex items-center justify-between gap-2 bg-zinc-950 rounded-xl px-3 py-2 border border-zinc-800 font-mono text-xs text-indigo-300">
            <span className="truncate">{baseUrl}/v1</span>
            <button
              onClick={() => copyToClipboard(`${baseUrl}/v1`, "base-url")}
              className="text-zinc-400 hover:text-white shrink-0"
              title="Copy Base URL"
            >
              {copiedKey === "base-url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-semibold mb-1">Generation Route</div>
          <div className="flex items-center justify-between gap-2 bg-zinc-950 rounded-xl px-3 py-2 border border-zinc-800 font-mono text-xs text-emerald-400">
            <span className="font-bold text-zinc-200">POST</span>
            <span className="truncate">/v1/images/generations</span>
            <button
              onClick={() => copyToClipboard(`${baseUrl}/v1/images/generations`, "gen-route")}
              className="text-zinc-400 hover:text-white shrink-0"
              title="Copy Route URL"
            >
              {copiedKey === "gen-route" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-semibold mb-1">Model Catalog Route</div>
          <div className="flex items-center justify-between gap-2 bg-zinc-950 rounded-xl px-3 py-2 border border-zinc-800 font-mono text-xs text-purple-400">
            <span className="font-bold text-zinc-200">GET</span>
            <span className="truncate">/v1/models</span>
            <button
              onClick={() => copyToClipboard(`${baseUrl}/v1/models`, "model-route")}
              className="text-zinc-400 hover:text-white shrink-0"
              title="Copy Route URL"
            >
              {copiedKey === "model-route" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold mb-1">
            <span>Configured ComfyUI Relay</span>
            <span className="text-[10px] text-amber-400 font-mono">From Settings</span>
          </div>
          <div className="flex items-center justify-between gap-2 bg-zinc-950 rounded-xl px-3 py-2 border border-zinc-800 font-mono text-xs text-amber-300">
            <span className="truncate">{activeRelay}</span>
            <button
              onClick={() => copyToClipboard(activeRelay, "relay-url")}
              className="text-zinc-400 hover:text-white shrink-0"
              title="Copy Relay Endpoint URL"
            >
              {copiedKey === "relay-url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Model Matrix Cards */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Supported Models & Prompting Matrix
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Anima */}
          <div className="bg-zinc-900/80 border border-indigo-500/30 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-lg shadow-indigo-950/20">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Stylized / Anime
                </span>
                <span className="text-[10px] font-mono bg-zinc-950 px-2 py-0.5 rounded text-zinc-400 border border-zinc-800">
                  model: "anima"
                </span>
              </div>
              <h3 className="text-base font-bold text-white">Anima Base (T2I)</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                High-quality anime illustration model tuned with the Silvana LoRA. Features full negative prompt support and quality tag prefill.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Positive Prompt:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Required
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Negative Prompt:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Supported
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Quality Prefill:</span>
                <span className="text-indigo-400 font-semibold">Enabled by default</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Default Steps & CFG:</span>
                <span className="font-mono text-zinc-200">30 steps, 4.0 cfg</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Accepted Aliases:</span>
                <span className="font-mono text-[11px] text-zinc-300">anima-base</span>
              </div>
            </div>
          </div>

          {/* Kroma */}
          <div className="bg-zinc-900/80 border border-purple-500/30 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-lg shadow-purple-950/20">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-purple-400" />
                  Photorealism / Upscale
                </span>
                <span className="text-[10px] font-mono bg-zinc-950 px-2 py-0.5 rounded text-zinc-400 border border-zinc-800">
                  model: "kroma"
                </span>
              </div>
              <h3 className="text-base font-bold text-white">Kroma (Krea-2) Upscale</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Photorealistic distilled model that produces sharp images with an automatic 2x upscale refinement pass.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Positive Prompt:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Required
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Negative Prompt:</span>
                <span className="text-amber-400 font-semibold flex items-center gap-1" title="Distilled model operating at CFG 1 with zeroed negative conditioning">
                  <XCircle className="w-3.5 h-3.5" /> Ignored (CFG 1)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Steps:</span>
                <span className="font-mono text-zinc-200">8 base + 4 upscale</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Upscale Factor:</span>
                <span className="font-mono text-zinc-200">2.0x (Lanczos)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Accepted Aliases:</span>
                <span className="font-mono text-[11px] text-zinc-300">krea, krea2, krea-kroma</span>
              </div>
            </div>
          </div>

          {/* Anima Sticker */}
          <div className="bg-zinc-900/80 border border-fuchsia-500/30 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-lg shadow-fuchsia-950/20">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-400 flex items-center gap-1.5">
                  <Scissors className="w-4 h-4 text-fuchsia-400" />
                  Cutout / Sticker
                </span>
                <span className="text-[10px] font-mono bg-zinc-950 px-2 py-0.5 rounded text-zinc-400 border border-zinc-800">
                  model: "anima-sticker"
                </span>
              </div>
              <h3 className="text-base font-bold text-white">Anima Sticker (Cutout)</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Anima character generator with built-in RMBG-2.0 background removal and customizable outline stroke. Outputs transparent PNG.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Positive & Negative:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Supported
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Sticker Outline:</span>
                <span className="font-mono text-zinc-200">outline_width (px)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Outline Color:</span>
                <span className="font-mono text-zinc-200">outline_color (hex)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Background Matting:</span>
                <span className="font-mono text-zinc-200">sensitivity (0.1-5.0)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Accepted Aliases:</span>
                <span className="font-mono text-[11px] text-zinc-300">sticker, animasticker</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Code Examples Section */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Integration Code Examples
            </span>
          </div>

          {/* Code Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {[
              { id: "curl", label: "cURL" },
              { id: "python-sdk", label: "Python (OpenAI SDK)" },
              { id: "python-requests", label: "Python (requests)" },
              { id: "ts-sdk", label: "TypeScript (OpenAI SDK)" },
              { id: "ts-fetch", label: "JavaScript (fetch)" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCodeTab(tab.id as CodeTab)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeCodeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Code Content */}
        <div className="relative p-6 bg-zinc-950">
          <div className="absolute top-4 right-6">
            <button
              onClick={() => {
                let code = "";
                if (activeCodeTab === "curl") {
                  code = `curl -X POST "${baseUrl}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anima",
    "prompt": "a magical cyber city skyline at dusk",
    "negative_prompt": "blurry, low quality, artifact",
    "size": "16:9",
    "steps": 30,
    "cfg_scale": 4.0,
    "response_format": "url"
  }'`;
                } else if (activeCodeTab === "python-sdk") {
                  code = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="not-needed"
)

# 1. Anima Base generation with negative prompt
response = client.images.generate(
    model="anima",
    prompt="a futuristic android portrait, glowing neon accents",
    size="1024x1024",
    extra_body={
        "negative_prompt": "blurry, deformed, low quality",
        "steps": 30,
        "cfg_scale": 4.0
    }
)
print("Image URL:", response.data[0].url)

# 2. Anima Sticker with transparent cutout & pink outline
sticker = client.images.generate(
    model="sticker",
    prompt="cute chibi cat wearing a samurai helmet",
    size="1:1",
    extra_body={
        "outline_width": 4,
        "outline_color": "#EC4899"
    }
)
print("Sticker URL:", sticker.data[0].url)`;
                } else if (activeCodeTab === "python-requests") {
                  code = `import requests

url = "${baseUrl}/v1/images/generations"
payload = {
    "model": "kroma",
    "prompt": "vintage classic sportscar parked on a rainy street, realistic photography",
    "size": "16:9",
    "steps": 8,
    "upscale_steps": 4,
    "response_format": "url"
}

res = requests.post(url, json=payload)
data = res.json()
print("Generated image URL:", data["data"][0]["url"])`;
                } else if (activeCodeTab === "ts-sdk") {
                  code = `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}/v1",
  apiKey: "not-needed",
});

async function main() {
  const result = await openai.images.generate({
    model: "anima",
    prompt: "cyberpunk detective walking in the fog",
    size: "16:9",
    // Local parameters passed through extraBody
    ...({
      negative_prompt: "blurry, deformed, lowres",
      steps: 30,
      cfg_scale: 4.0,
    } as any),
  });

  console.log("Image URL:", result.data?.[0]?.url);
}

main();`;
                } else if (activeCodeTab === "ts-fetch") {
                  code = `async function generateImage() {
  const response = await fetch("${baseUrl}/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anima-sticker",
      prompt: "cute magical girl casting a spell, anime art",
      negative_prompt: "blurry, low quality, artifacts",
      size: "1:1",
      outline_width: 3,
      outline_color: "#FFFFFF",
      steps: 30,
      response_format: "url"
    }),
  });

  const json = await response.json();
  console.log("Result URL:", json.data[0].url);
}

generateImage();`;
                }
                copyToClipboard(code, "code-block");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 hover:text-white border border-zinc-700/60 shadow-sm transition-colors"
            >
              {copiedKey === "code-block" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <pre className="text-xs font-mono text-zinc-300 leading-relaxed overflow-x-auto select-all p-2">
            <code>
              {activeCodeTab === "curl" &&
                `# 1. Anima Base with negative prompt & custom steps:
curl -X POST "${baseUrl}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anima",
    "prompt": "a magical cyber city skyline at dusk",
    "negative_prompt": "blurry, low quality, artifact",
    "size": "16:9",
    "steps": 30,
    "cfg_scale": 4.0,
    "response_format": "url"
  }'

# 2. Kroma (Krea-2) photorealistic generate + upscale:
curl -X POST "${baseUrl}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kroma",
    "prompt": "a vintage roadster parked along the mediterranean coast",
    "size": "16:9",
    "steps": 8,
    "upscale_steps": 4
  }'

# 3. Anima Sticker with 4px pink outline:
curl -X POST "${baseUrl}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "sticker",
    "prompt": "cute chibi magical girl holding a star wand",
    "negative_prompt": "blurry, low quality",
    "size": "1:1",
    "outline_width": 4,
    "outline_color": "#EC4899"
  }'`}

              {activeCodeTab === "python-sdk" &&
                `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="not-needed"
)

# 1. Anima Base generation with negative prompt
response = client.images.generate(
    model="anima",
    prompt="a futuristic android portrait, glowing neon accents",
    size="1024x1024",
    extra_body={
        "negative_prompt": "blurry, deformed, low quality",
        "steps": 30,
        "cfg_scale": 4.0
    }
)
print("Image URL:", response.data[0].url)

# 2. Anima Sticker with transparent cutout & pink outline
sticker = client.images.generate(
    model="sticker",
    prompt="cute chibi cat wearing a samurai helmet",
    size="1:1",
    extra_body={
        "outline_width": 4,
        "outline_color": "#EC4899"
    }
)
print("Sticker URL:", sticker.data[0].url)`}

              {activeCodeTab === "python-requests" &&
                `import requests

url = "${baseUrl}/v1/images/generations"
payload = {
    "model": "kroma",
    "prompt": "vintage classic sportscar parked on a rainy street, realistic photography",
    "size": "16:9",
    "steps": 8,
    "upscale_steps": 4,
    "response_format": "url"
}

res = requests.post(url, json=payload)
data = res.json()
print("Generated image URL:", data["data"][0]["url"])`}

              {activeCodeTab === "ts-sdk" &&
                `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${baseUrl}/v1",
  apiKey: "not-needed",
});

async function main() {
  const result = await openai.images.generate({
    model: "anima",
    prompt: "cyberpunk detective walking in the fog",
    size: "16:9",
    // Model-specific extensions passed via extra body
    ...({
      negative_prompt: "blurry, deformed, lowres",
      steps: 30,
      cfg_scale: 4.0,
    } as any),
  });

  console.log("Image URL:", result.data?.[0]?.url);
}

main();`}

              {activeCodeTab === "ts-fetch" &&
                `async function generateImage() {
  const response = await fetch("${baseUrl}/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anima-sticker",
      prompt: "cute magical girl casting a spell, anime art",
      negative_prompt: "blurry, low quality, artifacts",
      size: "1:1",
      outline_width: 3,
      outline_color: "#FFFFFF",
      steps: 30,
      response_format: "url"
    }),
  });

  const json = await response.json();
  console.log("Result URL:", json.data[0].url);
}

generateImage();`}
            </code>
          </pre>
        </div>
      </div>

      {/* Parameter Reference Table */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Sliders className="w-5 h-5 text-indigo-400" />
          Parameter Reference
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Parameter</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Default</th>
                <th className="py-3 px-4">Supported In</th>
                <th className="py-3 px-4">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">model</td>
                <td className="py-3 px-4 text-zinc-400">string</td>
                <td className="py-3 px-4">"anima"</td>
                <td className="py-3 px-4 text-zinc-200">All</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Model ID or alias: <code>"anima"</code>, <code>"kroma"</code> (or <code>"krea"</code>), <code>"anima-sticker"</code> (or <code>"sticker"</code>).
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">prompt</td>
                <td className="py-3 px-4 text-zinc-400">string</td>
                <td className="py-3 px-4 text-rose-400 font-semibold">Required</td>
                <td className="py-3 px-4 text-zinc-200">All</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Primary description of image content. (For Anima, "|" can also embed negative prompt).
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">negative_prompt</td>
                <td className="py-3 px-4 text-zinc-400">string</td>
                <td className="py-3 px-4 text-zinc-400">Workflow fallback</td>
                <td className="py-3 px-4 text-zinc-200">anima, anima-sticker</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Flaws, artifacts, and concepts to suppress. (Ignored on Kroma which uses CFG 1).
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">size</td>
                <td className="py-3 px-4 text-zinc-400">string</td>
                <td className="py-3 px-4">"1024x1024"</td>
                <td className="py-3 px-4 text-zinc-200">All</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Aspect ratio or resolution: <code>"1024x1024"</code>, <code>"16:9"</code>, <code>"9:16"</code>, <code>"4:3"</code>, <code>"3:4"</code>, etc.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">steps</td>
                <td className="py-3 px-4 text-zinc-400">integer</td>
                <td className="py-3 px-4">30 (anima) / 8 (kroma)</td>
                <td className="py-3 px-4 text-zinc-200">All</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Diffusion sampling steps (1 to 150).
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">cfg_scale</td>
                <td className="py-3 px-4 text-zinc-400">number</td>
                <td className="py-3 px-4">4.0 (anima)</td>
                <td className="py-3 px-4 text-zinc-200">anima, anima-sticker</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Guidance scale (prompt adherence), between 0.5 and 30.0.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">outline_width</td>
                <td className="py-3 px-4 text-zinc-400">integer</td>
                <td className="py-3 px-4">2</td>
                <td className="py-3 px-4 text-fuchsia-300">anima-sticker</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Sticker outline thickness in pixels. Set <code>0</code> for a clean transparent cutout with no border.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">outline_color</td>
                <td className="py-3 px-4 text-zinc-400">string</td>
                <td className="py-3 px-4">"#FFFFFF"</td>
                <td className="py-3 px-4 text-fuchsia-300">anima-sticker</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Hex color code for sticker outline highlight (e.g. <code>"#FFFFFF"</code>, <code>"#EC4899"</code>).
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">sensitivity</td>
                <td className="py-3 px-4 text-zinc-400">number</td>
                <td className="py-3 px-4">1.0</td>
                <td className="py-3 px-4 text-fuchsia-300">anima-sticker</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  RMBG-2.0 background matting sensitivity (0.1 to 5.0).
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">upscale_steps</td>
                <td className="py-3 px-4 text-zinc-400">integer</td>
                <td className="py-3 px-4">4</td>
                <td className="py-3 px-4 text-purple-300">kroma</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Number of denoising steps executed during the secondary upscale pass.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">seed</td>
                <td className="py-3 px-4 text-zinc-400">integer</td>
                <td className="py-3 px-4 text-zinc-400">Random</td>
                <td className="py-3 px-4 text-zinc-200">All</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Deterministic integer seed for reproducible output.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">prefill</td>
                <td className="py-3 px-4 text-zinc-400">boolean | string</td>
                <td className="py-3 px-4">true</td>
                <td className="py-3 px-4 text-zinc-200">anima, anima-sticker</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  Whether to prepend the Anima quality tags (<code>true</code>) or pass a custom prefill string. Set <code>false</code> to disable.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-indigo-300">response_format</td>
                <td className="py-3 px-4 text-zinc-400">string</td>
                <td className="py-3 px-4">"url"</td>
                <td className="py-3 px-4 text-zinc-200">All</td>
                <td className="py-3 px-4 font-sans text-zinc-300">
                  <code>"url"</code> returns a direct link to the rendered image; <code>"b64_json"</code> returns inline base64 data.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Aspect Ratio Reference */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          Supported Aspect Ratios & Dimensions (~1MP Base)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {RATIO_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-white font-mono">{preset.id}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {preset.width}x{preset.height}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 truncate">{preset.label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};
