import { deriveEpochPolicy } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/derive.ts";
import { resolveEpochs } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/epochs.ts";
const view = deriveEpochPolicy([], { now: 1_000_000 });
console.log("import ok; policy:", view.policy_version, "notes:", view.reliabilityNotes());
console.log("epochs([]):", resolveEpochs([]).length);
