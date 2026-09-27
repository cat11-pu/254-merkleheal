// healrun.js：按修复预算修桶并留账
import { bucketOf, bucketEqual } from "./merkle.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function codes(spec) {
  return {
    stale: spec.stale_error_code || "E_STALE_VERSION",
    dirty: spec.dirty_error_code || "E_NOT_DIRTY",
    event: spec.event_error_code || "E_BAD_EVENT"
  };
}

function cloneState(state) {
  state = state || {};
  return {
    left: Object.assign({}, state.left),
    right: Object.assign({}, state.right),
    dirty: (state.dirty || []).slice(),
    healed: (state.healed || []).slice(),
    applied: (state.applied || []).slice()
  };
}

function refreshBucket(state, bucket) {
  const at = state.dirty.indexOf(bucket);
  if (bucketEqual(state.left, state.right, bucket)) {
    if (at >= 0) state.dirty.splice(at, 1);
  } else if (at < 0) {
    state.dirty.push(bucket);
  }
}

function healBucket(state, bucket) {
  const keys = new Set([].concat(Object.keys(state.left), Object.keys(state.right)));
  keys.forEach(function (key) {
    if (bucketOf(key) !== bucket) return;
    const version = Math.max(state.left[key] || 0, state.right[key] || 0);
    state.left[key] = version;
    state.right[key] = version;
  });
  const at = state.dirty.indexOf(bucket);
  if (at >= 0) state.dirty.splice(at, 1);
  if (state.healed.indexOf(bucket) < 0) state.healed.push(bucket);
}

function checkEvent(event, code) {
  if (!event || typeof event !== "object") fail(code, "bad event");
  if (event.id === undefined || event.id === null) fail(code, "bad event");
  if (event.kind === "put") {
    if (event.side !== "L" && event.side !== "R") fail(code, "bad event");
    if (typeof event.key !== "string") fail(code, "bad event");
    if (typeof event.version !== "number" || !isFinite(event.version)) fail(code, "bad event");
  } else if (event.kind === "heal") {
    if (typeof event.bucket !== "number" || !isFinite(event.bucket)) fail(code, "bad event");
  } else {
    fail(code, "bad event");
  }
}

export function step(spec) {
  const code = codes(spec);
  const state = cloneState(spec.state);
  const events = spec.events || [];
  let budget = spec.budget || 0;
  const healed = [];
  const pending = [];
  let judged = 0;
  events.forEach(function (event) {
    checkEvent(event, code.event);
    if (state.applied.indexOf(event.id) >= 0) return;
    judged += 1;
    if (event.kind === "put") {
      const side = event.side === "L" ? state.left : state.right;
      if (!(event.version > (side[event.key] || 0))) fail(code.stale, "stale version");
      side[event.key] = event.version;
      refreshBucket(state, bucketOf(event.key));
    } else {
      if (state.dirty.indexOf(event.bucket) < 0) fail(code.dirty, "bucket not dirty");
      if (budget > 0) {
        budget -= 1;
        healBucket(state, event.bucket);
        healed.push(event.bucket);
      } else {
        pending.push(event.id);
      }
    }
    state.applied.push(event.id);
  });
  return { state: state, healed: healed, healed_count: healed.length,
           pending_before: state.dirty.length, pending_ids: pending,
           judged: judged, judged_bound: events.length };
}

export function close(spec) {
  const state = cloneState(spec.state);
  const rest = state.dirty.slice();
  rest.forEach(function (bucket) { healBucket(state, bucket); });
  return { state: state, catchup: rest.length };
}
