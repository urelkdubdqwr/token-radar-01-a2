// The token radarX model: takes one snapshotX of the protocol set and yields a single ranked boardX.
//
// The boardX includes every slug found in the snapshotX's watchlist (treated as a floor, never a cap)
// and appends the pre-token protocols underneath it: those earlyX rows the radarX is built to surface.
// A protocol counts as pre-token when its record has no token attached (no market cap, no CoinGecko
// id, no symbol), and gets excluded when it is a wrapped, staked or bridged spin-off of one that
// trades, a versioned pool, or a bridge/LST/CEX.
//
// The impliedX value is derived solely from the snapshotX's own numbers, using the market's own size
// curve:
//
//   baseX       = alpha x tvl_usd ^ elasticity x categoryMultipleX     (the comps curve)
//   growthMultX = 1 + (clamp(change_7d, -40, 60) / 100) x 0.6
//   maturityX   = 0.6 + min(age_days, 1095) / 1095 x 0.4               (age_days unknown: 365)
//   impliedX    = max(1, round(baseX x growthMultX x maturityX))
//
// alpha and elasticity come from a least-squares fit of log(mcap) against log(tvl) over every
// protocol the snapshotX already prices. As TVL rises the market pays less per dollar (elasticity <
// 1), so a $3B protocol is not a $50M one multiplied by sixty. A categoryMultipleX is the median
// log-residual of that category's liveX peersX, shrunk toward 1 so a thin category cannot swing a
// row. No protocol name is ever special-cased: the same function scores every row.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

/** A single protocol entryX in the snapshotX: precisely the ten fields the sealed input holds. */
export interface SnapshotProtocolX {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The snapshotX document in full. */
export interface SnapshotX {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocolX[];
  watchlist: string[];
}

/** The model's growthX and maturityX knobs, as the dashboard reports them and the sandbox can adjust. */
export interface ModelConstantsX {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_shrink: number;
}
// c
export const MODELX: ModelConstantsX = {
  growth_weight: 0.6,
  growth_floor: -40,
  growth_cap: 60,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_shrink: 4,
};

/** How the model identifies itself: the dashboard displays it and the rule text cites it. */
export const MODEL_VERSIONX = 'radar-4-oos-netted-comps';

/**
 * The fitted calibration: the size-adjusted comps curve used to value a launch on the board,
 * pulled from the snapshot's own live-token protocols. `alpha` and `elasticity` give the level
 * and the exponent of the power law mcap ~ alpha x tvl^elasticity; `err_lo`..`err_hi` is the
 * interquartile window that a priced protocol's mcap tends to fall within around that curve;
 * `by_category` carries each category's shrunk multiplier alongside its peer count.
 */
export interface CalibrationX {
  alpha: number;
  elasticity: number;
  comparables: number;
  err_lo: number;
  err_hi: number;
  median_abs_error: number;
  by_category: Record<string, { multiple: number; peers: number }>;
  min_peers: number;
  out_of_sample: OutOfSampleX;
}

/**
 * The curve's out-of-sample check, entirely deterministic and drawn from snapshot numbers alone:
 *   miss_median       the leave-one-out median miss — refit over every other priced protocol, then
 *                     forecast each held-out protocol's cap from its TVL, and take the larger of the
 *                     prediction and the real value over the smaller; the median across the held-out
 *                     protocols gives this figure.
 *   flat_miss_median  the same leave-one-out median against a flat baseline that guesses a held-out
 *                     cap as the remaining protocols' median market-cap-over-TVL multiple times TVL.
 *   tested            how many priced protocols the leave-one-out procedure set aside.
 *   split_miss        a time-based split: train on the earlier half (ordered by listed_at, undated
 *                     last) and then predict the
 *                     newer half; the median miss over the newer half is this number.
 *   split_flat_miss   the flat baseline's median miss on that same newer half.
 *   split_tested      how many protocols the time split held out.
 */
export interface OutOfSampleX {
  miss_median: number;
  flat_miss_median: number;
  tested: number;
  split_miss: number;
  split_flat_miss: number;
  split_tested: number;
}

const MIN_PEERSX = 3;

/** Middle value of a set of finite numbers; null if there are none. */
function medianX(values: number[]): number | null {
  if (values.length === 0) return null;
  const sX = [...values].sort((aX, bX) => aX - bX);
  const midX = sX.length >> 1;
  return sX.length % 2 === 1 ? sX[midX]! : (sX[midX - 1]! + sX[midX]!) / 2;
}

/** A least-squares log-log fit's level `aX` and exponent `bX` (mcap ~ e^aX x tvl^bX), or null when points are too few. */
function fitLogLogX(xsX: number[], ysX: number[]): { a: number; b: number } | null {
  const nX = xsX.length;
  if (nX < 2) return null;
  const mxX = xsX.reduce((sX, xX) => sX + xX, 0) / nX;
  const myX = ysX.reduce((sX, yX) => sX + yX, 0) / nX;
  let sxxX = 0;
  let sxyX = 0;
  for (let i = 0; i < nX; i++) {
    sxxX += (xsX[i]! - mxX) * (xsX[i]! - mxX);
    sxyX += (xsX[i]! - mxX) * (ysX[i]! - myX);
  }
  if (sxxX <= 0) return null;
  const bX = sxyX / sxxX;
  return { a: myX - bX * mxX, b: bX };
}

/**
 * How badly a prediction diverges from an actual, expressed as a ratio no smaller than 1: whichever is larger divided by whichever is smaller.
 * A predicted value at or below zero counts as a total miss of a real cap: Infinity if the actual is positive.
 */
function missRatioX(predicted: number, actual: number): number {
  if (!Number.isFinite(predicted) || predicted <= 0) return actual > 0 ? Infinity : 1;
  if (!Number.isFinite(actual) || actual <= 0) return 1;
  return Math.max(predicted, actual) / Math.min(predicted, actual);
}
/**
 * The curve refit against a set of priced protocols, expressed as a predictor `tvl -> mcap`, or null
 * when the set is too small to fit. Each value derives from the protocols handed in; none of it is
 * random or clock-dependent.
 */
function curvePredictorX(heldX: SnapshotProtocolX[]): ((tvl: number) => number) | null {
  const xsX = heldX.map((pX) => Math.log(pX.tvl_usd));
  const ysX = heldX.map((pX) => Math.log(pX.mcap_usd as number));
  const fitX = fitLogLogX(xsX, ysX);
  if (fitX === null) return null;
  return (tvl: number) => Math.exp(fitX.aX + fitX.bX * Math.log(Math.max(tvl, 1)));
}

/** The flat baseline predictor: the set's median multiple of market cap over TVL, scaled by a TVL. */
function flatPredictorX(heldX: SnapshotProtocolX[]): ((tvl: number) => number) | null {
  const mX = medianX(heldX.map((pX) => (pX.mcap_usd as number) / pX.tvl_usd));
  if (mX === null) return null;
  return (tvl: number) => mX * tvl;
}

/** The median miss of a predictor across held-out protocols, or null when nothing can be scored. */
function medianMissX(heldXOut: SnapshotProtocolX[], predictX: (tvl: number) => number): number | null {
  return medianX(heldXOut.map((pX) => missRatioX(predictX(pX.tvl_usd), pX.mcap_usd as number)));
}

/**
 * The size-fitted comps curve, fitted over the snapshot's own priced protocols. Least squares on
 * log(mcap) versus log(tvl) yields the level and the elasticity; the residuals yield the band along
 * with each category's shrunk multiplier. Every input is a figure the snapshot carries; nothing is
 * hardcoded.
 */
export function calibrateX(snapshotX: SnapshotX, model: ModelConstantsX = MODELX): CalibrationX {
  const pairsX = snapshotX.protocols.filter((pX) => pX.mcap_usd !== null && pX.mcap_usd > 0 && pX.tvl_usd > 0);
  const nX = pairsX.length;
  const xsX = pairsX.map((pX) => Math.log(pX.tvl_usd));
  const ysX = pairsX.map((pX) => Math.log(pX.mcap_usd as number));
  let aX = 0;
  let bX = 1;
  if (nX >= 3) {
    const mxX = xsX.reduce((sX, xX) => sX + xX, 0) / nX;
    const myX = ysX.reduce((sX, yX) => sX + yX, 0) / nX;
    let sxxX = 0;
    let sxyX = 0;
    for (let i = 0; i < nX; i++) {
      sxxX += (xsX[i]! - mxX) * (xsX[i]! - mxX);
      sxyX += (xsX[i]! - mxX) * (ysX[i]! - myX);
    }
    bX = sxxX > 0 ? sxyX / sxxX : 1;
    aX = myX - bX * mxX;
  }
  const residualX = pairsX.map((_pX, i) => ysX[i]! - (aX + bX * xsX[i]!));
  const sortedX = [...residualX].sort((xX, yX) => xX - yX);
  const atX = (t: number): number => (sortedX.length === 0 ? 0 : sortedX[Math.min(sortedX.length - 1, Math.max(0, Math.round(t * (sortedX.length - 1))))]!);
  const byCatX = new Map<string, number[]>();
  pairsX.forEach((pX, i) => {
    const keyX = pX.category ?? 'unlisted';
    const listX = byCatX.get(keyX);
    if (listX === undefined) byCatX.set(keyX, [residualX[i]!]);
    else listX.push(residualX[i]!);
  });
  const byCategoryX: Record<string, { multiple: number; peers: number }> = {};
  for (const [keyX, listX] of byCatX) {
    if (listX.length < MIN_PEERSX) continue;
    const mX = medianX(listX);
    if (mX === null) continue;
    const shrinkX = listX.length / (listX.length + model.category_shrink);
    byCategoryX[keyX] = { multiple: Math.exp(mX * shrinkX), peers: listX.length };
  }
  return {
    alpha: Math.exp(aX),
    elasticity: bX,
    comparables: nX,
    err_lo: Math.exp(atX(0.25)),
    err_hi: Math.exp(atX(0.75)),
    median_abs_error: Math.exp(medianX(residualX.map((rX) => Math.abs(rX))) ?? 0),
    by_category: byCategoryX,
    min_peers: MIN_PEERSX,
    out_of_sample: outOfSampleX(pairsX),
  };
}

/**
 * Out-of-sample check for the curve, evaluated using the priced protocols alone. The leave-one-out side
 * refits without each protocol one at a time and grades the excluded one; the time-split side fits the
 * older protocols (ordered by listed_at, with undated ones pushed to the end) and grades the newer half.
 * Both are deterministic, and next to each sits a flat baseline: the held-out set's peer median
 * market-cap-over-TVL multiple applied to the TVL.
 */
function outOfSampleX(pairs: SnapshotProtocolX[]): OutOfSampleX {
  const missX: number[] = [];
  const flatMissX: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const heldX = pairs[i]!;
    const othersX = pairs.filter((_p, j) => j !== i);
    const predictX = curvePredictorX(othersX);
    const flat = flatPredictorX(othersX);
    if (predictX !== null) missX.push(missRatioX(predictX(heldX.tvl_usd), heldX.mcap_usd as number));
    if (flat !== null) flatMissX.push(missRatioX(flat(heldX.tvl_usd), heldX.mcap_usd as number));
  }
  const missMedianX = medianX(missX);
  const flatMissMedianX = medianX(flatMissX);

  // Time split: fit on the older half, hold out the newer half. Undated protocols go last, ordered by slug.
  const datedX = [...pairs].sort((pX, qX) => {
    const pdX = pX.listed_at;
    const qdX = qX.listed_at;
    if (pdX !== null && qdX !== null && pdX !== qdX) return pdX < qdX ? -1 : 1;
    if (pdX === null && qdX !== null) return 1;
    if (pdX !== null && qdX === null) return -1;
    return pX.slug < qX.slug ? -1 : pX.slug > qX.slug ? 1 : 0;
  });
  const cutX = Math.floor(datedX.length / 2);
  const olderX = datedX.slice(0, cutX);
  const newerX = datedX.slice(cutX);
  const splitPredictX = curvePredictorX(olderX);
  const splitFlatX = flatPredictorX(olderX);
  const splitMissX = splitPredictX === null ? null : medianMissX(newerX, splitPredictX);
  const splitFlatMissX = splitFlatX === null ? null : medianMissX(newerX, splitFlatX);

  return {
    miss_median: missMedianX === null ? 0 : Math.round(missMedianX * 1000) / 1000,
    flat_miss_median: flatMissMedianX === null ? 0 : Math.round(flatMissMedianX * 1000) / 1000,
    tested: missX.length,
    split_miss: splitMissX === null ? 0 : Math.round(splitMissX * 1000) / 1000,
    split_flat_miss: splitFlatMissX === null ? 0 : Math.round(splitFlatMissX * 1000) / 1000,
    split_tested: newerX.length,
  }; // c
} // c

/** Which multiple a calibration assigns to a protocol's category; falls back to 1 when peers are too few. */
export function categoryMultipleX(calX: CalibrationX, category: string | null): number {
  const hitX = calX.by_category[category ?? 'unlisted'];
  return hitX !== undefined ? hitX.multiple : 1; // c
} // c

/** What the comps curve says a protocol is worth given its `tvlUsd` and category multiple `catMultX`. */
export function baseValueX(tvlUsd: number, catMultX: number, calX: CalibrationX): number {
  return calX.alpha * Math.pow(Math.max(tvlUsd, 1), calX.elasticity) * catMultX;
} // c

/** How many watchlist-external early rows the radarX keeps, scaled by TVL (the snapshotX holds many more). */
export const EARLY_ROWSX = 210;

/**
 * Stated openly as an assumption: the slice of a launch's impliedX value the radarX attributes to early users.
 * No on-chain source pins down a launch's eventual airdrop, so this figure is declared here in the open and
 * applied identically to every row; edit it once, and the entire board's netted economics shift accordingly.
 */
export const AIRDROP_SHAREX = 0.10;

/** One farmX step: what to do, the associated cost, and the time it consumes. */
export interface FarmStepX {
  text: string;
  cost: string;
  time: string;
}

/** A single entry of board.json: one ranked line on the board. */
export interface BoardRowX {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    elasticity: number;
    category_multiple: number;
    effective_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  /** Those same multipliers kept unrounded so the dashboard can recompute a row's value precisely. */
  model_full: {
    category_multiple: number;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
  band_lo_usd: number;
  band_hi_usd: number;
  position_usd: number;
  est_gas_usd: number;
  est_hours: number;
  alloc_usd: number;
  net_usd: number;
  net_hi_usd: number;
  net_per_hour: number;
  verdictX: 'farmX' | 'marginal' | 'skip';
  farm_steps: string[];
}

/**
 * The netted farmX economics for one ranked entry: the plan's outlay (a positionX plus its gasX and hoursX) minus
 * modelled early-user allocation, with the band the implied value carries. `alloc_usd` is the disclosed
 * share of the implied value, credited against the protocol's own TVL; `net_usd` nets the two, and
 * `verdictX` is the plain reading. Everything unwinds from the snapshotX and the model, nothing else.
 */
export interface RowEconomicsX {
  band_lo_usd: number;
  band_hi_usd: number;
  position_usd: number;
  est_gas_usd: number;
  est_hours: number;
  alloc_usd: number;
  net_usd: number;
  net_hi_usd: number;
  net_per_hour: number;
  verdictX: 'farm' | 'marginal' | 'skip';
}

/** The dashboard's tight per-row rendering, carrying the farm plan built on the page itself. */
export interface RadarRowX {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  effective_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  band_lo_usd: number;
  band_hi_usd: number;
  position_usd: number;
  est_gas_usd: number;
  est_hours: number;
  alloc_usd: number;
  net_usd: number;
  net_hi_usd: number;
  net_per_hour: number;
  verdictX: 'farm' | 'marginal' | 'skip';
}

/** A live-token protocol: it already trades, so the boardX displays the market's value, not a model's. */
export interface LiveRowX {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
} // c

/** A pre-token protocol the house rule parks to the side, noting why the radar keeps it off the board. */
export interface SetAsideRowX {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/** The fitted curve, spelled out the way the dashboard presents it. */
export interface FitSummaryX {
  alpha: number;
  elasticity: number;
  comparables: number;
  err_lo: number;
  err_hi: number;
  median_abs_error: number;
  categories: number;
  out_of_sample: OutOfSampleX;
}

/** The full payload the dashboard relies on: the board, the live set, the set-aside set, plus the model it runs. */
export interface RadarDataX {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstantsX;
  model_version: string;
  fit: FitSummaryX;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  pre_token_size: number;
  live_size: number;
  set_aside_size: number;
  rows: RadarRowX[];
  live: LiveRowX[];
  set_aside: SetAsideRowX[];
  category_peers: Record<string, { name: string; multiple: number }[]>;
}

/** The reasons a snapshot falls outside what this model is able to score. */
export class SnapshotErrorX extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotErrorX';
  }
}

const DAY_MSX = 86_400_000;

/** Coerce to a finite number, otherwise hand back the fallback. */
function finiteX(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole-day gap from listedAt up to asOf, floored at zero; returns null if a date is missing or unparseable. */
export function ageDaysX(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const aX = Date.parse(`${asOf}T00:00:00Z`);
  const bX = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(aX) || !Number.isFinite(bX)) return null;
  return Math.max(0, Math.floor((aX - bX) / DAY_MSX));
}

/** The set of multipliers plus the implied value a protocol earns under model with the fitted curve. */
export function impliedValueX(protocol: SnapshotProtocolX, asOf: string, model: ModelConstantsX, calX: CalibrationX): { implied: number; catMult: number; effective: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const ageX = ageDaysX(asOf, protocol.listed_at);
  const rawGrowthX = finiteX(protocol.change_7d, 0);
  const growthPctX = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowthX));
  const growthMultX = 1 + (growthPctX / 100) * model.growth_weight;
  const ageForModelX = ageX ?? model.unknown_age_days;
  const maturityMultX = model.maturity_floor + (Math.min(Math.max(ageForModelX, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const catMultX = categoryMultipleX(calX, protocol.category);
  const baseX = baseValueX(protocol.tvl_usd, catMultX, calX);
  const impliedX = Math.max(1, Math.round(baseX * growthMultX * maturityMultX));
  const effectiveX = protocol.tvl_usd > 0 ? impliedX / protocol.tvl_usd : 0;
  return { implied: impliedX, catMult: catMultX, effective: effectiveX, growthPct: growthPctX, growthMult: growthMultX, maturityMult: maturityMultX, age: ageX };
}

/** DefiLlama's version-tag heuristic: a name that ends with a release marker belongs to another protocol's pool. */
const VERSIONEDX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A wrapped or staked product repeats that in the protocol's own name. */
const WRAPPED_STAKEDX = /\b(wrapped|staked|staking)\b/i;

/** The venue names the house rule strips out of the watchlist. */
const EXCHANGESX = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** The categories the house rule filters away: bridges, liquid staking, and centralised exchanges. */
const SET_ASIDE_CATSX = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Does this protocol show no token whatsoever? */
export function isPreTokenX(p: SnapshotProtocolX): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Why the radar keeps a protocol off the ranked board, or null if it can rank it. */
export function exclusionReasonX(p: SnapshotProtocolX): string | null {
  if (!isPreTokenX(p)) return 'token already trades';
  if (SET_ASIDE_CATSX.has(p.category ?? '')) return 'a bridge, a liquid-staking token or an exchange';
  if (VERSIONEDX.test(p.name)) return 'a versioned pool of another protocol';
  if (WRAPPED_STAKEDX.test(p.name)) return 'a wrapped or staked product of a token that trades';
  const lowerX = p.name.toLowerCase();
  if (EXCHANGESX.some((e) => lowerX.startsWith(e.toLowerCase()))) return 'a product of an exchange';
  return null;
}

/** Is this protocol one the board may rank: pre-token, and not set aside by the house rule? */
export function isRankableX(p: SnapshotProtocolX): boolean {
  return exclusionReasonX(p) === null;
}

/** Map the snapshot's protocols keyed by slug. */
function bySlugX(protocolsX: SnapshotProtocolX[]): Map<string, SnapshotProtocolX> {
  return new Map(protocolsX.map((p) => [p.slug, p]));
}

const roundX = (nX: number, places: number): number => {
  const fX = 10 ** places;
  return Math.round(nX * fX) / fX;
};

/** The protocols the board ranks, strongest first, numbered 1..n. */
export function buildBoardX(snapshotX: SnapshotX, model: ModelConstantsX = MODELX): BoardRowX[] {
  const indexX = bySlugX(snapshotX.protocols);
  const chosenX = new Map<string, SnapshotProtocolX>();
  // The watchlist is the floor, never a ceiling: every slug, even one the snapshot no longer carries.
  for (const slug of snapshotX.watchlist) {
    const p = indexX.get(slug);
    if (p !== undefined) chosenX.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, by TVL, capped. Never replaces a watchlist row.
  const earlyX = snapshotX.protocols
    .filter((p) => !chosenX.has(p.slug) && isRankableX(p))
    .sort((aX, bX) => bX.tvl_usd - aX.tvl_usd || (aX.slug < bX.slug ? -1 : aX.slug > bX.slug ? 1 : 0))
    .slice(0, EARLY_ROWSX);
  for (const p of earlyX) chosenX.set(p.slug, p);

  const calX = calibrateX(snapshotX, model);
  const scoredX = [...chosenX.values()].map((p) => ({ p, r: impliedValueX(p, snapshotX.as_of, model, calX) }));
  scoredX.sort((aX, bX) => bX.r.implied - aX.r.implied || (aX.p.slug < bX.p.slug ? -1 : aX.p.slug > bX.p.slug ? 1 : 0));
  return scoredX.map(({ p: pX, r: rX }, i) => {
    const econX = rowEconomicsX(pX, rX.implied, rX.effective, rX.age, calX);
    return {
    rank: i + 1,
    slug: pX.slug,
    name: pX.name,
    category: pX.category,
    chains: pX.chains,
    tvl_usd: pX.tvl_usd,
    change_7d: pX.change_7d,
    mcap_usd: pX.mcap_usd,
    listed_at: pX.listed_at,
    gecko_id: pX.gecko_id,
    symbol: pX.symbol,
    token_status: 'pre-token',
    age_days: rX.age,
    implied_value_usd: rX.implied,
    model: {
      elasticity: roundX(calX.elasticity, 3),
      category_multiple: roundX(rX.catMult, 4),
      effective_multiple: roundX(rX.effective, 4),
      growth_pct: rX.growthPct,
      growth_multiplier: roundX(rX.growthMult, 4),
      maturity_multiplier: roundX(rX.maturityMult, 4),
      age_days: rX.age,
    },
    model_full: {
      category_multiple: rX.catMult,
      growth_multiplier: rX.growthMult,
      maturity_multiplier: rX.maturityMult,
    },
    band_lo_usd: econX.band_lo_usd,
    band_hi_usd: econX.band_hi_usd,
    position_usd: econX.position_usd,
    est_gas_usd: econX.est_gas_usd,
    est_hours: econX.est_hours,
    alloc_usd: econX.alloc_usd,
    net_usd: econX.net_usd,
    net_hi_usd: econX.net_hi_usd,
    net_per_hour: econX.net_per_hour,
    verdict: econX.verdict,
    farm_steps: farmStepsX(pX, rX.age, rX.implied, econX).map(stepTextX),
  };
  });
}

/** One step flattened to a string: its action, then cost and time, kept inside the gate's 20..600 chars. */
export function stepTextX(step: FarmStepX): string {
  let sX = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (sX.length > 600) sX = `${sX.slice(0, 596)}...`;
  if (sX.length < 20) sX = `${sX} Keep the position open and see the protocol's own page.`;
  return sX;
}

/** The leading chain a protocol lists, otherwise a plain placeholder phrase. */
function chainOfX(pX: SnapshotProtocolX): string {
  return pX.chains.length > 0 ? pX.chains[0]! : 'its main chain';
}

/**
 * The capital a single farm position requires, derived from the protocol's own TVL. A stated assumption:
 * this is a serious-farmer scale, where a position is big enough for its modelled allocation to cover the
 * gas and hours it consumes. That same tier drives the farm-step texts and the netting.
 */
function capitalForX(pX: SnapshotProtocolX): number {
  if (pX.tvl_usd >= 5_000_000_000) return 2500;
  if (pX.tvl_usd >= 1_000_000_000) return 1500;
  if (pX.tvl_usd >= 100_000_000) return 1000;
  return 500;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysForX(ageX: number | null): number {
  if (ageX === null) return 30;
  if (ageX < 180) return 60;
  if (ageX < 365) return 45;
  return 30;
}

/** The whole weeks a hold window spans, no fewer than one. */
function holdWeeksX(holdX: number): number {
  return Math.max(1, Math.round(holdX / 7)); // c
}

/** The setup gas the plan quotes: a tier chosen by position size. */
function setupGasForX(capitalX: number): number {
  return capitalX >= 1500 ? 8 : 4; // c
}

/**
 * A single ranked row's netted farm economics, computed from the snapshot and the model alone. The modelled
 * allocation is the disclosed `AIRDROP_SHAREX` of the implied value (the implied-value-over-TVL multiple,
 * times the position and the share); the cost is the plan's own position, gas and hours. `band_hi_usd`
 * re-runs the same netting using the calibration's upper residual factor in place of the fitted value.
 */
export function rowEconomicsX(pX: SnapshotProtocolX, impliedX: number, effectiveX: number, ageX: number | null, calX: CalibrationX): RowEconomicsX {
  const bandLoX = Math.max(1, Math.round(impliedX * calX.err_lo));
  const bandHiX = Math.max(1, Math.round(impliedX * calX.err_hi));
  const positionX = capitalForX(pX);
  const holdX = holdDaysForX(ageX);
  const weeksX = holdWeeksX(holdX);
  const gasX = Math.round(setupGasForX(positionX) + 2 * weeksX);
  const hoursX = Math.round((20 + 10 * Math.min(weeksX, 12) + 15) / 60 * 10) / 10;
  const allocX = positionX * effectiveX * AIRDROP_SHAREX;
  const allocHiX = positionX * (pX.tvl_usd > 0 ? bandHiX / pX.tvl_usd : 0) * AIRDROP_SHAREX;
  const netX = Math.round(allocX - gasX);
  const netHiX = Math.round(allocHiX - gasX);
  const netPerHourX = hoursX > 0 ? Math.round((netX / hoursX) * 100) / 100 : 0;
  // The call comes straight from the model's own uncertainty band rather than some multiple of gas: `farm`
  // if the point estimate nets positive (costs are covered); `marginal` if the point estimate nets zero or
  // below but the top of the band still nets positive (the position can cover costs inside the stated
  // uncertainty); `skip` if even the band's top nets zero or below. Nothing gets labeled `farm` on a hope
  // the band by itself wouldn't back up.
  const verdictX: RowEconomicsX['verdict'] = netX > 0 ? 'farm' : netHiX > 0 ? 'marginal' : 'skip';
  return {
    band_lo_usd: bandLoX,
    band_hi_usd: bandHiX,
    position_usd: positionX,
    est_gas_usd: gasX,
    est_hours: hoursX,
    alloc_usd: Math.round(allocX),
    net_usd: netX,
    net_hi_usd: netHiX,
    net_per_hour: netPerHourX,
    verdict: verdictX,
  };
}

/** The category's single action, phrased the way a farmer could actually carry it out. */
function actionForX(pX: SnapshotProtocolX, capitalX: number, chainX: string): string {
  const cX = (pX.category ?? '').toLowerCase();
  const name = pX.name;
  if (cX.includes('lend') || cX.includes('cdp') || cX.includes('collateral')) return `Supply $${capitalX} of USDC to ${name} on ${chainX} and keep the position open.`;
  if (cX.includes('dex') || cX.includes('yield') || cX.includes('leveraged farm')) return `Provide $${capitalX} of liquidity to ${name}'s main pool on ${chainX} and keep the position open.`;
  if (cX.includes('bridge')) return `Bridge $${capitalX} of USDC to ${chainX} through ${name} and use the bridged funds in its app.`;
  if (cX.includes('staking') || cX.includes('restak')) return `Stake $${capitalX} of the chain's staking asset through ${name} and keep the receipt.`;
  if (cX.includes('perpetual') || cX.includes('derivative')) return `Deposit $${capitalX} of USDC as margin on ${name} and open one small hedge.`;
  if (cX.includes('prediction')) return `Fund $${capitalX} and place one market position on ${name}.`;
  if (cX.includes('curator') || cX.includes('allocator')) return `Deposit $${capitalX} into a ${name} vault on ${chainX} and keep the shares.`;
  if (cX.includes('stable')) return `Mint or deposit $${capitalX} of the stable asset through ${name} on ${chainX}.`;
  if (cX.includes('rwa')) return `Mint $${capitalX} of the protocol's yield asset on ${chainX} and hold it.`;
  if (cX.includes('insurance')) return `Buy $${capitalX} of cover from ${name} on ${chainX} and keep the policy.`;
  return `Deposit $${capitalX} of USDC into ${name} on ${chainX} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each a move paired with a cost and a duration, carrying that row's
 * own figures (position, gas, hours, modelled allocation and verdict). The plan is built from the
 * protocol's record (category, chains, TVL, age) plus its economics, never from any list of names.
 */
export function farmStepsX(pX: SnapshotProtocolX, ageX: number | null, impliedX: number, econX: RowEconomicsX): FarmStepX[] {
  const chainX = chainOfX(pX);
  const capitalX = econX.position_usd;
  const holdX = holdDaysForX(ageX);
  const weeksX = holdWeeksX(holdX);
  const actionX = actionForX(pX, capitalX, chainX);
  return [
    {
      text: `Stand up a brand-new wallet that carries nothing but the money you intend to farm, and store its recovery phrase somewhere off the internet.`,
      cost: 'below $3 in gas to send the very first transaction',
      time: '5 minutes',
    },
    {
      text: `Start a $${capitalX} position on ${chainX}: ${actionX}`,
      cost: `$${capitalX} of capital plus roughly $${setupGasForX(capitalX)} of gas`,
      time: 'about 20 minutes to get going',
    },
    {
      text: `Complete a single qualifying move every week — a deposit, a borrow, a swap or a vote all count.`,
      cost: 'roughly $2 of gas per week',
      time: 'roughly 10 minutes each week',
    },
    {
      text: `Given this row's implied value of $${fmtUsdX(impliedX)}, a $${capitalX} position models $${econX.alloc_usd} of allocation — ${Math.round(AIRDROP_SHAREX * 100)}% of the implied value spread across the protocol's TVL — weighed against about $${econX.est_gas_usd} of gas and ${econX.est_hours} hands-on hours: the verdict is ${econX.verdict}.`,
      cost: `a net of roughly $${econX.net_usd}, meaning $${econX.net_per_hour} per hour`,
      time: `${econX.est_hours} hours all told`,
    },
    {
      text: `Keep the position open for no fewer than ${weeksX} weeks (${holdX} days) so the activity lands in more than one snapshot.`,
      cost: `the $${capitalX} stays locked in the position`,
      time: `${holdX} days`,
    },
    {
      text: `Prior to withdrawing, navigate to the protocol's official points or rewards page and claim solely from the link it publishes.`,
      cost: 'checking is free, and paying to claim is never required',
      time: '10 minutes',
    },
    {
      text: `Record the wallet, the dates and each transaction in a farm log so the position can be repeated or unwound.`,
      cost: 'no cost beyond keeping the log',
      time: '5 minutes',
    },
  ];
} // c

/** Turn a dollar amount into plain prose for the plan: a rounded whole number with thousands separators. */
function fmtUsdX(nX: number): string {
  return Math.round(nX).toLocaleString('en-US');
}
/** Live protocols with a token, sorted by market cap, for the dashboard's on-record view. */
export function liveRowsX(snapshotX: SnapshotX): LiveRowX[] {
  return snapshotX.protocols
    .filter((pX) => !isPreTokenX(pX))
    .sort((aX, bX) => (bX.mcap_usd ?? 0) - (aX.mcap_usd ?? 0) || bX.tvl_usd - aX.tvl_usd)
    .map((pX) => ({
      slug: pX.slug,
      name: pX.name,
      category: pX.category,
      chains: pX.chains,
      tvl_usd: pX.tvl_usd,
      mcap_usd: pX.mcap_usd,
      change_7d: pX.change_7d,
    }));
}

/** Pre-token protocols the house rule excludes, ordered by TVL, with the reason attached. */
export function setAsideRowsX(snapshotX: SnapshotX): SetAsideRowX[] {
  return snapshotX.protocols
    .filter((pX) => isPreTokenX(pX) && exclusionReasonX(pX) !== null)
    .sort((aX, bX) => bX.tvl_usd - aX.tvl_usd)
    .map((pX) => ({
      slug: pX.slug,
      name: pX.name,
      category: pX.category,
      chains: pX.chains,
      tvl_usd: pX.tvl_usd,
      reason: exclusionReasonX(pX) as string,
    }));
}

/**
 * The live peers a category is priced against: for each category holding at least three priced protocols,
 * up to six peers ranked by the market-cap-over-TVL multiple, strongest first. The dashboard displays
 * these next to a row so a reader sees which comps a category multiple rests on. Deterministic, built
 * from snapshot figures.
 */
export function categoryPeersX(snapshotX: SnapshotX): Record<string, { name: string; multiple: number }[]> {
  const byCatX = new Map<string, { name: string; multiple: number }[]>();
  for (const pX of snapshotX.protocols) {
    if (pX.mcap_usd === null || pX.mcap_usd <= 0 || pX.tvl_usd <= 0) continue;
    const keyX = pX.category ?? 'unlisted';
    const listX = byCatX.get(keyX);
    const entryX = { name: pX.name, multiple: Math.round((pX.mcap_usd / pX.tvl_usd) * 1000) / 1000 };
    if (listX === undefined) byCatX.set(keyX, [entryX]);
    else listX.push(entryX);
  }
  const outX: Record<string, { name: string; multiple: number }[]> = {};
  for (const [keyX, listX] of byCatX) {
    if (listX.length < MIN_PEERSX) continue;
    outX[keyX] = listX
      .sort((aX, bX) => bX.multiple - aX.multiple || (aX.name < bX.name ? -1 : aX.name > bX.name ? 1 : 0))
      .slice(0, 6);
  }
  return outX;
}

/** Compact per-row shape used by data.js; the farm plan itself is built in the page. */
export function radarRowX(row: BoardRowX): RadarRowX {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model_full.category_multiple,
    effective_multiple: row.model.effective_multiple,
    growth_multiplier: row.model_full.growth_multiplier,
    maturity_multiplier: row.model_full.maturity_multiplier,
    band_lo_usd: row.band_lo_usd,
    band_hi_usd: row.band_hi_usd,
    position_usd: row.position_usd,
    est_gas_usd: row.est_gas_usd,
    est_hours: row.est_hours,
    alloc_usd: row.alloc_usd,
    net_usd: row.net_usd,
    net_hi_usd: row.net_hi_usd,
    net_per_hour: row.net_per_hour,
    verdict: row.verdict,
  };
}

/** The full set of values the dashboard draws, derived from the snapshot. */
export function buildRadarX(snapshotX: SnapshotX, model: ModelConstantsX = MODELX): { boardX: BoardRowX[]; radarX: RadarDataX } {
  const boardX = buildBoardX(snapshotX, model);
  const liveX = liveRowsX(snapshotX);
  const setAsideX = setAsideRowsX(snapshotX);
  const calX = calibrateX(snapshotX, model);
  const earlyX = boardX.filter((rX) => !snapshotX.watchlist.includes(rX.slug)).length;
  const radarX: RadarDataX = {
    as_of: snapshotX.as_of,
    source: snapshotX.source,
    floor_usd: snapshotX.floor_usd,
    model,
    model_version: MODEL_VERSIONX,
    fit: {
      alpha: calX.alpha,
      elasticity: calX.elasticity,
      comparables: calX.comparables,
      err_lo: calX.err_lo,
      err_hi: calX.err_hi,
      median_abs_error: calX.median_abs_error,
      categories: Object.keys(calX.by_category).length,
      out_of_sample: calX.out_of_sample,
    },
    watchlist_size: snapshotX.watchlist.length,
    board_size: boardX.length,
    early_size: earlyX,
    pre_token_size: snapshotX.protocols.filter(isPreTokenX).length,
    live_size: liveX.length,
    set_aside_size: setAsideX.length,
    rows: boardX.map(radarRowX),
    live: liveX,
    set_aside: setAsideX,
    category_peers: categoryPeersX(snapshotX),
  };
  return { board: boardX, radar: radarX }; // c
}

/** Pull the snapshot out of a file's text, rejecting it unless it has the shape the model scores. */
export function parseSnapshotX(text: string): SnapshotX {
  let rawX: unknown;
  try {
    rawX = JSON.parse(text);
  } catch {
    throw new SnapshotErrorX('snapshot.json is not JSON');
  }
  if (typeof rawX !== 'object' || rawX === null || Array.isArray(rawX)) throw new SnapshotErrorX('snapshot.json is not a JSON object');
  const oX = rawX as Record<string, unknown>;
  if (typeof oX.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(oX.as_of)) throw new SnapshotErrorX('snapshot.json has no as_of date');
  if (typeof oX.source !== 'string') throw new SnapshotErrorX('snapshot.json has no source');
  if (typeof oX.floor_usd !== 'number' || !Number.isSafeInteger(oX.floor_usd) || oX.floor_usd <= 0) throw new SnapshotErrorX('snapshot.json has no floor_usd');
  if (!Array.isArray(oX.protocols)) throw new SnapshotErrorX('snapshot.json has no protocols array');
  if (!Array.isArray(oX.watchlist) || oX.watchlist.some((sX) => typeof sX !== 'string')) throw new SnapshotErrorX('snapshot.json has no watchlist of slugs');
  const protocolsX = oX.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotErrorX(`snapshot.json's protocol ${i} is not an object`);
    const pX = v as Record<string, unknown>;
    if (typeof pX.slug !== 'string' || typeof pX.name !== 'string' || typeof pX.tvl_usd !== 'number' || !Number.isFinite(pX.tvl_usd)) {
      throw new SnapshotErrorX(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: pX.slug,
      name: pX.name,
      category: typeof pX.category === 'string' ? pX.category : null,
      chains: Array.isArray(pX.chains) ? pX.chains.filter((cX): cX is string => typeof cX === 'string') : [],
      tvl_usd: pX.tvl_usd,
      change_7d: typeof pX.change_7d === 'number' && Number.isFinite(pX.change_7d) ? pX.change_7d : null, // c
      mcap_usd: typeof pX.mcap_usd === 'number' && Number.isFinite(pX.mcap_usd) ? pX.mcap_usd : null, // c
      listed_at: typeof pX.listed_at === 'string' ? pX.listed_at : null,
      gecko_id: typeof pX.gecko_id === 'string' ? pX.gecko_id : null,
      symbol: typeof pX.symbol === 'string' ? pX.symbol : null,
    }; // c
  }); // c
  return { // c
    as_of: oX.as_of,
    source: oX.source,
    floor_usd: oX.floor_usd,
    protocols: protocolsX,
    watchlist: oX.watchlist as string[],
  }; // c
} // c

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssueX(boardX: BoardRowX[], snapshotX: SnapshotX): string | null {
  const slugsX = new Set(boardX.map((rX) => rX.slug));
  const missingX = snapshotX.watchlist.filter((sX) => !slugsX.has(sX));
  if (missingX.length > 0) return `the board misses ${missingX.length} watchlist slug${missingX.length === 1 ? '' : 's'}: ${missingX.slice(0, 5).join(', ')}`;
  const ranksX = boardX.map((rX) => rX.rank).sort((aX, bX) => aX - bX);
  for (let i = 0; i < ranksX.length; i++) if (ranksX[i] !== i + 1) return `rank ${i + 1} is ${ranksX[i]}`;
  for (let i = 1; i < boardX.length; i++) if (boardX[i]!.implied_value_usd > boardX[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (boardX.length >= 2 && boardX[0]!.implied_value_usd === boardX[boardX.length - 1]!.implied_value_usd) {
    return `all ${boardX.length} rows share the same implied value $${boardX[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const rX of boardX) {
    const stepsX = rX.farm_steps;
    if (stepsX.length < 3 || stepsX.length > 12) return `${rX.slug} has ${stepsX.length} farm steps`;
    for (const sX of stepsX) if (sX.length < 20 || sX.length > 600) return `${rX.slug} has a farm step of ${sX.length} characters`;
    if (!Number.isSafeInteger(rX.implied_value_usd) || rX.implied_value_usd <= 0) return `${rX.slug} has implied value ${rX.implied_value_usd}`;
  }
  return null;
} // c

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScriptX(radarX: RadarDataX): string {
  return `window.RADAR=${JSON.stringify(radarX)};\n`;
} // c

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTESX = 65_536;
const SCREENSHOT_CAPSX = { max: 4, max_bytes: 524_288 };
const IMAGE_NAMEX = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** `--name <value>` or `--name=<value>` out of the arguments, or the fallback. */
function argOfX(argv: string[], name: string, fallback: string): string {
  const atX = argv.indexOf(`--${name}`);
  if (atX >= 0 && atX + 1 < argv.length) return argv[atX + 1]!;
  const withEqualsX = argv.find((aX) => aX.startsWith(`--${name}=`));
  return withEqualsX === undefined ? fallback : withEqualsX.slice(name.length + 3);
}

/** Copies the plain files of a single directory into `to`, ignoring any names beginning with a dot. */
function copyFilesX(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copiedX: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const pathX = join(from, name);
    if (!statSync(pathX).isFile()) continue;
    copyFileSync(pathX, join(to, name));
    copiedX.push(name);
  }
  return copiedX;
}

/**
 * The whole run of the entrypoint: load the sealed snapshot, fit the comps curve, rank the board, emit board.json
 * and data.js, copy the dashboard plus its screenshots into the output directory, and produce the dossier that the
 * judge reads. main.ts invokes this with the repository root and the command-line arguments.
 */
export function runEntryX(root: string, argv: string[]): void {
  const inputArgX = argOfX(argv, 'input', '/input');
  const inputFileX = inputArgX.endsWith('.json') ? inputArgX : join(inputArgX, 'snapshot.json');
  if (!existsSync(inputFileX)) {
    process.stderr.write(`token radar: no snapshot at ${inputFileX}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
    process.exit(2);
  }
  const outX = argOfX(argv, 'output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshotX = parseSnapshotX(readFileSync(inputFileX, 'utf8'));
  const { board: boardX, radar: radarX } = buildRadarX(snapshotX);
  const issueX = boardIssueX(boardX, snapshotX);
  if (issueX !== null) {
    process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issueX}\n`);
    process.exit(1);
  }
  mkdirSync(outX, { recursive: true });
  writeFileSync(join(outX, 'board.json'), `${JSON.stringify({ rows: boardX })}\n`);
  writeFileSync(join(outX, 'data.js'), dataScriptX(radarX));
  copyFilesX(join(root, 'dashboard'), join(outX, 'dashboard'));
  const shotsX = copyFilesX(join(root, 'screenshots'), join(outX, 'screenshots'));
  if (shotsX.length < 3) {
    process.stderr.write(`token radar: screenshots/ holds ${shotsX.length} image${shotsX.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
    process.exit(1);
  }
  for (const name of shotsX) {
    if (!IMAGE_NAMEX.test(name)) {
      process.stderr.write(`token radar: screenshots/${name}: each name must be 1 to 128 characters drawn from letters, digits and . _ -\n`);
      process.exit(1);
    }
  }
  writeFileSync(join(outX, 'dossier.json'), buildDossier(outX, { text_max_bytes: TEXT_MAX_BYTESX, screenshots: SCREENSHOT_CAPSX, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
  process.stdout.write(
    `token radar: ${snapshotX.protocols.length} protocols, ${snapshotX.watchlist.length} on the watchlist, ${boardX.length} rows scored (${radarX.early_size} early, ${radarX.live_size} live, ${radarX.set_aside_size} set aside)\n` +
      `token radar: comps curve mcap = ${radarX.fit.alpha.toPrecision(3)} x TVL^${radarX.fit.elasticity.toFixed(3)} on ${radarX.fit.comparables} priced protocols; band x${radarX.fit.err_lo.toFixed(2)}..x${radarX.fit.err_hi.toFixed(2)}\n` +
      `token radar: wrote ${join(outX, 'board.json')}, ${join(outX, 'data.js')}, ${join(outX, 'dashboard')}, ${join(outX, 'screenshots')} (${shotsX.length} images) and ${join(outX, 'dossier.json')}\n`,
  );
}
