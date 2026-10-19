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
