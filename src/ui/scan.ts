// 扫码加入：摄像头 + jsQR（按需加载，iOS Safari 没有 BarcodeDetector，统一用 jsQR）
import { t } from '../i18n';
import { icon } from './site';
import { isPin, normalizeCode } from './util';

/** 只接受本游戏的加入链接或纯房间码，返回要跳转的 hash；其它内容一律不跟随 */
export function joinHashFromQr(text: string): string | null {
  const m = text.match(/#\/join\/([A-Za-z0-9]{4,8})(?:\?([^#\s]*))?/);
  if (m) {
    const pin = new URLSearchParams(m[2] ?? '').get('pin');
    return `#/join/${normalizeCode(m[1])}${isPin(pin) ? `?pin=${pin}` : ''}`;
  }
  const code = text.trim();
  return /^[A-Za-z0-9]{5}$/.test(code) ? `#/join/${normalizeCode(code)}` : null;
}

export async function openScanner(root: HTMLElement): Promise<void> {
  const el = document.createElement('div');
  el.className = 'scan-overlay';
  el.innerHTML = `
    <video playsinline muted></video>
    <div class="scan-frame"></div>
    <p class="scan-msg">${t('scan.loading')}</p>
    <button class="icon-btn scan-close" aria-label="${t('scan.close')}">${icon.x}</button>`;
  root.appendChild(el);
  const video = el.querySelector('video')!;
  const msg = el.querySelector<HTMLElement>('.scan-msg')!;
  let stream: MediaStream | null = null;
  let raf = 0;
  const close = () => {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((tr) => tr.stop());
    el.remove();
  };
  el.querySelector<HTMLElement>('.scan-close')!.onclick = close;

  if (!navigator.mediaDevices?.getUserMedia) {
    msg.textContent = t('scan.unsupported');
    return;
  }
  try {
    const [s, { default: jsQR }] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
      import('jsqr'),
    ]);
    stream = s;
    if (!el.isConnected) return close(); // 加载期间已关闭
    video.srcObject = s;
    await video.play();
    msg.textContent = t('scan.hint');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let lastBad = '';
    const tick = () => {
      if (video.videoWidth) {
        // 缩到最长边 640 再识别，手机上足够快
        const k = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * k);
        canvas.height = Math.round(video.videoHeight * k);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          const hash = joinHashFromQr(code.data);
          if (hash) {
            close();
            location.hash = hash;
            return;
          }
          if (code.data !== lastBad) {
            lastBad = code.data;
            msg.textContent = t('scan.notOurs');
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    const name = (e as Error)?.name;
    msg.textContent = t(name === 'NotAllowedError' || name === 'SecurityError' ? 'scan.denied' : 'scan.unsupported');
  }
}
