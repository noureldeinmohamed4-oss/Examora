import {auth, db} from "./firebase.js";
import {doc, getDoc, getDocs, collection, query, where} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, state, toast, ic} from "./ui.js";
import {digits, phoneOk, emailOk, savePhone, pwCheck, pwErr, changePassword, requestEmailChange} from "./account.js";
import {fdt, tms} from "./time.js";

const RN = {student: "طالب", teacher: "مدرس", admin: "أدمن"};
const SN = {active: "مفعّل", pending: "قيد المراجعة", suspended: "موقوف"};
const pf = (id, ph, ac) => `<div class="fld"><span class="ic">${ic("lock")}</span><input id="${id}" type="password" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}"><button class="eye" type="button" aria-label="إظهار كلمة السر">${ic("eye")}</button></div>`;
const lock = `<span class="srk" role="img" aria-label="الأدمن بس بيعدّله">${ic("lock", 18)}</span>`;
const act = (id, t) => `<button class="btn s sm" type="button" data-t="${id}">${t}</button>`;
const btns = (ok, id) => `<div class="acts"><button id="${ok}" class="btn p sm" type="button" style="flex:1">${id}</button><button class="btn s sm" type="button" data-x style="flex:1">إلغاء</button></div>`;
const row = (label, val, right, vid) => `<div class="sr"><div><span class="srl">${label}</span><span class="srv"${vid ? ` id="${vid}"` : ""}>${val}</span></div>${right || ""}</div>`;

/* me = {uid, role, d}: الاسم ورقم ولي الأمر والمادة للأدمن بس. صاحب الحساب يغيّر رقمه وإيميله وكلمة سره */
export async function renderSettings(el, me, goHome){
  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  const u = auth.currentUser, st = me.role === "student", ad = me.role === "admin", d = me.d || {};
  let pr = {}, ss = {}, lk = [];
  if (!ad) {
    const one = async (c, id) => { try { const z = await getDoc(doc(db, c, id)); return z.exists() ? z.data() : {}; } catch (e) { return {}; } };
    [pr, ss] = await Promise.all([one("private", me.uid), one("sessions", me.uid)]);
    if (st) {
      try {
        const L = (await getDocs(query(collection(db, "links"), where("studentUid", "==", me.uid)))).docs.map(z => z.data());
        lk = await Promise.all(L.map(async l => {
          let g = "";
          try { const z = await getDoc(doc(db, "groups", l.groupId)); if (z.exists()) { const x = z.data(), gr = x.grade && x.grade !== "غير محدد" ? x.grade : ""; g = gr + (x.label ? (gr ? " · " : "") + x.label : ""); } } catch (e) {}
          return {t: l.teacherName, s: l.subject, g};
        }));
      } catch (e) {}
    }
  }
  const nm = d.name || (ad ? "الأدمن" : ""), email = u ? u.email : "";
  const person = ad ? "" : `<div><p class="sgt">بياناتي</p><div class="sl">
<div class="sx">${row("الاسم", esc(nm), lock)}</div>
<div class="sx">${row("رقم الهاتف", `<bdi dir="ltr">${esc(pr.phone || "")}</bdi>`, act("ph", "تعديل"), "vp")}<div class="sed" id="ed-ph" hidden><input id="np" class="plain" inputmode="numeric" dir="ltr" placeholder="الرقم الجديد" aria-label="الرقم الجديد">${btns("sp", "حفظ")}<p id="m1" class="err" role="alert"></p></div></div>
<div class="sx">${st ? row("رقم ولي الأمر", `<bdi dir="ltr">${esc(pr.parentPhone || "")}</bdi>`, lock) : row("المادة", esc(d.subject || ""), lock)}</div></div>
<p class="muted small">${st ? "الاسم ورقم ولي الأمر" : "الاسم والمادة"} بيغيّرهم الأدمن بس. لو فيهم غلط كلّم الأدمن.</p></div>`;
  const sec = `<div><p class="sgt">الدخول والأمان</p><div class="sl">
<div class="sx">${row("الإيميل", `<bdi dir="ltr">${esc(email)}</bdi>`, ad ? "" : act("em", "تغيير"))}${ad ? "" : `<div class="sed" id="ed-em" hidden><input id="ne" class="plain" type="email" dir="ltr" placeholder="الإيميل الجديد" aria-label="الإيميل الجديد" autocomplete="email">${pf("ep", "كلمة السر الحالية", "current-password")}<p class="muted small">هنبعت رابط تحقق على الإيميل الجديد.</p>${btns("ec", "إرسال الرابط")}<p id="m2" class="err" role="alert"></p></div>`}</div>
<div class="sx">${row("كلمة السر", "••••••••", act("pw", "تغيير"))}<div class="sed" id="ed-pw" hidden>${pf("p0", "كلمة السر الحالية", "current-password")}${pf("p1", "كلمة السر الجديدة", "new-password")}${pf("p2", "تأكيد كلمة السر الجديدة", "new-password")}${btns("pc", "حفظ")}<p id="m3" class="err" role="alert"></p></div></div></div></div>`;
  const info = `<div><p class="sgt">حسابي</p><div class="sl">
${d.createdAt ? `<div class="sx">${row("تاريخ التسجيل", esc(fdt(tms(d.createdAt))))}</div>` : ""}${ss.at ? `<div class="sx">${row("آخر ظهور", esc(fdt(tms(ss.at))))}</div>` : ""}
${st && lk.length ? `<div class="sx"><div class="sr"><div><span class="srl">المدرسين</span>${lk.map(l => `<span class="srv">${esc(l.t)} · ${esc(l.s || "")}${l.g ? " · " + esc(l.g) : ""}</span>`).join("")}</div></div></div>` : ""}</div></div>`;
  el.innerHTML = `<div class="set"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع للرئيسية</button>
<div class="card sc"><div class="sav" aria-hidden="true">${esc((nm || "؟").trim().charAt(0))}</div><div><b>${esc(nm)}</b><small class="muted" style="display:block">${RN[me.role] || ""}${ad ? "" : " · " + (SN[d.status] || esc(d.status || ""))}</small></div></div>
${person}${sec}${info}</div>`;

  el.querySelectorAll(".eye").forEach(b => b.onclick = () => { const i = b.parentNode.querySelector("input"), s = i.type === "password"; i.type = s ? "text" : "password"; b.innerHTML = ic(s ? "eyeoff" : "eye"); });
  $("#bk", el).onclick = goHome;
  const eds = () => el.querySelectorAll(".sed");
  const closeAll = () => eds().forEach(x => { x.hidden = true; });
  el.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { const x = $("#ed-" + b.dataset.t, el), was = x.hidden; closeAll(); x.hidden = !was; });
  el.querySelectorAll("[data-x]").forEach(b => b.onclick = closeAll);
  const busy = async (b, m, fn) => {
    m.style.color = ""; m.textContent = ""; b.disabled = true; state.busy = true;
    try { await fn(); } catch (e) { m.textContent = e && e.ui ? e.message : e && e.code ? pwErr(e) : "حصل خطأ، حاول تاني"; }
    state.busy = false; b.disabled = false;
  };
  const ok = (m, t) => { m.style.color = "var(--accent)"; m.textContent = t; };

  if (!ad) {
    $("#sp", el).onclick = e => {
      const m = $("#m1", el), np = digits($("#np", el).value);
      if (!phoneOk(np)) { m.textContent = "الرقم غير صحيح (11 رقم يبدأ بـ 01)"; return; }
      if (np === (pr.phone || "")) { m.textContent = "ده نفس رقمك الحالي"; return; }
      return busy(e.currentTarget, m, async () => {
        await savePhone({uid: me.uid, phone: pr.phone || "", parentPhone: pr.parentPhone, email: u.email}, np);
        pr.phone = np; $("#vp", el).innerHTML = `<bdi dir="ltr">${esc(np)}</bdi>`; $("#np", el).value = ""; closeAll(); toast("تم تغيير الرقم");
      });
    };
    $("#ec", el).onclick = e => {
      const m = $("#m2", el), ne = $("#ne", el).value.trim().toLowerCase(), cur = $("#ep", el).value;
      if (!emailOk(ne)) { m.textContent = "الإيميل الجديد غير صحيح"; return; }
      if (u && ne === String(u.email).toLowerCase()) { m.textContent = "ده نفس الإيميل الحالي"; return; }
      if (!cur) { m.textContent = "اكتب كلمة السر الحالية"; return; }
      return busy(e.currentTarget, m, async () => {
        await requestEmailChange(cur, ne);
        $("#ep", el).value = "";
        ok(m, "بعتنا رابط تحقق على " + ne + ". افتحه من الإيميل الجديد. لحد ما تفتحه، الإيميل القديم هو اللي بيشتغل. بعد التأكيد ادخل بالإيميل الجديد.");
      });
    };
  }
  $("#pc", el).onclick = e => {
    const m = $("#m3", el), cur = $("#p0", el).value, nw = $("#p1", el).value, nw2 = $("#p2", el).value, bad = pwCheck(cur, nw, nw2);
    if (bad) { m.textContent = bad; return; }
    return busy(e.currentTarget, m, async () => {
      await changePassword(cur, nw);
      ["p0", "p1", "p2"].forEach(i => { $("#" + i, el).value = ""; });
      ok(m, "تم تغيير كلمة السر");
    });
  };
}
