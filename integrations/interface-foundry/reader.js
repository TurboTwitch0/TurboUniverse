/* Preserve upstream controls, content, downloads, and native dialog behavior. */
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
