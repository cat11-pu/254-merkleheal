// app.js：渲染结果
import { bucketOf, bucketEqual } from "./merkle.js";
import { step, close } from "./healrun.js";

export function render(spec) {
  const events = spec.events || [];
  const half = Math.ceil(events.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { budget: events.length + 2 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const keys = function (state) {
    return Array.from(new Set([].concat(Object.keys(state.left), Object.keys(state.right)))).sort();
  };
  const fingerprint = function (state) {
    const all = keys(state);
    return JSON.stringify({
      left: all.map(function (key) { return [key, state.left[key] || 0]; }),
      right: all.map(function (key) { return [key, state.right[key] || 0]; }),
      dirty: state.dirty.slice().sort(function (a, b) { return a - b; }),
      applied: state.applied.length
    });
  };
  const closedKeys = keys(closed.state);
  const versions = closedKeys.map(function (key) {
    return [key, closed.state.left[key] || 0, closed.state.right[key] || 0];
  });
  return { versions: versions,
           copies_equal: versions.every(function (row) { return row[1] === row[2]; }),
           healed_first: first.healed_count, healed_wide: wide.healed_count,
           pair_differs: first.healed_count !== wide.healed_count,
           pending_before: first.pending_before, pending_ids: first.pending_ids,
           catchup: closed.catchup, pending_after: closed.state.dirty.length,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.healed_count, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length, tail: bucketOf("9-z") };
}
