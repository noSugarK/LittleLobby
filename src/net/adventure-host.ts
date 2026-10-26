import { AdventureGame, type AdventureInput, type AdventureView } from '../game/adventure';
import type { HostCallbacks } from './host';
import type { HostTransport, HostTransportFactory } from './transport';

const encoder = new TextEncoder();
export class AdventureHost {
  readonly game = new AdventureGame();
  readonly net: HostTransport | null;
  localId: number | undefined;
  localInput: AdventureInput = { axis: 0, jump: false };
  onView: (view: AdventureView) => void = () => {};
  onStatus: (ok: boolean) => void = () => {};
  private tokens = new Map<string, number>();
  private peers = new Map<string, number>();
  private seq = new Map<string, number>();
  private nextId = 1;
  private timer = 0;
  private closed = false;

  constructor(room: string, factory?: HostTransportFactory) {
    const cb: HostCallbacks = {
      onStatus: (ok) => this.onStatus(ok),
      onHello: (cid, hello) => {
        if (typeof hello.token !== 'string' || !hello.token || hello.token.length > 128) return 'full';
        let id = this.tokens.get(hello.token);
        if (id === undefined) {
          if (this.game.players.size >= 8) {
            const offline = [...this.game.players.values()].find((p) => !p.online);
            if (offline) {
              this.game.remove(offline.id);
              for (const [token, pid] of this.tokens) if (pid === offline.id) this.tokens.delete(token);
            }
          }
          id = this.nextId++;
          if (!this.game.add(id, typeof hello.name === 'string' ? hello.name.trim() || '小伙伴' : '小伙伴')) return 'full';
          this.tokens.set(hello.token, id);
        }
        for (const [old, pid] of this.peers) if (pid === id && old !== cid) this.net?.drop(old);
        this.peers.set(cid, id); this.seq.delete(cid); this.game.online(id, true);
        return null;
      },
      onPeer: (cid) => {
        const id = this.peers.get(cid)!;
        this.net?.sendJson(cid, { t: 'welcome', pid: id, game: 'adventure' });
        this.net?.sendJson(cid, this.game.view(id));
        this.publish();
      },
      onJson: (cid, m) => {
        if (!m || typeof m !== 'object') return;
        const id = this.peers.get(cid);
        if (id === undefined) return;
        if (m.t === 'ping') this.net?.sendJson(cid, { t: 'pong', ts: m.ts });
        if (m.t === 'adventure-skin') this.game.skin(id, m.skin);
        if (m.t !== 'adventure-input' || m.epoch !== this.game.epoch || ![-1, 0, 1].includes(m.axis) ||
            typeof m.jump !== 'boolean' || !Number.isSafeInteger(m.seq) || m.seq < 0 || m.seq <= (this.seq.get(cid) ?? -1)) return;
        this.seq.set(cid, m.seq); this.game.input(id, { axis: m.axis, jump: m.jump });
      },
      onBinary: () => {}, onLink: () => {},
      onLeave: (cid) => {
        const id = this.peers.get(cid);
        this.peers.delete(cid); this.seq.delete(cid);
        if (id !== undefined) this.game.online(id, false);
      },
    };
    this.net = factory?.(room, cb) ?? null;
    if (this.net?.signal) this.net.signal.onStatus = (ok) => this.onStatus(ok);
  }
  addLocal(name: string, skin = 0) {
    if (this.localId !== undefined) return;
    const id = this.nextId++;
    if (this.game.add(id, name, skin)) this.localId = id;
  }
  removeLocal() {
    if (this.game.phase !== 'lobby') return;
    if (this.localId !== undefined) this.game.remove(this.localId);
    this.localId = undefined; this.localInput = { axis: 0, jump: false }; this.publish();
  }
  advance() { this.localInput = { axis: 0, jump: false }; const result = this.game.start(); this.publish(); return result; }
  async start() {
    await this.net?.start();
    if (this.closed) { this.net?.close(); return; }
    this.onStatus(true);
    let last = performance.now(), accumulator = 0, frames = 0;
    this.timer = window.setInterval(() => {
      const now = performance.now(); accumulator += Math.min(100, now - last) / 1000; last = now;
      while (accumulator >= 1 / 60) {
        if (this.localId !== undefined) this.game.input(this.localId, this.localInput);
        this.game.step(1 / 60, document.visibilityState !== 'hidden'); accumulator -= 1 / 60;
        if (++frames % 3 === 0) this.publish();
      }
    }, 8);
    this.publish();
  }
  publish() {
    if (this.closed) return;
    this.onView(this.game.view(this.localId));
    if (this.peers.size) this.net?.broadcastFast(encoder.encode(JSON.stringify(this.game.view())));
  }
  close() { this.closed = true; clearInterval(this.timer); this.net?.close(); }
}
