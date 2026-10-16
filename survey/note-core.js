/* 传纸条的共用内核：开场纸条 → 每张纸条 = 对上一题的回应（+ 追问）+ 下一题 → 扔出去 → 下一张扔回来 → 最后一张交卷。
 * 外壳只管纸条长什么样、怎么扔：
 *   GAFNote.start({ skin, swipe, introLine, throwLabel, out(note, kind, info), in(note, kind), decorate(note, i) })
 *   swipe: true 时没有"扔"按钮，往上滑纸条就扔走（info.dy 是松手时纸条已经被拖上去的距离）；
 *   out / in 返回 Promise；kind 是 'next'（往下传）或 'back'（捡回上一张）。 */
(() => {
'use strict';
const { QUESTIONS, session, feedbackFor, followUpFor, submit, downloadBackup } = window.GAF, { el, questionInputs } = window.GAFUI;
const END = QUESTIONS.length;   // 第 END 张只有对最后一题的回应和交卷
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;

/* 用"正"字记数：每扔出一张多一笔 */
const STROKES = ['M6 7L34 6', 'M20 7L21 34', 'M21 20L31 21', 'M10 19L10 34', 'M4 35L36 34'];
function tally(k) {
  let s = '<svg class="tally" viewBox="0 0 84 40" aria-hidden="true">';
  for (let j = 0; j < k; j++) s += `<path d="${STROKES[j % 5]}" transform="translate(${Math.floor(j / 5) * 44} 0)"/>`;
  return s + '</svg>';
}
/* 手画的箭头：从题目那边弯下来，指向回答框；每次抖得不一样 */
const wob = (n) => (Math.random() - 0.5) * n;
const f1 = (x) => x.toFixed(1);
function arrow() {
  const d = `M${f1(96 + wob(8))} ${f1(4 + wob(3))} C ${f1(92 + wob(8))} ${f1(24 + wob(6))}, ${f1(62 + wob(8))} ${f1(34 + wob(4))}, 22 38`;
  const head = `M22 38 L${f1(34 + wob(3))} ${f1(29 + wob(3))} M22 38 L${f1(35 + wob(3))} ${f1(44 + wob(2))}`;
  return el('div', 'arrow', `<svg viewBox="0 0 120 48" aria-hidden="true"><path d="${d}"/><path d="${head}"/></svg>`);
}
function upArrow() {
  return `<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 37 C ${f1(14 + wob(3))} 26, ${f1(16 + wob(3))} 14, 15 4"/><path d="M15 4 L${f1(6 + wob(2))} ${f1(14 + wob(2))} M15 4 L${f1(24 + wob(2))} ${f1(13 + wob(2))}"/></svg>`;
}
/* 揉纸的沙沙声：一小段过滤过的噪声，不用音频文件 */
let ac = null;
function rustle(dur = 0.28) {
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (0.4 + 0.6 * Math.random() * Math.random()) * Math.pow(1 - k / n, 1.5);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'highpass'; f.frequency.value = 2200; g.gain.value = 0.16;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(ac.destination); src.start(); } catch (e) {}
}

/* 往上滑就扔走。页面还能往下滚时先让它滚，滚到底了再往上滑才算扔；在输入框、按钮、画板上起手不算。
 * canThrow() 为假时拖不远，松手弹回并提示。 */
function swipeable(note, { canThrow, onThrow, hint }) {
  let active = false, dragging = false, sy = 0, dy = 0, ly = 0, lt = 0, vel = 0;
  const skip = (t) => t.closest('input,textarea,button,label,canvas,a,select,.pic,.sheet');
  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6;
  const place = () => (note.style.transform = `translateY(${dy}px) rotate(${(-dy * 0.012).toFixed(2)}deg)`);
  const begin = (y, target) => { if (note.inert || skip(target)) return false; active = true; dragging = false; sy = ly = y; dy = 0; vel = 0; lt = performance.now(); return true; };
  const drag = (y, e) => {
    if (!active) return;
    const d = y - sy;
    if (!dragging) {
      if (d < -4 && atBottom()) dragging = true;
      else if (Math.abs(d) > 4) { active = false; return; }
      else return;
      note.classList.add('dragging');
    }
    if (e.cancelable) e.preventDefault();
    const now = performance.now(); vel = (y - ly) / Math.max(1, now - lt); ly = y; lt = now;
    dy = Math.min(0, canThrow() ? d : d * 0.22); place();
  };
  const finish = () => {
    if (!active) return; active = false;
    if (!dragging) return;
    note.classList.remove('dragging');
    if (canThrow() && (dy < -110 || (dy < -30 && vel < -0.6))) { onThrow(dy); return; }
    const from = note.style.transform; note.style.transform = '';
    note.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    if (!canThrow() && dy < -12) { hint.warn(); note.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260, delay: 220 }); }
  };
  note.addEventListener('touchstart', (e) => { if (e.touches.length === 1) begin(e.touches[0].clientY, e.target); }, { passive: true });
  note.addEventListener('touchmove', (e) => drag(e.touches[0].clientY, e), { passive: false });
  note.addEventListener('touchend', finish); note.addEventListener('touchcancel', finish);
  note.addEventListener('mousedown', (e) => { if (e.button === 0 && begin(e.clientY, e.target)) e.preventDefault(); });
  addEventListener('mousemove', (e) => { if (active && note.isConnected) drag(e.clientY, e); });
  addEventListener('mouseup', () => { if (note.isConnected) finish(); });
}

function start(cfg) {
  const sess = session('with_feedback', 'note-' + cfg.skin), app = document.getElementById('app');
  const top = el('div', 'top'), stage = el('div', 'stage');
  app.appendChild(top); app.appendChild(stage);
  let i = sess.s.consent ? Math.min(sess.s.cursor || 0, END) : -1, t0 = 0, busy = false;
  const leave = () => { if (t0 && i >= 0 && i < END) sess.tick(QUESTIONS[i].n, performance.now() - t0); t0 = 0; sess.save(); };
  const btn = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };

  function replyPart(note, q) {   // 对上一题的回应 + 追问
    const a = sess.answer(q.n), f = (sess.s.feedback || []).find((x) => x.n === q.n);
    const box = el('div', 'from');
    box.appendChild(el('p', 'reply')).textContent = f ? f.text : feedbackFor(q.n, a);
    if (a.followup_q) {
      box.appendChild(el('p', 'ask')).textContent = a.followup_q;
      const inp = el('input'); inp.type = 'text'; inp.id = 'q' + q.n + '-followup'; inp.placeholder = '补一句（可选）'; inp.value = a.followup || ''; inp.setAttribute('aria-label', '补充回答');
      inp.oninput = () => { a.followup = inp.value; sess.save(); };
      box.appendChild(inp);
    }
    note.appendChild(box);
  }

  /* 纸条底部：上滑提示（swipe 模式）或"扔"按钮 */
  function thrower(note, label, canThrow, onThrow, fixed) {   // fixed：按钮就用 label，不换成外壳的"扔"字样
    if (!cfg.swipe) {
      const b = btn('btn pri', fixed ? label : (cfg.throwLabel || label));
      b.onclick = () => { if (!busy && canThrow()) onThrow(0); };
      return { node: b, refresh: () => (b.disabled = !canThrow()) };
    }
    const h = el('div', 'swipe', upArrow() + `<span>${fine ? '往上拖' : '往上滑'}，${label}</span>`), msg = el('p', 'warn');
    const wrap = el('div', 'swipe-wrap'); wrap.appendChild(h); wrap.appendChild(msg);
    const hint = { warn: (t) => { msg.textContent = t || '先写一点，或者点「不告诉你」'; msg.classList.remove('show'); void msg.offsetWidth; msg.classList.add('show'); } };
    swipeable(note, { canThrow: () => !busy && canThrow(), onThrow, hint });
    return { node: wrap, hint, refresh: () => { h.classList.toggle('ready', canThrow()); if (canThrow()) msg.classList.remove('show'); } };
  }

  function noteFor(k) {
    const note = el('section', 'note');
    if (k < 0) {   // 开场
      note.classList.add('intro');
      note.appendChild(el('h1', null, '嗨，交个朋友吧？'));
      note.appendChild(el('p', 'lead', cfg.introLine || `我传你 10 张小纸条，写完${cfg.verb || '扔'}回来就好。<br>不想答的，点「不告诉你」就行。`));
      note.appendChild(el('p', 'small', '你写的会交给 AI，帮我做几件送你的小作品。原话只有我看得到。'));
      const go = btn('btn pri', '好呀');
      go.onclick = () => { if (busy) return; sess.s.consent = true; sess.s.cursor = 0; sess.save(); move(0, 'next'); };
      const r = el('div', 'nav'); r.appendChild(go); note.appendChild(r);
      return note;
    }
    if (k > 0) replyPart(note, QUESTIONS[k - 1]);
    const r = el('div', 'nav'), back = btn('link', '← 捡回上一张');
    back.onclick = () => { if (busy) return; leave(); sess.s.cursor = k - 1; sess.save(); move(k - 1, 'back'); };
    if (k > 0) r.appendChild(back);

    if (k === END) {   // 最后一张：交卷
      note.appendChild(el('p', 'lead', '就这些啦，谢谢你陪我传纸条。'));
      const err = el('p', 'err');
      let sending = false, t = null;
      const send = async (dy) => {
        if (busy || sending) return; sending = true;
        if (dy) { const from = note.style.transform; note.style.transform = ''; note.animate([{ transform: from }, { transform: 'none' }], { duration: 240 }); }
        t.node.classList.add('sending'); err.textContent = '正在传…';
        try { const p = await submit(sess, { skin: 'note-' + cfg.skin }); move('done', 'next', p); }
        catch (e) {
          err.innerHTML = e.message + '。可以再试一次，或者 <a href="#">把纸条存成文件</a> 发给我。';
          err.querySelector('a').onclick = (ev) => { ev.preventDefault(); downloadBackup(sess); };
          t.node.classList.remove('sending'); sending = false;
        }
      };
      t = thrower(note, '都交给你', () => !sending, send, true); t.refresh();
      if (cfg.swipe) { note.appendChild(r); note.appendChild(t.node); }
      else { r.appendChild(t.node); note.appendChild(r); }
      note.appendChild(err);
      return note;
    }

    const q = QUESTIONS[k];
    note.appendChild(el('h2', null, q.q + '：'));
    const toss = (dy) => {
      leave();
      const a = sess.answer(q.n);
      if (!a.followup) a.followup_q = followUpFor(q.n, a) || '';
      sess.s.feedback = (sess.s.feedback || []).filter((f) => f.n !== q.n).concat([{ n: q.n, text: feedbackFor(q.n, a) }]);
      sess.s.cursor = k + 1; sess.save(); move(k + 1, 'next', null, { dy });
    };
    const t = thrower(note, '扔回给我', () => sess.isDone(q.n), toss);
    const box = questionInputs(q, sess, () => t.refresh()); note.appendChild(box);
    const target = box.querySelector('input[type=text],input[type=number],textarea,.imgs');
    if (target) target.before(arrow());
    note.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.closest('.qbody')) return;
      if (sess.isDone(q.n) && !busy) toss(0); else if (t.hint) t.hint.warn();
    });
    if (cfg.swipe) { note.appendChild(r); note.appendChild(t.node); }
    else { if (!k) r.appendChild(el('span')); r.appendChild(t.node); note.appendChild(r); }
    t.refresh();
    note.focusField = () => box.focusField && box.focusField();
    return note;
  }

  function doneNote(p) {
    const note = el('section', 'note intro');
    note.appendChild(el('h1', null, '收到啦！'));
    note.appendChild(el('p', 'lead', '我去把它们做成送你的小作品，做好了再传给你。'));
    note.appendChild(el('p', 'small', `纸条编号 ${p.client_id.slice(0, 8)} · 用了 ${Math.max(1, Math.round(p.duration_s / 60))} 分钟`));
    return note;
  }

  function paintTop() {
    top.hidden = typeof i !== 'number' || i < 0;
    if (top.hidden) return;
    top.innerHTML = '';
    top.appendChild(el('span', 'count', i < END ? `${i + 1} / ${END}` : '传完了'));
    top.appendChild(el('span', null, tally(Math.min(i, END))));
  }

  async function move(next, kind, p, info) {
    busy = true;
    const old = stage.querySelector('.note');
    if (old) { old.inert = true; rustle(); if (!calm) await cfg.out(old, kind, info || { dy: 0 }); old.remove(); }
    i = next; paintTop();
    const note = next === 'done' ? doneNote(p) : noteFor(next);
    stage.appendChild(note);
    if (cfg.decorate) cfg.decorate(note, next);
    window.scrollTo({ top: 0 });
    if (!calm) await cfg.in(note, kind);
    busy = false; t0 = performance.now();
    if (note.focusField && fine) note.focusField();
  }

  paintTop();
  const first = noteFor(i); stage.appendChild(first); if (cfg.decorate) cfg.decorate(first, i);
  if (!calm) { busy = true; cfg.in(first, 'next').then(() => { busy = false; t0 = performance.now(); }); } else t0 = performance.now();
}

/* 外壳常用：Web Animations 的简写，返回 Promise。飞进来用 backwards（结束后回到 CSS 的样子），飞出去用 forwards（停在看不见的地方） */
const anim = (node, frames, opts) => node.animate(frames, Object.assign({ fill: 'backwards' }, opts)).finished.catch(() => {});
const gone = (node, frames, opts) => anim(node, frames, Object.assign({ fill: 'forwards' }, opts));
window.GAFNote = { start, anim, gone, rustle };
})();
