/* ============================================================
   footprint-map.js — the Earth unfolds into the world.
   1) INTRO: a lone rotating Earth (blue-marble + the real trace
      burned on) topologically unfolds — the sphere's vertices lerp
      onto the equirectangular plane — then hands over to
   2) THE MAP: a real slippy map (Leaflet + CARTO dark tiles, street-
      level zoom) with all 602,733 raw GPS points drawn on a canvas
      overlay, zoom-adaptive. Nothing here loads until this page opens.
   ============================================================ */
const PTS_URL = "data/footprint-points.f32";
const MARBLE = "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg";
const START = { lat: 39.5, lng: -98 };           // the trace lives mostly here

/* ---------------- the map (initialized immediately, hidden under the intro) ---------------- */
const map = L.map("map", { zoomControl: true, worldCopyJump: true, preferCanvas: true })
  .setView([START.lat, START.lng], 4);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd", maxZoom: 19
}).addTo(map);

/* ---------------- the trace overlay: one canvas, typed-array fast ---------------- */
let X01 = null, Y01 = null, N = 0;               // normalized web-mercator coords
const overlay = document.createElement("canvas");
overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:400;";
map.getPanes().overlayPane.appendChild(overlay);

function mercatorize(raw) {  // (sets __fp.n at the end)
  const n = raw.length / 2 | 0;
  X01 = new Float32Array(n); Y01 = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const lat = raw[i * 2], lon = raw[i * 2 + 1];
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 85) continue;
    const s = Math.sin(lat * Math.PI / 180);
    X01[j] = (lon + 180) / 360;
    Y01[j] = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    j++;
  }
  N = j;
  if (window.__fp) window.__fp.n = N;
}

function strideFor(z) { return z <= 4 ? 10 : z <= 6 ? 5 : z <= 8 ? 2 : 1; }

function draw() {
  if (!N) return;
  const size = map.getSize();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  overlay.width = size.x * dpr; overlay.height = size.y * dpr;
  overlay.style.width = size.x + "px"; overlay.style.height = size.y + "px";
  // keep the canvas glued to the viewport while the map pane translates
  const tl = map.containerPointToLayerPoint([0, 0]);
  L.DomUtil.setPosition(overlay, tl);
  const ctx = overlay.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.x, size.y);
  ctx.globalCompositeOperation = "lighter";

  const z = map.getZoom();
  const scale = 256 * Math.pow(2, z);
  const origin = map.getPixelBounds().min;
  const st = strideFor(z);
  const dot = z <= 5 ? 1.6 : z <= 9 ? 2.2 : z <= 12 ? 3.0 : 4.0;
  const soft = dot * 2.4;

  // soft warm bed
  ctx.fillStyle = "rgba(255,150,90,0.16)";
  for (let i = 0; i < N; i += st) {
    const px = X01[i] * scale - origin.x, py = Y01[i] * scale - origin.y;
    if (px < -8 || py < -8 || px > size.x + 8 || py > size.y + 8) continue;
    ctx.fillRect(px - soft / 2, py - soft / 2, soft, soft);
  }
  // bright core
  ctx.fillStyle = "rgba(255,214,158,0.9)";
  let drawn = 0;
  for (let i = 0; i < N; i += st) {
    const px = X01[i] * scale - origin.x, py = Y01[i] * scale - origin.y;
    if (px < -4 || py < -4 || px > size.x + 4 || py > size.y + 4) continue;
    ctx.fillRect(px - dot / 2, py - dot / 2, dot, dot);
    drawn++;
  }
  if (window.__fp) { window.__fp.drawn = drawn; window.__fp.lastZoom = z; }
  ctx.globalCompositeOperation = "source-over";
}
window.__fp = { n: 0, drawn: 0, lastZoom: -1, draw: function () { draw(); }, map: map };   // diagnosability + direct hooks
let drawQueued = false;
function queueDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); } }
map.on("move zoom viewreset resize zoomend moveend", queueDraw);

const hint = document.getElementById("map-hint");
map.once("zoomstart", () => hint && hint.classList.add("gone"));

/* ---------------- the data (shared by intro texture + overlay) ---------------- */
const rawPromise = fetch(PTS_URL).then(r => r.arrayBuffer()).then(b => new Float32Array(b));
rawPromise.then(raw => { mercatorize(raw); queueDraw(); });

/* ---------------- INTRO: the lone Earth unfolds into the plane ---------------- */
const unfoldHost = document.getElementById("unfold");
const skipBtn = document.getElementById("skip");
let introDone = false;
function finishIntro() {
  if (introDone) return; introDone = true;
  unfoldHost.classList.add("done");
  skipBtn.style.display = "none";
  setTimeout(() => { unfoldHost.remove(); }, 800);
}
skipBtn.addEventListener("click", finishIntro);

(async function intro() {
  let THREE;
  try { THREE = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"); }
  catch (e) { finishIntro(); return; }
  try {
    const W = innerWidth, H = innerHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H); renderer.setClearColor(0x0b0a09, 1);
    unfoldHost.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(46, W / H, 0.1, 100);
    cam.position.set(0, 0, 3.1);

    // texture: blue marble + the real trace, composited once
    const texCv = document.createElement("canvas"); texCv.width = 2048; texCv.height = 1024;
    const tctx = texCv.getContext("2d");
    await new Promise((res) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => { tctx.drawImage(img, 0, 0, 2048, 1024); res(); };
      img.onerror = () => { tctx.fillStyle = "#10233f"; tctx.fillRect(0, 0, 2048, 1024); res(); };
      img.src = MARBLE;
    });
    try {
      const raw = await rawPromise;
      tctx.fillStyle = "rgba(255,190,130,0.85)";
      for (let i = 0; i < raw.length; i += 2) {
        const lat = raw[i], lon = raw[i + 1];
        if (!isFinite(lat) || !isFinite(lon)) continue;
        tctx.fillRect(((lon + 180) / 360) * 2048, ((90 - lat) / 180) * 1024, 1.4, 1.4);
      }
    } catch (e) {}
    const tex = new THREE.CanvasTexture(texCv);
    if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;

    // sphere whose vertices remember BOTH shapes: the globe and the flat chart
    const SEG_U = 96, SEG_V = 48;
    const geo = new THREE.SphereGeometry(1, SEG_U, SEG_V);
    const posA = geo.getAttribute("position");
    const uvA = geo.getAttribute("uv");
    const spherePos = posA.array.slice();
    const planePos = new Float32Array(posA.count * 3);
    const PW = 3.6, PH = 1.8;                        // plane spans (2:1, like the chart)
    for (let i = 0; i < posA.count; i++) {
      planePos[i * 3] = (uvA.getX(i) - 0.5) * PW;
      planePos[i * 3 + 1] = (uvA.getY(i) - 0.5) * PH;
      planePos[i * 3 + 2] = 0;
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const globe = new THREE.Mesh(geo, mat);
    scene.add(globe);

    const t0 = performance.now();
    const SPIN_MS = 2100, MORPH_MS = 2100;
    function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    (function loop() {
      if (introDone) { renderer.dispose(); return; }
      const el = performance.now() - t0;
      if (el < SPIN_MS) {
        globe.rotation.y = el * 0.00042 + 3.4;       // the lone Earth turns in the void
      } else {
        const k = ease(Math.min(1, (el - SPIN_MS) / MORPH_MS));
        // settle the spin so the chart lands square, then unfold
        globe.rotation.y *= (1 - k);
        for (let i = 0; i < posA.count; i++) {
          posA.array[i * 3]     = spherePos[i * 3]     + (planePos[i * 3]     - spherePos[i * 3]) * k;
          posA.array[i * 3 + 1] = spherePos[i * 3 + 1] + (planePos[i * 3 + 1] - spherePos[i * 3 + 1]) * k;
          posA.array[i * 3 + 2] = spherePos[i * 3 + 2] + (planePos[i * 3 + 2] - spherePos[i * 3 + 2]) * k;
        }
        posA.needsUpdate = true;
        if (el > SPIN_MS + MORPH_MS + 500) { finishIntro(); renderer.dispose(); return; }
      }
      renderer.render(scene, cam);
      requestAnimationFrame(loop);
    })();
  } catch (e) { finishIntro(); }
})();
