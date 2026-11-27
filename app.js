import {auth, db, ADMIN_EMAIL} from "./firebase.js";
import {onAuthStateChanged, signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, state, ic} from "./ui.js";
import {renderAuth} from "./auth.js";
import {renderAdmin} from "./admin.js";
import {renderTeacher} from "./teacher.js";
import {renderStudent} from "./student.js";
import {renderSettings} from "./settings.js";
import {syncClock} from "./time.js";
import {initTheme, onTheme, setMode} from "./theme.js";
import {openMenu, closeMenu} from "./menu.js";

window.__booted = true;
const app = $("#app"), root = document.documentElement, th = $("#th"), lo = $("#lo"), hb = $("#hb"), mn = $("#mn");
const RN = {student: "طالب", teacher: "مدرس", admin: "أدمن"};
/* مفتاح الشمس والقمر زي ما كان. التلقائي بالوقت شغّال لحد ما الطالب يقلبه بنفسه */
const isDark = () => root.dataset.theme === "dark";
const lab = () => { const d = isDark(); th.setAttribute("aria-checked", d); th.setAttribute("aria-label", d ? "الوضع الداكن" : "الوضع الفاتح"); th.querySelector(".knob").innerHTML = ic(d ? "moon" : "sun", 16); };
th.onclick = () => { setMode(isDark() ? "light" : "dark"); lab(); };
onTheme(lab);
initTheme();
lab();
lo.innerHTML = ic("out");
lo.onclick = () => signOut(auth);
mn.innerHTML = ic("menu", 22);

let me = null, page = "home";   /* me = {uid, role, d, status} */
const pendingHtml = '<div class="pending">الحساب قيد المراجعة</div>', offHtml = '<div class="pending off">الحساب موقوف</div>';
const home = () => {
  page = "home";
  if (!me) return;
  if (me.status === "pending") app.innerHTML = pendingHtml;
  else if (me.status === "suspended") app.innerHTML = offHtml;
  else if (me.role === "admin") renderAdmin(app);
  else if (me.role === "student") renderStudent(app, me.uid, me.d);
  else renderTeacher(app, me.uid, me.d);
};
const settings = () => { if (!me) return; page = "settings"; renderSettings(app, me, home); };
const updMn = () => { mn.hidden = !(me && me.status === "active"); };
mn.onclick = () => {
  const items = [];
  if (me && me.status === "active") {
    items.push({label: "الرئيسية", icon: "home", on: home, active: page === "home"});
    items.push({label: "الإعدادات", icon: "gear", on: settings, active: page === "settings"});
  }
  openMenu({name: me ? me.d.name || "" : "", role: me ? RN[me.role] || "" : "", items});
};

/* لو الإيميل اتغيّر (بعد التحقق)، بنحدّث الإيميل في بياناتنا وجدول الأرقام عشان الدخول بالرقم يفضل شغّال */
async function syncEmail(u){
  try {
    const k = "lastEmail:" + u.uid;
    if (localStorage.getItem(k) === u.email) return;
    const p = await getDoc(doc(db, "private", u.uid));
    if (p.exists()) {
      const x = p.data();
      if (x.email !== u.email) {
        await updateDoc(doc(db, "private", u.uid), {email: u.email});
        if (x.phone) { try { await updateDoc(doc(db, "phones", x.phone), {email: u.email}); } catch (e) {} }
      }
    }
    localStorage.setItem(k, u.email);
  } catch (e) {}
}

let pt, sessUid = null, unsub = null, clk = false;
async function route(u){
  if (state.busy) return;
  clearTimeout(pt);
  lo.hidden = hb.hidden = !u;
  if (u && !clk) { clk = true; syncClock(); }
  if (!u) { me = null; page = "home"; updMn(); closeMenu(); sessUid = null; if (unsub) { unsub(); unsub = null; } if (!$("#f", app)) renderAuth(app, () => route(auth.currentUser)); return; }
  if (u.email === ADMIN_EMAIL) { me = {uid: u.uid, role: "admin", d: {name: "الأدمن"}, status: "active"}; updMn(); if (page === "home" && !$("#ls", app)) renderAdmin(app); return; }
  if (sessUid !== u.uid) { sessUid = u.uid; if (unsub) unsub(); const SID = crypto.randomUUID(); setDoc(doc(db, "sessions", u.uid), {sid: SID, at: serverTimestamp()}).then(() => { unsub = onSnapshot(doc(db, "sessions", u.uid), s => { if (s.exists() && s.data().sid !== SID) { alert("الحساب اتفتح من جهاز تاني"); signOut(auth); } }); }).catch(() => {}); }
  let s;
  try { s = await getDoc(doc(db, "users", u.uid)); }
  catch (e) { app.innerHTML = '<p class="center err">تعذّر تحميل البيانات. تأكد من الإنترنت.</p>'; return; }
  if (!s.exists()) { app.innerHTML = '<p class="center err">الحساب غير مكتمل. اخرج وسجّل من جديد.</p>'; return; }
  const d = s.data();
  me = {uid: u.uid, role: d.role, d, status: d.status};
  updMn();
  if (d.status === "pending") { if (page === "home") app.innerHTML = pendingHtml; pt = setTimeout(() => route(auth.currentUser), 30000); }
  else if (d.status === "suspended") { if (page === "home") app.innerHTML = offHtml; }
  else if (d.role === "student") { syncEmail(u); if (page === "home" && !$(".stu", app)) renderStudent(app, u.uid, d); }
  else if (d.role === "teacher") { syncEmail(u); if (page === "home" && !$(".tch", app)) renderTeacher(app, u.uid, d); }
  else app.innerHTML = `<div class="card center"><h2 class="h">أهلاً ${esc(d.name.split(" ")[0])}</h2><p class="muted">${d.role === "teacher" ? "مدرس · " + esc(d.subject) : "طالب"}</p>${d.role === "teacher" ? `<p>كودك<br><b class="code" dir="ltr">${esc(d.code)}</b></p>` : ""}<p class="muted">المحاضرات والامتحانات قريباً</p></div>`;
}
onAuthStateChanged(auth, route);
