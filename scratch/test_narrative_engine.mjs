// Unit test for Narrative Engine prompt sanitization & dialogue expression mapping
import assert from "node:assert";

// 1. Test Expression Sanitizer
function sanitizeSceneExpressions(prompt, tone) {
  if (tone === "crisis") {
    return prompt;
  }

  return prompt
    .replace(/\b(shouting|screaming|yelling)\s+(at|towards)\b/gi, "talking to, looking at")
    .replace(/\bmouth\s+open\s+in\s+a\s+(silent\s+)?(scream|shout|gasp)\b/gi, "parted lips, serious expression")
    .replace(/\b(shouting|screaming|yelling|screaming\s+furiously)\b/gi, "talking, parted lips")
    .replace(/\beyes\s+wide\s+with\s+terror\b/gi, "serious focused expression")
    .replace(/\b(sobbing\s+hysterically|hysterical\s+crying)\b/gi, "worried expression, looking down");
}

console.log("=== Testing Expression Sanitizer ===");

// Test Case 1: Conversational scene with accidental yelling words from LLM
const badPrompt1 = "Mike: 1man, broad shoulders, wearing torn t-shirt, shouting at Anna with mouth open in a silent scream, pointing at trees; and Anna: 1woman, wide hips, listening, eyes wide with terror";
const cleaned1 = sanitizeSceneExpressions(badPrompt1, "survival_dialogue");
console.log("Input: ", badPrompt1);
console.log("Cleaned:", cleaned1);

assert(!cleaned1.includes("shouting at"), "Must not contain 'shouting at'");
assert(!cleaned1.includes("mouth open in a silent scream"), "Must not contain 'mouth open in a silent scream'");
assert(!cleaned1.includes("eyes wide with terror"), "Must not contain 'eyes wide with terror'");
assert(cleaned1.includes("talking to, looking at"), "Should replace with 'talking to, looking at'");
assert(cleaned1.includes("parted lips, serious expression"), "Should replace with 'parted lips, serious expression'");
console.log("✓ Test Case 1 passed: Accidental yelling sanitized to natural conversation!");

// Test Case 2: Crisis scene allows true disaster reactions
const crisisPrompt = "aircraft plunging down, eyes wide with terror, mouth open in a scream";
const crisisCleaned = sanitizeSceneExpressions(crisisPrompt, "crisis");
assert.strictEqual(crisisCleaned, crisisPrompt, "Crisis scenes should allow disaster reactions");
console.log("✓ Test Case 2 passed: Crisis tone preserves physical catastrophe reactions!");

// Test Case 3: Verify Danbooru composition tags
function getDanbooruGenderCountTag(characters) {
  if (characters.length === 0) return "scenery, no humans";
  const males = characters.filter((c) => c.gender === "male").length;
  const females = characters.filter((c) => c.gender === "female").length;

  if (characters.length === 2 && males === 1 && females === 1) {
    return "1boy and 1girl, 1boy, 1girl";
  }
  return "multiple people";
}

const tag = getDanbooruGenderCountTag([{ gender: "male" }, { gender: "female" }]);
assert.strictEqual(tag, "1boy and 1girl, 1boy, 1girl");
console.log("✓ Test Case 3 passed: Danbooru multi-subject tag verified!");

console.log("\nALL NARRATIVE ENGINE UNIT TESTS PASSED!");
