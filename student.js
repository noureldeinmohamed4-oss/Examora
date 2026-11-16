import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examSolve} from "./exam.js";
import {hwStudent} from "./homework.js";
import {isCl, urlImgs} from "./media.js";

const TYPES = {explain: ["شرح", "vid"], homework: ["واجب", "doc"], exam: ["امتحان", "exam"]};
const fm = ms => new Date(ms).toLocaleString("ar-EG", {dateStyle: "medium", timeStyle: "short"});
const safe = u => /^https?:\/\//.test(u || "") ? esc(u) : "";

const merge = r => { r.sort((a, b) => a[0] - b[0]); const o = []; for (const x of r) { const l = o[o.length - 1]; if (l && x[0] <= l[1] + 0.05) l[1] = Math.max(l[1], x[1]); else o.push([x[0], x[1]]); } return o; };
function track(v, init, on){
  let r = merge(Array.from({length: Math.floor((init || []).length / 2)}, (_, i) => [init[2 * i], init[2 * i + 1]])), last = null;
  const cov = () => r.reduce((s, x) => s + (x[1] - x[0]), 0);
  v.addEventListener("play", () => { last = v.currentTime; });
  v.addEventListener("pause", () => { last = null; on(true); });
  v.addEventListener("seeking", () => { last = null; });
  v.addEventListener("seeked", () => { if (!v.paused) last = v.currentTime; });
  v.addEventListener("ended", () => { last = null; on(true); });
  v.addEventListener("timeupdate", () => {
    const t = v.currentTime;
    if (last != null && !v.seeking) { const d = t - last; if (d > 0 && d <= 1.5 * Math.max(1, v.playbackRate)) { r.push([last, t]); r = merge(r); } }
    last = v.seeking ? null : t; on(false);
  });
  return {frac: () => isFinite(v.duration) && v.duration > 0 ? Math.min(1, cov() / v.duration) : 0, flat: () => r.flatMap(x => [Math.round(x[0] * 10) / 10, Math.round(x[1] * 10) / 10])};
}

const okMedia = m => !m ? false : m.t === "yt" ? /^[A-Za-z0-9_-]{11}$/.test(m.id || "") : m.t === "video" ? (isCl(m.u) || !!(m.x && /^https:\/\//.test(m.u || ""))) : m.t === "pdf" ? isCl(m.u) : m.t === "link" ? /^https?:\/\//.test(m.u || "") : false;
let ytp = null;
const ytReady = () => ytp || (ytp = new Promise((ok, no) => {
  if (window.YT && window.YT.Player) return ok();
  const sc = document.createElement("script"); sc.src = "https://www.youtube.com/iframe_api";
  sc.onerror = () => { ytp = null; no(new Error("yt")); };
  window.onYouTubeIframeAPIReady = ok;
  document.head.appendChild(sc);
  setTimeout(() => { if (!(window.YT && window.YT.Player)) { ytp = null; no(new Error("yt")); } }, 12000);
}));
function trackYT(p, init, on){
  let r = merge(Array.from({length: Math.floor((init || []).length / 2)}, (_, i) => [init[2 * i], init[2 * i + 1]])), last = null;
  const cov = () => r.reduce((s, x) => s + (x[1] - x[0]), 0);
  const timer = setInterval(() => {
    let st, t, rate = 1;
    try { st = p.getPlayerState(); t = p.getCurrentTime(); rate = p.getPlaybackRate() || 1; } catch (e) { return; }
    if (st === 1) {
      if (last != null) { const d = t - last; if (d > 0 && d <= 0.5 * rate + 0.6) { r.push([last, t]); r = merge(r); } }
      last = t; on(false);
    } else if (last != null) { last = null; on(true); }
  }, 500);
  return {frac: () => { let d = 0; try { d = p.getDuration(); } catch (e) {} return d > 0 ? Math.min(1, cov() / d) : 0; }, flat: () => r.flatMap(x => [Math.round(x[0] * 10) / 10, Math.round(x[1] * 10) / 10]), stop: () => clearInterval(timer)};
}

export async function renderStudent(el, uid, d){
  let links = [];
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast("حصل خطأ، حاول تاني"); } };
  const load = async () => {
    const s = await getDocs(query(collection(db, "links"), where("studentUid", "==", uid)));
    links = s.docs.map(x => ({id: x.id, ...x.data()}));
  };
  const addCode = async raw => {
    const c = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!c) return toast("اكتب الكود");
    const s = await getDoc(doc(db, "codes", c));
    if (!s.exists()) return toast("كود المدرس غير صحيح");
    const t = s.data(), id = t.teacherUid + "_" + uid, ex = links.find(l => l.id === id);
    if (ex && ex.status === "suspended") return toast("مش متاح إضافة المدرس ده، تواصل معاه");
    if (ex && ex.code === c) return toast("المدرس ده مضاف بالفعل");
    if (!confirm(`إضافة ${t.name} (${t.subject})؟`)) return;
    if (ex) await updateDoc(doc(db, "links", id), {code: c});
    else await setDoc(doc(db, "links", id), {teacherUid: t.teacherUid, studentUid: uid, studentName: d.name, teacherName: t.name, subject: t.subject, code: c, status: "active", createdAt: serverTimestamp()});
    toast("تمت الإضافة");
    await load();
    return true;
  };
  const addBox = () => `<div class="addrow"><input id="cd" placeholder="كود المدرس" aria-label="كود المدرس" autocapitalize="characters" autocomplete="off"><button id="ad" class="btn p sm" type="button">إضافة</button></div>`;

  function home(){
    el.innerHTML = `<div class="card stu"><b>أهلاً ${esc(d.name.split(" ")[0])}</b><small class="muted" style="display:block">طالب</small></div><div class="card" style="margin-top:14px"><h2 class="h">مدرسيني (${links.length})</h2>${addBox()}<div id="ls">${links.length ? links.map(l => `<div class="item lrow"><div class="lt" data-act="open" data-id="${l.id}"><b>${esc(l.teacherName)}</b><small>${esc(l.subject)}${l.status === "suspended" ? " · موقوف" : ""}</small></div>${l.status === "active" ? `<button class="ab" type="button" data-act="rm" data-id="${l.id}" aria-label="شيل المدرس">${ic("trash", 18)}</button>` : ""}</div>`).join("") : '<p class="muted center">ضيف كود مدرسك عشان تشوف محاضراته.</p>'}</div></div>`;
    $("#ad", el).onclick = () => run(async () => { if (await addCode($("#cd", el).value)) home(); });
    el.querySelectorAll("#ls [data-act]").forEach(b => b.onclick = () => run(async () => {
      const l = links.find(x => x.id === b.dataset.id);
      if (b.dataset.act === "open") return l.status === "suspended" ? toast("الحساب موقوف عند المدرس ده") : teacher(l);
      if (!confirm("تشيل المدرس ده من قايمتك؟")) return;
      await deleteDoc(doc(db, "links", l.id)); await load(); home();
    }));
  }

  async function teacher(l){
    el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
    let lects;
    try {
      const s = await getDocs(query(collection(db, "lectures"), where("teacherUid", "==", l.teacherUid), where("hidden", "==", false)));
      lects = s.docs.map(x => ({id: x.id, ...x.data()})).sort((a, b) => a.order - b.order);
    } catch (e) {
      el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><p class="err">كود المدرس اتغيّر. اكتب الكود الجديد عشان ترجع.</p>${addBox()}</div>`;
      $("#bk", el).onclick = home;
      $("#ad", el).onclick = () => run(async () => { if (await addCode($("#cd", el).value)) teacher(l); });
      return;
    }
    const g = (c, ...w) => getDocs(query(collection(db, c), ...w)).then(s => s.docs).catch(() => []);
    const [E, H, A, S, P] = await Promise.all([
      g("exams", where("teacherUid", "==", l.teacherUid), where("published", "==", true)),
      g("homeworks", where("teacherUid", "==", l.teacherUid)),
      g("attempts", where("studentUid", "==", uid)),
      g("subs", where("studentUid", "==", uid)),
      g("progress", where("studentUid", "==", uid))]);
    const exs = {}, hws = {}, atts = {}, subs = {}, prog = {}, wat = {}, pmap = {};
    E.forEach(x => { exs[x.id] = {id: x.id, ...x.data()}; });
    H.forEach(x => { hws[x.id] = {id: x.id, ...x.data()}; });
    A.forEach(x => { atts[x.data().examId] = {id: x.id, ...x.data()}; });
    S.forEach(x => { subs[x.data().partId] = {id: x.id, ...x.data()}; });
    P.forEach(x => { const q = x.data(); wat[q.partId] = q.watch || {}; if (q.done !== false) prog[q.partId] = 1; });
    lects.forEach(x => x.parts.forEach(p => { pmap[p.id] = p; }));
    const done = p => p.type === "exam" ? !!(atts[p.id] && atts[p.id].submitted) : p.type === "homework" ? !!subs[p.id] : !!prog[p.id];
    const exBtn = p => {
      const e = exs[p.id]; if (!e) return '<span class="muted small">لسه ما اتجهزش</span>';
      const a = atts[p.id], n = Date.now();
      if (a && a.released) return `<b>${a.result.score} من ${a.result.total}</b>`;
      if (a && a.submitted) return '<span class="muted small">تم التسليم</span>';
      if (!a && n < e.start) return `<span class="muted small">يبدأ ${fm(e.start)}</span>`;
      if (n > e.end) return '<span class="muted small">انتهى</span>';
      return `<button class="btn p sm" type="button" data-sx="${p.id}">${a ? "كمّل" : "ابدأ"}</button>`;
    };
    const act = p => {
      if (p.type === "exam") return exBtn(p);
      if (p.type === "homework") return hws[p.id] ? `<button class="btn p sm" type="button" data-hw="${p.id}">${subs[p.id] ? "فتح" : "ابدأ"}</button>` : '<span class="muted small">لسه ما اتجهزش</span>';
      return `<button class="btn p sm" type="button" data-ev="${p.id}">${prog[p.id] ? "فتح" : "ابدأ"}</button>` + (prog[p.id] ? '<span class="muted small">تم</span>' : "");
    };
    const extra = p => {
      const e = exs[p.id], a = atts[p.id]; if (p.type !== "exam" || !e || !a || !a.released) return "";
      return (e.materials || []).map(m => safe(m.url) ? `<a class="lnk" style="display:block;margin-top:6px" href="${safe(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>` : "").join("") + (e.reviewUntil > Date.now() ? `<button class="btn s sm" type="button" data-rv="${p.id}" style="margin-top:8px">طلب مراجعة</button>` : "");
    };
    const row = (p, lk) => `<div class="item${lk ? " lk" : ""}"><div class="lrow"><span class="ic">${ic(lk ? "lock" : TYPES[p.type][1])}</span><div class="lt"><b>${esc(p.title)}</b><small>${TYPES[p.type][0]}${lk ? " · يفتح بعد اللي قبله" : p.type === "exam" && exs[p.id] ? ` · ${exs[p.id].duration} دقيقة` : ""}</small></div>${lk ? "" : act(p)}</div>${lk ? "" : extra(p)}</div>`;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(l.teacherName)} · ${esc(l.subject)}</h2></div>${lects.length ? lects.map(x => `<div class="card" style="margin-top:14px"><b>${esc(x.title)}</b>${x.parts.length ? x.parts.map((p, i) => row(p, x.mode !== "open" && i > 0 && !done(x.parts[i - 1]))).join("") : '<p class="muted small">لسه مفيش أجزاء.</p>'}</div>`).join("") : '<div class="card" style="margin-top:14px"><p class="muted center">المدرس لسه ما أضافش محاضرات.</p></div>'}`;
    $("#bk", el).onclick = home;
    const back = () => teacher(l);
    const explain = p => {
      const items = (p.media || (p.url ? [{u: p.url, t: "link", n: "رابط"}] : [])).filter(okMedia);
      const vidN = items.filter(m => m.t === "video" || m.t === "yt").length;
      const trk = [], w = wat[p.id] || {};
      let dirty = false, tm = null, dead = false;
      const persist = fin => {
        if (!dirty && !fin) return Promise.resolve();
        dirty = false;
        const watch = {}; trk.forEach(t => { watch[t.i] = t.tr.flat(); }); wat[p.id] = Object.assign(wat[p.id] || {}, watch);
        const pct = trk.length ? Math.round(trk.reduce((a, t) => a + t.tr.frac(), 0) / trk.length * 100) : 0;
        return setDoc(doc(db, "progress", p.id + "_" + uid), {partId: p.id, studentUid: uid, teacherUid: l.teacherUid, done: !!prog[p.id], pct: prog[p.id] ? Math.max(pct, 90) : pct, watch}, {merge: true}).catch(() => { dirty = true; });
      };
      const paint = flush => {
        trk.forEach(t => { const f = Math.round(t.tr.frac() * 100), b = $("#b" + t.i, el), x = $("#t" + t.i, el); if (b) b.style.width = f + "%"; if (x) x.textContent = "شاهدت " + f + "%"; });
        dirty = true;
        if (vidN && trk.length === vidN && !prog[p.id] && trk.every(t => t.tr.frac() >= 0.9)) {
          prog[p.id] = 1;
          const st = $("#st", el); if (st) st.textContent = "✓ تم احتساب الجزء ده";
          persist(true).then(() => toast("تم احتساب المشاهدة ✓"));
        } else if (flush) persist();
      };
      const vis = () => { if (document.hidden) persist(); };
      const leave = () => { dead = true; clearInterval(tm); document.removeEventListener("visibilitychange", vis); trk.forEach(t => { try { t.tr.stop && t.tr.stop(); t.pl && t.pl.destroy(); } catch (e) {} }); return persist(); };
      const hasVid = vidN > 0, canFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
      el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(p.title)}</h2>${items.length ? items.map((m, i) => m.t === "video" ? `<div class="item"><b>${esc(m.n || "فيديو")}</b><video class="vp" controls playsinline preload="metadata" src="${esc(m.u)}" data-v="${i}"></video><div class="bar"><i id="b${i}"></i></div><small class="muted" id="t${i}"></small></div>` : m.t === "yt" ? `<div class="item"><b>${esc(m.n || "فيديو")}</b><div class="ytw" id="yw${i}"><button class="ytstart" type="button" id="ys${i}">▶ ابدأ المشاهدة</button></div><div class="ytc" id="yc${i}" hidden><button class="btn s sm" type="button" id="pp${i}">▶ تشغيل</button><button class="btn s sm" type="button" id="rw${i}">↺ 10ث</button><button class="btn s sm" type="button" id="fw${i}">10ث ↻</button><select class="plain" id="rt${i}" aria-label="السرعة"><option value="0.75">0.75x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select>${canFs ? `<button class="btn s sm" type="button" id="fs${i}">ملء الشاشة</button>` : ""}</div><div class="bar"><i id="b${i}"></i></div><small class="muted" id="t${i}"></small></div>` : `<div class="item"><a class="btn s sm" style="text-decoration:none" href="${esc(m.u)}" target="_blank" rel="noopener">${m.t === "pdf" ? "فتح الملف (PDF)" : "فتح الرابط"}${m.n ? " · " + esc(m.n) : ""}</a></div>`).join("") : '<p class="muted center">المدرس لسه ما رفعش المحتوى.</p>'}<p id="st" class="muted small">${prog[p.id] ? "✓ تم احتساب الجزء ده" : hasVid ? "الجزء بيتحسب لما تشاهد 90% من الفيديو فعلياً. التقديم مش بيتحسب." : ""}</p>${!hasVid && items.length && !prog[p.id] ? '<button id="dn" class="btn p full" type="button">تم</button>' : ""}</div>`;
      el.querySelectorAll("video[data-v]").forEach(v => { const i = +v.dataset.v; trk.push({i, tr: track(v, w[i], paint)}); v.addEventListener("loadedmetadata", () => paint(false)); });
      const yts = items.map((m, i) => ({m, i})).filter(x => x.m.t === "yt");
      if (yts.length) ytReady().catch(() => {});
      yts.forEach(({m, i}) => {
        const sb = $("#ys" + i, el);
        sb.onclick = () => {
          sb.disabled = true; sb.textContent = "جاري التحميل…";
          ytReady().then(() => {
            if (dead) return;
            $("#yw" + i, el).innerHTML = '<div id="y' + i + '"></div>';
            const pl = new window.YT.Player("y" + i, {width: "100%", height: "100%", videoId: m.id, playerVars: {autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, cc_load_policy: 0, playsinline: 1, origin: location.origin}, events: {onReady: e => { try { e.target.playVideo(); } catch (er) {} }, onStateChange: e => { const b = $("#pp" + i, el); if (b) b.textContent = e.data === 1 ? "⏸ إيقاف" : "▶ تشغيل"; }}});
            trk.push({i, tr: trackYT(pl, w[i], paint), pl});
            $("#yc" + i, el).hidden = false;
            const g = id => $("#" + id + i, el);
            g("pp").onclick = () => { try { pl.getPlayerState() === 1 ? pl.pauseVideo() : pl.playVideo(); } catch (e) {} };
            g("rw").onclick = () => { try { pl.seekTo(Math.max(0, pl.getCurrentTime() - 10), true); } catch (e) {} };
            g("fw").onclick = () => { try { pl.seekTo(pl.getCurrentTime() + 10, true); } catch (e) {} };
            g("rt").onchange = e => { try { pl.setPlaybackRate(+e.target.value); } catch (er) {} };
            const fs = g("fs"); if (fs) fs.onclick = () => { const x = $("#yw" + i, el), f = x.requestFullscreen || x.webkitRequestFullscreen; if (f) f.call(x); };
            paint(false);
          }).catch(() => { sb.disabled = false; sb.textContent = "▶ ابدأ المشاهدة"; const st = $("#st", el); if (st) st.textContent = "تعذّر تحميل مشغّل الفيديو. تأكد من الإنترنت وحاول تاني."; });
        };
      });
      paint(false); dirty = false;
      tm = setInterval(() => persist(), 60000);
      document.addEventListener("visibilitychange", vis);
      $("#bk", el).onclick = () => leave().then(back);
      const dn = $("#dn", el); if (dn) dn.onclick = () => run(async () => { prog[p.id] = 1; await persist(true); back(); });
    };
    el.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => explain(pmap[b.dataset.ev]));
    el.querySelectorAll("[data-hw]").forEach(b => b.onclick = () => hwStudent(el, uid, l.teacherUid, hws[b.dataset.hw], subs[b.dataset.hw], back));
    el.querySelectorAll("[data-sx]").forEach(b => b.onclick = () => examSolve(el, uid, exs[b.dataset.sx], atts[b.dataset.sx], back, d.name));
    el.querySelectorAll("[data-rv]").forEach(b => b.onclick = () => review(exs[b.dataset.rv], atts[b.dataset.rv], back));
  }

  function review(e, a, back){
    const show = q => { const v = (a.answers || {})[q.id]; return v == null || v === "" ? "—" : q.type === "mcq" ? esc(q.options[v]) : q.type === "tf" ? (v ? "صح" : "خطأ") : esc(v); };
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">طلب مراجعة · ${esc(e.title)}</h2><p class="muted small">متاح لحد ${fm(e.reviewUntil)}</p></div>${e.questions.map((q, i) => `<div class="card" style="margin-top:14px"><b>سؤال ${i + 1}</b><p class="qt">${esc(q.text)}</p>${urlImgs(q.imgs, 120)}<p><b>إجابتك:</b> <span style="white-space:pre-wrap">${show(q)}</span></p>${q.type === "essay" ? urlImgs((a.answers || {})[q.id + "_i"], 120) : ""}${(a.reviews || {})[q.id] ? '<p class="muted">تم إرسال طلب المراجعة</p>' : `<button class="btn s sm" type="button" data-r="${q.id}">اطلب مراجعة</button>`}</div>`).join("")}`;
    $("#bk", el).onclick = back;
    el.querySelectorAll("[data-r]").forEach(b => b.onclick = () => run(async () => {
      const t = prompt("اكتب سبب طلب المراجعة"); if (!t || !t.trim()) return;
      const r = {text: t.trim().slice(0, 300), at: Date.now()};
      await updateDoc(doc(db, "attempts", a.id), {["reviews." + b.dataset.r]: r});
      a.reviews = {...(a.reviews || {}), [b.dataset.r]: r}; toast("تم الإرسال"); review(e, a, back);
    }));
  }

  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  try { await load(); home(); } catch (e) { el.innerHTML = '<p class="err center">تعذّر التحميل. تأكد من الإنترنت وقواعد Firestore.</p>'; }
}
