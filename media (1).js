const shrink = f => new Promise((ok, no) => {
  const im = new Image(), u = URL.createObjectURL(f);
  im.onload = () => { const s = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL("image/jpeg", .6)); };
  im.onerror = no; im.src = u;
});
export const pickPhotos = (max = 4) => new Promise(res => {
  const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.multiple = true;
  i.onchange = async () => { const out = []; for (const f of [...i.files].slice(0, max)) { try { out.push(await shrink(f)); } catch (e) {} } res(out); };
  i.oncancel = () => res([]); i.click();
});
export const tooBig = imgs => imgs.reduce((s, x) => s + x.length, 0) > 850000;
