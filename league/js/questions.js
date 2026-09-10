import { sb, state } from './state.js';
import { isAdmin, requireAdmin } from './admin.js';
import { esc, formatDate, showConfirm, showError, showToast } from './ui.js';
import { isQaTableMissing, mapAnswer, mapQuestion } from './api.js';

export function getQuestionAnswers(questionId) {
  return state.db.answers.filter(a => a.questionId === questionId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function renderQuestions() {
  const cont = document.getElementById('qaContent');
  if (!cont) return;

  if (!sb) {
    cont.innerHTML = '<div class="empty-state">Questions are temporarily unavailable. Please try again shortly.</div>';
    return;
  }

  if (!state.qaReady) {
    cont.innerHTML = '<div class="empty-state"><span class="empty-icon">◇</span><h3>Questions are not available yet</h3><p>Please ask the league administrator to finish setup.</p></div>';
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
      ? `<button class="btn-sm delete qa-delete" onclick="event.stopPropagation();League.deleteQuestion('${q.id}')" title="Admin: delete question">🗑️</button>`
      : '';
    return `<article class="qa-card">
      <div class="qa-card-top">
        <span class="qa-author">${esc(q.author)}</span>
        <span class="qa-card-top-right">
          ${q.closed
            ? '<span class="qa-badge closed">CLOSED</span>'
            : '<span class="qa-badge open">OPEN</span>'}
          ${adminDel}
        </span>
      </div>
      <button class="qa-card-body qa-open" type="button" onclick="League.openQuestion('${q.id}')">${esc(q.body)}</button>
      <div class="qa-card-meta">${n} answer${n !== 1 ? 's' : ''} · ${formatDate(q.timestamp)}</div>
    </article>`;
  };

  cont.innerHTML = `
    <div class="qa-list-view">
      <div class="panel qa-ask-panel">
        <div class="panel-header">Ask the league</div>
        <div class="panel-body">
          <label for="qaAskBody">Your question</label><textarea id="qaAskBody" maxlength="2000" rows="3" placeholder="Write your question for the league..."></textarea>
          <div id="qaAskError" class="login-error hidden"></div>
          <button id="postQuestionButton" type="button" class="btn-primary" onclick="League.submitQuestion()">Post question</button>
        </div>
      </div>
      <h3 class="qa-section-title">Open (${open.length})</h3>
      <div class="qa-list">${open.length ? open.map(card).join('') : '<div class="empty-state">No open questions yet.</div>'}</div>
      ${closed.length ? `<h3 class="qa-section-title">Closed (${closed.length})</h3>
        <div class="qa-list">${closed.map(card).join('')}</div>` : ''}
      ${isAdmin() && closed.length ? `
      <div class="qa-admin-actions">
        <button class="btn-danger btn-sm" onclick="League.deleteAllClosedQuestions()">🗑️ Delete all closed questions (${closed.length})</button>
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
      ? `<button class="btn-sm qa-mark-correct" onclick="event.stopPropagation();League.markCorrectAnswer('${q.id}','${a.id}')">✓ Mark Correct</button>`
      : '';
    return `<div class="qa-answer ${isCorrect ? 'correct' : ''}">
      <div class="qa-answer-top">
        <span class="qa-author">${esc(a.author)}</span>
        ${isCorrect ? '<span class="qa-badge correct">✓ CORRECT</span>' : ''}
      </div>
      <p class="qa-answer-body">${esc(a.body)}</p>
      <div class="qa-answer-foot">
        <span class="qa-card-meta">${formatDate(a.timestamp)}</span>
        ${markBtn}
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">No answers yet. Be the first!</div>';

  cont.innerHTML = `
    <div class="qa-detail-view">
      <button class="btn-sm qa-back" onclick="League.backToQuestions()">← All Questions</button>
      <div class="panel qa-question-panel">
        <div class="panel-header qa-detail-header">
          <span>Question by ${esc(q.author)}</span>
          <span class="qa-card-top-right">
            ${q.closed ? '<span class="qa-badge closed">CLOSED</span>' : '<span class="qa-badge open">OPEN</span>'}
            ${isAdmin() ? `<button class="btn-sm delete" onclick="League.deleteQuestion('${q.id}')">🗑️ Delete Question</button>` : ''}
          </span>
        </div>
        <div class="panel-body">
          <p class="qa-question-body">${esc(q.body)}</p>
          ${q.closed && isAuthor ? '<p class="qa-hint">You picked the correct answer. No more replies.</p>' : ''}
          ${!q.closed && isAuthor ? '<p class="qa-hint">Pick one answer as correct to close this question.</p>' : ''}
        </div>
      </div>
      <h3 class="qa-section-title">Answers (${answers.length})</h3>
      <div class="qa-answers">${answerHtml}</div>
      ${canAnswer ? `
      <div class="panel qa-answer-panel">
        <div class="panel-header">Join the discussion</div>
        <div class="panel-body">
          <label for="qaAnswerBody">Your answer</label><textarea id="qaAnswerBody" maxlength="4000" rows="3" placeholder="Write your answer..."></textarea>
          <div id="qaAnswerError" class="login-error hidden"></div>
          <button id="postAnswerButton" type="button" class="btn-primary" onclick="League.submitAnswer('${q.id}')">Post answer</button>
        </div>
      </div>` : '<div class="qa-closed-note">🔒 This question is closed — no more answers.</div>'}
    </div>`;
}

export async function submitQuestion() {
  const err = document.getElementById('qaAskError');
  const body = (document.getElementById('qaAskBody')?.value || '').trim();
  if (!sb) return showError(err, 'Connection unavailable. Please refresh.');
  if (!state.user) return showError(err, 'Please log in.');
  if (!body) return showError(err, 'Please write a question.');
  if (body.length < 3) return showError(err, 'Question is too short.');

  const { data, error } = await sb.from('questions')
    .insert({ author: state.user, body, timestamp: Date.now() })
    .select().single();
  if (error) {
    if (isQaTableMissing(error)) return showError(err, 'Questions are unavailable. Please contact the league administrator.');
    return showError(err, 'Could not post question.');
  }

  state.db.questions.unshift(mapQuestion(data));

  err?.classList.add('hidden');
  showToast('Question posted!');
  state.questionId = null;
  renderQuestions();
}

export async function submitAnswer(questionId) {
  const err = document.getElementById('qaAnswerError');
  const body = (document.getElementById('qaAnswerBody')?.value || '').trim();
  const q = state.db.questions.find(x => x.id === questionId);
  if (!sb) return showError(err, 'Connection unavailable. Please refresh.');
  if (!state.user) return showError(err, 'Please log in.');
  if (!q) return;
  if (q.closed) return showError(err, 'This question is closed.');
  if (!body) return showError(err, 'Please write an answer.');
  if (body.length < 2) return showError(err, 'Answer is too short.');

  const { data, error } = await sb.from('answers')
    .insert({ question_id: questionId, author: state.user, body, timestamp: Date.now() })
    .select().single();
  if (error) {
    if (isQaTableMissing(error)) return showError(err, 'Questions are unavailable. Please contact the league administrator.');
    return showError(err, 'Could not post answer.');
  }

  state.db.answers.push(mapAnswer(data));

  err?.classList.add('hidden');
  showToast('Answer posted!');
  renderQuestionDetail(questionId);
}

export function deleteQuestion(id) {
  if (!requireAdmin()) return;
  const q = state.db.questions.find(x => x.id === id);
  if (!q) return;
  const n = getQuestionAnswers(id).length;
  showConfirm(
    'Delete Question',
    `Delete this question and ${n} answer${n !== 1 ? 's' : ''}? This cannot be undone.`,
    async () => {
      if (!sb) return showToast('Connection unavailable. Please refresh.', true);
      const { error } = await sb.from('questions').delete().eq('id', id);
      if (error) return showToast('Could not delete question.', true);

      state.db.questions = state.db.questions.filter(x => x.id !== id);
      state.db.answers = state.db.answers.filter(a => a.questionId !== id);

      if (state.questionId === id) state.questionId = null;
      showToast('Question deleted.');
      renderQuestions();
    }
  );
}

export function deleteAllClosedQuestions() {
  if (!requireAdmin()) return;
  const closed = state.db.questions.filter(q => q.closed);
  if (!closed.length) return showToast('No closed questions to delete.', true);
  const totalAnswers = closed.reduce((sum, q) => sum + getQuestionAnswers(q.id).length, 0);
  showConfirm(
    'Delete All Closed Questions',
    `Delete ${closed.length} closed question(s) and ${totalAnswers} answer(s)? This cannot be undone.`,
    async () => {
      if (!sb) return showToast('Connection unavailable. Please refresh.', true);
      const ids = closed.map(q => q.id);
      const { error } = await sb.from('questions').delete().in('id', ids);
      if (error) return showToast('Could not delete questions.', true);

      const idSet = new Set(ids);
      state.db.questions = state.db.questions.filter(q => !idSet.has(q.id));
      state.db.answers = state.db.answers.filter(a => !idSet.has(a.questionId));

      state.questionId = null;
      showToast(`${closed.length} question(s) deleted.`);
      renderQuestions();
    }
  );
}

export function markCorrectAnswer(questionId, answerId) {
  const q = state.db.questions.find(x => x.id === questionId);
  if (!q) return;
  if (q.author !== state.user) return showToast('Only the person who asked can pick the correct answer.', true);
  if (q.closed) return showToast('This question is already closed.', true);
  const ans = state.db.answers.find(a => a.id === answerId && a.questionId === questionId);
  if (!ans) return showToast('Answer not found.', true);

  showConfirm(
    'Mark Correct Answer',
    `Mark ${ans.author}'s answer as correct? The question will close and no one can reply anymore.`,
    async () => {
      if (!sb) return showToast('Connection unavailable. Please refresh.', true);
      const { error } = await sb.from('questions')
        .update({ closed: true, correct_answer_id: answerId })
        .eq('id', questionId);
      if (error) return showToast('Could not close question.', true);

      q.closed = true;
      q.correctAnswerId = answerId;

      showToast('Correct answer chosen — question closed!');
      renderQuestionDetail(questionId);
    }
  );
}
