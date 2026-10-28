# Image Generation API Documentation

An OpenAI-compatible image generation API powering **Anima Base**, **Kroma (Krea-2) Upscale**, and **Anima Sticker** generation directly from ComfyUI workflows running on Cloudflare Pages.

---

## 1. Quick Reference & Endpoints

| Resource | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| **Generate Image** | `POST` | `/v1/images/generations` | Generates an image and returns a URL or base64 data |
| **List Models** | `GET` | `/v1/models` | Lists all supported models and parameter schemas |
| **Model Details** | `GET` | `/v1/models/{model}` | Details and parameter constraints for a model/alias |
| **OpenAPI Spec** | `GET` | `/v1/openapi.json` | OpenAPI 3.1 JSON schema for agent / tool ingestion |
| **Interactive Docs** | `GET` | `/#/docs` | Built-in web documentation page with code copy |

### Base URL
- Production: `https://<your-project>.pages.dev/v1`
- Local dev: `http://localhost:3000/v1`

### Authentication
No API key is required (`Authorization: Bearer not-needed` or omit).

---

## 2. Models & Specific Capabilities

| Model ID | Aliases | Negative Prompt | Quality Prefill | Default Steps / CFG | Best For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`anima`** | `anima-base` | **Supported** | Yes (`masterpiece, ...`) | 30 steps / 4.0 CFG | Stylized anime, character concepts, illustration |
| **`kroma`** | `krea`, `krea2`, `krea-kroma` | **Ignored** (CFG 1 distilled) | No | 8 base + 4 upscale | Photorealism, realistic portraits, nature, vehicles |
| **`anima-sticker`** | `sticker`, `animasticker`, `cutout` | **Supported** | Yes (`masterpiece, ...`) | 30 steps / 4.0 CFG | Cutout sticker graphics with transparent background PNG |

### Detailed Model Rules:

### 1. `anima` (Anima Base T2I)
- **Positive Prompt**: Required.
- **Negative Prompt**: Supported. Pass `negative_prompt: "..."` or embed using `positive prompt | negative prompt`. Default negative prompt suppresses anatomical flaws and low quality.
- **Prefill**: Set `prefill: true` (default) to automatically prepend `masterpiece, best quality, score_9, score_8, safe, @silvana,`. Set `prefill: false` to disable.
- **Steps & CFG**: Supports custom `steps` (default 30, range 1–150) and `cfg_scale` (default 4.0, range 0.5–30.0).

### 2. `kroma` (Krea-2 Photorealism + 2x Upscale)
- **Positive Prompt**: Required.
- **Negative Prompt**: **Do NOT use**. Kroma is a distilled model operating at CFG 1 with zeroed negative conditioning. If a client supplies `negative_prompt`, the API handles it gracefully and ignores it rather than failing.
- **Upscale Pipeline**: Generates a base latent at ~1MP (default 8 steps), upscales by 2x (Lanczos), and runs an upscale refinement pass (default 4 steps, denoise 0.14).
- **Custom Parameters**:
  - `steps`: base generation steps (default: 8, range 1–50).
  - `upscale_steps`: refinement pass steps (default: 4, range 1–30).
  - `upscale_denoise`: upscale pass denoise level (default: 0.14, range 0.05–0.8).
  - `scale_by`: upscale factor (default: 2.0, range 1.0–4.0).

### 3. `anima-sticker` (Cutout Transparent PNG)
- **Positive Prompt**: Required.
- **Negative Prompt**: Supported.
- **Background Removal**: Built-in RMBG-2.0 model automatically segments the foreground subject and renders a transparent PNG.
- **Sticker Parameters**:
  - `outline_width`: Stroke width in pixels (default: 2, range 0–50). Set to `0` for a clean transparent cutout with no white border.
  - `outline_color`: Hex color string for outline (default: `"#FFFFFF"`, e.g. `"#EC4899"` for pink, `"#F59E0B"` for gold).
  - `sensitivity`: RMBG-2.0 matting sensitivity (default: 1.0, range 0.1–5.0).

---

## 3. Parameter Reference

| Parameter | Type | Default | Valid Range / Options | Description |
| :--- | :--- | :--- | :--- | :--- |
| `model` | `string` | `"anima"` | `"anima"`, `"kroma"`, `"anima-sticker"` (or aliases) | Target model |
| `prompt` | `string` | *Required* | Non-empty text | Positive description of image |
| `negative_prompt` | `string` | Model default | Text | Flaws/artifacts to suppress (anima, sticker) |
| `size` | `string` | `"1024x1024"` | Aspect ratio or WxH: `"1:1"`, `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"`, `"21:9"` | Image dimensions (~1MP base) |
| `steps` | `integer` | 30 (anima) / 8 (kroma) | 1 – 150 | Diffusion denoising steps |
| `cfg_scale` | `number` | 4.0 | 0.5 – 30.0 | Prompt guidance strength |
| `sampler_name` | `string` | `"er_sde"` / `"euler"` | `"er_sde"`, `"euler"`, `"dpmpp_2m_sde"`, etc. | KSampler algorithm |
| `scheduler` | `string` | `"simple"` | `"simple"`, `"normal"`, `"karras"`, `"beta"`, etc. | Noise scheduler algorithm |
| `seed` | `integer` | Random | `>= 0` | Seed for reproducible output |
| `outline_width` | `integer` | 2 | 0 – 50 | Sticker outline thickness in px (`0` = clean alpha) |
| `outline_color` | `string` | `"#FFFFFF"` | Hex color string | Sticker outline highlight color |
| `sensitivity` | `number` | 1.0 | 0.1 – 5.0 | RMBG background removal sensitivity |
| `upscale_steps` | `integer` | 4 | 1 – 30 | Secondary upscale steps (kroma only) |
| `upscale_denoise`| `number` | 0.14 | 0.05 – 0.8 | Secondary upscale denoise strength (kroma only) |
| `scale_by` | `number` | 2.0 | 1.0 – 4.0 | Upscale multiplier (kroma only) |
| `prefill` | `boolean\|string` | `true` | `true`, `false`, or custom string | Anima quality tag prefill toggle/override |
| `relay_url` | `string` | Configured Relay | Full relay URL with key | Optional per-request ComfyUI relay endpoint override |
| `response_format`| `string` | `"url"` | `"url"`, `"b64_json"` | Output format |
| `n` | `integer` | 1 | 1 | Images per generation request |

---

## 4. Aspect Ratio Reference Table

All sizes snap to the nearest comfortable ~1MP diffusion envelope:

| Ratio ID | Resolution | Use Case |
| :--- | :--- | :--- |
| `1:1` | `1024 x 1024` | Square social avatar, stickers, Discord |
| `16:9` | `1368 x 768` | Widescreen landscape, desktop wallpapers, cinematic scenes |
| `9:16` | `768 x 1368` | Mobile portrait wallpapers, TikTok/Reels stories |
| `4:3` | `1184 x 888` | Standard landscape illustration |
| `3:4` | `888 x 1184` | Standard portrait character poses |
| `3:2` | `1256 x 832` | Classic 35mm photo format |
| `2:3` | `840 x 1248` | Classic photo portrait |
| `21:9` | `1568 x 672` | Ultra-widescreen banner / banner art |

---

## 5. Ready-to-Run Code Examples

### cURL

#### Anima Base
```bash
curl -X POST "https://your-project.pages.dev/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anima",
    "prompt": "a magical cyber city skyline at dusk, neon lighting, anime style",
    "negative_prompt": "blurry, deformed, low quality, artifacts",
    "size": "16:9",
    "steps": 30,
    "cfg_scale": 4.0
  }'
```

#### Kroma (Photorealism)
```bash
curl -X POST "https://your-project.pages.dev/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kroma",
    "prompt": "vintage classic roadster parked along the Amalfi coast, realistic 35mm photography",
    "size": "16:9",
    "steps": 8,
    "upscale_steps": 4
  }'
```

#### Anima Sticker (Transparent Cutout)
```bash
curl -X POST "https://your-project.pages.dev/v1/images/generations" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sticker",
    "prompt": "cute chibi cat wearing a samurai helmet, happy expression",
    "negative_prompt": "blurry, low quality",
    "size": "1:1",
    "outline_width": 3,
    "outline_color": "#EC4899"
  }'
```

---

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-project.pages.dev/v1",
    api_key="not-needed"
)

# 1. Anima Base with negative prompt and steps
response = client.images.generate(
    model="anima",
    prompt="a girl in futuristic mechanized pilot suit, high tech cockpit",
    size="16:9",
    extra_body={
        "negative_prompt": "blurry, deformed hands, extra limbs, low quality",
        "steps": 30,
        "cfg_scale": 4.0
    }
)
print("Anima Image:", response.data[0].url)

# 2. Kroma (Krea-2) Photorealism (only positive prompt)
kroma_res = client.images.generate(
    model="kroma",
    prompt="close-up portrait of an elderly watchmaker working with precision tools, moody lighting",
    size="3:4",
    extra_body={
        "steps": 8,
        "upscale_steps": 4
    }
)
print("Kroma Image:", kroma_res.data[0].url)

# 3. Anima Sticker (transparent PNG with outline)
sticker_res = client.images.generate(
    model="sticker",
    prompt="cute chibi dragon hugging a crystal ball",
    size="1:1",
    extra_body={
        "outline_width": 4,
        "outline_color": "#FFFFFF"
    }
)
print("Sticker Image:", sticker_res.data[0].url)
```

---

### TypeScript / JavaScript (OpenAI SDK)

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://your-project.pages.dev/v1",
  apiKey: "not-needed",
});

async function run() {
  const image = await openai.images.generate({
    model: "anima",
    prompt: "fantasy knight standing in a crystalline cavern",
    size: "16:9",
    ...({
      negative_prompt: "blurry, bad anatomy, lowres",
      steps: 30,
      cfg_scale: 4.0,
    } as any),
  });

  console.log("Generated Image URL:", image.data?.[0]?.url);
}

run();
```

---

### Python (`requests`)

```python
import requests

url = "https://your-project.pages.dev/v1/images/generations"
payload = {
    "model": "anima",
    "prompt": "cyberpunk detective walking in the fog, neon reflections",
    "negative_prompt": "blurry, low quality, artifacts",
    "size": "16:9",
    "steps": 30,
    "cfg_scale": 4.0,
    "response_format": "url"
}

res = requests.post(url, json=payload)
data = res.json()
print("Image URL:", data["data"][0]["url"])
```

---

## 6. AI Agent System Prompt / Tool Instruction

You can paste the block below into system prompts for Claude, ChatGPT, Cursor, AutoGen, CrewAI, or LangChain to enable autonomous image generation:

```markdown
### Image Generation Tool Instructions
You have access to a self-hosted ComfyUI image generation API at:
POST https://your-project.pages.dev/v1/images/generations

Rules when creating payloads:
1. Model Selection:
   - For Anime / Stylized art: Use model "anima". Always include both a detailed "prompt" and a "negative_prompt" (e.g. "blurry, deformed, low quality").
   - For Photorealism / Real Photos: Use model "kroma". Provide a vivid photographic "prompt". Do NOT use negative_prompt (Kroma is a distilled CFG=1 model that ignores negative conditioning).
   - For Cutouts / Stickers: Use model "anima-sticker" (or "sticker"). Outputs transparent PNG. You may customize "outline_width" (integer px, default: 2; 0 for clean alpha borderless) and "outline_color" (hex string like "#FFFFFF").
2. Size & Ratio:
   - Always choose an appropriate "size" parameter: "1:1" for square/avatars/stickers, "16:9" for landscapes/scenes, "9:16" for vertical mobile wallpapers, "3:4" for portraits.
3. Steps & Controls:
   - For "anima", default steps is 30, cfg_scale is 4.0.
   - For "kroma", default steps is 8 (base pass), upscale_steps is 4.
```

---

## 7. Error Responses

Standard OpenAI error envelope format:

```json
{
  "error": {
    "message": "The model 'foo' does not exist. Available models: anima (or anima-base); kroma (or krea, krea2, krea-kroma); anima-sticker (or sticker, animasticker)",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

| HTTP Status | Error Code | Cause |
| :--- | :--- | :--- |
| `400` | `missing_required_parameter` | Missing `prompt` parameter |
| `400` | `model_not_found` | Invalid `model` specified |
| `400` | `invalid_value` | Out of range value for `size`, `steps`, `cfg_scale`, etc. |
| `503` | `not_configured` | `COMFY_RELAY_URL` secret is not configured on deployment |
| `504` | `timeout` | ComfyUI GPU queue did not finish generation within 240 seconds |
| `500` | `generation_failed` | ComfyUI execution failure or graph syntax error |
