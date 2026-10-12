// HubAccounts — TOTP (2FA) code generator.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- TOTP (Google Authenticator style 2FA code generator) ----------
let totpLastWindow = -1;
let lastExpiryCheckMinute = -1;
let proxyExpiryNoticeTimer = null;
const totpCodeCache = {};
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input){
  const raw = String(input || '').trim().toUpperCase();
  // Whitespace is accepted for readability, but any other non-Base32
  // character invalidates the whole secret instead of being silently removed.
  if(!raw || !/^[A-Z2-7\s]+$/.test(raw)) return null;
  const clean = raw.replace(/\s+/g, '');
  let bits = '';
  for(const c of clean){
    const idx = BASE32_ALPHABET.indexOf(c);
    if(idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const byteCount = Math.floor(bits.length / 8);
  const bytes = new Uint8Array(byteCount);
  for(let i = 0; i < byteCount; i++){
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  return bytes;
}

async function computeTotp(secretRaw, period = 30, digits = 6){
  try{
    const keyBytes = base32Decode(secretRaw);
    if(!keyBytes || keyBytes.length === 0) return null;
    const counter = Math.floor(Date.now() / 1000 / period);
    const counterBuf = new ArrayBuffer(8);
    const view = new DataView(counterBuf);
    view.setUint32(0, 0);
    view.setUint32(4, counter);
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, counterBuf);
    const hmac = new Uint8Array(sig);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binCode = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    return (binCode % (10 ** digits)).toString().padStart(digits, '0');
  }catch(e){
    return null;
  }
}

// A live TOTP code is only valid for 30 seconds, so its color counts down
// with it — plenty of time (blue) → still fine (green) → running low
// (yellow) → about to expire, copy now (red). One shared helper used by
// every place in the app that shows a live 2FA code, so they all behave
// exactly the same way.
function totpColorForSecondsLeft(secsLeft){
  if(secsLeft > 22) return 'var(--tone-blue)'; // blue — just refreshed
  if(secsLeft > 15) return 'var(--tone-green)'; // green — plenty of time
  if(secsLeft > 7) return 'var(--tone-yellow)';  // yellow — starting to run low
  return 'var(--tone-red)';                    // red — about to expire
}
function currentTotpSecondsLeft(){
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}
// Recolors every visible live 2FA code (entry list chips, the standalone
// decoder tool, anywhere else) to match how much time is left in the
// current 30-second window. Cheap enough to run every second — it never
// recomputes the code itself, just the color.
function updateTotpColors(){
  const color = totpColorForSecondsLeft(currentTotpSecondsLeft());
  document.querySelectorAll('[data-totp-val]').forEach(span => {
    span.style.color = color;
  });
}

async function refreshTotpCodes(){
  const list = (state.visibleEntries || []).filter(e => e.twoFA);
  await Promise.all(list.map(async (entry) => {
    const span = document.getElementById(`totp-val-${entry.id}`);
    if(!span) return;
    const code = await computeTotp(entry.twoFA);
    if(code){
      totpCodeCache[entry.id] = code;
      span.textContent = code;
    } else {
      span.textContent = 'Lỗi mã';
    }
  }));
  updateTotpColors();
}

