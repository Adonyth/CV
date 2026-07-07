/* inspect-blob.mjs — at a tier peak, dump VISIBLE objects sorted by on-screen
   size, projected with the camera's own matrices (no THREE needed on window).
   Usage: node scripts/inspect-blob.mjs [peakCamLen]  (default 32461 = Laniakea) */
import { chromium } from "playwright";
const PEAK = Number(process.argv[2] || 32461);

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => { try { localStorage.setItem("cv-motion", "calm"); } catch (e) {} });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://127.0.0.1:8123/index.html?forcegl=1&v=inspect", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => window.__space && window.__space.ready && window.__space.teleport, null, { timeout: 180000 });
await page.evaluate((r) => window.__space.teleport(r), PEAK);
for (let i = 0; i < 24; i++) await page.evaluate(() => window.__space.pump(8));
await page.waitForTimeout(400);

const rows = await page.evaluate(() => {
  const s = window.__space, cam = s.camera;
  const root = s.scene || (s.natal && s.natal.group && s.natal.group.parent) || (s.natal && s.natal.group);
  cam.updateMatrixWorld(true);
  const view = cam.matrixWorldInverse.elements, proj = cam.projectionMatrix.elements;
  const camPos = [cam.matrixWorld.elements[12], cam.matrixWorld.elements[13], cam.matrixWorld.elements[14]];
  function mul(m, x, y, z, w) { // column-major 4x4 * vec4
    return [
      m[0]*x + m[4]*y + m[8]*z + m[12]*w,
      m[1]*x + m[5]*y + m[9]*z + m[13]*w,
      m[2]*x + m[6]*y + m[10]*z + m[14]*w,
      m[3]*x + m[7]*y + m[11]*z + m[15]*w
    ];
  }
  function effVisible(o) { for (var p = o; p; p = p.parent) { if (!p.visible) return false; } return true; }
  function parentChain(o) { var a = []; for (var p = o.parent; p && a.length < 4; p = p.parent) a.push((p.name || p.type) + "[" + (p.visible ? "v" : "H") + "]"); return a.join("<"); }
  const out = [];
  root.traverse((o) => {
    if (!(o.isPoints || o.isSprite || o.isMesh)) return;
    if (!effVisible(o)) return;                       // ancestor-chain visibility — what actually RENDERS
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements, wx = e[12], wy = e[13], wz = e[14];
    const vv = mul(view, wx, wy, wz, 1);
    const cc = mul(proj, vv[0], vv[1], vv[2], vv[3]);
    if (cc[3] <= 0) return;                          // behind camera
    const ndcX = cc[0]/cc[3], ndcY = cc[1]/cc[3], ndcZ = cc[2]/cc[3];
    if (ndcZ > 1) return;
    const sx = (ndcX*0.5+0.5)*1440, sy = (-ndcY*0.5+0.5)*900;
    // world radius: geometry bounding sphere (scaled) or sprite scale
    let wr = 0;
    const sc = Math.max(Math.abs(e[0]), Math.abs(e[5]), Math.abs(e[10])); // approx world scale
    if (o.isSprite) wr = Math.max(o.scale.x, o.scale.y) * 0.5;
    else if (o.geometry) {
      if (!o.geometry.boundingSphere) { try { o.geometry.computeBoundingSphere(); } catch (x) {} }
      wr = (o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : 0) * sc;
    }
    const dx = wx-camPos[0], dy = wy-camPos[1], dz = wz-camPos[2];
    const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
    const px = (wr>0 && dist>0) ? (wr/dist)*900 : 0;   // rough px radius
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    out.push({
      name: o.name || o.type, type: o.type,
      sx: Math.round(sx), sy: Math.round(sy), px: Math.round(px),
      centerDist: Math.round(Math.hypot(sx-720, sy-450)),
      wx: Math.round(wx), wy: Math.round(wy), wz: Math.round(wz), worldR: Math.round(wr), dist: Math.round(dist),
      blend: mat && mat.blending, op: mat && +(+mat.opacity).toFixed(2),
      selfScale: +(Math.max(Math.abs(o.scale.x), Math.abs(o.scale.y), Math.abs(o.scale.z))).toFixed(2),
      parents: parentChain(o)
    });
  });
  out.sort((a,b) => (b.px - a.px) || (a.centerDist - b.centerDist));
  return { camLen: Math.round(cam.position.length()), tier: window.CosmicLOD.currentLayerId(cam.position.length()), n: out.length, top: out.slice(0, 24) };
});
console.log("camLen=" + rows.camLen + " tier=" + rows.tier + " visibleObjs=" + rows.n);
console.log(JSON.stringify(rows.top, null, 0));
await browser.close();
