// OWNER: animation agent. The flying ball: one cartoon-big sphere driven by a
// closed-form arc (lerp + parabolic hump), never physics-stepped — position is
// a pure function of the clock, so capture stepping any dt lands the same
// pixels. Two flights per beat share this mesh: the pitch (hand → plate) is
// interrupted at the contact instant by a relaunch (plate → outfield), tagged
// so only the HIT flight reports a landing.

import * as THREE from 'three';
import { clamp01, lerp } from './rig';

export type FlightTag = 'pitch' | 'hit';

export class FlightBall {
  readonly mesh: THREE.Mesh;
  private active = false;
  private tag: FlightTag = 'pitch';
  private t0 = 0;
  private durMs = 1;
  private apexFt = 0;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

  constructor(mat: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), mat);
    this.mesh.name = 'flightBall';
    this.mesh.castShadow = true;
    this.mesh.visible = false;
  }

  launch(tMs: number, from: THREE.Vector3, to: THREE.Vector3, apexFt: number, durMs: number, tag: FlightTag): void {
    this.from.copy(from);
    this.to.copy(to);
    this.apexFt = apexFt;
    this.durMs = Math.max(1, durMs);
    this.t0 = tMs;
    this.tag = tag;
    this.active = true;
    this.mesh.visible = true;
    this.mesh.position.copy(from);
  }

  hide(): void {
    this.active = false;
    this.mesh.visible = false;
  }

  /** Returns the flight tag exactly once, on the tick the flight completes. */
  update(tMs: number): FlightTag | null {
    if (!this.active) return null;
    const u = (tMs - this.t0) / this.durMs;
    if (u >= 1) {
      this.mesh.position.copy(this.to);
      this.active = false;
      this.mesh.visible = false;
      return this.tag;
    }
    const c = clamp01(u);
    this.mesh.position.set(
      lerp(this.from.x, this.to.x, c),
      lerp(this.from.y, this.to.y, c) + this.apexFt * 4 * c * (1 - c),
      lerp(this.from.z, this.to.z, c),
    );
    // A little spin sells the flight even at distance.
    this.mesh.rotation.x = c * 22;
    return null;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  get inFlight(): boolean {
    return this.active;
  }
}
