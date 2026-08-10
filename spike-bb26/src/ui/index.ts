// OWNER: ui agent. Stub — replaced by the ui pass. Contract: register your
// public API as ctx.set('ui', ...), reach other subsystems only via ctx.get()
// and the event vocabulary in ARCHITECTURE.md. Never import across subsystem
// directories; edit only this directory.

import type { Ctx } from '../core/ctx';

export function init(ctx: Ctx): void {
  ctx.set('ui', {});
}
