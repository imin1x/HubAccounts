'use strict';
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHubAccountsServer, checkGmailStatus, checkHotmailStatus } = require(path.join(__dirname, '..', 'server.js'));

// Never touch the network from tests: every outbound request gets this answer.
const fakeFetch = async () => ({
  ok: true, status: 200,
  json: async () => ({ ip: '203.0.113.7' }),
  text: async () => '203.0.113.7',
  headers: { getSetCookie: () => [] }
});

async function withServer(run) {
  const server = createHubAccountsServer({ fetchImpl: fakeFetch });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const request = (pathname, options = {}) => fetch(`http://127.0.0.1:${port}${pathname}`, options);
  try { await run({ port, request }); } finally { server.close(); }
}

test('serves the app shell and feature scripts', () => withServer(async ({ request }) => {
  for (const file of ['/', '/HubAccounts.html', '/index.html', '/hubaccounts.css', '/sw.js', '/manifest.json', '/js/app.js', '/js/core.js']) {
    const res = await request(file);
    assert.equal(res.status, 200, file);
  }
}));

test('refuses files outside the allow-list', () => withServer(async ({ request }) => {
  for (const file of ['/server.js', '/package.json', '/js/../server.js', '/js/%2e%2e%2fserver.js', '/D3vic3.html', '/devic3-network-status']) {
    const res = await request(file);
    assert.equal(res.status, 404, file);
  }
}));

test('API answers the app itself and allowed origins only', () => withServer(async ({ request }) => {
  const same = await request('/hubaccounts-network-status');
  assert.equal(same.status, 200);

  const pages = await request('/hubaccounts-network-status', { headers: { Origin: 'https://imin1x.github.io' } });
  assert.equal(pages.status, 200);
  assert.equal(pages.headers.get('access-control-allow-origin'), 'https://imin1x.github.io');

  const evil = await request('/hubaccounts-proxy-check', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
    body: JSON.stringify({ host: '192.168.1.1', port: 22 })
  });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  const crossSite = await request('/hubaccounts-email-check?email=a@gmail.com', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
}));

test('API rejects DNS-rebinding style Host headers', () => withServer(async ({ port }) => {
  const http = require('http');
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/hubaccounts-network-status', headers: { Host: `attacker.example:${port}` } }, res => {
      res.resume(); resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 403);
}));

test('preflight from an allowed origin includes the private-network grant', () => withServer(async ({ request }) => {
  const res = await request('/hubaccounts-ai-check', {
    method: 'OPTIONS',
    headers: { Origin: 'https://imin1x.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' }
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-private-network'), 'true');
}));

test('proxy check rejects an invalid port', () => withServer(async ({ request }) => {
  const res = await request('/hubaccounts-proxy-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: '127.0.0.1', port: 'abc' }) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'INVALID_PORT');
}));

test('Gmail check never claims an account is active', async () => {
  assert.equal((await checkGmailStatus('valid.address@gmail.com', fakeFetch)).status, 'unknown');
  assert.equal((await checkGmailStatus('abc@gmail.com', fakeFetch)).status, 'inactive');
  assert.equal((await checkGmailStatus('bad!chars@gmail.com', fakeFetch)).status, 'inactive');
});

test('Hotmail check reports unknown when Microsoft gives no clear answer', async () => {
  const page = 'x ServerData = {"urlGetCredentialType":"https://login.live.com/GetCredentialType.srf","sFTTag":"<input value=\\"tok\\"/>"}; y';
  const fetchImpl = async (url) => url.includes('GetCredentialType')
    ? { json: async () => ({}) }
    : { text: async () => page, headers: { getSetCookie: () => [] } };
  assert.equal((await checkHotmailStatus('someone@outlook.com', fetchImpl)).status, 'unknown');
  const deleted = async (url) => url.includes('GetCredentialType')
    ? { json: async () => ({ IfExistsResult: 1 }) }
    : { text: async () => page, headers: { getSetCookie: () => [] } };
  assert.equal((await checkHotmailStatus('someone@outlook.com', deleted)).status, 'inactive');
});
