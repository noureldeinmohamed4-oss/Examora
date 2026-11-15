import {esc, ic} from "./ui.js";

export const CLOUD = "du0pivhgn", PRESET = "examora";
const LIM = {image: 10, pdf: 10, video: 100};
const KN = {image: "الصورة", pdf: "ملف الـ PDF", video: "الفيديو"};
export const pick = {active: false};
export const isCl = u => /^https:\/\/res\.cloudinary\.com\//.test(u || "");
const err = m => { const e = new Error(m); e.up = true; return e; };
export const upMsg = e => e && e.up ? e.message : "حصل خطأ، حاول تاني";
const kindOf = f => {
  const t = f.type || "", n = (f.name || "").toLowerCase();
  if (t.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(n)) return "image";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (t.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp|mkv)$/.test(n)) return "video";
  return "";
};

/* ---------- اختيار الملفات ---------- */
const pickFiles = (accept, multiple) => new Promise(res => {
  const i = document.createElement("input");
  i.type = "file"; i.accept = accept; i.multiple = !!multiple;
  pick.active = true;
  const end = () => { pick.active = false; };
  const onVis = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", onVis); setTimeout(end, 2500); } };
  document.addEventListener("visibilitychange", onVis);
  setTimeout(end, 180000);
  i.onchange = () => { end(); res([...i.files]); };
  i.oncancel = () => { end(); res([]); };
  i.click();
});

/* ---------- الصور ---------- */
const loadImg = f => new Promise((ok, no) => {
  const im = new Image(), u = URL.createObjectURL(f);
  im.onload = () => { URL.revokeObjectURL(u); ok(im); };
  im.onerror = () => { URL.revokeObjectURL(u); no(err("مش قادر أفتح الصورة")); };
  im.src = u;
});
const toCanvas = (im, max) => {
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  return c;
};
const jpeg = (c, max = 1600) => new Promise((ok, no) => {
  const s = Math.min(1, max / Math.max(c.width, c.height));
  let o = c;
  if (s < 1) { o = document.createElement("canvas"); o.width = Math.round(c.width * s); o.height = Math.round(c.height * s); o.getContext("2d").drawImage(c, 0, 0, o.width, o.height); }
  o.toBlob(b => b ? ok(b) : no(err("مش قادر أجهّز الصورة")), "image/jpeg", .85);
});
const shrink = async f => jpeg(toCanvas(await loadImg(f), 1600));

function editImage(file){
  return new Promise(async (res, no) => {
    let src;
    try { src = toCanvas(await loadImg(file), 2000); } catch (e) { return no(e); }
    let rot = 0, W = 0, H = 0, cr = {x: 0, y: 0, w: 0, h: 0}, base = src, drag = null;
    const ov = document.createElement("div");
    ov.className = "ed";
    ov.innerHTML = '<div class="edw"><canvas></canvas><div class="crop"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div><p class="edh">اسحب الأركان أو الإطار للقص</p><div class="edbar"><button class="btn s sm" type="button" data-a="l">↺ يسار</button><button class="btn s sm" type="button" data-a="r">يمين ↻</button><button class="btn p sm" type="button" data-a="ok">تم</button><button class="btn s sm" type="button" data-a="x">إلغاء</button></div>';
    document.body.appendChild(ov);
    const cv = ov.querySelector("canvas"), box = ov.querySelector(".crop"), wrap = ov.querySelector(".edw");
    const place = () => { box.style.left = cr.x + "px"; box.style.top = cr.y + "px"; box.style.width = cr.w + "px"; box.style.height = cr.h + "px"; };
    const layout = () => {
      const q = rot % 180 !== 0;
      base = document.createElement("canvas");
      base.width = q ? src.height : src.width; base.height = q ? src.width : src.height;
      const g = base.getContext("2d");
      g.translate(base.width / 2, base.height / 2); g.rotate(rot * Math.PI / 180); g.drawImage(src, -src.width / 2, -src.height / 2);
      const s = Math.min((Math.min(innerWidth, 520) - 24) / base.width, (innerHeight - 190) / base.height);
      W = Math.max(60, Math.round(base.width * s)); H = Math.max(60, Math.round(base.height * s));
      cv.width = W; cv.height = H; cv.getContext("2d").drawImage(base, 0, 0, W, H);
      wrap.style.width = W + "px"; wrap.style.height = H + "px";
      cr = {x: 0, y: 0, w: W, h: H}; place();
    };
    const out = () => {
      const kx = base.width / W, ky = base.height / H, c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(cr.w * kx)); c.height = Math.max(1, Math.round(cr.h * ky));
      c.getContext("2d").drawImage(base, Math.round(cr.x * kx), Math.round(cr.y * ky), c.width, c.height, 0, 0, c.width, c.height);
      return c;
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    box.addEventListener("pointerdown", e => { drag = {h: e.target.dataset.h || "m", x: e.clientX, y: e.clientY, r: {...cr}}; box.setPointerCapture(e.pointerId); e.preventDefault(); });
    box.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, r = drag.r, min = 50, h = drag.h;
      let {x, y, w, h: hh} = r;
      if (h === "m") { x = clamp(r.x + dx, 0, W - r.w); y = clamp(r.y + dy, 0, H - r.h); }
      else {
        if (h.includes("w")) { const nx = clamp(r.x + dx, 0, r.x + r.w - min); w = r.w + (r.x - nx); x = nx; }
        if (h.includes("e")) w = clamp(r.w + dx, min, W - r.x);
        if (h.includes("n")) { const ny = clamp(r.y + dy, 0, r.y + r.h - min); hh = r.h + (r.y - ny); y = ny; }
        if (h.includes("s")) hh = clamp(r.h + dy, min, H - r.y);
      }
      cr = {x, y, w, h: hh}; place();
    });
    const up = () => { drag = null; };
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    ov.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === "l" || a === "r") { rot = (rot + (a === "r" ? 90 : 270)) % 360; layout(); }
      else if (a === "x") { ov.remove(); res(null); }
      else { b.disabled = true; jpeg(out()).then(r => { ov.remove(); res(r); }, e => { ov.remove(); no(e); }); }
    });
    layout();
  });
}

/* ---------- الرفع ---------- */
const upload = (blob, name, on) => new Promise((ok, no) => {
  const fd = new FormData();
  fd.append("file", blob, name); fd.append("upload_preset", PRESET);
  const x = new XMLHttpRequest();
  x.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`);
  x.upload.onprogress = e => { if (e.lengthComputable) on(e.loaded / e.total); };
  x.onload = () => {
    let j = {};
    try { j = JSON.parse(x.responseText); } catch (e) {}
    if (x.status >= 200 && x.status < 300 && j.secure_url) ok(j);
    else no(err("فشل الرفع" + (j.error && j.error.message ? ": " + j.error.message : "")));
  };
  x.onerror = () => no(err("الرفع فشل، تأكد من الإنترنت"));
  x.send(fd);
});

function progress(){
  const d = document.createElement("div");
  d.className = "upl";
  d.innerHTML = '<span></span><div class="bar"><i></i></div>';
  document.body.appendChild(d);
  return {set: (t, p) => { d.firstChild.textContent = t; d.querySelector("i").style.width = Math.round(p * 100) + "%"; }, close: () => d.remove()};
}

let upBusy = false;
export async function pickUpload({kinds = ["image"], max = 1, edit = false} = {}){
  if (upBusy) throw err("استنى لحد ما الرفع الحالي يخلص");
  if (max < 1) throw err("وصلت للحد الأقصى من الملفات");
  const acc = {image: "image/*", pdf: "application/pdf", video: "video/*"};
  const files = (await pickFiles(kinds.map(k => acc[k]).join(","), max > 1)).slice(0, max);
  if (!files.length) return [];
  upBusy = true;
  let p = null;
  const out = [];
  try {
    for (const [n, f] of files.entries()) {
      const k = kindOf(f);
      if (!k || !kinds.includes(k)) throw err("نوع الملف مش مدعوم");
      let b = f;
      if (k === "image") { b = edit ? await editImage(f) : await shrink(f); if (!b) continue; }
      if (b.size > LIM[k] * 1048576) throw err(KN[k] + " أكبر من " + LIM[k] + " ميجا");
      p = p || progress();
      const lbl = "جاري الرفع " + (n + 1) + " من " + files.length + "…";
      p.set(lbl, 0);
      const r = await upload(b, k === "image" ? "photo.jpg" : f.name, x => p.set(lbl + " " + Math.round(x * 100) + "%", x));
      out.push({u: r.secure_url, t: k, n: (f.name || "ملف").slice(0, 60), b: b.size});
    }
  } finally { upBusy = false; if (p) p.close(); }
  return out;
}

/* ---------- العرض ---------- */
const ok = f => f && (f.t === "link" ? /^https?:\/\//.test(f.u || "") : isCl(f.u));
const chip = (f, x = "") => `<span class="fchip">${ic(f.t === "video" ? "vid" : "doc", 18)}<a href="${esc(f.u)}" target="_blank" rel="noopener">${esc(f.n || "ملف")}</a>${x}</span>`;
export const filesHtml = (files, rm) => (files || []).map((f, i) => {
  if (!ok(f)) return "";
  const x = rm ? `<button class="ab" type="button" data-rmf="${i}" aria-label="مسح">${ic("trash", 16)}</button>` : "";
  return f.t === "image" ? `<span class="th"><a href="${esc(f.u)}" target="_blank" rel="noopener"><img class="im" src="${esc(f.u)}" alt="صورة" style="width:96px;margin:4px"></a>${x}</span>` : chip(f, x);
}).join("");
export const filesFull = files => (files || []).map(f => !ok(f) ? "" : f.t === "image"
  ? `<a href="${esc(f.u)}" target="_blank" rel="noopener"><img class="im" src="${esc(f.u)}" alt="${esc(f.n || "صورة")}"></a>` : chip(f)).join("");
export const urlImgs = (urls, w) => (urls || []).filter(isCl).map(u => `<img class="im" src="${esc(u)}" alt="صورة"${w ? ` style="width:${w}px;margin:4px"` : ""}>`).join("");
