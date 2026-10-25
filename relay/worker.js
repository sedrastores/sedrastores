/* =====================================================================
   YOURS / Sedra — Telegram order relay (Cloudflare Worker)

   WHY THIS EXISTS
   The shop sites are static: whatever the browser needs, the public can read.
   The bot token used to sit in assets/sedra-data.js, so anyone who opened the
   site had full control of the bot. One of them took it and renamed the bot.

   This Worker holds the token instead. The site posts an order here and this
   forwards it to Telegram.

   WHAT A LEAK OF THIS URL WOULD COST
   Close to nothing, by design:
     · only sendMessage / sendPhoto / sendMediaGroup are allowed, so nobody can
       rename the bot, set a webhook, or read a single update
     · chat_id is forced to the one in the secrets, so nobody can message
       anyone else with it
     · requests are refused unless they come from one of the shop's own sites
     · a plain per-minute cap keeps the chat from being flooded
   The worst anyone could do with the URL is post messages into the owner's own
   orders chat.

   SECRETS (set in the Cloudflare dashboard, never in this file)
     BOT_TOKEN   the token from BotFather
     CHAT_ID     the chat the orders go to
     ALLOWED     comma-separated sites, e.g.
                 https://yoursegypt.com,https://www.yoursegypt.com
   ===================================================================== */

const ALLOWED_METHODS = new Set(['sendMessage', 'sendPhoto', 'sendMediaGroup']);
const MAX_PER_MINUTE = 20;
const hits = [];   // per-isolate, best-effort: enough to stop a flood

function allowedOrigins(env) {
  return String(env.ALLOWED || '')
    .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin || '*'))
  });
}

function rateLimited() {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60000) hits.shift();
  if (hits.length >= MAX_PER_MINUTE) return true;
  hits.push(now);
  return false;
}

export default {
  async fetch(request, env) {
    const origin = (request.headers.get('Origin') || '').replace(/\/$/, '');
    const list = allowedOrigins(env);
    const ok = list.length === 0 || list.includes(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(ok ? origin : list[0] || '*') });
    }
    if (request.method !== 'POST') return reply({ ok: false, error: 'post only' }, 405, origin);
    if (!ok) return reply({ ok: false, error: 'origin not allowed' }, 403, list[0] || '*');
    if (!env.BOT_TOKEN || !env.CHAT_ID) return reply({ ok: false, error: 'not configured' }, 500, origin);
    if (rateLimited()) return reply({ ok: false, error: 'too many' }, 429, origin);

    const api = 'https://api.telegram.org/bot' + env.BOT_TOKEN + '/';
    const type = request.headers.get('Content-Type') || '';

    try {
      // --- a photo the customer uploaded (the transfer receipt) -----------
      if (type.includes('multipart/form-data')) {
        const form = await request.formData();
        const out = new FormData();
        out.append('chat_id', env.CHAT_ID);                 // forced, never the client's
        const caption = form.get('caption');
        if (caption) out.append('caption', String(caption).slice(0, 1024));
        const photo = form.get('photo');
        if (!photo || typeof photo === 'string') return reply({ ok: false, error: 'no photo' }, 400, origin);
        out.append('photo', photo, 'receipt.jpg');
        const r = await fetch(api + 'sendPhoto', { method: 'POST', body: out });
        const j = await r.json();
        return reply(j, j.ok ? 200 : 502, origin);
      }

      // --- an order message ------------------------------------------------
      const body = await request.json();
      const method = String(body.method || '');
      if (!ALLOWED_METHODS.has(method)) return reply({ ok: false, error: 'method not allowed' }, 400, origin);

      const payload = Object.assign({}, body.payload || {});
      payload.chat_id = env.CHAT_ID;                        // forced, never the client's
      if (typeof payload.text === 'string') payload.text = payload.text.slice(0, 4096);
      if (typeof payload.caption === 'string') payload.caption = payload.caption.slice(0, 1024);

      const r = await fetch(api + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      return reply(j, j.ok ? 200 : 502, origin);
    } catch (e) {
      return reply({ ok: false, error: String(e && e.message || e) }, 500, origin);
    }
  }
};
