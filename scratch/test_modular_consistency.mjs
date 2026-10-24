import assert from "node:assert";
import {
  buildModularSpritePrompt,
  buildMultiCharacterCGPrompt,
  MODULAR_EXPRESSION_LIBRARY,
} from "../src/lib/visualNovelEngine.ts";

console.log("=== Testing Character Prompt Building & Expression Modules ===");

// 1. Verify User's Exact Examples
const sampleAnchor =
  "A 35-year-old woman, 168 cm tall, voluptuous curvy hourglass build with a full bust and wide hips, defined soft jawline, warm olive skin tone, dark hazel almond-shaped eyes, subtle laugh lines, and shoulder-length chestnut brown hair styled in soft waves with a neat side part";

const sampleClothing =
  "a tucked-in, long-sleeved silk button-up ivory blouse with mother-of-pearl buttons, paired with tailored high-waisted pleated beige wool trousers cinched with a slim brown leather belt";

const sampleSetting =
  "Photorealistic medium full-shot, warm ambient classroom lighting, shallow depth of field with a softly blurred chalkboard and wooden desk background";

// Test 1: Smirk / Playful module with user's example
const smirkPrompt = buildModularSpritePrompt(
  sampleAnchor,
  sampleClothing,
  MODULAR_EXPRESSION_LIBRARY.smirk.prompt,
  sampleSetting
);

console.log("\n--- Compiled Smirk / Playful Prompt ---");
console.log(smirkPrompt);

// Verify NO artificial labels exist
assert(!smirkPrompt.includes("Character Base:"), "Must NOT contain 'Character Base:' label");
assert(!smirkPrompt.includes("Clothing:"), "Must NOT contain 'Clothing:' label");
assert(!smirkPrompt.includes("Pose & Hands:"), "Must NOT contain 'Pose & Hands:' label");
assert(!smirkPrompt.includes("Setting & Style:"), "Must NOT contain 'Setting & Style:' label");

// Verify exact segments flow as natural prose
assert(smirkPrompt.includes(sampleAnchor), "Must contain exact Character Anchor");
assert(smirkPrompt.includes("Wearing a tucked-in, long-sleeved silk button-up ivory blouse"), "Must contain exact Clothing Lock with 'Wearing'");
assert(smirkPrompt.includes("Leaning sideways against the edge of a flat surface or desk"), "Must contain exact Smirk / Playful posture & hand mechanics");
assert(smirkPrompt.includes("looking directly into the camera at the viewer with an amused, confident challenge"), "Must contain exact camera-directed gaze");
assert(smirkPrompt.includes(sampleSetting), "Must contain exact Setting & Style");
console.log("✓ Test 1 passed: Smirk / Playful prompt compiles to natural flowing prose matching user's example!");

// Test 2: Laughing / Mirthful module with user's example
const laughingPrompt = buildModularSpritePrompt(
  sampleAnchor,
  sampleClothing,
  MODULAR_EXPRESSION_LIBRARY.laughing.prompt,
  sampleSetting
);

console.log("\n--- Compiled Laughing / Mirthful Prompt ---");
console.log(laughingPrompt);

assert(laughingPrompt.includes(sampleAnchor), "Must contain exact Character Anchor");
assert(laughingPrompt.includes("Wearing a tucked-in, long-sleeved silk button-up ivory blouse"), "Must contain exact Clothing Lock");
assert(laughingPrompt.includes("Mid-laugh with head tilted slightly back"), "Must contain exact Laughing / Mirthful posture");
assert(laughingPrompt.includes("one hand raised lightly to shield the open mouth while the other hand presses against the stomach"), "Must contain exact hand mechanics");
assert(laughingPrompt.includes("directing a joyful gaze directly forward into the camera at the viewer"), "Must contain exact gaze");
console.log("✓ Test 2 passed: Laughing / Mirthful prompt matches user's second example perfectly!");

// Test 3: Verify all 8 core plug-and-play modules from user's specification
const userModules = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "shy",
  "embarrassed",
  "smirk",
  "laughing",
];

for (const modId of userModules) {
  const mod = MODULAR_EXPRESSION_LIBRARY[modId];
  assert(mod, `Module ${modId} must exist`);
  assert(mod.prompt.length > 50, `Module ${modId} prompt must be substantive`);
  assert(
    mod.prompt.includes("looking directly forward into the camera at the viewer") ||
    mod.prompt.includes("staring intently straight into the camera at the viewer") ||
    mod.prompt.includes("looking slightly upward directly into the camera at the viewer") ||
    mod.prompt.includes("gazing directly into the camera at the viewer") ||
    mod.prompt.includes("looking directly into the camera at the viewer") ||
    mod.prompt.includes("directing a joyful gaze directly forward into the camera at the viewer"),
    `Module ${modId} must enforce direct gaze into the camera at the viewer`
  );
  assert(mod.handGestures.length > 5, `Module ${modId} must specify hand mechanics`);
  assert(mod.facialCue.length > 5, `Module ${modId} must specify facial expression`);
}
console.log("✓ Test 3 passed: All 8 user-specified plug-and-play modules verified with exact mechanics!");

// Test 4: Verify Multi-Character CG prompt building uses natural prose without headers
const charA = {
  name: "Mei",
  anchor: "A 25-year-old East Asian woman, 5'6\" tall with a slim athletic build, sharp jawline, high cheekbones, dark almond-shaped eyes, and straight shoulder-length black hair with blunt bangs",
  clothing: "an over-sized beige knit sweater and dark blue high-waisted denim jeans",
};

const charB = {
  name: "Elena",
  anchor: "A 24-year-old Caucasian woman, 5'8\" tall with a soft round face, light freckles across her nose, bright hazel round eyes, and wavy blonde shoulder-length hair tied in a loose low ponytail",
  clothing: "a forest green corduroy jacket over a simple white t-shirt and light gray fitted trousers",
};

const cgPrompt = buildMultiCharacterCGPrompt({
  char1: charA,
  char2: charB,
  interaction: "Medium shot of two women engaged in an intense argument on a city sidewalk while on the left side and right side",
  environmentAndLighting: "Photorealistic two-person cinematic scene, dramatic contrast lighting, overcast urban sidewalk background with natural depth of field",
});

console.log("\n--- Compiled Multi-Character CG Prompt ---");
console.log(cgPrompt);

assert(!cgPrompt.includes("Character 1:"), "Must NOT contain 'Character 1:' label");
assert(!cgPrompt.includes("Character 2:"), "Must NOT contain 'Character 2:' label");
assert(!cgPrompt.includes("Scene & Interaction:"), "Must NOT contain 'Scene & Interaction:' label");
assert(!cgPrompt.toLowerCase().includes("on the left"), "Must strip positional left words");
assert(!cgPrompt.toLowerCase().includes("right side"), "Must strip positional right words");
console.log("✓ Test 4 passed: Multi-character CG prompt compiles to natural flowing prose without artificial labels!");

console.log("\nALL PROMPT BUILDING & EXPRESSION MODULE TESTS PASSED!");
