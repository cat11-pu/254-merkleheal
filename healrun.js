// healrun.js：按修复预算修桶并留账（基线：一律给空表）
import { bucketOf, bucketEqual } from "./merkle.js";

export function step(spec) {
  return { state: spec.state, healed: [], healed_count: 0, pending_before: 0,
           pending_ids: [], judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
