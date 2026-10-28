import { onRequestGet as getModels } from "../functions/v1/models.ts";
import { onRequestGet as getModelDetail } from "../functions/v1/models/[model].ts";
import { onRequestPost as generateImage } from "../functions/v1/images/generations.ts";

const RELAY_URL = "https://comfy-relay.chaoticmindintheuniverse.workers.dev?key=1357911";

async function run() {
  console.log("=== 1. Testing GET /v1/models ===");
  const modelsRes = await getModels();
  console.log("Status:", modelsRes.status);
  const modelsData = await modelsRes.json();
  console.log("Models returned count:", modelsData.data?.length);
  for (const m of modelsData.data) {
    console.log(`- ID: ${m.id} | Name: ${m.display_name} | Aliases: ${m.aliases.join(", ")}`);
    console.log(`  Negative prompt supported: ${m.supports_negative_prompt} | Default steps: ${m.defaults.steps}`);
  }

  console.log("\n=== 2. Testing GET /v1/models/{model} ===");
  const detailRes = await getModelDetail({ params: { model: "krea" } });
  console.log("Alias 'krea' lookup status:", detailRes.status);
  const detailData = await detailRes.json();
  console.log("Resolved model:", detailData.id, "(Display:", detailData.display_name + ")");

  console.log("\n=== 3. Testing POST /v1/images/generations pipeline ===");
  console.log("Submitting test generation to relay:", RELAY_URL);

  const testPayload = {
    model: "anima",
    prompt: "a serene mountain lake at sunrise, anime style, highly detailed",
    negative_prompt: "blurry, low quality, artifacts",
    size: "1:1",
    steps: 20, // fast test
    cfg_scale: 4.0,
    seed: 42,
    relay_url: RELAY_URL,
    response_format: "url"
  };

  const request = new Request("http://localhost/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Url": RELAY_URL
    },
    body: JSON.stringify(testPayload),
  });

  const env = {
    COMFY_RELAY_URL: RELAY_URL
  };

  console.log("Sending prompt to generation pipeline...");
  const startTime = Date.now();
  const genRes = await generateImage({ request, env });
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Generation completed in ${duration}s with HTTP Status:`, genRes.status);

  const genData = await genRes.json();
  console.log("API Response payload:", JSON.stringify(genData, null, 2));

  if (genData.data && genData.data[0]?.url) {
    console.log("\nSUCCESS! Generated image URL:", genData.data[0].url);
  } else {
    console.error("\nFAILED! Error:", genData);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
