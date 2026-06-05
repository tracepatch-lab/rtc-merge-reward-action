const assert = require("assert");
const { extractWallet, resultComment } = require("./src/index.js");

assert.strictEqual(
  extractWallet("RTC wallet: `RTCa14a8b8553834f4593db826222424420bf6f8417`"),
  "RTCa14a8b8553834f4593db826222424420bf6f8417",
);
assert.strictEqual(
  extractWallet("miner_id = tracepatch-lab-wallet"),
  "tracepatch-lab-wallet",
);
assert.strictEqual(
  extractWallet("plain RTCa14a8b8553834f4593db826222424420bf6f8417 in prose"),
  "RTCa14a8b8553834f4593db826222424420bf6f8417",
);

const comment = resultComment({
  wallet: "RTCa14a8b8553834f4593db826222424420bf6f8417",
  amount: "5",
  from: "project-fund",
  result: { dryRun: true },
});
assert(comment.includes("Dry run"));
assert(comment.includes("5 RTC"));

console.log("tests ok");
