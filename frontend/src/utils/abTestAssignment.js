// Deterministic variant assignment — same user always gets same variant.
// Uses a 32-bit FNV-1a hash on (experimentId + userId/anonymousId).
function fnv32a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

function getAnonymousId() {
  let id = localStorage.getItem('ab_anon_id');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ab_anon_id', id);
  }
  return id;
}

// Returns 0-based variant index deterministically for (experimentId, userId).
export function assignVariant(experimentId, numVariants = 2, userId = null) {
  const seed = userId || getAnonymousId();
  return fnv32a(experimentId + seed) % numVariants;
}
