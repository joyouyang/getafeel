/* 传纸条的共用内核：开场纸条 → 每张纸条 = 对上一题的回应（+ 追问）+ 下一题 → 扔出去 → 下一张扔回来 → 最后一张交卷。
 * 外壳只管纸条长什么样、怎么扔：
 *   GAFNote.start({ skin, swipe, introLine, throwLabel, out(note, kind, info), in(note, kind), decorate(note, i) })
 *   swipe: true 时没有按钮：往左滑扔走、往右滑捡回上一张（info.dx 是松手时纸条已经被拖出去的距离；上下滑仍是滚动页面）。
 *     手势不靠文字讲：开场纸条就是教程（自己往左晃、纸条外有一个手指圆点往左划，滑走就开始）；
 *     第一次到第 2 张时教一次右滑；之后只在写完时，纸条外出现往左划的圆点，纸条自己往左晃一下。
 *   out / in 返回 Promise；kind 是 'next'（往下传）或 'back'（捡回上一张）。 */
(() => {
'use strict';
const { QUESTIONS, session, feedbackFor, followUpFor, submit, downloadBackup } = window.GAF, { el, questionInputs } = window.GAFUI;
const END = QUESTIONS.length;   // 第 END 张只有对最后一题的回应和交卷
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 用"正"字记数：每扔出一张多一笔 */
const STROKES = ['M6 7L34 6', 'M20 7L21 34', 'M21 20L31 21', 'M10 19L10 34', 'M4 35L36 34'];
function tally(k) {
  let s = '<svg class="tally" viewBox="0 0 84 40" aria-hidden="true">';
  for (let j = 0; j < k; j++) s += `<path d="${STROKES[j % 5]}" transform="translate(${Math.floor(j / 5) * 44} 0)"/>`;
  return s + '</svg>';
}
/* 揉纸的沙沙声：一小段过滤过的噪声，不用音频文件 */
let ac = null;
function rustle(dur = 0.28) {
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (0.4 + 0.6 * Math.random() * Math.random()) * Math.pow(1 - k / n, 1.5);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'highpass'; f.frequency.value = 2200; g.gain.value = 0.16;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(ac.destination); src.start(); } catch (e) {}
}

/* 纸条外、紧挨着纸条下方的手势示意（纸条很长时贴在屏幕底边）：一个手指圆点带着拖痕往左（或往右）划，可以配一句话；提醒也出现在这里 */
function makeGuide() {
  const node = el('div', 'guide'), lane = el('div', 'lane', '<i class="trail"></i><i class="dot"></i>'), cap = el('p', 'cap'), warn = el('p', 'warn');
  node.setAttribute('aria-live', 'polite'); lane.setAttribute('aria-hidden', 'true');
  node.appendChild(lane); node.appendChild(cap); node.appendChild(warn);
  let tm = null;
  return {
    node,
    show(dir, text) { node.classList.add('on'); node.classList.toggle('right', dir > 0); cap.textContent = text || ''; },
    hide() { node.classList.remove('on'); cap.textContent = ''; },
    warn(text) { warn.textContent = text; node.classList.add('warning'); warn.classList.remove('show'); void warn.offsetWidth; warn.classList.add('show');
      clearTimeout(tm); tm = setTimeout(() => { warn.classList.remove('show'); node.classList.remove('warning'); }, 2600); },
    clearWarn() { clearTimeout(tm); warn.classList.remove('show'); node.classList.remove('warning'); },
  };
}
/* 纸条自己往一边晃一下，告诉人它可以往那边拖 */
function nudge(note, dir) {
  if (calm || note.classList.contains('dragging') || note.style.transform) return;
  note.animate([{ transform: 'none' }, { offset: 0.4, transform: `translateX(${dir * 28}px) rotate(${dir * 0.8}deg)` }, { transform: 'none' }], { duration: 750, easing: 'ease-in-out' });
}

/* 往左滑扔走，往右滑捡回上一张。手指先往哪个方向走就算哪种手势：横着是扔或捡，竖着是正常滚动页面；在输入框、按钮、画板上起手不算。
 * canThrow() 为假时往左拖不远，松手弹回并提醒；canBack() 为假时不能往右拖。没拖动、只是点了一下时调用 onTap。 */
function swipeable(note, { canThrow, onThrow, canBack, onBack, onRefuse, onTap }) {
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
    if (!dragging) { if (onTap) onTap(); return; }
    note.classList.remove('dragging');
    if (canThrow() && (dx < -100 || (dx < -30 && vel < -0.6))) { onThrow(dx); return; }
    if (canBack() && (dx > 100 || (dx > 30 && vel > 0.6))) { onBack(dx); return; }
    const from = note.style.transform; note.style.transform = '';
    note.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    if (!canThrow() && dx < -12) { onRefuse(); note.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260, delay: 220 }); }
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
  const guide = cfg.swipe ? makeGuide() : null;
  if (guide) { app.appendChild(guide.node); app.classList.add('has-guide'); }
  let i = sess.s.consent ? Math.min(sess.s.cursor || 0, END) : -1, t0 = 0, busy = false;
  let cur = null;   // 当前纸条的 { note, throwIt, backIt, ready, onShown }，给键盘左右键和手势示意用
  const leave = () => { if (t0 && i >= 0 && i < END) sess.tick(QUESTIONS[i].n, performance.now() - t0); t0 = 0; sess.save(); };
  const btn = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };

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

  /* swipe 模式：给纸条装上手势，并决定纸条外的示意怎么出现 */
  function gestures(note, k, { canThrow, throwIt, backIt, firstText }) {
    const state = { note, throwIt, backIt: backIt || null, canThrow };
    let nudged = false, idle = null;
    const paint = () => {   // 写完了才出现往左划的圆点
      if (cur !== state || busy || state.teaching) return;
      if (canThrow()) { guide.show(-1, firstText ? firstText() : ''); guide.clearWarn(); }
      else guide.hide();
    };
    state.refresh = () => {   // 每次改动答案都会调用：刚写完、停手一会儿，纸条自己往左晃一下（每张一次）
      paint();
      clearTimeout(idle);
      if (canThrow() && !nudged) idle = setTimeout(() => { if (cur === state && !busy && canThrow()) { nudged = true; nudge(note, -1); } }, 1400);
    };
    state.onShown = () => {
      if (k === 1 && backIt && !sess.s.tutRight) {   // 第一次到第 2 张：教一次右滑
        state.teaching = true; sess.s.tutRight = true; sess.save();
        guide.show(1, '写错了？往右滑，把上一张捡回来');
        later(() => nudge(note, 1), 500); later(() => nudge(note, 1), 2600);
        later(() => { state.teaching = false; paint(); }, 4800);
      } else paint();
    };
    swipeable(note, {
      canThrow: () => !busy && canThrow(), onThrow: (dx) => throwIt(dx),
      canBack: () => !busy && !!backIt, onBack: (dx) => backIt(dx),
      onRefuse: () => guide.warn('先写一点，或者点「不告诉你」'),
      onTap: k < 0 ? () => nudge(note, -1) : null,
    });
    return state;
  }

  /* 按钮模式（其他纸条 demo）：纸条底部一个"扔"按钮 */
  function thrower(label, canThrow, onThrow, fixed) {   // fixed：按钮就用 label，不换成外壳的"扔"字样
    const b = btn('btn pri', fixed ? label : (cfg.throwLabel || label));
    b.onclick = () => { if (!busy && canThrow()) onThrow(0); };
    return { node: b, refresh: () => (b.disabled = !canThrow()) };
  }

  function noteFor(k) {
    const note = el('section', 'note');
    if (k < 0) {   // 开场：swipe 模式下它就是教程，往左滑走就开始
      note.classList.add('intro');
      note.appendChild(el('h1', null, '嗨，交个朋友吧？'));
      note.appendChild(el('p', 'lead', cfg.introLine || `我传你 10 张小纸条，写完${cfg.verb || '扔'}回来就好。<br>不想答的，点「不告诉你」就行。`));
      const begin = (dx) => { if (busy) return; sess.s.consent = true; sess.s.cursor = 0; sess.save(); move(0, 'next', null, { dx: dx || 0 }); };
      if (cfg.swipe) {
        note.appendChild(el('p', 'small', '你写的会交给 AI，帮我做几件送你的小作品，原话只有我看得到。滑走这张，就当你答应啦。'));
        const st = gestures(note, k, { canThrow: () => true, throwIt: begin, firstText: () => '把这张纸条往左滑，就开始了' });
        st.onShown = () => { guide.show(-1, '把这张纸条往左滑，就开始了'); [600, 3600, 6600, 9600].forEach((ms) => later(() => nudge(note, -1), ms)); };
        note.gesture = st;
      } else {
        note.appendChild(el('p', 'small', '你写的会交给 AI，帮我做几件送你的小作品。原话只有我看得到。'));
        const go = btn('btn pri', '好呀'); go.onclick = () => begin(0);
        const r = el('div', 'nav'); r.appendChild(go); note.appendChild(r);
      }
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
        if (guide) guide.show(-1, '正在传…'); else t.node.disabled = true;
        err.textContent = '';
        try { const p = await submit(sess, { skin: 'note-' + cfg.skin }); move('done', 'next', p); }
        catch (e) {
          err.innerHTML = e.message + '。可以再试一次，或者 <a href="#">把纸条存成文件</a> 发给我。';
          err.querySelector('a').onclick = (ev) => { ev.preventDefault(); downloadBackup(sess); };
          sending = false; if (guide) guide.show(-1, '往左滑，再传一次'); else t.node.disabled = false;
        }
      };
      if (cfg.swipe) note.gesture = gestures(note, k, { canThrow: () => !sending, throwIt: send, backIt: goBack, firstText: () => (sending ? '正在传…' : '往左滑，都交给你') });
      else { t = thrower('都交给你', () => !sending, send, true); t.refresh(); r.appendChild(t.node); note.appendChild(r); }
      note.appendChild(err);
      return note;
    }

    const q = QUESTIONS[k];
    note.appendChild(el('h2', null, q.q + '：'));
    const ready = () => sess.isDone(q.n);
    const toss = (dx) => {
      if (busy || !ready()) return;
      leave();
      const a = sess.answer(q.n);
      if (!a.followup) a.followup_q = followUpFor(q.n, a) || '';
      sess.s.feedback = (sess.s.feedback || []).filter((f) => f.n !== q.n).concat([{ n: q.n, text: feedbackFor(q.n, a) }]);
      sess.s.cursor = k + 1; sess.save(); move(k + 1, 'next', null, { dx });
    };
    let t = null;
    if (cfg.swipe) note.gesture = gestures(note, k, { canThrow: ready, throwIt: toss, backIt: goBack, firstText: k === 0 ? () => '写好了，往左滑扔给我' : null });
    else t = thrower('扔回给我', ready, toss);
    const refresh = () => (note.gesture ? note.gesture.refresh() : t.refresh());
    const box = questionInputs(q, sess, refresh); note.appendChild(box);
    note.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.closest('.qbody')) return;
      if (ready() && !busy) toss(0); else if (guide) guide.warn('先写一点，或者点「不告诉你」');
    });
    if (!cfg.swipe) { if (!k) r.appendChild(el('span')); r.appendChild(t.node); note.appendChild(r); t.refresh(); }
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

  function shown(note) {   // 纸条落定之后
    busy = false; t0 = performance.now();
    cur = note.gesture || null;
    if (cur && cur.onShown) cur.onShown();
    if (note.focusField && matchMedia('(pointer: fine)').matches) note.focusField();
  }

  async function move(next, kind, p, info) {
    busy = true; clearTimers(); cur = null;
    if (guide) { guide.hide(); guide.clearWarn(); }
    const old = stage.querySelector('.note');
    if (old) { old.inert = true; rustle(); if (!calm) await cfg.out(old, kind, info || { dx: 0 }); old.remove(); }
    i = next; paintTop();
    const note = next === 'done' ? doneNote(p) : noteFor(next);
    stage.appendChild(note);
    if (cfg.decorate) cfg.decorate(note, next);
    window.scrollTo({ top: 0 });
    if (!calm) await cfg.in(note, kind);
    shown(note);
  }

  /* 电脑上：没在输入框里时，方向键左右也能扔和捡 */
  if (cfg.swipe) addEventListener('keydown', (e) => {
    if (!cur || busy || /INPUT|TEXTAREA/.test(e.target.tagName) || document.querySelector('.sheet')) return;
    if (e.key === 'ArrowLeft') { if (cur.canThrow()) cur.throwIt(0); else guide.warn('先写一点，或者点「不告诉你」'); }
    else if (e.key === 'ArrowRight' && cur.backIt) cur.backIt(0);
  });

  paintTop();
  const first = noteFor(i); stage.appendChild(first); if (cfg.decorate) cfg.decorate(first, i);
  if (!calm) { busy = true; cfg.in(first, 'next').then(() => shown(first)); } else shown(first);
}

/* 外壳常用：Web Animations 的简写，返回 Promise。飞进来用 backwards（结束后回到 CSS 的样子），飞出去用 forwards（停在看不见的地方） */
const anim = (node, frames, opts) => node.animate(frames, Object.assign({ fill: 'backwards' }, opts)).finished.catch(() => {});
const gone = (node, frames, opts) => anim(node, frames, Object.assign({ fill: 'forwards' }, opts));
window.GAFNote = { start, anim, gone, rustle };
})();
