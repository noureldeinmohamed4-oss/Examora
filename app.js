import {auth, db, ADMIN_EMAIL} from "./firebase.js";
import {onAuthStateChanged, signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {doc, getDoc, setDoc, onSnapshot, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, state, ic} from "./ui.js";
import {renderAuth} from "./auth.js";
import {renderAdmin} from "./admin.js";
import {renderTeacher} from "./teacher.js";
import {renderStudent} from "./student.js";

window.__booted = true;
const app = $("#app"), root = document.documentElement, th = $("#th"), lo = $("#lo"), hb = $("#hb");
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch (e) {}
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
const lab = () => { const d = isDark(); th.setAttribute("aria-checked", d); th.setAttribute("aria-label", d ? "الوضع الداكن" : "الوضع الفاتح"); th.querySelector(".knob").innerHTML = ic(d ? "moon" : "sun", 16); };
th.onclick = () => { const t = isDark() ? "light" : "dark"; root.dataset.theme = t; try { localStorage.setItem("theme", t); } catch (e) {} lab(); };
lab();
lo.innerHTML = ic("out");
lo.onclick = () => signOut(auth);

let pt, sessUid = null, unsub = null;
async function route(u){
  if (state.busy) return;
  clearTimeout(pt);
  lo.hidden = hb.hidden = !u;
  if (!u) { sessUid = null; if (unsub) { unsub(); unsub = null; } if (!$("#f", app)) renderAuth(app, () => route(auth.currentUser)); return; }
  if (u.email === ADMIN_EMAIL) { if (!$("#ls", app)) renderAdmin(app); return; }
  if (sessUid !== u.uid) { sessUid = u.uid; if (unsub) unsub(); const SID = crypto.randomUUID(); setDoc(doc(db, "sessions", u.uid), {sid: SID, at: serverTimestamp()}).then(() => { unsub = onSnapshot(doc(db, "sessions", u.uid), s => { if (s.exists() && s.data().sid !== SID) { alert("الحساب اتفتح من جهاز تاني"); signOut(auth); } }); }).catch(() => {}); }
  let s;
  try { s = await getDoc(doc(db, "users", u.uid)); }
  catch (e) { app.innerHTML = '<p class="center err">تعذّر تحميل البيانات. تأكد من الإنترنت.</p>'; return; }
  if (!s.exists()) { app.innerHTML = '<p class="center err">الحساب غير مكتمل. اخرج وسجّل من جديد.</p>'; return; }
  const d = s.data();
  if (d.status === "pending") { app.innerHTML = '<div class="pending">الحساب قيد المراجعة</div>'; pt = setTimeout(() => route(auth.currentUser), 30000); }
  else if (d.status === "suspended") app.innerHTML = '<div class="pending off">الحساب موقوف</div>';
  else if (d.role === "student") { if (!$(".stu", app)) renderStudent(app, u.uid, d); }
  else if (d.role === "teacher") { if (!$(".tch", app)) renderTeacher(app, u.uid, d); }
  else app.innerHTML = `<div class="card center"><h2 class="h">أهلاً ${esc(d.name.split(" ")[0])}</h2><p class="muted">${d.role === "teacher" ? "مدرس · " + esc(d.subject) : "طالب"}</p>${d.role === "teacher" ? `<p>كودك<br><b class="code" dir="ltr">${esc(d.code)}</b></p>` : ""}<p class="muted">المحاضرات والامتحانات قريباً</p></div>`;
}
onAuthStateChanged(auth, route);
