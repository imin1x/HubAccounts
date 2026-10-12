// HubAccounts — Account / proxy / AI key status checks and local check server client.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- AUTOMATIC FACEBOOK UID STATUS CHECK ----------
// Requests are globally queued so rapid clicks (or a future bulk-check action)
// never create an unbounded burst against Graph API.
const FB_CHECK_TIMEOUT_MS = 10000;
const FB_CHECK_CONCURRENCY = 4;
let fbChecksInFlight = 0;
const fbCheckQueue = [];

function runFacebookCheckQueued(task){
  return new Promise((resolve) => {
    fbCheckQueue.push({ task, resolve });
    drainFacebookCheckQueue();
  });
}

function drainFacebookCheckQueue(){
  while(fbChecksInFlight < FB_CHECK_CONCURRENCY && fbCheckQueue.length){
    const { task, resolve } = fbCheckQueue.shift();
    fbChecksInFlight++;
    Promise.resolve()
      .then(task)
      .then(resolve, () => resolve('unknown'))
      .finally(() => {
        fbChecksInFlight--;
        drainFacebookCheckQueue();
      });
  }
}

// ---------- LOCAL CHECK SERVER (server.js running on the PC) ----------
// Shared by every status checker. When the server cannot be reached (iPhone,
// GitHub Pages without the PC server) checkers report "unknown" instead of
// guessing, and the result toast explains why.
let localCheckServerUnavailable = false;

function localServerUrl(path){
  return `${location.protocol === 'http:' ? '' : 'http://127.0.0.1:8765'}${path}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000){
  const ctrl = new AbortController();
  const tId = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    return await fetch(url, { ...options, signal: ctrl.signal });
  }finally{
    clearTimeout(tId);
  }
}

// Returns the server's JSON answer, or null when the server is unreachable.
async function callLocalCheckServer(path, options = {}, timeoutMs = 8000){
  try{
    const res = await fetchWithTimeout(localServerUrl(path), options, timeoutMs);
    if(!res.ok) throw new Error('LOCAL_SERVER_' + res.status);
    localCheckServerUnavailable = false;
    return await res.json();
  }catch(_err){
    localCheckServerUnavailable = true;
    return null;
  }
}

function emailCheckPath(identifier, platform){
  return `/hubaccounts-email-check?email=${encodeURIComponent(identifier)}&platform=${platform}`;
}

// Loads one image; resolves true on load, false on error, null on timeout.
function probeImage(src, timeoutMs){
  return new Promise((resolve) => {
    const img = new Image();
    let finished = false;
    const finish = (value) => { if(finished) return; finished = true; clearTimeout(timeoutId); resolve(value === true ? img : value); };
    const timeoutId = setTimeout(() => { img.src = ''; finish(null); }, timeoutMs);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
  });
}

// A failed avatar request means "dead" only if Facebook itself is reachable;
// otherwise it is just a network problem. UID 4 is a long-standing public
// profile used as the control sample (cached for 60 s).
let facebookReachableCache = { at: 0, value: null };
async function facebookGraphReachable(){
  if(Date.now() - facebookReachableCache.at < 60000) return facebookReachableCache.value;
  const result = await probeImage(`https://graph.facebook.com/4/picture?type=normal&t=${Date.now()}`, FB_CHECK_TIMEOUT_MS);
  facebookReachableCache = { at: Date.now(), value: !!result };
  return facebookReachableCache.value;
}

function checkFacebookUid(uid){
  return runFacebookCheckQueued(async () => {
    const raw = String(uid || '').trim();
    if(!raw) return 'inactive';

    // Method 1: local server (no browser CORS limitations)
    const data = await callLocalCheckServer(emailCheckPath(raw, 'facebook'), {}, 6500);
    if(data && (data.status === 'active' || data.status === 'inactive')) return data.status;

    // If input is an Access Token, verify directly via Graph API
    if(raw.startsWith('EAA')){
      try{
        const res = await fetchWithTimeout(`https://graph.facebook.com/me?access_token=${encodeURIComponent(raw)}`, {}, 6500);
        if(res.ok){
          const data = await res.json();
          return (data && data.id) ? 'active' : 'inactive';
        }
        return 'inactive';
      }catch(_e){
        return 'unknown';
      }
    }

    const digitMatch = raw.match(/\d{1,25}/);
    if(!digitMatch) return 'inactive';
    const normalizedUid = digitMatch[0];

    // Method 2: browser image probe (works on GitHub Pages without CORS)
    if(navigator.onLine === false) return 'unknown';
    const img = await probeImage(`https://graph.facebook.com/${encodeURIComponent(normalizedUid)}/picture?type=normal`, FB_CHECK_TIMEOUT_MS);
    if(img === null) return 'unknown';
    if(img){
      // Real profile avatar is square (>75px, not the 63px silhouette) -> live
      return img.naturalWidth > 1 && img.naturalHeight > 75 && img.naturalHeight !== 63 ? 'active' : 'inactive';
    }
    // Load error: dead/checkpointed UID only if Facebook is reachable at all.
    return await facebookGraphReachable() ? 'inactive' : 'unknown';
  });
}

async function checkHotmailOnline(email){
  const normEmail = String(email || '').trim();
  if(!normEmail || !normEmail.includes('@')) return 'inactive';
  // Microsoft's existence check needs the local server; without it there is
  // no trustworthy answer, so the status stays unknown.
  const data = await callLocalCheckServer(emailCheckPath(normEmail, 'hotmail'), {}, 10000);
  return (data && data.status) || 'unknown';
}

async function checkGmailOnline(email){
  const normEmail = String(email || '').trim().toLowerCase();
  if(!normEmail || !normEmail.includes('@')) return 'inactive';

  const [user] = normEmail.split('@');
  if(!user || user.length < 6 || user.length > 30 || !/^[a-z0-9.]+$/.test(user)){
    return 'inactive';
  }
  // Google offers no reliable existence check: a well-formed address is
  // "unknown", never assumed active.
  const data = await callLocalCheckServer(emailCheckPath(normEmail, 'gmail'), {}, 10000);
  return (data && data.status) || 'unknown';
}

async function checkProxyOnline(entry){
  const host = entry.fbName || entry.host;
  const port = entry.port;
  if(!host || !port){
    toast('Proxy cần có đủ Host và Port để kiểm tra');
    return;
  }
  if(state.checkingIds.has(entry.id)) return;
  state.checkingIds.add(entry.id);
  renderVault();
  try{
    const data = await callLocalCheckServer('/hubaccounts-proxy-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port })
    }, 6000);
    if(!data) throw new Error('SERVER_UNAVAILABLE');
    const status = data.live ? 'active' : 'inactive';
    const checkedAt = Date.now();
    const nextEntries = state.entries.map(e => e.id === entry.id
      ? { ...e, status, lastCheckedAt: checkedAt, proxyLatency: data.latencyMs, updatedAt: checkedAt }
      : e
    );
    if(!await commitCollection('entries', nextEntries, saveEntries)) return;
    if(data.live){
      toast(`Proxy LIVE! Độ trễ: ${data.latencyMs}ms`);
      recordLog('info', 'proxy', `Proxy ${host}:${port} hoạt động bình thường (${data.latencyMs}ms)`);
    }else{
      toast(`Proxy DIE hoặc phản hồi chậm (${data.error || 'Timeout'})`);
      recordLog('warn', 'proxy', `Proxy ${host}:${port} không hoạt động: ${data.error || 'Timeout'}`);
    }
  }catch(e){
    toast('Không kết nối được dịch vụ test proxy (vui lòng chạy start-desktop.bat trên PC)');
  }finally{
    state.checkingIds.delete(entry.id);
    renderVault();
  }
}

async function checkAiOnline(entry){
  let token = (entry.token || '').trim();
  if(!token){
    // Only a value that is recognisably an API key may leave the device — an
    // ordinary (even long) password is never sent to a third-party API.
    const pw = (entry.password || '').trim();
    if(pw.startsWith('sk-') || pw.startsWith('AIza')) token = pw;
  }
  if(!token){
    const other = (entry.other || '').trim();
    const skMatch = other.match(/(sk-[a-zA-Z0-9_\-]{20,}|AIzaSy[a-zA-Z0-9_\-]{30,})/);
    if(skMatch) token = skMatch[0];
  }
  if(!token){
    const name = (entry.fbName || '').trim();
    if(name.startsWith('sk-') || name.startsWith('AIza')) token = name;
  }

  if(!token){
    toast('Tài khoản chưa có API Key. Bấm Sửa để dán Key vào ô API Key / Token');
    return;
  }
  if(state.checkingIds.has(entry.id)) return;
  state.checkingIds.add(entry.id);
  renderVault();
  try{
    let isValid = false;
    let info = '';

    if(token.startsWith('sk-or-')){
      const res = await fetchWithTimeout('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${token}` }
      }, 7000);
      if(res.ok){
        const json = await res.json();
        isValid = true;
        const limit = json.data?.limit != null ? `$${json.data.limit}` : 'Không giới hạn';
        const usage = json.data?.usage != null ? `$${json.data.usage.toFixed(2)}` : '$0';
        info = `Hạn mức: ${limit} | Đã dùng: ${usage}`;
      }
    }else if(token.startsWith('AIzaSy')){
      const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${token}`, {}, 7000);
      if(res.ok){
        isValid = true;
        info = 'Gemini API Key hợp lệ';
      }
    }else{
      const data = await callLocalCheckServer('/hubaccounts-ai-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      }, 7000);
      if(data){
        isValid = !!data.valid;
        info = data.valid ? 'API Key đang hoạt động' : (data.error || 'Key sai hoặc hết hạn');
      }else{
        const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${token}` }
        }, 6000);
        isValid = res.ok;
        info = res.ok ? 'OpenAI Key hoạt động' : 'Key hết hạn hoặc không hợp lệ';
      }
    }

    // The check result goes to the toast and the log only. It is no longer
    // appended to the user's "Ghi chú" field, which used to grow on every check.
    const status = isValid ? 'active' : 'inactive';
    const checkedAt = Date.now();
    const nextEntries = state.entries.map(e => e.id === entry.id
      ? { ...e, status, lastCheckedAt: checkedAt, updatedAt: checkedAt }
      : e
    );
    if(!await commitCollection('entries', nextEntries, saveEntries)) return;
    toast(isValid ? `API Key hoạt động! ${info}` : `API Key không hợp lệ hoặc đã hết hạn`, 5000);
    recordLog(isValid ? 'info' : 'warn', 'ai', `Đã kiểm tra API Key: ${statusMeta(status).label}${isValid && info ? ` — ${info}` : ''}`);
  }catch(e){
    toast('Lỗi khi kiểm tra API Key: ' + e.message);
  }finally{
    state.checkingIds.delete(entry.id);
    renderVault();
  }
}

async function checkAccountStatus(entry){
  let ident = entry.fbName || entry.email;
  if(entry.platform === 'facebook'){
    if(entry.token && String(entry.token).trim().startsWith('EAA')){
      ident = String(entry.token).trim();
    } else {
      const uidFromFbName = String(entry.fbName || '').match(/\d{1,25}/);
      const uidFromCookie = String(entry.cookie || '').match(/c_user=(\d+)/);
      const uidFromEmail = String(entry.email || '').match(/\d{1,25}/);
      ident = uidFromFbName ? uidFromFbName[0] : (uidFromCookie ? uidFromCookie[1] : (uidFromEmail ? uidFromEmail[0] : (entry.fbName || entry.email || '')));
    }
  }

  if(!ident){
    toast('Tài khoản chưa có thông tin nhận diện (UID / Email)');
    return;
  }
  if(state.checkingIds.has(entry.id)) return;

  state.checkingIds.add(entry.id);
  renderVault();
  try{
    let status = 'unknown';
    if(entry.platform === 'facebook'){
      status = await checkFacebookUid(ident);
    }else if(entry.platform === 'hotmail'){
      status = await checkHotmailOnline(ident);
    }else if(entry.platform === 'gmail'){
      status = await checkGmailOnline(ident);
    }

    const pName = platformMeta(entry.platform).name;
    // An inconclusive check (offline, no local server, Gmail) must not
    // overwrite a status the user or an earlier check already established.
    if(status === 'unknown'){
      const reason = localCheckServerUnavailable
        ? 'không kết nối được máy chủ kiểm tra cục bộ (chạy start-desktop.bat trên PC)'
        : entry.platform === 'gmail'
          ? 'Google không cho phép xác minh tài khoản còn hoạt động'
          : 'không xác minh được (mạng hoặc dịch vụ không phản hồi)';
      recordLog('warn', 'status', `Kiểm tra ${pName} không có kết quả rõ ràng: ${reason}`);
      toast(`${pName}: ${reason} — giữ nguyên trạng thái hiện tại`, 6000);
      return;
    }
    const checkedAt = Date.now();
    const nextEntries = state.entries.map(e => e.id === entry.id
      ? { ...e, status, lastCheckedAt: checkedAt, updatedAt: checkedAt }
      : e
    );
    if(!await commitCollection('entries', nextEntries, saveEntries)) return;
    recordLog('info', 'status', `Đã kiểm tra trạng thái ${pName}: ${statusMeta(status).label}`);
    toast(`Kết quả ${pName}: ${statusMeta(status).label}`);
  }finally{
    state.checkingIds.delete(entry.id);
    renderVault();
  }
}

