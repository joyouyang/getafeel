/* 问卷页面共用的界面片段：一道题的输入区（图片、文字、👽）、开场说明、提交结果页 */
(() => {
'use strict';
const { QUESTIONS, compressImage } = window.GAF;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

/* 渲染一道题的输入区，内容改动时调用 onChange */
function questionInputs(q, sess, onChange) {
  const a = sess.answer(q.n), box = el('div', 'stack');
  const body = el('div', 'qbody' + (a.skipped ? ' off' : ''));
  if (q.hint) body.appendChild(el('p', 'hint', q.hint));
  if (q.images) {
    const grid = el('div', 'imgs');
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
            try { a.images[sl.slot] = await compressImage(f); sess.save(); }
            catch (err) { alert(err.message); }
            tile.classList.remove('busy'); paint(); onChange();
          };
          tile.appendChild(inp);
        }
      };
      paint(); grid.appendChild(tile);
    });
    body.appendChild(grid);
  }
  let field;
  if (q.text.kind === 'area') { field = el('textarea'); }
  else { field = el('input'); field.type = q.text.kind === 'number' ? 'number' : 'text'; if (q.text.kind === 'number') { field.min = 1; field.max = 100; field.inputMode = 'numeric'; } }
  field.placeholder = q.text.ph; field.value = a.text || ''; field.id = 'q' + q.n + '-text'; field.setAttribute('aria-label', '第 ' + q.n + ' 题的回答');
  field.oninput = () => { a.text = field.value; sess.save(); onChange(); };
  body.appendChild(field);
  const alien = el('button', 'alien' + (a.skipped ? ' on' : ''), a.skipped ? '已选择不回答 👽' : '不想回答，发个 👽');
  alien.type = 'button';
  alien.onclick = () => { a.skipped = !a.skipped; sess.save(); alien.className = 'alien' + (a.skipped ? ' on' : ''); alien.textContent = a.skipped ? '已选择不回答 👽' : '不想回答，发个 👽'; body.className = 'qbody' + (a.skipped ? ' off' : ''); onChange(); };
  box.appendChild(body);
  const r = el('div', 'row'); r.appendChild(alien); box.appendChild(r);
  box.focusField = () => field.focus();
  return box;
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
