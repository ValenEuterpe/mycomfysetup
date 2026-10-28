import { ComfyWorkflowGraph, ExtractedParameter } from "../types/workflow";
import { injectWorkflowParameters } from "./workflowInjector";
import { buildComfyUrl } from "./comfyClient";
import { DEFAULT_ENDPOINT } from "./storage";

/**
 * Generates a ready-to-run cURL command to submit the workflow.
 */
export function generateCurlCommand(
  endpoint: string,
  originalGraph: ComfyWorkflowGraph,
  parameters: ExtractedParameter[]
): string {
  const injected = injectWorkflowParameters(originalGraph, parameters);
  const targetUrl = buildComfyUrl(endpoint, "/prompt");
  const payload = JSON.stringify(
    {
      prompt: injected,
      client_id: "api_client_" + Math.random().toString(36).substring(2, 9),
    },
    null,
    2
  );

  return `curl -X POST "${targetUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${payload.replace(/'/g, "'\\''")}'`;
}

/**
 * Generates a clean TypeScript/JavaScript fetch script.
 */
export function generateTypeScriptCode(
  endpoint: string,
  originalGraph: ComfyWorkflowGraph,
  parameters: ExtractedParameter[]
): string {
  const injected = injectWorkflowParameters(originalGraph, parameters);
  const targetUrl = buildComfyUrl(endpoint, "/prompt");

  return `// TypeScript / JavaScript ComfyUI Submission Client
async function generateImage() {
  const endpoint = "${targetUrl}";
  const workflow = ${JSON.stringify(injected, null, 2)};

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: workflow,
      client_id: "client_" + Math.random().toString(36).substring(2, 9),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(\`ComfyUI error (\${response.status}): \${errorText}\`);
  }

  const result = await response.json();
  console.log("Queued successfully with prompt_id:", result.prompt_id);
  return result;
}

generateImage().catch(console.error);
`;
}

/**
 * Generates a clean Python requests script.
 */
export function generatePythonCode(
  endpoint: string,
  originalGraph: ComfyWorkflowGraph,
  parameters: ExtractedParameter[]
): string {
  const injected = injectWorkflowParameters(originalGraph, parameters);
  const targetUrl = buildComfyUrl(endpoint, "/prompt");

  return `# Python 3 ComfyUI Submission Script
import json
import uuid
import requests

ENDPOINT = "${targetUrl}"
WORKFLOW = ${JSON.stringify(injected, null, 2)}

def queue_prompt():
    payload = {
        "prompt": WORKFLOW,
        "client_id": str(uuid.uuid4())
    }
    
    headers = {"Content-Type": "application/json"}
    response = requests.post(ENDPOINT, json=payload, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Queued successfully: Prompt ID = {data.get('prompt_id')}")
        return data
    else:
        print(f"Error {response.status_code}: {response.text}")
        response.raise_for_status()

if __name__ == "__main__":
    queue_prompt()
`;
}

/**
 * Generates a dynamic JSON Schema describing all configurable inputs of this workflow.
 */
export function generateJsonSchema(parameters: ExtractedParameter[]): object {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const param of parameters) {
    let schemaType = "string";
    if (param.type === "number") schemaType = "number";
    if (param.type === "boolean") schemaType = "boolean";

    const propDef: Record<string, any> = {
      type: schemaType,
      title: param.label,
      description: `Input '${param.inputKey}' for node '${param.nodeTitle}' (${param.classType})`,
      default: param.defaultValue,
    };

    if (param.options && param.options.length > 0) {
      propDef.enum = param.options;
    }
    if (param.min !== undefined) propDef.minimum = param.min;
    if (param.max !== undefined) propDef.maximum = param.max;

    properties[param.id] = propDef;

    // Mark prompt and dimensions as recommended/required
    if (param.category === "prompt" && !param.isNegative) {
      required.push(param.id);
    }
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "ComfyUI Dynamic Workflow API Inputs",
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Generates an OpenAI-compatible /v1 usage guide (curl) targeting this
 * site's public API: GET /v1/models + POST /v1/images/generations.
 */
export function generateOpenAiV1Code(origin: string, endpoint?: string): string {
  const base = (origin.trim() || "https://your-site.pages.dev").replace(/\/+$/, "");
  const activeRelay = endpoint?.trim() || DEFAULT_ENDPOINT;

  return `# OpenAI-compatible Image API
# Endpoint: POST ${base}/v1/images/generations
# Configured Relay Endpoint: ${activeRelay}
# Documentation: ${base}/#/docs
# OpenAPI Spec: ${base}/v1/openapi.json
# Compatible with OpenAI SDK, Cursor, AutoGen, SillyTavern, and custom AI agents.

## 1) List available models & parameter schemas
curl "${base}/v1/models"

## 2) Generate with Anima Base (T2I)
curl -X POST "${base}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anima",
    "prompt": "a cozy classroom, warm sunlight, anime aesthetic",
    "negative_prompt": "blurry, low quality, deformed hands",
    "size": "16:9",
    "steps": 30,
    "cfg_scale": 4.0,
    "response_format": "url"
  }'

## 3) Generate with Kroma (Krea-2 Photorealism + 2x Upscale)
# Note: Kroma operates at CFG 1 and takes only positive prompts.
curl -X POST "${base}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "kroma",
    "prompt": "vintage classic roadster parked on a rainy city street, cinematic photo",
    "size": "16:9",
    "steps": 8,
    "upscale_steps": 4
  }'

## 4) Generate with Anima Sticker (Cutout + Outline Highlight)
curl -X POST "${base}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "sticker",
    "prompt": "cute magical anime chibi character holding a star wand",
    "negative_prompt": "blurry, low quality",
    "size": "1:1",
    "outline_width": 3,
    "outline_color": "#FFFFFF"
  }'

## Request Parameters Overview:
# {
#   "model":            "anima" | "kroma" (or "krea") | "anima-sticker" (or "sticker"),
#   "prompt":           "required text description",
#   "negative_prompt":  "optional (supported by 'anima' and 'anima-sticker'; ignored by 'kroma')",
#   "size":             "1024x1024" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9",
#   "steps":            "integer diffusion steps (1..150, default: 30 for anima, 8 for kroma)",
#   "cfg_scale":        "guidance scale (0.5..30.0, default: 4.0)",
#   "seed":             "integer seed for reproducible results",
#   "outline_width":    "integer outline thickness in px for stickers (default: 2, 0=clean alpha)",
#   "outline_color":    "hex color string for sticker outline (default: '#FFFFFF')",
#   "sensitivity":      "RMBG-2.0 matting sensitivity (0.1..5.0, default: 1.0)",
#   "prefill":          "true (default) applies Anima quality prefill tags; false to disable",
#   "response_format":  "url" (default) | "b64_json"
# }

## Python (OpenAI SDK) Example:
from openai import OpenAI

client = OpenAI(base_url="${base}/v1", api_key="not-needed")
img = client.images.generate(
    model="anima",
    prompt="night city skyline with glowing neon signs",
    size="16:9",
    extra_body={"negative_prompt": "blurry, low quality", "steps": 30, "cfg_scale": 4.0}
)
print("Result URL:", img.data[0].url)
`;
}

/**
 * Generates an OpenAPI 3.0 schema specification for this workflow.
 */
export function generateOpenApiSpec(
  endpoint: string,
  parameters: ExtractedParameter[]
): object {
  const jsonSchema = generateJsonSchema(parameters);
  const activeRelay = endpoint?.trim() || DEFAULT_ENDPOINT;

  return {
    openapi: "3.0.3",
    info: {
      title: "ComfyUI Dynamic Workflow API",
      version: "1.0.0",
      description: "Auto-generated OpenAPI specification for the loaded ComfyUI workflow.",
    },
    servers: [
      {
        url: activeRelay,
        description: "Configured ComfyUI Relay Server",
      },
    ],
    paths: {
      "/prompt": {
        post: {
          summary: "Queue Dynamic Workflow Generation",
          description: "Submits this ComfyUI workflow with dynamic parameter overrides.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: jsonSchema,
              },
            },
          },
          responses: {
            "200": {
              description: "Prompt accepted by ComfyUI",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      prompt_id: { type: "string" },
                      number: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
