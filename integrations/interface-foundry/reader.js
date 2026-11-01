/* Preserve upstream controls, content, downloads, and native dialog behavior. */
// Match the hub's seasonal controls without changing the standalone source.
function readHubPreference(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function refreshHubWinter() {
  const appearance = readHubPreference('turbo-universe-appearance');
  const winter = readHubPreference('turbo-universe-winter');
  const month = new Date().getMonth();
  const preview = ['spring', 'summer', 'autumn', 'winter'].includes(appearance.season);
  const seasonal = preview ? appearance.season === 'winter' : appearance.hemisphere === 'south'
    ? month >= 4 && month <= 7 : month === 10 || month === 11 || month === 0 || month === 1;
  const active = winter.display === 'on' || (winter.display !== 'off' && seasonal);
  document.documentElement.toggleAttribute('data-hub-winter', active);
  document.documentElement.dataset.hubScheme = appearance.scheme === 'dark' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', active ? '#061d20' : '#f4f2ea');
}
refreshHubWinter();
window.addEventListener('storage', event => {
  if (event.key === null || event.key === 'turbo-universe-appearance' || event.key === 'turbo-universe-winter') refreshHubWinter();
});
window.addEventListener('focus', refreshHubWinter);
document.addEventListener('visibilitychange', refreshHubWinter);
window.setInterval(refreshHubWinter, 60_000);

const reader = document.querySelector('#skill-dialog');
const skillText = document.querySelector('#skill-content');
if (reader && skillText) {
  skillText.setAttribute('role', 'region');
  skillText.setAttribute('aria-label', 'Complete skill text');
  // The upstream backdrop handler also receives clicks on the dialog's padding.
  // Let it dismiss only when the pointer is actually outside the dialog bounds.
  reader.addEventListener('click', event => {
    if (event.target !== reader) return;
    const bounds = reader.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (inside) event.stopImmediatePropagation();
  }, true);
  reader.addEventListener('close', () => { skillText.scrollTop = 0; });
}
