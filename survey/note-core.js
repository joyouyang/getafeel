/* 传纸条的共用内核：开场纸条 → 每张纸条 = 对上一题的回应（+ 追问）+ 下一题 → 扔出去 → 下一张扔回来 → 最后一张交卷。
 * 外壳只管纸条长什么样、怎么扔：
 *   GAFNote.start({ skin, swipe, introLine, throwLabel, out(note, kind, info), in(note, kind), decorate(note, i) })
 *   swipe: true 时没有按钮：往左滑扔走、往右滑捡回上一张（info.dx 是松手时纸条已经被拖出去的距离；上下滑仍是滚动页面）；
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
/* 上滑提示里的手画小箭头：dir = -1 朝左，1 朝右 */
const wob = (n) => (Math.random() - 0.5) * n;
const f1 = (x) => x.toFixed(1);
function sideArrow(dir) {
  const svg = `<svg viewBox="0 0 44 24" aria-hidden="true"><path d="M41 12 C 30 ${f1(11 + wob(3))}, 16 ${f1(13 + wob(3))}, 4 12"/><path d="M4 12 L${f1(13 + wob(2))} ${f1(4 + wob(2))} M4 12 L${f1(13 + wob(2))} ${f1(20 + wob(2))}"/></svg>`;
  return dir > 0 ? svg.replace('<svg ', '<svg style="transform:scaleX(-1)" ') : svg;
}
/* 揉纸的沙沙声：一小段过滤过的噪声，不用音频文件 */
let ac = null;
function rustle(dur = 0.28) {
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (0.4 + 0.6 * Math.random() * Math.random()) * Math.pow(1 - k / n, 1.5);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'highpass'; f.frequency.value = 2200; g.gain.value = 0.16;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(ac.destination); src.start(); } catch (e) {}
}

/* 往左滑扔走，往右滑捡回上一张。手指先往哪个方向走就算哪种手势：横着是扔或捡，竖着是正常滚动页面；在输入框、按钮、画板上起手不算。
 * canThrow() 为假时往左拖不远，松手弹回并提示；canBack() 为假（第一题）时不能往右拖。 */
function swipeable(note, { canThrow, onThrow, canBack, onBack, hint }) {
  let active = false, dragging = false, sx = 0, sy = 0, dx = 0, lx = 0, lt = 0, vel = 0;
  const skip = (t) => t.closest('input,textarea,button,label,canvas,a,select,.pic,.sheet');
  const place = () => (note.style.transform = `translateX(${dx}px) rotate(${(dx * 0.02).toFixed(2)}deg)`);
  const begin = (x, y, target) => { if (note.inert || skip(target)) return false; active = true; dragging = false; sx = lx = x; sy = y; dx = 0; vel = 0; lt = performance.now(); return true; };
  const drag = (x, y, e) => {
    if (!active) return;
    const d = x - sx, v = y - sy;
    if (!dragging) {
      if (Math.abs(d) < 6 && Math.abs(v) < 6) return;
      if (Math.abs(d) > Math.abs(v) * 1.2 && (d < 0 || canBack())) dragging = true;
      else { active = false; return; }
      note.classList.add('dragging');
    }
    if (e.cancelable) e.preventDefault();
    const now = performance.now(); vel = (x - lx) / Math.max(1, now - lt); lx = x; lt = now;
    dx = d < 0 ? (canThrow() ? d : d * 0.22) : (canBack() ? d : 0); place();
  };
  const finish = () => {
    if (!active) return; active = false;
    if (!dragging) return;
    note.classList.remove('dragging');
    if (canThrow() && (dx < -100 || (dx < -30 && vel < -0.6))) { onThrow(dx); return; }
    if (canBack() && (dx > 100 || (dx > 30 && vel > 0.6))) { onBack(dx); return; }
    const from = note.style.transform; note.style.transform = '';
    note.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    if (!canThrow() && dx < -12) { hint.warn(); note.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260, delay: 220 }); }
  };
  note.addEventListener('touchstart', (e) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); }, { passive: true });
  note.addEventListener('touchmove', (e) => drag(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
  note.addEventListener('touchend', finish); note.addEventListener('touchcancel', finish);
  note.addEventListener('mousedown', (e) => { if (e.button === 0 && begin(e.clientX, e.clientY, e.target)) e.preventDefault(); });
  addEventListener('mousemove', (e) => { if (active && note.isConnected) drag(e.clientX, e.clientY, e); });
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

  /* 纸条底部：左右滑提示（swipe 模式）或"扔"按钮。onBack 为空表示没有上一张 */
  function thrower(note, label, canThrow, onThrow, fixed, onBack) {   // fixed：按钮就用 label，不换成外壳的"扔"字样
    if (!cfg.swipe) {
      const b = btn('btn pri', fixed ? label : (cfg.throwLabel || label));
      b.onclick = () => { if (!busy && canThrow()) onThrow(0); };
      return { node: b, refresh: () => (b.disabled = !canThrow()) };
    }
    const verb = fine ? '拖' : '滑', row = el('div', 'swipe-row');
    const h = el('div', 'swipe', sideArrow(-1) + `<span>往左${verb}，${label}</span>`), msg = el('p', 'warn');
    row.appendChild(h);
    if (onBack) row.appendChild(el('div', 'swipe back', `<span>捡回上一张</span>` + sideArrow(1)));
    const wrap = el('div', 'swipe-wrap'); wrap.appendChild(row); wrap.appendChild(msg);
    const hint = { warn: (t) => { msg.textContent = t || '先写一点，或者点「不告诉你」'; msg.classList.remove('show'); void msg.offsetWidth; msg.classList.add('show'); } };
    swipeable(note, { canThrow: () => !busy && canThrow(), onThrow, canBack: () => !busy && !!onBack, onBack: (dx) => onBack(dx), hint });
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
    const goBack = k > 0 ? (dx) => { if (busy) return; leave(); sess.s.cursor = k - 1; sess.save(); move(k - 1, 'back', null, { dx: dx || 0 }); } : null;
    const r = el('div', 'nav');
    if (k > 0 && !cfg.swipe) { const back = btn('link', '← 捡回上一张'); back.onclick = () => goBack(0); r.appendChild(back); }

    if (k === END) {   // 最后一张：交卷
      note.appendChild(el('p', 'lead', '就这些啦，谢谢你陪我传纸条。'));
      const err = el('p', 'err');
      let sending = false, t = null;
      const send = async (dx) => {
        if (busy || sending) return; sending = true;
        if (dx) { const from = note.style.transform; note.style.transform = ''; note.animate([{ transform: from }, { transform: 'none' }], { duration: 240 }); }
        t.node.classList.add('sending'); err.textContent = '正在传…';
        try { const p = await submit(sess, { skin: 'note-' + cfg.skin }); move('done', 'next', p); }
        catch (e) {
          err.innerHTML = e.message + '。可以再试一次，或者 <a href="#">把纸条存成文件</a> 发给我。';
          err.querySelector('a').onclick = (ev) => { ev.preventDefault(); downloadBackup(sess); };
          t.node.classList.remove('sending'); sending = false;
        }
      };
      t = thrower(note, '都交给你', () => !sending, send, true, goBack); t.refresh();
      if (cfg.swipe) note.appendChild(t.node);
      else { r.appendChild(t.node); note.appendChild(r); }
      note.appendChild(err);
      return note;
    }

    const q = QUESTIONS[k];
    note.appendChild(el('h2', null, q.q + '：'));
    const toss = (dx) => {
      leave();
      const a = sess.answer(q.n);
      if (!a.followup) a.followup_q = followUpFor(q.n, a) || '';
      sess.s.feedback = (sess.s.feedback || []).filter((f) => f.n !== q.n).concat([{ n: q.n, text: feedbackFor(q.n, a) }]);
      sess.s.cursor = k + 1; sess.save(); move(k + 1, 'next', null, { dx });
    };
    const t = thrower(note, '扔回给我', () => sess.isDone(q.n), toss, false, goBack);
    const box = questionInputs(q, sess, () => t.refresh()); note.appendChild(box);
    note.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.closest('.qbody')) return;
      if (sess.isDone(q.n) && !busy) toss(0); else if (t.hint) t.hint.warn();
    });
    if (cfg.swipe) note.appendChild(t.node);
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
    if (old) { old.inert = true; rustle(); if (!calm) await cfg.out(old, kind, info || { dx: 0 }); old.remove(); }
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
