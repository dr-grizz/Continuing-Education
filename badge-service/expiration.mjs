// A selected calendar date remains valid through that entire day in UTC.
// Expiration is part of the signed snapshot; legacy snapshots have no expiry.
export function expirationDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
    value < "0001-01-01" ||
    !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error(
      "Choose a valid expiration date (YYYY-MM-DD), or leave it blank.",
    );
  return value;
}
export function expirationFields(value) {
  const date = expirationDate(value);
  return date
    ? { expirationDate: date, validUntil: `${date}T23:59:59.999Z` }
    : {};
}
export function isExpired(snapshot, at = Date.now()) {
  if (!snapshot.validUntil) return false;
  const deadline = Date.parse(snapshot.validUntil);
  return !Number.isFinite(deadline) || at > deadline;
}
export function requireUnexpired(snapshot, at = Date.now()) {
  if (isExpired(snapshot, at))
    throw new Error(
      "This expiration date has passed. Choose a current or future date before issuing.",
    );
}
export function credentialStatus(row, at = Date.now()) {
  return row.revoked_at
    ? "revoked"
    : isExpired(JSON.parse(row.credential), at)
      ? "expired"
      : "issued";
}
