/* 一卡一翻的共用内核：题目、作答、翻面回应、追问、提交都在这里；外壳只管长相和翻面方式。
 * 用法：GAFFlip.start({ skin: 'receipt', intro: '……，', labels: {...}, hooks: {...} })
 * hooks（都可选）：
 *   front(face, q, i)      正面画好之后，可以往里加装饰
 *   back(face, q, i)       背面画好之后
 *   reply(el, text)        自己决定回应怎么出现（默认直接显示）
 *   flip(toBack, scene)    翻面时调用（放音效、加特效）
 *   ready(app)             每屏画好后调用 */
(() => {
'use strict';
const { QUESTIONS, session, feedbackFor, followUpFor } = window.GAF, { el, questionInputs, introCard, doSubmit } = window.GAFUI;
const DEF = { turn: '写好了，翻过来', prev: '上一题', again: '翻回去改改', next: '下一题', submit: '提交', mine: '你写的', group: (q) => `${q.g} 组`, count: (q) => `第 ${q.n} / 10 题` };

function start(cfg) {
  const L = Object.assign({}, DEF, cfg.labels || {}), H = cfg.hooks || {};
  const sess = session('with_feedback', 'skin-' + cfg.skin), app = document.getElementById('app');
  let i = Math.min(sess.s.cursor || 0, QUESTIONS.length - 1), t0 = 0;
  const leave = () => { if (t0) { sess.tick(QUESTIONS[i].n, performance.now() - t0); t0 = 0; } sess.save(); };

  function echoOf(a) {
    const box = el('div', 'echo');
    if (a.skipped) { box.textContent = '👽'; return box; }
    Object.values(a.images || {}).forEach((im) => { const img = el('img'); img.alt = ''; img.src = 'data:' + im.mime + ';base64,' + im.data; box.appendChild(img); });
    const t = (a.text || '').trim(); if (t) box.appendChild(el('span', null, '')).textContent = t.length > 80 ? t.slice(0, 80) + '…' : t;
    return box;
  }

  function show() {
    app.innerHTML = ''; t0 = performance.now();
    const q = QUESTIONS[i], a = sess.answer(q.n), last = i === QUESTIONS.length - 1;
    const top = el('div', 'top');
    top.appendChild(el('div', 'progress', `<i style="width:${(i / QUESTIONS.length) * 100}%"></i>`)); top.appendChild(el('span', 'count', L.count(q)));
    app.appendChild(top);
    const scene = el('div', 'scene'), flipper = el('div', 'flipper'); scene.appendChild(flipper);
    const front = el('section', 'face front card');
    front.appendChild(el('div', 'qhead', `<div class="qn">${L.group(q)}</div><h2>${q.q}</h2>`));
    const turn = el('button', 'btn pri turn', L.turn), back0 = el('button', 'btn', L.prev);
    turn.type = back0.type = 'button'; back0.disabled = i === 0;
    const refresh = () => (turn.disabled = !sess.isDone(q.n));
    const box = questionInputs(q, sess, refresh); front.appendChild(box);
    const nav = el('div', 'nav'); nav.appendChild(back0); nav.appendChild(turn); front.appendChild(nav);
    const back = el('section', 'face back card'); back.inert = true;
    flipper.appendChild(front); flipper.appendChild(back); app.appendChild(scene); refresh();
    if (H.front) H.front(front, q, i);
    setTimeout(() => box.focusField && box.focusField(), 380);

    function paintBack() {
      back.innerHTML = '';
      back.appendChild(el('div', 'qn', `${L.count(q)} · ${L.mine}`));
      back.appendChild(echoOf(a));
      const fb = feedbackFor(q.n, a);
      sess.s.feedback = (sess.s.feedback || []).filter((f) => f.n !== q.n).concat([{ n: q.n, text: fb }]);
      const reply = el('p', 'reply'); back.appendChild(reply);
      if (H.reply) H.reply(reply, fb); else reply.textContent = fb;
      const fq = a.followup_q || followUpFor(q.n, a);
      if (fq) {
        a.followup_q = fq;
        const f = el('div', 'follow'); f.appendChild(el('p', null, fq));
        const ta = el('textarea'); ta.placeholder = '补充一句（可选）'; ta.id = 'q' + q.n + '-followup'; ta.value = a.followup || ''; ta.setAttribute('aria-label', '补充回答');
        ta.oninput = () => { a.followup = ta.value; sess.save(); };
        f.appendChild(ta); back.appendChild(f);
      }
      const r = el('div', 'nav'), again = el('button', 'btn', L.again), go = el('button', 'btn pri', last ? L.submit : L.next);
      again.type = go.type = 'button'; r.appendChild(again); r.appendChild(go); back.appendChild(r); back.appendChild(el('p', 'err'));
      again.onclick = () => { flipper.classList.remove('flipped'); back.inert = true; front.inert = false; t0 = performance.now(); if (H.flip) H.flip(false, scene); };
      go.onclick = () => { sess.s.cursor = last ? i : i + 1; sess.save(); if (last) doSubmit(sess, scene, { skin: cfg.skin }); else { i++; show(); } };
      if (H.back) H.back(back, q, i);
      sess.save();
    }
    turn.onclick = () => { leave(); paintBack(); front.inert = true; back.inert = false; flipper.classList.add('flipped'); if (H.flip) H.flip(true, scene); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    back0.onclick = () => { leave(); i--; sess.s.cursor = i; sess.save(); show(); };
    front.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !turn.disabled) turn.click(); });
    if (H.ready) H.ready(app);
  }
  if (sess.s.consent && Object.keys(sess.s.answers).length) show();
  else { app.appendChild(introCard(sess, cfg.intro || '一次只问一题。写好后卡片会翻过来，背面是对你这句话的回应，', show)); if (H.ready) H.ready(app); }
}

/* 小工具：逐字打出来 */
function typewriter(node, text, speed = 38) {
  node.textContent = ''; let k = 0;
  const tick = () => { node.textContent = text.slice(0, ++k); if (k < text.length) setTimeout(tick, speed); };
  setTimeout(tick, 420);
}
/* 小工具：合成一个短音（不需要音频文件） */
let ac = null;
function blip(freq = 660, dur = 0.08, type = 'square', vol = 0.05) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
window.GAFFlip = { start, typewriter, blip };
})();
