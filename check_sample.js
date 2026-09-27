import fs from "node:fs";
import { bucketOf, bucketEqual } from "./merkle.js";
import { step, close } from "./healrun.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/repair.json", "utf8"));
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
const allKeys = function (state) {
  return Array.from(new Set([].concat(Object.keys(state.left), Object.keys(state.right)))).sort();
};
const fingerprint = function (state) {
  const all = allKeys(state);
  return JSON.stringify({
    left: all.map(function (key) { return [key, state.left[key] || 0]; }),
    right: all.map(function (key) { return [key, state.right[key] || 0]; }),
    dirty: state.dirty.slice().sort(function (a, b) { return a - b; }),
    applied: state.applied.length
  });
};
const closedKeys = allKeys(closed.state);

emit("收尾后左侧版本 =", JSON.stringify(closedKeys.map(function (key) { return [key, closed.state.left[key] || 0]; })));
emit("收尾后两侧一致 =", closedKeys.every(function (key) { return (closed.state.left[key] || 0) === (closed.state.right[key] || 0); }));
emit("首轮修复桶数 =", first.healed_count);
emit("二档修复桶数 =", wide.healed_count);
emit("两个预算档修复不同 =", first.healed_count !== wide.healed_count);
emit("收尾前待修桶数 =", first.pending_before);
emit("压在账上的请求 =", JSON.stringify(first.pending_ids));
emit("收尾补齐桶数 =", closed.catchup);
emit("收尾后待修桶数 =", closed.state.dirty.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放新增修复 =", replay.healed_count);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
try {
  step(Object.assign({}, { state: { left: { "1-a": 2 }, right: { "1-a": 2 }, dirty: [], healed: [], applied: [] },
    events: [{ id: 1, kind: "put", side: "L", key: "1-a", version: 2 }], budget: 1 }));
  emit("版本回落报码", "没有报错");
} catch (error) {
  emit("版本回落报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { state: { left: {}, right: {}, dirty: [], healed: [], applied: [] },
    events: [{ id: 1, kind: "heal", bucket: 2 }], budget: 1 }));
  emit("未标差异报码", "没有报错");
} catch (error) {
  emit("未标差异报码", error && error.code ? error.code : String(error.message));
}
try {
  step(Object.assign({}, { state: { left: {}, right: {}, dirty: [], healed: [], applied: [] },
    events: [{ id: 1, kind: "peek", bucket: 1 }], budget: 1 }));
  emit("事件不合法报码", "没有报错");
} catch (error) {
  emit("事件不合法报码", error && error.code ? error.code : String(error.message));
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后左侧版本": [
    [
      "1-a",
      2
    ],
    [
      "1-b",
      1
    ],
    [
      "2-a",
      1
    ],
    [
      "3-a",
      1
    ],
    [
      "3-b",
      5
    ],
    [
      "3-c",
      1
    ]
  ],
  "收尾后两侧一致": true,
  "首轮修复桶数": 1,
  "二档修复桶数": 2,
  "两个预算档修复不同": true,
  "收尾前待修桶数": 2,
  "压在账上的请求": [
    7
  ],
  "收尾补齐桶数": 2,
  "收尾后待修桶数": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放新增修复": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "版本回落报码": "E_STALE_VERSION",
  "未标差异报码": "E_NOT_DIRTY",
  "事件不合法报码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
