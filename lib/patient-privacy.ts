// Data minimization for display names; this is not HIPAA de-identification.
// Preserve compound surnames without guessing which tokens belong to a given name.
export function isLimitedPatientName(value: string): boolean {
  return /^\p{L}\. [\p{L}\p{M}]+(?:[. '’\-]+[\p{L}\p{M}]+)*$/u.test(value.trim());
}

export function isSyntheticPatientName(value: string): boolean {
  return value.startsWith('데모') || /^Demo(?:\s|$)/i.test(value);
}
