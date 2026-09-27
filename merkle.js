// merkle.js：桶号与同桶比对
export function bucketOf(key) {
  const text = String(key);
  const dash = text.indexOf("-");
  return parseInt(dash === -1 ? text : text.slice(0, dash), 10);
}

export function bucketEqual(left, right, bucket) {
  const keys = new Set([].concat(Object.keys(left || {}), Object.keys(right || {})));
  for (const key of keys) {
    if (bucketOf(key) !== bucket) continue;
    if (((left || {})[key] || 0) !== ((right || {})[key] || 0)) return false;
  }
  return true;
}
