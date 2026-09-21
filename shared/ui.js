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

export function errorMessage(error, fallback = 'تعذّر تنفيذ العملية. حاول مجددًا؛ وإذا تكرر الخطأ حدّث الصفحة.') {
  const message = String(error?.message || '');
  const known = {
    EFL_INVALID_MATCH: 'بيانات المباراة غير مكتملة. اختر لاعبين مختلفين وتحقق من النتيجة والتاريخ والموسم.',
    EFL_GOAL_COUNT: 'عدد الأهداف لا يطابق النتيجة. أكمل تفاصيل كل هدف أو استخدم «احتساب النتيجة من الأهداف».',
    EFL_SELF_ASSIST: 'المسجّل لا يمكن أن يصنع الأسيست لنفسه. اختر زميلًا من التشكيلة أو «بدون أسيست».',
    EFL_SCORER_NOT_IN_SQUAD: 'المسجّل غير موجود في تشكيلة صاحب الفريق. حدّث التشكيلة ثم أعد اختيار المسجّل.',
    EFL_ASSIST_NOT_IN_SQUAD: 'صانع الأسيست غير موجود في تشكيلة صاحب الفريق. أعد اختياره أو اختر «بدون أسيست».',
    'This question is closed or unavailable': 'السؤال مغلق أو لم يعد موجودًا. حدّث الصفحة قبل إرسال إجابة.',
    'Invitation already answered': 'تم الرد على هذه الدعوة بالفعل. حدّث قائمة الدعوات.',
    'Invitation not found': 'الدعوة لم تعد متاحة لهذا الحساب. حدّث قائمة الدعوات.',
    'Season not found': 'الموسم لم يعد موجودًا. حدّث الصفحة واختر موسمًا آخر.',
  };
  if (Object.hasOwn(known, message)) return known[message];
  if (!navigator.onLine || error?.status === 0 || /failed to fetch|networkerror|load failed/i.test(message)) return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة؛ احتفظ بالصفحة مفتوحة حتى لا تفقد المدخلات.';
  if (error?.status === 401 || ['PGRST301', 'PGRST303'].includes(error?.code)) return 'انتهت جلسة الدخول. سجّل الدخول مجددًا ثم أعد المحاولة.';
  if (error?.code === '42501' || error?.status === 403) return 'ليس لديك صلاحية لتنفيذ هذه العملية. تحقق من الحساب الذي سجلت الدخول به.';
  if (error?.code === '23505') return 'هذه البيانات موجودة بالفعل. حدّث القائمة وتحقق من السجل قبل إضافته مجددًا.';
  if (error?.code === '23503') return 'أحد اللاعبين أو المواسم المرتبطة بالعملية لم يعد موجودًا. حدّث القائمة وأعد الاختيار.';
  if (['23514', '23502', '22P02', '22003', '22007', '22008'].includes(error?.code)) return 'بعض القيم غير صحيحة أو ناقصة. راجع الأسماء والنتيجة والدقيقة والتاريخ ثم أعد الحفظ.';
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error?.code)) return 'هذه الميزة غير جاهزة حاليًا. حدّث الصفحة؛ وإذا استمرت المشكلة تواصل مع مدير الدوري لإكمال التحديث.';
  if (error?.status === 429) return 'الطلبات متقاربة جدًا. انتظر قليلًا ثم أعد المحاولة.';
  if (error?.code === '57014' || error?.status === 504) return 'استغرقت العملية وقتًا أطول من المتوقع. حدّث النتائج للتحقق من الحفظ قبل إعادة المحاولة.';
  if (error?.status >= 500) return 'الخادم غير متاح مؤقتًا. بيانات النموذج ما زالت موجودة؛ حاول مجددًا بعد قليل.';
  if (error?.code === '21000') return 'تعذّر إكمال العملية بسبب تعارض في البيانات. حدّث الصفحة؛ وإذا تكرر الخطأ تواصل مع مدير الدوري.';
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
