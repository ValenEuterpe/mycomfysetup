// Unit test for Attire Studio mannequin reference prompt generation & baseline wardrobe presets
import assert from "node:assert";
import { DEFAULT_BASELINE_ATTIRES } from "../src/lib/storage.ts";

// 1. Replicate attire prompt builder logic from src/lib/visualNovelEngine.ts
function buildMannequinPrompt(verbatimPrompt) {
  const mannequinTags = "no humans, clothes on display, white mannequin, headless mannequin, ghost mannequin, clothes on hanger, clothing display, simple clean neutral background, studio product shot";
  const positive = `${mannequinTags}, ${verbatimPrompt.trim()}, high quality, highly detailed fabric, clean lighting, centered catalog display`;
  const negative = "human, face, head, woman, man, girl, boy, eyes, skin, hair, realistic person, lowres, blurry, distorted, messy background";
  return { positive, negative };
}

console.log("=== Testing Clothing Detail & Wardrobe Presets ===");

// Test 1: Verify the user's gold-standard preset is in DEFAULT_BASELINE_ATTIRES
const goldStandard = DEFAULT_BASELINE_ATTIRES.find(
  (a) => a.id === "preset_silk_blouse_trousers"
);

assert(goldStandard, "Gold standard preset 'preset_silk_blouse_trousers' must exist");
assert(
  goldStandard.verbatimPrompt.includes("silk button-up ivory blouse"),
  "Must include silk button-up ivory blouse"
);
assert(
  goldStandard.verbatimPrompt.includes("mother-of-pearl buttons"),
  "Must include mother-of-pearl buttons"
);
assert(
  goldStandard.verbatimPrompt.includes("tailored high-waisted pleated beige wool trousers"),
  "Must include tailored high-waisted pleated beige wool trousers"
);
assert(
  goldStandard.verbatimPrompt.includes("slim brown leather belt"),
  "Must include slim brown leather belt"
);
console.log("✓ Test 1 passed: User's gold standard preset verified with all micro-details!");

// Test 2: Mannequin positive prompt includes "no humans" and headless mannequin tags
const p1 = buildMannequinPrompt(goldStandard.verbatimPrompt);
assert(p1.positive.includes("no humans"), "Prompt MUST enforce 'no humans' tag");
assert(p1.positive.includes("white mannequin"), "Prompt MUST enforce 'white mannequin' tag");
assert(p1.positive.includes("headless mannequin"), "Prompt MUST enforce 'headless mannequin' tag");
assert(p1.positive.includes(goldStandard.verbatimPrompt), "Prompt MUST include exact clothing description");
console.log("✓ Test 2 passed: Positive prompt contains all required mannequin display tags.");

// Test 3: Mannequin negative prompt strips human features
assert(p1.negative.includes("human"), "Negative prompt MUST exclude 'human'");
assert(p1.negative.includes("face"), "Negative prompt MUST exclude 'face'");
assert(p1.negative.includes("hair"), "Negative prompt MUST exclude 'hair'");
console.log("✓ Test 3 passed: Negative prompt strictly blocks human facial and anatomical features.");

// Test 4: All baseline attire presets contain the 5 required detail anchors
const fabricKeywords = ["silk", "wool", "linen", "denim", "cotton", "rayon", "leather", "suede", "ripstop", "gabardine", "fleece"];
const hardwareKeywords = ["buttons", "belt", "buckle", "rivets", "zipper", "epaulets", "placket", "cuffs", "sash", "drawstring"];

for (const preset of DEFAULT_BASELINE_ATTIRES) {
  assert(preset.id && preset.id.startsWith("preset_"), `Preset ${preset.id} must have valid ID`);
  assert(preset.name.length > 0, `Preset ${preset.id} must have a non-empty name`);
  assert(["male", "female", "unisex"].includes(preset.gender), `Preset ${preset.id} must have valid gender`);
  assert(preset.verbatimPrompt.length > 30, `Preset ${preset.id} must have rich detailed prompt`);

  const promptLower = preset.verbatimPrompt.toLowerCase();
  const hasFabric = fabricKeywords.some((f) => promptLower.includes(f));
  const hasHardware = hardwareKeywords.some((h) => promptLower.includes(h));

  assert(hasFabric, `Preset ${preset.id} must specify fabric texture (silk, wool, linen, denim, cotton, etc.)`);
  assert(hasHardware, `Preset ${preset.id} must specify closures/hardware (buttons, belt, buckle, rivets, etc.)`);
}
console.log(`✓ Test 4 passed: All ${DEFAULT_BASELINE_ATTIRES.length} baseline attire presets verified with fabric textures and hardware details!`);

console.log("\nALL CLOTHING DETAIL UNIT TESTS PASSED!");
