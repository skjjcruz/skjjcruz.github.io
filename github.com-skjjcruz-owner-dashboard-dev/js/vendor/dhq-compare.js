// DHQ Compare v1.0.0 — the Start/Sit player boxes as a drop-in (window.DHQCompare).
// Built from lab/startsit.html by scripts/build-compare-module.cjs (owner ask 2026-11-18). Do not edit:
// change lab/startsit.html or scripts/compare-module-wrapper.part and re-run the script.
(function () {
  // ── Source league: the engine server's finished values ───────────────────
  // The Psycho League (Sleeper): 16 teams, Superflex, Half-PPR, IDP. Owner
  // ruling 2026-11-10: its values as-is; the toggles refine them.
  var SOURCE = { id: '1312100327931019264', teams: 16, qb: 'sf', scoring: 'half', tep: '0' };
  var VALUES_URL = 'https://hovnqztlbsgsywrbidbh.supabase.co/functions/v1/dhq-league?league=' + SOURCE.id;
  var PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
  var VALUES_KEY = 'dhq_tc_values_v1', PLAYERS_KEY = 'dhq_tc_players_v1', PREF_KEY = 'dhq_tc_league_v1', STATS_KEY = 'dhq_tc_stats_v2';   // v2: the rows lab/projections.html keeps (+ defenders' IDP stats)
  // This season's actual points and games (Sleeper season stats, the same feed the app reads; actual results, not projections).
  var SEASON = 2026, STATS_URL = 'https://api.sleeper.app/v1/stats/nfl/regular/' + SEASON, STATS_TTL = 6 * 3600e3;
  var STATS = {};
  // Defenders (launch QA 2026-11-17, as lab/projections.html): Sleeper's pts_* leave IDP stats out, so a
  // DL / LB / DB is scored from his raw IDP stats with the default league's IDP rules (its idp_* keys and
  // defensive bonuses), cached a day; his projection is the lock's copy for that league (the same rules).
  var LEAGUE_URL = 'https://api.sleeper.app/v1/league/' + SOURCE.id, IDPR_KEY = 'dhq_tc_idp_rules_v1';
  var IDPR = { idp_tkl_solo: 0.5, idp_tkl_ast: 0.25, idp_tkl_loss: 2, idp_sack: 5, idp_sack_yd: 0.1, idp_qb_hit: 1.25, idp_int: 5, idp_int_ret_yd: 0.1, idp_pass_def: 5, idp_pass_def_3p: 1, idp_ff: 3, idp_fum_rec: 3, idp_fum_ret_yd: 0.1, idp_def_td: 6, idp_safe: 2, idp_blk_kick: 3 }; // the league's rules on 2026-11-17, used if Sleeper cannot be reached
  var idprLoading = null;
  function isDefKey(k) { return /^idp_/.test(k) || /^bonus_(tkl|sack|def)_/.test(k); }
  function defLine(l) { var o = {}; Object.keys(l || {}).forEach(function (k) { if (isDefKey(k) && l[k]) o[k] = l[k]; }); return o; }
  function loadIdpRules() {
    if (idprLoading) return idprLoading;
    var c = load(IDPR_KEY);
    if (c && c.rules && Date.now() - c.ts < 86400e3) { IDPR = c.rules; return (idprLoading = Promise.resolve(IDPR)); }
    return (idprLoading = getJSON(LEAGUE_URL).then(function (lg) {
      var r = defLine(lg && lg.scoring_settings);
      if (Object.keys(r).length) { IDPR = r; store(IDPR_KEY, { ts: Date.now(), rules: r }); }
      return IDPR;
    }).catch(function () { if (c && c.rules) IDPR = c.rules; return IDPR; }));
  }
  function idpPts(line) { var t = 0; for (var k in IDPR) if (line && line[k]) t += line[k] * IDPR[k]; return t; }
  // This week's bye teams: the app's scoreboard relay (ESPN's slate, nfl-scoreboard) for the current NFL week.
  var STATE_URL = 'https://api.sleeper.app/v1/state/nfl', SCOREBOARD_URL = 'https://sxshiqyxhhifvtfqawbq.supabase.co/functions/v1/nfl-scoreboard', BYE_KEY = 'dhq_tc_bye_v1';
  var BYE = {}, ESPN_TEAM = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR' };
  function loadByes() {
    var c = load(BYE_KEY);
    if (c && Date.now() - c.ts < 3 * 3600e3) { BYE = c.teams || {}; return Promise.resolve(); }
    return getJSON(STATE_URL).then(function (st) {
      if (!st || st.season_type !== 'regular' || !st.week) return {};
      return getJSON(SCOREBOARD_URL + '?week=' + st.week + '&seasontype=2').then(function (sb) {
        var out = {}; ((sb.week && sb.week.teamsOnBye) || []).forEach(function (t) { var a = String(t.abbreviation || '').toUpperCase(); out[ESPN_TEAM[a] || a] = st.week; });
        return out;
      });
    }).then(function (teams) { BYE = teams || {}; store(BYE_KEY, { ts: Date.now(), teams: BYE }); }).catch(function () { BYE = (c && c.teams) || {}; });
  }
  function onBye(team) { return !!BYE[String(team || '').toUpperCase()]; }
  var VALUES_TTL = 3 * 3600e3, PLAYERS_TTL = 3 * 86400e3;
  var IDP = { DL: 1, LB: 1, DB: 1, DE: 1, DT: 1, CB: 1, S: 1, ILB: 1, OLB: 1 };
  var MAX = 10000;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked: run without */ } }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  var tt; function toastUnused(m) { var t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 2400); }

  // ── State ────────────────────────────────────────────────────────────────
  var S = { scoring: 'ppr', qb: 'sf', tep: '0', teams: '12', idp: '0' };
  var DATA = null;      // { builtAt, week, values:{pid:[value, age, projMedian, ppg]}, picks:{overall:value} }
  var PLAYERS = null;   // { pid: [name, pos, team] }
  var SEARCH = [];      // [{ id, name, pos, team, base }]
  // ── Refinements (owner 2026-11-10): estimated, on top of the server values ─
  // Position factors from the source league's format to the visitor's. They
  // never touch picks' order and never exceed the 10,000 scale.
  function factor(pos, base) {
    var f = 1;
    var sc = { ppr: { RB: 1.03, WR: 1.06, TE: 1.06 }, half: {}, std: { RB: 0.98, WR: 0.93, TE: 0.93 } };
    f *= (sc[S.scoring][pos] || 1);
    if (S.qb === '1qb' && pos === 'QB') f *= 0.42 + 0.22 * Math.min(1, base / 8000);
    if (S.tep === '1' && pos === 'TE') f *= 1.15;
    return f;
  }
  function teamsCurve(v) {
    // Fewer teams: depth is easier to find, so lesser players are worth less.
    var k = 1 + (SOURCE.teams - Number(S.teams)) * 0.025;
    return MAX * Math.pow(Math.max(0, v) / MAX, k);
  }
  function isEstimated() { return S.scoring !== SOURCE.scoring || S.qb !== SOURCE.qb || S.tep !== SOURCE.tep || Number(S.teams) !== SOURCE.teams; }
  function playerValue(pid) {
    var r = DATA && DATA.values[pid]; if (!r) return 0;
    var pos = (PLAYERS && PLAYERS[pid] && PLAYERS[pid][1]) || '';
    var v = r[0] * factor(pos, r[0]);
    return Math.round(Math.min(MAX - 1, teamsCurve(v)));
  }
  // ── Data loading (finished numbers only; nothing is computed here) ───────
  function slimValues(d) {
    var out = { builtAt: d.built_at, week: d.dhq_proj && d.dhq_proj.week, values: {}, picks: {} };
    var ps = (d.intel && d.intel.playerScores) || {}, pm = (d.intel && d.intel.playerMeta) || {}, pj = (d.dhq_proj && d.dhq_proj.players) || {};
    Object.keys(ps).forEach(function (pid) {
      var v = ps[pid]; if (!(v > 0)) return;
      var m = pm[pid] || {}, j = pj[pid] || {};
      out.values[pid] = [v, m.age || null, (j.no_line || j.median == null) ? null : Math.round(j.median * 10) / 10, m.ppg != null ? m.ppg : null];
    });
    var pv = (d.intel && d.intel.dhqPickValues) || {};
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
  function getJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function loadData() {
    var cv = load(VALUES_KEY), cp = load(PLAYERS_KEY), now = Date.now();
    var vP = (cv && now - cv.ts < VALUES_TTL) ? Promise.resolve(cv.data)
      : getJSON(VALUES_URL).then(function (d) { var s = slimValues(d); store(VALUES_KEY, { ts: now, data: s }); return s; })
        .catch(function (e) { if (cv) return cv.data; throw e; });
    return vP.then(function (vals) {
      DATA = vals;
      var have = cp && now - cp.ts < PLAYERS_TTL && Object.keys(vals.values).every(function (pid) { return cp.data[pid]; });
      if (have) return cp.data;
      return getJSON(PLAYERS_URL).then(function (all) { var s = slimPlayers(all, vals.values); store(PLAYERS_KEY, { ts: now, data: s }); return s; })
        .catch(function (e) { if (cp) return cp.data; throw e; });
    }).then(function (pl) {
      PLAYERS = pl;
      var cs = load(STATS_KEY);
      var sP = (cs && Date.now() - cs.ts < STATS_TTL) ? Promise.resolve(cs.data)
        : getJSON(STATS_URL).then(function (all) {
            // [PPR, Half, Std, games, catches, defenders' raw IDP stats]
            var out = {}; Object.keys(DATA.values).forEach(function (pid) { var r = all[pid]; if (r && r.gp > 0) out[pid] = [r.pts_ppr || 0, r.pts_half_ppr || 0, r.pts_std || 0, r.gp, r.rec || 0, IDP[(PLAYERS[pid] || [])[1]] ? defLine(r) : 0]; });
            store(STATS_KEY, { ts: Date.now(), data: out }); return out;
          }).catch(function () { return cs ? cs.data : {}; });
      return Promise.all([sP, loadByes(), loadIdpRules()]).then(function (res) { STATS = res[0] || {}; return pl; });
    }).then(function (pl) {
      // Only players on an NFL roster today (owner 2026-11-11): free agents stay out of the lists.
      SEARCH = Object.keys(DATA.values).filter(function (pid) { return PLAYERS[pid] && PLAYERS[pid][2] && PLAYERS[pid][2] !== 'FA'; }).map(function (pid) {
        var p = PLAYERS[pid]; return { id: pid, name: p[0], pos: p[1], team: p[2], key: p[0].toLowerCase().replace(/[^a-z0-9 ]/g, '') };
      });
    });
  }


  var POS_COLOR = { QB: '#ff6b6b', RB: '#4ecdc4', WR: '#45b7d1', TE: '#f7dc6f', K: '#bb8fce', DL: '#e67e22', LB: '#F0A500', DB: '#5DADE2', PICK: '#D4AF37' };
  function face(pid, col) { return '<span class="face" style="--pc:' + col + '"><img src="https://sleepercdn.com/content/nfl/players/thumb/' + encodeURIComponent(pid) + '.jpg" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>'; }
  // Season points in the visitor's scoring (TE premium: +0.5 a catch for tight ends), games, per game.
  function season(pid, pos) {
    var r = STATS[pid]; if (!r) return null;
    var pts = r[{ ppr: 0, half: 1, std: 2 }[S.scoring]] + (S.tep === '1' && pos === 'TE' ? 0.5 * r[4] : 0) + (IDP[pos] ? idpPts(r[5]) : 0);
    return { pts: pts, gp: r[3], ppg: r[3] ? pts / r[3] : 0 };
  }
  // ── Weekly projections: the Lab's weekly lock file (same origin) ─────────
  // DHQ's and Sleeper's Half-PPR projections (the file's own numbers) plus
  // ESPN's and CBS's projected stat lines, scored here with the same Half-PPR
  // rules. Sleeper shown beside DHQ by owner ask 2026-11-11 (this page only).
  // Week tabs (owner ask 2026-11-11): every week of the season has its own
  // lock file, so a user can step back and see how each site's projection
  // compared with what the player actually scored. ESPN / CBS were first saved
  // in Week 9; earlier weeks show dashes there.
  var CUR = null, WEEKS = {}, curLoading = null;
  function scoreLine(line, rules) { var t = 0; if (!line) return null; for (var k in rules) if (line[k]) t += line[k] * rules[k]; return Math.round(t * 100) / 100; }
  function teamKey(t) { var a = String(t || '').toUpperCase(); return ESPN_TEAM[a] || a; }
  function loadCurrent() {
    if (!curLoading) curLoading = getJSON(STATE_URL).then(function (st) { CUR = { week: st && st.week, season: (st && st.season) || SEASON }; return CUR; }).catch(function () { CUR = { failed: true }; return CUR; });
    return curLoading;
  }
  // Byes and opponents (with home / away) for one week from the scoreboard relay.
  function slate(week) {
    var out = { opp: {}, away: {}, bye: {} };
    return getJSON(SCOREBOARD_URL + '?week=' + week + '&seasontype=2').then(function (sb) {
      ((sb.week && sb.week.teamsOnBye) || []).forEach(function (t) { out.bye[teamKey(t.abbreviation)] = 1; });
      (sb.events || []).forEach(function (e) {
        var cs = (e.competitions && e.competitions[0] && e.competitions[0].competitors) || [];
        if (cs.length !== 2) return;
        var t = cs.map(function (c) { return teamKey(c.team && c.team.abbreviation); });
        out.opp[t[0]] = t[1]; out.opp[t[1]] = t[0];
        if (cs[0].homeAway === 'away') out.away[t[0]] = 1; if (cs[1].homeAway === 'away') out.away[t[1]] = 1;
      });
      out.ok = true; return out;
    }).catch(function () { return out; });
  }
  // What each player actually scored in one week: Sleeper's weekly stats for
  // players who played, scored with the lock's Half-PPR rules, exactly as
  // Mission Control's score sheets grade them (so the two always agree).
  // Defenders' results also carry .d: the same line with the league's IDP rules (lab/projections.html).
  function actuals(week, rules) {
    var res = {}, off = {};
    Object.keys(rules).forEach(function (k) { if (!isDefKey(k)) off[k] = rules[k]; });
    return Promise.all([getJSON(STATS_URL + '/' + week), loadIdpRules()]).then(function (x) {
      var s = x[0];
      Object.keys(s || {}).forEach(function (pid) {
        var l = s[pid]; if (!(l && l.gp >= 1)) return;
        res[pid] = { h: scoreLine(l, rules), r: l.rec || 0 };
        if (Object.keys(defLine(l)).length) res[pid].d = { h: Math.round((scoreLine(l, off) + idpPts(l)) * 100) / 100, r: l.rec || 0 };
      });
      return res;
    }).catch(function () { return res; });
  }
  // A week's DHQ / Sleeper projection and a result for a player: defenders take the league copy (IDP rules).
  function weekProj(W, k, pid, pos) { return IDP[pos] && W.lg && W.lg[k][pid] ? W.lg[k][pid] : W[k][pid]; }
  function weekRes(res, pid, pos) { var o = res && res[pid]; return o && IDP[pos] && o.d ? o.d : o; }
  function loadWeek(n) {
    if (WEEKS[n]) return WEEKS[n].then ? WEEKS[n] : Promise.resolve(WEEKS[n]);
    var yr = (CUR && CUR.season) || SEASON, isCur = CUR && n === CUR.week;
    WEEKS[n] = getJSON(CFG.locksBase + yr + '-w' + n + '.json').then(function (d) {
      var half = (d.scorings && d.scorings.half) || {}, rules = half.scoring || {}, hp = half.players || {}, pf = d.platforms || {};
      var w = { week: n, cur: isCur, built: d.built, rebuilt: !!d.reconstructed, info: d.players || {}, kick: d.kickoffs || {}, dhq: {}, slp: {}, espn: {}, cbs: {}, hasSites: !!(pf.espn || pf.cbs) };
      // Every number is kept as { h: Half-PPR points, r: receptions }, so the
      // scoring and TE-premium switches re-score it exactly (see pts()). DHQ's
      // and Sleeper's receptions come from the lock's own full-PPR copy of the
      // same projections (a league whose rules match Half-PPR but for rec = 1):
      // r = 2 x (PPR - Half). Kickers and defenders score no receptions.
      var pprSet = null;
      Object.keys(d.scorings || {}).forEach(function (k) {
        var sc = d.scorings[k].scoring || {}; if (pprSet || sc.rec !== 1 || sc.bonus_rec_te) return;
        if (OFF_RULES.every(function (x) { return (sc[x] || 0) === (rules[x] || 0); })) pprSet = d.scorings[k].players || {};
      });
      Object.keys(hp).forEach(function (pid) {
        var r = hp[pid], q = pprSet && pprSet[pid], pos = (w.info[pid] || {}).pos, catches = REC_POS[pos];
        if (r && r[0] != null) w.dhq[pid] = { h: r[0], r: catches && q && q[0] != null ? Math.max(0, 2 * (q[0] - r[0])) : 0 };
        if (r && r[1] != null) w.slp[pid] = { h: r[1], r: catches && q && q[1] != null ? Math.max(0, 2 * (q[1] - r[1])) : 0 };
      });
      w.exact = !!pprSet; w.rules = rules;
      // the lock's copy scored with the source league's own rules: defenders' projections (no catches)
      var lgSet = d.scorings && d.scorings['league_' + SOURCE.id];
      if (lgSet && lgSet.players) {
        w.lg = { dhq: {}, slp: {} };
        Object.keys(lgSet.players).forEach(function (pid) {
          var r = lgSet.players[pid]; if (!r || !IDP[(w.info[pid] || {}).pos]) return;
          if (r[0] != null) w.lg.dhq[pid] = { h: r[0], r: 0 };
          if (r[1] != null) w.lg.slp[pid] = { h: r[1], r: 0 };
        });
      }
      ['espn', 'cbs'].forEach(function (k) { var src = pf[k] || {}; Object.keys(src).forEach(function (pid) { if (pid !== 'fetched' && src[pid] && Object.keys(src[pid]).length) w[k][pid] = { h: scoreLine(src[pid], rules), r: src[pid].rec || 0 }; }); });
      // The last column: this week shows LAST week's score; a past week shows that week's own result.
      var resWeek = isCur ? n - 1 : n;
      // the whole formula behind each projection (scripts/build-projections-lock.mjs writes it beside the lock)
      var fx = getJSON(CFG.locksBase + yr + '-w' + n + '-formula.json').then(function (x) { return (x && x.players) || {}; }).catch(function () { return {}; });
      return Promise.all([slate(n), resWeek >= 1 ? actuals(resWeek, rules) : {}, isCur && resWeek >= 1 ? slate(resWeek) : null, fx]).then(function (x) {
        w.slate = x[0]; w.res = x[1]; w.resBye = isCur ? (x[2] ? x[2].bye : {}) : x[0].bye; w.formula = x[3];
        // the lock file's own matchups fill any gap in the scoreboard's
        Object.keys(w.info).forEach(function (pid) { var i = w.info[pid]; if (i && i.team && i.opp && !w.slate.opp[teamKey(i.team)]) w.slate.opp[teamKey(i.team)] = teamKey(i.opp); });
        return (WEEKS[n] = w);
      });
    }).catch(function () { return (WEEKS[n] = { failed: true, week: n }); });
    return WEEKS[n];
  }
  // The rules that must match Half-PPR for the lock's PPR copy to be usable.
  var OFF_RULES = ['pass_yd', 'pass_td', 'pass_int', 'pass_2pt', 'rush_yd', 'rush_td', 'rush_2pt', 'rec_yd', 'rec_td', 'rec_2pt', 'fum_lost'];
  var REC_POS = { RB: 1, WR: 1, TE: 1, QB: 1 };
  var REC_PTS = { ppr: 1, half: 0.5, std: 0 };
  // One projection or result in the page's scoring: Half-PPR points, moved by
  // the reception value, plus the TE premium (+0.5 a catch) when it is on.
  function pts(o, pos) {
    if (o == null) return null;
    return o.h + (REC_PTS[S.scoring] - 0.5) * o.r + (S.tep === '1' && pos === 'TE' ? 0.5 * o.r : 0);
  }
  function scoringName() { return { ppr: 'PPR', half: 'Half-PPR', std: 'Standard' }[S.scoring] + (S.tep === '1' ? ' with TE premium' : ''); }
  // ── Start / Sit (owner design 2026-11-13) ───────────────────────────────
  // The call is the weekly projection only: the highest DHQ projection this
  // week, in the visitor's scoring, gets the START. DHQ Value is shown by
  // the photo for reference and never decides. Within 0.05 pts is too close
  // to call. A player on a bye, ruled out or without a projection cannot win.
  var PICK_KEY = 'dhq_ss_players_v1', MAX_PICKS = 4;
  var PICKS = [], W = null;
  function posOf(pid) { return (PLAYERS && PLAYERS[pid] && PLAYERS[pid][1]) || ''; }
  function nameOf(pid) { return (PLAYERS && PLAYERS[pid] && PLAYERS[pid][0]) || 'Player ' + pid; }
  function last(name) { var p = String(name).split(' '); return p.length > 1 && /^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(p[p.length - 1]) ? p[p.length - 2] : p[p.length - 1]; }
  function uniq(a) { var seen = {}; return (a || []).filter(function (x) { x = String(x); if (!x || seen[x]) return false; seen[x] = 1; return true; }); }
  function valid(pid) { return !!(PLAYERS && PLAYERS[pid] && DATA && DATA.values[pid]) && (S.idp === '1' || !IDP[posOf(pid)]); }

  // DHQ's reasons, from the lock's "why" line: factor headings look like
  // "Role & opportunity +5.9%: QB1 on the depth chart · 99% of snaps".
  // The engine's internal model step ("DHQ WR model …") gives the expected
  // workload instead; "Baseline" is the raw starting point and is skipped.
  // The line is cut at about 300 characters, so a cut-off last part is dropped.
  var FACTOR = /^([A-Z][A-Za-z &\/()-]*?) ([+-]?\d+(?:\.\d+)?)%: (.*)$/;
  function parseWhy(s) {
    s = String(s || ''); var segs = s.split(' · '), cut = s.length >= 280, out = { reads: [], line: null, matchup: null }, cur = null;
    segs.forEach(function (g, i) {
      var tail = cut && i === segs.length - 1, m = FACTOR.exec(g);
      if (m) {
        cur = null;
        if (/^DHQ /.test(m[1])) {
          var t = /^Typical game [\d.]+(?:, (?:shown|average) [\d.]+(?: \([^)]*\))?)?: (.*)$/.exec(m[3]);
          if (t && !tail) out.line = t[1].split(', ').filter(function (x) { return x && !/team total|snaps|^Typical/.test(x); }).join(' · ');
          return;
        }
        if (Math.abs(+m[2]) < 0.05) return;
        cur = { k: m[1], p: +m[2], d: tail ? '' : m[3], more: 0 };
        out.reads.push(cur);
        if (m[1] === 'Opponent vs position' && !tail) out.matchup = m[3];
        return;
      }
      if (/^Baseline: /.test(g)) { cur = null; return; }
      // a factor's further details ("99% of snaps"); a cut-off last part is dropped
      if (cur && !tail && cur.more < 2) { cur.d += (cur.d ? ' \u00b7 ' : '') + g; cur.more++; }
    });
    out.reads.sort(function (a, b) { return Math.abs(b.p) - Math.abs(a.p); });
    return out;
  }

  // Everything one column shows, in the page's scoring.
  function facts(pid) {
    var pl = PLAYERS[pid] || ['Player ' + pid, '', ''], pos = pl[1], info = (W && W.info[pid]) || {}, tm = teamKey(info.team || pl[2]);
    var bye = W && W.slate && W.slate.ok ? !!W.slate.bye[tm] : onBye(tm);
    var r = (DATA && DATA.values[pid]) || [], z = season(pid, pos), inj = info.inj || null;
    var out = /^(Out|IR|PUP|NA|Suspended)$/i.test(inj || '');
    var f = { id: pid, name: pl[0], pos: pos, team: tm, age: r[1] || null, value: playerValue(pid), bye: bye, inj: inj, out: out,
      dhq: bye || !W ? null : pts(weekProj(W, 'dhq', pid, pos), pos), slp: bye || !W ? null : pts(weekProj(W, 'slp', pid, pos), pos),
      espn: bye || !W ? null : pts(W.espn[pid], pos), cbs: bye || !W ? null : pts(W.cbs[pid], pos),
      last: W && W.res[pid] && pos !== 'DEF' ? pts(weekRes(W.res, pid, pos), pos) : null, lastBye: !!(W && W.resBye && W.resBye[tm]),
      season: z, opp: W && W.slate ? W.slate.opp[tm] || teamKey(info.opp) || null : null, away: !!(W && W.slate && W.slate.away[tm]),
      kick: W && W.kick ? W.kick[tm] || null : null, imp: info.imp, spr: info.spr, why: parseWhy(info.why) };
    f.can = !f.bye && !f.out && f.dhq != null && f.dhq > 0;
    return f;
  }
  function kickText(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function started(iso) { var d = iso && new Date(iso); return !!(d && !isNaN(d) && d.getTime() <= Date.now()); }
  function n1(x) { return x == null ? null : x.toFixed(1); }
  function spreadText(s) { if (s == null || isNaN(s)) return null; s = +s; return s < 0 ? 'Favored by ' + Math.abs(s) : s > 0 ? 'Underdog by ' + s : 'Pick ’em'; }

  // The call: highest DHQ projection among the players who can play.
  function decide(F) {
    var live = F.filter(function (f) { return f.can; }).sort(function (a, b) { return b.dhq - a.dhq; });
    if (!live.length) return { win: null, even: false, live: live };
    var even = live.length > 1 && live[0].dhq - live[1].dhq < 0.05;
    return { win: even ? null : live[0], even: even, live: live };
  }
  // DHQ only on this page (owner ruling 2026-11-13: no other sites' projections).

  function drawCall(F, call) {
    var box = ROOT.querySelector('.ss-call');
    if (F.length < 2) { box.hidden = true; return; }
    box.hidden = false; box.classList.toggle('even', !call.win);
    if (!call.win) {
      box.innerHTML = '<div class="ss-call-txt"><span class="ss-call-k">' + (call.even ? 'Too close to call' : 'No start yet') + '</span><span class="ss-call-h">'
        + (call.even ? esc(call.live[0].name) + ' <span>=</span> ' + esc(call.live[1].name) : 'Nobody here is projected to play') + '</span><span class="ss-call-s">'
        + (call.even ? 'DHQ projects ' + esc(last(call.live[0].name)) + ' for <b>' + n1(call.live[0].dhq) + '</b> and ' + esc(last(call.live[1].name)) + ' for <b>' + n1(call.live[1].dhq) + '</b>. Go with your gut, or add another player.' : 'Every player here is on a bye, ruled out or has no projection this week.') + '</span></div>';
      return;
    }
    var w = call.win, next = call.live[1];
    var s = 'DHQ projects <b>' + n1(w.dhq) + ' pts</b>' + (next ? ', <b>' + (w.dhq - next.dhq).toFixed(1) + ' more</b> than ' + esc(next.name) + ' (' + n1(next.dhq) + ')' : '') + '.';
    box.innerHTML = face(w.id, 'var(--gold)') + '<div class="ss-call-txt"><span class="ss-call-k">DHQ says start</span><span class="ss-call-h">' + esc(w.name) + ' <span>' + n1(w.dhq) + '</span></span>'
      + '<span class="ss-call-s">' + s + '</span></div>';
  }

  // One bullet: label ··· value. lead marks the best of that metric on the board.
  function li(k, v, cls) { return '<li data-al="' + esc(k) + '"><span class="k">' + k + '</span><span class="dots"></span><span class="v' + (cls ? ' ' + cls : '') + '">' + v + '</span></li>'; }
  function best(F, key, all) {
    var have = F.filter(function (f) { return f[key] != null && (all || (!f.bye && !f.out)); }); if (have.length < 2) return null;
    var top = Math.max.apply(null, have.map(function (f) { return f[key]; }));
    return have.filter(function (f) { return f[key] === top; }).length === 1 ? top : null;
  }
  // ── The formula, step by step ────────────────────────────────────────────
  // Straight from DHQ's weekly engine (the -formula.json file): starting
  // point (DHQ baseline and its stat line) x the eleven weighted factors =
  // "all factors"; the DHQ position model takes that to the projection.
  // Stored in Half-PPR; shown in the visitor's scoring: the baseline moves by
  // its catches like every other number here, the factor multipliers do not
  // depend on scoring, and the model step is whatever is left to land exactly
  // on the projection shown at the top of the column.
  var STAT = { pass_att: ['att', 1], pass_cmp: ['cmp', 1], pass_yd: ['pass yds', 0], pass_td: ['pass TD', 1], pass_int: ['INT', 1], rush_att: ['rushes', 1], rush_yd: ['rush yds', 0], rush_td: ['rush TD', 2],
    rec_tgt: ['targets', 1], rec: ['catches', 1], rec_yd: ['rec yds', 0], rec_td: ['rec TD', 2], fum_lost: ['fumbles lost', 2], idp_tkl: ['tackles', 1], idp_tkl_solo: ['solo', 1], idp_tkl_ast: ['assists', 1],
    idp_sack: ['sacks', 2], idp_int: ['INT', 2], idp_pass_def: ['pass defended', 2], idp_ff: ['forced fum', 2], idp_tkl_loss: ['TFL', 2], idp_qb_hit: ['QB hits', 2], idp_fum_rec: ['fum rec', 2],
    xpm: ['XP made', 1], fgm: ['FG made', 1], fga: ['FG att', 1] };
  var SKIP_STAT = { idp_tkl: 1, pass_cmp: 1 };
  function statLine(line) {
    return Object.keys(line || {}).filter(function (k) { return !SKIP_STAT[k] && line[k]; }).map(function (k) {
      var m = STAT[k] || [k.replace(/_/g, ' '), 1], v = +line[k];
      return '<span><b>' + v.toFixed(m[1]) + '</b> ' + esc(m[0]) + '</span>';
    }).join('');
  }
  // DHQ only (owner 2026-11-13): the engine's notes mention Sleeper's projected
  // volume as a reference ("27.6 projected attempts, Sleeper 31.0"); not shown here.
  function noSites(t) { return String(t || '').replace(/,?\s*(Sleeper|ESPN|CBS)\s+[\d.]+/g, ''); }
  function sgn(x, dp) { return (x > 0 ? '+' : x < 0 ? '\u2212' : '') + Math.abs(x).toFixed(dp == null ? 1 : dp); }
  // Owner ask 2026-11-18: "How DHQ built this projection" (and DHQ's read under it) fold away behind a
  // toggle on the heading, closed by default. One tap opens or closes every column at once so the rows
  // stay lined up; the choice is remembered on this device.
  var FX_KEY = 'dhq_ss_fx_open_v1', FX_OPEN = false;
  try { FX_OPEN = localStorage.getItem(FX_KEY) === '1'; } catch (e) { FX_OPEN = false; }
  function fxMore(h) { return h ? '<div class="ss-more' + (FX_OPEN ? ' open' : '') + '">' + h + '</div>' : ''; }
  function fxToggle(scope) {
    FX_OPEN = !FX_OPEN; try { localStorage.setItem(FX_KEY, FX_OPEN ? '1' : '0'); } catch (e) { /* this visit only */ }
    [].forEach.call(scope.querySelectorAll('.ss-more'), function (el) { el.classList.toggle('open', FX_OPEN); });
    [].forEach.call(scope.querySelectorAll('[data-fxtog]'), function (b) { b.setAttribute('aria-expanded', String(FX_OPEN)); });
  }
  function formula(f, X) {
    if (!X) return '';
    var pos = f.pos, rec = (X.line && X.line.rec) || 0, base = pts({ h: X.b[0], r: rec }, pos), afterF = base * X.m, after = afterF * (X.q || 1);
    // where the position model starts, in this scoring (the engine stores it in Half-PPR)
    var halfAfter = X.b[0] * X.m * (X.q || 1), from = X.md && halfAfter > 0 ? X.md.from * (after / halfAfter) : after;
    var other = X.md && Math.abs(X.md.from - halfAfter) > 0.06;
    var fin = f.dhq != null ? f.dhq : pts({ h: X.pts[0], r: rec }, pos), k = X.pts[0] ? fin / X.pts[0] : 1;
    var lo = X.pts[1] != null ? X.pts[1] * k : null, hi = X.pts[2] != null ? X.pts[2] * k : null;
    var modelPct = (X.md ? from : after) ? (fin / (X.md ? from : after) - 1) * 100 : 0;
    var qStep = X.q ? '<li class="fx-s" data-al="fx-q"><div class="fx-row"><span class="fx-k">Questionable</span><span class="fx-p pd">\u00d7' + X.q.toFixed(2) + '</span></div>'
      + '<div class="fx-eq">' + afterF.toFixed(1) + ' \u00d7 ' + X.q.toFixed(2) + ' = <b>' + after.toFixed(1) + '</b></div><small>Questionable players sit out about one game in five, so DHQ trims his whole line by 8%.</small></li>' : '';
    var oStep = other ? '<li class="fx-s" data-al="fx-other"><div class="fx-row"><span class="fx-k">Other adjustments</span><span class="fx-p ' + (from >= after ? 'pu' : 'pd') + '">' + sgn((from / after - 1) * 100) + '%</span></div>'
      + '<div class="fx-eq">' + after.toFixed(1) + ' \u2192 <b>' + from.toFixed(1) + '</b></div></li>' : '';
    var rows = (X.f || []).map(function (r) {
      // [key, label, weight, multiplier, impact %, note, ruled out, has data]
      var pct = r[4], cls = r[6] ? 'out' : !r[7] ? 'nod' : pct > 0.05 ? 'up' : pct < -0.05 ? 'dn' : 'flat';
      var w = Math.min(50, Math.abs(pct) * 5);
      return '<li class="fx-f ' + cls + '" data-al="fx-' + esc(r[0]) + '"><div class="fx-row"><span class="fx-k">' + esc(r[1]) + '</span><span class="fx-w" title="Weight in the formula (the eleven add up to 100)">wt ' + r[2] + '</span>'
        + '<span class="fx-p">' + (r[6] ? 'OUT' : !r[7] ? 'no data' : sgn(pct) + '%') + '</span></div>'
        + '<div class="fx-bar" aria-hidden="true"><i style="' + (pct >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%"></i></div>'
        + (r[5] ? '<small>' + esc(noSites(r[5])) + '</small>' : '') + '</li>';
    }).join('');
    var extra = (X.x || []).map(function (e) { return '<small class="fx-x">' + esc(e[0]) + ' ' + sgn(e[1]) + '%' + (e[2] ? ': ' + esc(noSites(e[2])) : '') + '</small>'; }).join('');
    var model = X.md
      ? '<li class="fx-s" data-al="fx-model"><div class="fx-row"><span class="fx-k">' + esc(X.md.l) + '</span><span class="fx-p ' + (modelPct >= 0 ? 'pu' : 'pd') + '">' + sgn(modelPct) + '%</span></div>'
        + '<div class="fx-eq">' + from.toFixed(1) + ' \u2192 <b>' + fin.toFixed(1) + '</b></div>' + (X.md.n ? '<small>' + esc(noSites(X.md.n)) + '</small>' : '') + extra + '</li>'
      : Math.abs(fin - after) > 0.05 ? '<li class="fx-s" data-al="fx-model"><div class="fx-row"><span class="fx-k">Final adjustments</span><span class="fx-p">' + sgn(modelPct) + '%</span></div><div class="fx-eq">' + after.toFixed(1) + ' \u2192 <b>' + fin.toFixed(1) + '</b></div>' + extra + '</li>' : '';
    return '<h3 class="fx-h"><button type="button" class="fx-tog" data-fxtog aria-expanded="' + FX_OPEN + '"><span>How DHQ built this projection</span><i aria-hidden="true"></i></button></h3><ol class="fx">'
      + '<li class="fx-s fx-base" data-al="fx-base"><div class="fx-row"><span class="fx-k">Starting point</span><span class="fx-v">' + base.toFixed(1) + '</span></div>'
      + (X.bw ? '<small>' + esc(noSites(X.bw)) + '</small>' : '') + '<div class="fx-line">' + statLine(X.line) + '</div></li>'
      + rows
      + '<li class="fx-s" data-al="fx-all"><div class="fx-row"><span class="fx-k">All ' + (X.f || []).length + ' factors</span><span class="fx-p ' + (X.m >= 1 ? 'pu' : 'pd') + '">\u00d7' + X.m.toFixed(3) + '</span></div>'
      + '<div class="fx-eq">' + base.toFixed(1) + ' \u00d7 ' + X.m.toFixed(3) + ' = <b>' + afterF.toFixed(1) + '</b></div></li>'
      + qStep + oStep + model
      + '<li class="fx-s fx-fin" data-al="fx-fin"><div class="fx-row"><span class="fx-k">DHQ projection</span><span class="fx-v">' + fin.toFixed(1) + '</span></div>'
      + (lo != null && hi != null ? '<small>Range ' + lo.toFixed(1) + ' to ' + hi.toFixed(1) + ' (floor to ceiling)</small>' : '') + '</li>'
      + '</ol>';
  }

  function column(f, call, F, leads) {
    var X = !f.bye && W && W.formula ? W.formula[f.id] || null : null;
    var col = POS_COLOR[f.pos] || 'var(--silver)', win = call.win && call.win.id === f.id, d = '–';
    var top = f.bye ? '<span class="ss-tag">Sit</span><span class="ss-score">BYE</span>'
      : f.out ? '<span class="ss-tag">Sit</span><span class="ss-score">' + esc(f.inj) + '</span>'
      : f.dhq == null ? '<span class="ss-tag">Sit</span><span class="ss-score">–</span>'
      : '<span class="ss-tag">' + (win ? 'Start' : call.even && call.live.slice(0, 2).indexOf(f) >= 0 ? 'Even' : 'Sit') + '</span><span class="ss-score">' + n1(f.dhq) + '<small>PTS</small></span>'
        + (call.win && !win ? '<span class="ss-gap">' + (f.dhq - call.win.dhq).toFixed(1) + '</span>' : '');
    var img = '<img src="https://sleepercdn.com/content/nfl/players/' + encodeURIComponent(f.id) + '.jpg" alt="" decoding="async" onerror="this.remove()">';
    var flag = f.bye ? '<span class="ss-flag warn">On a bye this week</span>'
      : f.inj ? '<span class="ss-flag ' + (f.out ? 'bad' : 'warn') + '">' + esc(f.inj) + '</span>'
      : started(f.kick) ? '<span class="ss-flag info">Game started</span>' : '';
    var gameLine = '<div class="ss-game">' + (CUR && CUR.week ? '<span class="wk">NFL Week ' + CUR.week + '</span><span class="sep"> · </span>' : '')
      + '<span class="gm">' + (f.bye ? '<b>BYE</b>' : f.opp ? '<b>' + (f.away ? '@ ' : 'vs ') + esc(f.opp) + '</b>' + (f.kick ? '<span class="sep"> · </span><span class="kt" data-full="' + esc(kickText(f.kick)) + '" data-short="' + esc(kickText(f.kick).replace(/\s*([AP])M$/i, function (m, x) { return x.toLowerCase(); })) + '">' + esc(kickText(f.kick)) + '</span>' : '') : '<b>No game found</b>') + '</span></div>';
    var matchup = f.bye ? '<span class="v bye">BYE</span>' : f.opp ? (f.away ? '@' : 'vs ') + esc(f.opp) + (f.kick ? ' · ' + esc(kickText(f.kick)) : '') : d;
    var z = f.season, vegas = [f.imp != null ? 'Team total ' + f.imp : null, spreadText(f.spr)].filter(Boolean).join(' · ');
    var L = function (key, x) { return x == null ? 'dim' : leads[key] != null && x === leads[key] ? 'lead' : ''; };
    var rows = li('DHQ projection', f.bye ? 'BYE' : f.dhq != null ? n1(f.dhq) : d, f.bye ? 'bye' : 'dhq')
      + li('Last week', f.last != null ? n1(f.last) : f.lastBye ? 'BYE' : 'Did not play', f.last != null ? L('last', f.last) : 'dim')
      + li('Points per game', z && z.gp ? z.ppg.toFixed(1) : d, z && z.gp ? L('ppg', z.ppg) : 'dim')
      + li('Season', z && z.gp ? z.pts.toFixed(1) + ' pts · ' + z.gp + ' GP' : d, z && z.gp ? '' : 'dim')
      + li('Matchup', matchup, '')
      + '<li class="wide" data-al="vegas"><span class="k">Vegas</span><span class="v' + (vegas ? '' : ' dim') + '">' + (f.bye ? 'BYE' : vegas ? esc(vegas) : d) + '</span></li>'
      + (X ? '' : '<li class="wide"><span class="k">Defense vs ' + esc(f.pos) + '</span><span class="v' + (f.why.matchup ? '' : ' dim') + '">' + (f.bye ? 'BYE' : f.why.matchup ? esc(f.why.matchup) : d) + '</span></li>'
      + '<li class="wide"><span class="k">DHQ expects</span><span class="v' + (f.why.line ? '' : ' dim') + '">' + (f.bye ? 'BYE' : f.why.line ? esc(f.why.line) : d) + '</span></li>');
    var reads = f.bye || X ? [] : f.why.reads.slice(0, 4);
    return '<article class="ss-col' + (win ? ' win' : '') + '" style="--pc:' + col + '" aria-label="' + esc(f.name) + (win ? ', start' : '') + '">'
      + '<button class="ss-x" type="button" data-rm="' + esc(f.id) + '" aria-label="Remove ' + esc(f.name) + '">×</button>'
      + gameLine
      + '<div class="ss-top' + (f.dhq == null || f.bye || f.out ? ' none' : '') + '">' + top + '</div>'
      + '<div class="ss-head"><div class="ss-shot"><div class="ss-frame" data-card="' + esc(f.id) + '" title="Open ' + esc(f.name) + '’s player card"><span class="ini">' + esc(f.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2)) + '</span>' + img + '</div>'
      + '<div class="ss-val" title="DHQ dynasty value. For reference only: the start / sit call is this week’s projection."><span>DHQ Value</span><b>' + (f.value ? fmt(f.value) : d) + '</b></div>'
      + (win ? '<span class="ss-crown">DHQ start</span>' : '') + '</div>'
      + '<div class="ss-name" data-card="' + esc(f.id) + '" title="Open ' + esc(f.name) + '’s player card">' + esc(f.name) + '</div>'
      + '<div class="ss-sub"><b style="color:' + col + '">' + esc(f.pos) + '</b> · ' + esc(f.team) + (f.age ? ' · age ' + f.age : '') + '</div>' + flag
      + '<button type="button" class="ss-card" data-card="' + esc(f.id) + '">Player card ›</button></div>'
      + '<div class="ss-sec"><h3>This week</h3><ul class="ss-list">' + rows + '</ul>' + fxMore(formula(f, X)
      + (reads.length ? '<h3>DHQ’s read</h3><ul class="ss-list ss-reads">' + reads.map(function (x) {
          return '<li class="' + (x.p > 0 ? 'up' : 'dn') + '"><span class="ar">' + (x.p > 0 ? '▲' : '▼') + '</span><b>' + esc(x.k) + '</b><span class="pc">' + (x.p > 0 ? '+' : '') + x.p + '%</span>' + (x.d ? '<small>' + esc(noSites(x.d)) + '</small>' : '') + '</li>';
        }).join('') + '</ul>' : ''))
      + '</div></article>';
  }
  // Line the columns up: the score band, the photo block and every bullet sit
  // at the same height across the board, whatever wraps (long names on phones).
  // Keep "NFL Week N · @ OPP · Sun 8:20 PM" on one line in narrow columns (four across on an iPad):
  // shrink the text a little, then shorten the time ("Sun 8:20p"), then "Wk N". Phones use two lines.
  function fitGames() {
    var wide = window.innerWidth > 640;
    [].slice.call(ROOT.querySelectorAll('.ss-game')).forEach(function (g) {
      var kt = g.querySelector('.kt'), wk = g.querySelector('.wk');
      g.style.fontSize = ''; if (kt) kt.textContent = kt.getAttribute('data-full'); if (wk && wk.getAttribute('data-full')) wk.textContent = wk.getAttribute('data-full');
      if (!wide) return;
      var over = function () { return g.scrollWidth > g.clientWidth + 1; };
      [11.5, 11, 10.5].some(function (px) { if (!over()) return true; g.style.fontSize = px + 'px'; return false; });
      if (over() && kt) kt.textContent = kt.getAttribute('data-short');
      if (over() && wk) { wk.setAttribute('data-full', wk.textContent); wk.textContent = wk.textContent.replace(/^NFL Week/, 'Wk'); }
    });
  }
  function equalize() {
    fitGames();
    var cols = [].slice.call(ROOT.querySelectorAll('.ss-col'));
    var groups = [cols.map(function (c) { return c.querySelector('.ss-game'); }), cols.map(function (c) { return c.querySelector('.ss-top'); }), cols.map(function (c) { return c.querySelector('.ss-head'); })];
    var keys = {};
    cols.forEach(function (c) { c.querySelectorAll('[data-al]').forEach(function (el) { (keys[el.dataset.al] = keys[el.dataset.al] || []).push(el); }); });
    Object.keys(keys).forEach(function (k) { if (keys[k].length > 1) groups.push(keys[k]); });
    groups.forEach(function (g) { g.forEach(function (el) { if (el) el.style.minHeight = ''; }); });
    if (cols.length < 2) return;
    groups.forEach(function (g) {
      var h = Math.max.apply(null, g.map(function (el) { return el ? el.getBoundingClientRect().height : 0; }));
      g.forEach(function (el) { if (el) el.style.minHeight = Math.ceil(h) + 'px'; });
    });
  }
  var eqT; window.addEventListener('resize', function () { clearTimeout(eqT); eqT = setTimeout(eachMount, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(eachMount);


  // ── The drop-in (scripts/compare-module-wrapper.part, appended by build-compare-module.cjs) ──
  //
  //   DHQCompare.mount(el, {
  //     players: ['4984', '6794'],            // 2 to 4 Sleeper player ids
  //     leagueId,                              // the user's league (player card "In my league")
  //     scoringSettings: league.scoring_settings,   // rec / bonus_rec_te / idp_* pick the scoring
  //     rosterPositions: league.roster_positions,   // SUPER_FLEX or 2+ QB = superflex (DHQ Value)
  //     teams: league.total_rosters,           // league size (DHQ Value)
  //     projection: function (pid) {},         // optional: this week's DHQ projection in the league's
  //                                            //   own scoring (the app's Lineup number); wins over the
  //                                            //   lock file's preset rescoring
  //     value: function (pid) {},              // optional: the league's own DHQ value
  //     onRemove: function (pid) {},           // optional: the × on a box (default: drop it and redraw)
  //     onCard: function (pid) {},             // optional: tap on photo / name / "Player card"
  //     removable: true                        // false hides the ×
  //   })  → { update(opts), unmount() }
  //   DHQCompare.update(el, opts) · DHQCompare.unmount(el) · DHQCompare.preload() · DHQCompare.config({ locksBase, cssUrl })
  var CFG = {
    locksBase: /(^|\.)dhq-lab\.pages\.dev$/.test(location.hostname) ? 'data/locks/' : 'https://dhq-lab.pages.dev/data/locks/',
    cssUrl: null   // null: the .css next to this script; false: the page loads it itself
  };
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var ROOT = document.createElement('div');   // the mount being drawn
  var MOUNTS = [], ready = null;
  function boot() {
    if (!ready) {
      ready = loadData().then(function () { return loadCurrent(); })
        .then(function () { return CUR && CUR.week ? loadWeek(CUR.week) : { failed: true }; })
        .then(function (w) { W = w; return w; });
      ready.catch(function () { ready = null; });
    }
    return ready;
  }
  function ensureCss() {
    if (CFG.cssUrl === false || document.querySelector('link[data-dhqss]')) return;
    var href = CFG.cssUrl || SCRIPT_SRC.replace(/\.js(\?.*)?$/, '.css$1');
    if (!href) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-dhqss', '1'); document.head.appendChild(l);
  }
  // The league's settings → the page's switches (the projection is rescored like the Start/Sit page:
  // PPR / Half-PPR / Standard by points a catch, TE premium as +0.5 a catch, defenders on IDP rules).
  function settingsFrom(o) {
    var sc = o.scoringSettings || null, s = { scoring: o.preset || 'half', tep: '0', idp: '0', qb: 'sf', teams: '12' };
    if (sc) {
      var rec = +sc.rec || 0;
      s.scoring = rec >= 0.75 ? 'ppr' : rec >= 0.25 ? 'half' : 'std';
      s.tep = (+sc.bonus_rec_te || 0) > 0 ? '1' : '0';
      s.idp = Object.keys(sc).some(function (k) { return /^idp_/.test(k) && +sc[k]; }) ? '1' : '0';
    }
    var rp = o.rosterPositions || [];
    if (rp.length) s.qb = rp.indexOf('SUPER_FLEX') >= 0 || rp.filter(function (x) { return x === 'QB'; }).length > 1 ? 'sf' : '1qb';
    if (o.teams) s.teams = String(o.teams);
    if (o.tep != null) s.tep = o.tep ? '1' : '0';
    if (o.idp != null) s.idp = o.idp ? '1' : '0';
    return s;
  }
  function foot(m) {
    var lg = !!m.o.projection;
    return '<b>Where the numbers come from.</b> DHQ projection: DHQ’s engine for this week' + (lg ? ', in your league’s scoring' : ', in ' + scoringName())
      + '. Last week and season: actual results from Sleeper’s stats in ' + scoringName() + '. Vegas: the team’s implied points and point spread. DHQ Value: '
      + (m.o.value ? 'your league’s DHQ dynasty value.' : 'DHQ’s dynasty value' + (isEstimated() ? ' (estimated for this league’s format)' : '') + '.')
      + ' The START is the highest DHQ projection this week; DHQ Value is for reference only.';
  }
  function draw(m) {
    ROOT = m.el; Object.assign(S, m.s);
    m.el.classList.toggle('dhqss-fixed', m.o.removable === false);
    if (!m.ready) { m.el.innerHTML = '<div class="dhqss-msg">Loading DHQ projections…</div>'; return; }
    if (!W || W.failed || !DATA) { m.el.innerHTML = '<div class="dhqss-msg">This week’s DHQ projections could not be loaded right now. Try again in a moment.</div>'; return; }
    var ids = m.players.map(String).filter(function (pid, i, a) { return a.indexOf(pid) === i && valid(pid); }).slice(0, 4);
    var F = ids.map(function (pid) {
      var f = facts(pid), o = m.o;
      if (o.projection && !f.bye) { try { var x = o.projection(pid); if (x != null && x !== '' && !isNaN(x)) f.dhq = +x; } catch (e) { /* the lock's number stays */ } }
      if (o.value) { try { var v = o.value(pid); if (v != null && v !== '' && !isNaN(v)) f.value = Math.round(+v); } catch (e) { /* the estimate stays */ } }
      f.can = !f.bye && !f.out && f.dhq != null && f.dhq > 0;
      return f;
    });
    var n = F.length, call = decide(F);
    var leads = { last: best(F, 'last', true), ppg: best(F.map(function (f) { return { ppg: f.season && f.season.gp ? f.season.ppg : null }; }), 'ppg', true) };
    m.el.innerHTML = '<div class="ss-call" role="status" aria-live="polite" hidden></div>'
      + (n ? '<div class="ss-board c' + n + ' p' + Math.max(n, 2) + (n > 2 ? ' many' : '') + '" style="--n:' + n + '">' + F.map(function (f) { return column(f, call, F, leads); }).join('')
        + (n === 2 ? '<span class="ss-vs" aria-hidden="true">VS</span>' : '') + '</div><p class="dhqss-foot">' + foot(m) + '</p>'
        : '<div class="dhqss-msg">' + esc(m.o.emptyText || 'Pick two players to compare them side by side.') + '</div>');
    drawCall(F, call);
    equalize();
  }
  function eachMount() { MOUNTS.forEach(function (m) { if (m.ready && m.el.isConnected) { ROOT = m.el; Object.assign(S, m.s); equalize(); } }); }
  function find(el) { for (var i = 0; i < MOUNTS.length; i++) if (MOUNTS[i].el === el) return MOUNTS[i]; return null; }
  function clicks(m) {
    return function (e) {
      var rm = e.target.closest && e.target.closest('[data-rm]'), pc = e.target.closest && e.target.closest('[data-card]');
      var fx = e.target.closest && e.target.closest('[data-fxtog]');
      if (fx && m.el.contains(fx)) { e.preventDefault(); fxToggle(m.el); ROOT = m.el; Object.assign(S, m.s); equalize(); return; }
      if (rm && m.el.contains(rm)) {
        e.preventDefault(); var id = rm.getAttribute('data-rm');
        if (m.o.onRemove) m.o.onRemove(id); else { m.players = m.players.filter(function (x) { return String(x) !== id; }); draw(m); }
        return;
      }
      if (pc && m.el.contains(pc)) {
        e.preventDefault(); var pid = pc.getAttribute('data-card'), PC = window.DHQPlayerCard;
        if (m.o.onCard) m.o.onCard(pid);
        else if (PC) PC.open(pid, { leagueId: m.o.leagueId, league: !!m.o.leagueId, scoringSettings: m.o.scoringSettings || (PC.scoringSettings ? PC.scoringSettings(m.s.scoring, m.s.tep === '1' ? 0.5 : 0) : null) });
      }
    };
  }
  function mount(el, o) {
    if (!el) return null;
    o = o || {}; ensureCss();
    var m = find(el);
    if (!m) { m = { el: el, o: {}, players: [], ready: false }; MOUNTS.push(m); el.classList.add('dhqss-root'); m.click = clicks(m); el.addEventListener('click', m.click); }
    m.o = Object.assign({}, m.o, o);
    if (o.players) m.players = o.players.map(String);
    m.s = settingsFrom(m.o);
    draw(m);
    boot().then(function () { m.ready = true; if (MOUNTS.indexOf(m) >= 0) draw(m); }, function () { m.ready = true; if (MOUNTS.indexOf(m) >= 0) draw(m); });
    return { update: function (x) { return mount(el, x); }, unmount: function () { unmount(el); } };
  }
  function unmount(el) {
    var m = find(el); if (!m) return;
    el.removeEventListener('click', m.click); el.classList.remove('dhqss-root', 'dhqss-fixed'); el.innerHTML = '';
    MOUNTS.splice(MOUNTS.indexOf(m), 1);
  }
  window.DHQCompare = {
    version: '1.0.0',
    config: function (o) { Object.assign(CFG, o || {}); },
    mount: mount, update: mount, unmount: unmount, preload: boot
  };

})();
