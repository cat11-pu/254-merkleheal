// merkle.js：桶号与同桶比对
export function bucketOf(key) {
  return parseInt(String(key).split("-")[0], 10);
}

export function bucketEqual(left, right, bucket) {
  const keys = new Set([].concat(Object.keys(left || {}), Object.keys(right || {})));
  for (const key of keys) {
    if (bucketOf(key) !== bucket) continue;
    if ((left[key] || 0) !== (right[key] || 0)) return false;
  }
  return true;
}
