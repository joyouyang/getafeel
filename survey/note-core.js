/* 传纸条的共用内核：开场纸条 → 每张纸条 = 对上一题的回应（+ 追问）+ 下一题 → 扔出去 → 下一张扔回来 → 最后一张交卷。
 * 外壳只管纸条长什么样、怎么扔：
 *   GAFNote.start({ skin, throwLabel, out(note, kind), in(note, kind), decorate(note, i) })
 *   out / in 返回 Promise；kind 是 'next'（往下传）或 'back'（捡回上一张）。 */
(() => {
'use strict';
const { QUESTIONS, session, feedbackFor, followUpFor, submit, downloadBackup } = window.GAF, { el, questionInputs } = window.GAFUI;
const END = QUESTIONS.length;   // 第 END 张只有对最后一题的回应和"交给你"
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
const wave = () => el('div', 'sep', '<svg viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true"><path d="M2 5 Q 12 0 22 5 T 42 5 T 62 5 T 82 5 T 102 5 T 122 5 T 142 5 T 162 5 T 182 5 T 198 5"/></svg>');

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
    note.appendChild(box); note.appendChild(wave());
  }

  function noteFor(k) {
    const note = el('section', 'note');
    if (k < 0) {   // 开场
      note.classList.add('intro');
      note.appendChild(el('h1', null, '嗨，交个朋友吧？'));
      note.appendChild(el('p', 'lead', `我传你 10 张小纸条，写完${cfg.verb || '扔'}回来就好。<br>不想答的，发个 👽 就行。`));
      note.appendChild(el('p', 'small', '你写的会交给 AI，帮我做几件送你的小作品。原话只有我看得到。'));
      const go = btn('btn pri', '好呀');
      go.onclick = () => { if (busy) return; sess.s.consent = true; sess.s.cursor = 0; sess.save(); move(0, 'next'); };
      const r = el('div', 'nav'); r.appendChild(go); note.appendChild(r);
      return note;
    }
    if (k > 0) replyPart(note, QUESTIONS[k - 1]);
    const r = el('div', 'nav'), back = btn('link', '← 捡回上一张');
    back.onclick = () => { if (busy) return; leave(); sess.s.cursor = k - 1; sess.save(); move(k - 1, 'back'); };
    if (k === END) {   // 最后一张：交卷
      note.appendChild(el('p', 'lead', '就这些啦，谢谢你陪我传纸条。'));
      const done = btn('btn pri', '都交给你'), err = el('p', 'err');
      done.onclick = async () => {
        if (busy) return; busy = true; done.disabled = true; done.textContent = '正在传…';
        try { const p = await submit(sess, { skin: 'note-' + cfg.skin }); busy = false; move('done', 'next', p); }
        catch (e) {
          err.innerHTML = e.message + '。可以再试一次，或者 <a href="#">把纸条存成文件</a> 发给我。';
          err.querySelector('a').onclick = (ev) => { ev.preventDefault(); downloadBackup(sess); };
          busy = false; done.disabled = false; done.textContent = '都交给你';
        }
      };
      r.appendChild(back); r.appendChild(done); note.appendChild(r); note.appendChild(err);
      return note;
    }
    const q = QUESTIONS[k];
    note.appendChild(el('div', 'qn', `第 ${q.n} 张`));
    note.appendChild(el('h2', null, q.q));
    const toss = btn('btn pri', cfg.throwLabel || '揉成团扔回去');
    const refresh = () => (toss.disabled = !sess.isDone(q.n));
    const box = questionInputs(q, sess, refresh); note.appendChild(box);
    toss.onclick = () => {
      if (busy || toss.disabled) return; leave();
      const a = sess.answer(q.n);
      if (!a.followup) a.followup_q = followUpFor(q.n, a) || '';
      sess.s.feedback = (sess.s.feedback || []).filter((f) => f.n !== q.n).concat([{ n: q.n, text: feedbackFor(q.n, a) }]);
      sess.s.cursor = k + 1; sess.save(); move(k + 1, 'next');
    };
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.closest('.qbody')) toss.click(); });
    if (k > 0) r.appendChild(back); else r.appendChild(el('span'));
    r.appendChild(toss); note.appendChild(r); refresh();
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
    top.appendChild(el('span', 'count', i < END ? `第 ${i + 1} / ${END} 张` : '传完了'));
    top.appendChild(el('span', null, tally(Math.min(i, END))));
  }

  async function move(next, kind, p) {
    busy = true;
    const old = stage.querySelector('.note');
    if (old) { old.inert = true; rustle(); if (!calm) await cfg.out(old, kind); old.remove(); }
    i = next; paintTop();
    const note = next === 'done' ? doneNote(p) : noteFor(next);
    stage.appendChild(note);
    if (cfg.decorate) cfg.decorate(note, next);
    window.scrollTo({ top: 0 });
    if (!calm) await cfg.in(note, kind);
    busy = false; t0 = performance.now();
    if (note.focusField && matchMedia('(pointer: fine)').matches) note.focusField();
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
