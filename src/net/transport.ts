import type { HostCallbacks, LinkMode } from './host';
import type { RejectReason } from '../game/types';
import type { Signal } from './signal';
import type { RoomInfo } from './lobby';

/** Both transports feed the same authoritative game and binary protocol. */
export interface HostTransport {
  readonly cb: HostCallbacks;
  readonly signal?: Signal;
  start(): Promise<void>;
  close(): void;
  sendJson(cid: string, message: object): void;
  broadcastJson(message: object): void;
  broadcastFast(data: Uint8Array): void;
  linkOf(cid: string): LinkMode | undefined;
  drop(cid: string): void;
  kick(cid: string, reason: RejectReason): void;
  /** 局域网：房间玩法、人数、上锁交给本机服务，供其他应用搜索时显示 */
  announce?(info: RoomInfo): void;
}

export type HostTransportFactory = (room: string, callbacks: HostCallbacks) => HostTransport;
