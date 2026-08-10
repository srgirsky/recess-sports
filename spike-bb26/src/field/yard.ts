// OWNER: field agent. Everything man-made beyond the fence — the neighborhood
// that makes steam-02 read as a place: candy-colored houses with pitched roofs
// and real windows, a shed with X-brace doors, a scrap truck, telephone poles
// with sagging catenary wires crossing the upper frame, a badminton net, a
// swing set, and the garden hose coiled inside the yard.
//
// Frame geography: the cameras face +z, so world +x projects onto the LEFT
// half of the frame (see render/cameras.ts). steam-02's blue two-story is
// frame-left → +x; the shed, scrap truck and tall pole are frame-right → -x.

import * as THREE from 'three';
import type { Rng } from '../core/rng';
import type { MaterialsApi } from '../materials/index';
import { flat } from './ground';

// ------------------------------------------------------------------ house ---

type HouseOpts = {
  x: number;
  z: number;
  rotY?: number;
  w: number; // width along local x (ridge direction)
  d: number; // depth along local z
  wallH: number;
  siding: string;
  roofC: string;
  moss?: boolean;
  windows: [cols: number, rows: number];
  door?: boolean;
  chimney?: boolean;
};

function windowUnit(m: MaterialsApi, w = 3, h = 3.6): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), flat(m, 'woodTrim'));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, h - 0.8, 0.34), flat(m, 'roofSlate'));
  const munH = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.22, 0.4), flat(m, 'woodTrim'));
  const munV = new THREE.Mesh(new THREE.BoxGeometry(0.22, h - 0.8, 0.4), flat(m, 'woodTrim'));
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.3, 0.5), flat(m, 'woodTrim'));
  sill.position.y = -h / 2 - 0.1;
  g.add(frame, glass, munH, munV, sill);
  return g;
}

function house(m: MaterialsApi, o: HouseOpts): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);
  g.rotation.y = o.rotY ?? 0;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(o.w, o.wallH, o.d),
    m.siding(o.siding, { worldSize: [o.w, o.wallH] }),
  );
  body.position.y = o.wallH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Pitched roof, ridge along local x. Panels overhang eaves and gables.
  const rise = o.d * 0.42;
  const halfD = o.d / 2 + 0.9;
  const eaveY = o.wallH - 0.15;
  const ridgeY = o.wallH + rise;
  const slope = Math.hypot(halfD, ridgeY - eaveY);
  const pitch = Math.atan2(ridgeY - eaveY, halfD);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(o.w + 1.6, 0.28, slope),
      m.roof(o.roofC, { moss: o.moss, worldSize: [o.w + 1.6, slope] }),
    );
    panel.position.set(0, (eaveY + ridgeY) / 2 + 0.1, (side * halfD) / 2);
    panel.rotation.x = side * pitch;
    panel.castShadow = true;
    g.add(panel);
  }
  // Gable triangles close the roof ends.
  const tri = new THREE.Shape();
  tri.moveTo(-o.d / 2, eaveY);
  tri.lineTo(o.d / 2, eaveY);
  tri.lineTo(0, ridgeY);
  tri.closePath();
  const gableMat = m.siding(o.siding, { worldSize: [o.d, rise] });
  gableMat.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(tri), gableMat);
    gable.rotation.y = (side * Math.PI) / 2;
    gable.position.x = (side * o.w) / 2;
    g.add(gable);
  }

  // Windows march across the camera-facing (-z) wall, one row per story.
  const [cols, rows] = o.windows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (o.door && r === 0 && c === Math.floor(cols / 2)) continue; // door slot
      const win = windowUnit(m);
      const wx = (c - (cols - 1) / 2) * (o.w / cols);
      const wy = 4.6 + r * (o.wallH / rows);
      win.position.set(wx, wy, -(o.d / 2 + 0.1));
      g.add(win);
    }
  }
  if (o.door) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(4.2, 7.2, 0.24), flat(m, 'woodTrim'));
    trim.position.set(0, 3.6, -(o.d / 2 + 0.1));
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6.6, 0.3), flat(m, 'woodDark'));
    door.position.set(0, 3.3, -(o.d / 2 + 0.12));
    g.add(trim, door);
  }
  if (o.chimney) {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(2.2, rise + 4, 2.2), flat(m, 'roofRed'));
    chimney.position.set(o.w * 0.28, o.wallH + rise / 2 + 1.2, o.d * 0.12);
    chimney.castShadow = true;
    g.add(chimney);
  }
  return g;
}

// ------------------------------------------------------------------- shed ---

function shed(m: MaterialsApi, x: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const W = 20;
  const D = 13;
  const H = 11;

  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), m.shedWood({ worldSize: [W, H] }));
  walls.position.y = H / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);

  // Barrel-curved roof: half cylinder, axis along x, flattened.
  const roofMat = m.roof('roofShedGreen', { worldSize: [8, 8] });
  roofMat.side = THREE.DoubleSide;
  const roofGeo = new THREE.CylinderGeometry(6.9, 6.9, W + 1.2, 18, 1, true, 0, Math.PI);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.scale.y = 0.58;
  roof.position.y = H;
  roof.castShadow = true;
  g.add(roof);
  // Half-disc ends close the barrel.
  const endMat = m.shedWood({ worldSize: [10, 5] });
  endMat.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(6.9, 16, 0, Math.PI), endMat);
    end.rotation.y = (side * Math.PI) / 2;
    end.scale.y = 0.58;
    end.position.set((side * (W + 1.2)) / 2, H, 0);
    g.add(end);
  }
  // Fascia trim along the eaves.
  for (const side of [-1, 1]) {
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.5, 0.3), flat(m, 'woodTrim'));
    fascia.position.set(0, H + 0.1, (side * D) / 2 + side * 0.2);
    g.add(fascia);
  }

  // Double doors with X-braces on the camera-facing (-z) wall.
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(7.8, 7.2, 0.2), flat(m, 'woodTrim'));
  doorFrame.position.set(0, 3.6, -(D / 2 + 0.08));
  g.add(doorFrame);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 6.8, 0.24),
      m.wood(undefined, { weather: 0.25, worldSize: [3.5, 6.8] }),
    );
    panel.position.set(side * 1.85, 3.4, -(D / 2 + 0.14));
    g.add(panel);
    const braceLen = Math.hypot(3.1, 6.2);
    const braceA = Math.atan2(6.2, 3.1);
    for (const dir of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.55, braceLen, 0.2), flat(m, 'woodTrim'));
      brace.rotation.z = dir * (Math.PI / 2 - braceA);
      brace.position.set(side * 1.85, 3.4, -(D / 2 + 0.28));
      g.add(brace);
    }
  }
  return g;
}

// ------------------------------------------------------------------ truck ---

function truck(m: MaterialsApi, x: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(17, 1.2, 6.8), flat(m, 'hudInk'));
  chassis.position.y = 1.6;
  g.add(chassis);

  const box = new THREE.Mesh(new THREE.BoxGeometry(13, 9.5, 7.6), m.metal(undefined, { worldSize: [13, 9.5] }));
  box.position.set(-2.4, 6.9, 0);
  box.castShadow = true;
  g.add(box);
  // Panel ribs + a rust streak along the skirt.
  for (const rx of [-7.8, -2.4, 3]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9.5, 0.2), flat(m, 'metalRust'));
    rib.position.set(rx, 6.9, -3.85);
    g.add(rib);
  }
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(13, 0.7, 0.15), flat(m, 'metalRust'));
  skirt.position.set(-2.4, 2.6, -3.82);
  g.add(skirt);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 5.4, 6.8), flat(m, 'roofSlate'));
  cab.position.set(6.8, 4.7, 0);
  cab.castShadow = true;
  g.add(cab);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 5.8), flat(m, 'hazeBand'));
  windshield.position.set(9.15, 5.4, 0);
  windshield.rotation.z = -0.18;
  g.add(windshield);

  const wheelGeo = new THREE.CylinderGeometry(1.7, 1.7, 0.9, 14);
  wheelGeo.rotateX(Math.PI / 2);
  for (const wx of [-6.4, -2.4, 6.2]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, flat(m, 'hudInk'));
      wheel.position.set(wx, 1.7, side * 3.5);
      g.add(wheel);
    }
  }
  return g;
}

// ------------------------------------------------------- poles and wires ---

function pole(m: MaterialsApi, x: number, z: number, h = 38): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.55, h, 8),
    m.wood('woodDark', { worldSize: [2.5, h] }),
  );
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);
  for (const ay of [h - 2.5, h - 5.5]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.55, 0.45), flat(m, 'woodDark'));
    arm.position.y = ay;
    arm.castShadow = true;
    g.add(arm);
  }
  return g;
}

/** Catenary runs between successive points; two wires per run, both sagging. */
function wires(m: MaterialsApi, pts: [number, number, number][]): THREE.Group {
  const g = new THREE.Group();
  const mat = flat(m, 'hudInk');
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, z0] = pts[i];
    const [x1, y1, z1] = pts[i + 1];
    const dist = Math.hypot(x1 - x0, z1 - z0);
    for (const [drop, sagK] of [
      [0, 0.055],
      [-1.6, 0.068],
    ]) {
      const a = new THREE.Vector3(x0, y0 + drop, z0);
      const b = new THREE.Vector3(x1, y1 + drop, z1);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y -= dist * sagK * 2; // bezier midpoint dips twice the apparent sag
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.14, 5), mat));
    }
  }
  return g;
}

// ------------------------------------------------------------- small kit ---

function badmintonNet(m: MaterialsApi, x: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const postMat = flat(m, 'cloverWhite');
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8.6, 8), postMat);
    post.position.set(side * 4.8, 4.3, 0);
    post.castShadow = true;
    g.add(post);
  }
  const meshMat = flat(m, 'cloverWhite');
  meshMat.transparent = true;
  meshMat.opacity = 0.45;
  meshMat.side = THREE.DoubleSide;
  const netPlane = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 3.2), meshMat);
  netPlane.position.y = 6.8;
  g.add(netPlane);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.32, 0.12), postMat);
  tape.position.y = 8.4;
  g.add(tape);
  return g;
}

function swingSet(m: MaterialsApi, x: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const frameMat = flat(m, 'buntRed');
  const legGeo = new THREE.CylinderGeometry(0.3, 0.3, 11, 8);
  for (const side of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(side * 6, 5.2, lean * 2.2);
      leg.rotation.x = lean * 0.4;
      leg.castShadow = true;
      g.add(leg);
    }
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 13, 8).rotateZ(Math.PI / 2), frameMat);
  bar.position.y = 10.2;
  bar.castShadow = true;
  g.add(bar);
  const ropeMat = flat(m, 'woodDark');
  for (const sx of [-2.4, 2.4]) {
    for (const rz of [-0.6, 0.6]) {
      const rope = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.6, 0.12), ropeMat);
      rope.position.set(sx + rz * 0.3, 6.9, 0);
      rope.rotation.z = rz * 0.06;
      g.add(rope);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.8), flat(m, 'hudYellow'));
    seat.position.set(sx, 3.6, 0);
    g.add(seat);
  }
  return g;
}

function hose(m: MaterialsApi, x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const mat = flat(m, 'buntRed');
  const coil = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 28).rotateX(Math.PI / 2), mat);
  coil.position.set(x, 0.16, z);
  g.add(coil);
  const run = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x - 2.4, 0.14, z + 0.8),
    new THREE.Vector3(x - 12, 0.14, z + 9),
    new THREE.Vector3(x - 19, 0.14, z + 22),
    new THREE.Vector3(x - 22, 0.14, z + 38),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(run, 24, 0.14, 6), mat));
  return g;
}

// ------------------------------------------------------------------ build ---

export function buildYard(m: MaterialsApi, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  group.name = 'field-yard';

  // Houses. Frame-left (+x): the blue two-story. Center-right: cream with a
  // mossy blue roof. Distant fillers peek between trees.
  group.add(
    house(m, { x: 118, z: 262, rotY: 0.12, w: 30, d: 24, wallH: 21, siding: 'houseBlue', roofC: 'roofSlate', windows: [3, 2], door: true, chimney: true }),
    house(m, { x: -46, z: 292, rotY: -0.08, w: 34, d: 26, wallH: 13, siding: 'houseCream', roofC: 'roofBlue', moss: true, windows: [4, 1], door: true, chimney: true }),
    house(m, { x: 55, z: 335, rotY: 0.2, w: 22, d: 18, wallH: 11, siding: 'houseTeal', roofC: 'roofRed', windows: [2, 1] }),
    house(m, { x: -158, z: 258, rotY: -0.25, w: 26, d: 22, wallH: 18, siding: 'houseRed', roofC: 'roofSlate', windows: [2, 2] }),
  );

  group.add(shed(m, -62, 218, -0.06));
  group.add(truck(m, -104, 224, 0.18));

  // Telephone poles + the sagging wires that cross the whole upper frame.
  const poleSpots: [number, number, number][] = [
    [176, 244, 40],
    [42, 302, 38],
    [-88, 216, 42],
    [-228, 268, 40],
  ];
  for (const [px, pz, ph] of poleSpots) group.add(pole(m, px, pz, ph));
  group.add(
    wires(m, [
      [290, 34, 300],
      [176, 37.5, 244],
      [42, 35.5, 302],
      [-88, 39.5, 216],
      [-228, 37.5, 268],
    ]),
  );
  // A second, higher run drifting off toward the distance.
  group.add(
    wires(m, [
      [42, 33, 302],
      [180, 30, 390],
      [320, 27, 470],
    ]),
  );

  group.add(badmintonNet(m, 56, 219, 0.25 + rng.range(-0.05, 0.05)));
  group.add(swingSet(m, 182, 252, 0.3));
  group.add(hose(m, -46, 57));

  return group;
}
