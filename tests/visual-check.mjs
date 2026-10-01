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
      { path: `/admin/${slug}`, width: 320, height: 700, selector: '.dashboard-stage', min: 44 },
      { path: `/admin/${slug}`, width: 480, height: 853, selector: '.dashboard-stage', min: 44 },
      { path: `/admin/${slug}`, width: 844, height: 390, selector: '.dashboard-stage', min: 44 },
      { path: `/${slug}/numeros`, width: 844, height: 390, selector: '.number-scroll', min: 150 },
      { path: `/${slug}/numeros`, width: 320, height: 700, selector: '.number-scroll', min: 150 },
      { path: `/admin/${slug}/participantes`, width: 844, height: 390, selector: '.participants-scroll', min: 44 },
      { path: `/admin/${slug}/participantes`, width: 320, height: 700, selector: '.participants-scroll', min: 44 },
      { path: `/admin/${slug}/participantes`, width: 480, height: 800, selector: '.participants-scroll', min: 44 },
      { path: `/admin/${slug}/configuracoes`, width: 320, height: 700, selector: '.settings-panel', min: 44 },
      { path: `/admin/${slug}/configuracoes`, width: 480, height: 800, selector: '.settings-panel', min: 44 },
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
        const content = document.querySelector('.frame-content') || document.querySelector('.dashboard-scroll');
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
      if (check.path.includes('configuracoes')) {
        await send('Runtime.evaluate', { expression: "document.querySelector('.raffle-reset-button').click()" });
        await delay(100);
        const resetDialog = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const dialog = document.querySelector('.raffle-reset-dialog');
          const rect = dialog.getBoundingClientRect();
          return dialog.open && dialog.querySelector('.primary-button').disabled && rect.width <= innerWidth && rect.height <= innerHeight;
        })()` });
        assert.ok(resetDialog.result.value, 'diálogo de reset cabe na tela e exige confirmação');
        await send('Runtime.evaluate', { expression: "document.querySelector('.raffle-reset-dialog input').focus()" });
        await send('Input.insertText', { text: 'RESETAR' });
        const enabled = await send('Runtime.evaluate', { returnByValue: true, expression: "!document.querySelector('.raffle-reset-dialog .primary-button').disabled" });
        assert.ok(enabled.result.value, 'digitar RESETAR libera a confirmação');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await delay(100);
        const closed = await send('Runtime.evaluate', { returnByValue: true, expression: "!document.querySelector('.raffle-reset-dialog').open && document.activeElement === document.querySelector('.raffle-reset-button')" });
        assert.ok(closed.result.value, 'Esc cancela e devolve o foco ao botão de reset');
        await send('Runtime.evaluate', { expression: "document.querySelector('.raffle-reset-button').click()" });
      }
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const label = check.path === `/admin/${slug}` ? 'dashboard' : check.path.includes('configuracoes') ? 'reset-dialog' : check.path.includes('participantes') ? 'participants' : 'numbers';
      await writeFile(`${outputPrefix}-${label}-${check.width}x${check.height}.png`, Buffer.from(shot.data, 'base64'));
      console.log(`Visual ${label} ${check.width}x${check.height}: ${JSON.stringify(metrics)}`);
      if (label === 'dashboard') {
        const live = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const rows = document.querySelectorAll('.dashboard-preview-table tbody tr:not(.dashboard-preview-spacer)');
          return rows.length === 6 && document.querySelector('.dashboard-live-value--reserved').textContent !== '87/200'
            && document.querySelector('.dashboard-art-action').getAttribute('href').endsWith('/sorteio');
        })()` });
        assert.ok(live.result.value, 'painel mostra todas as seis reservas de teste e navegação funcional');
        const scrolled = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const list = document.querySelector('.dashboard-preview');
          const page = document.querySelector('.dashboard-scroll');
          const pageTop = page.scrollTop;
          list.scrollTop = list.scrollHeight;
          const headerTop = list.querySelector('thead th').getBoundingClientRect().top;
          return list.scrollTop > 0 && page.scrollTop === pageTop
            && Math.abs(headerTop - list.getBoundingClientRect().top) < 2;
        })()` });
        assert.ok(scrolled.result.value, 'a tabela rola independentemente do painel e mantém o cabeçalho visível');
        const scrolledShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`${outputPrefix}-dashboard-scrolled-${check.width}x${check.height}.png`, Buffer.from(scrolledShot.data, 'base64'));
      }
      if (label === 'participants') {
        const opened = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const button = document.querySelector('.participant-name-button');
          button.click();
          return true;
        })()` });
        assert.ok(opened.result.value);
        await delay(100);
        const detail = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const button = document.querySelector('.participant-name-button');
          const row = document.getElementById(button.getAttribute('aria-controls'));
          return button.getAttribute('aria-expanded') === 'true' && !row.hidden;
        })()` });
        assert.ok(detail.result.value, 'detalhes da reserva abrem ao tocar no nome');
      }
    }
  } finally {
    ws?.close();
    browser.kill();
    // The directory was created under the OS temporary directory above.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}
