const text = (value) => String(value ?? "").trim();

export function validTimestamp(value) {
  if (!text(value)) return null;
  const timestamp = Date.parse(text(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function soldVehicleComparator(left, right) {
  const leftSold = validTimestamp(left.soldAt);
  const rightSold = validTimestamp(right.soldAt);
  if (leftSold !== null || rightSold !== null) {
    if (leftSold === null) return 1;
    if (rightSold === null) return -1;
    if (leftSold !== rightSold) return rightSold - leftSold;
  }
  const leftUpdated = validTimestamp(left.updatedAt) ?? 0;
  const rightUpdated = validTimestamp(right.updatedAt) ?? 0;
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
  return text(left.id).localeCompare(text(right.id), "en");
}

export function publicVehicleComparator(left, right) {
  if (left.status !== right.status) return left.status === "available" ? -1 : 1;
  if (left.status === "sold") return soldVehicleComparator(left, right);
  const leftUpdated = validTimestamp(left.updatedAt) ?? 0;
  const rightUpdated = validTimestamp(right.updatedAt) ?? 0;
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
  return text(left.id).localeCompare(text(right.id), "en");
}
