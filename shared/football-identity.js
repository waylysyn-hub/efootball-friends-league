// IDs are authoritative. Only historical records without a resolvable squad
// reference use their owner + name snapshot; never guess a new identity for them.
export function footballIdentity(name, owner, playerId = null) {
  if (!owner || !String(name || '').trim()) return '';
  return playerId ? JSON.stringify(['squad', playerId]) : JSON.stringify([owner, name.trim().toLowerCase()]);
}
