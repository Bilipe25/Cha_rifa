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

export async function runVisualCheck(base, slug, cookie, outputPrefix, options = {}) {
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
    const evaluate = async expression => {
      const output = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (output.exceptionDetails) throw new Error(output.exceptionDetails.text);
      return output.result.value;
    };
    const until = async (expression, message) => {
      for (let attempt = 0; attempt < 35; attempt++) {
        if (await evaluate(`Boolean(${expression})`)) return;
        await delay(100);
      }
      assert.fail(message);
    };
    await send('Page.enable');
    await send('Network.enable');
    const [name, value] = cookie.split('=');
    await send('Network.setCookie', { name, value, url: base });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem(${JSON.stringify(`charifa_install_dismissed_${slug}`)}, String(Date.now() + 86400000)); } catch {}` });
    const cases = options.drawn ? [
      { path: `/admin/${slug}`, width: 320, height: 700, selector: '.dashboard-stage', min: 44 },
      { path: `/admin/${slug}/participantes`, width: 480, height: 800, selector: '.participants-scroll', min: 44 },
    ] : [
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
      if (label === 'dashboard' && !options.drawn) {
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
      if (label === 'participants' || label === 'dashboard') {
        await evaluate(`(() => {
          const list = document.querySelector('.dashboard-preview, .participants-scroll');
          const button = list.querySelector('tbody button');
          window.sheetTrigger = button; window.sheetList = list; window.sheetListTop = list.scrollTop;
          button.closest('tr').querySelector('td').click();
        })()`);
        await until("document.querySelector('.participant-sheet:modal .participant-sheet-body')?.getAttribute('aria-busy') === 'false'", 'sheet carrega ao tocar em qualquer coluna');
        await until("document.querySelector('.participant-sheet').getAnimations().every(animation => animation.playState !== 'running')", 'animação de abertura concluiu');
        const sheetFits = await evaluate(`(() => {
          const rect = document.querySelector('.participant-sheet').getBoundingClientRect();
          return rect.width <= innerWidth && rect.height <= innerHeight * .85 + 1 && rect.bottom <= innerHeight + 1;
        })()`);
        assert.ok(sheetFits, 'sheet cabe na tela e mantém espaço para o contexto');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
        assert.ok(await evaluate("document.querySelector('.participant-sheet').contains(document.activeElement)"), 'foco permanece dentro do sheet');
        if (options.drawn) assert.ok(await evaluate("!document.querySelector('.participant-sheet [data-sheet-action]') && !document.querySelector('.participant-sheet-late') && document.querySelector('.participant-sheet').textContent.includes('Sorteio concluído')"), 'após sorteio o sheet permite somente consulta');
        const sheetShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`${outputPrefix}-${label}-sheet-${check.width}x${check.height}.png`, Buffer.from(sheetShot.data, 'base64'));
        await evaluate("document.querySelector('.participant-sheet-history').open = true; document.querySelector('.participant-sheet-history').scrollIntoView({block:'nearest'})");
        assert.ok(await evaluate("document.querySelector('.participant-sheet-history li') !== null"), 'histórico disponível no sheet');
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await until("!document.querySelector('.participant-sheet')", 'Esc fecha o sheet');
        await until("document.activeElement === window.sheetTrigger && window.sheetList.scrollTop === window.sheetListTop", 'fechamento restaura o foco e conserva a rolagem');
      }
    }
    if (!options.drawn) {
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: `${base}/admin/${slug}` });
      await until("document.querySelector('.dashboard-participant-button')", 'painel carregou para teste de ações');
      await evaluate("[...document.querySelectorAll('.dashboard-participant-button')].find(button => button.textContent.includes('Bruno Santos')).click()");
      await until("document.querySelector('[data-sheet-action=paid]')?.disabled === false", 'pagamento disponível');
      await evaluate("document.querySelector('[data-sheet-action=paid]').click()");
      await until("document.querySelector('[data-sheet-action=pending]')?.disabled === false", 'pagamento confirmado pelo sheet');
      assert.ok(await evaluate("document.querySelector('.participant-sheet-history').textContent.includes('Pago')"), 'histórico recebe a confirmação');
      await evaluate("document.querySelector('[data-sheet-action=release]').click()");
      await until("document.querySelector('.participant-sheet-confirm')", 'confirmação aparece dentro do sheet');
      assert.ok(await evaluate("document.querySelector('.participant-sheet-confirm').textContent.includes('não realiza reembolso')"), 'liberação paga exige confirmação explícita');
      const confirmationShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`${outputPrefix}-sheet-paid-confirmation-320x700.png`, Buffer.from(confirmationShot.data, 'base64'));
      await evaluate("document.querySelector('.participant-sheet-confirm .secondary-button').click()");
      assert.ok(await evaluate("[...document.querySelectorAll('.dashboard-participant-row')].some(row => row.textContent.includes('Bruno Santos'))"), 'cancelar a confirmação preserva a reserva');
      await evaluate("document.querySelector('[data-sheet-action=pending]').click()");
      await until("document.querySelector('[data-sheet-action=confirm]')?.disabled === false", 'confirmação de pendência disponível');
      await evaluate("document.querySelector('[data-sheet-action=confirm]').click()");
      await until("document.querySelector('[data-sheet-action=paid]')?.disabled === false", 'reserva voltou a pendente');
      await evaluate("document.querySelector('[data-sheet-action=release]').click()");
      await until("document.querySelector('[data-sheet-action=confirm]')?.disabled === false", 'confirmação de liberação disponível');
      await evaluate("document.querySelector('[data-sheet-action=confirm]').click()");
      await until("document.querySelector('.participant-sheet .participant-payment-status--cancelled') && document.querySelector('.participant-sheet-body')?.getAttribute('aria-busy') === 'false' && ![...document.querySelectorAll('.dashboard-participant-row')].some(row => row.textContent.includes('Bruno Santos'))", 'liberação mantém sheet aberto e atualiza a tabela');
      assert.ok(await evaluate("document.querySelector('.participant-sheet-history').textContent.includes('Liberado')"), 'histórico recebe a liberação');
      assert.ok(await evaluate(`fetch(${JSON.stringify(`${base}/api/${slug}/numbers`)}).then(response => response.json()).then(data => !data.occupied.includes(29))`), 'liberação torna o número disponível');
      await evaluate("document.querySelector('.participant-sheet-close').click()");
      await until("!document.querySelector('.participant-sheet')", 'botão fecha sheet');
      await until("document.activeElement === document.querySelector('.dashboard-preview')", 'foco retorna à tabela quando a linha foi removida');
      await evaluate("document.querySelector('.dashboard-participant-button').click()");
      await until("document.querySelector('.participant-sheet:modal')", 'sheet aberto para gesto');
      const point = await evaluate("(() => { const r=document.querySelector('.participant-sheet-handle').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + 90 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await until("!document.querySelector('.participant-sheet')", 'deslizar a alça fecha o sheet');
    }
  } finally {
    ws?.close();
    browser.kill();
    // The directory was created under the OS temporary directory above.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}
