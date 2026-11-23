import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examSolve} from "./exam.js";
import {hwStudent} from "./homework.js";
import {isCl, urlImgs} from "./media.js";
import {now, finished, expired} from "./time.js";

const YS = (p, f) => `<svg viewBox="0 0 24 24" width="${f || 20}" height="${f || 20}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const YI = {
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  back: YS('<path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>', 18),
  fwd: YS('<path d="M15 14l4 -4l-4 -4"/><path d="M19 10h-11a4 4 0 1 0 0 8h1"/>', 18),
  max: YS('<path d="M4 8v-2a2 2 0 0 1 2 -2h2"/><path d="M4 16v2a2 2 0 0 0 2 2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M16 20h2a2 2 0 0 0 2 -2v-2"/>', 18),
  replay: YS('<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>', 16),
  alert: YS('<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 8v4"/><path d="M12 16h.01"/>', 30)
};
const YL = '<span class="yl">E</span>';
const YERR = {2: "رابط الفيديو غير صحيح", 5: "حصلت مشكلة في تشغيل الفيديو، حاول تاني", 100: "الفيديو خاص أو محذوف", 101: "صاحب الفيديو مانع تشغيله هنا", 150: "صاحب الفيديو مانع تشغيله هنا", 153: "تعذّر تشغيل الفيديو، حاول تاني"};

const TYPES = {explain: ["شرح", "vid"], homework: ["واجب", "doc"], exam: ["امتحان", "exam"]};
const fm = ms => new Date(ms).toLocaleString("ar-EG", {dateStyle: "medium", timeStyle: "short"});
const gnm = g => g.grade === "غير محدد" ? (g.label || "") : g.grade + (g.label ? " · " + g.label : "");
const nmv = m => !m.n || m.n === "فيديو يوتيوب" ? "فيديو" : m.n;
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
  const cache = {};
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast("حصل خطأ، حاول تاني"); } };
  const load = async () => {
    const s = await getDocs(query(collection(db, "links"), where("studentUid", "==", uid)));
    links = s.docs.map(x => ({id: x.id, ...x.data()}));
    await Promise.all(links.map(async l => { l.groupName = ""; if (!l.groupId) return; try { const g = await getDoc(doc(db, "groups", l.groupId)); if (g.exists()) l.groupName = gnm(g.data()); } catch (e) {} }));
  };
  const addCode = async raw => {
    const c = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!c) return toast("اكتب الكود");
    const s = await getDoc(doc(db, "codes", c));
    if (!s.exists()) return toast("كود المدرس غير صحيح");
    const t = s.data(), id = t.teacherUid + "_" + uid, ex = links.find(l => l.id === id);
    if (!t.groupId) return toast("الكود ده لسه بيتجهّز، اطلب من المدرس يفتح صفحته الأول");
    if (ex && ex.status === "suspended") return toast("مش متاح إضافة المدرس ده، تواصل معاه");
    if (ex) return toast(ex.groupId === t.groupId ? "إنت مسجّل في المجموعة دي بالفعل" : "إنت مسجّل عند المدرس ده في مجموعة تانية، اطلب منه ينقلك");
    if (!confirm(`إضافة ${t.name} (${t.subject})${t.groupName ? " - " + t.groupName : ""}؟`)) return;
    await setDoc(doc(db, "links", id), {teacherUid: t.teacherUid, studentUid: uid, studentName: d.name, teacherName: t.name, subject: t.subject, code: c, groupId: t.groupId, status: "active", createdAt: serverTimestamp()});
    toast("تمت الإضافة");
    await load();
    return true;
  };
  const addBox = () => `<div class="addrow"><input id="cd" placeholder="كود المدرس" aria-label="كود المدرس" autocapitalize="characters" autocomplete="off"><button id="ad" class="btn p sm" type="button">إضافة</button></div>`;

  function home(){
    el.innerHTML = `<div class="card stu"><b>أهلاً ${esc(d.name.split(" ")[0])}</b><small class="muted" style="display:block">طالب</small></div><div class="card" style="margin-top:14px"><h2 class="h">مدرسيني (${links.length})</h2>${addBox()}<div id="ls">${links.length ? links.map(l => `<div class="item lrow"><div class="lt" data-act="open" data-id="${l.id}"><b>${esc(l.teacherName)}</b><small>${esc(l.subject)}${l.groupName ? " · " + esc(l.groupName) : ""}${l.status === "suspended" ? " · موقوف" : ""}</small></div>${l.status === "active" ? `<button class="ab" type="button" data-act="rm" data-id="${l.id}" aria-label="شيل المدرس">${ic("trash", 18)}</button>` : ""}</div>`).join("") : '<p class="muted center">ضيف كود مدرسك عشان تشوف محاضراته.</p>'}</div></div>`;
    $("#ad", el).onclick = () => run(async () => { if (await addCode($("#cd", el).value)) home(); });
    el.querySelectorAll("#ls [data-act]").forEach(b => b.onclick = () => run(async () => {
      const l = links.find(x => x.id === b.dataset.id);
      if (b.dataset.act === "open") return l.status === "suspended" ? toast("الحساب موقوف عند المدرس ده") : teacher(l);
      if (!confirm("تشيل المدرس ده من قايمتك؟")) return;
      await deleteDoc(doc(db, "links", l.id)); await load(); home();
    }));
  }

  async function teacher(l, stale){
    el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
    let D = cache[l.id];
    const fail = m => { el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><p class="err">${m}</p></div>`; $("#bk", el).onclick = home; };
    if (!l.groupId) return fail("المدرس لسه بيجهّز مجموعتك. حاول تاني بعد شوية.");
    const g = (c, ...w) => getDocs(query(collection(db, c), ...w)).then(s => s.docs).catch(() => []);
    if (!D || !stale || Date.now() - D.t > 120000) {
      let lects;
      try {
        const s = await getDocs(query(collection(db, "lectures"), where("teacherUid", "==", l.teacherUid), where("groupId", "==", l.groupId), where("hidden", "==", false)));
        lects = s.docs.map(x => ({id: x.id, ...x.data()})).sort((a, b) => a.order - b.order);
      } catch (e) { return fail("تعذّر تحميل المحاضرات. ممكن المدرس يكون نقلك أو مسح المجموعة، أو اتأكد من الإنترنت."); }
      /* محاضرات اتشاركت معاك بالاسم (المدرس اختارك) */
      try {
        const S2 = await getDocs(query(collection(db, "shares"), where("studentUid", "==", uid), where("teacherUid", "==", l.teacherUid)));
        const sh = await Promise.all(S2.docs.map(async x => { try { const z = await getDoc(doc(db, "lectures", x.data().lectureId)); return z.exists() ? {id: z.id, ...z.data()} : null; } catch (e) { return null; } }));
        lects = [...lects, ...sh.filter(z => z && z.hidden === false && z.groupId === "__shared" && z.teacherUid === l.teacherUid)].sort((p, q) => p.order - q.order);
      } catch (e) {}
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
      D = cache[l.id] = {t: Date.now(), lects, exs, hws, atts, subs, prog, wat, pmap};
    } else {
      /* رجوع من شاشة فرعية: بنعيد تحميل اللي اتغيّر بس */
      if (stale.includes("A")) { const A = await g("attempts", where("studentUid", "==", uid)); Object.keys(D.atts).forEach(k => delete D.atts[k]); A.forEach(x => { D.atts[x.data().examId] = {id: x.id, ...x.data()}; }); }
      if (stale.includes("S")) { const S = await g("subs", where("studentUid", "==", uid)); Object.keys(D.subs).forEach(k => delete D.subs[k]); S.forEach(x => { D.subs[x.data().partId] = {id: x.id, ...x.data()}; }); }
    }
    const {lects, exs, hws, atts, subs, prog, wat, pmap} = D;
    const done = p => p.type === "exam" ? !!(atts[p.id] && (atts[p.id].submitted || (exs[p.id] ? finished(atts[p.id], exs[p.id]) : false))) : p.type === "homework" ? !!subs[p.id] : !!prog[p.id];
    const exBtn = p => {
      const e = exs[p.id]; if (!e) return '<span class="muted small">لسه ما اتجهزش</span>';
      const a = atts[p.id], n = now();
      if (a && a.released) return `<b>${a.result.score} من ${a.result.total}</b>`;
      if (a && a.submitted) return '<span class="muted small">تم التسليم</span>';
      if (a && expired(a, e, n)) return '<span class="muted small">انتهى وقتك</span>';
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
      return (e.materials || []).map(m => safe(m.url) ? `<a class="lnk" style="display:block;margin-top:6px" href="${safe(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>` : "").join("") + `<button class="btn s sm" type="button" data-rv="${p.id}" style="margin-top:8px">ورقتي${e.reviewUntil > now() ? " وطلب مراجعة" : ""}</button>`;
    };
    const row = (p, lk) => `<div class="item${lk ? " lk" : ""}"><div class="lrow"><span class="ic">${ic(lk ? "lock" : TYPES[p.type][1])}</span><div class="lt"><b>${esc(p.title)}</b><small>${TYPES[p.type][0]}${lk ? " · يفتح بعد اللي قبله" : p.type === "exam" && exs[p.id] ? ` · ${exs[p.id].duration} دقيقة` : ""}</small></div>${lk ? "" : act(p)}</div>${lk ? "" : extra(p)}</div>`;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(l.teacherName)} · ${esc(l.subject)}</h2>${l.groupName ? `<p class="muted small">${esc(l.groupName)}</p>` : ""}</div>${lects.length ? lects.map(x => `<div class="card" style="margin-top:14px"><b>${esc(x.title)}</b>${x.parts.length ? x.parts.map((p, i) => row(p, x.mode !== "open" && i > 0 && !done(x.parts[i - 1]))).join("") : '<p class="muted small">لسه مفيش أجزاء.</p>'}</div>`).join("") : '<div class="card" style="margin-top:14px"><p class="muted center">المدرس لسه ما أضافش محاضرات.</p></div>'}`;
    $("#bk", el).onclick = home;
    const backE = () => teacher(l, []), backH = () => teacher(l, ["S"]), backA = () => teacher(l, ["A"]);
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
      el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(p.title)}</h2>${items.length ? items.map((m, i) => m.t === "video" ? `<div class="item"><b>${esc(nmv(m))}</b><video class="vp" controls playsinline preload="metadata" src="${esc(m.u)}" data-v="${i}"></video><div class="bar"><i id="b${i}"></i></div><small class="muted" id="t${i}"></small></div>` : m.t === "yt" ? `<div class="item"><b>${esc(nmv(m))}</b><div class="ytw" id="yw${i}"><button class="ytstart" type="button" id="ys${i}">${YL}<span class="ytpb">${YI.play}</span><span class="yls">ابدأ المشاهدة</span></button></div><div class="ytc" id="yc${i}" hidden><button class="ytp" type="button" id="pp${i}" aria-label="تشغيل">${YI.play}</button><button class="ytb" type="button" id="rw${i}" aria-label="رجوع 10 ثواني">${YI.back}10</button><button class="ytb" type="button" id="fw${i}" aria-label="تقديم 10 ثواني">10${YI.fwd}</button><select class="plain ytsp" id="rt${i}" aria-label="السرعة"><option value="0.75">0.75x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select>${canFs ? `<button class="ytb ytf" type="button" id="fs${i}" aria-label="ملء الشاشة">${YI.max}</button>` : ""}</div><div class="bar yb"><i id="b${i}"></i><u class="ytmk"></u></div><small class="muted" id="t${i}"></small></div>` : `<div class="item"><a class="btn s sm" style="text-decoration:none" href="${esc(m.u)}" target="_blank" rel="noopener">${m.t === "pdf" ? "فتح الملف (PDF)" : "فتح الرابط"}${m.n ? " · " + esc(m.n) : ""}</a></div>`).join("") : '<p class="muted center">المدرس لسه ما رفعش المحتوى.</p>'}<p id="st" class="muted small">${prog[p.id] ? "✓ تم احتساب الجزء ده" : hasVid ? "الجزء بيتحسب لما تشاهد 90% من الفيديو فعلياً. التقديم مش بيتحسب." : ""}</p>${!hasVid && items.length && !prog[p.id] ? '<button id="dn" class="btn p full" type="button">تم</button>' : ""}</div>`;
      el.querySelectorAll("video[data-v]").forEach(v => { const i = +v.dataset.v; trk.push({i, tr: track(v, w[i], paint)}); v.addEventListener("loadedmetadata", () => paint(false)); });
      const yts = items.map((m, i) => ({m, i})).filter(x => x.m.t === "yt");
      if (yts.length) ytReady().catch(() => {});
      yts.forEach(({m, i}) => {
        const sb = $("#ys" + i, el);
        sb.onclick = () => {
          sb.disabled = true; const lb = sb.querySelector(".yls"); if (lb) lb.textContent = "جاري التحميل…";
          ytReady().then(() => {
            if (dead) return;
            const COV = {
              load: () => YL + '<span>جاري التحميل…</span><i class="ysp"></i>',
              end: () => YL + '<span>انتهى الفيديو</span>' + (prog[p.id] ? '<small>✓ تم احتساب الجزء</small>' : '') + '<span class="yrp">' + YI.replay + 'إعادة المشاهدة</span>',
              err: msg => '<span class="yer">' + YI.alert + '</span><span>' + esc(msg) + '</span><small class="yh">بلّغ المدرس عشان يغيّر الفيديو</small>'
            };
            $("#yw" + i, el).innerHTML = '<div id="y' + i + '"></div><div class="ytpz" id="yz' + i + '" hidden><div class="ytbd t"></div><div class="ytbd b"></div><span class="ytpb">' + YI.play + '</span></div><div class="ytmt" id="ym' + i + '" hidden>' + esc(p.title) + '</div><div class="ytcv" id="yv' + i + '">' + COV.load() + '</div>';
            let started = false, tmo = null;
            const setCv = (on, html) => { const v = $("#yv" + i, el); if (!v) return; v.hidden = !on; if (html != null) v.innerHTML = html; };
            const topMask = on => { const v = $("#ym" + i, el); if (v) v.hidden = !on; };
            const pz = on => { const v = $("#yz" + i, el); if (v) v.hidden = !on; };
            const pl = new window.YT.Player("y" + i, {width: "100%", height: "100%", videoId: m.id, playerVars: {autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, cc_load_policy: 0, playsinline: 1, origin: location.origin}, events: {onReady: e => { try { e.target.playVideo(); } catch (er) {} }, onError: e => { clearTimeout(tmo); topMask(false); pz(false); setCv(true, COV.err(YERR[e.data] || "تعذّر تشغيل الفيديو")); }, onStateChange: e => {
              const st = e.data, b = $("#pp" + i, el); if (b) { b.innerHTML = st === 1 ? YI.pause : YI.play; b.setAttribute("aria-label", st === 1 ? "إيقاف" : "تشغيل"); }
              if (st === 1) { started = true; setCv(false); pz(false); topMask(true); clearTimeout(tmo); tmo = setTimeout(() => topMask(false), 6000); }
              else if (st === 3) { if (!started) setCv(true, COV.load()); }
              else if (st === 0) { clearTimeout(tmo); topMask(false); pz(false); setCv(true, COV.end()); }
              else if (st === 2) { clearTimeout(tmo); topMask(false); setCv(false); pz(true); }
              else if (!started) setCv(true, COV.load());
            }}});
            const zz = $("#yz" + i, el); if (zz) zz.onclick = () => { try { pl.playVideo(); } catch (er) {} };
            trk.push({i, tr: trackYT(pl, w[i], paint), pl});
            const cv = $("#yv" + i, el); if (cv) cv.onclick = () => { try { pl.playVideo(); } catch (er) {} };
            $("#yc" + i, el).hidden = false;
            const g = id => $("#" + id + i, el);
            g("pp").onclick = () => { try { pl.getPlayerState() === 1 ? pl.pauseVideo() : pl.playVideo(); } catch (e) {} };
            g("rw").onclick = () => { try { pl.seekTo(Math.max(0, pl.getCurrentTime() - 10), true); } catch (e) {} };
            g("fw").onclick = () => { try { pl.seekTo(pl.getCurrentTime() + 10, true); } catch (e) {} };
            g("rt").onchange = e => { try { pl.setPlaybackRate(+e.target.value); } catch (er) {} };
            const fs = g("fs"); if (fs) fs.onclick = () => { const x = $("#yw" + i, el), f = x.requestFullscreen || x.webkitRequestFullscreen; if (f) f.call(x); };
            paint(false);
          }).catch(() => { sb.disabled = false; const lb2 = sb.querySelector(".yls"); if (lb2) lb2.textContent = "ابدأ المشاهدة"; const st = $("#st", el); if (st) st.textContent = "تعذّر تحميل مشغّل الفيديو. تأكد من الإنترنت وحاول تاني."; });
        };
      });
      paint(false); dirty = false;
      tm = setInterval(() => persist(), 60000);
      document.addEventListener("visibilitychange", vis);
      $("#bk", el).onclick = () => leave().then(backE);
      const dn = $("#dn", el); if (dn) dn.onclick = () => run(async () => { prog[p.id] = 1; await persist(true); backE(); });
    };
    el.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => explain(pmap[b.dataset.ev]));
    el.querySelectorAll("[data-hw]").forEach(b => b.onclick = () => hwStudent(el, uid, l.teacherUid, hws[b.dataset.hw], subs[b.dataset.hw], backH));
    el.querySelectorAll("[data-sx]").forEach(b => b.onclick = () => examSolve(el, uid, exs[b.dataset.sx], atts[b.dataset.sx], backA, d.name));
    el.querySelectorAll("[data-rv]").forEach(b => b.onclick = () => review(exs[b.dataset.rv], atts[b.dataset.rv], backE));
  }

  async function review(e, a, back){
    if (!e.questions) {
      el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
      try { const p = await getDoc(doc(db, "exams", e.id, "paper", "main")); e.questions = p.exists() ? (p.data().questions || []) : []; }
      catch (er) { toast("تعذّر تحميل الأسئلة"); return back(); }
    }
    reviewDraw(e, a, back);
  }
  function reviewDraw(e, a, back){
    const R = a.result || {}, per = R.per, key = R.key, open = e.reviewUntil > now();
    const show = q => { const v = (a.answers || {})[q.id]; return v == null || v === "" ? "—" : q.type === "mcq" ? esc(q.options[v]) : q.type === "tf" ? (v ? "صح" : "خطأ") : esc(v); };
    const keyTxt = q => { const k = key && key[q.id]; return k == null ? "" : q.type === "mcq" ? esc(q.options[k]) : k ? "صح" : "خطأ"; };
    const mark = q => { if (!per || per[q.id] == null) return ""; const x = per[q.id]; return x >= q.points ? `<span class="okm">✓ ${x} من ${q.points}</span>` : x > 0 ? `<span class="pm">◐ ${x} من ${q.points}</span>` : `<span class="badm">✗ 0 من ${q.points}</span>`; };
    const wrong = per ? e.questions.filter(q => per[q.id] != null && per[q.id] < q.points).length : 0;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">ورقتي · ${esc(e.title)}</h2><p><b>${R.score ?? "—"} من ${R.total ?? "—"}</b>${per ? ` · الأسئلة اللي فيها خسارة درجات: ${wrong}` : ""}</p>${per ? "" : '<p class="muted small">تفاصيل كل سؤال هتظهر بعد ما المدرس يحدّث النتيجة.</p>'}${open ? `<p class="muted small">طلبات المراجعة متاحة لحد ${fm(e.reviewUntil)}</p>` : ""}</div>${e.questions.map((q, i) => `<div class="card" style="margin-top:14px"><div class="lrow"><b class="lt">سؤال ${i + 1}</b>${mark(q)}</div><p class="qt">${esc(q.text)}</p>${urlImgs(q.imgs, 120)}<p><b>إجابتك:</b> <span style="white-space:pre-wrap">${show(q)}</span></p>${q.type === "essay" ? urlImgs((a.answers || {})[q.id + "_i"], 120) : ""}${per && key && q.type !== "essay" && per[q.id] != null && per[q.id] < q.points && keyTxt(q) ? `<p class="muted"><b>الإجابة الصح:</b> ${keyTxt(q)}</p>` : ""}${open ? ((a.reviews || {})[q.id] ? '<p class="muted">تم إرسال طلب المراجعة</p>' : `<button class="btn s sm" type="button" data-r="${q.id}">اطلب مراجعة</button>`) : ""}</div>`).join("")}`;
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
