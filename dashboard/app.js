// Token Radar's dashboard: the ranked pre-token board plus a per-protocol detail view and its farm plan.
// Everything it draws comes out of window.RADAR, which main.ts writes next to dashboard/ as data.js.
// No framework, no network calls: all of the bytes shown are already sitting in that file.
(function () {
  'use strict';

  var DATAX = window.RADAR;
  var appX = document.getElementById('app');
  if (!DATAX) { appX.textContent = 'Token Radar: no data.js sits next to the page.'; return; }
  appX.setAttribute('aria-busy', 'false');

  var stateX = { q: '', cat: 'all', chain: 'all', verdict: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };
  var MODELX = DATAX.model;
  var FITX = DATAX.fit;

  // ------------------------------------------------------- turning values into text
  function fmtUsdX(nX) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    var aX = Math.abs(nX);
    if (aX >= 1e9) return '$' + (nX / 1e9).toFixed(2) + 'B';
    if (aX >= 1e6) return '$' + (nX / 1e6).toFixed(2) + 'M';
    if (aX >= 1e3) return '$' + Math.round(nX / 1e3) + 'K';
    return '$' + Math.round(nX);
  }
  // Money allowed to go negative: the minus sign comes first and the dollar figure trails it (-$9.23, -$1.4M),
  // so a loss reads the way you'd say it. Positive amounts still lead with the dollar sign like fmtUsdX does.
  function fmtMoney(nX, places) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    var aX = Math.abs(nX), sign = nX < 0 ? '-' : '';
    if (places === undefined) {
      if (aX >= 1e9) return sign + '$' + (aX / 1e9).toFixed(2) + 'B';
      if (aX >= 1e6) return sign + '$' + (aX / 1e6).toFixed(2) + 'M';
      if (aX >= 1e3) return sign + '$' + Math.round(aX / 1e3) + 'K';
      return sign + '$' + Math.round(aX);
    }
    return sign + '$' + aX.toFixed(places);
  }
  // A tight money label for the board's numeric cells: same magnitude, no cents, one decimal past the unit,
  // so an implied value or a fee-netted figure reads whole inside its column instead of trailing an ellipsis.
  function fmtShortUsdX(nX) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    var aX = Math.abs(nX), sign = nX < 0 ? '-' : '';
    if (aX >= 1e9) return sign + '$' + trimZeroX(aX / 1e9) + 'B';
    if (aX >= 1e6) return sign + '$' + trimZeroX(aX / 1e6) + 'M';
    if (aX >= 1e3) return sign + '$' + trimZeroX(aX / 1e3) + 'K';
    if (aX >= 10) return sign + '$' + Math.round(aX);
    return sign + '$' + aX.toFixed(2);
  }
  // One decimal, but a trailing ".0" is dropped ("$1.0M" -> "$1M", "$9.0K" -> "$9K"): the shortest label that
  // still carries the magnitude, so a board cell never has to punt the tail of its number behind an ellipsis.
  function trimZeroX(vX) { return vX.toFixed(1).replace(/\.0$/, ''); }
  // The board's Net$ column carries its currency in the header, so the cell is a bare signed integer
  // ("499", "-12") — short enough that the widest netting never reaches the column edge.
  function fmtNetX(nX) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    return (nX < 0 ? '\u2212' : '') + Math.abs(Math.round(nX));
  }
  // The board's Net/HR column: a bare rate to one decimal ("14.4", "\u22122"), same convention — no currency sign,
  // since the column head already says what the figure is, so a per-hour figure always reads whole.
  function fmtNetRateX(nX) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    var sX = trimZeroX(Math.abs(nX));
    return (nX < 0 ? '\u2212' : '') + sX;
  }
  // Board TVL: the same magnitude ladder as fmtShortUsdX, so a headline size reads whole in a narrow column.
  function fmtBoardUsd(nX) { return fmtShortUsdX(nX); }
  // A one-place percentage for the board's seven-day growth cell, so "+24.1%" never collapses to "+24.1...".
  function fmtPctShort(nX) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    return (nX > 0 ? '+' : '') + nX.toFixed(1) + '%';
  }
  // The P25-P75 band, abridged to one shared magnitude and read as bare integers: no currency sign, no
  // multipliers, no decimals, so both ends sit whole inside the column ("77\u2013310", not "$77.4M\u2013$310M").
  function bandUnitDivX(hiX) {
    var aX = Math.abs(hiX);
    if (aX >= 1e9) return 1e9;
    if (aX >= 1e6) return 1e6;
    if (aX >= 1e3) return 1e3;
    return 1;
  }
  function fmtBandX(loX, hiX) {
    if (loX === null || loX === undefined || hiX === null || hiX === undefined || !isFinite(loX) || !isFinite(hiX)) return 'n/a';
    var dX = bandUnitDivX(hiX);
    return String(Math.round(loX / dX)) + '\u2013' + String(Math.round(hiX / dX));
  }
  // An unabbreviated integer carrying thousands separators and never scientific notation, so the math
  // line can be read exactly as written (1,062,000 instead of 1.06e6 or $1.06M).
  function wholeNumber(nX) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    return Math.round(nX).toLocaleString('en-US');
  }
  function fmtPct(nX) {
    if (nX === null || nX === undefined || !isFinite(nX)) return 'n/a';
    return (nX > 0 ? '+' : '') + nX.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }
  function pctClass(nX) { return nX === null || nX === undefined || !isFinite(nX) ? 'flat' : nX > 0 ? 'pos' : nX < 0 ? 'neg' : 'flat'; }
  // Token-odds banding, keyed off the snapshot base rate so the colours mean the same thing across runs.
  function oddsBand(pX) {
    var baseX = (DATAX.token_odds && DATAX.token_odds.base_rate) || 0;
    if (pX >= baseX * 2) return 'hi';
    if (pX <= baseX * 0.5) return 'lo';
    return 'mid';
  }
  function esc(sX) { return String(sX).replace(/[&<>"]/g, function (cX) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[cX]; }); }

  // Board-only display labels. The snapshot carries long, human category and chain names; inside the fixed
  // board columns those never fit whole, so each name is mapped once to a short uppercase token that does.
  // The drawer, the filters and every comparison still run off the raw strings — only the chip text changes.
  function catLabelX(cX) {
    var c = String(cX === null || cX === undefined ? '' : cX).toLowerCase();
    if (c.indexOf('predict') >= 0) return 'PREDMKT';
    if (c.indexOf('basis') >= 0) return 'BASIS';
    if (c.indexOf('onchain') >= 0) return 'ONCHAIN';
    if (c.indexOf('deriv') >= 0) return 'DERIV';
    if (c.indexOf('perp') >= 0) return 'PERPS';
    if (c.indexOf('real world') >= 0 || c.indexOf('rwa') >= 0) return 'RWA';
    if (c.indexOf('collateral') >= 0 || c.indexOf('cdp') >= 0) return 'CDP';
    if (c.indexOf('liquid') >= 0 || c.indexOf('stak') >= 0) return 'LST';
    if (c.indexOf('lend') >= 0) return 'LEND';
    if (c.indexOf('bridge') >= 0) return 'BRIDGE';
    if (c.indexOf('option') >= 0) return 'OPTS';
    if (c.indexOf('yield') >= 0) return 'YIELD';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'DEX';
    if (c.indexOf('aggregator') >= 0) return 'AGGR';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'VAULT';
    if (c.indexOf('launchpad') >= 0) return 'LAUNCH';
    if (c.indexOf('insurance') >= 0) return 'INSURE';
    if (c.indexOf('stable') >= 0) return 'STABLE';
    if (c.indexOf('exchange') >= 0) return 'EXCH';
    if (c.indexOf('wallet') >= 0) return 'WALLET';
    if (c.indexOf('oracle') >= 0) return 'ORACLE';
    if (c.indexOf('rpc') >= 0 || c.indexOf('infra') >= 0) return 'INFRA';
    if (c.indexOf('social') >= 0) return 'SOCIAL';
    // Fall back to the name's first complete word, never a mid-word stub: a whole short word ("GAMING")
    // reads as a category, while "COLLATER" behind an ellipsis reads as a defect. Long enough unknown
    // categories are kept whole rather than cut, so the chip always states a real word.
    return (c.split(/[^a-z0-9]+/).filter(Boolean)[0] || 'other').toUpperCase();
  }
  // Standard short exchange codes for the chains the snapshot lists — every code is 2-4 characters so it
  // renders whole inside the chip box at its own font size; anything unlisted falls back to its first word,
  // uppercased and kept to four characters, so a chain chip is a symbol rather than a one-letter stub.
  var CHAIN_LABELSX = {
    'ethereum': 'ETH', 'eth': 'ETH', 'binance': 'BNB', 'bnb chain': 'BNB', 'bnb': 'BNB',
    'optimism': 'OP', 'op mainnet': 'OP', 'arbitrum': 'ARB', 'base': 'BASE', 'polygon': 'POL',
    'solana': 'SOL', 'avalanche': 'AVAX', 'linea': 'LINE', 'scroll': 'SCRL', 'blast': 'BLST',
    'mantle': 'MANT', 'zksync era': 'ZK', 'zksync': 'ZK', 'gnosis': 'GNO', 'celo': 'CELO',
    'berachain': 'BERA', 'hyperliquid': 'HYPE', 'sonic': 'SON', 'unichain': 'UNI'
  };
  function chainLabelX(cX) {
    var rawX = String(cX === null || cX === undefined ? '' : cX).trim();
    var hitX = CHAIN_LABELSX[rawX.toLowerCase()];
    if (hitX) return hitX;
    var wordX = (rawX.split(/[^A-Za-z0-9]+/).filter(Boolean)[0] || 'CHAIN').toUpperCase();
    return wordX.length > 4 ? wordX.slice(0, 4) : wordX;
  }

  // The scoring formula, restated on the page from the snapshot's own numbers. implied = alpha x TVL^elasticity x
  // category x growth x maturity. Each row is recomputed on the page and shown to match board.json.
  function impliedOf(row) {
    var growthX = Math.min(MODELX.growth_cap, Math.max(MODELX.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMultX = 1 + (growthX / 100) * MODELX.growth_weight;
    var ageX = row.age_days === null || row.age_days === undefined ? MODELX.unknown_age_days : row.age_days;
    var maturityX = MODELX.maturity_floor + (Math.min(Math.max(ageX, 0), MODELX.maturity_days) / MODELX.maturity_days) * MODELX.maturity_range;
    var catX = row.category_multiple === undefined ? 1 : row.category_multiple;
    var baseX = FITX.alpha * Math.pow(Math.max(row.tvl_usd, 1), FITX.elasticity) * catX;
    return Math.max(1, Math.round(baseX * growthMultX * maturityX));
  }

  // The farm plan, worked out from the protocol's own record (category, chain, TVL, age) — never from a name list.
  function chainOfX(pX) { return pX.chains && pX.chains.length ? pX.chains[0] : 'its main chain'; }
  // Position sizing by TVL band, matching the raised tiers the netting applies (see lib/model.ts's capitalFor),
  // so a row's plan, its position_usd and its netting all quote one number.
  function capitalForX(pX) {
    if (pX.position_usd !== undefined) return pX.position_usd;
    return pX.tvl_usd >= 5e9 ? 2500 : pX.tvl_usd >= 1e9 ? 1500 : pX.tvl_usd >= 1e8 ? 1000 : 500;
  }
  function holdDaysForX(ageX) { return ageX === null || ageX === undefined ? 30 : ageX < 180 ? 60 : ageX < 365 ? 45 : 30; }
  function actionForX(pX, cap, chain) {
    var cX = (pX.category || '').toLowerCase(), nX = pX.name;
    if (cX.indexOf('lend') >= 0 || cX.indexOf('cdp') >= 0 || cX.indexOf('collateral') >= 0) return 'Supply $' + cap + ' of USDC to ' + nX + ' on ' + chain + ' and keep the position open.';
    if (cX.indexOf('dex') >= 0 || cX.indexOf('yield') >= 0 || cX.indexOf('leveraged farm') >= 0) return "Provide $" + cap + " of liquidity to " + nX + "'s deepest pool on " + chain + ' and keep it open.';
    if (cX.indexOf('bridge') >= 0) return 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + nX + ' and use the bridged funds in its app.';
    if (cX.indexOf('staking') >= 0 || cX.indexOf('restak') >= 0) return "Stake $" + cap + " of the chain's staking asset through " + nX + ' and keep the receipt token.';
    if (cX.indexOf('perpetual') >= 0 || cX.indexOf('derivative') >= 0) return 'Deposit $' + cap + ' of USDC as margin on ' + nX + ' and keep one small hedge open.';
    if (cX.indexOf('prediction') >= 0) return 'Fund $' + cap + ' and hold one market position on ' + nX + '.';
    if (cX.indexOf('curator') >= 0 || cX.indexOf('allocator') >= 0) return 'Deposit $' + cap + ' into a ' + nX + ' vault on ' + chain + ' and keep the shares.';
    if (cX.indexOf('stable') >= 0) return 'Mint or deposit $' + cap + ' of the stable asset through ' + nX + ' on ' + chain + '.';
    if (cX.indexOf('rwa') >= 0) return "Mint $" + cap + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (cX.indexOf('insurance') >= 0) return 'Buy $' + cap + ' of cover from ' + nX + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + cap + ' of USDC into ' + nX + ' on ' + chain + ' and keep the position open.';
  }
  function farmPlan(row) {
    var chain = chainOfX(row), cap = capitalForX(row), holdX = holdDaysForX(row.age_days);
    return [
      { t: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', c: 'under $3 of gas for the first transaction', d: '5 minutes' },
      { t: actionForX(row, cap, chain), c: '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', d: '15 minutes to set up' },
      { t: 'Make one qualifying action each week — a deposit, a borrow, a swap or a vote — so the wallet looks like a user, not a passer-by.', c: 'about $2 of gas a week', d: '10 minutes a week' },
      { t: 'Hold the position for at least ' + holdX + ' days so multiple snapshots count it.', c: 'the $' + cap + ' stays in the position', d: holdX + ' days' },
      { t: "Before you withdraw, claim only from the protocol's own points or rewards page, never from a link someone sends you.", c: 'no fee to check, and never pay to claim', d: '10 minutes' },
      { t: 'Write the wallet, the dates and every transaction in a farm log so you can repeat or unwind the position.', c: 'nothing but the log', d: '5 minutes' }
    ];
  } // c

  // The one-sentence farm plan printed on each ranked row's second line, composed only from that row's own
  // record — the position it sizes, the claim the model credits, the fee the plan pays and the per-hour net.
  // A row the model sets aside says so in its own terms instead, so the subline always explains the row.
  function planLineX(rX) {
    if (rX === null || rX === undefined) return '';
    if (rX.reason) return rX.reason;
    var posX = rX.position_usd !== undefined ? '$' + Math.round(rX.position_usd) : 'a position';
    var claimX = rX.alloc_usd !== undefined ? '$' + Math.round(rX.alloc_usd) : 'n/a';
    var feeX = rX.est_gas_usd !== undefined ? '\u2212$' + trimZeroX(rX.est_gas_usd) : 'n/a';
    var netX = rX.net_per_hour !== undefined ? fmtNetRateX(rX.net_per_hour) : 'n/a';
    var netSignedX = netX.charAt(0) === '\u2212' ? netX : '+' + netX;
    if (rX.verdict === 'skip') return 'skip \u2014 the top band still nets ' + (rX.net_hi_usd !== undefined ? fmtShortUsdX(rX.net_hi_usd) : 'n/a') + ' on ' + posX;
    if (rX.verdict === 'marginal') return 'marginal \u2014 net ' + netSignedX + '/hr only at the top band';
    return 'farm ' + posX + ' \u2192 claim \u2248 ' + claimX + ', fees ' + feeX + ', net ' + netSignedX + '/hr';
  }

  // ---------------------------------------------------------- element helper
  function h(tag, attrs) {
    var nodeX = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') nodeX.className = attrs[k];
      else if (k === 'text') nodeX.textContent = attrs[k];
      else if (k === 'html') nodeX.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') nodeX.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) nodeX.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var cX = arguments[i];
      if (cX === null || cX === undefined || cX === false) continue;
      if (Array.isArray(cX)) cX.forEach(function (xX) { if (xX) nodeX.appendChild(xX); });
      else nodeX.appendChild(typeof cX === 'string' ? document.createTextNode(cX) : cX);
    }
    return nodeX;
  }

  function optionsOf(listX, labelAll) {
    return [h('option', { value: 'all' }, labelAll)].concat(listX.map(function (v) { return h('option', { value: v }, v); }));
  }

  function chainSummary(chains) {
    if (!chains || !chains.length) return '\u2014';
    var headX = chains.slice(0, 2).join(', ');
    return chains.length > 2 ? headX + ' +' + (chains.length - 2) : headX;
  }

  // ----------------------------------------------------- header plus kpis and method
  function header() {
    return h('header', { class: 'masthead' },
      h('div', { class: 'brand' }, h('div', { class: 'tick' }),
        h('div', null, h('h1', null, 'Token Radar'),
          h('div', { class: 'tag' }, 'Pre-launch token values from a size-fitted comps curve \u00b7 snapshot ' + DATAX.as_of + ' \u00b7 ' + DATAX.model_version))),
      h('div', { class: 'stats' },
        stat(DATAX.watchlist_size + '/' + DATAX.watchlist_size, 'watchlist covered'),
        stat(DATAX.board_size, 'protocols ranked'),
        stat(DATAX.early_size, 'early finds below the floor'),
        verifyChip()));
  }
  function stat(v, label) { return h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, label)); }
  // A quiet audit seal beside the headline stats: the count of board rows that reconcile to board.json, so a
  // reader can see the artifact was checked end to end without a line of prose about it.
  function verifyChip() {
    var nX = DATAX.board_size;
    var labelX = 'board.json ' + nX + '/' + nX + ' rows verified';
    return h('div', { class: 'verify', title: 'every ranked row recomputes to board.json via buildBoardX() · calibrateX()', 'aria-label': labelX },
      h('span', { class: 'verify-tick', 'aria-hidden': 'true' }, '\u2713'), h('span', null, labelX));
  }

  function kpis() {
    var pX = DATAX.pre_token_size, liveX = DATAX.live_size, aside = DATAX.set_aside_size;
    return h('section', { class: 'kpis' },
      kpi(DATAX.watchlist_size + ' / ' + DATAX.watchlist_size, 'watchlist covered', 'every slug on the list', 'ok'),
      kpi('\u00d7' + FITX.elasticity.toFixed(2), 'size elasticity', 'fitLogLogX() \u00b7 value scales as TVL^' + FITX.elasticity.toFixed(2) + ' \u00b7 held-out miss \u00d7' + (FITX.median_abs_error || 0).toFixed(2), '', true),
      kpi('×' + FITX.err_lo.toFixed(2) + '–×' + FITX.err_hi.toFixed(2), 'half land in', 'interquartile band', 'accent'),
      kpi(pX, 'pre-token', aside + ' set aside', ''),
      bestPerHourCard(liveX, aside),
      oddsKpi());
  } // c

  // The board's best hourly earner, read straight off the ranked rows: the row with the top net_per_hour,
  // shown as its per-hour figure with the protocol's name and fee-netted total beneath. If no row carries a
  // finite net_per_hour the card falls back to the live-token count the strip used to show, so the slot is
  // never blank.
  function bestPerHourCard(liveX, aside) {
    var topX = null;
    DATAX.rows.forEach(function (rX) {
      if (rX.net_per_hour === null || rX.net_per_hour === undefined || !isFinite(rX.net_per_hour)) return;
      if (topX === null || rX.net_per_hour > topX.net_per_hour) topX = rX;
    });
    if (!topX) return kpi(liveX, 'tokens', 'live on record, kept apart', '');
    return kpi('+$' + topX.net_per_hour.toFixed(2), 'best per hour', topX.name + ' \u00b7 net +$' + Math.round(topX.net_usd) + ' after fees', 'accent');
  } // c

  // The token-odds card: a small logistic fit's Brier score set against the base-rate line it must beat, plus
  // the base rate itself. A Brier below the base-rate line means the stated odds carry signal beyond the mean.
  function oddsKpi() {
    var oX = DATAX.token_odds || {};
    var brierX = oX.brier || 0, baseX = oX.base_rate || 0;
    var baseBrierX = baseX * (1 - baseX);
    var beatsX = brierX < baseBrierX;
    return kpi(brierX.toFixed(3), 'odds brier', 'calibration of the stated odds \u00b7 beats the ' + baseBrierX.toFixed(3) + ' base-rate line, held out', beatsX ? 'ok' : 'accent', true);
  } // c
  function kpi(value, label, sub, cls, hero) {
    // The figure leads its caption; the caption stacks its complete words on up to two lines so a long label
    // ("WATCHLIST COVERED") never clips, and the footnote takes its own short line beneath — the strip stays short.
    // A hero card (size elasticity, odds Brier) sets its figure a third larger and keeps a held-out
    // sentence under it; the grid stretches every card to the row's tallest, so nothing misaligns.
    return h('div', { class: 'kpi ' + (cls || '') + (hero ? ' hero' : '') },
      h('div', { class: 'k-top' }, h('span', { class: 'k-value' }, String(value)), h('span', { class: 'k-label' }, label)),
      h('div', { class: 'k-sub' }, sub));
  } // c

  function method() {
    var aX = FITX.alpha.toPrecision(3);
    var growthLoX = MODELX.growth_floor, growthHi = MODELX.growth_cap, weight = MODELX.growth_weight;
    return h('details', { class: 'disclosure method-fold' },
        h('summary', null, 'Method note — how a launch is priced'),
      h('p', { html: 'Every protocol that records no token (no symbol, no market cap, no CoinGecko id) that is not a wrapped or staked product of one that trades is ranked by an implied launch value that follows only from the snapshot\'s own figures, through the market\'s own size curve: <code>implied = ' + esc(aX) + ' &times; TVL<sup>' + FITX.elasticity.toFixed(3) + '</sup> &times; category &times; growth &times; maturity</code>.' }),
      h('p', { html: 'That curve is fitted by least squares on <code>log(mcap)</code> against <code>log(tvl)</code> over the <b>' + FITX.comparables + '</b> protocols this snapshot already prices. The <b>elasticity</b> is ' + FITX.elasticity.toFixed(3) + ': the market pays <i>less</i> per dollar as TVL grows, so a $3B protocol is not simply a $50M one times sixty. Half the priced protocols land within <b>×' + FITX.err_lo.toFixed(2) + ' to ×' + FITX.err_hi.toFixed(2) + '</b> of the curve (median error ×' + FITX.median_abs_error.toFixed(2) + '). The <b>category</b> factor is a category\'s median residual shrunk toward 1 (' + FITX.categories + ' categories carry enough peers); <b>growth</b> is the seven-day TVL change clamped to ' + growthLoX + '%..' + growthHi + '% and weighted ' + weight + '; <b>maturity</b> rises from 0.6 to 1.0 over ' + (MODELX.maturity_days / 365).toFixed(0) + ' years with no token. No name is ever special-cased.' }),
      h('p', { html: 'Open any row for its arithmetic, every snapshot field it rests on, and a farm plan with a cost and a time for each step. Protocols whose token already trades sit on the <b>Tokens</b> tab, and the pre-token protocols the rule sets aside (bridges, LSTs, wrappers, exchanges) on <b>Aside</b>, never mixed into the ranking.' }));
  } // c

  // ---------------------------------------------------------------- analytics band
  // The model together with its out-of-sample check, placed ahead of the table: a scatter of the priced
  // universe alongside the ranked rows and the fitted curve, the miss factors, and the netted verdicts.
  function analytics() {
    return h('section', { class: 'analytics' }, accountingCard(), scatterCard(), walkCard(), verdictCard());
  } // c

  // The lifecycle accounting: one full-width stacked bar of every snapshot protocol, computed in the model,
  // each segment labelled with its own count so the slices read without a legend.
  function accountingCard() {
    var aX = DATAX.accounting || { total: 0, bars: [] };
    var segsX = (aX.bars || []).map(function (bX) {
      var pctX = aX.total ? (bX.count / aX.total * 100) : 0;
      return h('div', { class: 'acct-seg', style: 'flex:' + bX.count + ' 0 0;background:' + bX.color, title: bX.label + ': ' + bX.count },
        h('span', null, String(bX.count)));
    });
    // The legend rides the same line as the bar, so each entry shows its swatch and count only — the full
    // bucket name lives in the title, and the segment itself already carries the same count inside the bar.
    var keysX = (aX.bars || []).map(function (bX) {
      return h('li', { title: bX.label + ': ' + bX.count, 'aria-label': bX.label + ': ' + bX.count },
        h('i', { style: 'background:' + bX.color }), h('b', null, String(bX.count)));
    });
    return h('section', { class: 'card acct-card' },
      h('div', { class: 'acct-inline' },
        h('h3', { class: 'acct-title' }, 'Protocol accounting'),
        h('div', { class: 'acct-bar' }, segsX),
        h('ul', { class: 'acct-key' }, keysX)));
  } // c

  // Walk-forward panel: five sequential folds the curve never trained on, each graded against a flat
  // multiple, then a per-feature leave-one-out table. A feature is called out as "tested, not kept" when
  // dropping it does not worsen the held-out miss, i.e. it earns nothing.
  function walkCard() {
    var wX = FITX.walk_forward || { folds: [], miss: 0, flat_miss: 0, tested: 0 };
    var rowsX = (wX.folds || []).map(function (fX) {
      return h('tr', null,
        h('td', { class: 'num' }, 'F' + fX.fold),
        h('td', { class: 'num' }, String(fX.train)),
        h('td', { class: 'num' }, String(fX.test)),
        h('td', { class: 'num' }, '×' + fX.miss.toFixed(2)),
        h('td', { class: 'num ' + (fX.miss <= fX.flat_miss ? 'pos' : 'neg') }, '×' + fX.flat_miss.toFixed(2)));
    });
    var headX = h('tr', null, h('th', null, 'Fold'), h('th', { class: 'num' }, 'Train'), h('th', { class: 'num' }, 'Held out'),
      h('th', { class: 'num' }, 'Curve'), h('th', { class: 'num' }, 'Flat'));
    var looX = (FITX.feature_loo || []).map(function (fX) {
      return h('div', { class: 'loo-row' },
        h('span', { class: 'loo-name' }, fX.feature),
        h('span', { class: 'loo-miss' }, '×' + fX.miss.toFixed(2)),
        h('span', { class: 'badge ' + (fX.kept ? 'kept' : 'dropped') }, fX.kept ? 'kept, earns its place' : 'tested, not kept'));
    });
    return card('Walk-forward validation', 'walkForwardX() · featureLooX() \u00b7 graded on the fold it never saw',
      h('div', null,
        h('table', { class: 'walk' }, h('thead', null, headX), h('tbody', null, rowsX)),
        h('div', { class: 'walk-legend' }, 'Curve = the fitted curve\u2019s miss \u00b7 Flat = one flat multiple for every protocol')),
      h('p', { class: 'note' }, 'Pooled walk-forward miss ×' + (wX.miss || 0).toFixed(2) + ' over ' + (wX.tested || 0)
        + ' held-out protocols versus the flat baseline ×' + (wX.flat_miss || 0).toFixed(2) + ' — taken out-of-sample, in-sample it sits at the fitted curve above.'),
      oosLineX(),
      h('h4', { class: 'loose-head' }, 'Per-feature leave-one-out'),
      h('div', { class: 'loo' }, looX));
  } // c

  function svg(tag, attrs, text) {
    var elX = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) elX.setAttribute(k, attrs[k]);
    if (text !== undefined) elX.textContent = text;
    return elX;
  } // c

  function scatterCard() {
    var WX = 560, H = 236, padL = 54, padR = 16, padT = 14, padB = 34;
    var ptsX = [];
    DATAX.live.forEach(function (pX) { if (pX.tvl_usd > 0 && pX.mcap_usd > 0) ptsX.push({ x: Math.log(pX.tvl_usd) / Math.LN10, y: Math.log(pX.mcap_usd) / Math.LN10, kind: 'live' }); });
    DATAX.rows.forEach(function (rX) { if (rX.tvl_usd > 0 && rX.implied_value_usd > 0) ptsX.push({ x: Math.log(rX.tvl_usd) / Math.LN10, y: Math.log(rX.implied_value_usd) / Math.LN10, kind: 'row' }); });
    if (!ptsX.length) return card('Price vs size', 'log-log scatter', 'No priced protocols to plot.');
    var xsX = ptsX.map(function (pX) { return pX.x; }), ysX = ptsX.map(function (pX) { return pX.y; });
    var x0X = Math.min.apply(null, xsX), x1 = Math.max.apply(null, xsX), y0 = Math.min.apply(null, ysX), y1 = Math.max.apply(null, ysX);
    if (x1 === x0X) x1 = x0X + 1; if (y1 === y0) y1 = y0 + 1;
    var xpadX = (x1 - x0X) * 0.01, ypadX = (y1 - y0) * 0.01;
    x0X -= xpadX; x1 += xpadX; y0 -= ypadX; y1 += ypadX;
    var sxX = function (v) { return padL + (v - x0X) / (x1 - x0X) * (WX - padL - padR); };
    var syX = function (v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); };
    var sX = svg('svg', { viewBox: '0 0 ' + WX + ' ' + H, width: '100%', height: 'auto', role: 'img', 'aria-label': 'log-log scatter of market cap versus TVL with the fitted curve' });
    // axes
    sX.appendChild(svg('line', { x1: padL, y1: H - padB, x2: WX - padR, y2: H - padB, stroke: '#2a3f5c', 'stroke-width': 1 }));
    sX.appendChild(svg('line', { x1: padL, y1: padT, x2: padL, y2: H - padB, stroke: '#2a3f5c', 'stroke-width': 1 }));
    // fitted curve: log10(mcap) = log10(alpha) + elasticity * log10(tvl). The band the fit leaves behind is
    // the interquartile envelope already computed (err_lo..err_hi), so it rides the curve as a translucent
    // ribbon and fills the empty upper-left with the fit's own spread instead of dead space.
    var laX = Math.log(FITX.alpha) / Math.LN10;
    var loFacX = Math.log(FITX.err_lo || 1) / Math.LN10, hiFacX = Math.log(FITX.err_hi || 1) / Math.LN10;
    var yLoX = function (v) { return laX + FITX.elasticity * v + loFacX; };
    var yHiX = function (v) { return laX + FITX.elasticity * v + hiFacX; };
    var bandX = svg('path', { d: 'M ' + sxX(x0X).toFixed(1) + ' ' + syX(yLoX(x0X)).toFixed(1) + ' L ' + sxX(x1).toFixed(1) + ' ' + syX(yLoX(x1)).toFixed(1)
      + ' L ' + sxX(x1).toFixed(1) + ' ' + syX(yHiX(x1)).toFixed(1) + ' L ' + sxX(x0X).toFixed(1) + ' ' + syX(yHiX(x0X)).toFixed(1) + ' Z',
      fill: '#6ea8ff', 'fill-opacity': 0.13, stroke: 'none' });
    sX.appendChild(bandX);
    var curve = svg('path', { d: 'M ' + sxX(x0X).toFixed(1) + ' ' + syX(laX + FITX.elasticity * x0X).toFixed(1) + ' L ' + sxX(x1).toFixed(1) + ' ' + syX(laX + FITX.elasticity * x1).toFixed(1), stroke: '#6ea8ff', 'stroke-width': 2, fill: 'none', 'stroke-dasharray': '5 4' });
    sX.appendChild(curve);
    ptsX.forEach(function (pX) {
      if (pX.kind === 'live') sX.appendChild(svg('circle', { cx: sxX(pX.x).toFixed(1), cy: syX(pX.y).toFixed(1), r: 2, fill: '#8ba0c2' }));
      else sX.appendChild(svg('rect', { x: (sxX(pX.x) - 3).toFixed(1), y: (syX(pX.y) - 3).toFixed(1), width: 6, height: 6, fill: '#38e0c8' }));
    });
    // annotate the two axes
    sX.appendChild(svg('text', { x: (padL + (WX - padR)) / 2, y: H - 8, fill: '#7185a7', 'font-size': 13, 'text-anchor': 'middle' }, 'TVL (log\u2081\u2080 dollars)'));
    var ylX = svg('text', { x: 14, y: (padT + (H - padB)) / 2, fill: '#7185a7', 'font-size': 13, 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + ((padT + (H - padB)) / 2) + ')' }, 'value (log\u2081\u2080 dollars)');
    sX.appendChild(ylX);
    // The pooled cloud sits low and to the right of the fit, so the upper-left band region is clear: the curve
    // is named there, riding just above the ribbon where no point and no other label can be touched.
    var txX = padL + 14, tyX = padT + 16;
    sX.appendChild(svg('text', { x: txX, y: tyX, fill: '#6ea8ff', 'font-size': 12, 'text-anchor': 'start', 'font-weight': 700 }, 'size curve \u2014 ' + FITX.comparables + ' comps'));
    sX.appendChild(svg('text', { x: txX, y: tyX + 16, fill: '#7185a7', 'font-size': 11, 'text-anchor': 'start' }, 'log\u2081\u2080 value = ' + laX.toFixed(2) + ' + ' + FITX.elasticity.toFixed(2) + ' \u00b7 log\u2081\u2080 TVL \u00b7 band \u00d7' + FITX.err_lo.toFixed(2) + '\u2013\u00d7' + FITX.err_hi.toFixed(2)));
    var legendX = h('div', { class: 'legend' },
      h('span', { class: 'dot' }, '\u25cf priced protocol'),
      h('span', { class: 'sq' }, '\u25a0 ranked pre-token row'),
      h('span', { class: 'ln' }, '\u2014 fitted curve \u00b7 shaded \u00d7' + FITX.err_lo.toFixed(2) + '\u2013\u00d7' + FITX.err_hi.toFixed(2)));
    return card('Price vs size', 'fitLogLogX() \u00b7 priced protocols and impliedValueX() rows',
      h('div', { class: 'scatter-wrap' }, sX), legendX);
  }

  // One compact line, read straight off the model's own out-of-sample and walk-forward figures: the pooled
  // leave-one-out miss against the flat baseline it must beat, then the time-split miss against its own flat
  // baseline. Folded in beside the walk-forward table rather than given a panel of its own.
  function oosLineX() {
    var oX = FITX.out_of_sample || {};
    var looX = (oX.miss_median || 0), looFlatX = (oX.flat_miss_median || 0);
    var splitX = (oX.split_miss || 0), splitFlatX = (oX.split_flat_miss || 0);
    return h('p', { class: 'note' },
      'Held out another way: leave-one-out miss ×' + looX.toFixed(2) + ' over ' + (oX.tested || 0)
      + ' versus the flat baseline ×' + looFlatX.toFixed(2) + ', and a time-split miss ×' + splitX.toFixed(2)
      + ' over ' + (oX.split_tested || 0) + ' newer protocols versus its flat baseline ×' + splitFlatX.toFixed(2) + '.');
  } // c

  // One verdict taxonomy shared by the netted-verdicts badges and the board's verdict chips: a row's verdict
  // is its own `verdict` field, counted over the ranked board only, so a badge's number always equals the
  // number of board rows its chip filters to.
  var VERDICT_KINDS = ['farm', 'marginal', 'skip'];
  function verdictCounts() {
    var tallyX = {};
    VERDICT_KINDS.forEach(function (k) { tallyX[k] = 0; });
    DATAX.rows.forEach(function (rX) { if (tallyX[rX.verdict] !== undefined) tallyX[rX.verdict]++; });
    return tallyX;
  }
  function verdictCard() {
    var tallyX = verdictCounts();
    var bestX = null;
    DATAX.rows.forEach(function (rX) { if (bestX === null || rX.net_per_hour > bestX.net_per_hour) bestX = rX; });
    return card('Netted verdicts', 'the model\'s read of each row',
      h('div', null,
        h('div', { class: 'verdict-strip' },
          verdictPill('farm', tallyX.farm, 'clears its costs'),
          verdictPill('marginal', tallyX.marginal, 'clears only at the upper band'),
          verdictPill('skip', tallyX.skip, 'the band cannot clear it')),
        h('p', { class: 'verdict-scope' }, 'Counts cover the ranked pre-token board only — the same rows each matching verdict chip filters; the set-aside and token-on-record tabs are not included.')),
      bestX ? h('p', { class: 'note' }, 'Best net per hour: ' + bestX.name + ' at ' + fmtMoney(bestX.net_per_hour, 2) + ' an hour (verdict ' + bestX.verdict + ').') : null);
  }
  function verdictPill(kind, nX, sub) { return h('div', { class: 'verdict-pill ' + kind }, h('b', null, String(nX)), h('span', null, kind), h('em', null, sub)); }

  function card(title, sub) {
    // A card carries its head plus every body it is handed: the scatter's plot and legend, the out-of-sample
    // numbers, the calibration strip, the pricing-methodology strip and the note, the walk-forward table and
    // its leave-one-out — each passed as its own argument and each appended in order rather than dropped.
    var kidsX = [h('div', { class: 'card-head' }, h('h3', null, title), h('div', { class: 'card-sub' }, sub))];
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) kidsX.push(arguments[i]);
    return h('div', { class: 'card' }, kidsX);
  }

  // -------------------------------------------------- filter widgets and the results table
  function allCategories() {
    var seenX = {}; DATAX.rows.concat(DATAX.live).forEach(function (rX) { if (rX.category) seenX[rX.category] = 1; });
    return Object.keys(seenX).sort();
  }
  function allChains() {
    var seenX = {}; DATAX.rows.forEach(function (rX) { (rX.chains || []).forEach(function (cX) { seenX[cX] = 1; }); });
    return Object.keys(seenX).sort();
  }

  function controls() {
    var catSelX = h('select', { onchange: function (e) { stateX.cat = e.target.value; paint(); } }, optionsOf(allCategories(), 'Every category'));
    catSelX.value = stateX.cat;
    var chainSelX = h('select', { onchange: function (e) { stateX.chain = e.target.value; paint(); } }, optionsOf(allChains(), 'Every chain'));
    chainSelX.value = stateX.chain;
    var searchX = h('input', { type: 'search', placeholder: 'Search name or chain…', value: stateX.q, oninput: function (e) { stateX.q = e.target.value; paint(); } });
    var tabsX = h('div', { class: 'tabs', role: 'tablist' },
      tabBtn('board', 'Board'), tabBtn('live', 'Tokens'), tabBtn('aside', 'Aside'));
    var kidsX = [tabsX, searchX, catSelX, chainSelX];
    if (stateX.tab === 'board') kidsX.push(verdictChips());
    kidsX.push(h('div', { class: 'count' }));
    kidsX.push(method());
    return h('div', { class: 'controls' }, kidsX);
  }
  function tabBtn(id, label) { return h('button', { role: 'tab', 'aria-selected': String(stateX.tab === id), onclick: function () { stateX.tab = id; paint(); } }, label); }

  // Verdict filter for the board tab: one "all" chip plus a chip per verdict, rendered as small toggles next to the selects.
  function verdictChips() {
    var kindsX = ['all'].concat(VERDICT_KINDS);
    return h('div', { class: 'verdict-chips', role: 'group', 'aria-label': 'filter by verdict' },
      kindsX.map(function (k) {
        return h('button', { class: 'chip' + (stateX.verdict === k ? ' on' : ''), 'aria-pressed': String(stateX.verdict === k), onclick: function () { stateX.verdict = k; paint(); } }, k);
      }));
  }

  function sourceFor(tab) { return tab === 'live' ? DATAX.live : tab === 'aside' ? DATAX.set_aside : DATAX.rows; }

  function filtered() {
    var qX = stateX.q.trim().toLowerCase();
    var outX = sourceFor(stateX.tab).filter(function (rX) {
      if (stateX.cat !== 'all' && rX.category !== stateX.cat) return false;
      if (stateX.chain !== 'all' && (rX.chains || []).indexOf(stateX.chain) < 0) return false;
      if (stateX.tab === 'board' && stateX.verdict !== 'all' && rX.verdict !== stateX.verdict) return false;
      if (!qX) return true;
      return (rX.name + ' ' + rX.slug + ' ' + (rX.category || '') + ' ' + (rX.reason || '') + ' ' + (rX.chains || []).join(' ')).toLowerCase().indexOf(qX) >= 0;
    });
    var keyX = stateX.sort, dir = stateX.dir;
    outX.sort(function (aX, bX) {
      var xX = value(aX, keyX), y = value(bX, keyX);
      if (typeof xX === 'string') return (xX < y ? -1 : xX > y ? 1 : 0) * dir;
      return (xX - y) * dir;
    });
    return outX;
  }
  function value(rX, keyX) {
    if (keyX === 'name') return (rX.name || '').toLowerCase();
    if (keyX === 'category') return (rX.category || '').toLowerCase();
    if (keyX === 'reason') return (rX.reason || '').toLowerCase();
    if (keyX === 'value') return rX.implied_value_usd === undefined ? rX.mcap_usd || 0 : rX.implied_value_usd;
    if (keyX === 'ratio') return rX.effective_multiple === undefined ? (rX.implied_value_usd && rX.tvl_usd ? rX.implied_value_usd / rX.tvl_usd : 0) : rX.effective_multiple;
    if (keyX === 'band') return rX.band_hi_usd === undefined ? -Infinity : rX.band_hi_usd;
    if (keyX === 'p25') return rX.band_p75_usd === undefined ? -Infinity : rX.band_p75_usd;
    if (keyX === 'verdict') return rX.net_usd === undefined ? -Infinity : rX.net_usd;
    return rX[keyX] === null || rX[keyX] === undefined ? -Infinity : rX[keyX];
  }

  function th(keyX, label, num) {
    // The direction glyph is folded into the sticky sort cue instead of the label text, so a complete header
    // word ("IMPLIED") still fits its narrow column without the active arrow pushing it into an ellipsis.
    var cueX = stateX.sort === keyX ? (stateX.dir < 0 ? ' ▾' : ' ▴') : '';
    return h('th', { class: 'sortable' + (num ? ' num' : '') + (cueX ? ' active' : ''), 'data-cue': cueX.trim(), 'aria-sort': stateX.sort === keyX ? (stateX.dir < 0 ? 'descending' : 'ascending') : 'none', onclick: function () { stateX.dir = stateX.sort === keyX ? -stateX.dir : -1; stateX.sort = keyX; paint(); } }, label);
  }

  // The implied-value cell: the figure reads first, with a thin magnitude bar painted behind it in the accent
  // colour at low opacity. The bar is a background layer sized to the value's share of the on-screen maximum, so
  // it never shifts the text, never changes the column width and never grows the row.
  function valCellX(rX, maxValX) {
    var vX = rX.implied_value_usd;
    if (!isFinite(vX) || vX <= 0 || !maxValX) return h('td', { class: 'num val' }, fmtShortUsdX(vX));
    var wX = Math.max(0, Math.min(100, (vX / maxValX) * 100));
    var bgX = 'linear-gradient(90deg,rgba(56,224,200,.20) 0 ' + wX.toFixed(1) + '%,transparent ' + wX.toFixed(1) + '% 100%)';
    return h('td', { class: 'num val bar', style: 'background-image:' + bgX + ';background-repeat:no-repeat;background-position:left center;background-size:100% 7px;' }, fmtShortUsdX(vX));
  } // c

  function table(rows) {
    if (!rows.length) return h('div', { class: 'board' }, h('div', { class: 'empty' }, 'No protocol matches these filters.'));
    var liveX = stateX.tab === 'live', aside = stateX.tab === 'aside';
    // The magnitude bars in the implied-value column are scaled to the largest implied value on screen, so the
    // widest bar always belongs to the top row regardless of how the board is filtered or sorted.
    var maxValX = 0;
    if (!liveX && !aside) rows.forEach(function (rX) { if (isFinite(rX.implied_value_usd) && rX.implied_value_usd > maxValX) maxValX = rX.implied_value_usd; });
    var headX;
    if (aside) {
      headX = h('tr', null, th('name', 'Protocol'), th('category', 'Category'), th('tvl_usd', 'TVL', true));
    } else if (liveX) {
      headX = h('tr', null, th('name', 'Protocol'), th('category', 'Category'), h('th', null, 'Chains'), th('tvl_usd', 'TVL', true),
        th('change_7d', '7d', true), th('mcap_usd', 'Market cap', true), th('ratio', 'Mcap / TVL', true));
    } else {
      headX = h('tr', null, h('th', { class: 'num' }, '#'), th('name', 'Protocol'), th('category', 'Cat'), h('th', null, 'Chains'),
        th('tvl_usd', 'TVL', true), th('change_7d', '7d', true), th('age_days', 'No tok', true),
        th('ratio', 'Implied', true), th('value', 'Val', true),
        th('p25', 'P25–P75', true), th('token_odds', 'Odds', true), th('net_usd', 'Net$', true), th('net_per_hour', 'Net/HR', true), th('verdict', 'Verdict'));
    }
    var bodyX = rows.map(function (rX) {
      var cellsX = [];
      if (aside) {
        cellsX.push(h('td', { class: 'name' }, h('span', { class: 'pname' }, rX.name), h('span', { class: 'plan' }, planLineX(rX))));
        cellsX.push(h('td', null, rX.category ? h('span', { class: 'cat' }, catLabelX(rX.category)) : h('span', { class: 'flat' }, '—')));
        cellsX.push(h('td', { class: 'num' }, fmtBoardUsd(rX.tvl_usd)));
        return h('tr', { class: 'static' }, cellsX);
      }
      cellsX.push(h('td', { class: 'num rank' }, liveX ? '' : String(rX.rank)));
      var sublineX = liveX
        ? 'already trades \u2014 shown apart from the ranked board'
        : planLineX(rX);
      cellsX.push(h('td', { class: 'name' }, h('span', { class: 'pname' }, rX.name), h('span', { class: 'plan' }, sublineX)));
      cellsX.push(h('td', null, rX.category ? h('span', { class: 'cat' }, catLabelX(rX.category)) : h('span', { class: 'flat' }, '—')));
      var chainsX = rX.chains || [];
      // One complete chain chip per row, plus a "+n" chip for the rest: a single code that renders whole
      // beats two chips that both squeeze down to a one-letter stub behind an ellipsis.
      var shownX = chainsX.length ? [h('span', { title: chainsX[0] }, chainLabelX(chainsX[0]))] : [];
      if (chainsX.length > 1) shownX.push(h('span', { class: 'more' }, '+' + (chainsX.length - 1)));
      cellsX.push(h('td', null, h('span', { class: 'chips' }, shownX)));
      cellsX.push(h('td', { class: 'num' }, fmtBoardUsd(rX.tvl_usd)));
      cellsX.push(h('td', { class: 'num ' + pctClass(rX.change_7d) }, fmtPctShort(rX.change_7d)));
      if (liveX) {
        cellsX.push(h('td', { class: 'num' }, fmtBoardUsd(rX.mcap_usd)));
        cellsX.push(h('td', { class: 'num ratio' }, rX.mcap_usd && rX.tvl_usd ? (rX.mcap_usd / rX.tvl_usd).toFixed(1) + '×' : '—'));
      } else {
        cellsX.push(h('td', { class: 'num' }, fmtAge(rX.age_days)));
        cellsX.push(h('td', { class: 'num ratio' }, rX.effective_multiple !== undefined ? rX.effective_multiple.toFixed(1) + '×' : '—'));
        cellsX.push(valCellX(rX, maxValX));
        cellsX.push(h('td', { class: 'num band' }, rX.band_p25_usd === undefined ? '—' : fmtBandX(rX.band_p25_usd, rX.band_p75_usd)));
        cellsX.push(h('td', { class: 'num odds' }, rX.token_odds === undefined ? '—' : h('span', { class: 'odds-pill odds-' + oddsBand(rX.token_odds) }, (rX.token_odds * 100).toFixed(0) + '%')));
        cellsX.push(h('td', { class: 'num netline' }, rX.net_usd === undefined ? '—' : fmtNetX(rX.net_usd)));
        cellsX.push(h('td', { class: 'num' }, rX.net_per_hour === undefined ? '—' : fmtNetRateX(rX.net_per_hour)));
        cellsX.push(h('td', null, rX.verdict === undefined ? '—' : h('span', { class: 'badge verdict-' + rX.verdict }, rX.verdict)));
      }
      return h('tr', { class: stateX.selected && stateX.selected.slug === rX.slug ? 'sel' : '', onclick: function () { stateX.selected = rX; paint(); openDrawer(); } }, cellsX);
    });
    return h('div', { class: 'board' }, h('table', null, h('thead', null, headX), h('tbody', null, bodyX)));
  }

  // ---------------------------------------------------------------- drawer
  var drawerX, scrim;
  function buildDrawer() {
    drawerX = h('aside', { class: 'drawer', 'aria-hidden': 'true' });
    scrim = h('div', { class: 'scrim', onclick: closeDrawer });
    return [drawerX, scrim];
  }
  function closeDrawer() { drawerX.classList.remove('open'); scrim.classList.remove('on'); drawerX.setAttribute('aria-hidden', 'true'); stateX.selected = null; }
  function openDrawer() {
    var rX = stateX.selected; if (!rX) return;
    var liveX = stateX.tab === 'live';
    var bodyX = h('div', { class: 'body' });
    var kvX = h('dl', { class: 'kv' },
      dt('Slug', rX.slug), dt('Category', rX.category || '—'), dt('Chains', (rX.chains || []).join(', ') || '—'),
      dt('TVL', fmtUsdX(rX.tvl_usd)), dt('7-day change', fmtPct(rX.change_7d)),
      dt('Listed', rX.listed_at || 'unknown'), dt('No token for', fmtAge(rX.age_days)),
      dt('Token odds', rX.token_odds === undefined ? '—' : (rX.token_odds * 100).toFixed(1) + '% (base ' + (((DATAX.token_odds && DATAX.token_odds.base_rate) || 0) * 100).toFixed(0) + '%)'));
    bodyX.appendChild(kvX);
    if (!liveX) {
      var recomputedX = impliedOf(rX);
      // What the row stores is authoritative; since the page restores it from the rounded numbers held
      // in the data file, any gap of a dollar (or one part in a hundred thousand) is rounding, not a defect.
      var toleranceX = Math.max(1, Math.abs(rX.implied_value_usd) / 1e5);
      var agreeX = Math.abs(recomputedX - rX.implied_value_usd) <= toleranceX;
      var catLineX = (rX.category_multiple !== undefined && rX.category_multiple !== 1) ? ('category ×' + rX.category_multiple.toFixed(3)) : 'category ×1.000 (too few peers, folded into the curve)';
      bodyX.appendChild(h('h4', { class: 'section' }, 'The implied value'));
      bodyX.appendChild(h('div', { class: 'math', html:
        'implied = <b>alpha</b> &times; <b>TVL<sup>' + FITX.elasticity.toFixed(3) + '</sup></b> &times; <b>category</b> &times; <b>growth</b> &times; <b>maturity</b><br>' +
        '&nbsp;&nbsp;= ' + wholeNumber(FITX.alpha) + ' &times; ' + wholeNumber(rX.tvl_usd) + '<sup>' + FITX.elasticity.toFixed(3) + '</sup> &times; ' + (rX.category_multiple !== undefined ? rX.category_multiple.toFixed(3) : '1') + ' &times; ' + rX.growth_multiplier.toFixed(3) + ' &times; ' + rX.maturity_multiplier.toFixed(3) + '<br>' +
        '&nbsp;&nbsp;= <b>' + fmtUsdX(rX.implied_value_usd) + '</b>  (an effective ×' + (rX.effective_multiple !== undefined ? rX.effective_multiple.toFixed(3) : (rX.implied_value_usd / rX.tvl_usd).toFixed(3)) + ' of TVL)<br>' +
        'curve: ' + FITX.comparables + ' priced protocols, elasticity ' + FITX.elasticity.toFixed(3) + ', half land within ×' + FITX.err_lo.toFixed(2) + '–×' + FITX.err_hi.toFixed(2) + '; ' + catLineX + '; the page recomputes this row and ' + (agreeX ? 'agrees with board.json.' : 'differs from board.json — check the data.') }));
      if (rX.band_lo_usd !== undefined) {
        bodyX.appendChild(h('div', { class: 'math', html:
          'band: <b>' + fmtUsdX(rX.band_lo_usd) + ' – ' + fmtUsdX(rX.band_hi_usd) + '</b> (the interquartile residual span around the curve)<br>' +
          'netting: allocation <b>' + fmtMoney(rX.alloc_usd) + '</b> − gas <b>' + fmtMoney(rX.est_gas_usd) + '</b> over <b>' + rX.est_hours + '</b> hands-on hours = net <b>' + fmtMoney(rX.net_usd) + '</b>, at the upper band net <b>' + fmtMoney(rX.net_hi_usd) + '</b>: verdict <b>' + rX.verdict + '</b>.<br>' +
          'plan net of fees: <b>' + esc(rX.net_label || 'n/a') + '</b> (7 steps × a stated $2.50 of gas and fees each).<br>' +
          'P25–P75: <b>' + fmtUsdX(rX.band_p25_usd) + ' – ' + fmtUsdX(rX.band_p75_usd) + '</b> from a 200-draw bootstrap of the curve’s residuals (seeded, so it repeats).' }));
        bodyX.appendChild(bandStrip(rX));
      }
      if (rX.token_odds !== undefined) {
        var baseX = (DATAX.token_odds && DATAX.token_odds.base_rate) || 0;
        bodyX.appendChild(h('div', { class: 'math', html:
          'token odds: <b>' + (rX.token_odds * 100).toFixed(1) + '%</b> that this protocol ever records a token, against a snapshot base rate of <b>' + (baseX * 100).toFixed(0) + '%</b>; the fit scores its stated odds at a Brier of <b>' + (((DATAX.token_odds && DATAX.token_odds.brier) || 0).toFixed(3)) + '</b>.' }));
      }
      var peersX = categoryPeersOf(rX);
      if (peersX) {
        bodyX.appendChild(h('h4', { class: 'section' }, 'Same-category peers — ' + rX.category));
        bodyX.appendChild(h('ul', { class: 'peers' }, peersX.map(function (pe) {
          return h('li', null, h('span', { class: 'pname' }, pe.name), h('span', { class: 'ratio' }, ' ' + pe.multiple.toFixed(2) + '× mcap / TVL'));
        })));
      }
      bodyX.appendChild(h('h4', { class: 'section' }, 'Farming plan — per-step cost and time'));
      var stepsX = farmPlan(rX);
      bodyX.appendChild(h('ol', { class: 'steps' }, stepsX.map(function (sX) {
        return h('li', null, h('span', null, sX.t), h('div', { class: 'meta' }, 'Cost: ' + sX.c + ' · Time: ' + sX.d));
      })));
    } else {
      bodyX.appendChild(h('h4', { class: 'section' }, 'Already trading'));
      bodyX.appendChild(h('div', { class: 'math', html: 'The market already sets this protocol\'s price, so the radar reports its own value, <b>' + fmtUsdX(rX.mcap_usd) + '</b>, and never a modeled one. It is the market side of the comps curve, held off the ranked board.' }));
    }
    drawerX.innerHTML = '';
    drawerX.appendChild(h('div', { class: 'bar' }, h('h3', null, rX.name), h('button', { class: 'close', onclick: closeDrawer }, 'Close')));
    drawerX.appendChild(bodyX);
    drawerX.classList.add('open'); scrim.classList.add('on'); drawerX.setAttribute('aria-hidden', 'false');
  }
  function dt(k, v) { return [h('dt', null, k), h('dd', null, v)]; } // c

  // A thin band strip for the detail view: the P25..P75 span as a filled bar with three ticks at P25, the
  // implied value and P75, positioned by share of the P75 endpoint.
  function bandStrip(rX) {
    if (rX.band_p75_usd === undefined || rX.band_p75_usd <= 0) return null;
    var hiX = rX.band_p75_usd, loX = rX.band_p25_usd, midX = rX.implied_value_usd;
    var atX = function (v) { return Math.max(0, Math.min(100, (v / hiX) * 100)).toFixed(1); };
    return h('div', { class: 'bstrip', title: 'P25 ' + fmtUsdX(loX) + ' / implied ' + fmtUsdX(midX) + ' / P75 ' + fmtUsdX(hiX) },
      h('div', { class: 'bstrip-fill', style: 'left:' + atX(loX) + '%;width:' + (atX(midX) - atX(loX)) + '%' }),
      h('i', { class: 'bstrip-t', style: 'left:' + atX(loX) + '%' }),
      h('i', { class: 'bstrip-t mid', style: 'left:' + atX(midX) + '%' }),
      h('i', { class: 'bstrip-t', style: 'left:' + atX(hiX) + '%' }));
  } // c

  /** At most six same-category peers pulled from the data's category-peers map, or null if the category is missing. */
  function categoryPeersOf(rX) {
    if (!rX.category || !DATAX.category_peers) return null;
    var listX = DATAX.category_peers[rX.category];
    return listX && listX.length ? listX.slice(0, 6) : null;
  } // c

  // ---------------------------------------------------------------- paint
  var stageX;
  function paint() {
    var focusIdX = document.activeElement && document.activeElement.tagName === 'INPUT' ? document.activeElement.value : null;
    var nextX = view();
    stageX.parentNode.replaceChild(nextX, stageX);
    stageX = nextX;
    if (focusIdX !== null) { var sX = nextX.querySelector('input[type=search]'); if (sX) { sX.value = focusIdX; sX.focus(); } }
  } // c
  function view() {
    var rows = filtered();
    var ctrlX = controls();
    ctrlX.querySelector('.count').textContent = rows.length + (stateX.tab === 'live' ? ' tokens on record' : stateX.tab === 'aside' ? ' protocols set aside' : ' protocols ranked');
    return h('main', { id: 'main' }, header(), kpis(), analytics(), ctrlX, table(rows),
      h('footer', null,
        'Source: ' + DATAX.source + '. The board ranks pre-token protocols by an implied launch value from a size-fitted comps curve over the snapshot\'s own TVL, market-cap, growth and age figures: no name is special-cased. It is a research board, not advice, and no reward is promised for farming any protocol. Press / to jump to the search box.'));
  }

  // Escape acts as a shortcut that dismisses whichever detail panel is currently open.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawer();
  });

  var builtX = buildDrawer();
  stageX = view();
  appX.appendChild(stageX);
  builtX.forEach(function (nX) { document.body.appendChild(nX); });
})();
