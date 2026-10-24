import assert from "node:assert";

// 1. Replicate Modular Prompt Builder
function buildModularSpritePrompt(
  characterAnchor,
  clothingLock,
  expressionAndPose,
  settingStyle = "clean plain neutral studio background, soft studio lighting, sharp focus, centered full body display"
) {
  return `masterpiece, best quality, score_9, score_8, safe, @silvana, Character Base: ${characterAnchor.trim()}\nClothing: ${clothingLock.trim()}\nPose & Hands: ${expressionAndPose.trim()}\nSetting & Style: ${settingStyle.trim()}`;
}

// 2. Replicate Modular Expressions Library
const MODULAR_EXPRESSION_LIBRARY = {
  shy: {
    prompt:
      "Standing timidly with shoulders turned slightly inward, both hands held in front at chest level with her two index fingers touching tip-to-tip in a hesitant, shy gesture; shy bashful expression with a subtle rosy blush and modest upward gaze, looking at viewer",
    handGestures: "two index fingers touching tip-to-tip",
  },
  angry: {
    prompt:
      "Standing aggressively with shoulders squared forward, both hands clenched into tight fists at sides; furious stern glare, furrowed eyebrows, clenched jaw, intense focused eyes, looking at viewer",
    handGestures: "both hands clenched into tight fists at sides",
  },
  happy: {
    prompt:
      "Standing cheerfully with relaxed shoulders, one hand raised near collarbone with fingers curled gently in a warm gesture; radiant warm smile, sparkling happy eyes, soft blush, looking at viewer",
    handGestures: "one hand raised near collarbone",
  },
  hands_on_hips: {
    prompt:
      "Standing with an assertive posture, both hands placed firmly on hips, elbows flared outward; determined confident expression, bright focused eyes, looking at viewer",
    handGestures: "both hands placed firmly on hips",
  },
};

// 3. Replicate Multi-Character CG Prompt Builder
function buildMultiCharacterCGPrompt(options) {
  const sanitizedInteraction = options.interaction
    .replace(/\b(on\s+the\s+left(\s+side)?|left\s+side|left-hand\s+side|on\s+the\s+right(\s+side)?|right\s+side|right-hand\s+side)\b/gi, "")
    .replace(/\b(character\s+[12]\s+on\s+the\s+(left|right)|side\s+[ab])\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const env =
    options.environmentAndLighting?.trim() ||
    "warm cinematic lighting, natural depth of field, detailed atmospheric environment";

  return `masterpiece, best quality, score_9, score_8, safe, @silvana, Character 1: ${options.char1.name}, ${options.char1.anchor.trim()}, wearing ${options.char1.clothing.trim()}.\nCharacter 2: ${options.char2.name}, ${options.char2.anchor.trim()}, wearing ${options.char2.clothing.trim()}.\nScene & Interaction: ${sanitizedInteraction}.\nSetting & Style: ${env}.`;
}

console.log("=== Testing Modular Anchor Consistency System ===");

// Test 1: Single-character consistency (Anchor and Clothing Lock must be identical word-for-word)
const anchor1 = "A 25-year-old East Asian woman, 5'6\" tall with a slim athletic build, sharp jawline, high cheekbones, dark almond-shaped eyes, and straight shoulder-length black hair with blunt bangs";
const clothingLock1 = "Over-sized beige knit sweater and dark blue high-waisted denim jeans";

const shyPrompt = buildModularSpritePrompt(anchor1, clothingLock1, MODULAR_EXPRESSION_LIBRARY.shy.prompt);
const angryPrompt = buildModularSpritePrompt(anchor1, clothingLock1, MODULAR_EXPRESSION_LIBRARY.angry.prompt);

console.log("\nShy Sprite Prompt:\n", shyPrompt);
console.log("\nAngry Sprite Prompt:\n", angryPrompt);

assert(shyPrompt.includes(anchor1), "Shy prompt MUST include identical character anchor");
assert(angryPrompt.includes(anchor1), "Angry prompt MUST include identical character anchor");
assert(shyPrompt.includes(clothingLock1), "Shy prompt MUST include identical clothing lock");
assert(angryPrompt.includes(clothingLock1), "Angry prompt MUST include identical clothing lock");

console.log("✓ Test 1 passed: Character Anchor and Clothing Lock remain 100% word-for-word identical!");

// Test 2: Hand gestures and "looking at viewer" in all expressions
for (const [key, expr] of Object.entries(MODULAR_EXPRESSION_LIBRARY)) {
  assert(expr.prompt.includes("looking at viewer"), `Expression ${key} must include 'looking at viewer'`);
  assert(expr.handGestures.length > 5, `Expression ${key} must specify concrete hand gestures`);
}
console.log("✓ Test 2 passed: All expressions enforce concrete hand gestures and 'looking at viewer'!");

// Test 3: Multi-character prompt token order and zero positional left/right labels
const charA = {
  name: "Mei",
  anchor: "A 25-year-old East Asian woman, 5'6\" tall with a slim athletic build, sharp jawline, high cheekbones, dark almond-shaped eyes, black hair with blunt bangs",
  clothing: "over-sized beige knit sweater and dark blue high-waisted denim jeans",
};

const charB = {
  name: "Elena",
  anchor: "A 24-year-old Caucasian woman, 5'8\" tall with a soft round face, light freckles, hazel eyes, wavy blonde hair in a low ponytail",
  clothing: "forest green corduroy jacket over white t-shirt and light gray fitted trousers",
};

const cgPrompt = buildMultiCharacterCGPrompt({
  char1: charA,
  char2: charB,
  interaction: "Mei on the left side and Elena on the right sitting opposite across a cafe table holding warm mugs",
  environmentAndLighting: "soft afternoon window light in a rustic coffee shop",
});

console.log("\nMulti-Character CG Prompt:\n", cgPrompt);

// Check token order: Character 1 must appear before Character 2
const indexChar1 = cgPrompt.indexOf("Character 1: Mei");
const indexChar2 = cgPrompt.indexOf("Character 2: Elena");
assert(indexChar1 !== -1 && indexChar2 !== -1, "Both characters must be present");
assert(indexChar1 < indexChar2, "Character 1 must strictly precede Character 2 in token order");

// Check positional words stripped
assert(!cgPrompt.toLowerCase().includes("on the left"), "Must strip 'on the left'");
assert(!cgPrompt.toLowerCase().includes("on the right"), "Must strip 'on the right'");
assert(cgPrompt.includes("sitting opposite across a cafe table holding warm mugs"), "Must retain collaborative interaction");

console.log("✓ Test 3 passed: Multi-character token order enforced and positional splitting terms eliminated!");

// Test 4: Preservation of youth terms (Family vacation / teen scenarios)
const familyAnchor = "A 16-year-old teen girl with shoulder-length brown hair, curious green eyes, casual summer shirt";
const familyPrompt = buildModularSpritePrompt(familyAnchor, "denim shorts, white sneakers", MODULAR_EXPRESSION_LIBRARY.happy.prompt);
assert(familyPrompt.includes("teen girl"), "Youth terms must NOT be stripped");
console.log("✓ Test 4 passed: Youth / family scenario terms successfully preserved!");

console.log("\nALL MODULAR CONSISTENCY UNIT TESTS PASSED!");
