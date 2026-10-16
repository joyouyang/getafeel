/* 问卷页面共用的界面片段：一道题的输入区（图片、文字、不告诉你）、开场说明、提交结果页 */
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
  if (q.images && q.images.some((x) => x.draw)) {
    // 每张图各自可画可传，比如头像画一张、朋友圈背景传一张
    if (field) body.appendChild(field);
    body.appendChild(el('p', 'hint', q.choiceLabel || '可以画一张，也可以传一张（可选）'));
    body.appendChild(pictureSlots(q, a, sess, onChange));
  } else {
    if (q.images) body.appendChild(uploadGrid(q, a, sess, onChange));
    if (field) body.appendChild(field);
  }
  const SKIP = (on) => (on ? '不告诉你 ✓' : '不告诉你');
  const alien = el('button', 'alien' + (a.skipped ? ' on' : ''), SKIP(a.skipped));
  alien.type = 'button';
  alien.onclick = () => { a.skipped = !a.skipped; sess.save(); alien.className = 'alien' + (a.skipped ? ' on' : ''); alien.textContent = SKIP(a.skipped); body.className = 'qbody' + (a.skipped ? ' off' : ''); onChange(); };
  box.appendChild(body);
  const r = el('div', 'row'); r.appendChild(alien); box.appendChild(r);
  box.focusField = () => field && field.focus();
  return box;
}

/* 可画可传的图片格：空着时给"画一张 / 传一张"两个入口，有图时显示缩略图；画的图点开能接着画 */
function pictureSlots(q, a, sess, onChange) {
  const grid = el('div', 'imgs pics');
  q.images.forEach((sl) => {
    const tile = el('div', 'slot pic');
    const paint = () => {
      tile.innerHTML = '';
      const im = a.images[sl.slot];
      if (im) {
        const img = el('img'); img.alt = sl.label; img.src = 'data:' + im.mime + ';base64,' + im.data; tile.appendChild(img);
        if (im.src === 'doodle') { img.style.cursor = 'pointer'; img.onclick = () => openPad(); }
        tile.appendChild(el('span', 'tag', (im.src === 'doodle' ? '画的' : '传的') + sl.label));
        const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', '删掉' + sl.label);
        x.onclick = () => { delete a.images[sl.slot]; sess.save(); paint(); onChange(); };
        tile.appendChild(x);
      } else {
        tile.appendChild(el('span', 'plabel', sl.label));
        const draw = el('button', 'pbtn', '画一张'); draw.type = 'button'; draw.onclick = () => openPad();
        const up = el('label', 'pbtn', '传一张'), inp = el('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('aria-label', '上传' + sl.label);
        inp.onchange = async () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          tile.classList.add('busy');
          try { a.images[sl.slot] = Object.assign(await compressImage(f), { src: 'upload' }); sess.save(); }
          catch (err) { alert(err.message); }
          tile.classList.remove('busy'); paint(); onChange();
        };
        up.appendChild(inp); tile.appendChild(draw); tile.appendChild(up);
      }
    };
    const openPad = () => {
      const sheet = el('div', 'sheet'), box = el('div', 'card stack sheet-card');
      box.appendChild(el('h2', null, '画一下你的' + sl.label));
      const pad = doodlePad(a, sl, sess);
      box.appendChild(pad);
      const ok = el('button', 'btn pri', '画好了'); ok.type = 'button';
      const close = () => { sheet.remove(); document.body.classList.remove('sheet-open'); paint(); onChange(); };
      ok.onclick = close; sheet.onclick = (e) => { if (e.target === sheet) close(); };
      const r = el('div', 'row'); r.appendChild(ok); box.appendChild(r);
      sheet.appendChild(box); document.body.appendChild(sheet); document.body.classList.add('sheet-open');
    };
    paint(); grid.appendChild(tile);
  });
  return grid;
}

/* 随手画：每画一笔就存成图片放进这一题的 slot */
function doodlePad(a, slot, sess) {
  const pane = el('div', 'pad');
  const SIZE = 600, COLORS = window.GAF_PAD_COLORS || ['#2b2b33', '#e0656a', '#f2b33d', '#3f8fd8', '#4fa86a'];   // 外壳可以限定画笔颜色
  const cv = el('canvas'); cv.width = cv.height = SIZE; cv.setAttribute('aria-label', '画板');
  const x = cv.getContext('2d'); x.lineCap = x.lineJoin = 'round';
  let color = COLORS[0], width = 7, strokes = [], cur = null, base = null;
  const paintBase = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, SIZE, SIZE); if (base) x.drawImage(base, 0, 0, SIZE, SIZE); };
  const drawStroke = (st) => { x.strokeStyle = st.c; x.lineWidth = st.w; x.beginPath(); st.p.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); if (st.p.length === 1) x.lineTo(st.p[0][0] + .1, st.p[0][1]); x.stroke(); };
  const redraw = () => { paintBase(); strokes.forEach(drawStroke); };
  const save = () => {
    if (!strokes.length && !base) delete a.images[slot.slot];
    else { const data = cv.toDataURL('image/jpeg', 0.86).split(',')[1]; a.images[slot.slot] = { mime: 'image/jpeg', w: SIZE, h: SIZE, bytes: Math.round(data.length * .75), data, name: 'doodle', src: 'doodle' }; }
    sess.save();
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
  pane.appendChild(cv); pane.appendChild(tools); pane.appendChild(el('p', 'note', '画成什么样都行，越随便越好。'));
  const old = a.images[slot.slot];
  if (old && old.src === 'doodle') { const im = new Image(); im.onload = () => { base = im; redraw(); }; im.src = 'data:' + old.mime + ';base64,' + old.data; } else redraw();
  return pane;
}

/* 开场说明：越短越好，点"好呀"就算知情同意 */
function introCard(sess, modeLine, onStart) {
  const c = el('div', 'card stack');
  c.innerHTML = `<h1>嗨，交个朋友吧？</h1>
    <p class="lead" style="margin:0">${modeLine}不想答的，点「不告诉你」就行。</p>
    <p class="note" style="margin:0">你写的会交给 AI，帮我做几件送你的小作品。原话只有我看得到。</p>`;
  const go = el('button', 'btn pri', '好呀'); go.type = 'button';
  go.onclick = () => { sess.s.consent = true; sess.save(); onStart(); };
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
    done.innerHTML = `<div class="done-mark">🪐</div><h2>收到啦，谢谢你</h2>
      <p class="lead" style="margin:0">我去把它们做成送你的小作品，做好了再来找你。</p>
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
