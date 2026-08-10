// OWNER: audio agent. Stub — replaced by the audio pass. Contract: register your
// public API as ctx.set('audio', ...), reach other subsystems only via ctx.get()
// and the event vocabulary in ARCHITECTURE.md. Never import across subsystem
// directories; edit only this directory.

import type { Ctx } from '../core/ctx';

export function init(ctx: Ctx): void {
  ctx.set('audio', {});
}
