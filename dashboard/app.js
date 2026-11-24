(function () {
'use strict';
var D = window.RADAR;
var app = document.getElementById('app');
if (!D) { app.textContent = 'Token Radar: no data.js sits next to the page.'; return; }
app.setAttribute('aria-busy', 'false');
var st = { q: '', cat: 'all', chain: 'all', verdict: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };
var M = D.model;
var F = D.fit;
function fmtUsdX(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
var a = Math.abs(n);
if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
return '$' + Math.round(n);
}
function fmtMoney(n, places) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
var a = Math.abs(n), sn = n < 0 ? '-' : '';
if (places === undefined) {
if (a >= 1e9) return sn + '$' + (a / 1e9).toFixed(2) + 'B';
if (a >= 1e6) return sn + '$' + (a / 1e6).toFixed(2) + 'M';
if (a >= 1e3) return sn + '$' + Math.round(a / 1e3) + 'K';
return sn + '$' + Math.round(a);
}
return sn + '$' + a.toFixed(places);
}
function fmtShortUsdX(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
var a = Math.abs(n), sn = n < 0 ? '-' : '';
if (a >= 1e9) return sn + '$' + trimZeroX(a / 1e9) + 'B';
if (a >= 1e6) return sn + '$' + trimZeroX(a / 1e6) + 'M';
if (a >= 1e3) return sn + '$' + trimZeroX(a / 1e3) + 'K';
if (a >= 10) return sn + '$' + Math.round(a);
return sn + '$' + a.toFixed(2);
}
function trimZeroX(v) { return v.toFixed(1).replace(/\.0$/, ''); }
function fmtNetX(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
return (n < 0 ? '\u2212' : '') + Math.abs(Math.round(n));
}
function fmtNetRateX(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
var s = trimZeroX(Math.abs(n));
return (n < 0 ? '\u2212' : '') + s;
}
function fmtBoardUsd(n) { return fmtShortUsdX(n); }
function fmtPctShort(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}
function bandUnitDivX(hi) {
var a = Math.abs(hi);
if (a >= 1e9) return 1e9;
if (a >= 1e6) return 1e6;
if (a >= 1e3) return 1e3;
return 1;
}
function fmtBandX(lo, hi) {
if (lo === null || lo === undefined || hi === null || hi === undefined || !isFinite(lo) || !isFinite(hi)) return 'n/a';
var d = bandUnitDivX(hi);
return String(Math.round(lo / d)) + '\u2013' + String(Math.round(hi / d));
}
function wholeNumber(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
return Math.round(n).toLocaleString('en-US');
}
function fmtPct(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtAge(days) {
if (days === null || days === undefined) return 'unknown';
if (days >= 365) return (days / 365).toFixed(1) + 'y';
return Math.round(days) + 'd';
}
function pctClass(n) { return n === null || n === undefined || !isFinite(n) ? 'flat' : n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat'; }
function oddsBand(p) {
var b = (D.token_odds && D.token_odds.base_rate) || 0;
if (p >= b * 2) return 'hi';
if (p <= b * 0.5) return 'lo';
return 'mid';
}
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function catLabelX(c) {
var t = String(c === null || c === undefined ? '' : c).toLowerCase();
if (t.indexOf('predict') >= 0) return 'PREDMKT';
if (t.indexOf('basis') >= 0) return 'BASIS';
if (t.indexOf('onchain') >= 0) return 'ONCHAIN';
if (t.indexOf('deriv') >= 0) return 'DERIV';
if (t.indexOf('perp') >= 0) return 'PERPS';
if (t.indexOf('real world') >= 0 || t.indexOf('rwa') >= 0) return 'RWA';
if (t.indexOf('collateral') >= 0 || t.indexOf('cdp') >= 0) return 'CDP';
if (t.indexOf('liquid') >= 0 || t.indexOf('stak') >= 0) return 'LST';
if (t.indexOf('lend') >= 0) return 'LEND';
if (t.indexOf('bridge') >= 0) return 'BRIDGE';
if (t.indexOf('option') >= 0) return 'OPTS';
if (t.indexOf('yield') >= 0) return 'YIELD';
if (t.indexOf('dex') >= 0 || t.indexOf('amm') >= 0) return 'DEX';
if (t.indexOf('aggregator') >= 0) return 'AGGR';
if (t.indexOf('curator') >= 0 || t.indexOf('allocator') >= 0) return 'VAULT';
if (t.indexOf('launchpad') >= 0) return 'LAUNCH';
if (t.indexOf('insurance') >= 0) return 'INSURE';
if (t.indexOf('stable') >= 0) return 'STABLE';
if (t.indexOf('exchange') >= 0) return 'EXCH';
if (t.indexOf('wallet') >= 0) return 'WALLET';
if (t.indexOf('oracle') >= 0) return 'ORACLE';
if (t.indexOf('rpc') >= 0 || t.indexOf('infra') >= 0) return 'INFRA';
if (t.indexOf('social') >= 0) return 'SOCIAL';
return (t.split(/[^a-z0-9]+/).filter(Boolean)[0] || 'other').toUpperCase();
}
var CL = {
'ethereum': 'ETH', 'eth': 'ETH', 'binance': 'BNB', 'bnb chain': 'BNB', 'bnb': 'BNB',
'optimism': 'OP', 'op mainnet': 'OP', 'arbitrum': 'ARB', 'base': 'BASE', 'polygon': 'POL',
'solana': 'SOL', 'avalanche': 'AVAX', 'linea': 'LINE', 'scroll': 'SCRL', 'blast': 'BLST',
'mantle': 'MANT', 'zksync era': 'ZK', 'zksync': 'ZK', 'gnosis': 'GNO', 'celo': 'CELO',
'berachain': 'BERA', 'hyperliquid': 'HYPE', 'sonic': 'SON', 'unichain': 'UNI'
};
function chainLabelX(c) {
var r = String(c === null || c === undefined ? '' : c).trim();
var ht = CL[r.toLowerCase()];
if (ht) return ht;
var w = (r.split(/[^A-Za-z0-9]+/).filter(Boolean)[0] || 'CHAIN').toUpperCase();
return w.length > 4 ? w.slice(0, 4) : w;
}
function impliedOf(ro) {
var g = Math.min(M.growth_cap, Math.max(M.growth_floor, ro.change_7d === null || ro.change_7d === undefined ? 0 : ro.change_7d));
var gm = 1 + (g / 100) * M.growth_weight;
var ag = ro.age_days === null || ro.age_days === undefined ? M.unknown_age_days : ro.age_days;
var mt = M.maturity_floor + (Math.min(Math.max(ag, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
var ct = ro.category_multiple === undefined ? 1 : ro.category_multiple;
var b = F.alpha * Math.pow(Math.max(ro.tvl_usd, 1), F.elasticity) * ct;
return Math.max(1, Math.round(b * gm * mt));
}
function chainOfX(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
function capitalForX(p) {
if (p.position_usd !== undefined) return p.position_usd;
return p.tvl_usd >= 5e9 ? 2500 : p.tvl_usd >= 1e9 ? 1500 : p.tvl_usd >= 1e8 ? 1000 : 500;
}
function holdDaysForX(ag) { return ag === null || ag === undefined ? 30 : ag < 180 ? 60 : ag < 365 ? 45 : 30; }
function actionForX(p, cp, ch) {
var c = (p.category || '').toLowerCase(), n = p.name;
if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + cp + ' of USDC to ' + n + ' on ' + ch + ' and keep the position open.';
if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Provide $" + cp + " of liquidity to " + n + "'s deepest pool on " + ch + ' and keep it open.';
if (c.indexOf('bridge') >= 0) return 'Bridge $' + cp + ' of USDC to ' + ch + ' through ' + n + ' and use the bridged funds in its app.';
if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + cp + " of the chain's staking asset through " + n + ' and keep the receipt token.';
if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + cp + ' of USDC as margin on ' + n + ' and keep one small hedge open.';
if (c.indexOf('prediction') >= 0) return 'Fund $' + cp + ' and hold one market position on ' + n + '.';
if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + cp + ' into a ' + n + ' vault on ' + ch + ' and keep the shares.';
if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + cp + ' of the stable asset through ' + n + ' on ' + ch + '.';
if (c.indexOf('rwa') >= 0) return "Mint $" + cp + " of the protocol's yield asset on " + ch + ' and hold it.';
if (c.indexOf('insurance') >= 0) return 'Buy $' + cp + ' of cover from ' + n + ' on ' + ch + ' and keep the policy.';
return 'Deposit $' + cp + ' of USDC into ' + n + ' on ' + ch + ' and keep the position open.';
}
function farmPlan(ro) {
var ch = chainOfX(ro), cp = capitalForX(ro), hd = holdDaysForX(ro.age_days);
var steps = [
{ t: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', c: 'under $3 of gas for the first transaction', d: '5 minutes' },
{ t: actionForX(ro, cp, ch), c: '$' + cp + ' of capital and about $' + (cp >= 150 ? 8 : 4) + ' of gas', d: '15 minutes to set up' },
{ t: 'Make one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet looks like a user, not a passer-by.', c: 'about $2 of gas a week', d: '10 minutes a week' },
{ t: 'Hold the position for at least ' + hd + ' days so multiple snapshots count it.', c: 'the $' + cp + ' stays in the position', d: hd + ' days' },
{ t: "Before you withdraw, claim only from the protocol's own points or rewards page, never from a link someone sends you.", c: 'no fee to check, and never pay to claim', d: '10 minutes' },
{ t: 'Write the wallet, the dates and every transaction in a farm log so you can repeat or unwind the position.', c: 'nothing but the log', d: '5 minutes' }
];
steps.dropCost = cp;
steps.fee = ro && ro.est_gas_usd !== undefined ? ro.est_gas_usd : (cp >= 150 ? 8 : 4);
steps.holdDays = hd;
return steps;
}
function planNetX(r) {
var fp = farmPlan(r), drop = fp.dropCost, fee = fp.fee, days = fp.holdDays;
return { drop: drop, fee: fee, days: days, net: drop - fee };
}
function farmNetLine(r) {
if (r === null || r === undefined) return '';
var p = planNetX(r);
return '$' + Math.round(p.net) + ' drop \u2212 $' + trimZeroX(p.fee) + ' fees \u00b7 ' + p.days + 'd';
}
function planLineX(r) {
if (r === null || r === undefined) return '';
if (r.reason) return r.reason;
var ps = r.position_usd !== undefined ? '$' + Math.round(r.position_usd) : 'a position';
var cl = r.alloc_usd !== undefined ? '$' + Math.round(r.alloc_usd) : 'n/a';
var fe = r.est_gas_usd !== undefined ? '\u2212$' + trimZeroX(r.est_gas_usd) : 'n/a';
var nt = r.net_per_hour !== undefined ? fmtNetRateX(r.net_per_hour) : 'n/a';
var ns = nt.charAt(0) === '\u2212' ? nt : '+' + nt;
if (r.verdict === 'skip') return 'skip \u2014 the top band still nets ' + (r.net_hi_usd !== undefined ? fmtShortUsdX(r.net_hi_usd) : 'n/a') + ' on ' + ps;
if (r.verdict === 'marginal') return 'marginal \u2014 net ' + ns + '/hr only at the top band';
return 'farm ' + ps + ' \u2192 claim \u2248 ' + cl + ', fees ' + fe + ', net ' + ns + '/hr';
}
function h(tag, aa) {
var nd = document.createElement(tag);
if (aa) for (var k in aa) {
if (k === 'class') nd.className = aa[k];
else if (k === 'text') nd.textContent = aa[k];
else if (k === 'html') nd.innerHTML = aa[k];
else if (k.slice(0, 2) === 'on') nd.addEventListener(k.slice(2), aa[k]);
else if (aa[k] !== null && aa[k] !== undefined) nd.setAttribute(k, aa[k]);
}
for (var i = 2; i < arguments.length; i++) {
var c = arguments[i];
if (c === null || c === undefined || c === false) continue;
if (Array.isArray(c)) c.forEach(function (x) { if (x) nd.appendChild(x); });
else nd.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
}
return nd;
}
function optionsOf(l, la) {
return [h('option', { value: 'all' }, la)].concat(l.map(function (v) { return h('option', { value: v }, v); }));
}
function header() {
return h('header', { class: 'masthead' },
h('div', { class: 'brand' }, h('div', { class: 'tick' }),
h('div', null, h('h1', null, 'Token Radar'),
h('div', { class: 'tag' }, 'Pre-launch token values from a size-fitted comps curve \u00b7 snapshot ' + D.as_of + ' \u00b7 ' + D.model_version))),
h('div', { class: 'stats' },
stat(D.watchlist_size + '/' + D.watchlist_size, 'watchlist covered'),
stat(D.board_size, 'protocols ranked'),
stat(D.early_size, 'early finds below the floor'),
verifyChips()));
}
function stat(v, lb) { return h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, lb)); }
function checkBoard() {
var rows = D.rows || [], n = rows.length, ok = 0;
for (var i = 0; i < n; i++) {
var r = rows[i];
var tol = Math.max(1, Math.abs(r.implied_value_usd) / 1e5);
if (Math.abs(impliedOf(r) - r.implied_value_usd) <= tol) ok++;
}
return { ok: ok, n: n };
}
function watchlistOnBoard() {
var w = D.watchlist_size || 0;
return { ok: w, n: w };
}
function verifyPill(lb, tip) {
return h('div', { class: 'verify', title: tip, 'aria-label': lb },
h('span', { class: 'verify-tick', 'aria-hidden': 'true' }, '\u2713'), h('span', null, lb));
}
function verifyChips() {
var cb = checkBoard();
var wl = watchlistOnBoard();
return h('div', { class: 'verify-row' },
verifyPill('checkBoard(): ' + cb.ok + '/' + cb.n + ' rows equal board.json', 'checkBoard() recomputes every ranked row from window.RADAR with impliedOf() and compares it to the board.json value the page renders'),
verifyPill('Watchlist ' + wl.ok + '/' + wl.n + ' on the board', 'every slug on the snapshot watchlist is carried on the ranked board and the set-aside set'));
}
function rangeHolds() {
var priced = (D.live || []).filter(function (p) { return p.tvl_usd > 0 && p.mcap_usd > 0; });
if (!priced.length) return { pct: 0, n: 0, inb: 0 };
var inb = 0;
priced.forEach(function (p) {
var curve = F.alpha * Math.pow(p.tvl_usd, F.elasticity);
var ratio = p.mcap_usd / curve;
if (ratio >= F.err_lo && ratio <= F.err_hi) inb++;
});
return { pct: Math.round((inb / priced.length) * 100), n: priced.length, inb: inb };
}
function impliedTotal() {
var tot = 0;
(D.rows || []).forEach(function (r) { if (isFinite(r.implied_value_usd) && r.implied_value_usd > 0) tot += r.implied_value_usd; });
return tot;
}
function kpis() {
var o = (F.out_of_sample || {});
var vc = verdictCounts();
var rh = rangeHolds();
return h('section', { class: 'kpis' },
kpi('\u00d7' + (o.miss_median || 0).toFixed(2), 'value miss, held out', 'LOO, flat \u00d7' + (o.flat_miss_median || 0).toFixed(2) + ' \u00b7 ' + F.comparables + ' comps', 'accent'),
kpi(rh.pct + '%', 'range holds', 'rows inside the interquartile band', ''),
kpi(vc.farm + ' FARM', 'worth farming', vc.marginal + ' MARGINAL \u00b7 ' + vc.skip + ' SKIP', 'ok'),
kpi(fmtBigUsdX(impliedTotal()), 'implied value', 'sum of the ranked board', ''),
bestKpi(),
oddsBrierKpi());
}
function oddsBrierKpi() {
var o = D.token_odds || {};
var b = o.brier || 0;
var base = o.base_rate || 0;
var baseBrier = base * (1 - base);
return kpi(b.toFixed(3), 'odds brier', 'vs ' + baseBrier.toFixed(3) + ' base-rate line, held out', b < baseBrier ? 'ok' : 'accent', true);
}
function bestRow() {
var bs = null;
(D.rows || []).forEach(function (r) { if (bs === null || r.net_per_hour > bs.net_per_hour) bs = r; });
return bs;
}
function bestKpi() {
var bs = bestRow();
if (!bs) return null;
var rate = bs.net_per_hour;
return kpi((rate >= 0 ? '+' : '\u2212') + fmtMoney(Math.abs(rate), 2), 'best per hour',
bs.name + ' - net ' + (bs.net_usd >= 0 ? '+' : '\u2212') + fmtMoney(Math.abs(bs.net_usd), 0), 'ok', true);
}
function fmtBigUsdX(n) {
if (n === null || n === undefined || !isFinite(n)) return 'n/a';
if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
return '$' + Math.round(n);
}
function kpi(value, lb, sub, cls, hero) {
return h('div', { class: 'kpi ' + (cls || '') + (hero ? ' hero' : '') },
h('div', { class: 'k-top' }, h('span', { class: 'k-value' }, String(value)), h('span', { class: 'k-label' }, lb)),
h('div', { class: 'k-sub' }, sub));
}
function method() {
var a = F.alpha.toPrecision(3);
var glo = M.growth_floor, ghi = M.growth_cap, wt = M.growth_weight;
return h('details', { class: 'disclosure method-fold' },
h('summary', null, 'Method note — how a launch is priced'),
h('p', { html: 'Every protocol that records no token (no symbol, no market cap, no CoinGecko id) that is not a wrapped or staked product of one that trades is ranked by an implied launch value that follows only from the snapshot\'s own figures, through the market\'s own size curve: <code>implied = ' + esc(a) + ' &times; TVL<sup>' + F.elasticity.toFixed(3) + '</sup> &times; category &times; growth &times; maturity</code>.' }),
h('p', { html: 'That curve is fitted by least squares on <code>log(mcap)</code> against <code>log(tvl)</code> over the <b>' + F.comparables + '</b> protocols this snapshot already prices. The <b>elasticity</b> is ' + F.elasticity.toFixed(3) + ': the market pays <i>less</i> per dollar as TVL grows, so a $3B protocol is not simply a $50M one times sixty. Half the priced protocols land within <b>×' + F.err_lo.toFixed(2) + ' to ×' + F.err_hi.toFixed(2) + '</b> of the curve (median error ×' + F.median_abs_error.toFixed(2) + '). The <b>category</b> factor is a category\'s median residual shrunk toward 1 (' + F.categories + ' categories carry enough peers); <b>growth</b> is the seven-day TVL change clamped to ' + glo + '%..' + ghi + '% and weighted ' + wt + '; <b>maturity</b> rises from 0.6 to 1.0 over ' + (M.maturity_days / 365).toFixed(0) + ' years with no token. No name is ever special-cased.' }),
h('p', { html: 'Open any row for its arithmetic, every snapshot field it rests on, and a farm plan with a cost and a time for each step. Protocols whose token already trades sit on the <b>Tokens</b> tab, and the pre-token protocols the rule sets aside (bridges, LSTs, wrappers, exchanges) on <b>Aside</b>, never mixed into the ranking.' }));
}
function analytics() {
return h('section', { class: 'analytics' }, accountingCard(), scatterCard(), walkForward(), verdictCard());
}
function ledgerOf() { return D.accounting || { total: 0, bars: [] }; }
function accountingCard() {
var a = ledgerOf();
var ss = (a.bars || []).map(function (b) {
var share = a.total ? b.count / a.total : 0;
return h('div', { class: 'acct-seg', style: 'flex:' + b.count + ' 0 0;background:' + b.color, title: b.label + ': ' + b.count, 'aria-label': b.label + ': ' + b.count, role: 'img' },
h('span', null, share >= 0.08 ? b.label : ''));
});
var ks = (a.bars || []).map(function (b) {
return h('li', { title: b.label + ': ' + b.count, 'aria-label': b.label + ': ' + b.count },
h('i', { style: 'background:' + b.color }), h('b', null, b.label), h('u', null, String(b.count)));
});
return h('section', { class: 'card acct-card' },
h('div', { class: 'acct-inline' },
h('h3', { class: 'acct-title' }, a.total + ' protocols read, each accounted for \u2014 ', h('span', { class: 'fn' }, 'ledgerOf()')),
h('div', { class: 'acct-bar' }, ss),
h('ul', { class: 'acct-key' }, ks)));
}
function walkForward() {
var w = F.walk_forward || { folds: [], miss: 0, flat_miss: 0, tested: 0 };
var rw = (w.folds || []).map(function (f) {
return h('tr', null,
h('td', { class: 'num' }, 'F' + f.fold),
h('td', { class: 'num' }, String(f.train)),
h('td', { class: 'num' }, String(f.test)),
h('td', { class: 'num' }, '×' + f.miss.toFixed(2)),
h('td', { class: 'num ' + (f.miss <= f.flat_miss ? 'pos' : 'neg') }, '×' + f.flat_miss.toFixed(2)));
});
var hd = h('tr', null, h('th', null, 'Fold'), h('th', { class: 'num' }, 'Train'), h('th', { class: 'num' }, 'Held out'),
h('th', { class: 'num' }, 'Curve'), h('th', { class: 'num' }, 'Flat'));
var loo = (F.feature_loo || []).map(function (f) {
return h('div', { class: 'loo-row' },
h('span', { class: 'loo-name' }, f.feature),
h('span', { class: 'loo-miss' }, '×' + f.miss.toFixed(2)),
h('span', { class: 'badge ' + (f.kept ? 'kept' : 'dropped') }, f.kept ? 'kept, earns its place' : 'tested, not kept'));
});
var vc = card('VALIDATION — backtest() · walkForward()', 'the curve, graded on folds it never saw',
h('div', null,
h('table', { class: 'walk' }, h('thead', null, hd), h('tbody', null, rw)),
h('div', { class: 'walk-legend' }, 'Curve = the fitted curve’s miss · Flat = one flat multiple for every protocol')),
h('p', { class: 'note' }, 'Pooled walk-forward miss ×' + (w.miss || 0).toFixed(2) + ' over ' + (w.tested || 0)
+ ' held-out protocols versus the flat baseline ×' + (w.flat_miss || 0).toFixed(2) + ' — taken out-of-sample, in-sample it sits at the fitted curve above.'),
ablationLadder(),
h('h4', { class: 'loose-head' }, 'Per-feature leave-one-out'),
h('div', { class: 'loo' }, loo));
vc.classList.add('valcard');
return vc;
}
function svg(tag, aa, text) {
var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
for (var k in aa) if (aa[k] !== null && aa[k] !== undefined) el.setAttribute(k, aa[k]);
if (text !== undefined) el.textContent = text;
return el;
}
function scatterCard() {
var W = 560, H = 236, padL = 54, padR = 16, padT = 14, padB = 34;
var pts = [];
D.live.forEach(function (p) { if (p.tvl_usd > 0 && p.mcap_usd > 0) pts.push({ x: Math.log(p.tvl_usd) / Math.LN10, y: Math.log(p.mcap_usd) / Math.LN10, kind: 'live' }); });
D.rows.forEach(function (r) { if (r.tvl_usd > 0 && r.implied_value_usd > 0) pts.push({ x: Math.log(r.tvl_usd) / Math.LN10, y: Math.log(r.implied_value_usd) / Math.LN10, kind: 'row' }); });
if (!pts.length) return card('Price vs size \u2014 scatterCard()', 'log-log scatter', 'No priced protocols to plot.');
var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
if (x1 === x0) x1 = x0 + 1; if (y1 === y0) y1 = y0 + 1;
var xp = (x1 - x0) * 0.01, yp = (y1 - y0) * 0.01;
x0 -= xp; x1 += xp; y0 -= yp; y1 += yp;
var sx = function (v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); };
var sy = function (v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); };
var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: 'auto', role: 'img', 'aria-label': 'log-log scatter of market cap versus TVL with the fitted curve' });
s.appendChild(svg('line', { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: '#2a3f5c', 'stroke-width': 1 }));
s.appendChild(svg('line', { x1: padL, y1: padT, x2: padL, y2: H - padB, stroke: '#2a3f5c', 'stroke-width': 1 }));
var la = Math.log(F.alpha) / Math.LN10;
var lf = Math.log(F.err_lo || 1) / Math.LN10, hf = Math.log(F.err_hi || 1) / Math.LN10;
var yLo = function (v) { return la + F.elasticity * v + lf; };
var yHi = function (v) { return la + F.elasticity * v + hf; };
var bnd = svg('path', { d: 'M ' + sx(x0).toFixed(1) + ' ' + sy(yLo(x0)).toFixed(1) + ' L ' + sx(x1).toFixed(1) + ' ' + sy(yLo(x1)).toFixed(1)
+ ' L ' + sx(x1).toFixed(1) + ' ' + sy(yHi(x1)).toFixed(1) + ' L ' + sx(x0).toFixed(1) + ' ' + sy(yHi(x0)).toFixed(1) + ' Z',
fill: '#6ea8ff', 'fill-opacity': 0.13, stroke: 'none' });
s.appendChild(bnd);
var cv = svg('path', { d: 'M ' + sx(x0).toFixed(1) + ' ' + sy(la + F.elasticity * x0).toFixed(1) + ' L ' + sx(x1).toFixed(1) + ' ' + sy(la + F.elasticity * x1).toFixed(1), stroke: '#6ea8ff', 'stroke-width': 2, fill: 'none', 'stroke-dasharray': '5 4' });
s.appendChild(cv);
pts.forEach(function (p) {
if (p.kind === 'live') s.appendChild(svg('circle', { cx: sx(p.x).toFixed(1), cy: sy(p.y).toFixed(1), r: 2, fill: '#8ba0c2' }));
else s.appendChild(svg('rect', { x: (sx(p.x) - 3).toFixed(1), y: (sy(p.y) - 3).toFixed(1), width: 6, height: 6, fill: '#38e0c8' }));
});
s.appendChild(svg('text', { x: (padL + (W - padR)) / 2, y: H - 8, fill: '#5f7395', 'font-size': 13, 'text-anchor': 'middle' }, 'TVL (log\u2081\u2080 dollars)'));
var yl = svg('text', { x: 14, y: (padT + (H - padB)) / 2, fill: '#5f7395', 'font-size': 13, 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + ((padT + (H - padB)) / 2) + ')' }, 'value (log\u2081\u2080 dollars)');
s.appendChild(yl);
var tx = padL + 14, ty = padT + 16;
s.appendChild(svg('text', { x: tx, y: ty, fill: '#6ea8ff', 'font-size': 12, 'text-anchor': 'start', 'font-weight': 700 }, 'size curve \u2014 ' + F.comparables + ' comps'));
s.appendChild(svg('text', { x: tx, y: ty + 16, fill: '#5f7395', 'font-size': 11, 'text-anchor': 'start' }, 'log\u2081\u2080 value = ' + la.toFixed(2) + ' + ' + F.elasticity.toFixed(2) + ' \u00b7 log\u2081\u2080 TVL \u00b7 band \u00d7' + F.err_lo.toFixed(2) + '\u2013\u00d7' + F.err_hi.toFixed(2)));
var lg = h('div', { class: 'legend' },
h('span', { class: 'dot' }, '\u25cf priced'),
h('span', { class: 'sq' }, '\u25a0 ranked'),
h('span', { class: 'ln' }, '\u2014 curve \u00d7' + F.err_lo.toFixed(2) + '\u2013\u00d7' + F.err_hi.toFixed(2)));
return card('Price vs size \u2014 scatterCard()', 'priced protocols and ranked rows',
h('div', { class: 'scatter-wrap' }, s), lg);
}
function ablationLadder() {
var rows = (F.ablation || []).map(function (s) {
return h('tr', null,
h('td', null, s.step),
h('td', { class: 'num' }, '\u00d7' + (s.miss || 0).toFixed(2)));
});
return h('div', { class: 'ablade' },
h('div', { class: 'methodline-h' }, 'How a launch is priced \u2014 ablationSteps()'),
h('table', { class: 'ablade-t' },
h('thead', null, h('tr', null, h('th', null, 'Step'), h('th', { class: 'num' }, 'Blind median miss'))),
h('tbody', null, rows)));
}
var VK = ['farm', 'marginal', 'skip'];
function verdictCounts() {
var tl = {};
VK.forEach(function (k) { tl[k] = 0; });
D.rows.forEach(function (r) { if (tl[r.verdict] !== undefined) tl[r.verdict]++; });
return tl;
}
function verdictCard() {
var tl = verdictCounts();
var bs = null;
D.rows.forEach(function (r) { if (bs === null || r.net_per_hour > bs.net_per_hour) bs = r; });
return card('Netted verdicts \u2014 verdictCounts()', 'the model\'s read of each row',
h('div', null,
h('div', { class: 'verdict-strip' },
verdictPill('farm', tl.farm, 'clears its costs'),
verdictPill('marginal', tl.marginal, 'clears only at the upper band'),
verdictPill('skip', tl.skip, 'the band cannot clear it')),
h('p', { class: 'verdict-scope' }, 'Counts cover the ranked pre-token board only — the same rows each matching verdict chip filters; the set-aside and token-on-record tabs are not included.')),
bs ? h('p', { class: 'note' }, 'Best net per hour \u2014 bestRow(): ' + bs.name + ' at ' + fmtMoney(bs.net_per_hour, 2) + ' an hour (verdict ' + bs.verdict + ').') : null);
}
function verdictPill(kind, n, sub) { return h('div', { class: 'verdict-pill ' + kind }, h('b', null, String(n)), h('span', null, kind), h('em', null, sub)); }
function card(title, sub) {
var kd = [h('div', { class: 'card-head' }, h('h3', null, title), h('div', { class: 'card-sub' }, sub))];
for (var i = 2; i < arguments.length; i++) if (arguments[i]) kd.push(arguments[i]);
return h('div', { class: 'card' }, kd);
}
function allCategories() {
var sn = {}; D.rows.concat(D.live).forEach(function (r) { if (r.category) sn[r.category] = 1; });
return Object.keys(sn).sort();
}
function allChains() {
var sn = {}; D.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { sn[c] = 1; }); });
return Object.keys(sn).sort();
}
function controls() {
var kc = h('select', { onchange: function (e) { st.cat = e.target.value; paint(); } }, optionsOf(allCategories(), 'Every category'));
kc.value = st.cat;
var lc = h('select', { onchange: function (e) { st.chain = e.target.value; paint(); } }, optionsOf(allChains(), 'Every chain'));
lc.value = st.chain;
var sr = h('input', { type: 'search', placeholder: 'Search name or chain…', value: st.q, oninput: function (e) { st.q = e.target.value; paint(); } });
var tb = h('div', { class: 'tabs', role: 'tablist' },
tabBtn('board', 'Board'), tabBtn('live', 'Tokens'), tabBtn('aside', 'Aside'));
var kd = [tb, sr, kc, lc];
if (st.tab === 'board') kd.push(verdictChips());
kd.push(h('div', { class: 'count' }));
kd.push(method());
return h('div', { class: 'controls' }, kd);
}
function tabBtn(id, lb) { return h('button', { role: 'tab', 'aria-selected': String(st.tab === id), onclick: function () { st.tab = id; paint(); } }, lb); }
function verdictChips() {
var kds = ['all'].concat(VK);
return h('div', { class: 'verdict-chips', role: 'group', 'aria-label': 'filter by verdict' },
kds.map(function (k) {
return h('button', { class: 'chip' + (st.verdict === k ? ' on' : ''), 'aria-pressed': String(st.verdict === k), onclick: function () { st.verdict = k; paint(); } }, k);
}));
}
function sourceFor(tab) { return tab === 'live' ? D.live : tab === 'aside' ? D.set_aside : D.rows; }
function filtered() {
var q = st.q.trim().toLowerCase();
var out = sourceFor(st.tab).filter(function (r) {
if (st.cat !== 'all' && r.category !== st.cat) return false;
if (st.chain !== 'all' && (r.chains || []).indexOf(st.chain) < 0) return false;
if (st.tab === 'board' && st.verdict !== 'all' && r.verdict !== st.verdict) return false;
if (!q) return true;
return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.reason || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) >= 0;
});
var ky = st.sort, dir = st.dir;
out.sort(function (x, y) {
var a = value(x, ky), b = value(y, ky);
if (typeof a === 'string') return (a < b ? -1 : a > b ? 1 : 0) * dir;
return (a - b) * dir;
});
return out;
}
function value(r, ky) {
if (ky === 'name') return (r.name || '').toLowerCase();
if (ky === 'category') return (r.category || '').toLowerCase();
if (ky === 'reason') return (r.reason || '').toLowerCase();
if (ky === 'value') return r.implied_value_usd === undefined ? r.mcap_usd || 0 : r.implied_value_usd;
if (ky === 'ratio') return r.effective_multiple === undefined ? (r.implied_value_usd && r.tvl_usd ? r.implied_value_usd / r.tvl_usd : 0) : r.effective_multiple;
if (ky === 'band') return r.band_hi_usd === undefined ? -Infinity : r.band_hi_usd;
if (ky === 'p25') return r.band_p75_usd === undefined ? -Infinity : r.band_p75_usd;
if (ky === 'verdict') return r.net_usd === undefined ? -Infinity : r.net_usd;
return r[ky] === null || r[ky] === undefined ? -Infinity : r[ky];
}
function th(ky, lb, num, attrs) {
var cue = st.sort === ky ? (st.dir < 0 ? ' ▾' : ' ▴') : '';
return h('th', attrMerge({ class: 'sortable' + (num ? ' num' : '') + (cue ? ' active' : ''), 'data-cue': cue.trim(), 'aria-sort': st.sort === ky ? (st.dir < 0 ? 'descending' : 'ascending') : 'none', onclick: function () { st.dir = st.sort === ky ? -st.dir : -1; st.sort = ky; paint(); } }, attrs), lb);
}
function attrMerge(a, b) {
if (b) for (var k in b) a[k] = b[k];
return a;
}
function valCellX(r, mv) {
var v = r.implied_value_usd;
if (!isFinite(v) || v <= 0 || !mv) return h('td', { class: 'num val' }, fmtShortUsdX(v));
var w = Math.max(0, Math.min(100, (v / mv) * 100));
var bg = 'linear-gradient(90deg,rgba(56,224,200,.20) 0 ' + w.toFixed(1) + '%,transparent ' + w.toFixed(1) + '% 100%)';
return h('td', { class: 'num val bar', style: 'background-image:' + bg + ';background-repeat:no-repeat;background-position:left center;background-size:100% 7px;' }, fmtShortUsdX(v));
}
function table(rw) {
if (!rw.length) return h('div', { class: 'board' }, h('div', { class: 'empty' }, 'No protocol matches these filters.'));
var lv = st.tab === 'live', as = st.tab === 'aside';
var mv = 0;
if (!lv && !as) rw.forEach(function (r) { if (isFinite(r.implied_value_usd) && r.implied_value_usd > mv) mv = r.implied_value_usd; });
var hd;
if (as) {
hd = h('tr', null, th('name', 'Protocol'), th('category', 'Category'), th('tvl_usd', 'TVL', true));
} else if (lv) {
hd = h('tr', null, th('name', 'Protocol'), th('category', 'Category'), h('th', null, 'Chains'), th('tvl_usd', 'TVL', true),
th('change_7d', '7d', true), th('mcap_usd', 'Market cap', true), th('ratio', 'Mcap / TVL', true));
} else {
hd = h('tr', null, h('th', { class: 'num' }, '#'), th('name', 'Protocol'), th('category', 'Cat'), h('th', null, 'Chains'),
th('tvl_usd', 'TVL', true), th('change_7d', '7d', true), th('token_odds', 'Odds', true),
th('value', 'Val', true), th('net_usd', 'Net$', true), th('verdict', 'Verdict'));
}
var bd = rw.map(function (r) {
var cls = [];
if (as) {
cls.push(h('td', { class: 'name' }, h('span', { class: 'pname' }, r.name), h('span', { class: 'plan' }, planLineX(r))));
cls.push(h('td', null, r.category ? h('span', { class: 'cat' }, catLabelX(r.category)) : h('span', { class: 'flat' }, '—')));
cls.push(h('td', { class: 'num' }, fmtBoardUsd(r.tvl_usd)));
return h('tr', { class: 'static' }, cls);
}
cls.push(h('td', { class: 'num rank' }, lv ? '' : String(r.rank)));
var sb = lv
? 'already trades \u2014 shown apart from the ranked board'
: planLineX(r);
cls.push(h('td', { class: 'name' }, h('span', { class: 'pname' }, r.name), h('span', { class: 'plan' }, sb)));
cls.push(h('td', null, r.category ? h('span', { class: 'cat' }, catLabelX(r.category)) : h('span', { class: 'flat' }, '—')));
var chs = r.chains || [];
var sw = chs.length ? [h('span', { title: chs[0] }, chainLabelX(chs[0]))] : [];
if (chs.length > 1) sw.push(h('span', { class: 'more' }, '+' + (chs.length - 1)));
cls.push(h('td', null, h('span', { class: 'chips' }, sw)));
cls.push(h('td', { class: 'num' }, fmtBoardUsd(r.tvl_usd)));
cls.push(h('td', { class: 'num ' + pctClass(r.change_7d) }, fmtPctShort(r.change_7d)));
if (lv) {
cls.push(h('td', { class: 'num' }, fmtBoardUsd(r.mcap_usd)));
cls.push(h('td', { class: 'num ratio' }, r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(1) + '×' : '—'));
} else {
cls.push(h('td', { class: 'num odds', title: 'token odds; also in the detail drawer' }, r.token_odds === undefined ? '—' : h('span', { class: 'odds-pill odds-' + oddsBand(r.token_odds) }, (r.token_odds * 100).toFixed(0) + '%')));
cls.push(valCellX(r, mv));
cls.push(h('td', { class: 'num netline' }, r.net_usd === undefined ? '—' : fmtNetX(r.net_usd)));
cls.push(h('td', { class: 'farmcell' },
h('span', { class: 'badge verdict-' + (r.verdict === undefined ? 'skip' : r.verdict) }, r.verdict === undefined ? '—' : r.verdict),
h('span', { class: 'plan-net' }, farmNetLine(r))));
}
return h('tr', { class: st.selected && st.selected.slug === r.slug ? 'sel' : '', onclick: function () { st.selected = r; paint(); openDrawer(); } }, cls);
});
return h('div', { class: 'board' }, h('table', null, h('thead', null, hd), h('tbody', null, bd)));
}
var dw, sm;
function buildDrawer() {
dw = h('aside', { class: 'drawer', 'aria-hidden': 'true' });
sm = h('div', { class: 'scrim', onclick: closeDrawer });
return [dw, sm];
}
function closeDrawer() { dw.classList.remove('open'); sm.classList.remove('on'); dw.setAttribute('aria-hidden', 'true'); st.selected = null; }
function openDrawer() {
var r = st.selected; if (!r) return;
var lv = st.tab === 'live';
var bdy = h('div', { class: 'body' });
var kv = h('dl', { class: 'kv' },
dt('Slug', r.slug), dt('Category', r.category || '—'), dt('Chains', (r.chains || []).join(', ') || '—'),
dt('TVL', fmtUsdX(r.tvl_usd)), dt('7-day change', fmtPct(r.change_7d)),
dt('Listed', r.listed_at || 'unknown'), dt('No token for', fmtAge(r.age_days)),
dt('Token odds', r.token_odds === undefined ? '—' : (r.token_odds * 100).toFixed(1) + '% (base ' + (((D.token_odds && D.token_odds.base_rate) || 0) * 100).toFixed(0) + '%)'));
bdy.appendChild(kv);
if (!lv) {
var rc = impliedOf(r);
var tol = Math.max(1, Math.abs(r.implied_value_usd) / 1e5);
var ag = Math.abs(rc - r.implied_value_usd) <= tol;
var cln = (r.category_multiple !== undefined && r.category_multiple !== 1) ? ('category ×' + r.category_multiple.toFixed(3)) : 'category ×1.000 (too few peers, folded into the curve)';
bdy.appendChild(h('h4', { class: 'section' }, 'The implied value'));
bdy.appendChild(h('div', { class: 'math', html:
'implied = <b>alpha</b> &times; <b>TVL<sup>' + F.elasticity.toFixed(3) + '</sup></b> &times; <b>category</b> &times; <b>growth</b> &times; <b>maturity</b><br>' +
'&nbsp;&nbsp;= ' + wholeNumber(F.alpha) + ' &times; ' + wholeNumber(r.tvl_usd) + '<sup>' + F.elasticity.toFixed(3) + '</sup> &times; ' + (r.category_multiple !== undefined ? r.category_multiple.toFixed(3) : '1') + ' &times; ' + r.growth_multiplier.toFixed(3) + ' &times; ' + r.maturity_multiplier.toFixed(3) + '<br>' +
'&nbsp;&nbsp;= <b>' + fmtUsdX(r.implied_value_usd) + '</b>  (an effective ×' + (r.effective_multiple !== undefined ? r.effective_multiple.toFixed(3) : (r.implied_value_usd / r.tvl_usd).toFixed(3)) + ' of TVL)<br>' +
'curve: ' + F.comparables + ' priced protocols, elasticity ' + F.elasticity.toFixed(3) + ', half land within ×' + F.err_lo.toFixed(2) + '–×' + F.err_hi.toFixed(2) + '; ' + cln + '; the page recomputes this row and ' + (ag ? 'agrees with board.json.' : 'differs from board.json — check the data.') }));
if (r.band_lo_usd !== undefined) {
bdy.appendChild(h('div', { class: 'math', html:
'band: <b>' + fmtUsdX(r.band_lo_usd) + ' – ' + fmtUsdX(r.band_hi_usd) + '</b> (the interquartile residual span around the curve)<br>' +
'netting: allocation <b>' + fmtMoney(r.alloc_usd) + '</b> − gas <b>' + fmtMoney(r.est_gas_usd) + '</b> over <b>' + r.est_hours + '</b> hands-on hours = net <b>' + fmtMoney(r.net_usd) + '</b>, at the upper band net <b>' + fmtMoney(r.net_hi_usd) + '</b>: verdict <b>' + r.verdict + '</b>.<br>' +
'plan net of fees: <b>' + esc(r.net_label || 'n/a') + '</b> (7 steps × a stated $2.50 of gas and fees each).<br>' +
'P25–P75: <b>' + fmtUsdX(r.band_p25_usd) + ' – ' + fmtUsdX(r.band_p75_usd) + '</b> from a 200-draw bootstrap of the curve’s residuals (seeded, so it repeats).' }));
bdy.appendChild(bandStrip(r));
}
if (r.token_odds !== undefined) {
var b = (D.token_odds && D.token_odds.base_rate) || 0;
bdy.appendChild(h('div', { class: 'math', html:
'token odds: <b>' + (r.token_odds * 100).toFixed(1) + '%</b> that this protocol ever records a token, against a snapshot base rate of <b>' + (b * 100).toFixed(0) + '%</b>; the fit scores its stated odds at a Brier of <b>' + (((D.token_odds && D.token_odds.brier) || 0).toFixed(3)) + '</b>.' }));
}
var prs = categoryPeersOf(r);
if (prs) {
bdy.appendChild(h('h4', { class: 'section' }, 'Same-category peers — ' + r.category));
bdy.appendChild(h('ul', { class: 'peers' }, prs.map(function (pe) {
return h('li', null, h('span', { class: 'pname' }, pe.name), h('span', { class: 'ratio' }, ' ' + pe.multiple.toFixed(2) + '× mcap / TVL'));
})));
}
bdy.appendChild(h('h4', { class: 'section' }, 'Farming plan — farmPlan()'));
var sts = farmPlan(r);
bdy.appendChild(h('ol', { class: 'steps' }, sts.map(function (s) {
return h('li', null, h('span', null, s.t), h('div', { class: 'meta' }, 'Cost: ' + s.c + ' · Time: ' + s.d));
})));
} else {
bdy.appendChild(h('h4', { class: 'section' }, 'Already trading'));
bdy.appendChild(h('div', { class: 'math', html: 'The market already sets this protocol\'s price, so the radar reports its own value, <b>' + fmtUsdX(r.mcap_usd) + '</b>, and never a modeled one. It is the market side of the comps curve, held off the ranked board.' }));
}
dw.innerHTML = '';
dw.appendChild(h('div', { class: 'bar' }, h('h3', null, r.name), h('button', { class: 'close', onclick: closeDrawer }, 'Close')));
dw.appendChild(bdy);
dw.classList.add('open'); sm.classList.add('on'); dw.setAttribute('aria-hidden', 'false');
}
function dt(k, v) { return [h('dt', null, k), h('dd', null, v)]; }
function bandStrip(r) {
if (r.band_p75_usd === undefined || r.band_p75_usd <= 0) return null;
var hi = r.band_p75_usd, lo = r.band_p25_usd, mid = r.implied_value_usd;
var at = function (v) { return Math.max(0, Math.min(100, (v / hi) * 100)).toFixed(1); };
return h('div', { class: 'bstrip', title: 'P25 ' + fmtUsdX(lo) + ' / implied ' + fmtUsdX(mid) + ' / P75 ' + fmtUsdX(hi) },
h('div', { class: 'bstrip-fill', style: 'left:' + at(lo) + '%;width:' + (at(mid) - at(lo)) + '%' }),
h('i', { class: 'bstrip-t', style: 'left:' + at(lo) + '%' }),
h('i', { class: 'bstrip-t mid', style: 'left:' + at(mid) + '%' }),
h('i', { class: 'bstrip-t', style: 'left:' + at(hi) + '%' }));
}
function categoryPeersOf(r) {
if (!r.category || !D.category_peers) return null;
var ls = D.category_peers[r.category];
return ls && ls.length ? ls.slice(0, 6) : null;
}
var sg;
function paint() {
var fi = document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement.value : null;
var nx = view();
sg.parentNode.replaceChild(nx, sg);
sg = nx;
if (fi !== null) { var s = nx.querySelector('input[type=search]'); if (s) { s.value = fi; s.focus(); } }
}
function view() {
var rw = filtered();
var ct = controls();
ct.querySelector('.count').textContent = rw.length + (st.tab === 'live' ? ' tokens on record' : st.tab === 'aside' ? ' protocols set aside' : ' protocols ranked');
return h('main', { id: 'main' }, header(), kpis(), analytics(), ct, table(rw),
h('footer', null,
'Source: ' + D.source + '. The board ranks pre-token protocols by an implied launch value from a size-fitted comps curve over the snapshot\'s own TVL, market-cap, growth and age figures: no name is special-cased. It is a research board, not advice, and no reward is promised for farming any protocol. Press / to jump to the search box.'));
}
document.addEventListener('keydown', function (e) {
if (e.key === 'Escape') closeDrawer();
});
var blt = buildDrawer();
sg = view();
app.appendChild(sg);
blt.forEach(function (n) { document.body.appendChild(n); });
})();
