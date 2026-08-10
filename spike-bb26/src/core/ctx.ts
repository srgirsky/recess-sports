// The context bus: the ONLY way subsystems reach each other. A subsystem
// registers its public API under its own name and looks other subsystems up at
// runtime — never via cross-directory imports. FROZEN after scaffold: subsystem
// agents do not edit core/.

export type Handler = (payload?: unknown) => void;

export class Ctx {
  private services = new Map<string, unknown>();
  private handlers = new Map<string, Set<Handler>>();

  set(id: string, api: unknown): void {
    if (this.services.has(id)) throw new Error(`ctx: '${id}' already registered`);
    this.services.set(id, api);
  }

  get<T>(id: string): T {
    const s = this.services.get(id);
    if (s === undefined) throw new Error(`ctx: no service '${id}' — check init order in main.ts`);
    return s as T;
  }

  has(id: string): boolean {
    return this.services.has(id);
  }

  on(event: string, fn: Handler): void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
  }

  emit(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((fn) => fn(payload));
  }
}
