import {
  extractBatchPayload,
  resolvePromptTemplate,
  resolveBatch,
} from "../functions/lib/promptTemplate.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log("--- Starting Batch Prompt Template Tests ---\n");

// 1. User's exact test case
const userPayload = {
  characters: {
    Lisa: "a woman of 35 years old with freckles",
    Mia: "a girl of 28 blonde",
  },
  locations: {
    kitchen: "a kitchen with red curtains and wooden table",
  },
  prompts: ["Lisa slapping Mia in the kitchen."],
};

const batchResult = resolveBatch(userPayload);
assert(batchResult.total === 1, "Batch should have 1 prompt");

const resolvedPrompt = batchResult.resolvedPrompts[0];
console.log("Original prompt: ", userPayload.prompts[0]);
console.log("Resolved prompt: ", resolvedPrompt);

assert(
  resolvedPrompt ===
    "a woman of 35 years old with freckles slapping a girl of 28 blonde in a kitchen with red curtains and wooden table.",
  "Names and locations should be completely substituted without leaving names behind"
);

assert(!/\bLisa\b/i.test(resolvedPrompt), "Name 'Lisa' must not stay in prompt");
assert(!/\bMia\b/i.test(resolvedPrompt), "Name 'Mia' must not stay in prompt");

// 2. Word boundary test
const wordBoundaryPayload = {
  characters: {
    Lisa: "a woman of 35",
    Mia: "a girl of 28",
  },
  prompts: ["Elisabeth and Mia are traveling to Miami with Lisa."],
};
const wbResult = resolveBatch(wordBoundaryPayload);
console.log("Word boundary result: ", wbResult.resolvedPrompts[0]);
assert(
  wbResult.resolvedPrompts[0] ===
    "Elisabeth and a girl of 28 are traveling to Miami with a woman of 35.",
  "Elisabeth and Miami should not be corrupted by Lisa and Mia"
);

// 3. Substring collision (longest key first)
const collisionPayload = {
  characters: {
    Lisa: "older Lisa",
    "Lisa Marie": "Lisa Marie Presley lookalike",
  },
  prompts: ["Lisa Marie talking to Lisa."],
};
const collResult = resolveBatch(collisionPayload);
console.log("Longest-key-first result: ", collResult.resolvedPrompts[0]);
assert(
  collResult.resolvedPrompts[0] ===
    "Lisa Marie Presley lookalike talking to older Lisa.",
  "Longest key 'Lisa Marie' must match before 'Lisa'"
);

// 4. Extracting from JSON with code fences
const fencedJson = `\`\`\`json
{
  "characters": {
    "John": "a tall muscular detective in a trench coat"
  },
  "prompts": [
    "John investigating the crime scene at night",
    "John drinking whisky in a dimly lit bar"
  ]
}
\`\`\``;

const parsedFenced = extractBatchPayload(fencedJson);
assert(parsedFenced.payload !== null, "Should parse fenced JSON block");
assert(parsedFenced.payload?.prompts.length === 2, "Should extract 2 prompts");

const resolvedFenced = resolveBatch(parsedFenced.payload!);
assert(
  resolvedFenced.resolvedPrompts[0] ===
    "a tall muscular detective in a trench coat investigating the crime scene at night",
  "Should substitute John with detective description"
);

// 5. Truncated JSON detection
const truncatedJson = `{"characters": {"Lisa": "a woman of 35"}, "prompts": ["Lisa walking`;
const parsedTruncated = extractBatchPayload(truncatedJson);
assert(
  parsedTruncated.payload === null,
  "Truncated JSON payload should be null"
);
assert(
  parsedTruncated.isTruncatedOrMalformed === true,
  "Truncated JSON should be flagged as isTruncatedOrMalformed"
);

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
