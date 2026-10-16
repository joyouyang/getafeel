/* Get A Feel 问卷：三种模式共用的题目、草稿、图片压缩和提交。
 * 提交格式 gaf.survey.v1 写进 Supabase responses 表的 payload 列，
 * 之后用 ~/get-a-feel/survey_to_inputs.py 直接转成生成脚本要的 inputs/<编号>/<组合>/资料.md。 */
(() => {
'use strict';
const ENDPOINT = 'https://chrxqhraickomolmvnap.supabase.co/rest/v1/responses';
const ANON_KEY = 'sb_publishable_Me2STWDSBkhxlGJWXPWBKQ_a9vgAQaI';   // 只能写入
const SCHEMA = 'gaf.survey.v1';

/* 题目原文和 questions.txt 一致；text/images 描述这一题收什么 */
const QUESTIONS = [
  { n: 1, g: 'A', q: '你的出生日期，年月日时辰', hint: '能写到几点就写到几点', text: { kind: 'line', ph: '例如 1999 年 5 月 20 日 早上 7 点' } },
  { n: 2, g: 'A', q: '你的真名', hint: '它不会原样出现在作品里', text: { kind: 'line', ph: '名字' } },
  { n: 3, g: 'A', q: '你的出生地点', hint: '写到城市就行，想写多细都可以', text: { kind: 'line', ph: '例如 杭州' } },
  { n: 4, g: 'B', q: '说说你的微信 combo：头像和朋友圈背景（或者 IG 头像和置顶）是什么样的，再加上你的个性签名',
    hint: '用两三句话说说它们是什么、为什么选、用了多久',
    choiceLabel: '头像和朋友圈背景，可以各画一张，也可以各传一张（都可选）',
    followUp: true,
    images: [{ slot: 'avatar', label: '头像', draw: true }, { slot: 'background', label: '朋友圈背景', draw: true }],
    text: { kind: 'area', ph: '比如：头像是一只侧着脸的猫，用了三年没换；背景是……；签名是……' } },
  { n: 5, g: 'B', q: '你的"人生作品"：电影书戏剧音乐游戏综艺……啥都行，不止一个也行，没有也行', hint: '没有也完全可以', text: { kind: 'area', ph: '写下名字，想说为什么也可以' } },
  { n: 6, g: 'B', q: '你的 comfort food：不知道吃什么的时候就吃它', text: { kind: 'line', ph: '它是什么' } },
  { n: 7, g: 'B', q: '你的 comfort 衣服：不知道穿什么的时候就穿它', text: { kind: 'line', ph: '它是什么' } },
  { n: 8, g: 'C', q: '你解锁手机后看到的第一屏截图', hint: '解锁后直接截一张传上来，不用整理',
    images: [{ slot: 'screen', label: '第一屏截图' }], text: null },
  { n: 9, g: 'C', q: '随便给我发一句话，什么都行，不一定要连贯有逻辑', text: { kind: 'area', ph: '脑子里冒出什么就写什么' } },
  { n: 10, g: 'C', q: '从 1–100 里随机选一个数字', text: { kind: 'number', ph: '1 到 100' } },
];
const VARIANT = 'v4';   // v4：第 4 题描述 + 头像、朋友圈背景各自可画可传（图片带 src: doodle / upload），第 8 题只收截图；一答一回应

const params = new URLSearchParams(location.search);
const INVITE = (location.hash.match(/invite=([\w-]+)/) || [])[1] || params.get('invite') || null;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

/* 一份答卷的状态；每种模式各自一份草稿，刷新不丢 */
function session(mode, keyName) {   // keyName：同一种问法下不同外壳各存各的草稿
  const key = 'gaf-survey-' + (keyName || mode);
  let s = store.get(key);
  if (!s || s.schema !== SCHEMA || s.variant !== VARIANT || s.submitted) {
    s = { schema: SCHEMA, variant: VARIANT, mode, client_id: uuid(), started_at: new Date().toISOString(), answers: {}, timing: {}, feedback: [], consent: false };
  }
  const api = {
    s,
    answer(n) { return (s.answers[n] = s.answers[n] || { text: '', skipped: false, images: {} }); },
    save() {   // 图片太大时只存文字草稿，避免本地存储放不下
      try { localStorage.setItem(key, JSON.stringify(s)); }
      catch (e) { const lite = JSON.parse(JSON.stringify(s)); Object.values(lite.answers).forEach((a) => (a.images = {})); store.set(key, lite); }
    },
    clear() { store.del(key); },
    isDone(n) { const a = s.answers[n]; if (!a) return false; if (a.skipped) return true; const q = QUESTIONS[n - 1];
      const hasText = (a.text || '').trim().length > 0, hasImg = Object.keys(a.images || {}).length > 0;
      if (q.n === 8) return hasImg; if (q.n === 4) return hasImg || hasText; return hasText; },
    tick(n, ms) { s.timing[n] = (s.timing[n] || 0) + ms; },
  };
  return api;
}

/* 图片压缩：长边 1280，JPEG 0.82；返回 {mime,w,h,bytes,data(base64)} */
function compressImage(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', quality).split(',')[1];
      resolve({ mime: 'image/jpeg', w, h, bytes: Math.round(data.length * 0.75), data, name: file.name || '' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('这张图读不出来，换一张试试')); };
    img.src = url;
  });
}

/* 组装成提交格式 */
function buildPayload(sess, extra = {}) {
  const s = sess.s, now = new Date();
  return {
    schema: SCHEMA, variant: VARIANT, mode: s.mode, client_id: s.client_id, invite: INVITE,
    started_at: s.started_at, submitted_at: now.toISOString(),
    duration_s: Math.round((now - new Date(s.started_at)) / 1000),
    consent: { ai: !!s.consent },
    ua: navigator.userAgent.slice(0, 160), lang: navigator.language,
    answers: QUESTIONS.map((q) => {
      const a = s.answers[q.n] || { text: '', skipped: false, images: {} };
      return { n: q.n, group: q.g, question: q.q, skipped: !!a.skipped, text: a.skipped ? '' : (a.text || '').trim(),
        followup: a.skipped ? '' : (a.followup || '').trim(), followup_q: a.skipped ? '' : (a.followup_q || ''),
        images: a.skipped ? [] : Object.entries(a.images || {}).map(([slot, im]) => ({ slot, label: (im.src === 'doodle' ? '随手画的' : '') + ((q.images || []).find((x) => x.slot === slot)?.label || slot), ...im })),
        time_s: Math.round((s.timing[q.n] || 0) / 1000) };
    }),
    feedback: s.feedback || [],
    ...extra,
  };
}

async function submit(sess, extra) {
  const payload = buildPayload(sess, extra);
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Prefer: 'return=minimal' }, body: JSON.stringify({ payload }) });
  if (!res.ok) throw new Error('提交没有成功（' + res.status + '）');
  sess.s.submitted = true; sess.clear();
  store.set('gaf-survey-receipt', { client_id: payload.client_id, mode: payload.mode, at: payload.submitted_at });
  return payload;
}

/* 提交失败时，把答卷存成文件，方便发给组织者 */
function downloadBackup(sess) {
  const blob = new Blob([JSON.stringify(buildPayload(sess), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'getafeel-答卷-' + sess.s.client_id.slice(0, 8) + '.json'; a.click();
}

/* 一答一反馈：预先写好的规则，之后可以换成 LLM 实时回应 */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const short = (t, n = 10) => { t = (t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
function feedbackFor(n, a) {
  if (a.skipped) return pick(['行。', '好好好', '111收到']);
  const t = (a.text || '').trim(), imgs = Object.keys(a.images || {}).length;
  switch (n) {
    case 1: { const m = +(t.match(/(\d{1,2})\s*月/) || t.match(/[\/.-](\d{1,2})[\/.-]/) || [])[1];
      const season = m >= 3 && m <= 5 ? '春天' : m >= 6 && m <= 8 ? '夏天' : m >= 9 && m <= 11 ? '秋天' : m ? '冬天' : '';
      const precise = /[点时:：]|辰|分/.test(t);
      return (season ? `${season}出生的。` : '记下了。') + (precise ? '连几点都记得，很少有人能说得这么准。' : '时辰不记得也没关系。'); }
    case 2: return '好名字。放心，它不会原样出现在作品里。';
    case 3: return `${short(t, 12)}，记下了。那里有你最早看到的天。`;
    case 4: { const ims = Object.values(a.images || {}), drew = ims.some((im) => im.src === 'doodle'), up = ims.some((im) => im.src !== 'doodle');
      return (drew ? '画收到了。画成什么样都好，这就是它在你眼里的样子。' : '') + (up ? '图也收到了。' : '') + (t ? `你先说的是「${short(t, 10)}」，这大概就是你最在意的那部分。` : ''); }
    case 5: return /^(无|没有|暂无|没)/.test(t) ? '没有"人生作品"也很好，说明你的人生还没有被某一件事限定。' : '记下了。能被叫作"人生作品"的，一定陪你走过一段路。';
    case 6: return `下次不知道吃什么，我也试试${short(t, 8) ? '「' + short(t, 8) + '」' : '它'}。`;
    case 7: return pick(['很有安全感的选择。', '穿上就不用再想的衣服，最懂你。']);
    case 8: return imgs ? '第一屏收到了。这一屏，你每天大概要看上百次。' : '收到。';
    case 9: return '这句话我收好了。它会被认真读，但不会被原样用。';
    case 10: { const v = parseInt(t, 10);
      if (v === 100) return '一百，满格。'; if (v === 99) return '九十九，差一点就满，像是故意留了一格。'; if (v === 1) return '一，从最开始的那个。';
      if ([66, 88, 8, 6, 9].includes(v)) return `${v}，一个吉利的数。`; if (v && v % 10 === 0) return `${v}，很整齐。`; if (v) return `${v}，记下了。`; return '记下了。'; }
  }
  return '收到。';
}

/* 一答一反馈：回答太短时追问一句（每题最多一次） */
function followUpFor(n, a) {
  if (a.skipped || a.followup) return null;
  const t = (a.text || '').trim(), imgs = Object.keys(a.images || {}).length;
  if (n === 4 && t.length < 14) return Object.values(a.images || {}).some((im) => im.src === 'doodle') ? '画得很好。能再用一句话说说，你为什么选它当头像吗？' : imgs ? '图收到了。能再用一句话说说，你为什么选它吗？' : '能再多说一点吗？比如它是什么颜色、为什么选它、用了多久。';
  return null;
}

window.GAF = { VARIANT, followUpFor, QUESTIONS, INVITE, session, compressImage, buildPayload, submit, downloadBackup, feedbackFor };
})();
