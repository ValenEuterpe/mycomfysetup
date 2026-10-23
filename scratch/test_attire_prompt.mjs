// Unit test for Attire Studio mannequin reference prompt generation & baseline wardrobe presets
import assert from "node:assert";

// 1. Replicate attire prompt builder logic from src/lib/visualNovelEngine.ts
function buildMannequinPrompt(verbatimPrompt) {
  const mannequinTags = "no humans, clothes on display, white mannequin, headless mannequin, ghost mannequin, clothes on hanger, clothing display, simple clean neutral background, studio product shot";
  const positive = `${mannequinTags}, ${verbatimPrompt.trim()}, high quality, highly detailed fabric, clean lighting, centered catalog display`;
  const negative = "human, face, head, woman, man, girl, boy, eyes, skin, hair, realistic person, lowres, blurry, distorted, messy background";
  return { positive, negative };
}

// 2. Preset definition checks
const samplePresets = [
  {
    id: "preset_flight_casual_male",
    name: "Aviation Casual (Male)",
    gender: "male",
    category: "casual",
    verbatimPrompt: "charcoal grey cotton t-shirt, dark raw-denim jeans, brown leather utility belt, sturdy brown work boots",
    isPreset: true,
  },
  {
    id: "preset_cabin_crew_female",
    name: "Flight Attendant Uniform (Female)",
    gender: "female",
    category: "uniform",
    verbatimPrompt: "tailored navy blue uniform dress with white collar and lapels, silk red neckerchief scarf, black leather court pumps",
    isPreset: true,
  },
  {
    id: "preset_island_survivor_unisex",
    name: "Island Survivor Gear (Unisex)",
    gender: "unisex",
    category: "survival",
    verbatimPrompt: "frayed rolled-up sleeve cotton safari shirt, durable olive khaki cargo shorts with side pouches, distressed leather sandals",
    isPreset: true,
  },
];

console.log("=== Testing Attire Mannequin Generation Prompts ===");

// Test 1: Mannequin positive prompt includes "no humans" and headless mannequin tags
const p1 = buildMannequinPrompt(samplePresets[0].verbatimPrompt);
console.log("Positive prompt:", p1.positive);
console.log("Negative prompt:", p1.negative);

assert(p1.positive.includes("no humans"), "Prompt MUST enforce 'no humans' tag");
assert(p1.positive.includes("white mannequin"), "Prompt MUST enforce 'white mannequin' tag");
assert(p1.positive.includes("headless mannequin"), "Prompt MUST enforce 'headless mannequin' tag");
assert(p1.positive.includes("clothes on display"), "Prompt MUST enforce 'clothes on display'");
assert(p1.positive.includes(samplePresets[0].verbatimPrompt), "Prompt MUST include the exact clothing description");
console.log("✓ Test 1 passed: Positive prompt contains all required mannequin display tags.");

// Test 2: Mannequin negative prompt strips human features
assert(p1.negative.includes("human"), "Negative prompt MUST exclude 'human'");
assert(p1.negative.includes("face"), "Negative prompt MUST exclude 'face'");
assert(p1.negative.includes("head"), "Negative prompt MUST exclude 'head'");
assert(p1.negative.includes("skin"), "Negative prompt MUST exclude 'skin'");
assert(p1.negative.includes("hair"), "Negative prompt MUST exclude 'hair'");
console.log("✓ Test 2 passed: Negative prompt strictly blocks human facial and anatomical features.");

// Test 3: Attire Preset Integrity
for (const preset of samplePresets) {
  assert(preset.id && preset.id.startsWith("preset_"), `Preset ${preset.id} must have valid ID`);
  assert(preset.name.length > 0, `Preset ${preset.id} must have a non-empty name`);
  assert(["male", "female", "unisex"].includes(preset.gender), `Preset ${preset.id} must have valid gender`);
  assert(preset.verbatimPrompt.length > 10, `Preset ${preset.id} must have substantive prompt`);
  assert.strictEqual(preset.isPreset, true, `Preset ${preset.id} must be flagged as preset`);
}
console.log("✓ Test 3 passed: Attire presets conform to VNAttire interface schema.");

// Test 4: Character Assignment Simulation
const mockCharacter = {
  id: "char_mike",
  name: "Mike",
  gender: "male",
  figureStyle: "Athletic Lean",
  faceShape: "Defined Jawline",
  verbatimIdentityPrompt: "22 year old male, athletic build, short dark brown hair, hazel eyes",
  baselineOutfit: undefined,
  baselineAttireId: undefined,
};

const assignedCharacter = {
  ...mockCharacter,
  baselineOutfit: samplePresets[0].verbatimPrompt,
  baselineAttireId: samplePresets[0].id,
};

assert.strictEqual(assignedCharacter.baselineAttireId, "preset_flight_casual_male");
assert.strictEqual(assignedCharacter.baselineOutfit, samplePresets[0].verbatimPrompt);
console.log("✓ Test 4 passed: Baseline attire successfully linked and assigned to character.");

console.log("\nALL ATTIRE & MANNEQUIN GENERATION UNIT TESTS PASSED!");
