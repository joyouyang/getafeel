/* 问卷页面共用的界面片段：一道题的输入区（图片、文字、👽）、开场说明、提交结果页 */
(() => {
'use strict';
const { QUESTIONS, compressImage } = window.GAF;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

/* 一组上传格；返回元素，带 repaint() 供外部清空后重画 */
function uploadGrid(q, a, sess, onChange, onAdd) {
  const grid = el('div', 'imgs'), painters = [];
  q.images.forEach((sl) => {
    const tile = el('label', 'slot');
    const paint = () => {
      tile.innerHTML = '';
      const im = a.images[sl.slot];
      if (im) {
        const img = el('img'); img.alt = sl.label; img.src = 'data:' + im.mime + ';base64,' + im.data; tile.appendChild(img);
        const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', '删除' + sl.label);
        x.onclick = (e) => { e.preventDefault(); delete a.images[sl.slot]; sess.save(); paint(); onChange(); };
        tile.appendChild(x);
      } else {
        tile.appendChild(el('b', null, '＋')); tile.appendChild(el('span', null, sl.label));
        const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('aria-label', '上传' + sl.label);
        inp.onchange = async () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          tile.classList.add('busy');
          try { a.images[sl.slot] = await compressImage(f); if (onAdd) onAdd(); sess.save(); }
          catch (err) { alert(err.message); }
          tile.classList.remove('busy'); paint(); onChange();
        };
        tile.appendChild(inp);
      }
    };
    painters.push(paint); paint(); grid.appendChild(tile);
  });
  grid.repaint = () => painters.forEach((p) => p());
  return grid;
}

/* 渲染一道题的输入区，内容改动时调用 onChange */
function questionInputs(q, sess, onChange) {
  const a = sess.answer(q.n), box = el('div', 'stack');
  const body = el('div', 'qbody' + (a.skipped ? ' off' : ''));
  if (q.hint) body.appendChild(el('p', 'hint', q.hint));
  let field = null;
  if (q.text) {
    if (q.text.kind === 'area') field = el('textarea');
    else { field = el('input'); field.type = q.text.kind === 'number' ? 'number' : 'text'; if (q.text.kind === 'number') { field.min = 1; field.max = 100; field.inputMode = 'numeric'; } }
    field.placeholder = q.text.ph; field.value = a.text || ''; field.id = 'q' + q.n + '-text'; field.setAttribute('aria-label', '第 ' + q.n + ' 题的回答');
    field.oninput = () => { a.text = field.value; sess.save(); onChange(); };
  }
  if (q.doodle && q.images) {
    // 随手画 / 直接传图，二选一：有了一种，另一种自动清掉
    if (field) body.appendChild(field);
    const otherSlots = q.images.map((x) => x.slot);
    let grid, pad;
    pad = doodlePad(a, q.doodle, sess, onChange, () => { otherSlots.forEach((sl) => delete a.images[sl]); grid.repaint(); });
    grid = uploadGrid(q, a, sess, onChange, () => { delete a.images[q.doodle.slot]; pad.reset(); });
    const seg = el('div', 'seg'), bDraw = el('button', null, '✏️ 随手画'), bUp = el('button', null, '🖼 直接传图');
    bDraw.type = bUp.type = 'button';
    const note = el('p', 'note', '二选一：画了就不用传图，传了图就不用画。');
    const panes = el('div');
    const pick = (which) => {
      bDraw.classList.toggle('on', which === 'draw'); bUp.classList.toggle('on', which === 'up');
      pad.hidden = which !== 'draw'; grid.hidden = which !== 'up';
    };
    bDraw.onclick = () => pick('draw'); bUp.onclick = () => pick('up');
    seg.appendChild(bDraw); seg.appendChild(bUp);
    panes.appendChild(pad); panes.appendChild(grid);
    body.appendChild(el('p', 'hint', q.choiceLabel || '再选一种方式给我看看你的头像（可选）：'));
    body.appendChild(seg); body.appendChild(note); body.appendChild(panes);
    pick(a.images[q.doodle.slot] ? 'draw' : otherSlots.some((sl) => a.images[sl]) ? 'up' : null);
  } else {
    if (q.images) body.appendChild(uploadGrid(q, a, sess, onChange));
    if (field) body.appendChild(field);
  }
  const alien = el('button', 'alien' + (a.skipped ? ' on' : ''), a.skipped ? '已选择不回答 👽' : '不想回答，发个 👽');
  alien.type = 'button';
  alien.onclick = () => { a.skipped = !a.skipped; sess.save(); alien.className = 'alien' + (a.skipped ? ' on' : ''); alien.textContent = a.skipped ? '已选择不回答 👽' : '不想回答，发个 👽'; body.className = 'qbody' + (a.skipped ? ' off' : ''); onChange(); };
  box.appendChild(body);
  const r = el('div', 'row'); r.appendChild(alien); box.appendChild(r);
  box.focusField = () => field && field.focus();
  return box;
}

/* 随手画：画完自动存成图片放进这一题；onDraw 在有内容时调用（用来清掉另一种） */
function doodlePad(a, cfg, sess, onChange, onDraw) {
  const pane = el('div', 'pad');
  const SIZE = 600, COLORS = ['#2b2b33', '#e0656a', '#f2b33d', '#3f8fd8', '#4fa86a'];
  const cv = el('canvas'); cv.width = cv.height = SIZE; cv.setAttribute('aria-label', '画板');
  const x = cv.getContext('2d'); x.lineCap = x.lineJoin = 'round';
  let color = COLORS[0], width = 7, strokes = [], cur = null, base = null;
  const paintBase = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, SIZE, SIZE); if (base) x.drawImage(base, 0, 0, SIZE, SIZE); };
  const drawStroke = (st) => { x.strokeStyle = st.c; x.lineWidth = st.w; x.beginPath(); st.p.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); if (st.p.length === 1) x.lineTo(st.p[0][0] + .1, st.p[0][1]); x.stroke(); };
  const redraw = () => { paintBase(); strokes.forEach(drawStroke); };
  const save = () => {
    if (!strokes.length && !base) { delete a.images[cfg.slot]; }
    else { const data = cv.toDataURL('image/jpeg', 0.86).split(',')[1]; a.images[cfg.slot] = { mime: 'image/jpeg', w: SIZE, h: SIZE, bytes: Math.round(data.length * .75), data, name: 'doodle' }; if (onDraw) onDraw(); }
    sess.save(); onChange();
  };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * SIZE, (e.clientY - r.top) / r.height * SIZE]; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { c: color, w: width, p: [pos(e)] }; strokes.push(cur); drawStroke(cur); });
  cv.addEventListener('pointermove', (e) => { if (!cur) return; cur.p.push(pos(e)); const n = cur.p.length; x.strokeStyle = cur.c; x.lineWidth = cur.w; x.beginPath(); x.moveTo(...cur.p[n - 2]); x.lineTo(...cur.p[n - 1]); x.stroke(); });
  const end = () => { if (cur) { cur = null; save(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const tools = el('div', 'tools');
  COLORS.forEach((c, i) => { const b = el('button', 'sw' + (i === 0 ? ' on' : '')); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', '颜色 ' + (i + 1));
    b.onclick = () => { color = c; tools.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s === b)); }; tools.appendChild(b); });
  const thick = el('button', 'tool', '粗'); thick.type = 'button'; thick.onclick = () => { width = width === 7 ? 18 : 7; thick.textContent = width === 7 ? '粗' : '细'; };
  const undo = el('button', 'tool', '撤销'); undo.type = 'button'; undo.onclick = () => { strokes.pop(); redraw(); save(); };
  const clear = el('button', 'tool', '清空'); clear.type = 'button'; clear.onclick = () => { strokes = []; base = null; redraw(); save(); };
  [thick, undo, clear].forEach((b) => tools.appendChild(b));
  pane.appendChild(cv); pane.appendChild(tools); pane.appendChild(el('p', 'note', '画成什么样都行，越随便越好。只画一个轮廓、一种颜色也可以。'));
  if (a.images[cfg.slot]) { const im = new Image(); im.onload = () => { base = im; redraw(); }; im.src = 'data:' + a.images[cfg.slot].mime + ';base64,' + a.images[cfg.slot].data; } else redraw();
  pane.reset = () => { strokes = []; base = null; redraw(); };   // 改成传图时清掉画
  return pane;
}

/* 开场说明：时长、可以不答、会交给 AI */
function introCard(sess, modeLine, onStart) {
  const c = el('div', 'card stack');
  c.innerHTML = `<p class="eyebrow">GET A FEEL · 10 个问题</p><h1>说说你自己</h1>
    <p class="lead" style="margin:0">${modeLine}大约 3 到 5 分钟。<br>任何一题不想回答，都可以只回一个 👽，不用解释。</p>
    <p class="note" style="margin:0">你的回答会交给 AI（Claude）来创作 7 件作品，再给你看。原始回答只有组织者能看到；作品里不会原样出现你的名字、数字、原话和原图。</p>`;
  const lab = el('label', 'consent'); const cb = el('input'); cb.type = 'checkbox'; cb.id = 'consent'; cb.checked = !!sess.s.consent;
  lab.appendChild(cb); lab.appendChild(el('span', null, '我知道回答会交给 AI 用来生成作品，同意继续。'));
  c.appendChild(lab);
  const go = el('button', 'btn pri', '开始'); go.type = 'button'; go.disabled = !cb.checked;
  cb.onchange = () => { sess.s.consent = cb.checked; sess.save(); go.disabled = !cb.checked; };
  go.onclick = onStart;
  const r = el('div', 'row'); r.appendChild(go); c.appendChild(r);
  return c;
}

/* 提交：成功显示回执，失败给出保存文件的退路 */
async function doSubmit(sess, mount, extra) {
  const btns = mount.querySelectorAll('button'); btns.forEach((b) => (b.disabled = true));
  const err = mount.querySelector('.err');
  try {
    const p = await window.GAF.submit(sess, extra);
    const done = el('div', 'card stack');
    done.innerHTML = `<div class="done-mark">🪐</div><h2>收到了，谢谢你</h2>
      <p class="lead" style="margin:0">接下来会用你的回答做出 7 件作品。做好了会通过链接告诉你，到时你可以从里面挑出最像你的那一件。</p>
      <p class="note" style="margin:0">回执编号：${p.client_id.slice(0, 8)}　·　用时 ${Math.max(1, Math.round(p.duration_s / 60))} 分钟</p>
      <p class="note" style="margin:0"><a href="./">回到问卷首页</a></p>`;
    mount.replaceWith(done); window.scrollTo({ top: 0 });
  } catch (e) {
    if (err) err.innerHTML = e.message + '。可以再试一次，或者 <a href="#" id="dlBackup">把答卷存成文件</a> 发给组织者。';
    const d = document.getElementById('dlBackup'); if (d) d.onclick = (ev) => { ev.preventDefault(); window.GAF.downloadBackup(sess); };
    btns.forEach((b) => (b.disabled = false));
  }
}

window.GAFUI = { el, questionInputs, introCard, doSubmit };
})();
