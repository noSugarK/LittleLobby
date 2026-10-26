import { HostGame } from '../game/host-game';
import { AdventureHost } from '../net/adventure-host';
import { LEVELS, validSkin } from '../game/adventure';
import { Phase, type Input, type Settings, type RejectReason } from '../game/types';
import { HostNet, type Hello, type HostCallbacks } from '../net/host';
import type { HostTransport, HostTransportFactory } from '../net/transport';
import { LobbyPublisher, LOBBY_HEARTBEAT_MS } from '../net/lobby';
import { encodeInput } from '../net/protocol';
import { type RoomOpts } from '../ui/util';
import { validGame, type GameId } from './catalog';

export interface RoomMember {
  id: number; name: string; skin: number; team: 0 | 1; watch: boolean;
  ready: boolean; online: boolean; gamePid: number;
}
interface Seat { member: RoomMember; token: string; cid: string; }
export interface RoomState {
  t: 'room-state'; room: string; game: GameId; map: number; revision: number;
  phase: 'lobby' | 'playing'; members: RoomMember[]; settings: Settings;
}
export interface GamePacket { t: 'room-game'; revision: number; json?: any; bytes?: number[]; }
const encoder = new TextEncoder();

/** Room owns the real transport. A game's disposable transport cannot close it. */
export class PartyRoomHost {
  readonly net: HostTransport;
  game: GameId;
  map = 0;
  revision = 0;
  phase: RoomState['phase'] = 'lobby';
  football: HostGame | undefined;
  adventure: AdventureHost | undefined;
  onState: (state: RoomState) => void = () => {};
  onPacket: (packet: GamePacket) => void = () => {};
  onStatus: (ok: boolean) => void = () => {};
  private seats = new Map<string, Seat>();
  private engine!: HostCallbacks;
  private nextId = 1;
  private sequence = new Map<string, number>();
  private lobby: LobbyPublisher | undefined;
  private heartbeat = 0;
  private closed = false;
  private pinFails: number[] = [];

  constructor(readonly room: string, readonly opts: RoomOpts, game: GameId = 'football',
    factory: HostTransportFactory = (code, cb) => new HostNet(code, cb)) {
    this.game = game;
    this.net = factory(room, {
      onStatus: (ok) => this.onStatus(ok),
      onHello: (cid, hello) => this.hello(cid, hello),
      onPeer: (cid) => {
        const seat = this.byCid(cid);
        if (!seat) return;
        this.sequence.delete(cid);
        this.net.sendJson(cid, { t: 'welcome', game: 'party', pid: seat.member.id });
        this.publish();
        this.joinEngine(seat);
        this.publish();
      },
      onJson: (cid, message) => this.receive(cid, message),
      onBinary: () => {}, // Inputs are revision-tagged room messages.
      onLink: (cid, mode) => this.engine.onLink(cid, mode),
      onLeave: (cid) => {
        this.sequence.delete(cid);
        const seat = this.byCid(cid);
        if (!seat) return;
        seat.member.online = seat.member.ready = false;
        this.engine.onLeave(cid);
        this.publish();
      },
    });
    if (this.net.signal) this.lobby = new LobbyPublisher(this.net.signal, opts.listed);
    this.createEngine();
  }

  private byCid(cid: string) { return [...this.seats.values()].find((seat) => seat.cid === cid); }
  private hello(cid: string, hello: Hello): RejectReason | null {
    if (typeof hello.token !== 'string' || !hello.token || hello.token.length > 128) return 'full';
    if (this.opts.pin && this.opts.pin !== hello.pin) {
      const now = Date.now();
      this.pinFails = this.pinFails.filter((time) => now - time < 10000);
      if (this.pinFails.length >= 5) return 'pinThrottle';
      this.pinFails.push(now);
      return hello.pin ? 'pinWrong' : 'pinNeed';
    }
    let seat = this.seats.get(hello.token);
    if (seat) {
      if (seat.cid !== cid) {
        this.net.drop(seat.cid);
        this.engine.onLeave(seat.cid);
      }
      seat.cid = cid;
      seat.member.online = true;
      seat.member.name = String(hello.name || seat.member.name).trim().slice(0, 12);
      return null;
    }
    const playing = [...this.seats.values()].filter((s) => s.member.online && !s.member.watch);
    if (!hello.watch && playing.length >= 8) return 'full';
    if (this.seats.size >= 32) {
      const offline = [...this.seats.entries()].find(([, s]) => !s.member.online);
      if (!offline) return 'watchFull';
      this.seats.delete(offline[0]);
    }
    const reds = playing.filter((s) => s.member.team === 0).length;
    const team = hello.team === 0 || hello.team === 1 ? hello.team : reds <= playing.length - reds ? 0 : 1;
    if (!hello.watch && playing.filter((s) => s.member.team === team).length >= 4) return 'full';
    seat = { cid, token: hello.token, member: { id: this.nextId++, name: String(hello.name || '小伙伴').trim().slice(0, 12),
      skin: 0, team, watch: !!hello.watch, ready: false, online: true, gamePid: -1 } };
    this.seats.set(hello.token, seat);
    return null;
  }

  addLocal(name: string, watch = false, skin = 0) {
    const reason = this.hello('local', { t: 'hello', cid: 'local', token: 'local', name, team: 'auto', watch, pin: this.opts.pin });
    if (reason) return -1;
    const seat = this.seats.get('local')!;
    seat.member.skin = validSkin(skin) ? skin : 0;
    seat.member.ready = true;
    this.joinEngine(seat);
    this.publish();
    return seat.member.id;
  }

  private joinEngine(seat: Seat) {
    seat.member.gamePid = -1;
    if (this.game === 'adventure' && seat.member.watch) return;
    const reason = this.engine.onHello(seat.cid, { t: 'hello', cid: seat.cid, token: seat.token,
      name: seat.member.name, team: seat.member.team, watch: seat.member.watch });
    if (reason) return;
    this.engine.onPeer(seat.cid);
    if (this.game === 'adventure') this.engine.onJson(seat.cid, { t: 'adventure-skin', skin: seat.member.skin });
  }

  private createEngine() {
    const revision = ++this.revision;
    this.sequence.clear();
    const packet = (body: Omit<GamePacket, 't' | 'revision'>, cid?: string, fast = false) => {
      if (this.closed || revision !== this.revision) return;
      if (body.json?.t === 'welcome' && cid) {
        const seat = this.byCid(cid);
        if (seat) seat.member.gamePid = body.json.pid;
      }
      const message: GamePacket = { t: 'room-game', revision, ...body };
      if (cid === 'local' || !cid) this.onPacket(message);
      if (cid && cid !== 'local') this.net.sendJson(cid, message);
      else if (!cid && fast) this.net.broadcastFast(encoder.encode(JSON.stringify(message)));
      else if (!cid) this.net.broadcastJson(message);
    };
    const factory: HostTransportFactory = (_room, cb) => {
      this.engine = cb;
      return {
        cb, start: async () => {}, close: () => {},
        sendJson: (cid, json) => packet({ json }, cid),
        broadcastJson: (json) => packet({ json }),
        broadcastFast: (bytes) => packet({ bytes: Array.from(bytes) }, undefined, true),
        linkOf: (cid) => this.net.linkOf(cid),
        drop: (cid) => { if (cid !== 'local') this.net.drop(cid); },
        kick: (cid, reason) => { if (cid !== 'local') this.net.kick(cid, reason); },
      };
    };
    this.football = undefined; this.adventure = undefined;
    if (this.game === 'football') {
      this.football = new HostGame(this.room, { listed: false }, factory);
      this.football.onPhase = (phase) => {
        if (revision !== this.revision) return;
        if (phase === Phase.Lobby) this.phase = 'lobby';
        this.publish();
      };
      void this.football.start();
    } else {
      this.adventure = new AdventureHost(this.room, factory);
      this.adventure.game.level = this.map;
      void this.adventure.start();
    }
    // Establish the revision before the new engine sends rosters and welcomes.
    this.publish();
    for (const seat of this.seats.values()) if (seat.member.online) this.joinEngine(seat);
  }

  private rebuild() {
    // Invalidate callbacks before disposing the old game, including late ticks.
    this.revision++;
    this.football?.close(); this.adventure?.close();
    this.phase = 'lobby';
    for (const seat of this.seats.values()) seat.member.ready = seat.cid === 'local';
    this.createEngine();
    this.publish();
  }
  switchGame(game: unknown) {
    if (!validGame(game) || game === this.game) return;
    this.game = game; this.map = 0; this.rebuild();
  }
  selectMap(map: unknown) {
    if (this.game !== 'adventure' || !Number.isInteger(map) || Number(map) < 0 || Number(map) >= LEVELS.length || Number(map) === this.map) return;
    this.map = Number(map); this.rebuild();
  }
  setSettings(patch: Partial<Settings>) { if (this.phase === 'lobby') this.football?.setSettings(patch); this.publish(); }
  startGame() {
    const players = [...this.seats.values()].filter((seat) => seat.member.online && !seat.member.watch);
    if (!players.length || players.some((seat) => !seat.member.ready)) return false;
    if (this.adventure) {
      if (!this.adventure.game.start(this.map)) return false;
      this.adventure.publish();
    } else this.football?.startMatch();
    this.phase = 'playing'; this.publish(); return true;
  }
  nextLevel() {
    if (!this.adventure || this.adventure.game.phase !== 'clear') return;
    this.adventure.advance(); this.map = this.adventure.game.level; this.publish();
  }
  toLobby() { this.rebuild(); }
  local(message: any) { this.receive('local', message); }
  private receive(cid: string, message: any) {
    const seat = this.byCid(cid);
    if (!seat?.member.online || !message || typeof message !== 'object') return;
    if (message.t === 'ping') { if (cid !== 'local') this.net.sendJson(cid, { t: 'pong', ts: message.ts }); return; }
    if (message.t === 'room-member') {
      if (validSkin(message.skin)) {
        seat.member.skin = message.skin;
        this.engine.onJson(cid, { t: 'adventure-skin', skin: message.skin });
      }
      if (typeof message.name === 'string' && message.name.trim()) {
        seat.member.name = message.name.trim().slice(0, 12);
        if (this.game === 'football') this.engine.onJson(cid, { t: 'name', name: seat.member.name });
        else if (this.adventure?.game.players.has(seat.member.gamePid)) this.adventure.game.players.get(seat.member.gamePid)!.name = seat.member.name;
      }
      if (this.phase === 'lobby') {
        if (typeof message.ready === 'boolean') seat.member.ready = message.ready;
        if ((message.team === 0 || message.team === 1) && message.team !== seat.member.team) {
          const n = [...this.seats.values()].filter((s) => s.member.online && !s.member.watch && s.member.team === message.team).length;
          if (n < 4) { seat.member.team = message.team; this.engine.onJson(cid, { t: 'team', team: message.team }); }
        }
        if (typeof message.watch === 'boolean' && message.watch !== seat.member.watch) {
          if (!message.watch && [...this.seats.values()].filter((s) => s.member.online && !s.member.watch).length >= 8) return;
          seat.member.watch = message.watch; this.rebuild(); return;
        }
      }
      this.publish(); return;
    }
    if (message.t !== 'room-input' || this.phase !== 'playing' || seat.member.watch || message.revision !== this.revision ||
        !Number.isSafeInteger(message.seq) || message.seq < 0 || message.seq <= (this.sequence.get(cid) ?? -1)) return;
    const input = message.input;
    if (!input || !Number.isFinite(input.jx) || !Number.isFinite(input.jy) || Math.abs(input.jx) > 1 || Math.abs(input.jy) > 1 || !Number.isInteger(input.btn) || input.btn < 0 || input.btn > 15) return;
    this.sequence.set(cid, message.seq);
    if (this.game === 'football') this.engine.onBinary(cid, encodeInput(message.seq, input as Input));
    else this.engine.onJson(cid, { t: 'adventure-input', epoch: this.adventure!.game.epoch, seq: message.seq,
      axis: input.jx > .2 ? 1 : input.jx < -.2 ? -1 : 0, jump: !!(input.btn & 2) });
  }

  view(): RoomState { return { t: 'room-state', room: this.room, game: this.game, map: this.map, revision: this.revision, phase: this.phase,
    members: [...this.seats.values()].map((seat) => ({ ...seat.member })), settings: this.football ? { ...this.football.settings, bots: [...this.football.settings.bots] } : { mode: 0, party: 0, duration: 180, autoFill: true, bots: [0, 0], level: 1 } }; }
  publish(force = false) {
    if (this.closed) return;
    const state = this.view(); this.onState(state); this.net.broadcastJson(state);
    this.lobby?.publish({ host: this.seats.get('local')?.member.name ?? '', n: state.members.filter((m) => m.online && !m.watch).length,
      max: 8, playing: this.phase === 'playing', lock: !!this.opts.pin, game: this.game, map: this.map }, force);
  }
  async start() {
    await this.net.start(); if (this.closed) return;
    if (this.net.signal) this.net.signal.onStatus = (ok) => { this.onStatus(ok); if (ok) this.publish(true); };
    this.heartbeat = window.setInterval(() => this.publish(true), LOBBY_HEARTBEAT_MS);
    this.onStatus(true); this.publish(true);
  }
  close() {
    if (this.closed) return;
    this.closed = true; clearInterval(this.heartbeat); this.revision++;
    this.football?.close(); this.adventure?.close(); this.lobby?.clear(); this.net.close();
  }
}
