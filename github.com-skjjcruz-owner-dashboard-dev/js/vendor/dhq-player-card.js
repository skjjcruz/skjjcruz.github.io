/*! DHQ Player Card · drop-in module · dhq-player-card.js (+ dhq-player-card.css) */
(function () {
  'use strict';
  if (window.DHQPlayerCard) return; // loaded twice: keep the first copy
  /* ══════════════════════════════════════════════════════════════════════
     DHQ PLAYER CARD (module, 2026-11-16; Lab mockup 2026-11-15)
     1.2.0 (2026-11-16): kickers (K) and individual defenders (IDP: DL / LB / DB)
     get their own cards; the offense (QB / RB / WR / TE) is unchanged.

     One global, nothing else leaks:
       DHQPlayerCard.open(pid, opts)  → Promise<boolean> (true = card shown)
       DHQPlayerCard.close()
       DHQPlayerCard.setLeague(on)    show / hide the league bits on the open card
       DHQPlayerCard.preload(opts)    warm the big data; → Promise<{ leagueId, players }>
       DHQPlayerCard.config(o)        set data bases ({ locksBase, valuesBase, highlightsBase,
                                      valuesUrl, cssUrl, fonts }); → the current config
       DHQPlayerCard.version

     opts (all optional)
       leagueId        Sleeper league whose DHQ values / rosters to use
                       (default the Lab's demo league, Psycho League)
       league          true: the "In my league" strip + League History tab
       myUserId        Sleeper user id of "YOUR TEAM" (or myUsername, resolved
                       through Sleeper). Default: the Lab owner, demo league only.
       scoringSettings a Sleeper league scoring_settings object; every fantasy-
                       points number is then scored with it ("League scoring")
                       instead of Sleeper's Half-PPR points. Kickers use it only
                       if it scores kicks, defenders only if it scores IDP stats;
                       otherwise (and with no scoringSettings) kickers get
                       Sleeper's standard kicking ("Standard kicking": FG 0-39 3,
                       40-49 4, 50+ 5, XP 1, misses -1; Sleeper's Half-PPR file
                       already has it) and defenders the demo league's own
                       scoring_settings ("IDP scoring (DHQ demo league)"), since
                       Sleeper's Half-PPR points leave IDP stats out
       tab             'overview' | 'stats' | 'news' | 'league' | 'college' | 'awards'
       onClose         function, runs at the end of close()
       onLeagueChange  function(on), runs when the card's own "Show the demo
                       league" button turns the league view on

     The card builds its own overlay on first open (appended to <body>); all
     its CSS lives under .dhqpc-root (dhq-player-card.css, linked by the host;
     injected from next to this script if the host forgot). Ids and classes
     are all prefixed dhqpc-; localStorage keys dhqpc_*.

     Card sections
       1. Hero: headshot + jersey number, name, team logo / team / position,
          age, NFL season, height / weight, college, injury badge, career-stage
          tag. Right: DHQ Value, tier word, value rank and scoring rank at
          the position. "Highlights" opens the in-card video panel: clips
          from the NFL's YouTube channel when DHQ has collected them
          ({highlightsBase}), else links out to YouTube.
       2. Number strip: season points, games, points per game (Half-PPR from
          Sleeper's actual stats, or the league's scoring) and this week's DHQ
          projection (median, floor-ceiling, and the "why" on tap).
       3. "In my league" strip (league mode): who owns him and how he got there.
       4. Tabs: Overview (Dynasty Read, age curve, value trend: DHQ value by day
          from {valuesBase}) · Stats (career
          by season, this season's game log + chart with DHQ's weekly
          projection) · News · League History · College · Awards.

     Career stage (first match wins; see careerStage()):
       Rookie > Late career > Elite > Aging > Breakout > Prime > Developing >
       Fringe. Ages come from DHQ's own per-position age windows
       (intel.ageCurveWindows); production from this season's points-per-game
       rank at the position. Injuries are a badge on top, never a stage.
       Kickers / defenders: same stages, with the feed's K / DL / LB / DB windows.
       Elite = top 3 K or top 5 DL / LB / DB per game (and top 6 / 10 in value);
       starter = top 24 DL / LB / DB, or one kicker per team (the league's size,
       16 at most, 12 when unknown). Kickers: late career from the end of the K
       peak window + 3 (38) or a 14th season; aging from the decline window (36).
       Ranks for kickers and defenders compare only within the group (K, DL, LB
       or DB), in the card's scoring; past seasons' finishes for defenders (and
       kickers in league scoring) are worked out from Sleeper's season files.

     Data sources (all public, fetched in the browser, cached in localStorage)
       DHQ engine feed  hovnqztlbsgsywrbidbh.supabase.co/functions/v1/dhq-league
                        values, player meta, age windows, weekly projection,
                        league rosters / teams / trades (assess + intel)
       Sleeper          api.sleeper.app/v1/players/nfl (bio), /v1/stats/nfl/
                        regular/{yr} (season points, ranks; past years: kicker /
                        defender finishes), /v1/league/{demo} (its IDP scoring), api.sleeper.com/
                        stats/nfl/player/{pid} (career + game log),
                        api.sleeper.app/players/nfl/{pid}/news, /v1/state/nfl,
                        /v1/league + /draft + /transactions (league history),
                        /v1/user/{name} (myUsername only)
       ESPN             site.web.api.espn.com common/v3 search, athlete,
                        overview (awards) and college-football stats
       DHQ locks        {locksBase}{yr}-w{n}.json (DHQ's projection each week)
       DHQ values       {valuesBase}index.json + {leagueId}.json (one value a day,
                        saved by the Lab's value-history job; a league that isn't
                        tracked shows the default league's trend, labelled)
       Highlights       {highlightsBase}index.json + {pid}.json (the Lab's
                        highlights job: NFL channel clips), played in a
                        youtube-nocookie.com embed, loaded only once opened
     Never shown: Sleeper's projections, FantasyCalc, any other site's numbers.
     ══════════════════════════════════════════════════════════════════════ */

  // ── Settings ──────────────────────────────────────────────────────────
  var VERSION = '1.2.0';
  var SEASON = 2026;
  var DEMO = { id: '1312100327931019264', name: 'Psycho League', owner: '540392203863576576' };
  var ON_LAB = /(^|\.)dhq-lab\.pages\.dev$/i.test(location.hostname);
  var SELF = (document.currentScript && document.currentScript.src) || '';
  var CFG = {
    valuesUrl: 'https://hovnqztlbsgsywrbidbh.supabase.co/functions/v1/dhq-league', // + ?league=ID (or put {league} in it)
    locksBase: ON_LAB ? 'data/locks/' : 'https://dhq-lab.pages.dev/data/locks/',
    valuesBase: ON_LAB ? 'data/values/' : 'https://dhq-lab.pages.dev/data/values/',        // daily DHQ value history
    highlightsBase: ON_LAB ? 'data/highlights/' : 'https://dhq-lab.pages.dev/data/highlights/', // NFL channel clips
    cssUrl: SELF ? SELF.replace(/\.js(\?.*)?$/, '.css') : '',  // used only if the host did not load the CSS
    fonts: true                                                  // false: don't add the Google Fonts link
  };
  var FONTS_URL = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Rajdhani:wght@600;700&display=swap';
  var PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
  var STATS_URL = 'https://api.sleeper.app/v1/stats/nfl/regular/' + SEASON;
  var STATE_URL = 'https://api.sleeper.app/v1/state/nfl';
  var HISTORY_START = 'Nov 16, 2026'; // the value-history job's first day
  // v2 (1.2.0): kickers and defenders (K, DL, LB, DB) are in the feed / players / stats caches too
  var KEY = { feed: 'dhqpc_feed_v2_', players: 'dhqpc_players_v2', stats: 'dhqpc_stats_v2', scored: 'dhqpc_scored_v2_', espn: 'dhqpc_espn_v1', league: 'dhqpc_league_v2_', lock: 'dhqpc_lock_v2_', user: 'dhqpc_user_v1',
    vidx: 'dhqpc_vidx_v1', vh: 'dhqpc_vh_v1_', hidx: 'dhqpc_hidx_v1', hl: 'dhqpc_hl_v1', dss: 'dhqpc_demo_ss_v1', fin: 'dhqpc_fin_v1' };
  var TTL = { feed: 3 * 3600e3, players: 3 * 86400e3, stats: 3 * 3600e3, league: 12 * 3600e3, values: 3 * 3600e3, hl: 6 * 3600e3 };
  var OFF = { QB: 1, RB: 1, WR: 1, TE: 1 };
  // Kickers and individual defensive players (team defenses, 'DEF', stay out). DHQ groups
  // defenders as DL / LB / DB; Sleeper's own position (DE, DT, CB, S ...) is shown next to it.
  var KIDP = { K: 1, DL: 1, LB: 1, DB: 1 }, IDP = { DL: 1, LB: 1, DB: 1 };
  var ALLPOS = { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DL: 1, LB: 1, DB: 1 };
  var SL_GROUP = { K: 'K', PK: 'K', DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL', LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB', WLB: 'LB', SLB: 'LB', CB: 'DB', S: 'DB', SS: 'DB', FS: 'DB', DB: 'DB', NB: 'DB' };
  // A Sleeper player's K / DL / LB / DB group (DHQ's own grouping first), or '' (offense, punters, ...).
  function groupOf(pid, p) {
    var f = FEED && FEED.p[pid]; if (f && KIDP[f[1]]) return f[1];
    if (!p) return '';
    if (p.position === 'K') return 'K';
    if (OFF[p.position] || p.position === 'P') return '';
    var g = SL_GROUP[p.position]; if (g && IDP[g]) return g;
    return (p.fantasy_positions || []).filter(function (x) { return IDP[x]; })[0] || '';
  }
  // The real position for a defender: Sleeper's (DE, CB ...) or, when Sleeper only says DL / LB / DB, the depth chart's.
  var DEPTH_POS = [[/^(L|R)?(CB|NB)$/, 'CB'], [/^(SS|FS|S)$/, 'S'], [/^(L|R)?(DE|EDGE)$/, 'DE'], [/^(L|R)?(DT|NT)$/, 'DT'], [/^(L|R)?OLB$/, 'OLB'], [/^(L|R|M)?(ILB|MLB|WLB|SLB)$/, 'ILB']];
  function realPos(p) {
    var pos = p.position || '';
    if (!IDP[pos]) return pos;
    var d = String(p.depth_chart_position || '').toUpperCase();
    for (var i = 0; i < DEPTH_POS.length; i++) if (DEPTH_POS[i][0].test(d)) return DEPTH_POS[i][1];
    return pos;
  }
  function feedUrl(lid) {
    var u = CFG.valuesUrl, id = encodeURIComponent(lid);
    return u.indexOf('{league}') >= 0 ? u.replace('{league}', id) : u + (u.indexOf('?') >= 0 ? '&' : '?') + 'league=' + id;
  }
  // The Lab page's caches before the module (dhq_card_*): move the ESPN id map over, drop the rest once.
  (function legacy() {
    try {
      var ls = window.localStorage, old = ls.getItem('dhq_card_espn_v1');
      if (old && !ls.getItem(KEY.espn)) ls.setItem(KEY.espn, old);
      for (var i = ls.length - 1; i >= 0; i--) { var k = ls.key(i); if (k && (/^dhq_card_(feed|players|stats|espn|league|lock)_/.test(k) || /^dhqpc_(feed|players|stats|scored|league|lock)_v1/.test(k))) ls.removeItem(k); }
    } catch (e) { /* storage blocked */ }
  })();

  // ── Helpers ───────────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById('dhqpc-' + id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var f1 = function (n) { return n == null || isNaN(n) ? '—' : (Math.round(n * 10) / 10).toFixed(1); };
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked: run without */ } }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function pool(items, n, fn) {
    var out = new Array(items.length), i = 0;
    function next() { if (i >= items.length) return Promise.resolve(); var k = i++; return Promise.resolve(fn(items[k], k)).then(function (r) { out[k] = r; }, function () { out[k] = null; }).then(next); }
    var w = []; for (var j = 0; j < Math.min(n, items.length); j++) w.push(next());
    return Promise.all(w).then(function () { return out; });
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function dateShort(ms) { var d = new Date(ms); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }); }
  function ago(ms) {
    var m = (Date.now() - ms) / 60000; if (m < 1) return 'just now'; if (m < 60) return Math.round(m) + ' min ago';
    var h = m / 60; if (h < 24) return Math.round(h) + 'h ago'; var d = h / 24; if (d < 7) return Math.round(d) + 'd ago'; return dateShort(ms);
  }

  var POS_COLOR = { QB: '#ff6b6b', RB: '#4ecdc4', WR: '#45b7d1', TE: '#f7dc6f', K: '#bb8fce', DL: '#f0a35e', LB: '#e58fb8', DB: '#8fb3ff' };
  var POS_NAME = { QB: ['quarterback', 'quarterbacks'], RB: ['running back', 'running backs'], WR: ['receiver', 'receivers'], TE: ['tight end', 'tight ends'],
    K: ['kicker', 'kickers'], DL: ['defensive lineman', 'defensive linemen'], LB: ['linebacker', 'linebackers'], DB: ['defensive back', 'defensive backs'] };
  var RPOS_NAME = { DE: 'defensive end', DT: 'defensive tackle', NT: 'nose tackle', OLB: 'outside linebacker', ILB: 'inside linebacker', MLB: 'middle linebacker', CB: 'cornerback', S: 'safety', SS: 'safety', FS: 'safety' };
  // Team full names and a vivid team colour (the hero's glow).
  var TEAMS = {
    ARI: ['Arizona Cardinals', '#B5294A'], ATL: ['Atlanta Falcons', '#C8102E'], BAL: ['Baltimore Ravens', '#6A4FC4'], BUF: ['Buffalo Bills', '#1C5BD8'],
    CAR: ['Carolina Panthers', '#0085CA'], CHI: ['Chicago Bears', '#C83803'], CIN: ['Cincinnati Bengals', '#FB4F14'], CLE: ['Cleveland Browns', '#FF3C00'],
    DAL: ['Dallas Cowboys', '#2A5CB8'], DEN: ['Denver Broncos', '#FB4F14'], DET: ['Detroit Lions', '#0076B6'], GB: ['Green Bay Packers', '#2E7D4A'],
    HOU: ['Houston Texans', '#C8102E'], IND: ['Indianapolis Colts', '#1B5CC4'], JAX: ['Jacksonville Jaguars', '#0E8A9C'], KC: ['Kansas City Chiefs', '#E31837'],
    LV: ['Las Vegas Raiders', '#A5ACAF'], LAC: ['Los Angeles Chargers', '#0080C6'], LAR: ['Los Angeles Rams', '#2D5BD1'], MIA: ['Miami Dolphins', '#008E97'],
    MIN: ['Minnesota Vikings', '#6B3FA0'], NE: ['New England Patriots', '#C60C30'], NO: ['New Orleans Saints', '#D3BC8D'], NYG: ['New York Giants', '#2A4BD0'],
    NYJ: ['New York Jets', '#1E8A5A'], PHI: ['Philadelphia Eagles', '#0F7A72'], PIT: ['Pittsburgh Steelers', '#FFB612'], SF: ['San Francisco 49ers', '#C41E1E'],
    SEA: ['Seattle Seahawks', '#69BE28'], TB: ['Tampa Bay Buccaneers', '#D50A0A'], TEN: ['Tennessee Titans', '#4B92DB'], WAS: ['Washington Commanders', '#A6283A']
  };
  function teamName(t) { return (TEAMS[t] && TEAMS[t][0]) || t || 'Free agent'; }
  function teamNick(t) { var n = teamName(t).split(' '); return n[n.length - 1]; }
  function teamLogo(t) { return 'https://sleepercdn.com/images/team_logos/nfl/' + String(t || '').toLowerCase() + '.png'; }


  // ── Data: DHQ feed per league (slimmed), Sleeper players (slimmed), season stats ──
  // The render code reads the active league / scoring through these; activate() swaps them.
  var FEED = null, PL = null, PLN = {}, PLG = {}, ST = null, CUR = { week: null, season: SEASON };
  var RANK = {};   // pos → { value:{pid:rank}, score:{pid:rank}, ppg:{pid:rank}, minGP, n }
  var TEAMGP = {}; // NFL team → games played this season
  var LEAGUE = { id: DEMO.id, name: DEMO.name };
  var LG = {};       // league id → { id, name, FEED, ranks: { scoringKey: {RANK, TEAMGP} }, ready, LH, idx }
  var BASE = null;   // Promise: Sleeper players + season stats + NFL state, shared by every league
  var RAW_ST = null; // Promise: Sleeper's raw season stat lines (needed only to rescore a league)
  var SC = { key: '', rules: null, label: 'Half-PPR' }; // active scoring
  var SCORED = {};   // scoring key → { pid: [pts, gp] }  ('' = Sleeper's Half-PPR points)

  // playerMeta fields kept, in order (FantasyCalc fields are dropped on purpose).
  var MF = ['value', 'pos', 'age', 'phase', 'peakYrsLeft', 'declineEnd', 'starterSeasons', 'recentGP', 'role', 'careerPPG', 'lastYearPPG', 'trend', 'statusCode', 'statusReason', 'oppLabel', 'oppBlockers'];
  function slimFeed(d) {
    var I = d.intel || {}, ps = I.playerScores || {}, pm = I.playerMeta || {}, pj = (d.dhq_proj && d.dhq_proj.players) || {}, A = d.assess || {};
    var lc = I.lineupContext || {};
    var out = { built: d.built_at, week: d.dhq_proj && d.dhq_proj.week, p: {}, proj: {}, win: I.ageCurveWindows || {}, teams: {}, own: {}, trades: [],
      lc: { teams: +lc.totalTeams || 0, sc: I.starterCounts || {} } }; // league size + starters a team per position (K / IDP reads)
    Object.keys(ps).forEach(function (pid) {
      var m = pm[pid] || {}; if (!ALLPOS[m.pos] || !(ps[pid] > 0)) return;
      out.p[pid] = [ps[pid], m.pos, m.age, m.ageCurvePhase || '', m.peakYrsLeft, m.declineEnd, m.starterSeasons, m.recentGP, m.roleLabel || '', m.careerPPG, m.lastYearPPG, m.trend, m.statusCode || '', m.statusReason || '', m.opportunityLabel || '', m.opportunityBlockers || []];
      var j = pj[pid]; if (j && j.median > 0) out.proj[pid] = [j.median, j.floor, j.ceiling, j.why || ''];
    });
    (A.assessments || []).forEach(function (a) { out.teams[a.rosterId] = [a.teamName || a.ownerName, a.ownerName || '', a.ownerId || '', a.avatar || '']; });
    (A.rosters || []).forEach(function (r) { (r.players || []).forEach(function (pid) { if (out.p[pid]) out.own[pid] = r.roster_id; }); });
    (I.tradeHistory || []).forEach(function (t) {
      var sides = {}, any = false;
      Object.keys(t.sides || {}).forEach(function (rid) { var s = t.sides[rid] || {}; sides[rid] = [s.players || [], (s.picks || []).map(function (p) { return [p.season, p.round]; })]; if ((s.players || []).some(function (x) { return out.p[x]; })) any = true; });
      if (any) out.trades.push({ s: +t.season, w: t.week, t: t.ts, sides: sides, win: t.winner, pct: t.valueDiffPct });
    });
    return out;
  }
  function meta(pid) { var r = FEED && FEED.p[pid]; if (!r) return null; var o = {}; MF.forEach(function (k, i) { o[k] = r[i]; }); return o; }
  // Sleeper players: [name, pos, team, number, birth, yearsExp, college, height, weight, injStatus, injBody, espnId, rookieYear, age, first, realPos]
  // pos is the card's position: QB / RB / WR / TE, or the K / DL / LB / DB group (realPos: DE, CB, ...).
  // g: every kicker / defender's group, retired ones too (past seasons' finish ranks), as { K: 'id,id,...', DL: ..., LB: ..., DB: ... }.
  function slimPlayers(all) {
    var out = {}, names = {}, grp = {};
    Object.keys(all).forEach(function (pid) {
      var p = all[pid]; if (!p) return;
      var g = OFF[p.position] ? '' : groupOf(pid, p); if (!OFF[p.position] && !g) return;
      if (g) (grp[g] = grp[g] || []).push(pid);
      var name = p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
      // retired / teamless: name only (they still turn up in league trades)
      if (!p.team && !(FEED && FEED.p[pid])) { if (name) names[pid] = name; return; }
      out[pid] = [name, g || p.position, p.team || '', p.number || null, p.birth_date || '', p.years_exp, p.college || '', p.height || '', p.weight || '', p.injury_status || '', p.injury_body_part || '', p.espn_id || null, (p.metadata && p.metadata.rookie_year) || '', p.age || null, p.first_name || name.split(' ')[0]];
      if (g) out[pid].push(g === 'K' ? 'K' : realPos(p));
    });
    // names only, for everyone else who appears in a league trade (defenders and the like)
    (FEED && FEED.trades || []).forEach(function (t) { Object.keys(t.sides).forEach(function (rid) { t.sides[rid][0].forEach(function (pid) { var p = all[pid]; if (!out[pid] && p) names[pid] = p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || (p.team ? p.team + ' defense' : ''); }); }); });
    Object.keys(grp).forEach(function (g) { grp[g] = grp[g].join(','); });
    return { p: out, n: names, g: grp };
  }
  function pl(pid) {
    var r = PL && PL[pid]; if (!r) return null;
    return { id: pid, name: r[0], pos: r[1], team: r[2], num: r[3], birth: r[4], exp: r[5] == null ? null : +r[5], college: r[6], height: r[7], weight: r[8], inj: r[9], injBody: r[10], espn: r[11], rookieYear: +r[12] || null, age: r[13], first: r[14], rpos: r[15] || r[1], kidp: !!KIDP[r[1]] };
  }
  function cached(key, ttl, url, slim) {
    var c = load(key), now = Date.now();
    if (c && now - c.ts < ttl) return Promise.resolve(c.data);
    return getJSON(url).then(function (d) { var s = slim(d); store(key, { ts: now, data: s }); return s; })
      .catch(function (e) { if (c) return c.data; throw e; });
  }

  // ── Scoring: Sleeper's Half-PPR points, or a league's scoring_settings ──
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  // Same rule as the DHQ engine (engine2.js scoreLine): sum of stat × rule over the rule's keys.
  function scoreLine(line, rules) {
    if (!line) return 0;
    var t = 0;
    for (var k in rules) { var v = line[k]; if (typeof v === 'number' && v) t += v * num(rules[k]); }
    return t;
  }
  function scoring(ss) {
    var keys = ss && typeof ss === 'object' ? Object.keys(ss).filter(function (k) { return num(ss[k]) !== 0; }).sort() : [];
    if (!keys.length) return { key: '', rules: null, label: 'Half-PPR' };
    var rules = {}; keys.forEach(function (k) { rules[k] = num(ss[k]); });
    return { key: keys.map(function (k) { return k + '=' + rules[k]; }).join(','), rules: rules, label: 'League scoring' };
  }
  // Kickers and defenders when the host gives no scoring (or scoring with no kicking / IDP rules):
  // kickers get Sleeper's standard kicking (its Half-PPR file already scores kicks: FG 0-39 3, 40-49 4,
  // 50+ 5, XP 1, misses -1); defenders the demo league's own scoring_settings (Sleeper's Half-PPR
  // points leave IDP stats out). The fallback is that league's IDP rules as of 2026-11-16.
  var DEMO_IDP = { idp_tkl_solo: 0.5, idp_tkl_ast: 0.25, idp_tkl_loss: 2, idp_sack: 5, idp_sack_yd: 0.1, idp_qb_hit: 1.25, idp_int: 5, idp_int_ret_yd: 0.1, idp_pass_def: 5, idp_pass_def_3p: 1,
    idp_ff: 3, idp_fum_rec: 3, idp_fum_ret_yd: 0.1, idp_def_td: 6, idp_safe: 2, idp_blk_kick: 3 };
  var DEMO_SS = null;
  function demoScoring() {
    if (!DEMO_SS) {
      var c = load(KEY.dss);
      DEMO_SS = c && c.data && Date.now() - c.ts < TTL.league ? Promise.resolve(c.data)
        : getJSON('https://api.sleeper.app/v1/league/' + DEMO.id).then(function (l) {
          var ss = l && l.scoring_settings; if (!ss || typeof ss !== 'object') throw new Error('no scoring');
          store(KEY.dss, { ts: Date.now(), data: ss }); return ss;
        }).catch(function () { DEMO_SS = null; return c && c.data ? c.data : DEMO_IDP; });
    }
    return DEMO_SS;
  }
  function hasRules(sc, re) { return !!sc.rules && Object.keys(sc.rules).some(function (k) { return re.test(k); }); }
  // → Promise<scoring> for a player at pos (offense: the host's scoring or Half-PPR, as before)
  function scoringFor(pos, ss) {
    var sc = scoring(ss);
    if (!KIDP[pos]) return Promise.resolve(sc);
    if (pos === 'K') return Promise.resolve(hasRules(sc, /^(fgm|fgmiss|xpm|xpmiss)/) ? sc : { key: '', rules: null, label: 'Standard kicking' });
    if (hasRules(sc, /^idp_/)) return Promise.resolve(sc);
    return demoScoring().then(function (d) { var x = scoring(d); x.label = 'IDP scoring (DHQ demo league)'; x.demo = true; return x; });
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function pts(line, rules) { return rules ? scoreLine(line, rules) : (line && line.pts_half_ppr) || 0; }
  function slimStats(all, rules) {
    var out = {}; Object.keys(all).forEach(function (pid) { var r = all[pid]; if (PL[pid] && r && r.gp > 0) out[pid] = [Math.round(pts(r, rules) * 100) / 100, r.gp]; });
    return out;
  }
  function ensureScoring(sc) {
    if (!sc.rules || SCORED[sc.key]) return Promise.resolve();
    var lk = KEY.scored + hash(sc.key), c = load(lk);
    if (c && c.k === sc.key && Date.now() - c.ts < TTL.stats) { SCORED[sc.key] = c.data; return Promise.resolve(); }
    if (!RAW_ST) RAW_ST = getJSON(STATS_URL);
    return RAW_ST.then(function (all) {
      var s = slimStats(all, sc.rules); SCORED[sc.key] = s; store(lk, { ts: Date.now(), k: sc.key, data: s });
    }, function () { RAW_ST = null; SCORED[sc.key] = c && c.k === sc.key ? c.data : {}; });
  }

  function loadBase() {
    var stateP = getJSON(STATE_URL).then(function (s) { CUR = { week: s.week, season: +s.season || SEASON, type: s.season_type }; }).catch(function () { /* fall back to the feed's week */ });
    return cached(KEY.players, TTL.players, PLAYERS_URL, slimPlayers).then(function (p) {
      PL = p.p; PLN = p.n || {}; PLG = {};
      Object.keys(p.g || {}).forEach(function (g) { String(p.g[g]).split(',').forEach(function (id) { if (id) PLG[id] = g; }); });
      return cached(KEY.stats, TTL.stats, STATS_URL, function (all) { RAW_ST = Promise.resolve(all); return slimStats(all, null); }).catch(function () { return {}; });
    }).then(function (s) { SCORED[''] = s; return stateP; });
  }
  // A league's feed + the shared Sleeper data, once per page.
  function ensure(lid) {
    var L = LG[lid] || (LG[lid] = { id: lid, name: lid === DEMO.id ? DEMO.name : '', ranks: {} });
    if (!L.ready) {
      var info = L.name ? null : getJSON('https://api.sleeper.app/v1/league/' + encodeURIComponent(lid)).then(function (l) { if (l && l.name) L.name = l.name; }).catch(function () { /* name stays generic */ });
      L.ready = cached(KEY.feed + lid, TTL.feed, feedUrl(lid), slimFeed).then(function (f) {
        L.FEED = f; if (!FEED) FEED = f; // slimPlayers reads FEED
        if (!BASE) { BASE = loadBase(); BASE.catch(function () { BASE = null; }); }
        return Promise.all([BASE, info]);
      }).then(function () { if (!CUR.week) CUR.week = L.FEED.week; return L; });
      L.ready.catch(function () { L.ready = null; });
    }
    return L.ready;
  }
  // Point the render code at one league + scoring set (ranks built once per pair).
  function activate(L, sc) {
    SC = sc; FEED = L.FEED; LEAGUE = { id: L.id, name: L.name || 'your league' };
    ST = SCORED[sc.key] || SCORED[''] || {};
    var R = L.ranks[sc.key];
    if (!R) { buildRanks(); R = L.ranks[sc.key] = { RANK: RANK, TEAMGP: TEAMGP }; }
    RANK = R.RANK; TEAMGP = R.TEAMGP;
  }
  function buildRanks() {
    RANK = {}; TEAMGP = {};
    Object.keys(ST).forEach(function (pid) { var p = PL[pid]; if (p && p[2]) TEAMGP[p[2]] = Math.max(TEAMGP[p[2]] || 0, ST[pid][1]); });
    Object.keys(ALLPOS).forEach(function (pos) {
      var R = { value: {}, score: {}, ppg: {}, minGP: 3, n: 0 };
      Object.keys(FEED.p).filter(function (pid) { return FEED.p[pid][1] === pos; }).sort(function (a, b) { return FEED.p[b][0] - FEED.p[a][0]; }).forEach(function (pid, i) { R.value[pid] = i + 1; });
      var withStats = Object.keys(ST).filter(function (pid) { return PL[pid] && PL[pid][1] === pos; });
      withStats.sort(function (a, b) { return ST[b][0] - ST[a][0]; }).forEach(function (pid, i) { R.score[pid] = i + 1; });
      var maxGP = withStats.reduce(function (m, pid) { return Math.max(m, ST[pid][1]); }, 0);
      R.minGP = Math.max(3, Math.ceil(maxGP * 0.5));
      withStats.filter(function (pid) { return ST[pid][1] >= R.minGP; }).sort(function (a, b) { return ST[b][0] / ST[b][1] - ST[a][0] / ST[a][1]; }).forEach(function (pid, i) { R.ppg[pid] = i + 1; });
      RANK[pos] = R;
    });
  }
  // Search index for hosts (preload's result): everyone with a team or a DHQ value.
  function index(L) {
    if (!L.idx) L.idx = Object.keys(PL).filter(function (pid) { return PL[pid][2] || L.FEED.p[pid]; }).map(function (pid) {
      var p = PL[pid]; return { id: pid, name: p[0], pos: p[1], rpos: p[15] || p[1], team: p[2], teamName: teamName(p[2]), value: L.FEED.p[pid] ? L.FEED.p[pid][0] : 0 };
    });
    return L.idx;
  }
  // myUsername → Sleeper user id (cached).
  function userId(name) {
    var k = String(name).toLowerCase(), map = load(KEY.user) || {};
    if (map[k]) return Promise.resolve(map[k]);
    return getJSON('https://api.sleeper.app/v1/user/' + encodeURIComponent(name)).then(function (u) {
      if (!u || !u.user_id) return null; map[k] = String(u.user_id); store(KEY.user, map); return map[k];
    }).catch(function () { return null; });
  }

  // ── Per player: career by season + this season's game log (Sleeper) ──
  var PRAW = {}, PCACHE = {};
  var SKIP_SUM = { pos_rank_std: 1, pos_rank_ppr: 1, pos_rank_half_ppr: 1, rank_std: 1, rank_ppr: 1, rank_half_ppr: 1, fgm_pct: 1 };
  // Sleeper's season lines add up each week's longest field goal (and FG%), so a kicker's
  // seasons are also read week by week: the long is the best week's, the % is worked out.
  function kickLong(wl) { var m = null; Object.keys(wl || {}).forEach(function (w) { var g = wl[w], v = g && g.stats && g.stats.fgm_lng; if (typeof v === 'number' && v > 0) m = Math.max(m || 0, v); }); return m; }
  function playerStats(pid) {
    var ck = pid + '|' + SC.key;
    if (PCACHE[ck]) return PCACHE[ck];
    var p = pl(pid), rules = SC.rules, S = ST, RK = RANK, isK = p.pos === 'K', isD = !!IDP[p.pos];
    // finish ranks: Sleeper's own (Half-PPR, = standard kicking for kickers), or worked out later in this scoring
    var ownRank = !p.kidp || (isK && !rules);
    if (!PRAW[pid]) {
      var first = p.rookieYear || (p.exp != null ? SEASON - p.exp : SEASON);
      var years = []; for (var y = Math.max(first, SEASON - 16); y < SEASON; y++) years.push(y);
      var base = 'https://api.sleeper.com/stats/nfl/player/' + encodeURIComponent(pid) + '?season_type=regular&season=';
      var past = pool(years, 6, function (yr) { return getJSON(base + yr + '&grouping=season').catch(function () { return null; }); });
      var cur = getJSON(base + SEASON + '&grouping=week').catch(function () { return null; });
      var kw = isK ? pool(years, 6, function (yr) { return getJSON(base + yr + '&grouping=week').catch(function () { return null; }); }) : null;
      PRAW[pid] = { years: years, p: Promise.all([past, cur, kw]) };
      PRAW[pid].p.catch(function () { delete PRAW[pid]; });
    }
    var years0 = PRAW[pid].years;
    PCACHE[ck] = PRAW[pid].p.then(function (r) {
      var seasons = [];
      (r[0] || []).forEach(function (row, i) {
        if (!row || !row.stats || !(row.stats.gp > 0)) return;
        var s = row.stats;
        if (isK) { s = Object.assign({}, s); delete s.fgm_pct; s.fgm_lng = kickLong(r[2] && r[2][i]); }
        seasons.push({ yr: years0[i], team: row.team || '', gp: s.gp, pts: pts(s, rules), rank: ownRank ? s.pos_rank_half_ppr || null : null, st: s });
      });
      var weeks = [], tot = {}, team = '';
      Object.keys(r[1] || {}).forEach(function (wk) {
        var g = r[1][wk]; if (!g || !g.stats) return;
        if (g.stats.gp > 0 && typeof (isD ? g.stats.pts_idp : g.stats.pts_half_ppr) !== 'number') return; // game not played yet (or not scored yet)
        weeks.push({ wk: +wk, opp: g.opponent || '', away: !!g.is_away_team, team: g.team || '', date: g.date, st: g.stats, pts: pts(g.stats, rules), gp: g.stats.gp || 0 });
        team = g.team || team;
        Object.keys(g.stats).forEach(function (k) { if (!SKIP_SUM[k] && typeof g.stats[k] === 'number') tot[k] = k === 'fgm_lng' ? Math.max(tot[k] || 0, g.stats[k]) : (tot[k] || 0) + g.stats[k]; });
      });
      weeks.sort(function (a, b) { return a.wk - b.wk; });
      var bulk = S[pid];
      if (tot.gp > 0 || bulk) seasons.push({ yr: SEASON, team: team || p.team, gp: bulk ? bulk[1] : tot.gp, pts: bulk ? bulk[0] : pts(tot, rules), rank: RK[p.pos] && RK[p.pos].score[pid] || null, st: tot, cur: true });
      return { seasons: seasons, weeks: weeks, later: !ownRank && seasons.some(function (x) { return !x.cur; }) };
    });
    PCACHE[ck].catch(function () { delete PCACHE[ck]; });
    return PCACHE[ck];
  }
  // Kickers / defenders: each past season's finish within his group (K, DL, LB, DB) in the card's
  // scoring, from Sleeper's season file for that year (~1 MB, read once a page per year; the
  // player's ranks are kept in localStorage, KEY.fin: { o: [order], d: { 'pid|scoring': { yr: rank } } }).
  var FINY = {};
  function yearRanks(yr, sc) {
    var k = yr + '|' + sc.key;
    if (!FINY[k]) {
      FINY[k] = getJSON('https://api.sleeper.app/v1/stats/nfl/regular/' + yr).then(function (all) {
        var by = {}, out = {};
        Object.keys(all || {}).forEach(function (pid) { var g = PLG[pid], r = all[pid]; if (g && r && r.gp > 0) (by[g] = by[g] || []).push([pid, pts(r, sc.rules)]); });
        Object.keys(by).forEach(function (g) { by[g].sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x, i) { out[x[0]] = i + 1; }); });
        return out;
      });
      FINY[k].catch(function () { delete FINY[k]; });
    }
    return FINY[k];
  }
  // only: just these seasons (the card's open needs last season's finish for the career stage)
  function fillFinish(pid, ps, sc, only) {
    if (!ps || !ps.later) return Promise.resolve(false);
    var key = pid + '|' + hash(sc.key), c = load(KEY.fin) || { o: [], d: {} }, have = c.d[key] || {};
    var todo = ps.seasons.filter(function (x) { return !x.cur && !(x.yr in have) && (!only || only.indexOf(x.yr) >= 0); });
    var put = function () { ps.seasons.forEach(function (x) { if (!x.cur && have[x.yr]) x.rank = have[x.yr]; }); if (!only) ps.later = false; return true; };
    if (!todo.length) return Promise.resolve(put());
    return pool(todo, 3, function (x) { return yearRanks(x.yr, sc).then(function (R) { have[x.yr] = R[pid] || 0; }); }).then(function () {
      var c2 = load(KEY.fin) || { o: [], d: {} };
      c2.d[key] = have; c2.o = (c2.o || []).filter(function (x) { return x !== key; }).concat(key);
      while (c2.o.length > 60) delete c2.d[c2.o.shift()];
      store(KEY.fin, c2);
      return put();
    });
  }

  // ── Career stage ───────────────────────────────────────────────────────
  // Fallback windows (research defaults) when the feed has none for a position.
  var DEF_W = { RB: { build: [21, 22], peak: [23, 26], decline: [27, 28] }, WR: { build: [22, 24], peak: [25, 28], decline: [29, 31] }, TE: { build: [23, 25], peak: [26, 29], decline: [30, 31] }, QB: { build: [23, 25], peak: [26, 32], decline: [33, 35] },
    // the DHQ engine's K / IDP windows (2026-11-16), used only if the feed has none
    K: { build: [23, 27], peak: [28, 35], decline: [36, 40] }, DL: { build: [22, 24], peak: [25, 29], decline: [30, 32] }, LB: { build: [22, 23], peak: [24, 28], decline: [29, 31] }, DB: { build: [21, 23], peak: [24, 27], decline: [28, 30] } };
  // Kickers: late career only from the end of the K peak window + 3 (about 38), or a 14th NFL season.
  var LATE_EXP = { RB: 7, WR: 10, TE: 10, QB: 14, K: 13, DL: 11, LB: 10, DB: 10 };
  // Elite / starter cut-offs (points-per-game rank in the group). Kicker starters: one per team
  // (the league's size from the feed, 12 when unknown); see cut().
  var CUT = { QB: { elite: 5, starter: 20 }, RB: { elite: 8, starter: 24 }, WR: { elite: 8, starter: 30 }, TE: { elite: 5, starter: 12 },
    K: { elite: 3, starter: 12 }, DL: { elite: 5, starter: 24 }, LB: { elite: 5, starter: 24 }, DB: { elite: 5, starter: 24 } };
  function leagueTeams() { var n = FEED && FEED.lc && FEED.lc.teams; return n >= 8 && n <= 32 ? n : 0; }
  function cut(pos) { if (pos !== 'K') return CUT[pos]; var n = leagueTeams(); return { elite: 3, starter: n ? Math.min(n, 16) : 12 }; }
  function windows(pos) {
    var w = (FEED && FEED.win && FEED.win[pos]) || DEF_W[pos];
    if (!(w && w.build && w.peak && w.decline)) w = DEF_W[pos];
    var late = pos === 'K' ? Math.min(w.decline[1] + 1, w.peak[1] + 3) : w.decline[1] + 1;
    // valueEnd: the last age with real dynasty value (the end of the decline years; kickers: the year before late career)
    return { build: w.build, peak: w.peak, decline: w.decline, prime: w.build[1], declineAge: w.decline[0], late: late, valueEnd: late - 1 };
  }
  var STAGES = {
    rookie: { label: 'Rookie', color: '#5DADE2' },
    late: { label: 'Late career', color: '#E8806F' },
    elite: { label: 'Elite', color: '#E9C85A' },
    aging: { label: 'Aging', color: '#F0A500' },
    breakout: { label: 'Breakout', color: '#2ECC71' },
    prime: { label: 'Prime', color: '#D4AF37' },
    developing: { label: 'Developing', color: '#4ecdc4' },
    fringe: { label: 'Fringe', color: '#A9A4B5' }
  };
  function ageOn(birth, y, m, d) { var b = new Date(birth + 'T12:00:00Z'); if (isNaN(b)) return null; var a = y - b.getUTCFullYear(); if (m < b.getUTCMonth() + 1 || (m === b.getUTCMonth() + 1 && d < b.getUTCDate())) a--; return a; }
  function ageExact(birth) { var b = new Date(birth + 'T12:00:00Z'); return isNaN(b) ? null : (Date.now() - b) / (365.2425 * 86400e3); }
  // c = { pos, age (on Sept 1), exp, rank (this season PPG rank or null), prevRank, prevGP, trend, valueRank }
  function careerStage(c) {
    var W = windows(c.pos), R = cut(c.pos), P = POS_NAME[c.pos][1];
    var rank = c.rank != null ? c.rank : (c.prevGP >= 6 ? c.prevRank : null);
    var starter = rank != null && rank <= R.starter;
    var S = function (k, why) { return { key: k, label: STAGES[k].label, color: STAGES[k].color, why: why, starter: starter, rank: rank, W: W }; };
    if (c.exp === 0) return S('rookie', 'This is his first NFL season.');
    if (c.age >= W.late) return S('late', 'He is ' + c.age + '. DHQ’s age curve treats ' + P + ' as late-career from ' + W.late + '.');
    if (c.exp >= LATE_EXP[c.pos]) return S('late', 'This is his ' + ord(c.exp + 1) + ' NFL season, a long career' + (c.pos === 'K' ? ' even' : '') + ' for a ' + POS_NAME[c.pos][0] + '.');
    var proven = (c.prevGP >= 6 && c.prevRank != null && c.prevRank <= R.starter) || c.starterSeasons >= 2;
    if (rank != null && rank <= R.elite && c.valueRank <= R.elite * 2 && c.age < W.declineAge && proven)
      return S('elite', 'A top-' + R.elite + ' scorer per game among ' + P + ', top-' + (R.elite * 2) + ' in DHQ value, and not yet in the decline years.');
    if (c.age >= W.declineAge) return S('aging', 'He is ' + c.age + '. For ' + P + ', value usually starts to slide at ' + W.declineAge + '.');
    var prevBad = !(c.prevGP >= 6) || c.prevRank == null || c.prevRank > R.starter + 12;
    if (c.exp <= (c.pos === 'TE' ? 5 : 4) && starter && (prevBad || c.trend >= 25))
      return S('breakout', 'A starter-level scorer this season (' + c.pos + rank + ' per game)' + (c.prevRank && c.prevGP >= 6 ? ' after finishing ' + c.pos + c.prevRank + ' last season.' : ' in his first big year.'));
    if (starter) return S('prime', 'In his ' + (c.age >= W.prime ? 'prime ' : '') + 'years (' + c.age + ') and scoring like a weekly starter (' + c.pos + rank + ' per game).');
    if (c.exp >= 1 && c.exp <= ((c.pos === 'QB' || c.pos === 'TE') ? 4 : 3)) return S('developing', 'Year ' + (c.exp + 1) + ' and not yet scoring like a weekly starter.');
    return S('fringe', 'Not scoring like a weekly starter, and past the years when young players usually take the leap.');
  }

  // Everything the card needs about one player, computed once.
  function context(pid, ps) {
    var p = pl(pid), m = meta(pid) || {}, R = RANK[p.pos] || { value: {}, score: {}, ppg: {}, minGP: 3 };
    var s = ST[pid] || [0, 0], gp = s[1], pts = s[0];
    var age = p.birth ? ageOn(p.birth, SEASON, 9, 1) : (p.age || m.age);
    var prev = null, careerPts = 0, careerGP = 0;
    (ps ? ps.seasons : []).forEach(function (x) { if (x.yr === SEASON - 1) prev = x; if (!x.cur) { careerPts += x.pts; careerGP += x.gp; } });
    var c = {
      p: p, m: m, pos: p.pos, age: age, ageX: p.birth ? ageExact(p.birth) : age, exp: p.exp, gp: gp, pts: pts, ppg: gp ? pts / gp : null,
      teamGP: TEAMGP[p.team] || null, minGP: R.minGP,
      rank: R.ppg[pid] || null, scoreRank: R.score[pid] || null, valueRank: R.value[pid] || null, value: m.value || 0,
      prevRank: prev ? prev.rank : null, prevGP: prev ? prev.gp : 0, prevPPG: prev && prev.gp ? prev.pts / prev.gp : null,
      careerPPG: careerGP ? careerPts / careerGP : null, careerSeasons: ps ? ps.seasons.filter(function (x) { return !x.cur; }).length : 0,
      trend: typeof m.trend === 'number' ? m.trend : null, starterSeasons: m.starterSeasons || 0, proj: FEED.proj[pid] || null, weeks: ps ? ps.weeks : []
    };
    c.stage = careerStage(c);
    c.W = c.stage.W;
    if (p.kidp) kidpCtx(c, ps);
    return c;
  }
  // Tier word: where his DHQ value ranks at his position in a 16-team superflex league.
  var TIER_CUT = { QB: [5, 24, 40], RB: [8, 32, 56], WR: [8, 40, 72], TE: [4, 16, 28], K: [3, 16, 28], DL: [5, 36, 64], LB: [5, 30, 54], DB: [5, 36, 64] };
  function tier(c) {
    var r = c.valueRank, t = TIER_CUT[c.pos]; if (!r || !c.value) return '—';
    return r <= t[0] ? 'Elite' : r <= t[1] ? 'Starter' : r <= t[2] ? 'Depth' : 'Stash';
  }
  function injury(p, m) {
    var st = p.inj, hard = { IR: 'Injured reserve', PUP: 'PUP list', Out: 'Out', Sus: 'Suspended', NA: 'Not active', DNR: 'Did not report' };
    var body = p.injBody ? String(p.injBody).toLowerCase() : '';
    var say = { IR: 'on injured reserve', PUP: 'on the PUP list', Out: 'listed as out', Sus: 'suspended', NA: 'not active', DNR: 'listed as did not report', Doubtful: 'listed as doubtful', Questionable: 'listed as questionable' };
    if (st) return { label: (hard[st] || st) + (p.injBody ? ' · ' + p.injBody : ''), hard: !!hard[st] || st === 'Doubtful', word: hard[st] || st, say: 'He is currently ' + (say[st] || 'listed as ' + String(st).toLowerCase()) + (body ? ' (' + body + ')' : '') + '.' };
    if (m && m.statusCode === 'ir') return { label: m.statusReason || 'Injured reserve', hard: true, word: m.statusReason || 'injured reserve', say: 'He is currently ' + String(m.statusReason || 'on injured reserve').toLowerCase() + '.' };
    if (!p.team) return { label: 'No NFL team', hard: true, word: 'a free agent', say: 'He is currently without an NFL team.' };
    return null;
  }

  // ── The Dynasty Read: verdict + write-up + signals, from rules only ────
  function roleText(c) {
    var r = c.m.role || '', mm = /(\d+)$/.exec(r), n = mm ? +mm[1] : 0, pos = c.pos, nick = teamNick(c.p.team);
    if (!n || !c.p.team) return '';
    if (pos === 'QB') return n === 1 ? 'the starting quarterback for the ' + nick : 'a backup quarterback for the ' + nick;
    if (pos === 'RB') return n === 1 ? 'the lead back for the ' + nick : n === 2 ? 'the No. 2 back for the ' + nick : 'a depth back for the ' + nick + ' (No. ' + n + ' on the depth chart)';
    if (pos === 'TE') return n === 1 ? 'the starting tight end for the ' + nick : n === 2 ? 'the No. 2 tight end for the ' + nick : 'a depth tight end for the ' + nick;
    return n === 1 ? 'a starting receiver for the ' + nick : n === 2 ? 'a No. 2 receiver on the ' + nick + ' depth chart' : 'a depth receiver for the ' + nick;
  }
  function blockersText(c) {
    var b = (c.m.oppBlockers || []).map(function (id) { var q = pl(id); return q && q.name; }).filter(Boolean);
    if (!b.length) return '';
    return 'He shares the ball with ' + (b.length === 1 ? b[0] : b.slice(0, -1).join(', ') + ' and ' + b[b.length - 1]) + ', which caps his volume.';
  }
  function dynastyRead(c) {
    if (c.p.kidp) return readKIDP(c);
    var first = c.p.first, P = POS_NAME[c.pos], W = c.W, st = c.stage, inj = injury(c.p, c.m), age = c.age;
    var ppgS = c.ppg != null ? '<b>' + f1(c.ppg) + '</b>' : '';
    var prodBy = function (who) {
      return !c.gp ? who + ' has not played a game this season.'
      : c.gp < c.minGP ? who + ' has played ' + plural(c.gp, 'game') + ' this season (' + f1(c.pts) + ' points).'
      : who + ' is averaging ' + ppgS + ' points a game this season, <b>' + c.pos + c.rank + '</b> among ' + P[1] + ' with ' + c.minGP + '+ games.';
    };
    var prod = prodBy(first);
    var inj0 = injury(c.p, c.m);
    // an injured player's depth-chart spot reflects the injury, not his role, so leave it out
    var role = inj0 && inj0.hard ? '' : roleText(c); role = role ? 'He is ' + role + '.' : '';
    var career = '';
    if (c.careerPPG && c.ppg != null && c.gp >= c.minGP && c.careerSeasons >= 2) {
      var d = c.ppg - c.careerPPG;
      career = Math.abs(d) < 1 ? 'That is right in line with his career average of ' + f1(c.careerPPG) + '.' : 'That is ' + (d > 0 ? 'up' : 'down') + ' from his career average of ' + f1(c.careerPPG) + ' a game.';
    }
    var trend = (c.trend != null && Math.abs(c.trend) >= 10 && Math.abs(c.trend) <= 300 && c.prevGP >= 4) ? 'His scoring is ' + (c.trend > 0 ? 'up' : 'down') + ' ' + Math.abs(c.trend) + '% a game on last season.' : '';
    var jump = (c.prevRank && c.prevGP >= 6) ? 'Last season he finished ' + c.pos + c.prevRank + ' (' + f1(c.prevPPG) + ' a game); this year is a real step up.' : (c.exp <= 1 ? '' : 'He barely played last season, so this is his first real run of production.');
    var starters = c.m.starterSeasons > 0 ? 'He has ' + plural(c.m.starterSeasons, 'season') + ' as a fantasy starter on his record.' : '';
    var pk = W.peak[0] + '–' + W.peak[1];
    var ageS = age < W.peak[0] ? 'At ' + age + ', the ' + P[0] + ' age curve puts his peak at ' + pk + ', so his best years should still be ahead.'
      : age <= W.peak[1] ? 'At ' + age + ', he is in the ' + P[0] + ' peak window (' + pk + ')' + (c.m.peakYrsLeft > 0 ? ' with about ' + plural(c.m.peakYrsLeft, 'peak year') + ' left.' : '.')
      : age <= W.decline[1] ? 'At ' + age + ', he is past the ' + P[0] + ' peak (' + pk + ') and into the years when value usually slides.'
      : 'At ' + age + ', he is ' + plural(age - W.peak[1], 'year') + ' past the usual ' + P[0] + ' peak (' + pk + '); every good season from here is a bonus.';
    var status = inj ? '<b>' + esc(inj.say) + '</b>' : '';
    var opp = blockersText(c);
    var V, parts;
    switch (st.key) {
      case 'rookie':
        V = c.rank && c.rank <= CUT[c.pos].starter ? 'Rookie already scoring like a starter: buy the talent before the price catches up.'
          : (tier(c) === 'Elite' || tier(c) === 'Starter') ? 'Premium rookie: DHQ is paying for the talent, not the stats yet. Hold and let him grow.'
          : 'Rookie still finding his role: a cheap stash with years of runway.';
        parts = [role ? 'In his first NFL season, ' + role.replace(/^He is /, first + ' is ') : 'In his first NFL season, ' + first + ' is still working his way into the lineup.', prodBy('He'), ageS, status || opp]; break;
      case 'developing':
        V = 'Young ' + P[0] + ' still waiting on a full-time role: be patient, don’t sell low.';
        parts = [role || prod, role ? prod : '', ageS, status || opp || 'The next step is a bigger role; until then he is a stash.']; break;
      case 'breakout':
        V = 'Breakout year at ' + age + ': the production is real, now the question is whether it sticks.';
        parts = [prod, jump || trend, role, status || ageS]; break;
      case 'prime':
        V = 'Producing in his prime (' + age + '): a core starter to build around.';
        parts = [prod, role, starters || career, status || ageS]; break;
      case 'elite':
        V = 'Elite ' + P[0] + ' at ' + age + ': one of the few players worth building a team around.';
        parts = [prod, career || starters, ageS, status || (opp || 'The only real risks are injury and time, and neither is pressing right now.')]; break;
      case 'aging':
        V = st.starter ? 'Aging but still producing (' + age + '): his value window is closing. Win with him now, and sell if the price is right.'
          : 'Aging and fading (' + age + '): sell for whatever you can get.';
        parts = [ageS, prod, career || trend, status || starters]; break;
      case 'late':
        V = st.starter ? 'Late-career star (' + age + '): still a weekly starter, but his value window has closed. Hold for production, don’t pay for him.'
          : 'Late career (' + age + ') and no longer a reliable starter: there is little dynasty value left.';
        parts = [ageS, prod, career || trend, status || starters]; break;
      default:
        V = 'Depth piece: useful in a pinch, but not a player to plan around.';
        parts = [role || prod, role ? prod : '', status || opp, 'Keep him only if you need depth at ' + c.pos + '.'];
    }
    if (inj && inj.hard) parts = [parts[0], status].concat(parts.slice(1).filter(function (x) { return x !== status; }));
    var out = []; parts.forEach(function (x) { if (x && out.indexOf(x) < 0 && out.length < 4) out.push(x); });
    return { verdict: V, text: out.join(' ') };
  }
  function signals(c) {
    if (c.p.kidp) return signalsKIDP(c);
    var played = c.weeks.filter(function (w) { return w.gp > 0; }).map(function (w) { return w.pts; });
    var best = played.length ? Math.max.apply(null, played) : null, worst = played.length ? Math.min.apply(null, played) : null;
    var W = c.W, inj = injury(c.p, c.m), risk = 0, why = [];
    if (inj && inj.hard) { risk += 3; why.push(inj.word.toLowerCase()); } else if (inj) { risk += 1; why.push(inj.word.toLowerCase()); }
    if (c.teamGP && c.gp < c.teamGP) { var miss = 1 - c.gp / c.teamGP; if (miss >= 0.3) { risk += 2; } else if (miss >= 0.12) { risk += 1; } }
    if (c.age >= W.late) { risk += 2; why.push('age ' + c.age); } else if (c.age >= W.declineAge) { risk += 1; why.push('age ' + c.age); }
    if (c.exp === 0) { risk += 1; why.push('unproven'); }
    var rl = risk >= 4 ? ['High', '#F1948A'] : risk >= 2 ? ['Medium', '#F0A500'] : ['Low', '#7DDCA3'];
    var gpTxt = c.teamGP ? 'Played ' + c.gp + ' of ' + c.teamGP + ' games' : plural(c.gp, 'game') + ' played';
    var yrs = Math.max(0, W.decline[1] - c.age + 1);
    var winS = c.m.peakYrsLeft > 0 ? plural(c.m.peakYrsLeft, 'peak year') + ' left' : c.age < W.peak[0] ? 'Peak starts at ' + W.peak[0] : 'Past his peak';
    var pj = c.proj;
    return [
      { k: 'Ceiling', v: pj ? f1(pj[2]) + ' pts' : best != null ? f1(best) + ' pts' : '—', s: (pj ? 'DHQ’s best case this week' : 'His best game') + (best != null && pj ? ' · best game ' + f1(best) : ''), i: '▲', c: '#7DDCA3' },
      { k: 'Floor', v: pj ? f1(pj[1]) + ' pts' : worst != null ? f1(worst) + ' pts' : '—', s: (pj ? 'DHQ’s worst case this week' : 'His worst game') + (worst != null && pj ? ' · worst game ' + f1(worst) : ''), i: '▼', c: '#5DADE2' },
      { k: 'Risk', v: rl[0], s: gpTxt + (why.length ? ' · ' + why.join(', ') : ''), i: '!', c: rl[1] },
      { k: 'Window', v: yrs > 0 ? '~' + plural(yrs, 'year') : 'Closed', s: yrs > 0 ? winS + ' · value through ' + W.decline[1] : 'Year to year from here', i: '◷', c: '#E9C85A' }
    ];
  }

  // ── Kickers and defenders: their numbers, Dynasty Read and signals ─────
  function sum(st, keys) { var t = 0; keys.forEach(function (k) { t += num(st && st[k]); }); return t; }
  // Kicking: [made, attempts] overall and by distance (0-39, 40-49, 50+), long, extra points.
  function kick(st) {
    st = st || {};
    var m50 = st.fgm_50p != null ? num(st.fgm_50p) : sum(st, ['fgm_50_59', 'fgm_60p']), x50 = st.fgmiss_50p != null ? num(st.fgmiss_50p) : sum(st, ['fgmiss_50_59', 'fgmiss_60p']);
    var m0 = sum(st, ['fgm_0_19', 'fgm_20_29', 'fgm_30_39']), x0 = sum(st, ['fgmiss_0_19', 'fgmiss_20_29', 'fgmiss_30_39']);
    var fgm = num(st.fgm), fga = num(st.fga) || fgm + num(st.fgmiss);
    return { fg: [fgm, fga], d0: [m0, m0 + x0], d40: [num(st.fgm_40_49), num(st.fgm_40_49) + num(st.fgmiss_40_49)], d50: [m50, m50 + x50],
      lng: num(st.fgm_lng) || null, xp: [num(st.xpm), num(st.xpa) || num(st.xpm) + num(st.xpmiss)] };
  }
  // Defense: tackles, plays behind the line, takeaways and scores.
  function dstat(st) {
    st = st || {};
    var solo = num(st.idp_tkl_solo), ast = num(st.idp_tkl_ast);
    return { tkl: num(st.idp_tkl) || solo + ast, solo: solo, ast: ast, tfl: num(st.idp_tkl_loss), sack: num(st.idp_sack), qbh: num(st.idp_qb_hit), int: num(st.idp_int), pd: num(st.idp_pass_def),
      ff: num(st.idp_ff), fr: num(st.idp_fum_rec), td: num(st.idp_def_td), safe: num(st.idp_safe), blk: num(st.idp_blk_kick) };
  }
  function n1(x) { return Math.round(x * 10) % 10 ? (Math.round(x * 10) / 10).toFixed(1) : String(Math.round(x)); }
  function frac(a) { return a[0] + '/' + a[1]; }
  function pct(a) { return a[1] ? Math.round(a[0] / a[1] * 100) + '%' : '—'; }
  function scoreWords() { return SC.rules ? (SC.demo ? 'IDP scoring, DHQ demo league' : 'league scoring') : SC.label === 'Standard kicking' ? 'standard kicking' : 'Half-PPR'; }
  function kidpCtx(c, ps) {
    var cur = (ps ? ps.seasons : []).filter(function (x) { return x.cur; })[0], st = cur ? cur.st : {};
    var played = c.weeks.filter(function (w) { return w.gp > 0; }), gp = played.length || c.gp || 0;
    c.gpW = gp;
    var best = null, worst = null;
    played.forEach(function (w) { if (!best || w.pts > best.pts) best = w; if (!worst || w.pts < worst.pts) worst = w; });
    c.best = best; c.worst = worst;
    if (played.length >= 3) { // week-to-week swing (coefficient of variation)
      var mean = played.reduce(function (a, w) { return a + w.pts; }, 0) / played.length;
      var sd = Math.sqrt(played.reduce(function (a, w) { return a + (w.pts - mean) * (w.pts - mean); }, 0) / played.length);
      c.cv = mean > 0 ? sd / mean : null;
    }
    if (c.pos === 'K') { c.k = kick(st); return; }
    var d = c.d = dstat(st), r = SC.rules || {};
    c.dpg = gp ? { tkl: d.tkl / gp, sack: d.sack / gp, tfl: d.tfl / gp, pd: d.pd / gp, qbh: d.qbh / gp } : null;
    var total = pts(st, SC.rules), tp = d.solo * num(r.idp_tkl_solo) + d.ast * num(r.idp_tkl_ast) + d.tkl * num(r.idp_tkl);
    c.tackleShare = total > 0 ? Math.max(0, Math.min(1, tp / total)) : null;
    var snp = 0, tm = 0; played.forEach(function (w) { if (w.st.def_snp > 0 && w.st.tm_def_snp > 0) { snp += w.st.def_snp; tm += w.st.tm_def_snp; } });
    c.snapPct = tm > 0 ? snp / tm : null;
  }
  // "the starting outside linebacker for the Jets" from DHQ's depth-chart role (LOLB1, RCB1, SS1, K1 ...)
  var ROLE_POS = [[/^(L|R)?CB$/, 'cornerback'], [/^NB$/, 'nickel corner'], [/^SS$/, 'strong safety'], [/^FS$/, 'free safety'], [/^(L|R)?(DE|EDGE)$/, 'defensive end'], [/^(L|R)?(DT|NT)$/, 'defensive tackle'],
    [/^(L|R)?OLB$/, 'outside linebacker'], [/^MLB$/, 'middle linebacker'], [/^(L|R)?(ILB|WLB|SLB)$/, 'inside linebacker'], [/^K$/, 'kicker']];
  function roleTextK(c) {
    var r = c.m.role || '', mm = /^([A-Z]+)(\d+)$/.exec(r), nick = teamNick(c.p.team);
    if (!mm || !c.p.team) return '';
    var name = ''; ROLE_POS.forEach(function (x) { if (!name && x[0].test(mm[1])) name = x[1]; });
    if (!name) return '';
    var n = +mm[2], one = /^(L|R)/.test(mm[1]) || mm[1] === 'CB' ? 'a starting ' : 'the starting ';
    if (c.pos === 'K') return n === 1 ? 'the ' + nick + ' kicker' : 'a backup kicker for the ' + nick;
    return n === 1 ? one + name + ' for the ' + nick : 'a backup ' + name + ' for the ' + nick + ' (No. ' + n + ' on the depth chart)';
  }
  function plays(n, a, b) { return n ? plural(n, a, b) : ''; }
  function listAnd(a) { a = a.filter(Boolean); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function readKIDP(c) {
    var first = c.p.first, P = POS_NAME[c.pos], W = c.W, st = c.stage, inj = injury(c.p, c.m), age = c.age, isK = c.pos === 'K';
    var who = isK ? 'kicker' : (RPOS_NAME[c.p.rpos] || P[0]), nick = teamNick(c.p.team);
    var prodBy = function (w) {
      return !c.gp ? w + ' has not played a game this season.'
      : c.gp < c.minGP ? w + ' has played ' + plural(c.gp, 'game') + ' this season (' + f1(c.pts) + ' points).'
      : w + ' is averaging <b>' + f1(c.ppg) + '</b> points a game this season, <b>' + c.pos + c.rank + '</b> among ' + P[1] + ' with ' + c.minGP + '+ games.';
    };
    var prod = prodBy(first), status = inj ? '<b>' + esc(inj.say) + '</b>' : '';
    var role = inj && inj.hard ? '' : roleTextK(c);
    var ageS, parts, V;
    var pk = W.peak[0] + '–' + W.peak[1];
    if (isK) {
      ageS = age < W.late - 2 ? 'At ' + age + ', age barely matters for a kicker: many kick well into their late 30s.'
        : age < W.late ? 'At ' + age + ', he is getting close to the age when kickers start to fade (about ' + W.late + '), but a good leg can last a few more years.'
        : 'At ' + age + ', he is past the age when most kickers fade; every good season from here is a bonus.';
      var k = c.k || kick({}), gp = c.gpW || c.gp;
      var kickS = !k.fg[1] && !k.xp[1] ? '' : 'He has made <b>' + k.fg[0] + ' of ' + k.fg[1] + '</b> field goals' + (k.fg[1] ? ' (' + pct(k.fg) + ')' : '')
        + (k.d50[1] ? ', <b>' + k.d50[0] + ' of ' + k.d50[1] + '</b> from 50+' : ', none from 50+') + (k.lng ? ' (long ' + k.lng + ')' : '')
        + (k.xp[1] ? ', and ' + k.xp[0] + ' of ' + k.xp[1] + ' extra points.' : '.');
      var offS = gp && (k.fg[1] || k.xp[1]) ? 'Kicker points follow the offense: the ' + nick + ' give him about ' + n1(k.fg[1] / gp) + ' field-goal tries and ' + n1(k.xp[1] / gp) + ' extra points a game.' : '';
      var rangeS = k.d50[0] >= 3 ? 'His long range is a real edge' + (SC.rules && num(SC.rules.fgm_yds) ? ' in this scoring, which pays for every yard of a field goal.' : ': 50-yard kicks pay 5 points instead of 3.')
        : k.fg[1] >= 8 && k.fg[0] / k.fg[1] < 0.8 ? 'His accuracy (' + pct(k.fg) + ') is the worry: missed kicks cost points and, sooner or later, the job.' : '';
      var lesson = 'Kicker value is low and easy to replace: don’t pay for a kicker in a trade or a startup draft.';
      switch (st.key) {
        case 'rookie':
          V = st.starter ? 'Rookie kicker who won the job: a cheap weekly starter, never one to pay for.' : 'Rookie kicker: worth a roster spot only once he is kicking well every week.';
          parts = [role ? 'In his first NFL season, ' + first + ' is ' + role + '.' : '', prodBy('He'), kickS, lesson]; break;
        case 'developing':
          V = 'Young kicker still settling in: a free pickup, not an asset to trade for.';
          parts = [prod, kickS, rangeS || offS, lesson]; break;
        case 'breakout':
          V = 'Breakout year for a young kicker: enjoy the points, but kicker scoring swings from year to year.';
          parts = [prod, kickS, offS, lesson]; break;
        case 'elite':
          V = 'One of the best kickers in football: a set-and-forget starter, but still not worth paying for.';
          parts = [prod, kickS, rangeS || offS, lesson, status || ageS]; break;
        case 'prime':
          V = 'Reliable starting kicker: start him every week, but never pay for a kicker.';
          parts = [prod, kickS, offS, rangeS || lesson, status || ageS]; break;
        case 'aging':
          V = st.starter ? 'Veteran kicker still getting it done (' + age + '): age matters little until the late 30s, so keep starting him.' : 'Aging kicker (' + age + ') who is no longer a weekly starter: replace him off waivers.';
          parts = [prod, kickS, ageS, status || lesson]; break;
        case 'late':
          V = st.starter ? 'Late-career kicker (' + age + ') still producing: start him while the leg holds up, and keep a backup plan.' : 'Late-career kicker (' + age + ') who is no longer a weekly starter: let him go.';
          parts = [ageS, prod, kickS, status || lesson]; break;
        default:
          V = 'Not a weekly starter: kickers like him are easy to find on waivers.';
          parts = [role ? 'He is ' + role + '.' : prod, role ? prod : '', kickS, status || lesson];
      }
    } else {
      ageS = age < W.peak[0] ? 'At ' + age + ', the ' + P[0] + ' age curve puts his peak at ' + pk + ', so his best years should still be ahead.'
        : age <= W.peak[1] ? 'At ' + age + ', he is in the ' + P[0] + ' peak window (' + pk + ')' + (c.m.peakYrsLeft > 0 ? ' with about ' + plural(c.m.peakYrsLeft, 'peak year') + ' left.' : '.')
        : age <= W.decline[1] ? 'At ' + age + ', he is past the ' + P[0] + ' peak (' + pk + ') and into the years when defenders usually lose a step.'
        : 'At ' + age + ', he is ' + plural(age - W.peak[1], 'year') + ' past the usual ' + P[0] + ' peak (' + pk + '); every good season from here is a bonus.';
      var d = c.d || dstat({}), g = c.dpg;
      // per game: tackles, plus sacks (DL / LB) or passes defended (DB) when there are enough of them; the rest as season totals
      var sk = function (n) { return n1(n) + (n === 1 ? ' sack' : ' sacks'); };
      var pgA = [], tot = [];
      if (g) {
        pgA.push('<b>' + n1(g.tkl) + '</b> tackles');
        if (c.pos === 'DB') { if (g.pd >= 0.3) pgA.push('<b>' + n1(g.pd) + '</b> passes defended'); else if (d.pd) tot.push(plural(d.pd, 'pass defended', 'passes defended')); if (d.sack) tot.push(sk(d.sack)); }
        else { if (g.sack >= 0.25) pgA.push('<b>' + n1(g.sack) + '</b> sacks'); else if (d.sack) tot.push(sk(d.sack)); if (d.tfl) tot.push(plural(d.tfl, 'tackle for loss', 'tackles for loss')); }
      }
      var big = [plays(d.int, 'interception'), plays(d.ff, 'forced fumble'), plays(d.fr, 'fumble recovery', 'fumble recoveries'), plays(d.td, 'touchdown'), plays(d.safe, 'safety', 'safeties'), plays(d.blk, 'blocked kick')].filter(Boolean);
      tot = tot.concat(big);
      var line = !g ? '' : 'Per game he makes ' + listAnd(pgA) + (tot.length ? '; this season he also has ' + listAnd(tot) + '.' : '; he has no takeaways yet this season.');
      var steadyPos = c.pos === 'LB' || /^S/.test(c.p.rpos), bigPos = c.pos === 'DL' || c.p.rpos === 'CB';
      // steadiness: how much of his scoring is tackles (steady) vs big plays (sacks, takeaways,
      // passes defended: boom-or-bust), and how much his weekly points actually swing
      var sh = c.tackleShare, style = '', boom = false, bigWhat = c.pos === 'DB' ? 'passes defended and takeaways' : 'sacks, tackles for loss and takeaways';
      if (sh != null && c.gp >= 3) {
        var share = Math.round(sh * 100), swing = c.cv != null && c.cv >= 0.5;
        if (sh >= 0.5) style = 'About ' + share + '% of his points come from tackles, the steadiest kind of IDP scoring' + (steadyPos ? ': tackle volume at his position carries over from week to week.' : '.');
        else if (!swing) style = 'Tackles give him a steady floor, even though only about ' + share + '% of his points come from them in this scoring; the rest is ' + bigWhat + '.';
        else { boom = true; style = (share >= 5 ? 'Only about ' + share + '% of his points come from tackles; the rest is ' : 'Almost all of his points come from ') + bigWhat + ', which swing a lot from week to week' + (bigPos ? ', as they do for most ' + (c.pos === 'DL' ? 'pass rushers' : 'cornerbacks') : '') + '. Expect boom-or-bust games.'; }
      }
      c.boom = boom;
      var snap = c.snapPct != null ? Math.round(c.snapPct * 100) : null;
      var snapS = snap == null ? '' : snap >= 85 ? 'plays ' + snap + '% of the defense’s snaps, an every-down role' : snap >= 60 ? 'plays ' + snap + '% of the defense’s snaps' : 'plays only ' + snap + '% of the defense’s snaps, a rotational role that caps his volume';
      var roleS = role ? 'He is ' + role + (snapS ? ' and ' + snapS : '') + '.' : snapS ? 'He ' + snapS + '.' : '';
      var lc = FEED.lc || {}, per1 = lc.sc && lc.sc[c.pos], teams = lc.teams;
      var leagueS = SC.demo
        ? 'IDP value depends on your league’s settings; these points use the DHQ demo league’s rules' + (per1 && teams ? ', where ' + teams + ' teams each start about ' + Math.round(per1) + ' ' + c.pos + ' (flex included)' : '') + '.'
        : 'IDP value depends on the league: ' + (per1 && teams ? 'this one starts about ' + Math.round(per1) + ' ' + c.pos + ' a team (flex included), so a weekly ' + c.pos + ' starter matters here.' : 'how many defenders it starts and how it scores them.');
      var nm = who;
      switch (st.key) {
        case 'rookie':
          V = st.starter ? 'Rookie ' + nm + ' already scoring like an IDP starter: in deep IDP leagues, buy before the price catches up.'
            : (tier(c) === 'Elite' || tier(c) === 'Starter') ? 'Premium rookie defender: DHQ likes the talent and the role. Hold and let him grow.'
            : 'Rookie defender still finding his role: a cheap stash in deep IDP leagues.';
          parts = [role ? 'In his first NFL season, ' + first + ' is ' + role + '.' : 'In his first NFL season, ' + first + ' is still working his way into the lineup.', prodBy('He'), line, style || ageS, status || leagueS]; break;
        case 'developing':
          V = 'Young ' + nm + ' still waiting on a full-time role: a stash in deep IDP leagues, a pass in shallow ones.';
          parts = [roleS || prod, roleS ? prod : '', line, ageS, status || 'The next step is an every-down role; until then he is a stash.']; break;
        case 'breakout':
          V = 'Breakout year at ' + age + ': the production is real. ' + (boom ? 'Sack and turnover spikes are harder to repeat than tackle volume.' : 'Tackle volume like his tends to stick.');
          parts = [prod, line, style, roleS, status || ageS]; break;
        case 'prime':
          V = 'Starting-level ' + nm + ' in his prime (' + age + '): a solid IDP starter. What he is worth depends on how your league scores defenders.';
          parts = [prod, line, roleS, style, status || leagueS]; break;
        case 'elite':
          V = 'Elite ' + nm + ' at ' + age + ': a top IDP scorer, and one of the few defenders worth paying for in deep IDP leagues.';
          parts = [prod, line, style || roleS, leagueS, status || ageS]; break;
        case 'aging':
          V = st.starter ? 'Aging but still producing (' + age + '): start him, and sell if someone pays for the name.' : 'Aging and fading (' + age + '): IDP value goes quickly at this stage. Move on.';
          parts = [ageS, prod, line, style, status || leagueS]; break;
        case 'late':
          V = st.starter ? 'Late-career defender (' + age + ') still producing: enjoy the points, but don’t pay for him.' : 'Late career (' + age + ') and no longer an IDP starter: there is little value left.';
          parts = [ageS, prod, line, status || style]; break;
        default:
          V = c.rank && c.rank <= 2 * cut(c.pos).starter && (tier(c) === 'Elite' || tier(c) === 'Starter')
            ? 'Scoring just outside the top ' + cut(c.pos).starter + ' (' + c.pos + c.rank + ' per game): a starter in deep IDP leagues, depth in shallow ones. Don’t sell low.'
            : 'Depth defender: a bye-week fill-in in deep IDP leagues, not a player to plan around.';
          parts = [prod, line, roleS, style, status || leagueS];
      }
    }
    if (inj && inj.hard) parts = [parts[0], status].concat(parts.slice(1).filter(function (x) { return x !== status; }));
    var out = []; parts.forEach(function (x) { if (x && out.indexOf(x) < 0 && out.length < 5) out.push(x); });
    return { verdict: V, text: out.join(' ') };
  }
  function signalsKIDP(c) {
    var W = c.W, inj = injury(c.p, c.m), risk = 0, why = [];
    if (inj && inj.hard) { risk += 3; why.push(inj.word.toLowerCase()); } else if (inj) { risk += 1; why.push(inj.word.toLowerCase()); }
    if (c.teamGP && c.gp < c.teamGP) { var miss = 1 - c.gp / c.teamGP; if (miss >= 0.3) { risk += 2; } else if (miss >= 0.12) { risk += 1; } }
    if (c.age >= W.late) { risk += 2; why.push('age ' + c.age); } else if (c.age >= W.declineAge) { risk += 1; why.push('age ' + c.age); }
    if (c.exp === 0) { risk += 1; why.push('unproven'); }
    if (c.boom) { risk += 1; why.push('boom-or-bust scoring'); }
    var rl = risk >= 4 ? ['High', '#F1948A'] : risk >= 2 ? ['Medium', '#F0A500'] : ['Low', '#7DDCA3'];
    var gpTxt = c.teamGP ? 'Played ' + c.gp + ' of ' + c.teamGP + ' games' : plural(c.gp, 'game') + ' played';
    var yrs = Math.max(0, W.valueEnd - c.age + 1);
    var winS = c.m.peakYrsLeft > 0 && c.age <= W.peak[1] ? plural(Math.min(c.m.peakYrsLeft, W.peak[1] - c.age + 1), 'peak year') + ' left' : c.age < W.peak[0] ? 'Peak starts at ' + W.peak[0] : 'Past his peak';
    var gm = function (w) { return 'Week ' + w.wk + (w.opp ? (w.away ? ' at ' : ' vs ') + w.opp : ''); };
    return [
      { k: 'Ceiling', v: c.best ? f1(c.best.pts) + ' pts' : '—', s: c.best ? 'His best game · ' + gm(c.best) : 'No games yet this season', i: '▲', c: '#7DDCA3' },
      { k: 'Floor', v: c.worst ? f1(c.worst.pts) + ' pts' : '—', s: c.worst ? 'His worst game · ' + gm(c.worst) : 'No games yet this season', i: '▼', c: '#5DADE2' },
      { k: 'Risk', v: rl[0], s: gpTxt + (why.length ? ' · ' + why.join(', ') : ''), i: '!', c: rl[1] },
      { k: 'Window', v: yrs > 0 ? '~' + plural(yrs, 'year') : 'Closed', s: yrs > 0 ? winS + ' · value through ' + W.valueEnd : 'Year to year from here', i: '◷', c: '#E9C85A' }
    ];
  }

  // ── ESPN: id lookup, athlete, awards, college stats ────────────────────
  var ESPN = {};
  var ESPN_TEAM = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
  function espnId(p) {
    if (p.espn) return Promise.resolve(String(p.espn));
    var map = load(KEY.espn) || {};
    if (map[p.id]) return Promise.resolve(map[p.id]);
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/(jr|sr|ii|iii|iv)$/, ''); };
    return getJSON('https://site.web.api.espn.com/apis/common/v3/search?query=' + encodeURIComponent(p.name) + '&limit=10&type=player').then(function (r) {
      var items = (r.items || []).filter(function (it) { return it.league === 'nfl' && norm(it.displayName) === norm(p.name); });
      var byPos = items.filter(function (it) { var a = it.position && it.position.abbreviation; return p.kidp ? !!a && (SL_GROUP[a] === p.pos || (IDP[p.pos] && IDP[SL_GROUP[a]])) : a === p.pos; });
      var pick = byPos.filter(function (it) { return (it.teamRelationships || []).some(function (t) { var a = t.core && t.core.abbreviation; return (ESPN_TEAM[a] || a) === p.team; }); })[0] || byPos[0] || null;
      if (!pick) return null;
      map[p.id] = String(pick.id); store(KEY.espn, map); return map[p.id];
    });
  }
  function espnData(p) {
    if (ESPN[p.id]) return ESPN[p.id];
    var base = 'https://site.web.api.espn.com/apis/common/v3/sports/football/';
    ESPN[p.id] = espnId(p).then(function (id) {
      if (!id) return { none: true };
      return Promise.all([
        getJSON(base + 'nfl/athletes/' + id).catch(function () { return null; }),
        getJSON(base + 'nfl/athletes/' + id + '/overview').catch(function () { return null; })
      ]).then(function (r) {
        var a = (r[0] && r[0].athlete) || {}, cid = a.collegeAthlete && a.collegeAthlete.id;
        var out = { id: id, athlete: a, awards: (r[1] && r[1].awards) || [], college: null, ok: !!(r[0] || r[1]) };
        if (!cid) return out;
        return getJSON(base + 'college-football/athletes/' + cid + '/stats').then(function (cs) { out.college = cs; return out; }).catch(function () { return out; });
      });
    }).catch(function () { return { failed: true }; });
    return ESPN[p.id];
  }

  // ── News (Sleeper) ─────────────────────────────────────────────────────
  var NEWS = {};
  function news(pid) {
    if (!NEWS[pid]) NEWS[pid] = getJSON('https://api.sleeper.app/players/nfl/' + encodeURIComponent(pid) + '/news?limit=10').then(function (a) {
      return (Array.isArray(a) ? a : []).filter(function (n) { return n && n.metadata && n.metadata.title; }).sort(function (x, y) { return (y.published || 0) - (x.published || 0); });
    }).catch(function () { return null; });
    return NEWS[pid];
  }
  // Other sites' rankings and projections stay out: drop any sentence that ranks or projects.
  function cleanBlurb(s) {
    var parts = String(s || '').replace(/\s+/g, ' ').trim().replace(/([.!?])\s+(?=[A-Z"\u201C])/g, '$1\u0001').split('\u0001');
    return parts.filter(function (x) { return x && !/\b(rank(s|ed|ing|ings)?|project(s|ed|ion|ions)?|ECR|consensus)\b/i.test(x); }).join(' ').trim();
  }
  var SOURCES = { rotoballer: 'RotoBaller', rotowire: 'RotoWire', fantasypros: 'FantasyPros', fantasy_pros: 'FantasyPros', rotoworld: 'Rotoworld', sleeper: 'Sleeper', numberfire: 'numberFire', pff: 'PFF' };

  // ── DHQ weekly projections from the lock files (optional) ─────────────
  // which: the lock file's scorings to read, first one present wins ('half' = Half-PPR; for
  // kickers that is standard kicking). Offense reads 'half' (as before); kickers and defenders
  // the scoring their card is in (see lockScoring). A 0 for a kicker / defender = no line, left out.
  var LOCKS = {}, LRAW = {};
  function lockFile(n) {
    if (!LRAW[n]) LRAW[n] = getJSON(CFG.locksBase + SEASON + '-w' + n + '.json');
    return LRAW[n];
  }
  function lockWeek(n, which) {
    which = which || ['half'];
    var lk = n + '|' + which.join(',');
    if (LOCKS[lk]) return LOCKS[lk];
    var k = KEY.lock + SEASON + '_w' + n + (which[0] === 'half' ? '' : '_' + which[0]), c = load(k);
    if (c && n < (CUR.week || 99)) return (LOCKS[lk] = Promise.resolve(c));
    LOCKS[lk] = lockFile(n).then(function (d) {
      var sc = d.scorings || {}, use = which.filter(function (w) { return sc[w] && sc[w].players; })[0] || 'half';
      var hp = (sc[use] && sc[use].players) || {}, out = {}, main = which[0] === 'half'; // main: the shared Half-PPR table (offense + kickers)
      Object.keys(hp).forEach(function (pid) {
        var f = FEED.p[pid], v = hp[pid] && hp[pid][0]; if (!f || v == null) return;
        var keep = KIDP[f[1]] ? v > 0 && (!main || f[1] === 'K') : main;
        if (keep) out[pid] = Math.round(v * 10) / 10;
      });
      if (n < (CUR.week || 99)) store(k, out);
      return out;
    }).catch(function () { return null; });
    return LOCKS[lk];
  }
  function lockScoring(pos) {
    if (!KIDP[pos]) return ['half'];
    var lg = 'league_' + (SC.demo ? DEMO.id : LEAGUE.id);
    return pos === 'K' ? (SC.rules ? [lg, 'half'] : ['half']) : lg === 'league_' + DEMO.id ? [lg] : [lg, 'league_' + DEMO.id];
  }

  // ── DHQ value history (one value a day per tracked league, optional) ──
  // index.json says which leagues are tracked (so an untracked one costs no 404);
  // a league file is fetched once per page and only the players opened are kept
  // in localStorage (KEY.vh + league: { ts, last, p: { pid: [[date, value], ...] } }).
  var VIDX = null, VH = {}, VS = {};
  function valuesIndex() {
    if (!VIDX) {
      VIDX = cached(KEY.vidx, TTL.values, CFG.valuesBase + 'index.json', function (d) {
        var L = {}; (d.leagues || []).forEach(function (x) { if (x && x.id && x.last) L[x.id] = { label: x.label || '', name: x.name || '', last: x.last }; });
        return { def: d['default'] || DEMO.id, L: L };
      });
      VIDX.catch(function () { VIDX = null; });
    }
    return VIDX;
  }
  // → { lid, fallback, label, name, pts: [[ 'YYYY-MM-DD', value ], ...] } or null (no history anywhere)
  function valueSeries(lid, pid) {
    var vk = lid + '|' + pid;
    if (VS[vk]) return VS[vk];
    VS[vk] = valuesIndex().then(function (ix) {
      var use = ix.L[lid] ? lid : ix.L[ix.def] ? ix.def : ix.L[DEMO.id] ? DEMO.id : null;
      if (!use) return null;
      var m = ix.L[use], res = function (pts) { return { lid: use, fallback: use !== lid, label: m.label, name: m.name, pts: pts }; };
      var ck = KEY.vh + use, c = load(ck);
      if (!(c && c.last === m.last && c.p && Date.now() - c.ts < TTL.values)) c = { ts: Date.now(), last: m.last, p: {}, o: [] };
      if (c.p[pid]) return res(c.p[pid]);
      if (!VH[use]) { VH[use] = getJSON(CFG.valuesBase + encodeURIComponent(use) + '.json'); VH[use].catch(function () { delete VH[use]; }); }
      return VH[use].then(function (h) {
        var a = (h.p && h.p[pid]) || [], pts = [];
        for (var i = 0; i < a.length && i < h.dates.length; i++) if (a[i] > 0) pts.push([h.dates[i], a[i]]);
        c.p[pid] = pts; c.o = (c.o || []).filter(function (x) { return x !== pid; }).concat(pid);
        while (c.o.length > 40) delete c.p[c.o.shift()];
        store(ck, c);
        return res(pts);
      });
    });
    VS[vk].catch(function () { delete VS[vk]; });
    return VS[vk];
  }

  // ── Highlights (NFL channel clips the Lab's job collected, optional) ──
  var HIDX = null, HLP = {};
  var YT_ID = /^[\w-]{6,20}$/;
  function hlIndex() {
    if (!HIDX) {
      HIDX = cached(KEY.hidx, TTL.hl, CFG.highlightsBase + 'index.json', function (d) {
        var o = {}; Object.keys(d.players || {}).forEach(function (pid) { var e = d.players[pid]; if (e && e.n > 0) o[pid] = e.at || '1'; });
        return o;
      });
      HIDX.catch(function () { HIDX = null; });
    }
    return HIDX;
  }
  // → { clips: [{ id, title, published, dur }], at } or null (none collected)
  function highlights(pid) {
    if (HLP[pid]) return HLP[pid];
    HLP[pid] = hlIndex().then(function (ix) {
      if (!ix[pid]) return null;
      var c = load(KEY.hl) || {}; c.p = c.p || {}; c.o = c.o || [];
      var e = c.p[pid];
      if (e && e.at === ix[pid]) return e.d;
      return getJSON(CFG.highlightsBase + encodeURIComponent(pid) + '.json').then(function (d) {
        var clips = (d.clips || []).filter(function (x) { return x && YT_ID.test(x.id); }).slice(0, 8).map(function (x) {
          return { id: x.id, title: String(x.title || ''), published: x.published || '', dur: +x.dur || 0 };
        });
        var out = clips.length ? { clips: clips, at: d.fetched || '' } : null;
        c.p[pid] = { at: ix[pid], d: out }; c.o = c.o.filter(function (x) { return x !== pid; }).concat(pid);
        while (c.o.length > 30) delete c.p[c.o.shift()];
        store(KEY.hl, c);
        return out;
      });
    }).catch(function () { delete HLP[pid]; return null; });
    return HLP[pid];
  }

  // ── League history (per league): Sleeper drafts + transactions, feed trades ─
  function leagueHistory(L) {
    if (!L || !L.FEED) return Promise.resolve(null);
    if (L.LH) return L.LH;
    var F = L.FEED, c = load(KEY.league + L.id);
    if (c && Date.now() - c.ts < TTL.league) return (L.LH = Promise.resolve(c.data));
    var A = 'https://api.sleeper.app/v1/';
    var chain = [];
    function walk(id) {
      if (!id || id === '0' || chain.length > 10) return Promise.resolve();
      return getJSON(A + 'league/' + id).then(function (l) { chain.push({ id: l.league_id, season: +l.season, draft: l.draft_id }); return walk(l.previous_league_id); });
    }
    L.LH = walk(L.id).then(function () {
      return pool(chain, 3, function (L) {
        var lastWeek = L.season === (CUR.season || SEASON) ? Math.max(1, CUR.week || 18) : 18, wks = [];
        for (var w = 1; w <= lastWeek; w++) wks.push(w);
        return Promise.all([
          getJSON(A + 'league/' + L.id + '/users').catch(function () { return []; }),
          getJSON(A + 'league/' + L.id + '/rosters').catch(function () { return []; }),
          L.draft ? getJSON(A + 'draft/' + L.draft + '/picks').catch(function () { return []; }) : [],
          L.draft ? getJSON(A + 'draft/' + L.draft).catch(function () { return null; }) : null,
          pool(wks, 6, function (w) { return getJSON(A + 'league/' + L.id + '/transactions/' + w).catch(function () { return []; }); })
        ]).then(function (r) {
          var users = {}, rosters = {}, ev = [];
          (r[0] || []).forEach(function (u) { users[u.user_id] = [(u.metadata && u.metadata.team_name) || u.display_name, u.display_name, u.avatar || '']; });
          (r[1] || []).forEach(function (x) { rosters[x.roster_id] = x.owner_id; });
          var dr = r[3] || {}, rounds = (dr.settings && dr.settings.rounds) || 0, startup = rounds > 10, dts = dr.start_time || Date.UTC(L.season, 4, 1);
          (r[2] || []).forEach(function (pk) { if (F.p[pk.player_id]) ev.push([pk.player_id, 'draft', dts, 0, pk.roster_id, pk.round, pk.draft_slot, pk.pick_no, startup ? 1 : 0, pk.picked_by || '']); });
          (r[4] || []).forEach(function (list, wi) {
            (list || []).forEach(function (t) {
              if (t.status !== 'complete' || t.type === 'trade' || t.type === 'commissioner') return;
              var bid = t.settings && t.settings.waiver_bid;
              Object.keys(t.adds || {}).forEach(function (pid) { if (F.p[pid]) ev.push([pid, t.type === 'waiver' ? 'waiver' : 'fa', t.status_updated || t.created, wks[wi], t.adds[pid], bid || 0]); });
              Object.keys(t.drops || {}).forEach(function (pid) { if (F.p[pid]) ev.push([pid, 'drop', t.status_updated || t.created, wks[wi], t.drops[pid]]); });
            });
          });
          return { season: L.season, users: users, rosters: rosters, ev: ev };
        });
      });
    }).then(function (seasons) {
      var data = { seasons: {}, ev: {} };
      (seasons || []).forEach(function (s) {
        if (!s) return;
        data.seasons[s.season] = { users: s.users, rosters: s.rosters };
        s.ev.forEach(function (e) { var pid = e[0]; (data.ev[pid] = data.ev[pid] || []).push([s.season].concat(e.slice(1))); });
      });
      store(KEY.league + L.id, { ts: Date.now(), data: data });
      return data;
    }).catch(function () { L.LH = null; return null; });
    return L.LH;
  }
  function teamNow(rid) { var t = FEED.teams[rid]; return t ? t[0] : 'Team ' + rid; }
  // Historical team name, with today's name when it has changed since.
  function teamThen(LHd, season, rid) { var a = teamAt(LHd, season, rid), b = teamNow(rid); return esc(a) + (a !== b ? ' <span style="color:var(--faint);font-weight:500">(now ' + esc(b) + ')</span>' : ''); }
  function teamAt(LHd, season, rid) {
    var cur = FEED.teams[rid];
    var S = LHd && LHd.seasons[season], uid = S && S.rosters[rid], u = uid && S.users[uid];
    if (u) return u[0];
    return cur ? cur[0] : 'Team ' + rid;
  }
  // The player's chain of custody in the league, oldest first.
  function custody(pid, LHd) {
    var out = [];
    (LHd && LHd.ev[pid] || []).forEach(function (e) {
      // e: [season, type, ts, week, rid, ...]
      if (e[1] === 'draft') out.push({ type: 'draft', season: e[0], ts: e[2], rid: e[4], round: e[5], slot: e[6], pick: e[7], startup: !!e[8], uid: e[9] });
      else out.push({ type: e[1], season: e[0], ts: e[2], week: e[3], rid: e[4], bid: e[5] || 0 });
    });
    FEED.trades.forEach(function (t) {
      var to = null; Object.keys(t.sides).forEach(function (rid) { if (t.sides[rid][0].indexOf(pid) >= 0) to = +rid; });
      if (to == null) return;
      var from = Object.keys(t.sides).map(Number).filter(function (r) { return r !== to; });
      out.push({ type: 'trade', season: t.s, week: t.w, ts: t.t, rid: to, from: from, t: t });
    });
    out.sort(function (a, b) { return a.ts - b.ts || (a.type === 'drop' ? -1 : 0) - (b.type === 'drop' ? -1 : 0); });
    return out;
  }
  function pickName(rd, slot) { return rd + '.' + (slot < 10 ? '0' : '') + slot; }
  function howAcquired(pid, LHd) {
    var rid = FEED.own[pid]; if (rid == null) return null;
    var ev = custody(pid, LHd).filter(function (e) { return e.rid === rid && e.type !== 'drop'; });
    var e = ev[ev.length - 1]; if (!e) return null;
    if (e.type === 'trade') return { e: e, text: 'Traded for in Week ' + e.week + ', ' + e.season + (e.from.length ? ' from ' + esc(teamNow(e.from[0])) : '') };
    if (e.type === 'draft') return { e: e, text: 'Drafted at ' + pickName(e.round, e.slot) + ' in the ' + e.season + ' ' + (e.startup ? 'startup' : 'rookie') + ' draft' };
    if (e.type === 'waiver') return { e: e, text: 'Waiver claim in Week ' + e.week + ', ' + e.season + (e.bid ? ' ($' + e.bid + ' FAAB)' : '') };
    return { e: e, text: 'Free-agent pickup in Week ' + e.week + ', ' + e.season };
  }

  // ═════════════════════════════ RENDER ═════════════════════════════════
  var STATE = { pid: null, league: false, tab: 'overview', ctx: null, ps: null, seq: 0, open: false, me: null, meName: null, onClose: null, onLeagueChange: null };
  var TABS = [['overview', 'Overview'], ['stats', 'Stats'], ['news', 'News'], ['league', 'League History'], ['college', 'College'], ['awards', 'Awards']];
  function ht(inches) { var n = +inches; if (!n) return inches || ''; return Math.floor(n / 12) + '′' + (n % 12) + '″'; }
  function initials(n) { return String(n).split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2); }
  function empty(icon, title, text, extra) { return '<div class="dhqpc-empty"><i aria-hidden="true">' + icon + '</i><b>' + title + '</b>' + (text ? '<p>' + text + '</p>' : '') + (extra || '') + '</div>'; }

  function heroHTML(c) {
    var p = c.p, inj = injury(p, c.m), tc = (TEAMS[p.team] && TEAMS[p.team][1]) || '#D4AF37';
    var seasonTxt = p.exp === 0 ? 'Rookie' : p.exp != null ? ord(p.exp + 1) + ' NFL season' : '';
    var bio = [c.age != null ? '<span>Age <b>' + c.age + '</b></span>' : '', seasonTxt ? '<span><b>' + seasonTxt + '</b></span>' : '',
      p.height || p.weight ? '<span><b>' + esc(ht(p.height)) + (p.weight ? ' · ' + esc(p.weight) + ' lb' : '') + '</b></span>' : '',
      p.college ? '<span>' + esc(p.college) + '</span>' : ''].filter(Boolean).join('');
    var tags = '<button type="button" class="dhqpc-tag" style="--tc:' + c.stage.color + '" title="' + esc(c.stage.why) + '" data-act="stage">' + c.stage.label + '</button>'
      + (inj ? '<span class="dhqpc-tag ' + (inj.hard ? 'dhqpc-inj' : 'dhqpc-q') + '">' + esc(inj.label) + '</span>' : '');
    var R = RANK[c.pos];
    var ranks = (c.valueRank ? '<span><b>' + c.pos + c.valueRank + '</b> by value</span>' : '')
      + (c.scoreRank ? '<span><b>' + c.pos + c.scoreRank + '</b> in scoring</span>' : '<span>No points yet this season</span>');
    return '<header class="dhqpc-hero" style="--team:' + tc + '"><div class="dhqpc-hero-g">'
      + '<div class="dhqpc-shot"><div class="dhqpc-fr"><span class="dhqpc-ini">' + esc(initials(p.name)) + '</span><img src="https://sleepercdn.com/content/nfl/players/' + encodeURIComponent(p.id) + '.jpg" alt="" decoding="async"></div>'
      + (p.num != null ? '<span class="dhqpc-jersey" aria-label="Jersey number ' + esc(p.num) + '">#' + esc(p.num) + '</span>' : '') + '</div>'
      + '<div class="dhqpc-who"><h2 id="dhqpc-pcName">' + esc(p.name) + '</h2>'
      + '<div class="dhqpc-team">' + (p.team ? '<img src="' + teamLogo(p.team) + '" alt="">' : '') + '<span>' + esc(teamName(p.team)) + '</span><span class="dhqpc-pos" style="--posc:' + POS_COLOR[c.pos] + '"' + (p.kidp && p.rpos !== c.pos ? ' title="' + esc(p.rpos) + ', ' + POS_NAME[c.pos][1] + ' group"' : '') + '>' + (p.kidp && p.rpos !== c.pos ? esc(p.rpos) + ' · ' + c.pos : c.pos) + '</span></div>'
      + '<div class="dhqpc-bio">' + bio + '</div>'
      + '<div class="dhqpc-tags">' + tags + '</div>'
      + '<button type="button" class="dhqpc-hl-btn" data-act="hl" aria-expanded="false" aria-controls="dhqpc-hl"><i aria-hidden="true">▶</i>Highlights<span class="dhqpc-hl-n" id="dhqpc-hl-n" hidden></span></button></div>'
      + '<div class="dhqpc-val"><span class="dhqpc-val-k">DHQ Value</span><span class="dhqpc-val-n">' + (c.value ? fmt(c.value) : '—') + '</span><span class="dhqpc-val-t" title="Where his DHQ value ranks among ' + POS_NAME[c.pos][1] + '">' + tier(c) + (p.kidp && tier(c) !== '—' ? ' ' + c.pos : '') + ' value</span>'
      + '<div class="dhqpc-val-r">' + ranks + '</div></div>'
      + '</div></header>'
      + '<section class="dhqpc-hl" id="dhqpc-hl" hidden aria-label="Highlights">' + highlightsHTML(c) + '</section>';
  }
  function hlLinks(c) {
    var q = encodeURIComponent(c.p.name + ' highlights');
    return '<a class="dhqpc-btn dhqpc-gold" target="_blank" rel="noopener" href="https://www.youtube.com/@NFL/search?query=' + q + '">Watch on the NFL’s channel ↗</a>'
      + '<a class="dhqpc-btn" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=' + q + '">Search all of YouTube ↗</a>';
  }
  // No clips collected for him (yet): link out.
  function highlightsHTML(c) {
    return '<div class="dhqpc-hl-v"><div class="dhqpc-hl-in"><div class="dhqpc-play" aria-hidden="true">▶</div>'
      + '<h4>Highlights</h4><p>Clips appear here once DHQ has collected ' + esc(c.p.first) + '’s highlights. For now, watch them on YouTube: the NFL’s official channel is the first link.</p>'
      + '<div class="dhqpc-hl-acts">' + hlLinks(c) + '</div></div></div>';
  }
  function ymd(s) { var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00Z' : s); return isNaN(d) ? null : d; }
  function dayLong(s) { var d = ymd(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''; }
  function dayShort(s) { var d = ymd(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ''; }
  function clipLen(sec) { return sec > 0 ? Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2) : ''; }
  function clipMeta(x) { return [dayLong(x.published), clipLen(x.dur)].filter(Boolean).join(' · '); }
  function thumb(id) { return 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/mqdefault.jpg'; }
  // Clips: a main player (its iframe is added only when the panel opens) + a list to switch.
  function hlPlayerHTML(c, H) {
    var x = H.clips[0];
    var list = H.clips.map(function (k, i) {
      return '<li><button type="button" class="dhqpc-clip" data-act="clip" data-i="' + i + '" aria-pressed="' + (i === 0) + '">'
        + '<span class="dhqpc-clip-t"><img src="' + thumb(k.id) + '" alt="" loading="lazy" decoding="async">' + (k.dur ? '<em>' + clipLen(k.dur) + '</em>' : '') + '</span>'
        + '<span class="dhqpc-clip-x"><b>' + esc(k.title) + '</b><small>' + esc(dayShort(k.published)) + '</small></span></button></li>';
    }).join('');
    return '<div class="dhqpc-hlp"><div class="dhqpc-hl-main">'
      + '<div class="dhqpc-hl-frame" id="dhqpc-hl-frame">' + posterHTML(x) + '</div>'
      + '<div class="dhqpc-hl-cap"><h4 id="dhqpc-hl-title">' + esc(x.title) + '</h4><p id="dhqpc-hl-meta">' + esc(clipMeta(x)) + '</p></div></div>'
      + '<div class="dhqpc-hl-side"><ol class="dhqpc-hl-list" aria-label="' + plural(H.clips.length, 'clip') + '">' + list + '</ol></div></div>'
      + '<div class="dhqpc-hl-foot"><p>Clips from the NFL’s official YouTube channel' + (H.at ? ', collected ' + esc(dayShort(H.at)) : '') + '. Played through YouTube’s privacy-enhanced player.</p>'
      + '<div class="dhqpc-hl-acts">' + hlLinks(c) + '</div></div>';
  }
  function posterHTML(x) { return '<img class="dhqpc-hl-poster" src="' + thumb(x.id) + '" alt="" decoding="async"><span class="dhqpc-play" aria-hidden="true">▶</span>'; }
  function iframeHTML(x, autoplay) {
    return '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(x.id) + '?rel=0&modestbranding=1&playsinline=1' + (autoplay ? '&autoplay=1' : '') + '" title="' + esc(x.title) + '"'
      + ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  }
  // Panel open → load clip i in the iframe; closed → back to the poster (stops playback).
  function showClip(i, autoplay) {
    var H = STATE.hl, f = $('hl-frame'); if (!H || !f) return;
    var x = H.clips[i] || H.clips[0]; STATE.hlI = H.clips.indexOf(x);
    var on = !$('hl').hidden;
    f.innerHTML = on ? iframeHTML(x, autoplay) : posterHTML(x);
    $('hl-title').textContent = x.title; $('hl-meta').textContent = clipMeta(x);
    CARD.querySelectorAll('.dhqpc-clip').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-i') === STATE.hlI)); });
  }
  function fillHighlights(c, seq) {
    highlights(c.p.id).then(function (H) {
      if (STATE.seq !== seq || !H) return;
      STATE.hl = H; STATE.hlI = 0;
      var n = $('hl-n'); if (n) { n.textContent = H.clips.length; n.hidden = false; n.setAttribute('aria-label', plural(H.clips.length, 'clip')); }
      var box = $('hl'); if (!box) return;
      box.classList.add('dhqpc-has');
      box.innerHTML = hlPlayerHTML(c, H);
      if (!box.hidden) showClip(0, false); // opened while the clips were loading
    });
  }
  var WHY_NAMES = { 'opponent vs position': 'Opponent’s defense at his position', 'role & opportunity': 'Role and playing time', 'head-to-head history': 'His past games vs this opponent', 'coaching staff': 'Coaching staff', 'weather': 'Weather', 'vegas': 'Game script', 'injury': 'Injury' };
  function whyName(x) { var k = String(x).toLowerCase().trim(); if (/^dhq \w+ model$/.test(k)) return 'His typical game (DHQ model)'; return WHY_NAMES[k] || x; }
  function whyHTML(why) {
    var items = String(why || '').split(/\s*·\s*/).filter(Boolean).map(function (x) {
      var m = /^(.*?)\s*([+\-−]\d+(?:\.\d+)?%)$/.exec(x);
      if (!m) return '<li>' + esc(x) + '</li>';
      var up = m[2].charAt(0) === '+';
      return '<li>' + esc(whyName(m[1])) + ' <span class="' + (up ? 'dhqpc-up' : 'dhqpc-dn') + '">' + esc(m[2].replace('-', '−')) + '</span></li>';
    }).join('');
    return '<b>What moved this week’s number:</b> each factor nudges his typical game up or down.<ul>' + items + '</ul>';
  }
  function stripHTML(c) {
    var pj = c.proj, wk = FEED.week || CUR.week;
    var tile = function (k, n, s, cls) { return '<div class="dhqpc-stat' + (cls ? ' dhqpc-' + cls : '') + '"><span class="dhqpc-stat-k">' + k + '</span><span class="dhqpc-stat-n">' + n + '</span>' + (s ? '<span class="dhqpc-stat-s">' + s + '</span>' : '') + '</div>'; };
    var gpS = c.teamGP ? 'of ' + c.teamGP + ' team games' : '';
    var projTile = pj
      ? '<div class="dhqpc-stat dhqpc-proj"><span class="dhqpc-stat-k">DHQ projection</span><span class="dhqpc-stat-n">' + f1(pj[0]) + '<small>pts</small></span><span class="dhqpc-stat-s">Week ' + wk + ' · range ' + f1(pj[1]) + '–' + f1(pj[2]) + '</span>'
        + (pj[3] ? '<button type="button" class="dhqpc-why-b" data-act="why" aria-expanded="false" aria-controls="dhqpc-why">Why?</button>' : '') + '</div>'
      : c.p.kidp ? tile('DHQ projection', '—', (function () { var i = injury(c.p, c.m); return i && i.hard ? 'Not expected to play in week ' + wk : 'No DHQ projection this week'; })(), 'proj dhqpc-pnone')
      : tile('DHQ projection', '—', (function () { var i = injury(c.p, c.m); return i && i.hard ? 'Not expected to play in week ' + wk : 'No game projected in week ' + wk; })(), 'proj');
    return '<div class="dhqpc-strip">'
      + tile('Season points', c.gp ? f1(c.pts) : '—', SC.label)
      + tile('Games', c.gp || '0', gpS)
      + tile('Points per game', c.ppg != null ? f1(c.ppg) : '—', c.rank ? c.pos + c.rank + ' at his position' : c.gp ? 'Too few games to rank' : '')
      + projTile + '</div>'
      + (pj && pj[3] ? '<div class="dhqpc-why" id="dhqpc-why" hidden>' + whyHTML(pj[3]) + '</div>' : '');
  }
  function mineHTML(c, LHd, loading) {
    var rid = FEED.own[c.p.id], t = rid != null ? FEED.teams[rid] : null;
    if (!t) {
      var last = custody(c.p.id, LHd).filter(function (e) { return e.type === 'drop'; }).pop();
      return '<div class="dhqpc-mine" id="dhqpc-mine"><span class="dhqpc-lg">In my league</span><span class="dhqpc-tx"><b>Free agent</b> in the ' + esc(LEAGUE.name) + (last ? '<span class="dhqpc-sep">·</span>Last dropped by ' + esc(teamNow(last.rid)) + ' in Week ' + last.week + ', ' + last.season : loading ? '<span class="dhqpc-sep">·</span>Reading league history…' : '') + '</span></div>';
    }
    var how = howAcquired(c.p.id, LHd), mine = (t[2] && STATE.me && String(t[2]) === STATE.me) || (!STATE.me && STATE.meName && t[1] && String(t[1]).toLowerCase() === STATE.meName);
    var av = t[3] ? '<span class="dhqpc-av"><img src="https://sleepercdn.com/avatars/thumbs/' + esc(t[3]) + '" alt=""></span>' : '';
    return '<div class="dhqpc-mine" id="dhqpc-mine"><span class="dhqpc-lg">In my league</span>' + av + '<span class="dhqpc-tx"><span class="dhqpc-own">On <b>' + esc(t[0]) + '</b>' + (t[1] && t[1] !== t[0] ? ' (' + esc(t[1]) + ')' : '') + (mine ? '<span class="dhqpc-yours">Your team</span>' : '') + '</span>'
      + '<span class="dhqpc-sep">·</span><span class="dhqpc-how">' + (how ? how.text : loading ? 'Reading league history…' : 'Joined before DHQ’s league history') + '</span></span></div>';
  }

  function ageCurveHTML(c) {
    var W = c.W, lo = c.pos === 'QB' ? 21 : c.pos === 'K' ? 22 : 20, hi = c.pos === 'QB' ? 40 : c.pos === 'K' ? 42 : 36, span = hi - lo;
    var pct = function (a) { return Math.max(0, Math.min(100, (a - lo) / span * 100)); };
    var seg = [[lo, W.build[0], 'rgba(255,255,255,.07)', 'Early'], [W.build[0], W.peak[0], 'rgba(93,173,226,.55)', 'Building'], [W.peak[0], W.peak[1] + 1, 'rgba(46,204,113,.75)', 'Peak'], [W.decline[0], W.late, 'rgba(240,165,0,.65)', 'Decline'], [W.late, hi, 'rgba(231,76,60,.45)', 'Late']];
    var bars = seg.map(function (s) { var a = pct(s[0]), b = pct(s[1]); return b > a ? '<span style="left:' + a + '%;width:' + (b - a) + '%;background:' + s[2] + '" title="' + s[3] + '"></span>' : ''; }).join('');
    var ax = c.ageX != null ? c.ageX : c.age, ticks = '';
    for (var t = lo; t <= hi; t += 4) ticks += '<span style="left:' + pct(t) + '%">' + t + '</span>';
    var phase = ax < W.build[0] ? 'early' : ax < W.peak[0] ? 'building' : ax < W.peak[1] + 1 ? 'peak' : ax < W.late ? 'decline' : 'late';
    var words = { early: 'still early', building: 'building toward his peak', peak: 'in his peak years', decline: 'in the decline years', late: 'past the decline years' };
    return '<div class="dhqpc-box"><h3>Age curve <small>' + POS_NAME[c.pos][1] + '</small></h3>'
      + '<p class="dhqpc-ac-l">Peak <b>' + W.peak[0] + '–' + W.peak[1] + '</b> · value through <b>' + W.valueEnd + '</b>. At ' + c.age + ' he is ' + words[phase] + '.</p>'
      + '<div class="dhqpc-ac" role="img" aria-label="Age ' + c.age + ' on the ' + c.pos + ' age curve: peak ' + W.peak[0] + ' to ' + W.peak[1] + ', value through ' + W.valueEnd + '">' + bars
      + '<i class="dhqpc-mk" style="left:' + pct(ax) + '%"><b>' + c.age + '</b></i></div>'
      + '<div class="dhqpc-ac-t" aria-hidden="true">' + ticks + '</div>'
      + '<div class="dhqpc-leg"><span><i style="background:rgba(93,173,226,.55)"></i>Building</span><span><i style="background:rgba(46,204,113,.75)"></i>Peak</span><span><i style="background:rgba(240,165,0,.65)"></i>Decline</span><span><i style="background:rgba(231,76,60,.45)"></i>Late</span></div></div>';
  }
  function scoringTrendHTML(c) {
    var tr = c.trend;
    if (!(tr != null && tr !== 0 && c.prevGP >= 4)) return '';
    return Math.abs(tr) > 100 ? '<p class="dhqpc-trend">Scoring trend: <span class="dhqpc-up">more than double</span> last season’s points per game.</p>'
      : '<p class="dhqpc-trend">Scoring trend: <span class="' + (tr > 0 ? 'dhqpc-up' : 'dhqpc-dn') + '">' + (tr > 0 ? '▲ up ' : '▼ down ') + Math.abs(tr) + '%</span> points per game vs last season.</p>';
  }
  // The box; its body (#dhqpc-vtw) is filled by fillValueTrend once the history is in.
  function valueTrendHTML(c) {
    var S = VS_DONE[LEAGUE.id + '|' + c.p.id];
    return '<div class="dhqpc-box dhqpc-vbox"><h3>Value trend <small id="dhqpc-vt-sub">' + vtSub(S) + '</small></h3>'
      + '<div class="dhqpc-vtw" id="dhqpc-vtw">' + (S !== undefined ? vtBody(c, S) : '<div class="dhqpc-vt dhqpc-vt-wait"><div class="dhqpc-loading">Loading his value history…</div></div>') + '</div>'
      + scoringTrendHTML(c) + '</div>';
  }
  var VS_DONE = {}; // league|pid → the series once loaded (null = none), so re-opening the tab is instant
  function vtSub(S) { return S && S.fallback && S.label ? esc(S.label) + ' values' : 'DHQ value over time'; }
  function vtNote(S) { return S && S.fallback ? '<p class="dhqpc-vt-note">Your league’s values aren’t saved yet, so this is DHQ’s ' + esc(S.label || 'default') + ' trend' + (S.name ? ' (' + esc(S.name) + ')' : '') + '.</p>' : ''; }
  function vtBody(c, S) {
    var none = '<div class="dhqpc-vt"><svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 46 C40 40 70 50 110 36 S180 22 220 28 S280 14 300 12" fill="none" stroke="#D4AF37" stroke-width="2" stroke-dasharray="4 6"/></svg>';
    if (!S) return none + '<div><b>Value history starts ' + HISTORY_START + '</b><small>DHQ saves every player’s value each day. This chart fills in as the season goes on.</small></div></div>';
    var P = S.pts;
    if (!P.length) return none + '<div><b>No saved values for him yet</b><small>DHQ saves every valued player once a day; his line starts the first day he has a DHQ value.</small></div></div>' + vtNote(S);
    var last = P[P.length - 1], today = new Date().toISOString().slice(0, 10), when = last[0] === today ? 'today' : dayShort(last[0]);
    if (P.length < 3) {
      var d = P.length === 2 ? last[1] - P[0][1] : 0;
      return '<div class="dhqpc-vt dhqpc-vt-few"><span class="dhqpc-vt-dots" aria-hidden="true">' + [0, 1, 2].map(function (i) { return i < P.length ? '<i></i>' : '<i class="dhqpc-off"></i>'; }).join('') + '</span>'
        + '<div><b>Tracking since ' + esc(dayLong(P[0][0])) + '</b>'
        + '<span class="dhqpc-vt-today">' + when + ' <em>' + fmt(last[1]) + '</em>' + (P.length === 2 && d ? ' <span class="' + (d > 0 ? 'dhqpc-up' : 'dhqpc-dn') + '">' + (d > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(d)) + '</span> <small class="dhqpc-vt-since">since ' + esc(dayShort(P[0][0])) + '</small>' : '') + '</span>'
        + '<small>DHQ saves his value once a day; the chart draws itself after a few days.</small></div></div>' + vtNote(S);
    }
    var first = P[0], ch = last[1] - first[1], pct = first[1] ? ch / first[1] * 100 : 0;
    var chg = ch ? '<span class="' + (ch > 0 ? 'dhqpc-up' : 'dhqpc-dn') + '">' + (ch > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(ch)) + (Math.abs(pct) >= 0.1 ? ' (' + (Math.round(Math.abs(pct) * 10) / 10) + '%)' : '') + '</span>' : '<span class="dhqpc-flat">no change</span>';
    return '<div class="dhqpc-vt-head"><span class="dhqpc-vt-n">' + fmt(last[1]) + '</span><span class="dhqpc-vt-c">' + chg + ' since ' + esc(dayShort(first[0])) + '</span></div>'
      + '<div class="dhqpc-vc" id="dhqpc-vc">' + vtChart(S, 300) + '<div class="dhqpc-tip" id="dhqpc-vtip" hidden></div></div>' + vtNote(S);
  }
  // Line chart of value by date (x = real dates, so the weekly points of older history space out right).
  function vtChart(S, W) {
    var P = S.pts, H = 132, padL = 38, padR = 10, top = 10, padB = 22;
    var t = P.map(function (p) { return ymd(p[0]).getTime(); }), v = P.map(function (p) { return p[1]; });
    var t0 = t[0], t1 = t[t.length - 1], lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    var span = hi - lo || Math.max(10, hi * 0.04), step = Math.pow(10, Math.floor(Math.log10(span / 3)));
    step = [1, 2, 2.5, 5, 10].map(function (m) { return m * step; }).filter(function (s) { return span / s <= 4; })[0] || step * 10;
    var y0 = Math.floor((lo - span * 0.08) / step) * step, y1 = Math.ceil((hi + span * 0.08) / step) * step; if (y0 < 0) y0 = 0;
    var X = function (ms) { return padL + (W - padL - padR) * (t1 > t0 ? (ms - t0) / (t1 - t0) : 1); };
    var Y = function (val) { return top + (H - top - padB) * (1 - (val - y0) / (y1 - y0)); };
    var r2 = function (n) { return Math.round(n * 10) / 10; };
    var grid = '';
    for (var g = y0; g <= y1 + 1e-9; g += step) grid += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + r2(Y(g)) + '" y2="' + r2(Y(g)) + '" stroke="rgba(255,255,255,' + (g === y0 ? '.16' : '.06') + ')"/><text x="' + (padL - 7) + '" y="' + r2(Y(g) + 3.5) + '" text-anchor="end" style="font-size:10px" fill="rgba(189,184,173,.62)">' + fmt(g) + '</text>';
    var line = P.map(function (p, i) { return (i ? 'L' : 'M') + r2(X(t[i])) + ' ' + r2(Y(v[i])); }).join('');
    var area = line + 'L' + r2(X(t1)) + ' ' + r2(Y(y0)) + 'L' + r2(X(t0)) + ' ' + r2(Y(y0)) + 'Z';
    // x labels: first, last, and a middle one when there is room
    var xl = [[0, 'start'], [P.length - 1, 'end']]; if (W >= 300 && P.length >= 5) xl.splice(1, 0, [Math.round((P.length - 1) / 2), 'middle']);
    var xt = xl.map(function (k) { return '<text x="' + r2(X(t[k[0]])) + '" y="' + (H - 5) + '" text-anchor="' + k[1] + '" style="font-size:10px" fill="rgba(189,184,173,.65)">' + esc(dayShort(P[k[0]][0])) + '</text>'; }).join('');
    var lx = r2(X(t1)), ly = r2(Y(v[v.length - 1]));
    var label = 'DHQ value from ' + dayLong(P[0][0]) + ' (' + fmt(v[0]) + ') to ' + dayLong(P[P.length - 1][0]) + ' (' + fmt(v[v.length - 1]) + ')';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '" data-w="' + W + '">'
      + '<defs><linearGradient id="dhqpc-vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D4AF37" stop-opacity=".26"/><stop offset="1" stop-color="#D4AF37" stop-opacity="0"/></linearGradient></defs>'
      + grid + '<path d="' + area + '" fill="url(#dhqpc-vg)"/>'
      + '<path d="' + line + '" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
      + xt
      + '<line class="dhqpc-vguide" x1="0" x2="0" y1="' + top + '" y2="' + r2(Y(y0)) + '" stroke="rgba(245,242,234,.35)" stroke-dasharray="3 3" style="visibility:hidden"/>'
      + '<circle cx="' + lx + '" cy="' + ly + '" r="9" fill="#D4AF37" fill-opacity=".18"/><circle cx="' + lx + '" cy="' + ly + '" r="4.5" fill="#D4AF37" stroke="#101015" stroke-width="2"/>'
      + '<circle class="dhqpc-vfocus" cx="0" cy="0" r="4.5" fill="#F5F2EA" stroke="#101015" stroke-width="2" style="visibility:hidden"/>'
      + '<rect class="dhqpc-vhit" x="' + padL + '" y="0" width="' + (W - padL - padR) + '" height="' + H + '" fill="transparent"/></svg>';
  }
  function wireValueChart(S) {
    var box = $('vc'), tip = $('vtip'); if (!box || !S || S.pts.length < 3) return;
    var svg = box.querySelector('svg'), W = Math.round(box.clientWidth);
    if (W >= 200 && Math.abs(W - +svg.getAttribute('data-w')) > 2) { svg.outerHTML = vtChart(S, W); svg = box.querySelector('svg'); } // draw at the real width: crisp text
    var P = S.pts, guide = svg.querySelector('.dhqpc-vguide'), dot = svg.querySelector('.dhqpc-vfocus'), hit = svg.querySelector('.dhqpc-vhit');
    var padL = 38, padR = 10, H = 132, top = 10, padB = 22, w = +svg.getAttribute('data-w');
    var t = P.map(function (p) { return ymd(p[0]).getTime(); }), t0 = t[0], t1 = t[t.length - 1];
    var path = svg.querySelectorAll('path')[1], seg = path.getAttribute('d').split(/[ML]/).filter(Boolean).map(function (q) { return q.split(' ').map(Number); });
    function show(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (w / r.width), ms = t0 + (t1 - t0) * (x - padL) / (w - padL - padR), k = 0;
      for (var i = 1; i < t.length; i++) if (Math.abs(t[i] - ms) < Math.abs(t[k] - ms)) k = i;
      var px = seg[k][0], py = seg[k][1];
      guide.setAttribute('x1', px); guide.setAttribute('x2', px); guide.style.visibility = 'visible';
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.style.visibility = 'visible';
      tip.innerHTML = '<b>' + esc(dayLong(P[k][0])) + '</b><br>DHQ value ' + fmt(P[k][1]);
      tip.hidden = false;
      var sx = px * (r.width / w), bw = box.getBoundingClientRect(), off = r.left - bw.left;
      tip.style.left = Math.max(62, Math.min(bw.width - 62, off + sx)) + 'px'; tip.style.top = (r.top - bw.top + py * (r.height / H) - 10) + 'px';
    }
    function hide() { tip.hidden = true; guide.style.visibility = dot.style.visibility = 'hidden'; }
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }
  function fillValueTrend(c, seq) {
    var k = LEAGUE.id + '|' + c.p.id, done = function (S) {
      VS_DONE[k] = S;
      if (STATE.seq !== seq) return;
      var el = $('vtw'), sub = $('vt-sub'); if (!el) return;
      el.innerHTML = vtBody(c, S); if (sub) sub.innerHTML = vtSub(S);
      wireValueChart(S);
    };
    if (VS_DONE[k] !== undefined) { wireValueChart(VS_DONE[k]); return; }
    valueSeries(LEAGUE.id, c.p.id).then(done, function () { done(null); });
  }
  function overviewHTML(c) {
    var R = dynastyRead(c), S = signals(c);
    var sig = S.map(function (s) { return '<div class="dhqpc-sig" style="--sc:' + s.c + '"><i aria-hidden="true">' + s.i + '</i><span class="dhqpc-sig-k">' + s.k + ' <b>' + esc(s.v) + '</b></span><span class="dhqpc-sig-s">' + esc(s.s) + '</span></div>'; }).join('');
    return '<div class="dhqpc-ov"><section class="dhqpc-box dhqpc-read" style="--stc:' + c.stage.color + '" aria-labelledby="dhqpc-dr-h"><h3 id="dhqpc-dr-h">Dynasty Read <span class="dhqpc-tag" style="--tc:' + c.stage.color + '">' + c.stage.label + '</span></h3>'
      + '<p class="dhqpc-verdict">' + esc(R.verdict) + '</p><p class="dhqpc-write">' + R.text + '</p>'
      + '<div class="dhqpc-sigs">' + sig + '</div>'
      + '<p class="dhqpc-stage-why"><b>Why “' + c.stage.label + '”:</b> ' + esc(c.stage.why) + '</p></section>'
      + '<div class="dhqpc-side">' + ageCurveHTML(c) + valueTrendHTML(c) + '</div></div>';
  }

  // Stats tab ------------------------------------------------------------
  var COLS = {
    QB: [['pass_yd', 'Pass yds'], ['pass_td', 'Pass TD'], ['pass_int', 'INT'], ['rush_yd', 'Rush yds'], ['rush_td', 'Rush TD']],
    RB: [['rush_att', 'Carries'], ['rush_yd', 'Rush yds'], ['rush_td', 'Rush TD'], ['rec', 'Catches'], ['rec_yd', 'Rec yds'], ['rec_td', 'Rec TD']],
    WR: [['rec_tgt', 'Targets'], ['rec', 'Catches'], ['rec_yd', 'Rec yds'], ['rec_td', 'TD'], ['rush_yd', 'Rush yds']],
    TE: [['rec_tgt', 'Targets'], ['rec', 'Catches'], ['rec_yd', 'Rec yds'], ['rec_td', 'TD']]
  };
  function n0(x) { return x == null ? '—' : Math.round(x).toLocaleString('en-US'); }
  // Kickers / defenders: column = [header, cell(stat line), count(stat line) (0 everywhere = column hidden), key (stays on phones)]
  var KD_COLS = {
    K: [['FG', function (s) { return frac(kick(s).fg); }, function (s) { return kick(s).fg[1]; }, 1], ['FG %', function (s) { return pct(kick(s).fg); }, function (s) { return kick(s).fg[1]; }],
      ['0–39', function (s) { return frac(kick(s).d0); }, function (s) { return kick(s).d0[1]; }], ['40–49', function (s) { return frac(kick(s).d40); }, function (s) { return kick(s).d40[1]; }],
      ['50+', function (s) { return frac(kick(s).d50); }, function (s) { return kick(s).d50[1]; }], ['Long', function (s) { return kick(s).lng || '—'; }, function (s) { return kick(s).lng || 0; }],
      ['XP', function (s) { return frac(kick(s).xp); }, function (s) { return kick(s).xp[1]; }]],
    IDP: [['Solo', 'solo'], ['Ast', 'ast'], ['Tkl', 'tkl', 'LB DB'], ['TFL', 'tfl'], ['Sacks', 'sack', 'DL'], ['QB hits', 'qbh'], ['INT', 'int'], ['PD', 'pd'], ['FF', 'ff'], ['FR', 'fr'], ['TD', 'td']].map(function (x) {
      return [x[0], function (s) { var v = dstat(s)[x[1]]; return x[1] === 'sack' ? n1(v) : n0(v); }, function (s) { return dstat(s)[x[1]]; }, x[2] || ''];
    })
  };
  function sumLines(rows) { var t = {}; rows.forEach(function (r) { Object.keys(r.st || {}).forEach(function (k) { var v = r.st[k]; if (typeof v !== 'number' || SKIP_SUM[k]) return; t[k] = k === 'fgm_lng' ? Math.max(t[k] || 0, v) : (t[k] || 0) + v; }); }); return t; }
  function careerTableKIDP(c, ps) {
    var rows = ps.seasons.slice().reverse();
    if (!rows.length) return empty('📊', 'No NFL stats yet', 'His season-by-season numbers will show here once he plays.');
    var tot = sumLines(rows), all = rows.map(function (r) { return r.st || {}; }).concat([tot]);
    var cols = KD_COLS[c.pos === 'K' ? 'K' : 'IDP'].filter(function (k) { return all.some(function (st) { return k[2](st) > 0; }); });
    // phones: one key column (K: FG, DL: sacks, LB / DB: tackles) and no Team column, so the table fits
    var keyCol = function (k) { return k[3] === 1 || (typeof k[3] === 'string' && k[3].split(' ').indexOf(c.pos) >= 0); };
    var cl = function (k) { return keyCol(k) ? '' : ' class="dhqpc-opt-col"'; };
    var best = Math.max.apply(null, rows.map(function (r) { return r.gp ? r.pts / r.gp : 0; }));
    var head = '<tr><th>Season</th><th class="dhqpc-l dhqpc-opt-col">Team</th><th>Games</th><th>Points</th><th>Per game</th><th>Finish</th>' + cols.map(function (k) { return '<th' + cl(k) + '>' + k[0] + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (r) {
      var ppg = r.gp ? r.pts / r.gp : 0, fin = r.rank ? c.pos + r.rank : ps.later && !r.cur ? '<span class="dhqpc-wait-c" title="Working out his finish…">…</span>' : '—';
      return '<tr' + (r.cur ? ' class="dhqpc-cur"' : '') + '><td class="dhqpc-em">' + r.yr + (r.cur ? ' <small style="color:var(--gold);font-weight:600">now</small>' : '') + '</td><td class="dhqpc-l dhqpc-opt-col">' + esc(r.team || '—') + '</td><td>' + r.gp + '</td><td>' + f1(r.pts) + '</td>'
        + '<td class="' + (ppg === best && rows.length > 1 ? 'dhqpc-g' : 'dhqpc-em') + '">' + f1(ppg) + '</td><td>' + fin + '</td>'
        + cols.map(function (k) { return '<td' + cl(k) + '>' + k[1](r.st || {}) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var tg = 0, tp = 0; rows.forEach(function (r) { tg += r.gp; tp += r.pts; });
    var foot = rows.length > 1 ? '<tfoot><tr><td>Career</td><td class="dhqpc-l dhqpc-opt-col"></td><td>' + tg + '</td><td>' + f1(tp) + '</td><td>' + f1(tp / tg) + '</td><td></td>' + cols.map(function (k) { return '<td' + cl(k) + '>' + k[1](tot) + '</td>'; }).join('') + '</tr></tfoot>' : '';
    return '<div class="dhqpc-tbl-w"><table class="dhqpc-t dhqpc-kd"><thead>' + head + '</thead><tbody>' + body + '</tbody>' + foot + '</table></div>';
  }
  // "3/3 FG (52 long) · 2/2 XP", "7 tkl (5 solo) · 1 sack · 1 PD"
  function gameLineKIDP(pos, s) {
    var b = [];
    if (pos === 'K') {
      var k = kick(s);
      if (k.fg[1]) b.push(frac(k.fg) + ' FG' + (k.lng && k.fg[0] ? ' (' + k.lng + ' long)' : ''));
      if (k.xp[1]) b.push(frac(k.xp) + ' XP');
      return b.join(' · ') || 'No kicks';
    }
    var d = dstat(s);
    if (d.tkl) b.push(d.tkl + ' tkl' + (d.solo && d.solo !== d.tkl ? ' (' + d.solo + ' solo)' : ''));
    if (d.sack) b.push(n1(d.sack) + (d.sack === 1 ? ' sack' : ' sacks'));
    if (d.tfl) b.push(d.tfl + ' TFL');
    if (d.qbh && pos === 'DL') b.push(plural(d.qbh, 'QB hit'));
    [['int', 'INT'], ['pd', 'PD'], ['ff', 'FF'], ['fr', 'FR'], ['td', 'TD'], ['safe', 'safety'], ['blk', 'blocked kick']].forEach(function (x) { if (d[x[0]]) b.push(d[x[0]] + ' ' + x[1]); });
    return b.join(' · ') || 'No stats';
  }
  function careerTable(c, ps) {
    var cols = COLS[c.pos], rows = ps.seasons.slice().reverse();
    if (!rows.length) return empty('📊', 'No NFL stats yet', 'His season-by-season numbers will show here once he plays.');
    var best = Math.max.apply(null, rows.map(function (r) { return r.gp ? r.pts / r.gp : 0; }));
    var head = '<tr><th>Season</th><th class="dhqpc-l">Team</th><th>Games</th><th>Points</th><th>Per game</th><th>Finish</th>' + cols.map(function (k, i) { return '<th' + ' class="dhqpc-opt-col"' + '>' + k[1] + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (r) {
      var ppg = r.gp ? r.pts / r.gp : 0;
      return '<tr' + (r.cur ? ' class="dhqpc-cur"' : '') + '><td class="dhqpc-em">' + r.yr + (r.cur ? ' <small style="color:var(--gold);font-weight:600">now</small>' : '') + '</td><td class="dhqpc-l">' + esc(r.team || '—') + '</td><td>' + r.gp + '</td><td>' + f1(r.pts) + '</td>'
        + '<td class="' + (ppg === best && rows.length > 1 ? 'dhqpc-g' : 'dhqpc-em') + '">' + f1(ppg) + '</td><td>' + (r.rank ? c.pos + r.rank : '—') + '</td>'
        + cols.map(function (k, i) { return '<td' + ' class="dhqpc-opt-col"' + '>' + n0(r.st[k[0]] || 0) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var tg = 0, tp = 0; rows.forEach(function (r) { tg += r.gp; tp += r.pts; });
    var foot = rows.length > 1 ? '<tfoot><tr><td>Career</td><td class="dhqpc-l"></td><td>' + tg + '</td><td>' + f1(tp) + '</td><td>' + f1(tp / tg) + '</td><td></td>' + cols.map(function (k, i) { var s = 0; rows.forEach(function (r) { s += r.st[k[0]] || 0; }); return '<td' + ' class="dhqpc-opt-col"' + '>' + n0(s) + '</td>'; }).join('') + '</tr></tfoot>' : '';
    return '<div class="dhqpc-tbl-w"><table class="dhqpc-t"><thead>' + head + '</thead><tbody>' + body + '</tbody>' + foot + '</table></div>';
  }
  function gameLine(pos, s) {
    var b = [];
    if (pos === 'QB') { if (s.pass_att) b.push((s.pass_cmp || 0) + '/' + s.pass_att + ', ' + n0(s.pass_yd || 0) + ' yds, ' + (s.pass_td || 0) + ' TD' + (s.pass_int ? ', ' + s.pass_int + ' INT' : '')); if (s.rush_yd) b.push(n0(s.rush_yd) + ' rush yds'); }
    else { if (s.rush_att) b.push(s.rush_att + ' car, ' + n0(s.rush_yd || 0) + ' yds'); if (s.rec_tgt || s.rec) b.push((s.rec || 0) + '/' + (s.rec_tgt || 0) + ', ' + n0(s.rec_yd || 0) + ' yds'); }
    var td = (s.rush_td || 0) + (s.rec_td || 0); if (td && pos !== 'QB') b.push(td + ' TD'); else if (pos === 'QB' && s.rush_td) b.push(s.rush_td + ' rush TD');
    return b.join(' · ');
  }
  function gameLog(c, ps, proj) {
    var lastWk = Math.max(c.weeks.length ? c.weeks[c.weeks.length - 1].wk : 0, (CUR.week || 1) - 1);
    if (!lastWk) return empty('🏈', 'No games yet this season', '');
    var by = {}; c.weeks.forEach(function (w) { by[w.wk] = w; });
    var rows = [], pts = [];
    for (var wk = 1; wk <= lastWk; wk++) {
      var g = by[wk], pj = proj && proj[wk] ? proj[wk][c.p.id] : null;
      rows.push({ wk: wk, g: g, pj: pj == null ? null : pj });
      if (g && g.gp > 0) pts.push(g.pts);
    }
    var hasProj = rows.some(function (r) { return r.pj != null; });
    // chart: weekly points (bars) and DHQ's projection (gold tick)
    var tp = $('tp-stats'), Wd = 640;
    if (tp && tp.clientWidth) { var cs = getComputedStyle(tp); Wd = Math.max(280, Math.round(tp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 26)); }
    var H = Wd < 500 ? 170 : 150, padL = 28, padB = 22, top = 10, maxY = Math.max(10, Math.max.apply(null, rows.map(function (r) { return Math.max(r.g && r.g.gp ? r.g.pts : 0, r.pj || 0); })));
    maxY = Math.ceil(maxY / 10) * 10;
    var bw = (Wd - padL) / rows.length, y = function (v) { return top + (H - top - padB) * (1 - v / maxY); };
    var grid = ''; for (var gv = 0; gv <= maxY; gv += maxY > 30 ? 10 : 5) grid += '<line x1="' + padL + '" x2="' + Wd + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="rgba(255,255,255,' + (gv ? '.06' : '.18') + ')"/><text x="' + (padL - 6) + '" y="' + (y(gv) + 3.5) + '" text-anchor="end" style="font-size:10px" fill="rgba(189,184,173,.6)">' + gv + '</text>';
    var marks = rows.map(function (r, i) {
      var x = padL + i * bw, w = Math.min(34, bw * 0.62), cx = x + bw / 2, played = r.g && r.g.gp > 0;
      var bar = played ? '<rect x="' + (cx - w / 2) + '" y="' + y(r.g.pts) + '" width="' + w + '" height="' + Math.max(1, y(0) - y(r.g.pts)) + '" rx="2" fill="#8FA8C8"/>' : '<text x="' + cx + '" y="' + (y(0) - 6) + '" text-anchor="middle" style="font-size:9.5px" fill="rgba(189,184,173,.5)">' + (r.g ? 'DNP' : 'bye') + '</text>';
      var tick = r.pj != null ? '<line x1="' + (cx - w / 2 - 3) + '" x2="' + (cx + w / 2 + 3) + '" y1="' + y(r.pj) + '" y2="' + y(r.pj) + '" stroke="#D4AF37" stroke-width="2.5" stroke-linecap="round"/>' : '';
      var tipTxt = 'Week ' + r.wk + (r.g && r.g.opp ? (r.g.away ? ' at ' : ' vs ') + r.g.opp : '') + '|' + (played ? f1(r.g.pts) + ' pts' : r.g ? 'Did not play' : 'Bye week') + (r.pj != null ? '|DHQ projected ' + f1(r.pj) : '');
      return '<g class="dhqpc-wk" data-tip="' + esc(tipTxt) + '">' + bar + tick + '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" style="font-size:10px" fill="rgba(189,184,173,.65)">' + r.wk + '</text><rect x="' + x + '" y="0" width="' + bw + '" height="' + H + '" fill="transparent"/></g>';
    }).join('');
    var chart = '<div class="dhqpc-chart" id="dhqpc-gchart"><div class="dhqpc-lgd"><span><i></i>His points</span>' + (hasProj ? '<span><i class="dhqpc-pj"></i>DHQ projection</span>' : '') + '</div>'
      + '<svg viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Points by week this season">' + grid + marks + '</svg><div class="dhqpc-tip" id="dhqpc-gtip" hidden></div></div>';
    var table = '<div class="dhqpc-tbl-w"><table class="dhqpc-t"><thead><tr><th>Week</th><th class="dhqpc-l">Opponent</th><th>Points</th>' + (hasProj ? '<th>DHQ proj.</th>' : '') + '<th class="dhqpc-l dhqpc-opt-col">Line</th></tr></thead><tbody>'
      + rows.slice().reverse().map(function (r) {
        var g = r.g, played = g && g.gp > 0;
        if (!g) return '<tr class="dhqpc-bye"><td class="dhqpc-em">' + r.wk + '</td><td class="dhqpc-l">Bye</td><td>—</td>' + (hasProj ? '<td>—</td>' : '') + '<td class="dhqpc-l dhqpc-opt-col"></td></tr>';
        var cls = r.pj != null && played ? (g.pts >= r.pj ? 'dhqpc-hi' : 'dhqpc-lo') : '';
        return '<tr><td class="dhqpc-em">' + r.wk + '</td><td class="dhqpc-l">' + (g.opp ? (g.away ? '@ ' : 'vs ') + esc(g.opp) : '—') + (r.wk === CUR.week ? ' <small style="color:var(--gold)">this week</small>' : '') + '</td><td class="dhqpc-em ' + cls + '">' + (played ? f1(g.pts) : 'DNP') + '</td>' + (hasProj ? '<td class="dhqpc-dim">' + (r.pj != null ? f1(r.pj) : '—') + '</td>' : '') + '<td class="dhqpc-l dhqpc-opt-col dhqpc-dim">' + esc(played ? (c.p.kidp ? gameLineKIDP(c.pos, g.st) : gameLine(c.pos, g.st)) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return chart + table;
  }
  function statsHTML(c, ps, proj, projLoading) {
    return '<h4 class="dhqpc-sub-h">' + SEASON + ' game by game <small>' + SC.label + ' points' + (projLoading ? ' · adding DHQ’s weekly projections…' : proj ? ' · gold line = DHQ’s projection that week' : '') + '</small></h4>'
      + gameLog(c, ps, proj)
      + (c.p.kidp
        ? '<h4 class="dhqpc-sub-h">Career by season <small>Finish = his rank among ' + POS_NAME[c.pos][1] + ' by total points (' + scoreWords() + ')' + (ps.later ? ' · working out past finishes…' : '') + '</small></h4>' + careerTableKIDP(c, ps)
        : '<h4 class="dhqpc-sub-h">Career by season <small>' + (SC.rules ? 'Finish = his rank at the position by total points (this season: league scoring; earlier seasons: Half-PPR)' : 'Finish = his rank at the position by total Half-PPR points') + '</small></h4>'
          + careerTable(c, ps));
  }
  function wireChart() {
    var ch = $('gchart'), tip = $('gtip'); if (!ch) return;
    function show(g, ev) {
      var t = String(g.getAttribute('data-tip')).split('|'), r = ch.getBoundingClientRect(), b = g.getBoundingClientRect();
      tip.innerHTML = '<b>' + esc(t[0]) + '</b><br>' + t.slice(1).map(esc).join('<br>');
      tip.hidden = false;
      var x = b.left + b.width / 2 - r.left; x = Math.max(70, Math.min(r.width - 70, x));
      tip.style.left = x + 'px'; tip.style.top = (b.top - r.top + 18) + 'px';
    }
    ch.querySelectorAll('g.dhqpc-wk').forEach(function (g) {
      g.addEventListener('mouseenter', function (e) { show(g, e); });
      g.addEventListener('click', function (e) { show(g, e); });
      g.addEventListener('mouseleave', function () { tip.hidden = true; });
    });
  }

  // News tab --------------------------------------------------------------
  function newsHTML(items) {
    if (items == null) return empty('📰', 'News didn’t load', 'Sleeper’s news feed didn’t answer. Try again in a minute.');
    if (!items.length) return empty('📰', 'No recent news', 'Nothing new on him lately. Quiet is usually good.');
    return '<ul class="dhqpc-news">' + items.map(function (n, i) {
      var m = n.metadata || {}, src = SOURCES[n.source] || (n.source ? String(n.source).replace(/_/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) : 'News'), fresh = Date.now() - n.published < 36 * 3600e3;
      var body = cleanBlurb(m.description || ''), an = cleanBlurb(m.analysis || '');
      return '<li data-i="' + i + '"><div class="dhqpc-meta">' + (fresh ? '<span class="dhqpc-new">NEW</span>' : '') + '<span>' + esc(ago(n.published)) + '</span><b>' + esc(src) + '</b></div>'
        + '<h4>' + esc(m.title) + '</h4>' + (body ? '<p>' + esc(body) + (an ? ' ' + esc(an) : '') + '</p>' : '')
        + '<div class="dhqpc-acts">' + (body.length > 260 ? '<button type="button" data-act="more">Read more</button>' : '') + (m.url ? '<a target="_blank" rel="noopener" href="' + esc(m.url) + '">Source ↗</a>' : '') + '</div></li>';
    }).join('') + '</ul><p class="dhqpc-note">Headlines and summaries from Sleeper’s player news feed (written by the outlet named). Other sites’ rankings and projections are left out: on Dynasty HQ, the numbers are DHQ’s.</p>';
  }

  // League History tab -----------------------------------------------------
  function nameOf(pid) { var q = pl(pid); return q ? q.name : PLN[pid] || 'a player'; }
  function leagueHTML(c, LHd, loading) {
    if (!STATE.league) return empty('🏆', 'Link a league to see his history in your league', 'Who drafted him, every trade he was part of, and how he landed on his current team.', '<button type="button" class="dhqpc-btn dhqpc-gold" data-act="demo" style="margin-top:6px">' + (LEAGUE.id === DEMO.id ? 'Show the demo league' : 'Show ' + esc(LEAGUE.name)) + '</button>');
    if (loading && !LHd) return '<div class="dhqpc-loading">Reading ' + (LEAGUE.id === DEMO.id ? 'six seasons of ' : 'the ') + esc(LEAGUE.name) + ' history…</div>';
    var ev = custody(c.p.id, LHd);
    var items = ev.map(function (e) {
      var team = teamThen(LHd, e.season, e.rid), when = e.type === 'draft' ? e.season + (e.startup ? ' · Startup draft' : ' · Rookie draft') : e.season + ' · Week ' + e.week;
      if (e.type === 'draft') return { dc: '#D4AF37', icon: '★', when: when, h: 'Drafted by ' + team, p: 'Pick ' + pickName(e.round, e.slot) + ' (No. ' + e.pick + ' overall)' };
      if (e.type === 'trade') {
        var t = e.t, side = function (rid) { var s = t.sides[rid] || [[], []]; var a = s[0].map(nameOf).concat(s[1].map(function (pk) { return pk[0] + ' Round ' + pk[1] + ' pick'; })); return a.length ? a.map(esc).join(', ') : 'nothing'; };
        var fromRid = e.from[0], wonTo = t.win === e.rid, wonFrom = t.win === fromRid;
        return { dc: '#5DADE2', icon: '⇄', when: when, h: 'Traded to ' + team + (fromRid != null ? ' from ' + teamThen(LHd, e.season, fromRid) : ''),
          p: (t.win != null && t.pct >= 8 ? 'DHQ rates it a win for <b>' + esc(teamAt(LHd, e.season, t.win)) + '</b>.' : 'DHQ rates it a fair trade.'),
          deal: '<div class="dhqpc-deal"><div' + (wonTo ? ' class="dhqpc-won"' : '') + '><b>' + esc(teamAt(LHd, e.season, e.rid)) + ' got</b>' + side(e.rid) + '</div>' + (fromRid != null ? '<div' + (wonFrom ? ' class="dhqpc-won"' : '') + '><b>' + esc(teamAt(LHd, e.season, fromRid)) + ' got</b>' + side(fromRid) + '</div>' : '') + '</div>' };
      }
      if (e.type === 'waiver') return { dc: '#2ECC71', icon: '+', when: when, h: 'Claimed off waivers by ' + team, p: e.bid ? 'Winning bid: $' + e.bid + ' FAAB' : 'No FAAB spent' };
      if (e.type === 'fa') return { dc: '#2ECC71', icon: '+', when: when, h: 'Picked up as a free agent by ' + team, p: '' };
      return { dc: '#E8806F', icon: '−', when: when, h: 'Dropped by ' + team, p: '' };
    });
    var rid = FEED.own[c.p.id], now = rid != null && FEED.teams[rid];
    if (!items.length && !now) return empty('🏆', 'No history in the ' + esc(LEAGUE.name), 'He has never been drafted, traded or rostered in this league.');
    var list = items.map(function (x) { return '<li><span class="dhqpc-dot" style="--dc:' + x.dc + '" aria-hidden="true">' + x.icon + '</span><div class="dhqpc-when">' + x.when + '</div><h4>' + x.h + '</h4>' + (x.p ? '<p>' + x.p + '</p>' : '') + (x.deal || '') + '</li>'; }).join('');
    list += '<li class="dhqpc-now"><span class="dhqpc-dot" aria-hidden="true">●</span><div class="dhqpc-when">Today</div><h4>' + (now ? 'On ' + esc(now[0]) + (now[1] && now[1] !== now[0] ? ' (' + esc(now[1]) + ')' : '') : 'A free agent in the league') + '</h4></li>';
    return '<h4 class="dhqpc-sub-h">' + esc(LEAGUE.name) + ' <small>' + (LEAGUE.id === DEMO.id ? 'Demo league · ' : '') + (loading ? 'still reading older seasons…' : 'every draft, trade and pickup since the league began') + '</small></h4><ol class="dhqpc-tl">' + list + '</ol>'
      + '<p class="dhqpc-note">Drafts and pickups from the league’s Sleeper history; trades and trade grades from DHQ.</p>';
  }

  // College tab ------------------------------------------------------------
  // ESPN's college defense / kicking labels (kickers and defenders only)
  var CAT_LABELS = { defensive: { TOT: 'Tackles', SOLO: 'Solo', AST: 'Ast', PD: 'PD', SACK: 'Sacks', FF: 'FF', INT: 'INT', YDS: 'INT yds', TD: 'TD' },
    kicking: { FGM: 'FG made', FGA: 'FG att', 'FG%': 'FG %', '1-19': '1–19', '20-29': '20–29', '30-39': '30–39', '40-49': '40–49', LNG: 'Long', XP: 'XP', PTS: 'Points' } };
  var LABELS = { CAR: 'Carries', YDS: 'Yards', AVG: 'Avg', TD: 'TD', LNG: 'Long', REC: 'Catches', CMP: 'Comp', ATT: 'Att', 'CMP%': 'Comp %', INT: 'INT', RTG: 'Rating', QBR: 'QBR', SACK: 'Sacks', YPA: 'Yds/att' };
  function collegeHTML(c, E) {
    var p = c.p, a = (E && E.athlete) || {};
    var draft = a.displayDraft ? String(a.displayDraft).replace(/^(\d{4}):\s*Rd\s*(\d+),\s*Pk\s*(\d+)\s*\((\w+)\)$/, function (_, y, r, k, t) { return y + ' · Round ' + r + ', pick ' + k + ' by ' + teamName(ESPN_TEAM[t] || t); }) : '';
    var cs = E && E.college, team = null, teams = (cs && cs.teams) || {};
    var allStar = function (slug) { var t = teams[slug]; return /all-?star/i.test(slug + ' ' + (t ? t.displayName + ' ' + t.name : '')); };
    if (cs) { // the school he played most seasons for (all-star games left out)
      var cnt = {}; (cs.categories || []).forEach(function (x) { (x.statistics || []).forEach(function (r) { if (r.teamSlug && !allStar(r.teamSlug)) cnt[r.teamSlug] = (cnt[r.teamSlug] || 0) + 1; }); });
      var main = Object.keys(cnt).sort(function (a1, b1) { return cnt[b1] - cnt[a1]; })[0]; team = main ? teams[main] : null;
    }
    var logo = team && team.logos && team.logos[0] && team.logos[0].href;
    var school = p.college || (a.college && a.college.name) || '';
    var head = '<div class="dhqpc-col-h">' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '<div><h4>' + esc(school || 'College unknown') + '</h4><p>' + esc(team ? team.displayName : '') + '</p></div></div>'
      + '<div class="dhqpc-facts"><div><span>NFL draft</span><b>' + esc(draft || (p.exp === 0 ? SEASON + ' class' : '—')) + '</b></div><div><span>Born</span><b>' + esc(a.displayBirthPlace || '—') + '</b></div><div><span>Size</span><b>' + esc(ht(p.height)) + (p.weight ? ' · ' + esc(p.weight) + ' lb' : '') + '</b></div></div>';
    if (!E) return head + '<div class="dhqpc-loading">Loading college stats from ESPN…</div>';
    if (E.failed) return head + empty('🎓', 'College stats didn’t load', 'ESPN didn’t answer. Try again in a minute.');
    var want = { QB: ['passing', 'rushing'], RB: ['rushing', 'receiving'], WR: ['receiving', 'rushing'], TE: ['receiving'], K: ['kicking'], DL: ['defensive'], LB: ['defensive'], DB: ['defensive'] }[c.pos];
    var cats = ((cs && cs.categories) || []).filter(function (x) { return want.indexOf(x.name) >= 0 && (x.statistics || []).length; });
    cats.sort(function (a1, b1) { return want.indexOf(a1.name) - want.indexOf(b1.name); });
    if (!cats.length) return head + empty('🎓', 'College stats not available yet', 'ESPN has no college stats for him yet' + (E.none ? ' (we couldn’t match him to an ESPN profile)' : '') + '.');
    return head + cats.map(function (cat) {
      var labels = cat.labels || [];
      var seen = {};
      var rows = cat.statistics.filter(function (s) {
        if (allStar(s.teamSlug) || !(s.stats || []).some(function (v) { return /\d/.test(v); })) return false;
        var key = (s.season && s.season.year) + '|' + (s.stats || []).join(','); if (seen[key]) return false; seen[key] = 1; return true;
      }).map(function (s) {
        var other = team && s.teamSlug && teams[s.teamSlug] && s.teamSlug !== team.slug ? ' <small style="color:var(--faint);font-weight:500">' + esc(teams[s.teamSlug].shortDisplayName || teams[s.teamSlug].location) + '</small>' : '';
        return '<tr><td class="dhqpc-em">' + esc(s.season && s.season.displayName) + other + '</td>' + (s.stats || []).map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('');
      var tot = cat.totals ? '<tfoot><tr><td>Total</td>' + cat.totals.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr></tfoot>' : '';
      var CL = c.p.kidp && CAT_LABELS[cat.name] || {};
      return '<h4 class="dhqpc-sub-h">' + esc(cat.displayName) + '</h4><div class="dhqpc-tbl-w"><table class="dhqpc-t"><thead><tr><th>Season</th>' + labels.map(function (l) { if (c.p.kidp) l = String(l).trim(); return '<th>' + esc(CL[l] || LABELS[l] || l) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody>' + tot + '</table></div>';
    }).join('') + '<p class="dhqpc-note">College stats from ESPN.</p>';
  }
  function awardsHTML(c, E) {
    if (!E) return '<div class="dhqpc-loading">Loading awards from ESPN…</div>';
    if (E.failed) return empty('🏅', 'Awards didn’t load', 'ESPN didn’t answer. Try again in a minute.');
    var aw = (E.awards || []).filter(function (a) { return a && a.name; });
    var note = '<p class="dhqpc-note">Major NFL awards from ESPN (' + (IDP[c.pos] ? 'Defensive Player of the Year, Defensive Rookie of the Year, Super Bowl MVP and similar' : c.pos === 'K' ? 'MVP, Super Bowl MVP and similar' : 'MVP, Offensive Player of the Year, Rookie of the Year, Super Bowl MVP and similar') + '). Pro Bowl, All-Pro and college awards are coming in a later version.</p>';
    if (!aw.length) return empty('🏅', E.none ? 'Awards not available yet' : 'No major NFL awards yet', E.none ? 'We couldn’t match him to an ESPN profile yet.' : c.p.exp === 0 ? 'He is a rookie: his trophy case is still empty.' : 'He hasn’t won a major NFL award so far.') + note;
    return '<div class="dhqpc-awards">' + aw.map(function (a) {
      var yrs = (a.seasons || []).slice().sort().join(', ');
      return '<div class="dhqpc-aw"><i aria-hidden="true">🏆</i><div><b>' + esc(a.name) + '</b><small>' + esc(yrs) + '</small></div>' + ((a.seasons || []).length > 1 ? '<em>' + a.seasons.length + '×</em>' : '') + '</div>';
    }).join('') + '</div>' + note;
  }

  // ── Card shell + tab switching ─────────────────────────────────────────
  var lastFocus = null, ROOT = null, CARD = null, SCROLL = null, XBTN = null, LOCKED = null;
  function shell(c) {
    return heroHTML(c) + stripHTML(c)
      + (STATE.league ? mineHTML(c, null, true) : '')
      + '<nav class="dhqpc-tabs" role="tablist" aria-label="Player card sections">' + TABS.map(function (t) { return '<button class="dhqpc-tab" role="tab" type="button" id="dhqpc-tab-' + t[0] + '" data-tab="' + t[0] + '" aria-selected="' + (t[0] === STATE.tab) + '" aria-controls="dhqpc-tp-' + t[0] + '">' + t[1] + '<span class="dhqpc-n" id="dhqpc-n-' + t[0] + '"></span></button>'; }).join('') + '</nav>'
      + TABS.map(function (t) { return '<section class="dhqpc-tp" role="tabpanel" id="dhqpc-tp-' + t[0] + '" aria-labelledby="dhqpc-tab-' + t[0] + '"' + (t[0] === STATE.tab ? '' : ' hidden') + '></section>'; }).join('');
  }
  function fillTab(name) {
    var c = STATE.ctx, ps = STATE.ps, el = $('tp-' + name), pid = c.p.id, seq = STATE.seq; if (!el) return;
    var live = function () { return STATE.seq === seq; };
    if (name === 'overview') { el.innerHTML = overviewHTML(c); fillValueTrend(c, seq); }
    else if (name === 'stats') {
      el.innerHTML = statsHTML(c, ps, null, true); wireChart();
      var lastWk = Math.max(1, (CUR.week || 1) - 1), wks = []; for (var w = 1; w <= lastWk; w++) wks.push(w);
      var which = lockScoring(c.pos), sc = SC;
      Promise.all([pool(wks, 3, function (n) { return lockWeek(n, which); }), fillFinish(pid, ps, sc).catch(function () { ps.later = false; })]).then(function (res) {
        var arr = res[0];
        if (!live()) return;
        var proj = {}, any = false; arr.forEach(function (x, i) { if (x) { proj[wks[i]] = x; any = true; } });
        // this week: the engine feed's own projection
        if (any && CUR.week) { proj[CUR.week] = {}; Object.keys(FEED.proj).forEach(function (id) { proj[CUR.week][id] = FEED.proj[id][0]; }); }
        if (STATE.tab === 'stats') { el.innerHTML = statsHTML(c, ps, any ? proj : null, false); wireChart(); }
      });
    }
    else if (name === 'news') { el.innerHTML = '<div class="dhqpc-loading">Loading the latest news…</div>'; news(pid).then(function (n) { if (live()) el.innerHTML = newsHTML(n); }); }
    else if (name === 'league') {
      el.innerHTML = leagueHTML(c, null, STATE.league);
      if (STATE.league) leagueHistory(LG[LEAGUE.id]).then(function (d) { if (live() && STATE.league) el.innerHTML = leagueHTML(c, d, false); });
    }
    else if (name === 'college') { el.innerHTML = collegeHTML(c, null); espnData(c.p).then(function (E) { if (live()) el.innerHTML = collegeHTML(c, E); }); }
    else if (name === 'awards') { el.innerHTML = awardsHTML(c, null); espnData(c.p).then(function (E) { if (live()) el.innerHTML = awardsHTML(c, E); }); }
  }
  function selectTab(name, focus) {
    STATE.tab = name;
    CARD.querySelectorAll('.dhqpc-tab').forEach(function (b) { var on = b.getAttribute('data-tab') === name; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    TABS.forEach(function (t) { var p = $('tp-' + t[0]); if (p) p.hidden = t[0] !== name; });
    fillTab(name);
  }
  function refreshLeagueBits() {
    var c = STATE.ctx; if (!c || !STATE.pid || !CARD || !CARD.querySelector('.dhqpc-strip')) return;
    var m = $('mine');
    if (!STATE.league) { if (m) m.remove(); }
    else {
      var html = mineHTML(c, null, true);
      if (m) m.outerHTML = html; else { var why = $('why'), strip = CARD.querySelector('.dhqpc-strip'); (why || strip).insertAdjacentHTML('afterend', html); }
      var seq = STATE.seq;
      leagueHistory(LG[LEAGUE.id]).then(function (d) { var mm = $('mine'); if (mm && STATE.seq === seq && STATE.league) mm.outerHTML = mineHTML(c, d, false); });
    }
    if (STATE.tab === 'league') fillTab('league');
  }

  // ── Overlay: built once, on first open ─────────────────────────────────
  function addLink(href, id) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; if (id) l.id = id; (document.head || document.documentElement).appendChild(l); return l; }
  function hasLink(href) { return Array.prototype.some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) { return l.href === href; }); }
  function build() {
    if (ROOT) { if (!ROOT.isConnected) document.body.appendChild(ROOT); return; }
    if (CFG.fonts && !document.getElementById('dhqpc-fonts') && !hasLink(FONTS_URL)) addLink(FONTS_URL, 'dhqpc-fonts');
    ROOT = document.createElement('div');
    ROOT.className = 'dhqpc-root'; ROOT.hidden = true;
    ROOT.innerHTML = '<div class="dhqpc-pc" id="dhqpc-pc" role="dialog" aria-modal="true" aria-label="Player card"><button class="dhqpc-pc-x" id="dhqpc-pcX" type="button" aria-label="Close">&times;</button><div class="dhqpc-pc-scroll" id="dhqpc-pcScroll"></div></div>';
    document.body.appendChild(ROOT);
    CARD = $('pc'); SCROLL = $('pcScroll'); XBTN = $('pcX');
    // the stylesheet: the host links dhq-player-card.css; if it didn't, fetch it from next to this script
    var css = getComputedStyle(ROOT).getPropertyValue('--dhqpc-css');
    if (!/1/.test(css) && CFG.cssUrl && !document.getElementById('dhqpc-css') && !hasLink(CFG.cssUrl)) {
      var l = addLink(CFG.cssUrl, 'dhqpc-css'), shown = function () { ROOT.style.visibility = ''; };
      ROOT.style.visibility = 'hidden'; l.onload = l.onerror = shown; setTimeout(shown, 4000); // no flash of an unstyled card
    }

    XBTN.addEventListener('click', function () { close(); });
    ROOT.addEventListener('click', function (e) { if (e.target === ROOT) close(); });
    ROOT.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG') t.remove(); }, true); // broken photo / logo: drop it
    CARD.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab],[data-act]'); if (!t) return;
      if (t.hasAttribute('data-tab')) { selectTab(t.getAttribute('data-tab')); return; }
      var act = t.getAttribute('data-act');
      if (act === 'hl') { var h = $('hl'), on = h.hidden; h.hidden = !on; t.setAttribute('aria-expanded', on); if (STATE.hl) showClip(STATE.hlI || 0, false); }
      else if (act === 'clip') showClip(+t.getAttribute('data-i'), true);
      else if (act === 'why') { var w = $('why'), o = w.hidden; w.hidden = !o; t.setAttribute('aria-expanded', o); }
      else if (act === 'more') { var li = t.closest('li'); li.classList.toggle('dhqpc-open'); t.textContent = li.classList.contains('dhqpc-open') ? 'Show less' : 'Read more'; }
      else if (act === 'demo') { setLeague(true); if (STATE.onLeagueChange) STATE.onLeagueChange(true); }
      else if (act === 'stage') { selectTab('overview'); var sw = CARD.querySelector('#dhqpc-tp-overview .dhqpc-stage-why'); if (sw) sw.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
    document.addEventListener('keydown', function (e) {
      if (!STATE.open) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') { // keep focus inside the card
        var f = Array.prototype.filter.call(CARD.querySelectorAll('button,a[href],input,[tabindex="0"]'), function (x) { return x.offsetParent !== null; });
        if (!f.length) return; var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && STATE.ctx && document.activeElement && document.activeElement.classList.contains('dhqpc-tab')) {
        var i = TABS.map(function (t) { return t[0]; }).indexOf(STATE.tab), n = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
        selectTab(TABS[n][0], true);
      }
    });
  }
  // Body scroll lock (inline styles, put back on close).
  function lock(on) {
    var b = document.body, h = document.documentElement;
    if (on && !LOCKED) { LOCKED = [b.style.overflow, h.style.overflow]; b.style.overflow = 'hidden'; h.style.overflow = 'hidden'; }
    else if (!on && LOCKED) { b.style.overflow = LOCKED[0]; h.style.overflow = LOCKED[1]; LOCKED = null; }
  }
  function message(html) { SCROLL.innerHTML = '<div class="dhqpc-pc-load">' + html + '</div>'; }

  function open(pid, opts) {
    opts = opts || {};
    pid = String(pid == null ? '' : pid);
    build();
    var lid = String(opts.leagueId || DEMO.id), sc = scoring(opts.scoringSettings), seq = ++STATE.seq;
    STATE.pid = pid; STATE.league = !!opts.league; STATE.tab = TABS.some(function (t) { return t[0] === opts.tab; }) ? opts.tab : 'overview';
    STATE.ctx = null; STATE.ps = null; STATE.hl = null; STATE.hlI = 0;
    STATE.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
    STATE.onLeagueChange = typeof opts.onLeagueChange === 'function' ? opts.onLeagueChange : null;
    STATE.me = opts.myUserId != null && opts.myUserId !== '' ? String(opts.myUserId) : !opts.myUsername && lid === DEMO.id ? DEMO.owner : null;
    STATE.meName = opts.myUsername ? String(opts.myUsername).toLowerCase() : null;
    if (!STATE.open) { lastFocus = document.activeElement; STATE.open = true; }
    var known = pl(pid);
    message('<div class="dhqpc-loading">' + (known ? 'Opening ' + esc(known.name) + '’s card…' : 'Opening the player card… (the first visit takes a few seconds)') + '</div>');
    ROOT.hidden = false; lock(true);
    requestAnimationFrame(function () { if (STATE.seq === seq) ROOT.classList.add('dhqpc-on'); });
    XBTN.focus();
    var meP = STATE.me == null && opts.myUsername ? userId(opts.myUsername) : null;
    return Promise.all([ensure(lid), meP]).then(function (r) {
      // kickers / defenders may score differently from the offense (see scoringFor)
      var q = pl(pid);
      return scoringFor(q ? q.pos : '', opts.scoringSettings).then(function (x) { sc = x; return ensureScoring(sc); }).then(function () { return r; });
    }).then(function (r) {
      if (STATE.seq !== seq) return false;
      var L = r[0]; if (r[1]) STATE.me = r[1];
      activate(L, sc);
      var p = pl(pid);
      if (!p) { message(empty('🔎', 'Player not found', 'DHQ has no card for this player.')); return false; }
      if (!known) message('<div class="dhqpc-loading">Opening ' + esc(p.name) + '’s card…</div>');
      // kickers / defenders: last season's finish in this scoring (the career stage reads it)
      if (p.kidp && p.exp >= 1 && !(p.pos === 'K' && !sc.rules)) yearRanks(SEASON - 1, sc).catch(function () { /* finish stays unknown */ });
      return playerStats(pid).catch(function () { return { seasons: [], weeks: [] }; }).then(function (ps) {
        return p.kidp ? fillFinish(pid, ps, sc, [SEASON - 1]).then(function () { return ps; }, function () { return ps; }) : ps;
      }).then(function (ps) {
        if (STATE.seq !== seq) return false;
        activate(L, sc);
        var c = context(pid, ps); STATE.ctx = c; STATE.ps = ps;
        CARD.setAttribute('aria-label', c.p.name + ' player card');
        SCROLL.innerHTML = shell(c); SCROLL.scrollTop = 0;
        selectTab(STATE.tab);
        fillHighlights(c, seq);
        if (STATE.league) refreshLeagueBits();
        news(pid).then(function (n) { var el = $('n-news'); if (el && n && n.length && STATE.seq === seq) el.textContent = n.length; });
        espnData(c.p); // warm College / Awards
        return true;
      });
    }, function (e) {
      if (STATE.seq !== seq) return false;
      message(empty('⚠️', 'Couldn’t load DHQ’s data right now', 'Check the connection and try again' + (e && e.message ? ' (' + esc(e.message) + ')' : '') + '.'));
      return false;
    });
  }
  function close() {
    if (!STATE.open) return;
    STATE.open = false; STATE.pid = null; STATE.ctx = null;
    var seq = ++STATE.seq;
    ROOT.classList.remove('dhqpc-on');
    setTimeout(function () { if (STATE.seq === seq) { ROOT.hidden = true; SCROLL.innerHTML = ''; } }, 180);
    lock(false);
    if (lastFocus && lastFocus.focus && lastFocus.isConnected) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    lastFocus = null;
    var cb = STATE.onClose; STATE.onClose = null;
    if (cb) { try { cb(); } catch (e) { setTimeout(function () { throw e; }); } }
  }
  function setLeague(on) { STATE.league = !!on; refreshLeagueBits(); }

  window.DHQPlayerCard = {
    version: VERSION,
    open: open,
    close: close,
    setLeague: setLeague,
    // Warm the big data (Sleeper players, DHQ feed, season stats; + league history with { league:true }).
    // Resolves to a small search index: { leagueId, players: [{ id, name, pos, team, teamName, value }] }.
    preload: function (opts) {
      opts = opts || {};
      var lid = String(opts.leagueId || DEMO.id), sc = scoring(opts.scoringSettings);
      return ensure(lid).then(function (L) {
        return ensureScoring(sc).then(function () {
          if (opts.league) leagueHistory(L);
          return { leagueId: lid, players: index(L).slice() };
        });
      });
    },
    // Data bases: { locksBase, valuesBase, highlightsBase, valuesUrl, cssUrl, fonts }. Call before the first open.
    config: function (o) {
      Object.keys(o || {}).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(CFG, k)) CFG[k] = o[k]; });
      return JSON.parse(JSON.stringify(CFG));
    }
  };
})();
