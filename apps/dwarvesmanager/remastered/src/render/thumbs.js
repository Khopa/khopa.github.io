import * as THREE from 'three';
import { objectModel, setRackItems } from './models.js';
import { buildDwarf } from './dwarfmodel.js';
import { OBJECT_ORDER, JOB_ORDER, ROOM_ORDER, ROOMS, OBJECTS } from '../defs.js';
import { Pickaxe } from '../sim/objects.js';

// Render small icons of the real 3D models for the toolbar cards.
export function renderThumbs(renderer) {
  const size = 128;
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff0dd, 0x302018, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 6, 4);
  scene.add(key);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const out = {};
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pixels = new Uint8Array(size * size * 4);
  const img = ctx.createImageData(size, size);
  const prevTarget = renderer.getRenderTarget();
  const prevTone = renderer.toneMapping;
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const shoot = (obj, name) => {
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.62;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.position.set(c.x + 6, c.y + 5, c.z + 7);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    // flip Y, keep linear values in sRGB-ish by gamma for nicer icons
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) img.data[di + k] = Math.min(255, Math.pow(pixels[si + k] / 255, 1 / 2.2) * 255);
        img.data[di + 3] = pixels[si + 3];
      }
    ctx.putImageData(img, 0, 0);
    out[name] = canvas.toDataURL('image/png');
    scene.remove(obj);
  };

  for (const type of OBJECT_ORDER) {
    const m = objectModel(type);
    if (type === 'Rack') setRackItems(m, [new Pickaxe(), new Pickaxe(), Object.assign(new Pickaxe(), { enchanted: true })]);
    shoot(m, type);
  }
  for (const job of JOB_ORDER) {
    const m = buildDwarf(job, 3);
    m.rotation.y = -0.35;
    shoot(m, job);
  }
  // Rooms: a little floor patch with the room's key object
  for (const type of ROOM_ORDER) {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 3), new THREE.MeshStandardMaterial({ color: ROOMS[type].color, roughness: 0.8 }));
    floor.position.set(1.5, -0.04, -1.5);
    g.add(floor);
    const key = { Dorm: 'Bed', Tavern: 'Barrel', Workshop: 'Anvil' }[type];
    const m = objectModel(key);
    const [nx, ny] = OBJECTS[key].size;
    m.position.set(1.5 - nx / 2, 0, -1.5 + ny / 2);
    g.add(m);
    if (type === 'Tavern') {
      const t = objectModel('Rack');
      t.visible = false;
    }
    shoot(g, type);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  return out;
}
