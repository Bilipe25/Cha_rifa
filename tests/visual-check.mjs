import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function freePort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

export async function runVisualCheck(base, slug, cookie, outputPrefix) {
  const profile = await mkdtemp(join(tmpdir(), 'charifa-visual-'));
  const port = await freePort();
  const browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `${base}/${slug}/numeros`,
  ], { stdio: 'ignore' });
  let ws;
  try {
    let page;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        page = tabs.find(tab => tab.type === 'page');
        if (page) break;
      } catch { /* Chrome is starting. */ }
      await delay(100);
    }
    assert.ok(page, 'Chrome de inspeção iniciou');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    ws.onmessage = ({ data }) => {
      const result = JSON.parse(data);
      if (!result.id) return;
      const promise = pending.get(result.id);
      if (!promise) return;
      pending.delete(result.id);
      if (result.error) promise.reject(new Error(result.error.message));
      else promise.resolve(result.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    await send('Page.enable');
    await send('Network.enable');
    const [name, value] = cookie.split('=');
    await send('Network.setCookie', { name, value, url: base });
    const cases = [
      { path: `/${slug}/numeros`, width: 844, height: 390, selector: '.number-scroll', min: 150 },
      { path: `/${slug}/numeros`, width: 320, height: 700, selector: '.number-scroll', min: 150 },
      { path: `/admin/${slug}/participantes`, width: 844, height: 390, selector: '.participants-scroll', min: 44 },
    ];
    for (const check of cases) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: check.width, height: check.height, deviceScaleFactor: 1, mobile: true,
      });
      await send('Page.navigate', { url: `${base}${check.path}` });
      await delay(900);
      const { result } = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const area = document.querySelector(${JSON.stringify(check.selector)});
        const frame = document.querySelector('.theme-frame');
        const content = document.querySelector('.frame-content');
        return { areaHeight: area?.getBoundingClientRect().height ?? 0,
          frameHeight: frame?.getBoundingClientRect().height ?? 0,
          viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth, contentScroll: content?.scrollHeight ?? 0,
          contentHeight: content?.clientHeight ?? 0 };
      })()` });
      const metrics = result.value;
      assert.ok(metrics.areaHeight >= check.min, `${check.path} ${check.width}x${check.height}: área útil ${metrics.areaHeight}px`);
      assert.ok(metrics.documentWidth <= metrics.viewportWidth, 'sem rolagem horizontal do documento');
      assert.equal(metrics.frameHeight, metrics.viewportHeight, 'moldura preenche a altura');
      if (check.height <= 600) assert.ok(metrics.contentScroll > metrics.contentHeight, 'painel curto permite rolagem interna');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const label = check.path.includes('participantes') ? 'participants' : 'numbers';
      await writeFile(`${outputPrefix}-${label}-${check.width}x${check.height}.png`, Buffer.from(shot.data, 'base64'));
      console.log(`Visual ${label} ${check.width}x${check.height}: ${JSON.stringify(metrics)}`);
    }
  } finally {
    ws?.close();
    browser.kill();
    // The directory was created under the OS temporary directory above.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}
