const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

export const onRequestOptions = async (): Promise<Response> =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const buildOpenApiSpec = (origin: string) => {
  const base = (origin || "https://your-site.pages.dev").replace(/\/+$/, "");

  return {
    openapi: "3.1.0",
    info: {
      title: "Universal ComfyUI Image Generation API",
      version: "1.0.0",
      description:
        "OpenAI-compatible text-to-image API powering Anima, Kroma (Krea-2), and Anima Sticker cutout generation directly from ComfyUI.",
    },
    servers: [
      {
        url: `${base}`,
        description: "Current Deployment Server",
      },
    ],
    paths: {
      "/v1/models": {
        get: {
          summary: "List Models",
          description: "Returns all supported image generation models and their capabilities.",
          responses: {
            "200": {
              description: "List of available models",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      object: { type: "string", example: "list" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Model" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/v1/models/{model}": {
        get: {
          summary: "Get Model Details",
          description: "Returns details and parameter schemas for a specific model (or alias).",
          parameters: [
            {
              name: "model",
              in: "path",
              required: true,
              schema: { type: "string", example: "anima" },
              description: "Model id or alias (e.g. 'anima', 'kroma', 'krea', 'sticker')",
            },
          ],
          responses: {
            "200": {
              description: "Model schema and capabilities",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Model" },
                },
              },
            },
            "404": {
              description: "Model not found",
            },
          },
        },
      },
      "/v1/images/generations": {
        post: {
          summary: "Generate Image",
          description:
            "Creates an image using the selected model. Compatible with OpenAI SDK `images.generate()`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ImageGenerationRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Successful generation",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ImageGenerationResponse" },
                },
              },
            },
            "400": { description: "Invalid parameters or model not found" },
            "500": { description: "Generation pipeline failed" },
            "504": { description: "Generation timed out" },
          },
        },
      },
    },
    components: {
      schemas: {
        Model: {
          type: "object",
          properties: {
            id: { type: "string", example: "anima" },
            aliases: { type: "array", items: { type: "string" }, example: ["anima-base"] },
            object: { type: "string", example: "model" },
            created: { type: "integer", example: 1710000000 },
            owned_by: { type: "string", example: "localImageGen" },
            display_name: { type: "string", example: "Anima Base (T2I)" },
            description: { type: "string" },
            supports_negative_prompt: { type: "boolean", example: true },
            supports_prefill: { type: "boolean", example: true },
            supports_size: { type: "boolean", example: true },
            defaults: {
              type: "object",
              properties: {
                steps: { type: "integer", example: 30 },
                cfg_scale: { type: "number", example: 4.0 },
                sampler: { type: "string", example: "er_sde" },
                scheduler: { type: "string", example: "simple" },
              },
            },
            supported_aspect_ratios: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ratio: { type: "string", example: "16:9" },
                  label: { type: "string", example: "Widescreen" },
                  width: { type: "integer", example: 1368 },
                  height: { type: "integer", example: 768 },
                },
              },
            },
          },
        },
        ImageGenerationRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            model: {
              type: "string",
              default: "anima",
              enum: ["anima", "kroma", "anima-sticker", "krea", "sticker"],
              description: "The model ID or alias to use for generation.",
            },
            prompt: {
              type: "string",
              description: "The positive description of the desired image. (For Anima, '|' can also separate negative prompt).",
            },
            negative_prompt: {
              type: "string",
              description: "Unwanted elements/styles (supported by 'anima' and 'anima-sticker'; ignored on 'kroma').",
            },
            size: {
              type: "string",
              default: "1024x1024",
              description: "Resolution or aspect ratio: '1024x1024', '16:9', '9:16', '4:3', '3:4', '21:9', etc.",
            },
            steps: {
              type: "integer",
              minimum: 1,
              maximum: 150,
              description: "Diffusion denoising steps (default: 30 for Anima/Sticker, 8 for Kroma base pass).",
            },
            cfg_scale: {
              type: "number",
              minimum: 0.5,
              maximum: 30.0,
              description: "Prompt guidance scale (default: 4.0 for Anima/Sticker; Kroma uses 1.0 distilled).",
            },
            sampler_name: {
              type: "string",
              description: "KSampler algorithm ('er_sde', 'euler', 'dpmpp_2m_sde', etc.).",
            },
            scheduler: {
              type: "string",
              description: "Noise schedule algorithm ('simple', 'karras', 'beta', etc.).",
            },
            seed: {
              type: "integer",
              minimum: 0,
              description: "Optional deterministic seed.",
            },
            outline_width: {
              type: "integer",
              minimum: 0,
              maximum: 50,
              default: 2,
              description: "For 'anima-sticker': sticker outline thickness in pixels. 0 produces clean transparent cutout.",
            },
            outline_color: {
              type: "string",
              default: "#FFFFFF",
              description: "For 'anima-sticker': sticker outline hex color code (e.g. '#FFFFFF', '#EC4899').",
            },
            sensitivity: {
              type: "number",
              minimum: 0.1,
              maximum: 5.0,
              default: 1.0,
              description: "For 'anima-sticker': RMBG-2.0 background removal sensitivity.",
            },
            upscale_steps: {
              type: "integer",
              default: 4,
              description: "For 'kroma': steps in the secondary upscale refinement pass.",
            },
            upscale_denoise: {
              type: "number",
              default: 0.14,
              description: "For 'kroma': denoising factor in upscale pass.",
            },
            scale_by: {
              type: "number",
              default: 2.0,
              description: "For 'kroma': upscale scaling factor.",
            },
            prefill: {
              type: "boolean",
              default: true,
              description: "For Anima models: whether to prepend quality prefill tags automatically.",
            },
            response_format: {
              type: "string",
              enum: ["url", "b64_json"],
              default: "url",
              description: "Format in which the generated images are returned.",
            },
            n: {
              type: "integer",
              default: 1,
              enum: [1],
              description: "Number of images to generate (must be 1).",
            },
          },
        },
        ImageGenerationResponse: {
          type: "object",
          properties: {
            created: { type: "integer", example: 1710000000 },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  url: { type: "string", format: "uri" },
                  b64_json: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
};

export const onRequestGet = async (context: { request: Request }): Promise<Response> => {
  const url = new URL(context.request.url);
  const spec = buildOpenApiSpec(url.origin);

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      ...CORS_HEADERS,
    },
  });
};
