import assert from "node:assert";
import { bucketOf, bucketEqual } from "../merkle.js";
import { step, close } from "../healrun.js";
import { render } from "../app.js";

const base = {
  state: { left: {}, right: {}, dirty: [], healed: [], applied: [] },
  events: [], budget: 1,
  stale_error_code: "E_STALE_VERSION", dirty_error_code: "E_NOT_DIRTY", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bucketOf returns a number", () => {
  assert.strictEqual(typeof bucketOf("1-a"), "number");
});

check("bucketEqual returns a flag", () => {
  assert.strictEqual(typeof bucketEqual(base.state.left, base.state.right, 1), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
