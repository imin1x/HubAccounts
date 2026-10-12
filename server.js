'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto'); // explicit: Node 18 has no global crypto
const { URL } = require('url');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8765);
const ROOT = __dirname;
const STATIC_FILES = new Set(['HubAccounts.html', 'index.html', 'hubaccounts.css', 'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png']);
// Feature scripts of the app (js/*.js); the strict pattern also rules out
// path traversal.
const APP_SCRIPT_PATTERN = /^js\/[a-z0-9-]+\.js$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };

function noStoreHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    ...extra
  };
}

// ----------------- API ACCESS CONTROL -----------------
// The API can open TCP sockets (proxy ping) and query third-party services, so
// only the app itself may call it: requests must target this machine by its
// loopback name (blocks DNS rebinding) and come from an allowed origin. Extra
// origins (e.g. another GitHub Pages domain) can be added with the
// HUBACCOUNTS_ALLOWED_ORIGINS environment variable, comma-separated.
const DEFAULT_ALLOWED_ORIGINS = ['https://imin1x.github.io'];

function allowedOrigins(port) {
  const extra = String(process.env.HUBACCOUNTS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function apiAccess(req) {
  const port = req.socket.localPort;
  const host = String(req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return { ok: false };
  const origin = req.headers.origin;
  if (origin) return allowedOrigins(port).has(origin) ? { ok: true, origin } : { ok: false };
  // No Origin header: same-origin navigation/GET. Still refuse anything a
  // browser labels as cross-site.
  if (req.headers['sec-fetch-site'] === 'cross-site') return { ok: false };
  return { ok: true };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, noStoreHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }));
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) { req.destroy(); reject(new Error('PAYLOAD_TOO_LARGE')); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function fetchPublicIp(fetchImpl) {
  const sources = [
    { url: 'https://api.ipify.org?format=json', family: 4, read: async (response) => (await response.json()).ip },
    { url: 'https://ipv4.icanhazip.com/', family: 4, read: async (response) => (await response.text()).trim() },
    { url: 'https://api64.ipify.org?format=json', family: 0, read: async (response) => (await response.json()).ip },
    { url: 'https://www.cloudflare.com/cdn-cgi/trace', family: 0, read: async (response) => ((await response.text()).match(/^ip=(.+)$/m) || [])[1] }
  ];
  for (const source of sources) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl(source.url, { signal: controller.signal, headers: { Accept: 'application/json,text/plain' } });
      if (!response.ok) continue;
      const ip = String(await source.read(response) || '').trim();
      const family = net.isIP(ip);
      if (family && (!source.family || family === source.family)) return ip;
    } catch {}
    finally { clearTimeout(timer); }
  }
  return null;
}

// ----------------- EMAIL STATUS CHECKER (HOTMAIL & GMAIL) -----------------
async function checkHotmailStatus(email, fetchImpl) {
  const normEmail = String(email || '').trim().toLowerCase();
  if (!normEmail || !normEmail.includes('@')) {
    return { status: 'inactive', label: 'Email không hợp lệ' };
  }

  try {
    const initRes = await fetchImpl('https://login.live.com/login.srf', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const html = await initRes.text();
    const cookies = initRes.headers.getSetCookie ? initRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') : '';

    const srvIdx = html.indexOf('ServerData =');
    if (srvIdx === -1) {
      return { status: 'unknown', reason: 'NO_SERVER_DATA' };
    }

    const jsonStart = html.indexOf('{', srvIdx);
    const jsonEnd = html.indexOf('};', jsonStart);
    const serverData = JSON.parse(html.slice(jsonStart, jsonEnd + 1));

    const targetUrl = serverData.urlGetCredentialType || 'https://login.live.com/GetCredentialType.srf';
    const sFTMatch = serverData.sFTTag ? serverData.sFTTag.match(/value="([^"]+)"/) : null;
    const flowToken = sFTMatch ? sFTMatch[1] : '';

    const payload = {
      username: normEmail,
      isOtherIdpSupported: true,
      checkPhones: false,
      isRemoteNGCSupported: true,
      isCookieBannerShown: false,
      isFidoSupported: true,
      country: 'US',
      forceotclogin: false,
      isExternalFederationDisallowed: false,
      isRemoteConnectSupported: false,
      federationFlags: 0,
      isSignup: false,
      flowToken: flowToken
    };

    const checkRes = await fetchImpl(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'client-request-id': serverData.correlationId || crypto.randomUUID()
      },
      body: JSON.stringify(payload)
    });

    const res = await checkRes.json();

    // IfExistsResult values:
    // 1: User does not exist / Deleted / Not found
    // 0: Normal existing account
    // 5: Federated / Work account exists
    // 8: Consumer MSA account exists
    if (res.IfExistsResult === 1) {
      return { status: 'inactive', label: 'Không tồn tại hoặc đã bị khóa/xóa', ifExistsResult: 1 };
    }

    if (res.Credentials || res.IfExistsResult === 0 || res.IfExistsResult === 5 || res.IfExistsResult === 8) {
      return {
        status: 'active',
        label: 'Hoạt động (Tài khoản Microsoft tồn tại)',
        ifExistsResult: res.IfExistsResult,
        hasPassword: !!res.Credentials?.HasPassword
      };
    }

    if (res.ErrorHR) {
      return { status: 'unknown', label: 'Máy chủ Microsoft từ chối yêu cầu (' + res.ErrorHR + ')', code: res.ErrorHR };
    }

    // No recognised answer: do not guess.
    return { status: 'unknown', label: 'Microsoft không trả kết quả rõ ràng' };
  } catch (err) {
    return { status: 'unknown', reason: err.message };
  }
}


async function checkGmailStatus(email, fetchImpl) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized.includes('@')) return { status: 'inactive', label: 'Định dạng email không hợp lệ' };
  
  const [user] = normalized.split('@');
  if (!user || user.length < 6 || user.length > 30) {
    return { status: 'inactive', label: 'Tên tài khoản Google không hợp lệ (cần 6-30 ký tự)' };
  }
  if (!/^[a-z0-9.]+$/.test(user)) {
    return { status: 'inactive', label: 'Tên tài khoản chứa ký tự không hợp lệ' };
  }

  // Google exposes no reliable public existence check, so a well-formed
  // address is reported as unverified rather than as a live account.
  return { status: 'unknown', label: 'Định dạng hợp lệ — Google không cho phép xác minh tài khoản còn hoạt động' };
}

async function checkFacebookStatus(uidInput, fetchImpl = globalThis.fetch) {
  const str = String(uidInput || '').trim();

  // If input is an Access Token (starts with EAA)
  if (str.startsWith('EAA')) {
    try {
      const res = await fetchImpl(`https://graph.facebook.com/me?access_token=${encodeURIComponent(str)}`);
      const json = await res.json();
      if (json && json.id) {
        return { status: 'active', label: 'Hoạt động (Token Live)', uid: json.id, name: json.name };
      } else {
        return { status: 'inactive', label: 'Không hoạt động (Token Die)', error: json.error?.message };
      }
    } catch (e) {
      return { status: 'unknown', reason: e.message };
    }
  }

  const digitMatch = str.match(/\d{1,25}/);
  if (!digitMatch) {
    return { status: 'inactive', label: 'Không tìm thấy UID hợp lệ' };
  }
  const uid = digitMatch[0];

  return new Promise((resolve) => {
    const req = https.get(`https://graph.facebook.com/${encodeURIComponent(uid)}/picture?type=normal`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      const loc = res.headers.location || '';
      const has100x100 = loc.includes('100x100') || loc.includes('s100x100');
      const isSilhouette = loc.includes('static.xx.fbcdn.net') || loc.includes('rsrc.php');

      // 302 with real avatar -> LIVE
      if (res.statusCode === 302 && has100x100 && !isSilhouette) {
        resolve({ status: 'active', label: 'Hoạt động (UID Live)', uid });
      } else {
        // 400 or silhouette default -> DIE / Checkpoint
        resolve({ status: 'inactive', label: 'Không hoạt động / Bị khóa / Die', uid, code: res.statusCode });
      }
    });

    req.on('error', (err) => {
      resolve({ status: 'unknown', reason: err.message, uid });
    });

    req.setTimeout(6500, () => {
      req.destroy();
      resolve({ status: 'unknown', reason: 'Timeout', uid });
    });
  });
}

// ----------------- PROXY LIVE PING & TESTER -----------------
function pingProxy(host, port, timeout = 4500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.connect({ host, port: Number(port), timeout }, () => {
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({ live: true, latencyMs, host, port });
    });
    socket.on('error', (err) => resolve({ live: false, error: err.message, host, port }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ live: false, error: 'TIMEOUT', host, port });
    });
  });
}

// ----------------- AI API KEY & QUOTA CHECKER -----------------
async function testAiApiKey(token, provider = 'auto', fetchImpl) {
  const trimmed = String(token || '').trim();
  if (!trimmed) return { valid: false, error: 'EMPTY_TOKEN' };

  let url = 'https://api.openai.com/v1/models';
  let headers = { 'Authorization': `Bearer ${trimmed}` };

  if (trimmed.startsWith('sk-or-') || provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/auth/key';
  } else if (trimmed.startsWith('sk-ant-') || provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/models';
    headers = { 'x-api-key': trimmed, 'anthropic-version': '2023-06-01' };
  } else if (trimmed.startsWith('AIzaSy') || provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}`;
    headers = {};
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (res.status === 200) {
      const json = await res.json();
      return { valid: true, status: 200, data: json };
    }
    const errText = await res.text();
    return { valid: false, status: res.status, error: errText.slice(0, 120) };
  } catch (e) {
    clearTimeout(timer);
    return { valid: false, error: e.message };
  }
}

const API_NAMES = ['network-status', 'email-check', 'proxy-check', 'ai-check'];

function apiRoute(pathname, name) {
  return pathname === `/hubaccounts-${name}`;
}

function createHubAccountsServer(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; connect-src 'self' https: http:; img-src 'self' data: blob: https:");

    let requestUrl;
    try {
      requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    } catch {
      res.writeHead(400); return res.end();
    }

    if (API_NAMES.some(name => apiRoute(requestUrl.pathname, name))) {
      const access = apiAccess(req);
      if (!access.ok) return sendJson(res, 403, { code: 'FORBIDDEN_ORIGIN', message: 'Nguồn gọi không được phép.' });
      if (access.origin) {
        res.setHeader('Access-Control-Allow-Origin', access.origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, noStoreHeaders({
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Private-Network': 'true',
          'Access-Control-Max-Age': '600'
        }));
        return res.end();
      }
    } else if (req.method === 'OPTIONS') {
      res.writeHead(204, noStoreHeaders());
      return res.end();
    }

    try {

      // Network status
      if (apiRoute(requestUrl.pathname, 'network-status')) {
        if (req.method !== 'GET') return sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Phương thức không được hỗ trợ.' });
        const ip = await fetchPublicIp(fetchImpl);
        return sendJson(res, 200, { online: Boolean(ip), ip });
      }

      // Email check (Hotmail / Gmail)
      if (apiRoute(requestUrl.pathname, 'email-check')) {
        if (req.method !== 'GET') return sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED' });
        const email = requestUrl.searchParams.get('email') || '';
        const platform = requestUrl.searchParams.get('platform') || '';
        if (!email) return sendJson(res, 400, { error: 'EMAIL_REQUIRED' });

        if (platform === 'facebook') {
          const result = await checkFacebookStatus(email, fetchImpl);
          return sendJson(res, 200, result);
        } else if (platform === 'hotmail' || email.includes('hotmail') || email.includes('outlook') || email.includes('live.')) {
          const result = await checkHotmailStatus(email, fetchImpl);
          return sendJson(res, 200, result);
        } else if (platform === 'gmail' || email.includes('gmail')) {
          const result = await checkGmailStatus(email, fetchImpl);
          return sendJson(res, 200, result);
        } else {
          return sendJson(res, 400, { error: 'UNSUPPORTED_PLATFORM' });
        }
      }

      // Proxy check
      if (apiRoute(requestUrl.pathname, 'proxy-check')) {
        if (req.method !== 'POST') return sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED' });
        const body = await readJsonBody(req);
        const { host: pHost, port: pPort } = body;
        if (!pHost || !pPort) return sendJson(res, 400, { error: 'HOST_AND_PORT_REQUIRED' });
        const portNumber = Number(pPort);
        if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) return sendJson(res, 400, { error: 'INVALID_PORT' });
        const pingResult = await pingProxy(pHost, pPort);
        return sendJson(res, 200, pingResult);
      }

      // AI key check
      if (apiRoute(requestUrl.pathname, 'ai-check')) {
        if (req.method !== 'POST') return sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED' });
        const body = await readJsonBody(req);
        const { token, provider } = body;
        if (!token) return sendJson(res, 400, { error: 'TOKEN_REQUIRED' });
        const aiResult = await testAiApiKey(token, provider, fetchImpl);
        return sendJson(res, 200, aiResult);
      }

      // Static files
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      const name = requestUrl.pathname === '/' ? 'HubAccounts.html' : decodeURIComponent(requestUrl.pathname.slice(1));
      if (!STATIC_FILES.has(name) && !APP_SCRIPT_PATTERN.test(name)) { res.writeHead(404); return res.end('Not found'); }
      fs.readFile(path.join(ROOT, name), (error, data) => {
        if (error) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        if (req.method === 'HEAD') return res.end();
        res.end(data);
      });
    } catch {
      sendJson(res, 500, { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi máy chủ.' });
    }
  });
}

if (require.main === module) {
  createHubAccountsServer().listen(PORT, HOST, () => {
    console.log(`HubAccounts đang chạy cục bộ tại http://${HOST}:${PORT}/HubAccounts.html`);
  });
}

module.exports = { createHubAccountsServer, fetchPublicIp, checkHotmailStatus, checkGmailStatus, pingProxy, testAiApiKey };
