// 公开大厅：主机把房间信息作为 MQTT 保留消息发布到 `<topicPrefix>/<房间码>/info`，
// 首页订阅 `<topicPrefix>/+/info` 列出所有公开房间。发布与读取的格式都在这里。
import { normalizeCode } from '../ui/util';
import { Signal, parseJson } from './signal';

export interface LobbyInfo {
  host: string; // 无大屏模式下为房主昵称，大屏模式为空
  n: number; // 在线真人
  max: number;
  playing: boolean;
  lock: boolean;
  ts: number; // 发布时间，用来过滤失效房间
  game?: 'football' | 'adventure';
  map?: number;
}

const TOPIC = 'info';
/** 主机每 30 秒刷新一次；超过该时长没刷新的视为已失效 */
export const LOBBY_HEARTBEAT_MS = 30_000;
export const LOBBY_STALE_MS = 90_000;

/** 主机端：内容变化或心跳时发布，关闭/掉线时清除 */
export class LobbyPublisher {
  private last = '';

  constructor(
    private readonly signal: Signal,
    private readonly listed: boolean,
  ) {
    // 遗嘱必须在连接前设置：异常掉线时由 broker 清掉保留消息
    if (listed) signal.willClearTopic = TOPIC;
  }

  publish(info: Omit<LobbyInfo, 'ts'>, force = false) {
    if (!this.listed) return;
    const key = JSON.stringify(info);
    if (!force && key === this.last) return;
    this.last = key;
    this.signal.pub(TOPIC, { ...info, ts: Date.now() }, true);
  }

  /** 空的保留消息 = 房间关闭；不公开的房间也清一次，同一房间码之前可能公开过 */
  clear() {
    this.signal.pub(TOPIC, new Uint8Array(0), true);
  }
}

/** 公共 broker 上谁都能发，字段逐个校验；不合法或空消息返回 null */
function parseLobbyInfo(payload: Uint8Array): LobbyInfo | null {
  const r = parseJson<LobbyInfo>(payload);
  if (!r || typeof r.ts !== 'number' || typeof r.n !== 'number' || typeof r.max !== 'number') return null;
  return {
    host: String(r.host ?? '').slice(0, 12),
    n: Math.max(0, Math.min(99, r.n | 0)),
    max: Math.max(1, Math.min(99, r.max | 0)),
    playing: !!r.playing,
    lock: !!r.lock,
    ts: r.ts,
    game: r.game === 'adventure' ? 'adventure' : 'football',
    map: Number.isInteger(r.map) && Number(r.map) >= 0 && Number(r.map) < 3 ? r.map : 0,
  };
}

export type LobbyState = 'loading' | 'ready' | 'failed';
export interface LobbyWatch {
  /** 断开重连：清空列表，重新订阅，保留消息会马上重新推过来 */
  refresh(): void;
  close(): void;
}

/** 首页：订阅所有公开房间，每次变化回调完整列表（含已失效的，由调用方按 ts 过滤）。
 *  连不上时自动退避重试，离开首页要 close()。 */
export function watchLobby(onChange: (rooms: Map<string, LobbyInfo>) => void, onState: (state: LobbyState) => void = () => {}): LobbyWatch {
  const rooms = new Map<string, LobbyInfo>();
  let sig: Signal | null = null, timer = 0, failures = 0, closed = false;
  const connect = async () => {
    clearTimeout(timer);
    sig?.close();
    rooms.clear(); onChange(rooms); onState('loading');
    const current = sig = new Signal('+'); // 房间名用 '+' 通配
    current.onMessage((topic, payload) => {
      if (current !== sig) return;
      const code = normalizeCode(topic.split('/').at(-2) ?? '');
      if (!code) return;
      const info = parseLobbyInfo(payload);
      if (info) rooms.set(code, info);
      else rooms.delete(code);
      onChange(rooms);
    });
    try {
      await current.connect();
    } catch {
      if (current !== sig) return;
      sig = null;
      onState('failed');
      // 5、10、20…最长 60 秒后再试
      if (!closed) timer = window.setTimeout(connect, Math.min(60_000, 5000 * 2 ** failures++));
      return;
    }
    if (current !== sig) { current.close(); return; }
    failures = 0;
    current.sub(TOPIC);
    // 保留消息在订阅后立即到达，稍等一下再显示「暂无」
    timer = window.setTimeout(() => onState('ready'), 1500);
  };
  void connect();
  return {
    refresh() { if (!closed) { failures = 0; void connect(); } },
    close() { closed = true; clearTimeout(timer); sig?.close(); sig = null; },
  };
}
