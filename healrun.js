// healrun.js：按修复预算修桶并留账
import { bucketOf, bucketEqual } from "./merkle.js";

function fault(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function codes(spec) {
  const src = spec || {};
  return {
    stale: src.stale_error_code || "E_STALE_VERSION",
    dirty: src.dirty_error_code || "E_NOT_DIRTY",
    event: src.event_error_code || "E_BAD_EVENT"
  };
}

function cloneState(state) {
  const src = state || {};
  return {
    left: Object.assign({}, src.left),
    right: Object.assign({}, src.right),
    dirty: (src.dirty || []).slice(),
    healed: (src.healed || []).slice(),
    applied: (src.applied || []).slice(),
    pending: (src.pending || []).map(function (req) { return Object.assign({}, req); })
  };
}

function validateEvent(event, code) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw fault(code, "event must be an object");
  }
  if (event.id === undefined || event.id === null) throw fault(code, "event needs an id");
  if (event.kind === "put") {
    if (event.side !== "L" && event.side !== "R") throw fault(code, "put needs side L or R");
    if (typeof event.key !== "string" || !Number.isInteger(bucketOf(event.key))) {
      throw fault(code, "put needs a bucketed key");
    }
    if (typeof event.version !== "number" || !Number.isFinite(event.version)) {
      throw fault(code, "put needs a numeric version");
    }
    return;
  }
  if (event.kind === "heal") {
    if (typeof event.bucket !== "number" || !Number.isInteger(event.bucket)) {
      throw fault(code, "heal needs an integer bucket");
    }
    return;
  }
  throw fault(code, "unknown event kind");
}

function refreshBucket(state, bucket) {
  const index = state.dirty.indexOf(bucket);
  if (bucketEqual(state.left, state.right, bucket)) {
    if (index !== -1) state.dirty.splice(index, 1);
  } else if (index === -1) {
    state.dirty.push(bucket);
  }
}

function healBucket(state, bucket) {
  const keys = new Set([].concat(Object.keys(state.left), Object.keys(state.right)));
  for (const key of keys) {
    if (bucketOf(key) !== bucket) continue;
    const version = Math.max(state.left[key] || 0, state.right[key] || 0);
    state.left[key] = version;
    state.right[key] = version;
  }
  const index = state.dirty.indexOf(bucket);
  if (index !== -1) state.dirty.splice(index, 1);
  if (state.healed.indexOf(bucket) === -1) state.healed.push(bucket);
}

export function step(spec) {
  const code = codes(spec);
  const state = cloneState(spec.state);
  const events = spec.events || [];
  let budget = typeof spec.budget === "number" ? spec.budget : 0;
  const healedNow = [];
  let judged = 0;

  // 上一轮压在账上的修复请求先兑现：桶已抹平的销账，预算不够的继续压账
  const carry = [];
  for (const req of state.pending) {
    if (state.dirty.indexOf(req.bucket) === -1) continue;
    if (budget > 0) {
      healBucket(state, req.bucket);
      healedNow.push(req.bucket);
      budget -= 1;
    } else {
      carry.push(req);
    }
  }
  state.pending = carry;

  for (const event of events) {
    if (event && state.applied.indexOf(event.id) !== -1) continue;
    validateEvent(event, code.event);
    judged += 1;
    if (event.kind === "put") {
      const side = event.side === "L" ? state.left : state.right;
      const current = side[event.key] || 0;
      if (!(event.version > current)) throw fault(code.stale, "stale version for " + event.key);
      side[event.key] = event.version;
      refreshBucket(state, bucketOf(event.key));
    } else {
      if (state.dirty.indexOf(event.bucket) === -1) {
        throw fault(code.dirty, "bucket " + event.bucket + " is not dirty");
      }
      if (budget > 0) {
        healBucket(state, event.bucket);
        healedNow.push(event.bucket);
        budget -= 1;
      } else {
        state.pending.push({ id: event.id, bucket: event.bucket });
      }
    }
    state.applied.push(event.id);
  }

  return { state: state,
           healed: healedNow,
           healed_count: healedNow.length,
           pending_before: state.dirty.length,
           pending_ids: state.pending.map(function (req) { return req.id; }),
           judged: judged,
           judged_bound: events.length };
}

export function close(spec) {
  const state = cloneState(spec.state);
  const buckets = state.dirty.slice();
  for (const bucket of buckets) {
    healBucket(state, bucket);
  }
  state.pending = [];
  return { state: state, catchup: buckets.length };
}
