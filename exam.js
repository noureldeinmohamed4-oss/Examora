import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteField, arrayUnion, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examResults} from "./results.js";
import {pickUpload, upMsg, pick, isCl, urlImgs} from "./media.js";
import {now, tms, syncClock, calibrate, deadline} from "./time.js";

const toLocal = ms => ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const TN = {mcq: "اختيار من متعدد", tf: "صح / خطأ", essay: "مقالي"};
const blank = () => ({id: crypto.randomUUID().slice(0, 8), type: "mcq", text: "", options: ["", "", "", ""], points: 1, ans: null, imgs: []});

export async function examBuilder(el, uid, lec, part, back){
  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  let ex = {title: part.title, start: 0, end: 0, duration: 30, questions: [], published: false};
  try {
    const s = await getDoc(doc(db, "exams", part.id));
    if (s.exists()) {
      const d0 = s.data();
      ex = {...ex, ...d0};
      let qs0 = Array.isArray(d0.questions) ? d0.questions : null;
      if (!qs0) { const p = await getDoc(doc(db, "exams", part.id, "paper", "main")); qs0 = p.exists() ? (p.data().questions || []) : []; }
      const k = await getDoc(doc(db, "exams", part.id, "key", "main"));
      const a = k.exists() ? k.data().answers : {};
      ex.questions = qs0.map(q => ({...q, ans: a[q.id] ?? null}));
    }
  } catch (e) {}
  let locked = 0;
  try { locked = (await getDocs(query(collection(db, "attempts"), where("teacherUid", "==", uid), where("examId", "==", part.id)))).size; } catch (e) {}
  const sig = () => JSON.stringify(ex.questions.map(q => [q.id, q.type, q.text, q.type === "mcq" ? q.options.map(o => o.trim()) : [], q.imgs || []]));
  const base = sig();
  const total = () => ex.questions.reduce((s, q) => s + (+q.points || 0), 0);
  const upd = () => { const t = $("#tot", el); if (t) t.textContent = `${ex.questions.length} سؤال · الدرجة الكلية ${total()}`; };
  const draw = () => {
    const L = locked ? "disabled" : "";
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">إعداد الامتحان ${ex.published ? "· منشور" : "· مسودة"}</h2>${locked ? `<p class="err">${locked} طالب بدأوا الامتحان، فالأسئلة اتقفلت. تقدر تعدّل الإجابة الصح والدرجة بس.</p>` : ""}
<label class="lb">عنوان الامتحان</label><input id="et" class="plain" value="${esc(ex.title)}">
<label class="lb">يبدأ</label><input id="es" class="plain" type="datetime-local" value="${toLocal(ex.start)}">
<label class="lb">ينتهي</label><input id="ee" class="plain" type="datetime-local" value="${toLocal(ex.end)}">
<label class="lb">مدة الحل (بالدقايق)</label><input id="ed" class="plain" type="number" min="1" value="${ex.duration}">
<p class="muted small" id="tot"></p></div>
${ex.questions.map((q, i) => `<div class="card" style="margin-top:14px"><div class="lrow"><b class="lt">سؤال ${i + 1}</b><button class="ab" type="button" data-del="${i}" aria-label="مسح" ${L}>${ic("trash", 18)}</button></div>
<select class="plain" data-f="type" data-i="${i}" ${L}>${Object.entries(TN).map(([k, t]) => `<option value="${k}" ${q.type === k ? "selected" : ""}>${t}</option>`).join("")}</select>
<textarea class="plain" rows="3" data-f="text" data-i="${i}" placeholder="نص السؤال" style="margin-top:8px" ${L}>${esc(q.text)}</textarea><div>${(q.imgs || []).filter(isCl).map((u, k) => `<span class="th"><img class="im" src="${esc(u)}" alt="صورة السؤال" style="width:96px;margin:4px">${locked ? "" : `<button class="ab" type="button" data-qr="${i}" data-k="${k}" aria-label="مسح">${ic("trash", 16)}</button>`}</span>`).join("")}</div>${(q.imgs || []).length < 2 ? `<button class="btn s sm" type="button" data-qi="${i}" ${L} style="margin-top:8px">+ صورة للسؤال (قص وتدوير)</button>` : ""}
${q.type === "mcq" ? q.options.map((o, k) => `<div class="optrow"><input type="radio" name="r${i}" data-f="ans" data-i="${i}" data-k="${k}" ${q.ans === k ? "checked" : ""} aria-label="الإجابة الصح"><input class="plain" data-f="opt" data-i="${i}" data-k="${k}" value="${esc(o)}" placeholder="اختيار ${k + 1}" ${L}></div>`).join("") + '<p class="muted small">علّم على الإجابة الصح.</p>' : q.type === "tf" ? [["1", "صح"], ["0", "خطأ"]].map(([v, t]) => `<div class="optrow"><input type="radio" name="r${i}" data-f="ans" data-i="${i}" data-v="${v}" ${q.ans === (v === "1") && q.ans !== null ? "checked" : ""}><span>${t}</span></div>`).join("") : '<p class="muted small">الطالب يكتب إجابته، وإنت تصححها يدوي.</p>'}
<label class="lb">الدرجة</label><input class="plain" type="number" min="0" step="0.5" data-f="points" data-i="${i}" value="${q.points}"></div>`).join("")}
<div class="card" style="margin-top:14px"><button id="aq" class="btn s full" type="button" ${L}>${ic("plus", 18)}<span>إضافة سؤال</span></button><div class="acts"><button id="sd" class="btn s" type="button" style="flex:1">حفظ كمسودة</button><button id="sp" class="btn p" type="button" style="flex:1">${ex.published ? "حفظ التعديل" : "نشر"}</button></div>${ex.published ? '<button id="rs" class="btn s full" type="button">النتائج والتصحيح</button><button id="un" class="btn s full" type="button">إلغاء النشر</button>' : ""}<p id="msg" class="err" role="alert"></p></div>`;
    upd();
    $("#bk", el).onclick = back;
    $("#aq", el).onclick = () => { meta(); ex.questions.push(blank()); draw(); };
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (confirm("مسح السؤال؟")) { meta(); ex.questions.splice(+b.dataset.del, 1); draw(); } });
    el.querySelectorAll("[data-qi]").forEach(b => b.onclick = async () => {
      meta(); const q = ex.questions[+b.dataset.qi];
      try { const r = await pickUpload({kinds: ["image"], max: 2 - (q.imgs || []).length, edit: true}); q.imgs = [...(q.imgs || []), ...r.map(x => x.u)]; }
      catch (er) { toast(upMsg(er)); }
      draw();
    });
    el.querySelectorAll("[data-qr]").forEach(b => b.onclick = () => { meta(); ex.questions[+b.dataset.qr].imgs.splice(+b.dataset.k, 1); draw(); });
    $("#sd", el).onclick = () => save(false);
    $("#sp", el).onclick = () => save(true);
    const un = $("#un", el); if (un) un.onclick = () => save(false);
    const rs = $("#rs", el); if (rs) rs.onclick = () => examResults(el, uid, {id: part.id, title: ex.title, start: ex.start, end: ex.end, duration: ex.duration}, () => examBuilder(el, uid, lec, part, back));
  };
  const meta = () => {
    ex.title = $("#et", el).value.trim();
    ex.start = $("#es", el).value ? new Date($("#es", el).value).getTime() : 0;
    ex.end = $("#ee", el).value ? new Date($("#ee", el).value).getTime() : 0;
    ex.duration = +$("#ed", el).value || 0;
  };
  const h = e => {
    const t = e.target, f = t.dataset.f; if (!f) return;
    const q = ex.questions[+t.dataset.i];
    if (f === "text") q.text = t.value;
    else if (f === "opt") q.options[+t.dataset.k] = t.value;
    else if (f === "points") { q.points = +t.value || 0; upd(); }
    else if (f === "ans") q.ans = q.type === "tf" ? t.dataset.v === "1" : +t.dataset.k;
    else if (f === "type" && e.type === "change") { meta(); q.type = t.value; q.ans = null; draw(); }
  };
  el.oninput = h; el.onchange = h;
  async function save(pub){
    meta();
    const msg = $("#msg", el), bad = m => { msg.textContent = m; };
    if (locked && sig() !== base) return bad("الأسئلة مقفولة لأن فيه طلاب بدأوا الامتحان.");
    if (!ex.title) return bad("اكتب عنوان الامتحان");
    if (pub) {
      if (!ex.start || !ex.end || ex.end <= ex.start) return bad("حدّد وقت بداية ونهاية صحيحين");
      if (ex.duration < 1) return bad("حدّد مدة الحل");
      if (!ex.questions.length) return bad("أضف سؤال واحد على الأقل");
      for (const [i, q] of ex.questions.entries()) {
        if (!q.text.trim() && !(q.imgs || []).length) return bad(`اكتب نص السؤال ${i + 1} أو أضف صورة`);
        if (q.type === "mcq" && (q.options.filter(o => o.trim()).length < 2 || q.options.some((o, k) => k === q.ans && !o.trim()))) return bad(`السؤال ${i + 1}: اكتب اختيارين على الأقل وعلّم الإجابة الصح`);
        if (q.type !== "essay" && q.ans === null) return bad(`السؤال ${i + 1}: علّم الإجابة الصح`);
        if (!(q.points > 0)) return bad(`السؤال ${i + 1}: اكتب الدرجة`);
      }
    }
    msg.textContent = "";
    try {
      const qs = ex.questions.map(({ans, ...r}) => ({...r, imgs: (r.imgs || []).slice(0, 2), options: r.type === "mcq" ? r.options.map(o => o.trim()) : []}));
      const main = {teacherUid: uid, lectureId: lec.id, partId: part.id, title: ex.title, start: ex.start, end: ex.end, duration: ex.duration, qCount: qs.length, pts: total(), essayIds: qs.filter(q => q.type === "essay").map(q => q.id), questions: deleteField(), updatedAt: serverTimestamp()};
      await setDoc(doc(db, "exams", part.id), {...main, published: !!ex.published}, {merge: true});
      await setDoc(doc(db, "exams", part.id, "paper", "main"), {questions: qs});
      const a = {}; ex.questions.forEach(q => { if (q.type !== "essay") a[q.id] = q.ans; });
      await setDoc(doc(db, "exams", part.id, "key", "main"), {answers: a});
      if (pub !== !!ex.published) await setDoc(doc(db, "exams", part.id), {published: pub}, {merge: true});
      ex.published = pub; toast(pub ? "تم النشر" : "تم الحفظ"); draw();
    } catch (e) { bad("حصل خطأ، حاول تاني"); }
  }
  draw();
}

const wmUrl = who => {
  const t = esc(String(who || "Examora").slice(0, 44));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="150"><text x="20" y="85" transform="rotate(-25 135 75)" font-size="17" font-family="sans-serif" fill="#808080" fill-opacity=".22">${t}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
};

export async function examSolve(el, uid, ex, att, back, who){
  const id = ex.id + "_" + uid;
  const wm = `<div class="wm" aria-hidden="true" style="background-image:url('${wmUrl((who || "Examora") + " · " + uid.slice(0, 4))}')"></div>`;
  const dev = () => { let z = ""; try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {} return (navigator.userAgent + " | " + screen.width + "x" + screen.height + " | " + z).slice(0, 400); };
  const logIp = async (first, ip) => {
    const ref = doc(db, "ips", id), rec = {examId: ex.id, studentUid: uid, teacherUid: ex.teacherUid, ip: ip || "", ua: dev(), at: serverTimestamp()};
    if (first) { try { await setDoc(ref, rec); } catch (e) {} return; }
    try { await updateDoc(ref, {log: arrayUnion({ip: ip || "", ua: rec.ua, t: now()})}); }
    catch (e) { try { await setDoc(ref, rec); } catch (e2) {} }
  };
  let first = false, ipn = "";
  try {
    const ip = await syncClock(); ipn = ip;
    if (!att) {
      const n = now();
      if (n < ex.start || n > ex.end) return toast("الامتحان مش متاح دلوقتي");
      await setDoc(doc(db, "attempts", id), {examId: ex.id, studentUid: uid, teacherUid: ex.teacherUid, startedAt: serverTimestamp(), answers: {}, submitted: false});
      att = (await getDoc(doc(db, "attempts", id))).data({serverTimestamps: "estimate"});
      calibrate(tms(att.startedAt)); first = true;
    }
  } catch (e) { return toast("تعذّر بدء الامتحان"); }
  logIp(first, ipn);
  if (att.submitted) return toast("تم تسليم الامتحان");
  const dl = deadline(att, ex);
  if (now() > dl + 20000) return toast("وقتك في الامتحان خلص");
  let qs = ex.questions;
  if (!qs) {
    try { const p = await getDoc(doc(db, "exams", ex.id, "paper", "main")); qs = p.exists() ? p.data().questions : null; } catch (e) {}
    if (!qs || !qs.length) return toast("تعذّر تحميل الأسئلة، حاول تاني");
  }
  const ans = {...att.answers};
  let cur = 0, done = false, tm, fq, hidAt = 0, hidP = false;
  const exits = [...(att.exits || [])], blurs = [...(att.blurs || [])];
  let blAt = 0, blP = false, blX = 0, quiet = 0, xv = 0, xs = 0, lastS = -1, alerted = false;

  /* حفظ الإجابات: بتتسجّل على الجهاز فورًا وبتتبعت لـ Firestore كل فترة (وعند الخروج من الصفحة والتسليم) */
  const lk = "exa:" + id, pend = {};
  let ls = true;
  const okv = v => v === null || typeof v === "boolean" || typeof v === "number" || (typeof v === "string" && v.length <= 30000) || (Array.isArray(v) && v.length <= 3 && v.every(s => typeof s === "string" && s.length <= 500));
  try { localStorage.setItem(lk + ":t", "1"); localStorage.removeItem(lk + ":t"); } catch (e) { ls = false; }
  if (ls) {
    try {
      const r = JSON.parse(localStorage.getItem(lk) || "null");
      if (r && typeof r === "object" && !Array.isArray(r)) Object.entries(r).forEach(([k, v]) => { if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && okv(v)) { pend[k] = v; if (v === null) delete ans[k]; else ans[k] = v; } });
    } catch (e) {}
  }
  const saveLocal = () => { if (!ls) return; try { if (Object.keys(pend).length) localStorage.setItem(lk, JSON.stringify(pend)); else localStorage.removeItem(lk); } catch (e) { ls = false; } };
  const send = async extra => {
    const sp = {...pend}, sx = xv, p = {...extra};
    Object.entries(sp).forEach(([k, v]) => { p["answers." + k] = v === null ? deleteField() : v; });
    if (xv !== xs) { p.exits = exits; p.blurs = blurs; }
    if (!Object.keys(p).length) return true;
    try { await updateDoc(doc(db, "attempts", id), p); } catch (e) { return false; }
    Object.keys(sp).forEach(k => { if (k in pend && JSON.stringify(pend[k]) === JSON.stringify(sp[k])) delete pend[k]; });
    xs = sx;
    saveLocal();
    return true;
  };
  const gap = () => (ls ? 100000 : 20000) + Math.random() * 30000;
  const sched = () => { fq = setTimeout(async () => { await send({}); if (!done) sched(); }, gap()); };
  sched();
  const ph = () => { if (!done) send({}); };
  window.addEventListener("pagehide", ph);

  /* تنبيه آخر دقيقة: لون أحمر + صوت تك تك + اهتزاز (الاهتزاز على أندرويد بس) */
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  const unlock = () => { try { if (!ctx && AC) ctx = new AC(); if (ctx && ctx.state === "suspended") ctx.resume(); } catch (e) {} };
  el.addEventListener("pointerdown", unlock);
  const beep = hi => {
    if (!ctx || ctx.state !== "running") return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = "square"; o.frequency.value = hi ? 1500 : 1100;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.08);
    } catch (e) {}
  };
  const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  const onBlur = () => { if (done || blAt || Date.now() < quiet) return; blAt = Date.now(); blP = pick.active; blX = exits.length; };
  const onFocus = () => {
    if (!blAt) return;
    const t0 = blAt, d = Math.round((Date.now() - t0) / 1000), p = blP, x0 = blX; blAt = 0;
    setTimeout(() => { if (done || d < 2 || exits.length > x0) return; blurs.push({t: t0, d, ...(p ? {p: 1} : {})}); xv++; }, 400);
  };
  window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus);
  const vis = () => { if (done) return; if (document.hidden) { hidAt = Date.now(); hidP = pick.active; send({}); } else if (hidAt) { exits.push({t: hidAt, d: Math.round((Date.now() - hidAt) / 1000), ...(hidP ? {p: 1} : {})}); xv++; hidAt = 0; } };
  document.addEventListener("visibilitychange", vis);
  el.oncopy = el.oncut = el.onpaste = el.oncontextmenu = e => e.preventDefault();
  const has = q => (ans[q.id] != null && ans[q.id] !== "") || (ans[q.id + "_i"] || []).length > 0;
  const putk = (k, v) => { if (v === "") v = null; if (v === null) delete ans[k]; else ans[k] = v; pend[k] = v; saveLocal(); };
  const put = (q, v) => putk(q.id, v);
  const doneHtml = '<div class="card center"><h2 class="h">تم تسليم الامتحان</h2><p class="muted">النتيجة هتظهر بعد ما المدرس يخلّص التصحيح.</p><button id="bk" class="btn p full" type="button">رجوع</button></div>';
  const submit = async () => {
    el.innerHTML = '<div class="card center"><p class="muted">جاري التسليم…</p></div>';
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) { ok = await send({submitted: true, submittedAt: serverTimestamp()}); if (!ok && i < 2) await new Promise(r => setTimeout(r, 1500)); }
    if (ok) { el.innerHTML = doneHtml; $("#bk", el).onclick = back; return; }
    const late = now() > dl + 20000;
    el.innerHTML = `<div class="card center"><h2 class="h">${late ? "الوقت خلص" : "التسليم لسه ما وصلش"}</h2><p class="muted">${late ? "اللي اتحفظ قبل كده هو اللي هيتحسب." : "تأكد من الإنترنت واضغط إعادة المحاولة. إجاباتك محفوظة على جهازك."}</p>${late ? "" : '<button id="rt" class="btn p full" type="button">إعادة المحاولة</button>'}<button id="bk" class="btn s full" type="button">رجوع</button></div>`;
    $("#bk", el).onclick = back;
    const rt = $("#rt", el); if (rt) rt.onclick = submit;
  };
  const finish = () => {
    if (done) return; done = true; clearInterval(tm); clearTimeout(fq);
    document.removeEventListener("visibilitychange", vis); window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); window.removeEventListener("pagehide", ph); el.removeEventListener("pointerdown", unlock);
    el.oncopy = el.oncut = el.onpaste = el.oncontextmenu = null;
    try { if (ctx) ctx.close(); } catch (e) {}
    return submit();
  };
  const tick = () => {
    const r = dl - now(); if (r <= 0) return finish();
    const t = $("#tm", el); if (t) t.textContent = String(Math.floor(r / 60000)).padStart(2, "0") + ":" + String(Math.floor(r / 1000) % 60).padStart(2, "0");
    const low = r <= 60000, bar = $(".exbar", el); if (bar) bar.classList.toggle("low", low);
    if (low) {
      if (!alerted) { alerted = true; buzz([200, 100, 200, 100, 200]); }
      const s = Math.ceil(r / 1000);
      if (s !== lastS) { lastS = s; if (!document.hidden) { beep(s % 2 === 0); if (s <= 10) buzz(60); } }
    }
  };
  const draw = () => {
    const q = qs[cur];
    const body = q.type === "mcq" ? q.options.map((o, k) => o ? `<button type="button" class="opt${ans[q.id] === k ? " on" : ""}" data-o="${k}">${esc(o)}</button>` : "").join("")
      : q.type === "tf" ? [["1", "صح"], ["0", "خطأ"]].map(([v, t]) => `<button type="button" class="opt${ans[q.id] === (v === "1") ? " on" : ""}" data-o="${v}">${t}</button>`).join("")
      : `<textarea id="ea" class="plain" rows="7" placeholder="اكتب إجابتك هنا" style="margin-top:10px">${esc(ans[q.id] || "")}</textarea><div>${(ans[q.id + "_i"] || []).filter(isCl).map((u, k) => `<span class="th"><img class="im" src="${esc(u)}" alt="" style="width:96px;margin:4px"><button class="ab" type="button" data-ri="${k}" aria-label="مسح">${ic("trash", 16)}</button></span>`).join("")}</div>${(ans[q.id + "_i"] || []).length < 3 ? '<button id="ei" class="btn s sm" type="button" style="margin-top:8px">+ صورة إجابة</button>' : ""}`;
    el.innerHTML = `<div class="card"><div class="exbar"><b id="tm" dir="ltr"></b><span class="muted">سؤال ${cur + 1} من ${qs.length}</span></div><div class="nocopy"><p class="qt">${esc(q.text)}</p>${urlImgs(q.imgs)}${body}</div><div class="acts">${cur > 0 ? '<button id="pv" class="btn s" type="button" style="flex:1">السابق</button>' : ""}${cur < qs.length - 1 ? '<button id="nx" class="btn p" type="button" style="flex:1">التالي</button>' : '<button id="sb" class="btn p" type="button" style="flex:1">تسليم</button>'}</div><div class="grid">${qs.map((x, i) => `<button type="button" class="gb${has(x) ? " ok" : ""}${i === cur ? " cur" : ""}" data-g="${i}" aria-label="سؤال ${i + 1}">${i + 1}</button>`).join("")}</div></div>${wm}`;
    tick();
    el.querySelectorAll("[data-o]").forEach(b => b.onclick = () => {
      const v = q.type === "tf" ? b.dataset.o === "1" : +b.dataset.o;
      put(q, ans[q.id] === v ? null : v); draw();
    });
    const ea = $("#ea", el); if (ea) ea.oninput = () => put(q, ea.value.trim() ? ea.value : null);
    const fl = () => { const t = $("#ea", el); if (t) put(q, t.value.trim() ? t.value : null); };
    const ei = $("#ei", el);
    if (ei) ei.onclick = async () => {
      fl(); const k = q.id + "_i", mine = ans[k] || [];
      try { const r = await pickUpload({kinds: ["image"], max: 3 - mine.length, edit: true}); if (done) return; if (r.length) putk(k, [...mine, ...r.map(x => x.u)]); }
      catch (er) { toast(upMsg(er)); }
      if (!done) draw();
    };
    el.querySelectorAll("[data-ri]").forEach(b => b.onclick = () => { fl(); const k = q.id + "_i", a = [...(ans[k] || [])]; a.splice(+b.dataset.ri, 1); putk(k, a.length ? a : null); draw(); });
    el.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { cur = +b.dataset.g; draw(); });
    const pv = $("#pv", el), nx = $("#nx", el), sb = $("#sb", el);
    if (pv) pv.onclick = () => { cur--; draw(); };
    if (nx) nx.onclick = () => { cur++; draw(); };
    if (sb) sb.onclick = () => {
      const miss = qs.map((x, i) => has(x) ? 0 : i + 1).filter(Boolean);
      quiet = Infinity;
      const yes = confirm(miss.length ? `الأسئلة رقم ${miss.join("، ")} ما اتحلتش. متأكد إنك عايز تسلّم؟` : "متأكد إنك عايز تسلّم؟");
      quiet = Date.now() + 1500; blAt = 0;
      if (yes) finish();
    };
  };
  tm = setInterval(tick, 1000);
  draw();
}
