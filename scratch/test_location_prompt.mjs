import { buildModularLocationPrompt } from "../src/lib/visualNovelEngine.ts";
import { DEFAULT_WORLDS } from "../src/lib/storage.ts";

console.log("=== Testing Modular Location Consistency Pipeline ===\n");

const beachLoc = DEFAULT_WORLDS[0].locations.find((l) => l.id === "loc_sandy_beach");
const cliffLoc = DEFAULT_WORLDS[0].locations.find((l) => l.id === "loc_cliff_overlook");

console.log("1. Testing Sandy Beach (Rustic Bamboo Shelter) across Day, Evening, Night:");

const dayBeach = buildModularLocationPrompt({
  locationPrompt: beachLoc.prompt,
  structuralAnchor: beachLoc.structuralAnchor,
  landmarkAnchor: beachLoc.landmarkAnchor,
  vantagePoint: beachLoc.vantagePoint,
  isInterior: beachLoc.isInterior,
  timeOfDay: "day",
});

const eveningBeach = buildModularLocationPrompt({
  locationPrompt: beachLoc.prompt,
  structuralAnchor: beachLoc.structuralAnchor,
  landmarkAnchor: beachLoc.landmarkAnchor,
  vantagePoint: beachLoc.vantagePoint,
  isInterior: beachLoc.isInterior,
  timeOfDay: "evening",
});

const nightBeach = buildModularLocationPrompt({
  locationPrompt: beachLoc.prompt,
  structuralAnchor: beachLoc.structuralAnchor,
  landmarkAnchor: beachLoc.landmarkAnchor,
  vantagePoint: beachLoc.vantagePoint,
  isInterior: beachLoc.isInterior,
  timeOfDay: "night",
});

console.log("\n[Daytime Beach Positive]:\n", dayBeach.positivePrompt);
console.log("\n[Evening Beach Positive]:\n", eveningBeach.positivePrompt);
console.log("\n[Night Beach Positive]:\n", nightBeach.positivePrompt);
console.log("\n[Beach Negative]:\n", dayBeach.negativePrompt);

// Assertions for Beach
if (!dayBeach.positivePrompt.includes("a single small weathered open-air bamboo shelter")) {
  throw new Error("Day beach prompt missing structural anchor!");
}
if (!eveningBeach.positivePrompt.includes("a single small weathered open-air bamboo shelter")) {
  throw new Error("Evening beach prompt missing structural anchor!");
}
if (!nightBeach.positivePrompt.includes("a single small weathered open-air bamboo shelter")) {
  throw new Error("Night beach prompt missing structural anchor!");
}
if (dayBeach.positivePrompt.includes("highly detailed interior and architecture")) {
  throw new Error("Erroneously included hardcoded interior/architecture in nature scene!");
}
if (!dayBeach.negativePrompt.includes("modern house, luxury villa, glass windows")) {
  throw new Error("Beach negative prompt does not block modern house/villa/beach bar!");
}
if (!dayBeach.negativePrompt.includes("beach bar")) {
  throw new Error("Beach negative prompt does not block beach bar!");
}

console.log("\n2. Testing Cliff Overlook (Untouched Nature / Zero Buildings):");

const cliffDay = buildModularLocationPrompt({
  locationPrompt: cliffLoc.prompt,
  structuralAnchor: cliffLoc.structuralAnchor,
  landmarkAnchor: cliffLoc.landmarkAnchor,
  vantagePoint: cliffLoc.vantagePoint,
  isInterior: cliffLoc.isInterior,
  timeOfDay: "day",
});

console.log("\n[Cliff Overlook Positive]:\n", cliffDay.positivePrompt);
console.log("\n[Cliff Overlook Negative]:\n", cliffDay.negativePrompt);

if (!cliffDay.positivePrompt.includes("zero buildings, no huts, no houses")) {
  throw new Error("Cliff overlook missing explicit zero-building anchor!");
}
if (!cliffDay.negativePrompt.includes("house, building, architecture, hut, cabin")) {
  throw new Error("Cliff overlook negative prompt does not block all buildings and huts!");
}

console.log("\n=== ALL LOCATION CONSISTENCY TESTS PASSED! ===");
