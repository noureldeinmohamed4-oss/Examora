import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examBuilder} from "./exam.js";
import {hwBuilder} from "./homework.js";
import {pickUpload, upMsg} from "./media.js";

const TYPES = {explain: ["شرح", "vid"], homework: ["واجب", "doc"], exam: ["امتحان", "exam"]};
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => CH[n % 32]).join("");
const ab = (act, icon, label, id = "", extra = "") => `<button class="ab" type="button" data-act="${act}" data-id="${id}" ${extra} aria-label="${label}">${ic(icon, 18)}</button>`;

const ytId = u => { const m = String(u || "").trim().match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#\/].*)?$/); return m ? m[1] : ""; };
const mc = p => { const n = (p.media || []).length + (!p.media && p.url ? 1 : 0); return n ? n + " ملف" : "لسه فاضي"; };

export async function renderTeacher(el, uid, d){
  let lects = [], stu = [], cur = null, code = d.code, subsAll = [], subsErr = false;
  const loadSubs = async () => { try { subsAll = (await getDocs(query(collection(db, "subs"), where("teacherUid", "==", uid)))).docs.map(x => ({id: x.id, ...x.data()})); subsErr = false; } catch (e) { subsErr = true; } };
  const hc = id => { const a = subsAll.filter(s => s.partId === id), n = a.filter(s => !s.graded).length; return a.length ? a.length + " تسليم" + (n ? " · " + n + " جديد" : "") : "لسه ما حدش سلّم"; };
  const load = async () => {
    const s = await getDocs(query(collection(db, "lectures"), where("teacherUid", "==", uid)));
    lects = s.docs.map(x => ({id: x.id, ...x.data()})).sort((a, b) => a.order - b.order);
    const s2 = await getDocs(query(collection(db, "links"), where("teacherUid", "==", uid)));
    stu = s2.docs.map(x => ({id: x.id, ...x.data()}));
    await loadSubs();
  };
  const studentsCard = () => { const a = stu.filter(x => x.code === code); return `<div class="card" style="margin-top:14px"><h2 class="h">الطلاب (${a.length})</h2>${a.length ? a.map(x => `<div class="item lrow"><div class="lt"><b>${esc(x.studentName)}</b><small>${x.status === "suspended" ? "موقوف" : "نشط"}</small></div><button class="btn s sm" type="button" data-st="${x.id}" data-to="${x.status === "suspended" ? "active" : "suspended"}">${x.status === "suspended" ? "تفعيل" : "إيقاف"}</button></div>`).join("") : '<p class="muted center">لسه مفيش طلاب. ابعت كودك للطلاب.</p>'}</div>`; };
  const hwCard = () => {
    const parts = {}; lects.forEach(l => l.parts.forEach(p => { if (p.type === "homework") parts[p.id] = {l, p}; }));
    const nm = {}; stu.forEach(x => { nm[x.studentUid] = x.studentName; });
    const pend = subsAll.filter(s => !s.graded && parts[s.partId]).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return `<div class="card" style="margin-top:14px"><h2 class="h">واجبات محتاجة تصحيح (${pend.length})</h2>${subsErr ? '<p class="err">تعذّر تحميل التسليمات. تأكد من الإنترنت وقواعد Firestore.</p>' : pend.length ? pend.map(s => `<div class="item lrow"><div class="lt"><b>${esc(nm[s.studentUid] || "طالب")}</b><small>${esc(parts[s.partId].p.title)} · ${esc(parts[s.partId].l.title)}</small></div><button class="btn p sm" type="button" data-gs="${s.id}">تصحيح</button></div>`).join("") : '<p class="muted center">مفيش واجبات مستنية تصحيح.</p>'}</div>`;
  };
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast("حصل خطأ، حاول تاني"); } };
  const save = async (l, patch) => { await updateDoc(doc(db, "lectures", l.id), patch); Object.assign(l, patch); };
  const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };

  function home(){
    cur = null;
    el.innerHTML = `<div class="card"><b>${esc(d.name)}</b><small class="muted" style="display:block">مدرس · ${esc(d.subject)}</small><div class="codebox"><div><small class="muted">كودك</small><b class="code" dir="ltr">${esc(code)}</b></div><div class="acts" style="margin:0"><button id="cp" class="btn s sm" type="button">نسخ</button><button id="cc" class="btn s sm" type="button">تغيير</button></div></div></div>${studentsCard()}${hwCard()}
<div class="card" style="margin-top:14px"><h2 class="h">المحاضرات (${lects.length})</h2><div class="addrow"><input id="nt" placeholder="اسم المحاضرة (مثال: المحاضرة الأولى)" aria-label="اسم المحاضرة"><button id="add" class="btn p sm" type="button">إضافة</button></div><div id="ls">${lects.length ? lects.map(l => `<div class="item lrow"><div class="lt" data-act="open" data-id="${l.id}"><b>${esc(l.title)}</b><small>${l.parts.length} أجزاء · ${l.mode === "open" ? "مفتوحة" : "بالترتيب"}${l.hidden ? " · مخفية" : ""}</small></div>${ab("up", "up", "فوق", l.id)}${ab("down", "down", "تحت", l.id)}${ab("hide", l.hidden ? "eyeoff" : "eye", l.hidden ? "إظهار" : "إخفاء", l.id)}${ab("del", "trash", "مسح", l.id)}</div>`).join("") : '<p class="muted center">مفيش محاضرات لسه. أضف أول محاضرة.</p>'}</div></div>`;
    el.querySelectorAll("[data-gs]").forEach(b => b.onclick = () => {
      const s = subsAll.find(x => x.id === b.dataset.gs), f = lects.flatMap(l => l.parts.map(q => ({l, q}))).find(x => x.q.id === s.partId);
      if (f) hwBuilder(el, uid, f.l, f.q, () => loadSubs().then(home), s.id);
    });
    $("#cp", el).onclick = () => navigator.clipboard.writeText(code).then(() => toast("اتنسخ الكود"), () => toast(code));
    el.querySelectorAll("[data-st]").forEach(b => b.onclick = () => run(async () => { if (b.dataset.to === "suspended" && !confirm("إيقاف الطالب ده من عندك؟")) return; await updateDoc(doc(db, "links", b.dataset.st), {status: b.dataset.to}); stu.find(y => y.id === b.dataset.st).status = b.dataset.to; home(); }));
    $("#cc", el).onclick = () => run(async () => {
      if (!confirm("تغيير الكود هيفصل طلابك الحاليين لحد ما يكتبوا الكود الجديد. متأكد؟")) return;
      let n = null;
      for (let i = 0; i < 5 && !n; i++) { const c = genCode(); const {getDoc} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"); if (!(await getDoc(doc(db, "codes", c))).exists()) n = c; }
      if (!n) throw 0;
      const b = writeBatch(db);
      b.set(doc(db, "codes", n), {teacherUid: uid, name: d.name, subject: d.subject});
      b.delete(doc(db, "codes", code));
      b.update(doc(db, "users", uid), {code: n});
      await b.commit(); code = n; home();
    }, "تم تغيير الكود");
    $("#add", el).onclick = () => run(async () => {
      const t = $("#nt", el).value.trim(); if (!t) return toast("اكتب اسم المحاضرة");
      await addDoc(collection(db, "lectures"), {teacherUid: uid, title: t, order: Date.now(), hidden: false, mode: "ordered", parts: [], createdAt: serverTimestamp()});
      await load(); home();
    });
    el.querySelectorAll("#ls [data-act]").forEach(b => b.onclick = () => run(async () => {
      const i = lects.findIndex(x => x.id === b.dataset.id), l = lects[i], a = b.dataset.act;
      if (a === "open") return lecture(l);
      if (a === "hide") await save(l, {hidden: !l.hidden});
      else if (a === "del") { if (!confirm("مسح المحاضرة بكل أجزائها؟")) return; await deleteDoc(doc(db, "lectures", l.id)); lects.splice(i, 1); }
      else { const j = a === "up" ? i - 1 : i + 1; if (j < 0 || j >= lects.length) return; const o = lects[j].order; await save(lects[j], {order: l.order}); await save(l, {order: o}); lects.sort((x, y) => x.order - y.order); }
      home();
    }));
  }

  function lecture(l){
    cur = l;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع للمحاضرات</button><div class="addrow" style="margin-top:12px"><input id="lt" value="${esc(l.title)}" aria-label="اسم المحاضرة"><button id="sv" class="btn s sm" type="button">حفظ الاسم</button></div><label class="lb">طريقة فتح الأجزاء للطالب</label><div class="roles">${[["ordered", "بالترتيب"], ["open", "مفتوحة"]].map(([k, t]) => `<button type="button" data-m="${k}" class="${l.mode === k ? "on" : ""}"><span>${t}</span></button>`).join("")}</div><p class="muted small">${l.mode === "open" ? "كل الأجزاء ظاهرة للطالب من الأول." : "الطالب يخلّص الجزء اللي قبله عشان يفتح اللي بعده."}</p>${l.mode === "ordered" ? '<button id="all" class="btn s sm" type="button">افتح الكل للطلاب</button>' : ""}</div>
<div class="card" style="margin-top:14px"><h2 class="h">الأجزاء (${l.parts.length})</h2><div class="addrow"><input id="pt" placeholder="عنوان الجزء (اختياري)" aria-label="عنوان الجزء"></div><div class="roles three">${Object.entries(TYPES).map(([k, [t, i]]) => `<button type="button" data-add="${k}">${ic(i, 22)}<span>+ ${t}</span></button>`).join("")}</div><div id="ps">${l.parts.length ? l.parts.map((p, i) => `<div class="item lrow"><span class="ic">${ic(TYPES[p.type][1])}</span><div class="lt"><b>${esc(p.title)}</b><small>${TYPES[p.type][0]}${p.type === "explain" ? " · " + mc(p) : p.type === "homework" ? " · " + hc(p.id) : ""}</small></div>${p.type === "exam" ? `<button class="btn s sm" type="button" data-ex="${i}">إعداد</button>` : p.type === "homework" ? `<button class="btn s sm" type="button" data-hwb="${i}">إعداد</button>` : `<button class="btn s sm" type="button" data-cb="${i}">المحتوى</button>`}${ab("pu", "up", "فوق", i)}${ab("pd", "down", "تحت", i)}${ab("px", "trash", "مسح", i)}</div>`).join("") : '<p class="muted center">أضف أجزاء المحاضرة من الأزرار فوق.</p>'}</div></div>`;
    $("#bk", el).onclick = home;
    el.querySelectorAll("[data-ex]").forEach(b => b.onclick = () => examBuilder(el, uid, l, l.parts[+b.dataset.ex], () => lecture(l)));
    el.querySelectorAll("[data-hwb]").forEach(b => b.onclick = () => hwBuilder(el, uid, l, l.parts[+b.dataset.hwb], () => loadSubs().then(() => lecture(l))));
    el.querySelectorAll("[data-cb]").forEach(b => b.onclick = () => content(l, +b.dataset.cb));
    $("#sv", el).onclick = () => run(async () => { const t = $("#lt", el).value.trim(); if (!t) return toast("اكتب الاسم"); await save(l, {title: t}); }, "تم الحفظ");
    el.querySelectorAll("[data-m]").forEach(b => b.onclick = () => run(async () => { await save(l, {mode: b.dataset.m}); lecture(l); }));
    const all = $("#all", el); if (all) all.onclick = () => run(async () => { await save(l, {mode: "open"}); lecture(l); }, "الأجزاء مفتوحة للطلاب");
    el.querySelectorAll("[data-add]").forEach(b => b.onclick = () => run(async () => {
      const k = b.dataset.add, t = $("#pt", el).value.trim() || TYPES[k][0];
      await save(l, {parts: [...l.parts, {id: crypto.randomUUID(), type: k, title: t}]}); lecture(l);
    }));
    el.querySelectorAll("#ps [data-act]").forEach(b => b.onclick = () => run(async () => {
      const i = +b.dataset.id, ps = [...l.parts], a = b.dataset.act;
      if (a === "px") { if (!confirm("مسح الجزء ده؟")) return; ps.splice(i, 1); }
      else if (!swap(ps, i, a === "pu" ? i - 1 : i + 1)) return;
      await save(l, {parts: ps}); lecture(l);
    }));
  }

  function content(l, i){
    const p = l.parts[i];
    let media = p.media ? [...p.media] : (p.url ? [{u: p.url, t: "link", n: "رابط"}] : []);
    const persist = async () => { const ps = [...l.parts]; const {url, ...rest} = ps[i]; ps[i] = {...rest, media}; await save(l, {parts: ps}); };
    const TL = {video: "فيديو", yt: "فيديو يوتيوب", pdf: "PDF", link: "رابط (قديم)"};
    const loadMon = async () => {
      const box = $("#mn", el); if (!box) return;
      try {
        const s = await getDocs(query(collection(db, "progress"), where("teacherUid", "==", uid), where("partId", "==", p.id)));
        const pr = {}; s.docs.forEach(x => { pr[x.data().studentUid] = x.data(); });
        const a = stu.filter(x => x.code === code && x.status !== "suspended");
        if (!$("#mn", el)) return;
        $("#mn", el).innerHTML = a.length ? a.map(x => { const g = pr[x.studentUid], dn = g && g.done !== false; return `<div class="item lrow"><div class="lt"><b>${esc(x.studentName)}</b></div><span class="${dn ? "" : "muted"}">${dn ? "✓ خلّص" : g && g.pct > 0 ? "شاهد " + g.pct + "%" : "لسه ما بدأش"}</span></div>`; }).join("") : '<p class="muted center">لسه مفيش طلاب.</p>';
      } catch (e) { if ($("#mn", el)) $("#mn", el).innerHTML = '<p class="err center">تعذّر تحميل المتابعة.</p>'; }
    };
    const draw = () => {
      el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع للمحاضرة</button><h2 class="h" style="margin-top:10px">${esc(p.title)}</h2>
<div id="ml">${media.length ? media.map((m, k) => `<div class="item lrow"><span class="ic">${ic(m.t === "video" || m.t === "yt" ? "vid" : "doc")}</span><div class="lt"><b>${esc(m.n || "ملف")}</b><small>${TL[m.t] || ""}</small></div><a class="btn s sm" style="text-decoration:none" href="${esc(m.u)}" target="_blank" rel="noopener">معاينة</a><button class="ab" type="button" data-d="${k}" aria-label="مسح">${ic("trash", 18)}</button></div>`).join("") : '<p class="muted center">لسه مفيش محتوى. ارفع فيديو أو PDF.</p>'}</div>
<div class="roles three" style="margin-top:12px"><button type="button" data-n="video">${ic("vid", 22)}<span>ارفع فيديو</span></button><button type="button" data-n="vlink">${ic("vid", 22)}<span>رابط فيديو</span></button><button type="button" data-n="pdf">${ic("doc", 22)}<span>ارفع PDF</span></button></div>
<p class="muted small">الفيديو المرفوع لحد 100 ميجا والـ PDF لحد 10 ميجا. رابط الفيديو لازم يكون يوتيوب أو mp4 مباشر، وبيتشغّل جوا المنصة. في الحالتين الجزء بيتحسب للطالب لما يشاهد 90% منه فعلياً.</p></div>
<div class="card" style="margin-top:14px"><h2 class="h">متابعة الطلاب</h2><div id="mn"><p class="muted center">جاري التحميل…</p></div></div>`;
      $("#bk", el).onclick = () => lecture(l);
      el.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => {
        if (!confirm("شيل الملف ده من الجزء؟")) return;
        const old = media; media = media.filter((_, k) => k !== +b.dataset.d);
        try { await persist(); } catch (e) { media = old; toast("حصل خطأ، حاول تاني"); }
        draw();
      });
      el.querySelectorAll("[data-n]").forEach(b => b.onclick = async () => {
        const old = media;
        try {
          const k = b.dataset.n; let r;
          if (k === "vlink") {
            const u = (prompt("الصق رابط الفيديو (يوتيوب أو رابط mp4 مباشر يبدأ بـ https)") || "").trim(); if (!u) return;
            const y = ytId(u);
            if (y) r = [{t: "yt", id: y, u, n: "فيديو يوتيوب"}];
            else if (/^https:\/\/.+\.(mp4|webm|m4v)(\?.*)?$/i.test(u)) r = [{t: "video", u, x: 1, n: "فيديو"}];
            else return toast("الرابط لازم يكون فيديو يوتيوب أو mp4 مباشر");
          } else r = await pickUpload({kinds: [k], max: 1});
          if (!r.length) return;
          media = [...media, ...r]; await persist(); toast("تمت الإضافة");
        } catch (e) { media = old; toast(upMsg(e)); }
        draw();
      });
      loadMon();
    };
    draw();
  }

  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  try { await load(); home(); } catch (e) { el.innerHTML = '<p class="err center">تعذّر تحميل المحاضرات. تأكد من الإنترنت وقواعد Firestore.</p>'; }
}
