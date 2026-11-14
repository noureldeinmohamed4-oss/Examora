import {auth, db, ADMIN_EMAIL} from "./firebase.js";
import {createUserWithEmailAndPassword, signInWithEmailAndPassword} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {doc, getDoc, writeBatch, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, state} from "./ui.js";

const SUBJECTS = ["اللغة العربية","اللغة الإنجليزية","اللغة الفرنسية","الرياضيات","الفيزياء","الكيمياء","الأحياء","العلوم","التاريخ","الجغرافيا","الفلسفة والمنطق","علم النفس والاجتماع","الحاسب الآلي","مادة أخرى"];
const digits = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "");
const phoneOk = p => /^01[0125]\d{8}$/.test(p);
const nameOk = n => n.trim().split(/\s+/).filter(w => w.length > 1).length >= 3;
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const ERR = {"auth/invalid-credential":"بيانات الدخول غير صحيحة","auth/user-not-found":"بيانات الدخول غير صحيحة","auth/wrong-password":"بيانات الدخول غير صحيحة","auth/email-already-in-use":"الإيميل مسجّل بالفعل","auth/network-request-failed":"مفيش إنترنت","auth/too-many-requests":"محاولات كتير، استنى شوية","auth/invalid-email":"الإيميل غير صحيح","auth/weak-password":"كلمة السر ضعيفة"};
const errMsg = e => ERR[e && e.code] || "حصل خطأ، حاول تاني";
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => CH[n % 32]).join("");
const F = (id, label, type = "text", x = "") => `<label for="${id}">${label}</label><input id="${id}" type="${type}" ${x}>`;
const COMMON = F("email","الإيميل","email",'autocomplete="email" dir="ltr"') + F("pw","كلمة السر","password",'autocomplete="new-password"') + F("pw2","تأكيد كلمة السر","password",'autocomplete="new-password"');
const FORM = {
  login: F("id","الإيميل أو رقم الطالب","text",'autocomplete="username" dir="ltr"') + F("pw","كلمة السر","password",'autocomplete="current-password"'),
  student: F("name","الاسم ثلاثي","text",'autocomplete="name"') + F("phone","رقم الطالب","tel",'inputmode="numeric" dir="ltr"') + F("parent","رقم ولي الأمر","tel",'inputmode="numeric" dir="ltr"') + COMMON + F("code","كود المدرس","text",'dir="ltr" autocapitalize="characters"'),
  teacher: F("name","الاسم ثلاثي","text",'autocomplete="name"') + F("phone","رقم الهاتف","tel",'inputmode="numeric" dir="ltr"') + COMMON + `<label for="subject">المادة</label><select id="subject"><option value="">اختار المادة</option>${SUBJECTS.map(s => `<option>${s}</option>`).join("")}</select>`
};

export function renderAuth(el, onDone){
  let mode = "login";
  const v = id => { const x = $("#" + id, el); return x ? x.value : ""; };
  const draw = () => {
    el.innerHTML = `<div class="card"><div class="tabs">${[["login","دخول"],["student","حساب طالب"],["teacher","حساب مدرس"]].map(([k,t]) => `<button type="button" data-m="${k}" class="${k===mode?"on":""}">${t}</button>`).join("")}</div><form id="f" novalidate>${FORM[mode]}<p id="msg" class="err" role="alert"></p><button class="btn p full" id="go" type="submit">${mode==="login"?"دخول":"إنشاء الحساب"}</button></form></div>`;
    el.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    $("#f", el).onsubmit = async e => {
      e.preventDefault();
      const go = $("#go", el), msg = $("#msg", el);
      msg.textContent = ""; go.disabled = true;
      try { const m = mode === "login" ? await login(v) : await register(mode, v); if (m) msg.textContent = m; else onDone(); }
      catch (x) { msg.textContent = errMsg(x); }
      go.disabled = false;
    };
  };
  draw();
}

async function login(v){
  const id = v("id").trim(), pw = v("pw");
  if (!id || !pw) return "اكتب الإيميل أو الرقم وكلمة السر";
  let email;
  if (id.toLowerCase() === "admin") email = ADMIN_EMAIL;
  else if (id.includes("@")) email = id;
  else {
    const p = digits(id);
    if (!phoneOk(p)) return "الرقم غير صحيح";
    const s = await getDoc(doc(db, "phones", p));
    if (!s.exists()) return "بيانات الدخول غير صحيحة";
    email = s.data().email;
  }
  await signInWithEmailAndPassword(auth, email, pw);
  return "";
}

async function register(role, v){
  const st = role === "student";
  const name = v("name").trim(), phone = digits(v("phone")), parent = digits(v("parent"));
  const email = v("email").trim().toLowerCase(), pw = v("pw"), pw2 = v("pw2");
  const code = v("code").trim().toUpperCase(), subject = v("subject");
  if (!nameOk(name)) return "اكتب الاسم ثلاثي (الأول والثاني والثالث)";
  if (!phoneOk(phone)) return "الرقم غير صحيح (11 رقم يبدأ بـ 01)";
  if (st) {
    if (!phoneOk(parent)) return "رقم ولي الأمر غير صحيح";
    if (parent === phone) return "رقم ولي الأمر لازم يكون غير رقم الطالب";
    if (!code) return "اكتب كود المدرس";
  } else if (!subject) return "اختار المادة";
  if (!emailOk(email)) return "الإيميل غير صحيح";
  if (pw.length < 8) return "كلمة السر 8 حروف على الأقل";
  if (pw !== pw2) return "تأكيد كلمة السر غير مطابق";
  if ((await getDoc(doc(db, "phones", phone))).exists()) return "الرقم مسجّل بالفعل";
  let teacherUid = null, mine = null;
  if (st) {
    const c = await getDoc(doc(db, "codes", code));
    if (!c.exists()) return "كود المدرس غير صحيح";
    teacherUid = c.data().teacherUid;
  } else {
    for (let i = 0; i < 5 && !mine; i++) { const c = genCode(); if (!(await getDoc(doc(db, "codes", c))).exists()) mine = c; }
    if (!mine) return "حصل خطأ، حاول تاني";
  }
  state.busy = true;
  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, pw);
    const uid = cred.user.uid, b = writeBatch(db);
    b.set(doc(db, "users", uid), {name, role, status: "pending", createdAt: serverTimestamp(), ...(st ? {teachers: [teacherUid]} : {subject, code: mine})});
    b.set(doc(db, "private", uid), {phone, email, ...(st ? {parentPhone: parent} : {})});
    b.set(doc(db, "phones", phone), {uid, email});
    if (!st) b.set(doc(db, "codes", mine), {teacherUid: uid});
    await b.commit();
  } catch (x) {
    if (cred) await cred.user.delete().catch(() => {});
    state.busy = false;
    throw x;
  }
  state.busy = false;
  return "";
}
