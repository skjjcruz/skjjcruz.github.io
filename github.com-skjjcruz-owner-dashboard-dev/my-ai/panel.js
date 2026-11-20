// lab/my-ai/panel.js — the front page's "Ask your AI" box (owner ask 2026-11-17).
//
// One place to use your own AI from the Lab front page: the "Ask your AI"
// button and the "Bring your own AI" banner open it for a signed-in member
// (a visitor who is not signed in still gets the AI sign-up sheet). No key
// yet: the box asks for it (saved exactly where the app's Ask your AI keeps
// it, js/shared/ask-dhq.js, so a league added later finds it). With a key:
// ask about any player, answered by the member's own AI with DHQ's numbers
// (my-ai/ask.js). An account opens every feature: "Open app" goes to the War Room.
//
// Needs: reconai-shared/identity.js (in the page head), my-ai/ask.js.
(function (root) {
  'use strict';
  var MEMBER_KEY = 'dhq_member_ai_v1', OLD_KEY = 'dynastyhq_ai_key', OLD_PROV = 'dynastyhq_ai_provider';
  var CONSENT = 'dhq_ai_consent_v1';
  var LABEL = { openai: 'ChatGPT', anthropic: 'Claude', gemini: 'Gemini' };
  var CONSENT_TEXT = 'Your league data goes to the AI you connected (Claude, ChatGPT or Gemini) when you ask a question.';
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function idn() { return (root.OD && root.OD.identity) || null; }
  function owner() { try { var i = idn(); return i && i.currentOwner ? String(i.currentOwner() || '') : ''; } catch (e) { return ''; } }
  function isMember() { var o = owner(); return !!o && o !== 'guest'; }
  function cleanKey(k) { return String(k || '').replace(/\s+/g, ''); }
  function providerOf(key) {
    var k = cleanKey(key);
    if (k.length < 20 || !/^[\x21-\x7e]+$/.test(k)) return null;
    if (/^sk-ant-/.test(k)) return 'anthropic';
    if (/^sk-/.test(k)) return 'openai';
    return 'gemini';
  }
  function savedKey() { var r = readJSON(MEMBER_KEY); return r && r.key && LABEL[r.provider] && r.owner === owner() ? r : null; }
  function consentOk() { var c = readJSON(CONSENT); return !!(c && c.agreed === true && c.owner === owner()); }
  function checkKey(key, prov) {
    var k = cleanKey(key), req;
    if (prov === 'anthropic') req = fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    else if (prov === 'openai') req = fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + k } });
    else req = fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': k } });
    return req.then(function (r) { return r.ok ? 'ok' : (r.status === 400 || r.status === 401 || r.status === 403 ? 'bad' : 'unknown'); }, function () { return 'unknown'; });
  }
  // A member with no league yet gets the whole app (owner ruling 2026-11-17: an account opens
  // every feature): mark onboarding done on this owner's own identity cache, so "Open app" and
  // later visits go to the War Room's leagues page (it has "+ Add league") instead of the old
  // connect page. Typing a league into the front page's War Room box clears it again (landing.html).
  function markMember() {
    try {
      var i = idn();
      if (!isMember() || !i || (i.cacheIsMine && !i.cacheIsMine())) return;
      var prof = readJSON('od_profile_v1') || {};
      if (prof.onboardingComplete !== true) { prof.onboardingComplete = true; localStorage.setItem('od_profile_v1', JSON.stringify(prof)); }
    } catch (e) { /* the connect page still offers a way in */ }
  }

  var CSS = [
    '.aip-back{position:fixed;inset:0;z-index:2147482998;background:rgba(4,6,10,.55)}',
    '.aip{position:fixed;z-index:2147482999;right:16px;bottom:16px;width:min(440px,calc(100vw - 32px));max-height:min(760px,calc(100vh - 32px));display:flex;flex-direction:column;background:#15151b;color:#F2F2F2;border:1px solid rgba(212,175,55,.45);border-radius:var(--card-radius-lg,14px);box-shadow:0 18px 50px rgba(0,0,0,.55);font:400 15px/1.5 "DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif}',
    '@media (max-width:600px){.aip{inset:auto 0 0 0;width:100%;max-height:92vh;border-radius:var(--card-radius-lg,14px) var(--card-radius-lg,14px) 0 0;padding-bottom:env(safe-area-inset-bottom)}}',
    '.aip *{box-sizing:border-box}',
    '.aip-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1)}',
    '.aip-h b{color:#D4AF37;letter-spacing:.1em;font-size:.82rem;white-space:nowrap}',
    '.aip-h .who{flex:1;min-width:0;text-align:right;color:#A9A9B3;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.aip-x,.aip-menu-b{background:none;border:0;color:#A9A9B3;font:inherit;font-size:1.25rem;line-height:1;cursor:pointer;min-width:40px;min-height:40px;border-radius:var(--card-radius-sm,8px)}',
    '.aip-x:hover,.aip-menu-b:hover{color:#D4AF37}',
    '.aip-menu{display:flex;gap:4px;flex-wrap:wrap;padding:0 14px 8px;border-bottom:1px solid rgba(255,255,255,.1)}',
    '.aip-menu button{background:none;border:0;color:#A9A9B3;text-decoration:underline;font:inherit;font-size:.85rem;cursor:pointer;padding:8px 6px}',
    '.aip-menu button:hover{color:#D4AF37}',
    '.aip-b{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}',
    '.aip-card{background:#0f0f13;border:1px solid rgba(255,255,255,.1);border-radius:var(--card-radius,10px);padding:12px}',
    '.aip-step{color:#D4AF37;font-weight:700;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;margin:0 0 8px}',
    '.aip-prov{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)}',
    '.aip-prov:first-of-type{border-top:0}',
    '.aip-prov span{color:#A9A9B3;font-size:.8rem;display:block}',
    '.aip-prov a{color:#D4AF37;font-weight:700;font-size:.85rem;text-decoration:none;padding:8px 2px;white-space:nowrap}',
    '.aip-row{display:flex;gap:8px}',
    '.aip input[type=password],.aip input[type=text]{flex:1;min-width:0;min-height:44px;padding:0 12px;background:#0A0A0C;color:#F2F2F2;border:1px solid rgba(212,175,55,.4);border-radius:var(--card-radius-sm,8px);font:inherit;font-size:16px}',
    '.aip-btn{min-height:44px;padding:0 16px;background:#D4AF37;color:#111;border:0;border-radius:var(--card-radius-sm,8px);font:inherit;font-weight:700;cursor:pointer}',
    '.aip-btn:disabled{opacity:.6}',
    '.aip-agree{display:flex;gap:10px;align-items:flex-start;margin:10px 0 0;color:#A9A9B3;font-size:.85rem;cursor:pointer;min-height:44px}',
    '.aip-agree input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:#D4AF37}',
    '.aip-note{margin:8px 0 0;color:#A9A9B3;font-size:.82rem}',
    '.aip-note.bad{color:#f87171}',
    '.aip .sub{margin:0;color:#A9A9B3;font-size:.88rem}',
    '.aip .fmt{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.8rem;color:#A9A9B3}',
    '.aip .fmt select{min-height:34px;padding:0 6px;background:#0f0f13;color:#F2F2F2;border:1px solid rgba(255,255,255,.12);border-radius:var(--card-radius-sm,8px);font:inherit;font-size:14px}',
    '.aip .log{display:flex;flex-direction:column;gap:10px}',
    '.aip .log:empty{display:none}',
    '.aip .msgline{padding:10px 12px;border-radius:var(--card-radius,10px);font-size:.93rem;overflow-wrap:anywhere}',
    '.aip .msgline.me{align-self:flex-end;max-width:85%;background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.4)}',
    '.aip .msgline.ai{background:#0f0f13;border:1px solid rgba(255,255,255,.1)}',
    '.aip .msgline.ai p{margin:0 0 8px}.aip .msgline.ai p:last-child{margin:0}',
    '.aip .msgline.ai ul{margin:4px 0 8px;padding-left:20px}.aip .msgline.ai li{margin:3px 0}',
    '.aip .msgline.err{border-color:rgba(248,113,113,.5);color:#f87171}',
    '.aip .msgline .src{margin-top:8px;font-size:.78rem;color:#A9A9B3}.aip .msgline .src a{color:#D4AF37}',
    '.aip .pending .dots{color:#A9A9B3}.aip .pending .dots::after{content:"…"}',
    '.aip .chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.aip .chip{min-height:36px;padding:6px 10px;background:#0f0f13;color:#F2F2F2;border:1px solid rgba(255,255,255,.12);border-radius:var(--card-radius-sm,8px);font:inherit;font-size:.83rem;cursor:pointer;text-align:left}',
    '.aip .chip:hover{border-color:rgba(212,175,55,.4)}',
    '.aip-f{padding:10px 14px 14px;border-top:1px solid rgba(255,255,255,.1)}',
    '.aip-lg{font-size:.82rem;color:#A9A9B3}.aip-lg a{color:#D4AF37}',
    '[hidden].aip,.aip [hidden],.aip-back[hidden]{display:none!important}'
  ].join('\n');

  var el = null, back = null, started = false;
  function $(id) { return document.getElementById(id); }
  function build() {
    if (el) return;
    var st = document.createElement('style'); st.setAttribute('data-aip', '1'); st.textContent = CSS; document.head.appendChild(st);
    back = document.createElement('div'); back.className = 'aip-back'; back.hidden = true; back.addEventListener('click', close);
    el = document.createElement('section'); el.className = 'aip'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Ask your AI');
    el.innerHTML =
      '<div class="aip-h"><b>ASK YOUR AI</b><span class="who" id="aipWho"></span>' +
      '<button type="button" class="aip-menu-b" id="aipMenuB" aria-label="Key and account" title="Key and account">&#x1F511;</button>' +
      '<button type="button" class="aip-x" id="aipX" aria-label="Close">&times;</button></div>' +
      '<div class="aip-menu" id="aipMenu" hidden><button type="button" id="aipChange">Change key</button><button type="button" id="aipRemove">Remove key</button><button type="button" id="aipOut">Sign out</button></div>' +
      // No key yet
      '<div class="aip-b" id="aipSetup" hidden>' +
        '<div class="aip-card"><div class="aip-step">1 · Get a key from your AI</div>' +
          '<div class="aip-prov"><div><b>ChatGPT</b><span>OpenAI · starts with sk-</span></div><a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Get a key ↗</a></div>' +
          '<div class="aip-prov"><div><b>Claude</b><span>Anthropic · starts with sk-ant-</span></div><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Get a key ↗</a></div>' +
          '<div class="aip-prov"><div><b>Gemini</b><span>Google · free to start</span></div><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a key ↗</a></div></div>' +
        '<form class="aip-card" id="aipKeyForm" novalidate><div class="aip-step">2 · Paste it here</div>' +
          '<div class="aip-row"><input id="aipKeyIn" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-…, sk-ant-… or AIza…" aria-label="Your AI key"><button class="aip-btn" id="aipSave" type="submit">Save</button></div>' +
          '<label class="aip-agree"><input type="checkbox" id="aipAgree"><span>I agree. ' + CONSENT_TEXT + '</span></label>' +
          '<p class="aip-note" id="aipMsg" role="status" aria-live="polite">Stays on this device. Sent only to the AI company it belongs to, never to DHQ. Usage is billed to your own AI account.</p>' +
          '<p class="aip-note">Tip: set a monthly spending limit on this key in your ChatGPT, Claude or Gemini account.</p></form>' +
      '</div>' +
      // Chat
      '<div class="aip-b" id="aipChat" hidden>' +
        '<p class="sub">Ask about any player, trade or start/sit. Your AI answers with DHQ\'s values, rankings and this week\'s DHQ projections.</p>' +
        '<div class="fmt" aria-label="Your league format"><span>Format:</span>' +
          '<select data-key="scoring" aria-label="Scoring"><option value="ppr">PPR</option><option value="half">Half-PPR</option><option value="std">Standard</option></select>' +
          '<select data-key="qb" aria-label="Quarterbacks"><option value="sf">Superflex</option><option value="1qb">1QB</option></select>' +
          '<select data-key="teams" aria-label="Teams"><option value="8">8 teams</option><option value="10">10 teams</option><option value="12">12 teams</option><option value="14">14 teams</option><option value="16">16 teams</option></select>' +
          '<select data-key="tep" aria-label="TE premium"><option value="0">No TE prem.</option><option value="1">TE premium</option></select></div>' +
        '<div class="log" id="askLog" aria-live="polite"></div>' +
        '<div class="chips" id="askChips">' +
          '<button class="chip" type="button" data-ask="Who are the top 10 dynasty wide receivers right now?">Top 10 dynasty WRs</button>' +
          '<button class="chip" type="button" data-ask="Which running backs does DHQ project highest this week?">Best RB projections this week</button>' +
          '<button class="chip" type="button" data-ask="Is Brock Bowers a buy, sell or hold in dynasty?">Brock Bowers: buy, sell or hold?</button>' +
          '<button class="chip" type="button" data-ask="Would trading Puka Nacua for a 2027 1st be fair?">Puka Nacua for a 2027 1st?</button></div>' +
        '<p class="aip-lg" id="aipLg">Have a league? <a href="#gate-title" id="aipToGate">Enter it in the DHQ War Room box</a> and your AI answers about your whole team too.</p>' +
      '</div>' +
      '<div class="aip-f" id="aipFoot" hidden><form class="aip-row" id="askForm" novalidate><input id="askIn" type="text" autocomplete="off" placeholder="Ask about any player…" aria-label="Your question"><button class="aip-btn" id="askBtn" type="submit">Ask</button></form></div>';
    document.body.appendChild(back); document.body.appendChild(el);
    $('aipX').addEventListener('click', close);
    $('aipMenuB').addEventListener('click', function () { $('aipMenu').hidden = !$('aipMenu').hidden; });
    $('aipChange').addEventListener('click', function () { $('aipMenu').hidden = true; show('setup', 'Paste the new key and tap Save. It replaces the old one.'); });
    $('aipRemove').addEventListener('click', function () {
      try { [MEMBER_KEY, OLD_KEY, OLD_PROV].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* nothing saved */ }
      $('aipMenu').hidden = true; show('setup', 'Removed from this device.');
    });
    $('aipOut').addEventListener('click', function () { location.href = 'landing.html?signout'; });
    // "Have a league?": close the box and go to the front page's War Room box.
    $('aipToGate').addEventListener('click', function (e) {
      var gate = document.querySelector('.fg-gate'), input = document.getElementById('league-key');
      if (!gate) return;
      e.preventDefault(); close();
      gate.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { try { if (input) input.focus({ preventScroll: true }); } catch (e2) { /* fine */ } }, 400);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) close(); });
    $('aipKeyForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var val = $('aipKeyIn').value, prov = providerOf(val), btn = $('aipSave');
      if (!prov) return say('That looks too short to be a key. Copy the whole key and paste it again.', true);
      if (!$('aipAgree').checked) return say('Tick the box to agree, then tap Save.', true);
      try { localStorage.setItem(CONSENT, JSON.stringify({ agreed: true, owner: owner(), at: Date.now() })); } catch (e2) { /* asked again in the app */ }
      btn.disabled = true; say('Checking your key with ' + LABEL[prov] + '…');
      checkKey(val, prov).then(function (ok) {
        btn.disabled = false;
        if (ok === 'bad') return say(LABEL[prov] + ' turned that key down. Copy it again from the key page and paste it here.', true);
        try {
          localStorage.setItem(MEMBER_KEY, JSON.stringify({ key: cleanKey(val), provider: prov, owner: owner(), at: Date.now() }));
          localStorage.removeItem(OLD_KEY); localStorage.removeItem(OLD_PROV);
        } catch (e3) { return say('This browser wouldn\'t store the key (private browsing?). Try a normal tab.', true); }
        $('aipKeyIn').value = '';
        visit('ai_key_saved', { provider: prov === 'gemini' ? 'google' : prov });   // which AI only, never the key
        show('chat', ok === 'ok' ? 'saved and working' : 'saved');
      });
    });
  }
  // Front Door tracking (js/shared/front-visit.js, when the page loads it).
  function visit(name, meta) { try { if (root.DHQVisit) root.DHQVisit.track(name, { module: 'tools', widget: 'ai', meta: meta }); } catch (e) { /* never in the way */ } }
  function say(t, bad) { var m = $('aipMsg'); m.textContent = t; m.classList.toggle('bad', !!bad); }
  function show(state, note) {
    var k = savedKey();
    $('aipSetup').hidden = state !== 'setup';
    $('aipChat').hidden = state !== 'chat';
    $('aipFoot').hidden = state !== 'chat';
    $('aipMenuB').hidden = !k;
    $('aipWho').textContent = k ? 'Your ' + LABEL[k.provider] + (note === 'saved and working' ? ' · connected ✓' : '') : '';
    if (state === 'setup') {
      $('aipAgree').checked = consentOk();
      if (note) say(note);
      setTimeout(function () { try { $('aipKeyIn').focus(); } catch (e) { /* fine */ } }, 50);
    } else if (k && root.DHQAskFree) {
      root.DHQAskFree.start({ key: k.key, provider: k.provider });
      try { var i = idn(); $('aipLg').hidden = !!(i && i.hasLeagueSource && i.hasLeagueSource()); } catch (e) { /* show it */ }
      setTimeout(function () { try { $('askIn').focus(); } catch (e) { /* fine */ } }, 50);
    }
  }
  function open() {
    if (!isMember()) return false;
    build(); markMember();
    try { sessionStorage.removeItem('dhq_ai_signup_v1'); } catch (e) { /* done with the AI sign-up */ }
    el.hidden = false; back.hidden = false;
    show(savedKey() ? 'chat' : 'setup');
    visit('ai_opened');
    return true;
  }
  function close() { if (el) { el.hidden = true; back.hidden = true; } }

  // The front page's AI buttons open the box for a member (before the page's
  // own handler would open the sign-up sheet). Everyone else signs up as before.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-ai-signup]');
    if (!b || !isMember()) return;
    e.preventDefault(); e.stopPropagation();
    open();
  }, true);
  // ?ai=1: open it on arrival (after an AI sign-up, or from an old link).
  function onArrive() {
    var q = new URLSearchParams(location.search);
    if (!q.has('ai')) return;
    if (open()) {
      q.delete('ai');
      try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString().replace(/=(&|$)/g, '$1') : '') + location.hash); } catch (e) { /* the URL keeps it */ }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onArrive); else onArrive();
  root.DHQAskPanel = { open: open, close: close, isMember: isMember };
})(window);
