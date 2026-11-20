// lab/my-ai/ask.js — Ask your AI with no league (owner ask 2026-11-17).
//
// A member with an AI key and no league asks about any NFL player. Their own
// AI (ChatGPT, Claude or Gemini, called straight from the browser with their
// key, exactly as the app's js/shared/ask-dhq.js does) answers using DHQ's
// numbers, looked up here:
//   - dynasty values and position ranks: the engine server's finished values
//     for the Lab's source league, refined to the member's format with the
//     same position factors and team-count curve as the Lab's Player Values
//     and Trade Calculator pages (lab/projections.html, lab/trade.html);
//   - this week's DHQ projection and its reasons: the Lab's weekly lock file
//     (data/locks/{season}-w{week}.json), rescored like those pages;
//   - season points: Sleeper's season stats in the member's scoring;
//   - trade grades: the shared App.TradeEngine fairnessGrade and acceptance
//     odds, as the Trade Calculator grades a deal with "Not sure" DNA.
// DHQ's projections only: never another site's (owner rule). Nothing here
// writes the answer itself and nothing goes to DHQ's servers.
//
// window.DHQAskFree.start({ key, provider }) wires the chat already in the page
// (#askLog, #askForm, #askIn, #askBtn, #askChips, the format selects .fmt select):
// the front page's Ask your AI box builds them (my-ai/panel.js).
(function (root) {
  'use strict';
  var SOURCE = { id: '1312100327931019264', teams: 16, qb: 'sf', scoring: 'half', tep: '0' };
  var VALUES_URL = 'https://hovnqztlbsgsywrbidbh.supabase.co/functions/v1/dhq-league?league=' + SOURCE.id;
  var PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
  var STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
  var SEASON = 2026, STATS_URL = 'https://api.sleeper.app/v1/stats/nfl/regular/' + SEASON;
  var LEAGUE_URL = 'https://api.sleeper.app/v1/league/' + SOURCE.id;
  // Caches shared with the Lab's Player Values / Trade pages: same keys, same shapes.
  var PLAYERS_KEY = 'dhq_tc_players_v1', STATS_KEY = 'dhq_tc_stats_v2', PREF_KEY = 'dhq_tc_league_v1', IDPR_KEY = 'dhq_tc_idp_rules_v1';
  // This page's own, richer slice of the values feed.
  var FEED_KEY = 'dhq_ai_feed_v1';
  var FEED_TTL = 3 * 3600e3, PLAYERS_TTL = 3 * 86400e3, STATS_TTL = 6 * 3600e3;
  var MAX = 10000, NEXT_DRAFT = 2027;
  var IDP = { DL: 1, LB: 1, DB: 1 };
  var POS_LIST = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];
  var PROVIDERS = {
    openai: { label: 'ChatGPT', model: 'gpt-5.4-mini' },
    anthropic: { label: 'Claude', model: 'claude-haiku-5-5' },
    gemini: { label: 'Gemini', model: 'gemini-flash-latest' }
  };

  function $(id) { return document.getElementById(id); }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked: run without */ } }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  var round1 = function (n) { return Math.round(n * 10) / 10; };
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[’'.]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); };

  // ── Format (shared with the Lab's tools) ────────────────────────────────
  var S = { scoring: 'ppr', qb: 'sf', tep: '0', teams: '12', idp: '0' };
  Object.assign(S, load(PREF_KEY) || {});
  function formatName() {
    return S.teams + '-team ' + (S.qb === 'sf' ? 'Superflex' : '1QB') + ', ' + { ppr: 'PPR', half: 'Half-PPR', std: 'Standard' }[S.scoring] + (S.tep === '1' ? ', TE premium' : '');
  }
  function isEstimated() { return S.scoring !== SOURCE.scoring || S.qb !== SOURCE.qb || S.tep !== SOURCE.tep || Number(S.teams) !== SOURCE.teams; }

  // ── Values: the Player Values page's refinement, word for word ──────────
  function factor(pos, base) {
    var f = 1;
    var sc = { ppr: { RB: 1.03, WR: 1.06, TE: 1.06 }, half: {}, std: { RB: 0.98, WR: 0.93, TE: 0.93 } };
    f *= (sc[S.scoring][pos] || 1);
    if (S.qb === '1qb' && pos === 'QB') f *= 0.42 + 0.22 * Math.min(1, base / 8000);
    if (S.tep === '1' && pos === 'TE') f *= 1.15;
    return f;
  }
  function teamsCurve(v) { var k = 1 + (SOURCE.teams - Number(S.teams)) * 0.025; return MAX * Math.pow(Math.max(0, v) / MAX, k); }
  function playerValue(pid) {
    var r = FEED && FEED.p[pid]; if (!r) return 0;
    return Math.round(Math.min(MAX - 1, teamsCurve(r[0] * factor(posOf(pid), r[0]))));
  }
  var SLOT = { early: 0.15, mid: 0.5, late: 0.85 };
  function pickValue(p) {
    if (!FEED) return 0;
    var within = Math.max(1, Math.round(SLOT[p.slot] * SOURCE.teams));
    var v = FEED.picks[(p.round - 1) * SOURCE.teams + within] || 0;
    return Math.round(v * Math.pow(0.88, Math.max(0, p.year - NEXT_DRAFT)));
  }

  // ── Data (loaded once, on the first question) ───────────────────────────
  var FEED = null;      // { built, week, p: { pid: [value, age, feedProjMedian, ppg, phase, peakYrsLeft, role, statusReason, pos, careerPPG, lastYearPPG] }, picks }
  var PLAYERS = null;   // { pid: [name, pos, team] }
  var STATS = {};       // { pid: [ppr, half, std, gp, rec, idpLine] }
  var IDPR = {};
  var WK = null;        // this week's lock: { week, info, dhq, lg }
  var loading = null;
  function slimFeed(d) {
    var I = d.intel || {}, ps = I.playerScores || {}, pm = I.playerMeta || {}, pj = (d.dhq_proj && d.dhq_proj.players) || {};
    var out = { built: d.built_at, week: d.dhq_proj && d.dhq_proj.week, p: {}, picks: {} };
    Object.keys(ps).forEach(function (pid) {
      var v = ps[pid]; if (!(v > 0)) return;
      var m = pm[pid] || {}, j = pj[pid] || {};
      out.p[pid] = [v, m.age || null, (j.no_line || j.median == null) ? null : round1(j.median), m.ppg != null ? m.ppg : null,
        m.ageCurvePhase || '', m.peakYrsLeft != null ? m.peakYrsLeft : null, m.roleLabel || '', m.statusReason || '', m.pos || '',
        m.careerPPG != null ? m.careerPPG : null, m.lastYearPPG != null ? m.lastYearPPG : null];
    });
    var pv = I.dhqPickValues || {};
    Object.keys(pv).forEach(function (n) { if (pv[n] && pv[n].value > 0) out.picks[n] = pv[n].value; });
    return out;
  }
  function slimPlayers(all, keep) {
    var out = {};
    Object.keys(keep).forEach(function (pid) {
      var p = all[pid]; if (!p) return;
      var name = p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
      var pos = p.position || (p.fantasy_positions && p.fantasy_positions[0]) || '';
      if (pos === 'DE' || pos === 'DT') pos = 'DL'; else if (pos === 'CB' || pos === 'S') pos = 'DB'; else if (pos === 'ILB' || pos === 'OLB') pos = 'LB';
      out[pid] = [name, pos, p.team || 'FA'];
    });
    return out;
  }
  function isDefKey(k) { return /^idp_/.test(k) || /^bonus_(tkl|sack|def)_/.test(k); }
  function defLine(l) { var o = {}; Object.keys(l || {}).forEach(function (k) { if (isDefKey(k) && l[k]) o[k] = l[k]; }); return o; }
  function idpPts(line) { var t = 0; for (var k in IDPR) if (line && line[k]) t += line[k] * IDPR[k]; return t; }
  function loadIdpRules() {
    var c = load(IDPR_KEY);
    if (c && c.rules && Date.now() - c.ts < 86400e3) { IDPR = c.rules; return Promise.resolve(); }
    return getJSON(LEAGUE_URL).then(function (lg) {
      var r = defLine(lg && lg.scoring_settings);
      if (Object.keys(r).length) { IDPR = r; store(IDPR_KEY, { ts: Date.now(), rules: r }); }
    }).catch(function () { if (c && c.rules) IDPR = c.rules; });
  }
  function posOf(pid) { return (PLAYERS && PLAYERS[pid] && PLAYERS[pid][1]) || (FEED && FEED.p[pid] && FEED.p[pid][8]) || ''; }
  var OFF_RULES = ['pass_yd', 'pass_td', 'pass_int', 'pass_2pt', 'rush_yd', 'rush_td', 'rush_2pt', 'rec_yd', 'rec_td', 'rec_2pt', 'fum_lost'];
  var REC_POS = { RB: 1, WR: 1, TE: 1, QB: 1 }, REC_PTS = { ppr: 1, half: 0.5, std: 0 };
  // One Half-PPR number { h, r } in the member's scoring, as the Lab pages do it.
  function pts(o, pos) { if (o == null) return null; return o.h + (REC_PTS[S.scoring] - 0.5) * o.r + (S.tep === '1' && pos === 'TE' ? 0.5 * o.r : 0); }
  function loadWeek() {
    return getJSON(STATE_URL).then(function (st) {
      var wk = st && st.week, yr = (st && st.season) || SEASON;
      if (!wk || st.season_type !== 'regular') return null;
      return getJSON((/(^|\.)dhq-lab\.pages\.dev$/.test(location.hostname) ? 'data/locks/' : 'https://dhq-lab.pages.dev/data/locks/') + yr + '-w' + wk + '.json').then(function (d) {
        var half = (d.scorings && d.scorings.half) || {}, rules = half.scoring || {}, hp = half.players || {};
        var w = { week: wk, info: d.players || {}, dhq: {}, lg: {} }, pprSet = null;
        Object.keys(d.scorings || {}).forEach(function (k) {
          var sc = d.scorings[k].scoring || {}; if (pprSet || sc.rec !== 1 || sc.bonus_rec_te) return;
          if (OFF_RULES.every(function (x) { return (sc[x] || 0) === (rules[x] || 0); })) pprSet = d.scorings[k].players || {};
        });
        Object.keys(hp).forEach(function (pid) {
          var r = hp[pid], q = pprSet && pprSet[pid], pos = (w.info[pid] || {}).pos;
          if (r && r[0] != null) w.dhq[pid] = { h: r[0], r: REC_POS[pos] && q && q[0] != null ? Math.max(0, 2 * (q[0] - r[0])) : 0 };
        });
        var lgSet = d.scorings && d.scorings['league_' + SOURCE.id];
        if (lgSet && lgSet.players) Object.keys(lgSet.players).forEach(function (pid) {
          var r = lgSet.players[pid]; if (r && r[0] != null && IDP[(w.info[pid] || {}).pos]) w.lg[pid] = { h: r[0], r: 0 };
        });
        return w;
      });
    }).catch(function () { return null; });
  }
  function loadAll() {
    if (loading) return loading;
    var now = Date.now(), cf = load(FEED_KEY), cp = load(PLAYERS_KEY);
    var fP = (cf && now - cf.ts < FEED_TTL) ? Promise.resolve(cf.data)
      : getJSON(VALUES_URL).then(function (d) { var s = slimFeed(d); store(FEED_KEY, { ts: now, data: s }); return s; })
        .catch(function (e) { if (cf) return cf.data; throw e; });
    loading = fP.then(function (feed) {
      FEED = feed;
      var have = cp && now - cp.ts < PLAYERS_TTL && Object.keys(feed.p).every(function (pid) { return cp.data[pid]; });
      if (have) return cp.data;
      return getJSON(PLAYERS_URL).then(function (all) { var s = slimPlayers(all, feed.p); store(PLAYERS_KEY, { ts: now, data: s }); return s; })
        .catch(function (e) { if (cp) return cp.data; throw e; });
    }).then(function (pl) {
      PLAYERS = pl;
      var cs = load(STATS_KEY);
      var sP = (cs && now - cs.ts < STATS_TTL) ? Promise.resolve(cs.data)
        : getJSON(STATS_URL).then(function (all) {
            var out = {}; Object.keys(FEED.p).forEach(function (pid) { var r = all[pid]; if (r && r.gp > 0) out[pid] = [r.pts_ppr || 0, r.pts_half_ppr || 0, r.pts_std || 0, r.gp, r.rec || 0, IDP[(PLAYERS[pid] || [])[1]] ? defLine(r) : 0]; });
            store(STATS_KEY, { ts: Date.now(), data: out }); return out;
          }).catch(function () { return cs ? cs.data : {}; });
      return Promise.all([sP, loadIdpRules(), loadWeek()]);
    }).then(function (res) { STATS = res[0] || {}; WK = res[2]; return true; });
    loading.catch(function () { loading = null; });
    return loading;
  }

  // ── Lookups the AI can run ──────────────────────────────────────────────
  function nameOf(pid) { return (PLAYERS[pid] || [])[0] || ('Player ' + pid); }
  function teamOf(pid) { var i = WK && WK.info[pid]; return (i && i.team) || (PLAYERS[pid] || [])[2] || 'FA'; }
  function season(pid, pos) {
    var r = STATS[pid]; if (!r) return null;
    var p = r[{ ppr: 0, half: 1, std: 2 }[S.scoring]] + (S.tep === '1' && pos === 'TE' ? 0.5 * r[4] : 0) + (IDP[pos] ? idpPts(r[5]) : 0);
    return { points: round1(p), games: r[3], per_game: r[3] ? round1(p / r[3]) : 0 };
  }
  function thisWeek(pid, pos) {
    if (WK) {
      var i = WK.info[pid] || {}, o = IDP[pos] && WK.lg[pid] ? WK.lg[pid] : WK.dhq[pid];
      var bye = /bye week/i.test(i.why || '') && !(o && o.h > 0);
      return { nfl_week: WK.week, opponent: i.opp || null, on_bye: bye, injury: i.inj || null,
        dhq_projection: bye || !o ? null : round1(pts(o, pos)), dhq_call: i.verdict || null, matchup_grade: i.grade || null,
        why: i.why ? String(i.why).slice(0, 600) : null };
    }
    return { nfl_week: null, dhq_projection: null, note: "This week's projections are not available right now." };
  }
  var RANK = {};   // position ranks by value, per format
  function ranks() {
    var key = [S.scoring, S.qb, S.tep, S.teams].join('|');
    if (RANK.key === key) return RANK;
    var byPos = {}, all = [];
    Object.keys(FEED.p).forEach(function (pid) {
      if (!PLAYERS[pid] || !PLAYERS[pid][2] || PLAYERS[pid][2] === 'FA') return;
      var pos = posOf(pid), v = playerValue(pid); if (!v) return;
      (byPos[pos] = byPos[pos] || []).push([pid, v]); if (!IDP[pos] && pos !== 'K') all.push([pid, v]);
    });
    RANK = { key: key, pos: {}, overall: {}, lists: byPos };
    Object.keys(byPos).forEach(function (p) { byPos[p].sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x, i) { RANK.pos[x[0]] = i + 1; }); });
    all.sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x, i) { RANK.overall[x[0]] = i + 1; });
    return RANK;
  }
  function card(pid) {
    var r = FEED.p[pid] || [], pos = posOf(pid), R = ranks();
    return {
      name: nameOf(pid), position: pos, team: teamOf(pid), age: r[1] || null,
      dhq_value: playerValue(pid), position_rank: R.pos[pid] ? pos + R.pos[pid] : null, overall_rank_offense: R.overall[pid] || null,
      dynasty: { age_curve_phase: r[4] || null, peak_years_left: r[5], role: r[6] || null, status_note: r[7] || null, career_ppg: r[9], last_season_ppg: r[10] },
      this_season: season(pid, pos),
      this_week: thisWeek(pid, pos)
    };
  }
  var INDEX = null;
  function index() {
    if (INDEX) return INDEX;
    INDEX = Object.keys(FEED.p).filter(function (pid) { return PLAYERS[pid]; }).map(function (pid) {
      var n = norm(PLAYERS[pid][0]); return { pid: pid, n: n, last: n.split(' ').slice(-1)[0], on: PLAYERS[pid][2] && PLAYERS[pid][2] !== 'FA', v: FEED.p[pid][0] };
    });
    return INDEX;
  }
  function find(name) {
    var q = norm(name); if (!q) return { matches: [] };
    var ix = index(), exact = ix.filter(function (x) { return x.n === q; });
    if (!exact.length) exact = ix.filter(function (x) { return x.last === q; });
    if (!exact.length) exact = ix.filter(function (x) { return x.n.indexOf(q) >= 0 || q.indexOf(x.n) >= 0; });
    if (!exact.length) { var parts = q.split(' '); exact = ix.filter(function (x) { return parts.every(function (p) { return x.n.indexOf(p) >= 0; }); }); }
    exact.sort(function (a, b) { return (b.on - a.on) || (b.v - a.v); });
    return { matches: exact.slice(0, 4).map(function (x) { return x.pid; }) };
  }
  var PICK_RE = /\b(20\d\d)\s*(?:round\s*)?(1st|2nd|3rd|4th|first|second|third|fourth|[1-4])\b(?:\s*(?:round)?)?(?:\s*\(?\s*(early|mid|middle|late)\)?)?/i;
  function parsePick(s) {
    var m = PICK_RE.exec(String(s || '')); if (!m) return null;
    var rd = { '1st': 1, first: 1, '1': 1, '2nd': 2, second: 2, '2': 2, '3rd': 3, third: 3, '3': 3, '4th': 4, fourth: 4, '4': 4 }[m[2].toLowerCase()];
    var slot = (m[3] || 'mid').toLowerCase(); if (slot === 'middle') slot = 'mid';
    var year = Math.max(NEXT_DRAFT, Number(m[1]));
    return { year: year, round: rd, slot: slot, label: year + ' ' + ['', '1st', '2nd', '3rd', '4th'][rd] + ' (' + slot + ')' };
  }
  var TOOLS = [
    { name: 'lookup_players', description: "Look up NFL players by name: DHQ dynasty value and position rank in the member's format, age and dynasty outlook, this season's points, and this week's DHQ projection with its opponent, injury and the reasons behind it. Use it for any question about specific players (outlook, buy/sell/hold, start/sit between named players, comparisons).",
      parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' }, description: 'Player names, 1 to 8' } }, required: ['names'] } },
    { name: 'rankings', description: "DHQ's rankings: the top players at a position (or all offense) by dynasty value, this week's DHQ projection, or points per game this season, in the member's format.",
      parameters: { type: 'object', properties: { position: { type: 'string', enum: ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'] }, sort_by: { type: 'string', enum: ['dynasty_value', 'this_week_projection', 'points_per_game'] }, limit: { type: 'integer', description: '1 to 30, default 10' }, max_age: { type: 'integer', description: 'Only players this age or younger (optional)' } }, required: ['position'] } },
    { name: 'grade_trade', description: "Grade a dynasty trade with DHQ's trade engine (the Trade Calculator's math): the value of each side in the member's format, a fairness grade and the odds the other manager accepts. Pieces are player names or draft picks written like '2027 1st' or '2028 2nd late'.",
      parameters: { type: 'object', properties: { give: { type: 'array', items: { type: 'string' }, description: 'What the member gives' }, get: { type: 'array', items: { type: 'string' }, description: 'What the member gets' } }, required: ['give', 'get'] } }
  ];
  function run(name, a) {
    a = a || {};
    return loadAll().then(function () {
      if (name === 'lookup_players') {
        var names = (Array.isArray(a.names) ? a.names : [a.names]).filter(Boolean).slice(0, 8);
        return { format: formatName(), values_estimated_for_format: isEstimated(), players: names.map(function (n) {
          var f = find(n);
          if (!f.matches.length) return { asked: n, found: false, note: 'No player by that name in DHQ\'s player list.' };
          var c = card(f.matches[0]); c.asked = n;
          if (f.matches.length > 1) c.other_matches = f.matches.slice(1).map(function (pid) { return nameOf(pid) + ' (' + posOf(pid) + ', ' + teamOf(pid) + ')'; });
          return c;
        }) };
      }
      if (name === 'rankings') {
        var pos = String(a.position || 'ALL').toUpperCase(), by = a.sort_by || 'dynasty_value', lim = Math.max(1, Math.min(30, Number(a.limit) || 10));
        var R = ranks(), pool = [];
        (pos === 'ALL' ? ['QB', 'RB', 'WR', 'TE'] : [pos]).forEach(function (p) { (R.lists[p] || []).forEach(function (x) { pool.push(x[0]); }); });
        if (a.max_age) pool = pool.filter(function (pid) { var g = FEED.p[pid][1]; return g && g <= Number(a.max_age); });
        var key = function (pid) {
          var p = posOf(pid);
          if (by === 'this_week_projection') { var t = thisWeek(pid, p); return t.dhq_projection == null ? -1 : t.dhq_projection; }
          if (by === 'points_per_game') { var z = season(pid, p); return z && z.games >= 3 ? z.per_game : -1; }
          return playerValue(pid);
        };
        pool.sort(function (x, y) { return key(y) - key(x); });
        return { format: formatName(), sorted_by: by, nfl_week: WK ? WK.week : null, players: pool.slice(0, lim).map(function (pid, i) {
          var p = posOf(pid), z = season(pid, p), t = thisWeek(pid, p);
          return { rank: i + 1, name: nameOf(pid), position: p, team: teamOf(pid), age: FEED.p[pid][1], dhq_value: playerValue(pid), position_rank: R.pos[pid] ? p + R.pos[pid] : null,
            per_game: z ? z.per_game : null, this_week_dhq_projection: t.dhq_projection, opponent: t.opponent || null, injury: t.injury || null };
        }) };
      }
      if (name === 'grade_trade') {
        var E = root.App && root.App.TradeEngine;
        var side = function (list) {
          return (Array.isArray(list) ? list : [list]).filter(Boolean).slice(0, 8).map(function (s) {
            var pk = parsePick(s); if (pk) return { piece: pk.label, kind: 'pick', dhq_value: pickValue(pk) };
            var f = find(s); if (!f.matches.length) return { piece: s, found: false, dhq_value: 0 };
            var pid = f.matches[0]; return { piece: nameOf(pid) + ' (' + posOf(pid) + ', ' + teamOf(pid) + ')', kind: 'player', age: FEED.p[pid][1], dhq_value: playerValue(pid) };
          });
        };
        var give = side(a.give), get = side(a.get);
        var tg = give.reduce(function (s, x) { return s + x.dhq_value; }, 0), tt = get.reduce(function (s, x) { return s + x.dhq_value; }, 0);
        var out = { format: formatName(), you_give: give, you_get: get, give_total: tg, get_total: tt, difference_for_you: tt - tg };
        if (E) {
          var taxes = E.calcPsychTaxes(null, null, 'NONE', E.calcOwnerPosture(null, 'NONE'));
          var g = E.fairnessGrade(tg, tt), odds = (tg > 0 || tt > 0) ? E.calcAcceptanceLikelihood(tg, tt, 'NONE', taxes, null, null, { totalPieces: give.length + get.length }) : 50;
          var good = ['A+', 'A', 'B+', 'B'].indexOf(g.grade) > -1, call;
          if (good && odds >= 50) call = 'Send it: good value for you and they should bite.';
          else if (!good && (g.grade === 'D' || g.grade === 'F')) call = 'Pass: you are overpaying. Ask for more back or walk away.';
          else if (good && odds < 20) call = 'Counter: great for you, but a tough deal to pull off as built.';
          else if (odds < 20) call = 'Pass: a tough deal to pull off as built, and it does not help you enough to chase.';
          else call = good ? 'Counter: fair for you, but they will probably say no. Sweeten it a little.' : 'Counter: close. A small tweak gets this to fair.';
          out.grade_for_you = g.grade; out.grade_label = g.label || null; out.odds_they_accept_pct = Math.round(odds); out.dhq_call = call;
        }
        if (give.concat(get).some(function (x) { return x.found === false; })) out.note = 'Some pieces were not found; check the names.';
        return out;
      }
      return { error: 'Unknown lookup.' };
    }).catch(function () { return { error: "DHQ's numbers didn't load. Check the connection and ask again." }; });
  }

  // ── The member's AI ─────────────────────────────────────────────────────
  var PERSONA = [
    "You are the member's own fantasy football sidekick inside Dynasty HQ. You know ball and you are fun to talk to: sharp, quick, a little funny, honest. Think the smartest friend in their league chat.",
    "Talk like a person, not a report: answer first, then the why with the key numbers. Short paragraphs; a quick list only when it really helps. Match the question: a quick question gets a quick answer. Follow-ups are welcome.",
    "The member has not connected a league here. You answer about any NFL player using DHQ's numbers from your lookups: dynasty values and rankings, this week's DHQ projections and the reasons behind them, this season's points, and trade grades. If they ask about their own team, roster, matchup, standings or leaguemates, you can't see those: ask them to name the players and you'll look them up, and mention once that adding their league in Dynasty HQ lets you answer about their whole team.",
    "Facts come from your lookups. Never guess a player, number, team, age or projection: if a lookup or search didn't tell you, you don't know it, and you say so in a sentence. Look players up before you talk about them.",
    "For news (injuries, depth charts, coaching, trades) use web search when you have it and name the outlet in a few words.",
    "Two kinds of numbers: dhq_value is long-term dynasty trade value (about 7,000+ elite, 4,000+ starter, 2,000+ depth, below that a stash); this week's DHQ projection and this season's points are for lineup calls. Don't mix them. For start/sit, lead with DHQ's projections for this week and their reasons, then the injury and matchup; a close call is a close call, so give the tiebreak.",
    "Every projection is DHQ's: say it as \"DHQ projects him for X points\". Never quote, cite or mention Sleeper's, ESPN's, CBS's or any other site's projections or trade values (no KeepTradeCut, FantasyCalc or ADP-based values), even if you find them on the web.",
    "Trades: grade a deal with the trade lookup and lead with its call. Never say nothing works; say it'll be a tough deal to pull off and lay out the realistic paths. Quality over quantity: two or three lesser pieces never buy one star. Don't write off a top player because of age.",
    "Values are for the member's format (it's in each lookup). If they say their league is a different format, tell them to switch the format buttons above the chat so the numbers match.",
    "Don't mention tools, lookups, DHQ's data or how you looked things up. Just answer."
  ].join('\n\n');
  function header() {
    var today = ''; try { today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { /* plain */ }
    return 'Today is ' + today + '. NFL season ' + SEASON + (WK ? ', week ' + WK.week : '') + ". The member's format: " + formatName() + '.';
  }
  var MAX_STEPS = 6, chat = [], CHAT_TURNS = 6;
  var clip = function (o) { var s = ''; try { s = JSON.stringify(o); } catch (e) { s = '{"error":"unreadable"}'; } return s.length > 20000 ? s.slice(0, 20000) + '…(trimmed)' : s; };
  var WORDS = { lookup_players: 'players', rankings: 'rankings', grade_trade: 'trade grade', web_search: 'news' };
  function ask(K, question, onStep) {
    var model = PROVIDERS[K.provider].model, label = PROVIDERS[K.provider].label;
    var ctl = root.AbortController ? new root.AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 120000) : null;
    var sources = [], step = function (n) { if (onStep) onStep(WORDS[n] || n); };
    var tool = function (n, a) { step(n); return run(n, a); };
    var post = function (url, headers, body) { return fetch(url, { method: 'POST', signal: ctl && ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) }); };
    var fail = function (r, j) {
      var detail = (j && j.error && (j.error.message || (typeof j.error === 'string' ? j.error : ''))) || '';
      if (r.status === 401) return { ok: false, badKey: true, error: label + ' turned your key down' + (detail ? ' (' + String(detail).slice(0, 160) + ')' : '') + '. Tap the key button at the top, choose Change key and paste a new one.' };
      return { ok: false, error: (r.status === 429 ? label + ' says this key is out of quota or busy right now' : label + ' had a problem (' + r.status + ')') + (detail ? ': ' + String(detail).slice(0, 200) : '') + '.' };
    };
    var system = PERSONA + '\n\n' + header();
    var go;
    if (K.provider === 'anthropic') go = (async function () {
      var H = { 'x-api-key': K.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
      var tools = TOOLS.map(function (d) { return { name: d.name, description: d.description, input_schema: d.parameters }; });
      var search = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
      var messages = chat.flatMap(function (t) { return [{ role: 'user', content: t.q }, { role: 'assistant', content: t.a }]; }).concat([{ role: 'user', content: question }]);
      var withSearch = true;
      for (var i = 0; i <= MAX_STEPS; i++) {
        var body = { model: model, max_tokens: 4000, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: messages, tools: withSearch ? tools.concat(search) : tools };
        if (i === MAX_STEPS) delete body.tools;
        var r = await post('https://api.anthropic.com/v1/messages', H, body), j = await r.json().catch(function () { return {}; });
        if (!r.ok && r.status === 400 && withSearch && /web.?search|tool/i.test(JSON.stringify(j))) { withSearch = false; i--; continue; }
        if (!r.ok) return fail(r, j);
        var blocks = j.content || [];
        blocks.forEach(function (c) { if (c.type === 'web_search_tool_result' && Array.isArray(c.content)) c.content.forEach(function (x) { if (x.url) sources.push({ url: x.url, title: x.title }); }); if (c.type === 'server_tool_use') step('web_search'); });
        messages.push({ role: 'assistant', content: blocks });
        if (j.stop_reason === 'pause_turn') continue;
        var calls = blocks.filter(function (c) { return c.type === 'tool_use'; });
        if (j.stop_reason !== 'tool_use' || !calls.length) return { ok: true, text: blocks.filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text || ''; }).join('') };
        var results = await Promise.all(calls.map(async function (c) { return { type: 'tool_result', tool_use_id: c.id, content: clip(await tool(c.name, c.input)) }; }));
        messages.push({ role: 'user', content: results });
      }
      return { ok: false, error: label + " didn't finish an answer. Try asking a shorter question." };
    })();
    else if (K.provider === 'gemini') go = (async function () {
      var decl = TOOLS.map(function (d) { return { name: d.name, description: d.description, parameters: d.parameters }; });
      decl.push({ name: 'web_search', description: 'Search the web for current NFL news, injuries, coaching or depth charts.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } });
      var contents = chat.flatMap(function (t) { return [{ role: 'user', parts: [{ text: t.q }] }, { role: 'model', parts: [{ text: t.a }] }]; }).concat([{ role: 'user', parts: [{ text: question }] }]);
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', H = { 'x-goog-api-key': K.key };
      var googleSearch = async function (q) {
        step('web_search');
        var r = await post(url, H, { contents: [{ role: 'user', parts: [{ text: 'Search the web and summarize the most recent, relevant facts with outlet names and dates: ' + q }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 1500 } });
        var j = await r.json().catch(function () { return {}; }), cand = (j.candidates || [])[0] || {};
        (((cand.groundingMetadata || {}).groundingChunks) || []).forEach(function (g) { if (g.web && g.web.uri) sources.push({ url: g.web.uri, title: g.web.title }); });
        return r.ok ? { summary: ((cand.content || {}).parts || []).map(function (p) { return p.text || ''; }).join('') } : { error: 'search unavailable' };
      };
      for (var i = 0; i <= MAX_STEPS; i++) {
        var body = { systemInstruction: { parts: [{ text: system }] }, contents: contents, generationConfig: { maxOutputTokens: 3000 } };
        if (i < MAX_STEPS) body.tools = [{ functionDeclarations: decl }];
        var r = await post(url, H, body), j = await r.json().catch(function () { return {}; });
        if (!r.ok) return fail(r, j);
        var content = ((j.candidates || [])[0] || {}).content || { role: 'model', parts: [] }, parts = content.parts || [];
        contents.push({ role: 'model', parts: parts });
        var calls = parts.filter(function (p) { return p.functionCall; });
        if (!calls.length) return { ok: true, text: parts.map(function (p) { return p.text || ''; }).join('') };
        var replies = await Promise.all(calls.map(async function (p) {
          var fc = p.functionCall, res = fc.name === 'web_search' ? await googleSearch((fc.args || {}).query || '') : JSON.parse(clip(await tool(fc.name, fc.args || {})));
          return { functionResponse: { name: fc.name, response: { result: res } } };
        }));
        contents.push({ role: 'user', parts: replies });
      }
      return { ok: false, error: label + " didn't finish an answer. Try asking a shorter question." };
    })();
    else go = (async function () {
      var H = { Authorization: 'Bearer ' + K.key };
      var tools = TOOLS.map(function (d) { return { type: 'function', name: d.name, description: d.description, parameters: d.parameters }; });
      var input = chat.flatMap(function (t) { return [{ role: 'user', content: t.q }, { role: 'assistant', content: t.a }]; }).concat([{ role: 'user', content: question }]);
      var prev = null, withSearch = true;
      for (var i = 0; i <= MAX_STEPS; i++) {
        var body = { model: model, instructions: system, input: input, max_output_tokens: 3000 };
        if (prev) body.previous_response_id = prev;
        if (i < MAX_STEPS) body.tools = withSearch ? tools.concat([{ type: 'web_search' }]) : tools;
        var r = await post('https://api.openai.com/v1/responses', H, body), j = await r.json().catch(function () { return {}; });
        if (!r.ok && r.status === 400 && withSearch && /web_search/i.test(JSON.stringify(j))) { withSearch = false; i--; continue; }
        if (!r.ok) return fail(r, j);
        var out = j.output || [];
        out.forEach(function (o) { if (o.type === 'web_search_call') step('web_search'); (o.content || []).forEach(function (c) { (c.annotations || []).forEach(function (a) { if (a.url) sources.push({ url: a.url, title: a.title }); }); }); });
        var calls = out.filter(function (o) { return o.type === 'function_call'; });
        if (!calls.length) return { ok: true, text: typeof j.output_text === 'string' && j.output_text ? j.output_text : out.flatMap(function (o) { return (o.content || []).filter(function (c) { return c.type === 'output_text'; }).map(function (c) { return c.text || ''; }); }).join('') };
        prev = j.id;
        input = await Promise.all(calls.map(async function (c) { var a = {}; try { a = JSON.parse(c.arguments || '{}'); } catch (e) { /* none */ } return { type: 'function_call_output', call_id: c.call_id, output: clip(await tool(c.name, a)) }; }));
      }
      return { ok: false, error: label + " didn't finish an answer. Try asking a shorter question." };
    })();
    return go.then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.ok) {
        res.text = String(res.text || '').trim();
        if (!res.text) return { ok: false, error: label + ' sent back an empty answer. Ask again.' };
        chat.push({ q: question, a: res.text }); if (chat.length > CHAT_TURNS) chat.shift();
        var seen = {}; res.sources = sources.filter(function (x) { var k = String(x.url).split('#')[0]; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 4);
      }
      return res;
    }, function () { if (timer) clearTimeout(timer); return { ok: false, error: "Couldn't reach " + label + '. Check your connection and ask again.' }; });
  }

  // ── The chat on the page ────────────────────────────────────────────────
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // A little Markdown: paragraphs, **bold**, bullet / numbered lists.
  function md(t) {
    var html = '', list = null;
    String(t).split(/\n/).forEach(function (line) {
      var b = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      var inline = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/^#{1,4}\s*/, ''); };
      if (b) { if (!list) { html += '<ul>'; list = true; } html += '<li>' + inline(b[1]) + '</li>'; return; }
      if (list) { html += '</ul>'; list = null; }
      if (line.trim()) html += '<p>' + inline(line.trim()) + '</p>';
    });
    if (list) html += '</ul>';
    return html;
  }
  var KEY = null, busy = false, wired = false;
  function add(cls, html) { var d = document.createElement('div'); d.className = 'msgline ' + cls; d.innerHTML = html; $('askLog').appendChild(d); d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return d; }
  function submit(q) {
    q = String(q || '').trim(); if (!q || busy || !KEY) return;
    busy = true; $('askBtn').disabled = true; $('askIn').value = '';
    try { if (root.DHQVisit) root.DHQVisit.track('ai_asked', { module: 'tools', widget: 'ai' }); } catch (e) { /* no text is ever sent */ }
    add('me', esc(q));
    $('askChips').hidden = true;   // the examples step aside once the chat starts
    var wait = add('ai pending', '<span class="dots">Thinking</span>'), seen = [];
    var onStep = function (w) { if (seen.indexOf(w) < 0) seen.push(w); wait.innerHTML = '<span class="dots">Looking up ' + esc(seen.join(', ')) + '</span>'; };
    ask(KEY, q, onStep).then(function (res) {
      wait.classList.remove('pending');
      if (!res.ok) { wait.classList.add('err'); wait.innerHTML = '<p>' + esc(res.error) + '</p>'; }
      else {
        wait.innerHTML = md(res.text) + (res.sources && res.sources.length ? '<div class="src">Sources: ' + res.sources.map(function (s) { var host = ''; try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch (e) { host = 'link'; } return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(host) + '</a>'; }).join(' · ') + '</div>' : '');
      }
      busy = false; $('askBtn').disabled = false; $('askIn').focus();
    });
  }
  function syncFormat() { document.querySelectorAll('.fmt select').forEach(function (sel) { sel.value = S[sel.dataset.key]; }); }
  function start(K) {
    KEY = K;
    if (wired) return;
    wired = true;
    syncFormat();
    document.querySelectorAll('.fmt select').forEach(function (sel) {
      sel.addEventListener('change', function () { S[sel.dataset.key] = sel.value; store(PREF_KEY, S); });
    });
    $('askForm').addEventListener('submit', function (e) { e.preventDefault(); submit($('askIn').value); });
    document.querySelectorAll('[data-ask]').forEach(function (b) { b.addEventListener('click', function () { submit(b.getAttribute('data-ask')); }); });
    loadAll().catch(function () { /* the first question says so */ });
  }
  root.DHQAskFree = { start: start, run: run, _ask: ask, _format: function () { return S; } };
})(window);
