import { onRequestPost as generateImage } from "../functions/v1/images/generations.ts";

const RELAY_URL = "https://comfy-relay.chaoticmindintheuniverse.workers.dev?key=1357911";

async function testKromaAndSticker() {
  const env = { COMFY_RELAY_URL: RELAY_URL };

  console.log("=== Testing Kroma (alias: 'krea') ===");
  const kromaReq = new Request("http://localhost/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "krea",
      prompt: "a sleek black sports car parked on a mountain road at dusk",
      negative_prompt: "should be ignored gracefully",
      size: "16:9",
      steps: 8,
      upscale_steps: 4,
      relay_url: RELAY_URL,
    }),
  });

  const kromaStart = Date.now();
  const kromaRes = await generateImage({ request: kromaReq, env });
  const kromaDur = ((Date.now() - kromaStart) / 1000).toFixed(1);
  const kromaData = await kromaRes.json();
  console.log(`Kroma completed in ${kromaDur}s. Status: ${kromaRes.status}`);
  console.log("Kroma Output URL:", kromaData.data?.[0]?.url);

  console.log("\n=== Testing Anima Sticker (alias: 'sticker') ===");
  const stickerReq = new Request("http://localhost/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sticker",
      prompt: "cute chibi wizard kitten with glowing eyes",
      negative_prompt: "blurry, low quality",
      size: "1:1",
      outline_width: 3,
      outline_color: "#EC4899",
      steps: 20,
      relay_url: RELAY_URL,
    }),
  });

  const stickerStart = Date.now();
  const stickerRes = await generateImage({ request: stickerReq, env });
  const stickerDur = ((Date.now() - stickerStart) / 1000).toFixed(1);
  const stickerData = await stickerRes.json();
  console.log(`Sticker completed in ${stickerDur}s. Status: ${stickerRes.status}`);
  console.log("Sticker Output URL:", stickerData.data?.[0]?.url);
}

testKromaAndSticker().catch(console.error);
