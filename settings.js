import {auth, db} from "./firebase.js";
import {doc, getDoc, getDocs, collection, query, where} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, state, toast, ic} from "./ui.js";
import {SUBJECTS, digits, emailOk, checkAcc, saveAcc, pwCheck, pwErr, changePassword, requestEmailChange} from "./account.js";
import {segHtml, bindSeg} from "./theme.js";
import {fdt, tms} from "./time.js";

const RN = {student: "طالب", teacher: "مدرس", admin: "أدمن"};
const SN = {active: "مفعّل", pending: "قيد المراجعة", suspended: "موقوف"};
const pf = (id, ph, ac) => `<div class="fld"><span class="ic">${ic("lock")}</span><input id="${id}" type="password" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}"><button class="eye" type="button" aria-label="إظهار كلمة السر">${ic("eye")}</button></div>`;
const kv = (k, v) => `<div class="kv"><span class="muted">${k}</span><b>${v}</b></div>`;

/* me = {uid, role, d}. بتعرض بيانات الحساب وتسمح بتعديلها وتغيير كلمة السر والإيميل */
export async function renderSettings(el, me, goHome, onName){
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
  const subs = SUBJECTS.includes(d.subject) || !d.subject ? SUBJECTS : [d.subject, ...SUBJECTS];
  const back = `<button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع للرئيسية</button>`;
  el.innerHTML = `<div class="set"><div class="card">${back}<h2 class="h" style="margin-top:10px">الإعدادات</h2><p class="muted small">كل بياناتك هنا، وتقدر تعدّل فيها.</p></div>
${ad ? "" : `<div class="card" style="margin-top:14px"><h2 class="h">بياناتي</h2>
<label class="lb">الاسم</label><input id="fn" class="plain" value="${esc(d.name || "")}">
<label class="lb">الرقم</label><input id="fp" class="plain" inputmode="numeric" dir="ltr" value="${esc(pr.phone || "")}">
${st ? `<label class="lb">رقم ولي الأمر</label><input id="fv" class="plain" inputmode="numeric" dir="ltr" value="${esc(pr.parentPhone || "")}">` : `<label class="lb">المادة</label><select id="fs" class="plain">${subs.map(x => `<option${x === d.subject ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`}
<button id="sd" class="btn p full" type="button">حفظ البيانات</button><p id="m1" class="err" role="alert"></p>
<p class="muted small">لو غيّرت اسمك، المدرسين هيشوفوا الاسم الجديد.</p></div>`}
<div class="card" style="margin-top:14px"><h2 class="h">الدخول والأمان</h2>
<p class="small"><b>الإيميل:</b> <span dir="ltr">${esc(u ? u.email : "")}</span></p>
${ad ? "" : `<label class="lb">تغيير الإيميل</label><input id="ne" class="plain" type="email" dir="ltr" placeholder="الإيميل الجديد" autocomplete="email">${pf("ep", "كلمة السر الحالية", "current-password")}<button id="ec" class="btn s full" type="button">إرسال رابط التحقق</button><p id="m2" class="err" role="alert"></p>`}
<label class="lb">تغيير كلمة السر</label>${pf("p0", "كلمة السر الحالية", "current-password")}${pf("p1", "كلمة السر الجديدة", "new-password")}${pf("p2", "تأكيد كلمة السر الجديدة", "new-password")}
<button id="pc" class="btn s full" type="button">تغيير كلمة السر</button><p id="m3" class="err" role="alert"></p></div>
<div class="card" style="margin-top:14px"><h2 class="h">تفاصيل الحساب</h2>
${kv("النوع", RN[me.role] || "")}${ad ? "" : kv("الحالة", SN[d.status] || esc(d.status || ""))}${d.createdAt ? kv("تاريخ التسجيل", esc(fdt(tms(d.createdAt)))) : ""}${ss.at ? kv("آخر ظهور", esc(fdt(tms(ss.at)))) : ""}
${st && lk.length ? `<h3 class="h" style="font-size:15px;margin-top:12px">المدرسين المرتبطين</h3>${lk.map(l => `<div class="item"><b>${esc(l.t)}</b><small>${esc(l.s || "")}${l.g ? " · " + esc(l.g) : ""}</small></div>`).join("")}` : ""}</div>
<div class="card" style="margin-top:14px"><h2 class="h">المظهر</h2>${segHtml()}<p class="muted small">التلقائي: فاتح من 6 الصبح لـ 6 المغرب، وداكن بعدها.</p></div></div>`;

  el.querySelectorAll(".eye").forEach(b => b.onclick = () => { const i = b.parentNode.querySelector("input"), s = i.type === "password"; i.type = s ? "text" : "password"; b.innerHTML = ic(s ? "eyeoff" : "eye"); });
  bindSeg(el);
  $("#bk", el).onclick = goHome;
  const busy = async (b, m, fn) => {
    m.style.color = ""; m.textContent = ""; b.disabled = true; state.busy = true;
    try { await fn(); } catch (e) { m.textContent = e && e.ui ? e.message : e && e.code ? pwErr(e) : "حصل خطأ، حاول تاني"; }
    state.busy = false; b.disabled = false;
  };
  const ok = (m, t) => { m.style.color = "var(--accent)"; m.textContent = t; };

  if (!ad) {
    $("#sd", el).onclick = e => {
      const m = $("#m1", el), v = {name: $("#fn", el).value.trim().replace(/\s+/g, " "), phone: digits($("#fp", el).value)};
      if (st) v.parent = digits($("#fv", el).value); else v.subject = $("#fs", el).value;
      const r = {id: me.uid, role: me.role, name: d.name, phone: pr.phone || "", parentPhone: pr.parentPhone, subject: d.subject, email: u.email}, bad = checkAcc(r, v);
      if (bad) { m.textContent = bad; return; }
      return busy(e.currentTarget, m, async () => {
        await saveAcc(r, v);
        d.name = v.name; pr.phone = v.phone; if (st) pr.parentPhone = v.parent; else d.subject = v.subject;
        if (onName) onName(v.name);
        toast("تم الحفظ");
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
