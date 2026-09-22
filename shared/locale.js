// Display labels only: account names, option values and database keys stay stable.
export const AR_LOCALE = 'ar-u-ca-gregory-nu-latn';
const PLAYER_NAMES = Object.freeze({
  Wael: 'وائل', Omar: 'عمر', 'Abdul Rahim': 'عبد الرحيم',
  Mohammad: 'محمد', Mustafa: 'مصطفى', 'Abdul Qader': 'عبد القادر',
});
export function displayName(value) {
  const name = String(value ?? '');
  return Object.hasOwn(PLAYER_NAMES, name) ? PLAYER_NAMES[name] : name;
}
export function displaySeason(value) {
  return String(value ?? '').replace(/^Season\s+(\d+)$/i, 'الموسم $1');
}
export function playerInitials(value) {
  return displayName(value).split(/\s+/).map(word => word[0] || '').slice(0, 2).join('');
}
export function matchesPlayerSearch(value, query) {
  const needle = query.trim().toLocaleLowerCase('ar');
  return [String(value ?? ''), displayName(value)].some(name => name.toLocaleLowerCase('ar').includes(needle));
}
