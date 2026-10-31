import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.ts')) return next(url, context);
    return { format: 'module', shortCircuit: true, source: ts.transpile(readFileSync(new URL(url), 'utf8'), {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    }) };
  },
});

const { ClientNet } = await import('../src/net/client.ts');
const { HostNet } = await import('../src/net/host.ts');
const { LanClient } = await import('../src/net/lan-client.ts');
const { lanJoinHash, lanSocketUrl } = await import('../src/net/lan-session.ts');
const info = { token: 'player', name: 'P', team: 'auto' };

test('冒险中继短按和松开使用可靠消息，直连继续使用有序控制通道', () => {
  const client = new ClientNet('ABCDE', info), sent = [];
  client.signal = { pub: (...args) => sent.push(args), close() {} };
  const press = { t: 'adventure-input', epoch: 1, seq: 1, axis: 0, jump: true, act: false };
  const release = { ...press, seq: 2, jump: false };
  try {
    client.state = 'relay'; client.relay = true;
    client.sendJson(press, 1); client.sendJson(release, 1);
    assert.deepEqual(sent.map(([, message, retain, qos]) => [message, retain, qos]), [[press, false, 1], [release, false, 1]]);
    client.ctl = { readyState: 'open', send: (data) => sent.push(JSON.parse(data)) };
    client.fast = { readyState: 'open' };
    client.sendJson(press, 1); client.sendJson(release, 1);
    assert.deepEqual(sent.slice(2), [press, release]);
  } finally { client.close(); }
});

test('局域网大厅即使没有游戏快照也持续发送心跳', async () => {
  const original = { window: globalThis.window, WebSocket: globalThis.WebSocket, performance: globalThis.performance };
  let timer, ws, now = 0;
  const sent = [];
  globalThis.performance = { now: () => now };
  globalThis.window = { setTimeout: (callback) => { timer = callback; return 0; } };
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor() { ws = this; }
    send(raw) { sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; this.onclose?.(); }
  };
  const client = new LanClient('ABCDE', info, 'http://192.168.1.2:12345');
  try {
    await client.start(); ws.onopen();
    ws.onmessage({ data: JSON.stringify({ t: 'welcome', game: 'party', pid: 1 }) });
    for (let i = 0; i < 20; i++) {
      now += 2000; timer();
      assert.deepEqual(sent.at(-1), { t: 'ping', ts: now }, 'RTT 用客户端单调时钟计算');
      ws.onmessage({ data: JSON.stringify({ t: 'pong' }) });
      assert.equal(client.linked, true);
    }
    now += 7000; timer(); assert.equal(client.state, 'lost', '真正失联仍会触发重连');
  } finally { client.close(); Object.assign(globalThis, original); }
});

test('应用局域网大厅传递远端主机地址，重连仍使用同一主机', async () => {
  const original = { window: globalThis.window, location: globalThis.location, WebSocket: globalThis.WebSocket };
  const urls = [];
  globalThis.window = { setTimeout: () => 0 };
  globalThis.location = { origin: 'http://tauri.localhost' };
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor(url) { urls.push(url); }
    send() {}
    close() { this.onclose?.(); }
  };
  const client = new LanClient('ABCDE', info, 'http://192.168.1.2:12345');
  try {
    const hash = lanJoinHash({ room: 'ABCDE', baseUrl: 'http://192.168.1.2:12345/' }, '1234');
    const query = new URLSearchParams(hash.split('?')[1]);
    assert.equal(query.get('server'), 'http://192.168.1.2:12345');
    assert.equal(query.get('pin'), '1234');
    await client.start();
    client.state = 'lost';
    assert.equal(client.retryDirect(), true);
    assert.deepEqual(urls, Array(2).fill('ws://192.168.1.2:12345/ws?room=ABCDE'));
    assert.equal(lanSocketUrl('ABCDE'), 'ws://tauri.localhost/ws?room=ABCDE');
    for (const baseUrl of ['javascript:alert(1)', 'https://example.com:1234', 'http://user:pass@192.168.1.2:1234']) {
      assert.throws(() => lanJoinHash({ room: 'ABCDE', baseUrl }));
    }
    assert.throws(() => lanJoinHash({ room: '../bad', baseUrl: 'http://192.168.1.2:1234' }));
  } finally {
    client.close();
    Object.assign(globalThis, original);
  }
});

test('关闭中的在线连接不能在信令连接完成后重新订阅或启动定时器', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = { setInterval: () => assert.fail('关闭后不能启动定时器'), addEventListener: () => {} };
  try {
    for (const net of [new ClientNet('ABCDE', info), new HostNet('ABCDE', {})]) {
      let connected;
      let closes = 0;
      net.signal = {
        connect: () => new Promise((resolve) => { connected = resolve; }),
        pub() {}, close() { closes++; },
        onMessage: () => assert.fail('关闭后不能注册消息处理'),
      };
      const starting = net.start();
      net.close();
      connected();
      await starting;
      assert.equal(closes, 2, '迟到的连接也会关闭');
    }
  } finally { globalThis.window = originalWindow; }
});

test('在线拒绝是终止状态，停止收发和重连，避免踢出后仍收到旧比赛快照', async () => {
  const client = new ClientNet('ABCDE', info);
  let closes = 0;
  let publishes = 0;
  let reason;
  client.signal = { pub: () => publishes++, close: () => closes++ };
  client.state = 'relay';
  client.relay = true;
  client.onReject = (value) => { reason = value; };
  client.onBinary = () => assert.fail('拒绝后不能收到快照');
  await client.onSignal(`c/${client.cid}`, new TextEncoder().encode(JSON.stringify({ t: 'reject', reason: 'kicked' })));
  assert.equal(reason, 'kicked');
  assert.equal(client.state, 'rejected');
  assert.equal(client.linked, false);
  assert.equal(closes, 1);
  const sent = publishes;
  client.restart();
  client.sendInput(new Uint8Array(8));
  client.sendJson({ t: 'start' });
  client.state = 'relay';
  assert.equal(client.retryDirect(), false, '关闭后不能重试直连');
  await client.onSignal('bc', new Uint8Array([2]));
  assert.equal(publishes, sent);
});

test('替换 WebRTC 后旧协商和旧通道不能发 answer、改连接状态或投递消息', async () => {
  const originalRtc = globalThis.RTCPeerConnection;
  let finishOld;
  const peers = [];
  globalThis.RTCPeerConnection = class {
    answers = 0;
    constructor() { peers.push(this); }
    setRemoteDescription() { return peers.length === 1 ? new Promise((resolve) => { finishOld = resolve; }) : Promise.resolve(); }
    async createAnswer() { this.answers++; return { sdp: 'answer' }; }
    async setLocalDescription() {}
    close() {}
  };
  const client = new ClientNet('ABCDE', info);
  const sent = [];
  client.signal = { pub: (...args) => sent.push(args), close() {} };
  try {
    const oldOffer = client.onOffer('old');
    const old = peers[0];
    const channel = { label: 'ctl', readyState: 'open' };
    old.ondatachannel({ channel });
    await client.onOffer('new');
    finishOld();
    await oldOffer;
    assert.equal(old.answers, 0);
    assert.equal(sent.filter(([, message]) => message.t === 'answer').length, 1);
    client.state = 'p2p';
    client.onJson = () => assert.fail('旧通道不能投递消息');
    channel.onmessage({ data: '{"t":"welcome","pid":99}' });
    channel.onclose();
    old.onicecandidate({ candidate: null });
    assert.equal(client.state, 'p2p');
    assert.equal(sent.length, 1);
  } finally {
    client.close();
    globalThis.RTCPeerConnection = originalRtc;
  }
});

test('主机替换或移除连接后，旧通道与迟到的 offer 不会继续收发', async () => {
  const original = { window: globalThis.window, RTCPeerConnection: globalThis.RTCPeerConnection };
  let finishOffer;
  globalThis.window = { setTimeout: () => 0 };
  globalThis.RTCPeerConnection = class {
    createDataChannel() { return {}; }
    createOffer() { return new Promise((resolve) => { finishOffer = resolve; }); }
    setLocalDescription() { assert.fail('移除后不能继续协商'); }
    close() {}
  };
  const host = new HostNet('ABCDE', {
    onHello: () => null, onPeer() {}, onLeave() {},
    onJson: () => assert.fail('旧通道不能投递消息'),
    onLink: () => assert.fail('移除后不能通知链路切换'),
  });
  host.signal = { pub: () => assert.fail('移除后不能发送 offer'), close() {} };
  try {
    await host.onSignalJson('client', { t: 'hello', ...info });
    const peer = host.peers.get('client');
    const previous = peer.pc;
    const oldChannel = peer.ctl;
    peer.setupPc();
    oldChannel.onmessage({ data: '{}' });
    previous.onicecandidate({ candidate: null });
    host.drop('client');
    peer.ctl.onmessage({ data: '{}' });
    peer.pc.onicecandidate({ candidate: null });
    finishOffer({ sdp: 'late' });
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    host.close();
    Object.assign(globalThis, original);
  }
});

test('局域网重连后旧 socket 的 welcome、reject 和快照不影响新连接', async () => {
  const original = { window: globalThis.window, location: globalThis.location, WebSocket: globalThis.WebSocket };
  const sockets = [];
  globalThis.window = { setTimeout: () => 0 };
  globalThis.location = { origin: 'http://192.168.1.2:9000' };
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor() { sockets.push(this); }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; this.onclose?.(); }
  };
  const client = new LanClient('ABCDE', info);
  try {
    await client.start();
    const old = sockets[0];
    old.close();
    assert.equal(client.retryDirect(), true);
    const current = sockets[1];
    client.onJson = () => assert.fail('旧 socket 不能投递 JSON');
    client.onBinary = () => assert.fail('旧 socket 不能投递快照');
    client.onReject = () => assert.fail('旧 socket 不能拒绝新连接');
    old.onopen();
    old.onmessage({ data: '{"t":"welcome","pid":99}' });
    old.onmessage({ data: '{"t":"reject","reason":"kicked"}' });
    old.onmessage({ data: new ArrayBuffer(4) });
    assert.equal(client.state, 'connecting');
    assert.equal(current.sent.length, 0, '旧 onopen 不能向新 socket 发送 hello');
    client.onJson = () => {};
    current.onmessage({ data: '{"t":"welcome","pid":1}' });
    assert.equal(client.linked, true);
    client.close();
    assert.equal(client.linked, false);
    client.state = 'lost';
    assert.equal(client.retryDirect(), false, '关闭后不能重新创建 socket');
  } finally {
    client.close();
    Object.assign(globalThis, original);
  }
});

test('公开大厅连不上时退避重试，刷新清空并重新订阅，离开首页后断开且迟到的连接也关掉', async () => {
  const { Signal } = await import('../src/net/signal.ts');
  const { watchLobby } = await import('../src/net/lobby.ts');
  const proto = { connect: Signal.prototype.connect, sub: Signal.prototype.sub, close: Signal.prototype.close };
  const originalWindow = globalThis.window, timers = [], signals = [];
  let connect = async () => { throw new Error('offline'); };
  globalThis.window = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } };
  Signal.prototype.connect = function () { signals.push(this); return connect(); };
  Signal.prototype.sub = function (topic) { this.subbed = topic; };
  Signal.prototype.close = function () { this.closed = true; };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    const states = [], lists = [];
    const watch = watchLobby((rooms) => lists.push([...rooms.keys()]), (state) => states.push(state));
    await flush();
    assert.deepEqual(states, ['loading', 'failed']);
    assert.deepEqual(timers.map((timer) => timer.ms), [5000]);
    timers.shift().fn(); await flush();
    assert.deepEqual(timers.map((timer) => timer.ms), [10000], '连续失败间隔加倍');

    connect = async () => {};
    timers.shift().fn(); await flush();
    const live = signals.at(-1);
    assert.equal(live.subbed, 'info');
    timers.shift().fn(); assert.equal(states.at(-1), 'ready');
    const info = { host: 'A', n: 1, max: 8, playing: false, lock: false, ts: Date.now() };
    live.handler('scanfb/v4/ABCDE/info', new TextEncoder().encode(JSON.stringify(info)));
    assert.deepEqual(lists.at(-1), ['ABCDE']);

    watch.refresh(); await flush();
    assert.ok(live.closed, '刷新断开旧连接');
    assert.deepEqual(lists.at(-1), [], '刷新先清空列表');
    assert.equal(states.at(-1), 'loading');
    live.handler('scanfb/v4/OLDXX/info', new TextEncoder().encode(JSON.stringify(info)));
    assert.deepEqual(lists.at(-1), [], '旧连接的消息被忽略');

    let finish; connect = () => new Promise((resolve) => { finish = resolve; });
    watch.refresh(); const late = signals.at(-1);
    watch.close(); finish(); await flush();
    assert.ok(late.closed, '关闭后才连上的连接也被关掉');
    assert.equal(late.subbed, undefined);
  } finally {
    Object.assign(Signal.prototype, proto);
    globalThis.window = originalWindow;
  }
});

test('answer 等 ICE 收集完再发，SDP 自带候选，补发时也不会丢候选', async () => {
  const originalRtc = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = class {
    iceGatheringState = 'gathering';
    async setRemoteDescription() {}
    async createAnswer() { return { sdp: 'answer' }; }
    async setLocalDescription() {
      this.localDescription = { sdp: 'answer' };
      setTimeout(() => {
        this.localDescription = { sdp: 'answer\na=candidate:srflx' };
        this.iceGatheringState = 'complete';
        this.onicegatheringstatechange();
      }, 10);
    }
    close() {}
  };
  const client = new ClientNet('ABCDE', info);
  const sent = [];
  client.signal = { pub: (...args) => sent.push(args), close() {} };
  try {
    await client.onOffer('offer');
    await client.onOffer('offer'); // 主机重发同一 offer：补发 answer
    const answers = sent.filter(([, m]) => m.t === 'answer').map(([, m]) => m.sdp);
    assert.deepEqual(answers, ['answer\na=candidate:srflx', 'answer\na=candidate:srflx']);
  } finally {
    client.close();
    globalThis.RTCPeerConnection = originalRtc;
  }
});
