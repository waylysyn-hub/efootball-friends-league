import { escapeHtml } from '../../shared/ui.js';
import { state } from './state.js';

export const UI_TEXT = Object.freeze({
  empty: 'لا توجد بيانات لهذا الموسم بعد.', filtered: 'لا توجد نتائج مطابقة.',
  loading: 'جارٍ تحميل البيانات…', error: 'تعذر تحميل البيانات.',
  permission: 'هذه العملية متاحة للمدير فقط.', retry: 'إعادة المحاولة',
  clear: 'مسح الفلاتر', record: 'تسجيل مباراة جديدة',
});
export function stateHTML({ kind = 'empty', title = UI_TEXT[kind], description = '', action = '', label = '', href = '' } = {}) {
  if (kind === 'error' && !action) { action = 'refresh'; label = UI_TEXT.retry; }
  return `<div class="view-state view-state-${escapeHtml(kind)}" role="${kind === 'error' ? 'alert' : 'status'}"${kind === 'loading' ? ' aria-busy="true"' : ''}>
    <span class="view-state-mark" aria-hidden="true">${kind === 'loading' ? '◌' : kind === 'error' ? '!' : '◇'}</span>
    <div><h3>${escapeHtml(title)}</h3>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>
    ${href ? `<a class="btn-secondary" href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : action ? `<button type="button" class="btn-secondary" data-state-action="${escapeHtml(action)}">${escapeHtml(label)}</button>` : ''}
  </div>`;
}
export function emptyCompetition(title = UI_TEXT.empty) {
  return stateHTML({ title, ...(state.profile?.role === 'admin'
    ? { href: '#recordMatch', label: UI_TEXT.record }
    : { description: 'يمكنك متابعة النتائج هنا بعد أن يسجّل مدير الدوري مباراة.' }) });
}

// Every data page uses the same request lifecycle. Keep the last snapshot and all
// form fields visible while loading or on failure; never replace a draft with a spinner.
export function setDataStatus(phase) {
  state.dataStatus = phase;
  for (const page of document.querySelectorAll('.page')) {
    if (page.id === 'page-settings') continue;
    let status = page.querySelector(':scope > .page-data-status');
    if (!status) {
      status = document.createElement('div'); status.className = 'page-data-status';
      page.querySelector('.page-header')?.after(status);
    }
    page.setAttribute('aria-busy', String(phase === 'loading'));
    status.hidden = phase === 'ready';
    status.innerHTML = phase === 'ready' ? '' : stateHTML({ kind: phase,
      description: phase === 'error' ? 'تُعرض آخر بيانات محملة. مدخلاتك محفوظة؛ أعد المحاولة لتحديث البيانات.' : 'تبقى مدخلاتك محفوظة أثناء التحديث.' });
  }
  const refresh = document.querySelector('.topbar-refresh');
  if (refresh) { refresh.disabled = phase === 'loading'; refresh.setAttribute('aria-busy', String(phase === 'loading')); }
}

export function renderSettings() {
  const el = document.getElementById('settingsPermission');
  el.hidden = state.profile?.role === 'admin';
  el.innerHTML = el.hidden ? '' : stateHTML({ kind: 'permission', description: 'يمكنك متابعة المباريات والترتيب وتعديل تشكيلتك. تواصل مع مدير الدوري لإدارة البيانات.', href: '#squads', label: 'عرض تشكيلتي' });
}
