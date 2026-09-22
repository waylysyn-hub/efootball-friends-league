import { displayName } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { isAdmin, requireAdmin } from './admin.js';
import { esc, formatDate, showConfirm, showError, showToast } from './ui.js';
import { isQaTableMissing, mapAnswer, mapQuestion } from './api.js';

const pendingPosts = new Map();
async function postOnce(table, content) {
  const signature = JSON.stringify(content);
  let draft = pendingPosts.get(table);
  if (!draft || draft.signature !== signature) {
    draft = { signature, row: { id: crypto.randomUUID(), ...content, timestamp: Date.now() } };
    pendingPosts.set(table, draft);
  }
  let result = await sb.from(table).insert(draft.row).select().single();
  if (result.error?.code === '23505') {
    const existing = await sb.from(table).select().eq('id', draft.row.id).single();
    if (!existing.error && Object.entries(content).every(([key,value]) => existing.data?.[key] === value)) result = existing;
  }
  if (!result.error) pendingPosts.delete(table);
  return result;
}

export function getQuestionAnswers(questionId) {
  return state.db.answers.filter(a => a.questionId === questionId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function renderQuestions() {
  const cont = document.getElementById('qaContent');
  if (!cont) return;

  if (!sb) {
    cont.innerHTML = "<div class=\"empty-state\">الأسئلة غير متاحة مؤقتًا. حاول بعد قليل.</div>";
    return;
  }

  if (!state.qaReady) {
    cont.innerHTML = "<div class=\"empty-state\"><span class=\"empty-icon\">◇</span><h3>الأسئلة غير جاهزة بعد</h3><p>تواصل مع مدير الدوري لإكمال الإعداد.</p></div>";
    return;
  }

  if (state.questionId) {
    renderQuestionDetail(state.questionId);
    return;
  }

  const open = state.db.questions.filter(q => !q.closed);
  const closed = state.db.questions.filter(q => q.closed);

  const card = (q) => {
    const n = getQuestionAnswers(q.id).length;
    const adminDel = isAdmin()
      ? `<button class="btn-sm delete qa-delete" onclick="event.stopPropagation();League.deleteQuestion('${q.id}')" title="حذف السؤال بواسطة المدير">🗑️</button>`
      : '';
    return `<article class="qa-card">
      <div class="qa-card-top">
        <span class="qa-author">${esc(displayName(q.author))}</span>
        <span class="qa-card-top-right">
          ${q.closed
            ? "<span class=\"qa-badge closed\">مغلق</span>"
            : "<span class=\"qa-badge open\">مفتوح</span>"}
          ${adminDel}
        </span>
      </div>
      <button class="qa-card-body qa-open" type="button" onclick="League.openQuestion('${q.id}')">${esc(q.body)}</button>
      <div class="qa-card-meta">عدد الإجابات: ${n} · ${formatDate(q.timestamp)}</div>
    </article>`;
  };

  cont.innerHTML = `
    <div class="qa-list-view">
      <div class="panel qa-ask-panel">
        <div class="panel-header">اسأل لاعبي الدوري</div>
        <div class="panel-body" data-busy-region>
          <label for="qaAskBody">سؤالك</label><textarea id="qaAskBody" maxlength="2000" rows="3" placeholder="اكتب سؤالك للاعبي الدوري…"></textarea>
          <div id="qaAskError" class="login-error hidden"></div>
          <button id="postQuestionButton" type="button" class="btn-primary" onclick="League.submitQuestion()">نشر السؤال</button>
        </div>
      </div>
      <h3 class="qa-section-title">مفتوحة (${open.length})</h3>
      <div class="qa-list">${open.length ? open.map(card).join('') : "<div class=\"empty-state\">لا توجد أسئلة مفتوحة بعد.</div>"}</div>
      ${closed.length ? `<h3 class="qa-section-title">مغلقة (${closed.length})</h3>
        <div class="qa-list">${closed.map(card).join('')}</div>` : ''}
      ${isAdmin() && closed.length ? `
      <div class="qa-admin-actions">
        <button class="btn-danger btn-sm" onclick="League.deleteAllClosedQuestions()">🗑️ حذف كل الأسئلة المغلقة (${closed.length})</button>
      </div>` : ''}
    </div>`;
}

export function openQuestion(id) {
  state.questionId = id;
  renderQuestionDetail(id);
}

export function backToQuestions() {
  state.questionId = null;
  renderQuestions();
}

export function renderQuestionDetail(id) {
  const cont = document.getElementById('qaContent');
  const q = state.db.questions.find(x => x.id === id);
  if (!cont || !q) { state.questionId = null; renderQuestions(); return; }

  const answers = getQuestionAnswers(id);
  const isAuthor = q.author === state.user;
  const canAnswer = !q.closed;

  const answerHtml = answers.length ? answers.map(a => {
    const isCorrect = q.correctAnswerId === a.id;
    const markBtn = (isAuthor && !q.closed)
      ? `<button class="btn-sm qa-mark-correct" onclick="event.stopPropagation();League.markCorrectAnswer('${q.id}','${a.id}')">✓ اختيار كإجابة صحيحة</button>`
      : '';
    return `<div class="qa-answer ${isCorrect ? 'correct' : ''}">
      <div class="qa-answer-top">
        <span class="qa-author">${esc(displayName(a.author))}</span>
        ${isCorrect ? "<span class=\"qa-badge correct\">✓ صحيحة</span>" : ''}
      </div>
      <p class="qa-answer-body">${esc(a.body)}</p>
      <div class="qa-answer-foot">
        <span class="qa-card-meta">${formatDate(a.timestamp)}</span>
        ${markBtn}
      </div>
    </div>`;
  }).join('') : "<div class=\"empty-state\">لا توجد إجابات بعد. كن أول من يجيب!</div>";

  cont.innerHTML = `
    <div class="qa-detail-view">
      <button class="btn-sm qa-back" onclick="League.backToQuestions()">→ كل الأسئلة</button>
      <div class="panel qa-question-panel">
        <div class="panel-header qa-detail-header">
          <span>سؤال من ${esc(displayName(q.author))}</span>
          <span class="qa-card-top-right">
            ${q.closed ? "<span class=\"qa-badge closed\">مغلق</span>" : "<span class=\"qa-badge open\">مفتوح</span>"}
            ${isAdmin() ? `<button class="btn-sm delete" onclick="League.deleteQuestion('${q.id}')">🗑️ حذف السؤال</button>` : ''}
          </span>
        </div>
        <div class="panel-body">
          <p class="qa-question-body">${esc(q.body)}</p>
          ${q.closed && isAuthor ? "<p class=\"qa-hint\">اخترت الإجابة الصحيحة وأُغلق باب الردود.</p>" : ''}
          ${!q.closed && isAuthor ? "<p class=\"qa-hint\">اختر الإجابة الصحيحة لإغلاق السؤال.</p>" : ''}
        </div>
      </div>
      <h3 class="qa-section-title">الإجابات (${answers.length})</h3>
      <div class="qa-answers">${answerHtml}</div>
      ${canAnswer ? `
      <div class="panel qa-answer-panel">
        <div class="panel-header">شارك في النقاش</div>
        <div class="panel-body" data-busy-region>
          <label for="qaAnswerBody">إجابتك</label><textarea id="qaAnswerBody" maxlength="4000" rows="3" placeholder="اكتب إجابتك…"></textarea>
          <div id="qaAnswerError" class="login-error hidden"></div>
          <button id="postAnswerButton" type="button" class="btn-primary" onclick="League.submitAnswer('${q.id}')">نشر الإجابة</button>
        </div>
      </div>` : "<div class=\"qa-closed-note\">🔒 هذا السؤال مغلق، ولا يقبل إجابات جديدة.</div>"}
    </div>`;
}

export async function submitQuestion() {
  const err = document.getElementById('qaAskError');
  const body = (document.getElementById('qaAskBody')?.value || '').trim();
  if (!sb) return showError(err, "تعذّر الاتصال. حدّث الصفحة.");
  if (!state.user) return showError(err, "سجّل الدخول أولًا.");
  if (!body) return showError(err, "اكتب سؤالًا أولًا.");
  if (body.length < 3 || body.length > 2000) return showError(err, "يجب أن يتراوح السؤال بين 3 و2000 حرف.");

  const author = state.user;
  const { data, error } = await postOnce('questions', { author, body });
  if (state.user !== author) return;
  if (error) {
    if (isQaTableMissing(error)) return showError(err, "الأسئلة غير متاحة. تواصل مع مدير الدوري.");
    return showError(err, "تعذّر نشر السؤال.");
  }

  state.db.questions = state.db.questions.filter(question => question.id !== data.id);
  state.db.questions.unshift(mapQuestion(data));

  err?.classList.add('hidden');
  showToast("تم نشر السؤال!");
  state.questionId = null;
  renderQuestions();
}

export async function submitAnswer(questionId) {
  const err = document.getElementById('qaAnswerError');
  const body = (document.getElementById('qaAnswerBody')?.value || '').trim();
  const q = state.db.questions.find(x => x.id === questionId);
  if (!sb) return showError(err, "تعذّر الاتصال. حدّث الصفحة.");
  if (!state.user) return showError(err, "سجّل الدخول أولًا.");
  if (!q) return;
  if (q.closed) return showError(err, "هذا السؤال مغلق.");
  if (!body) return showError(err, "اكتب إجابة أولًا.");
  if (body.length < 2 || body.length > 4000) return showError(err, "يجب أن تتراوح الإجابة بين حرفين و4000 حرف.");

  const author = state.user;
  const { data, error } = await postOnce('answers', { question_id: questionId, author, body });
  if (state.user !== author) return;
  if (error) {
    if (isQaTableMissing(error)) return showError(err, "الأسئلة غير متاحة. تواصل مع مدير الدوري.");
    return showError(err, "تعذّر نشر الإجابة.");
  }

  state.db.answers = state.db.answers.filter(answer => answer.id !== data.id);
  state.db.answers.push(mapAnswer(data));

  err?.classList.add('hidden');
  showToast("تم نشر الإجابة!");
  renderQuestionDetail(questionId);
}

export function deleteQuestion(id) {
  if (!requireAdmin()) return;
  const q = state.db.questions.find(x => x.id === id);
  if (!q) return;
  const n = getQuestionAnswers(id).length;
  showConfirm(
    "حذف السؤال",
    `هل تريد حذف هذا السؤال وإجاباته (${n})؟ لا يمكن التراجع عن الحذف.`,
    async () => {
      if (!sb) return showToast("تعذّر الاتصال. حدّث الصفحة.", true);
      const { error } = await sb.from('questions').delete().eq('id', id);
      if (error) return showToast("تعذّر حذف السؤال.", true);

      state.db.questions = state.db.questions.filter(x => x.id !== id);
      state.db.answers = state.db.answers.filter(a => a.questionId !== id);

      if (state.questionId === id) state.questionId = null;
      showToast("تم حذف السؤال.");
      renderQuestions();
    }
  );
}

export function deleteAllClosedQuestions() {
  if (!requireAdmin()) return;
  const closed = state.db.questions.filter(q => q.closed);
  if (!closed.length) return showToast("لا توجد أسئلة مغلقة لحذفها.", true);
  const totalAnswers = closed.reduce((sum, q) => sum + getQuestionAnswers(q.id).length, 0);
  showConfirm(
    "حذف كل الأسئلة المغلقة",
    `هل تريد حذف الأسئلة المغلقة (${closed.length}) وإجاباتها (${totalAnswers})؟ لا يمكن التراجع عن الحذف.`,
    async () => {
      if (!sb) return showToast("تعذّر الاتصال. حدّث الصفحة.", true);
      const ids = closed.map(q => q.id);
      const { error } = await sb.from('questions').delete().in('id', ids);
      if (error) return showToast("تعذّر حذف الأسئلة.", true);

      const idSet = new Set(ids);
      state.db.questions = state.db.questions.filter(q => !idSet.has(q.id));
      state.db.answers = state.db.answers.filter(a => !idSet.has(a.questionId));

      state.questionId = null;
      showToast(`تم حذف ${closed.length} من الأسئلة.`);
      renderQuestions();
    }
  );
}

export function markCorrectAnswer(questionId, answerId) {
  const q = state.db.questions.find(x => x.id === questionId);
  if (!q) return;
  if (q.author !== state.user) return showToast("صاحب السؤال وحده يستطيع اختيار الإجابة الصحيحة.", true);
  if (q.closed) return showToast("هذا السؤال مغلق بالفعل.", true);
  const ans = state.db.answers.find(a => a.id === answerId && a.questionId === questionId);
  if (!ans) return showToast("الإجابة غير موجودة.", true);

  showConfirm(
    "اختيار الإجابة الصحيحة",
    `هل تريد اختيار إجابة ${displayName(ans.author)} كإجابة صحيحة؟ سيُغلق السؤال ولن يقبل ردودًا جديدة.`,
    async () => {
      if (!sb) return showToast("تعذّر الاتصال. حدّث الصفحة.", true);
      const { error } = await sb.from('questions')
        .update({ closed: true, correct_answer_id: answerId })
        .eq('id', questionId);
      if (error) return showToast("تعذّر إغلاق السؤال.", true);

      q.closed = true;
      q.correctAnswerId = answerId;

      showToast("تم اختيار الإجابة الصحيحة وإغلاق السؤال!");
      renderQuestionDetail(questionId);
    }
  );
}
