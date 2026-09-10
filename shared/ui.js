export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

export function debounce(callback, delay = 250) {
  let timer;
  const run = (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); };
  run.cancel = () => clearTimeout(timer);
  return run;
}

export function errorMessage(error, fallback = 'Could not complete this action. Please try again.') {
  if (!navigator.onLine || error?.name === 'TypeError' || error?.status === 0) {
    return 'Connection unavailable. Check your internet connection and try again.';
  }
  if (error?.status === 401 || error?.code === 'PGRST301') return 'Your session expired. Please sign in again.';
  if (error?.code === '42501' || error?.status === 403) return 'You do not have permission to make this change.';
  if (error?.code === '23505') return 'This record already exists. Refresh before trying again.';
  return fallback;
}

export function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  element.classList.remove('hidden');
  element.setAttribute('role', 'alert');
}

export function toast(message, kind = 'success') {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.className = `toast show ${kind}`;
  element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.className = 'toast hidden'; }, kind === 'error' ? 6000 : 4000);
}

const pending = new Set();
export async function withBusy(key, button, action, label = 'Saving…') {
  if (pending.has(key)) return;
  if (!button?.matches?.('button, input[type="submit"]')) button = null;
  pending.add(key);
  const previous = button?.textContent;
  const disabled = button?.disabled;
  const region = button?.closest('[data-busy-region]');
  const controls = region ? [...region.querySelectorAll('input, select, textarea, button')].map(el => [el, el.disabled]) : [];
  controls.forEach(([el]) => { el.disabled = true; });
  if (button) { button.disabled = true; button.textContent = label; button.setAttribute('aria-busy', 'true'); }
  try { return await action(); }
  catch (error) { toast(errorMessage(error), 'error'); return undefined; }
  finally {
    pending.delete(key);
    controls.forEach(([el, wasDisabled]) => { el.disabled = wasDisabled; });
    if (button) { button.disabled = disabled; button.textContent = previous; button.removeAttribute('aria-busy'); }
  }
}
export const isBusy = key => pending.has(key);

const dialogs = new Map();
export function openDialog(id, onClose) {
  const modal = document.getElementById(id);
  if (!modal || dialogs.has(id)) return;
  const previous = document.activeElement;
  modal.classList.remove('hidden');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const heading = modal.querySelector('h3');
  if (heading) { heading.id ||= `${id}Title`; modal.setAttribute('aria-labelledby', heading.id); }
  const selectors = 'button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose?.(); }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll(selectors)].filter(el => !el.closest('.hidden'));
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const outside = event => { if (event.target === modal) onClose?.(); };
  modal.addEventListener('keydown', keydown);
  modal.addEventListener('click', outside);
  dialogs.set(id, { previous, keydown, outside });
  document.body.classList.add('dialog-open');
  (modal.querySelector('[data-dialog-cancel]') || modal.querySelector(selectors))?.focus();
}

export function closeDialog(id) {
  const modal = document.getElementById(id);
  const saved = dialogs.get(id);
  modal?.classList.add('hidden');
  if (saved) {
    modal.removeEventListener('keydown', saved.keydown);
    modal.removeEventListener('click', saved.outside);
    saved.previous?.focus();
    dialogs.delete(id);
  }
  if (!dialogs.size) document.body.classList.remove('dialog-open');
}

export function setupConnectivity(onReconnect) {
  const banner = document.getElementById('connectionStatus');
  function update() {
    if (banner) { banner.hidden = navigator.onLine; banner.textContent = 'You are offline. Your changes will be available to send when you reconnect.'; }
    if (navigator.onLine) onReconnect?.();
  }
  window.addEventListener('offline', update);
  window.addEventListener('online', update);
  if (!navigator.onLine) update();
}

export function setupDrawer({ sidebar, overlay, toggles, onClose, listen = true }) {
  const media = window.matchMedia('(max-width: 1024px)');
  const main = document.getElementById('mainContent');
  let previous = null;
  function setOpen(open) {
    const wasOpen = sidebar.classList.contains('open');
    if (open && !wasOpen) previous = document.activeElement;
    sidebar.classList.toggle('open', open);
    sidebar.inert = media.matches && !open;
    if (main) main.inert = media.matches && open;
    overlay.classList.toggle('visible', open);
    overlay.classList.toggle('show', open);
    document.body.classList.toggle('drawer-open', media.matches && open);
    toggles.forEach(button => button?.setAttribute('aria-expanded', String(open)));
    if (open) sidebar.querySelector('a,button')?.focus();
    else {
      if (wasOpen && previous?.isConnected) previous.focus();
      onClose?.();
    }
  }
  const close = () => setOpen(false);
  close.toggle = () => setOpen(!sidebar.classList.contains('open'));
  if (listen) toggles.forEach(button => button?.addEventListener('click', close.toggle));
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab' || !media.matches || !sidebar.classList.contains('open')) return;
    const items = [...sidebar.querySelectorAll('a[href],button:not(:disabled)')].filter(el => !el.closest('.hidden,[hidden]') && getComputedStyle(el).display !== 'none');
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  sidebar.addEventListener('click', event => { if (event.target.closest('a, [data-view], [data-page]')) close(); });
  media.addEventListener('change', close);
  setOpen(false);
  return close;
}
