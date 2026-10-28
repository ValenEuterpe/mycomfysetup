import assert from "node:assert";
import {
  getWorkflow,
  listWorkflows,
  buildInjectedWorkflow,
  ANIMA_PREFILL,
  ANIMA_NEGATIVE,
} from "../functions/lib/workflows.ts";

console.log("=== Testing API Workflow Registry & Parameter Injection ===");

// 1. Test getWorkflow and Aliases
const anima = getWorkflow("anima");
assert(anima, "Model 'anima' should be found");
assert.strictEqual(anima.id, "anima");

const animaAlias = getWorkflow("anima-base");
assert(animaAlias, "Alias 'anima-base' should resolve to 'anima'");
assert.strictEqual(animaAlias.id, "anima");

const kroma = getWorkflow("kroma");
assert(kroma, "Model 'kroma' should be found");
assert.strictEqual(kroma.id, "kroma");

const krea = getWorkflow("krea");
assert(krea, "Alias 'krea' should resolve to 'kroma'");
assert.strictEqual(krea.id, "kroma");

const sticker = getWorkflow("sticker");
assert(sticker, "Alias 'sticker' should resolve to 'anima-sticker'");
assert.strictEqual(sticker.id, "anima-sticker");

const missing = getWorkflow("nonexistent-model");
assert.strictEqual(missing, undefined, "Non-existent model should return undefined");
console.log("✓ Model lookup and alias resolution passed.");

// 2. Test listWorkflows
const allWorkflows = listWorkflows();
assert.strictEqual(allWorkflows.length, 3, "Expected 3 registered workflows");
const ids = allWorkflows.map((w) => w.id);
assert(ids.includes("anima"), "Must contain anima");
assert(ids.includes("kroma"), "Must contain kroma");
assert(ids.includes("anima-sticker"), "Must contain anima-sticker");
console.log("✓ listWorkflows catalog passed:", ids);

// 3. Test buildInjectedWorkflow for Anima
const animaInjected = buildInjectedWorkflow(anima, {
  positive: "cyberpunk cat",
  negative: "ugly, blurry",
  prefill: true,
  seed: "999888",
  width: 1368,
  height: 768,
  steps: 42,
  cfg: 6.5,
  sampler_name: "euler",
  scheduler: "karras",
  denoise: 0.9,
});

assert(
  animaInjected["3"].inputs.text.includes(ANIMA_PREFILL) &&
    animaInjected["3"].inputs.text.includes("cyberpunk cat"),
  "Anima positive prompt must contain prefill + user prompt"
);
assert.strictEqual(
  animaInjected["4"].inputs.text,
  "ugly, blurry",
  "Anima negative prompt must match injected negative"
);
assert.strictEqual(animaInjected["8"].inputs.steps, 42, "Anima steps must be 42");
assert.strictEqual(animaInjected["8"].inputs.cfg, 6.5, "Anima CFG must be 6.5");
assert.strictEqual(animaInjected["8"].inputs.sampler_name, "euler", "Sampler must be euler");
assert.strictEqual(animaInjected["8"].inputs.scheduler, "karras", "Scheduler must be karras");
assert.strictEqual(animaInjected["8"].inputs.denoise, 0.9, "Denoise must be 0.9");
assert.strictEqual(animaInjected["8"].inputs.seed, "999888", "Seed must be 999888");
assert.strictEqual(animaInjected["6"].inputs.width, 1368, "Width must be 1368");
assert.strictEqual(animaInjected["6"].inputs.height, 768, "Height must be 768");
console.log("✓ Anima parameter injection verified.");

// 4. Test buildInjectedWorkflow for Kroma
const kromaInjected = buildInjectedWorkflow(kroma, {
  positive: "vintage red ferrari on coast",
  negative: "should be ignored by kroma",
  seed: "12345",
  width: 1024,
  height: 1024,
  steps: 12,
  upscale_steps: 6,
  upscale_denoise: 0.25,
  scale_by: 3.0,
});

assert.strictEqual(
  kromaInjected["6"].inputs.text,
  "vintage red ferrari on coast",
  "Kroma positive prompt must match"
);
assert.strictEqual(kromaInjected["9"].inputs.steps, 12, "Kroma base steps must be 12");
assert.strictEqual(kromaInjected["26"].inputs.steps, 6, "Kroma upscale steps must be 6");
assert.strictEqual(kromaInjected["26"].inputs.denoise, 0.25, "Kroma upscale denoise must be 0.25");
assert.strictEqual(kromaInjected["29"].inputs.scale_by, 3.0, "Kroma scale_by must be 3.0");
assert.strictEqual(kromaInjected["30"].inputs.seed, "12345", "Kroma seed must be 12345");
assert.strictEqual(kromaInjected["23"].inputs.width, 1024, "Kroma width must be 1024");
assert.strictEqual(kromaInjected["23"].inputs.height, 1024, "Kroma height must be 1024");
console.log("✓ Kroma parameter injection (only positive prompt, upscale parameters) verified.");

// 5. Test buildInjectedWorkflow for Anima Sticker
const stickerInjected = buildInjectedWorkflow(sticker, {
  positive: "chibi wizard",
  negative: "blurry",
  seed: "777",
  width: 888,
  height: 1184,
  steps: 25,
  cfg: 5.0,
  outline_width: 8,
  outline_color: "#EC4899",
  sensitivity: 2.5,
});

assert(
  stickerInjected["2"].inputs.text.includes("chibi wizard"),
  "Sticker positive prompt must match"
);
assert.strictEqual(
  stickerInjected["4"].inputs.text,
  "blurry",
  "Sticker negative prompt must match"
);
assert.strictEqual(stickerInjected["6"].inputs.steps, 25, "Sticker steps must be 25");
assert.strictEqual(stickerInjected["6"].inputs.cfg, 5.0, "Sticker CFG must be 5.0");
assert.strictEqual(stickerInjected["13"].inputs.width, 8, "Sticker outline thickness must be 8");
assert.strictEqual(stickerInjected["13"].inputs.color, "#EC4899", "Sticker outline color must be #EC4899");
assert.strictEqual(stickerInjected["12"].inputs.sensitivity, 2.5, "RMBG sensitivity must be 2.5");
assert.strictEqual(stickerInjected["7"].inputs.width, 888, "Sticker width must be 888");
assert.strictEqual(stickerInjected["7"].inputs.height, 1184, "Sticker height must be 1184");
console.log("✓ Anima Sticker parameter injection (outline width, outline color, sensitivity) verified.");

console.log("\nALL API WORKFLOW TESTS PASSED SUCCESSFULLY! 🎉");
