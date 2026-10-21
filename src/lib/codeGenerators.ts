import { ComfyWorkflowGraph, ExtractedParameter } from "../types/workflow";
import { injectWorkflowParameters } from "./workflowInjector";
import { buildComfyUrl } from "./comfyClient";

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
export function generateOpenAiV1Code(origin: string): string {
  const base = (origin.trim() || "https://your-site.pages.dev").replace(/\/+$/, "");

  return `# OpenAI-compatible Image API
# Endpoint: POST ${base}/v1/images/generations
# Compatible with SillyTavern, TavoAI and any OpenAI SDK image client.

## 1) List available models
curl "${base}/v1/models"

## 2) Generate an image (waits synchronously for completion)
curl -X POST "${base}/v1/images/generations" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anima",
    "prompt": "a cozy classroom, warm sunlight",
    "size": "1024x1024",
    "response_format": "url"
  }'

## Request parameters
{
  "model":            "anima" (default) | "kroma",
  "prompt":           "required — '|' or '||' separates a negative prompt",
  "negative_prompt":  "optional — defaults to the workflow's own negative",
  "size":             "1024x1024" | "1792x1024" | "1024x1792" | "16:9"
                      (snapped to the workflow's nearest supported ratio),
  "response_format":  "url" (default, link to the finished image)
                      | "b64_json" (inline image data),
  "seed":             "optional integer for reproducible results",
  "n":                "must be 1 (one image per request)",
  "prefill":          "true (default) applies the workflow quality prefill; false to disable"
}

## Response (url format)
{
  "created": 1710000000,
  "data": [{ "url": "https://<relay>/view?filename=...&subfolder=&type=output" }]
}

## Python (OpenAI SDK)
from openai import OpenAI
client = OpenAI(base_url="${base}/v1", api_key="not-needed")
img = client.images.generate(model="anima", prompt="night city skyline", size="1024x1024")
print(img.data[0].url)
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

  return {
    openapi: "3.0.3",
    info: {
      title: "ComfyUI Dynamic Workflow API",
      version: "1.0.0",
      description: "Auto-generated OpenAPI specification for the loaded ComfyUI workflow.",
    },
    servers: [
      {
        url: endpoint.trim() || "https://comfy-relay.example.com",
        description: "ComfyUI Relay Server",
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
