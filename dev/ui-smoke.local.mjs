import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from '/home/user/ui-smoke/node_modules/jsdom/lib/api.js';

const script = fs.readFileSync(new URL('../public/assets/game-room-v20.js', import.meta.url), 'utf8');

function makeWindow(url, fetchMap = {}) {
  const dom = new JSDOM(`<!doctype html><html lang="en"><body><main></main></body></html>`, {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.matchMedia = window.matchMedia || function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.Audio = class {
    constructor(src) { this.src = src; this.volume = 1; this.paused = true; this.ended = false; this._listeners = {}; }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
    removeEventListener() {}
  };
  window.fetch = async (input) => {
    const full = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const key = full.pathname + (full.search || '');
    const body = fetchMap[key] ?? fetchMap[full.pathname] ?? {};
    return { ok: true, json: async () => body };
  };
  return window;
}

async function runScript(window) {
  window.eval(script);
  await new Promise((r) => setTimeout(r, 80));
}

test('home header injects discord icon as last item', async () => {
  const window = makeWindow('https://example.com/', {
    '/api/auth/discord/config': { enabled: true, clientId: '123', serverInviteUrl: 'https://discord.gg/test' }
  });
  window.document.body.innerHTML = `
    <header><div><div class="brand"></div><div id="actions"><div role="radiogroup"></div><button class="theme-btn">theme</button><button class="shield-btn">shield</button></div></div></header><main></main>
  `;
  await runScript(window);
  const host = window.document.querySelector('#actions');
  const icon = host.lastElementChild;
  assert.ok(icon.className.includes('cm-home-discord'));
  assert.equal(icon.getAttribute('href'), 'https://discord.gg/test');
});

test('mobile home menu includes Discord, account, language, and theme', async () => {
  const window = makeWindow('https://example.com/', {
    '/api/auth/discord/config': { enabled: true, clientId: '123', serverInviteUrl: 'https://discord.gg/test' }
  });
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  window.document.body.innerHTML = `
    <header><div><div class="brand"></div><div id="actions"><div role="radiogroup"></div><button class="theme-btn">theme</button><button class="shield-btn">shield</button></div></div></header><main></main>
  `;
  await runScript(window);
  const btn = window.document.querySelector('.cm-home-menu-btn');
  assert.ok(btn);
  btn.click();
  await new Promise((r) => setTimeout(r, 20));
  const menu = window.document.querySelector('.cm-home-mobile-menu');
  assert.ok(menu);
  const discord = menu.querySelector('.cm-home-mobile-discord');
  const account = menu.querySelector('.cm-home-mobile-account');
  const langs = menu.querySelectorAll('.cm-home-mobile-lang');
  const theme = menu.querySelector('.cm-home-mobile-theme');
  assert.ok(discord);
  assert.equal(discord.getAttribute('href'), 'https://discord.gg/test');
  assert.ok(account);
  assert.equal(langs.length, 2);
  assert.ok(theme);
});

test('admin page renders rebuilt users detail', async () => {
  const window = makeWindow('https://example.com/admin', {
    '/api/admin/users': { users: [
      { id: 'u1', name: 'RootUser', email: 'root@example.com', admin: true, root: true, muted: false, banned: false, discordId: '111', createdAt: '2026-01-01T00:00:00.000Z', lastSeen: Date.now(), avatar: null },
      { id: 'u2', name: 'PlayerTwo', email: 'two@example.com', admin: false, root: false, muted: false, banned: false, discordId: '222', createdAt: '2026-01-02T00:00:00.000Z', lastSeen: Date.now() - 999999, avatar: null }
    ] },
    '/api/auth/me': { user: { id: 'u1', name: 'RootUser', root: true, admin: true } },
    '/api/admin/audit': { entries: [] },
    '/api/admin/reports': { reports: [] },
    '/api/admin/words': { words: [] },
    '/api/auth/discord/config': { enabled: true, clientId: '123', serverInviteUrl: 'https://discord.gg/test' }
  });
  window.localStorage.setItem('clue-me:token', 'tok');
  window.document.body.innerHTML = '<main></main>';
  await runScript(window);
  const shell = window.document.querySelector('.cm-admin-shell');
  assert.ok(shell);
  const rows = shell.querySelectorAll('.cm-admin-row');
  assert.equal(rows.length, 2);
  rows[1].click();
  await new Promise((r) => setTimeout(r, 20));
  const detail = window.document.querySelector('.cm-admin-user-detail');
  assert.ok(detail.textContent.includes('PlayerTwo'));
  assert.ok(detail.textContent.includes('222'));
});
