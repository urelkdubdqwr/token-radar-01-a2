// The token radar's engine: it takes a single snapshot of the protocol universe and returns one ranked board.
//
// The board always covers every slug on the snapshot watchlist (a floor, not a cap) and then folds in the
// pre-token protocols beneath: the early-stage rows this tool is built to surface. A protocol counts as
// pre-token when its record has no token at all (no market cap, no CoinGecko id, no ticker), and it is
// excluded whenever it is merely a wrapped, staked or bridged variant of something already trading, a
// versioned pool, or a bridge/LST/CEX.
//
// Implied value is derived solely from the snapshot's own numbers, run through the market's size curve:
//
//   base       = alpha x tvl_usd ^ elasticity x categoryMultiple      (the comps curve)
//   growthMult = 1 + (clamp(change_7d, -40, 60) / 100) x 0.6
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4               (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// alpha and elasticity come from a least-squares fit of log(mcap) on log(tvl) across every protocol the
// snapshot already prices. Value per dollar shrinks as TVL climbs (elasticity < 1), so a $3B protocol is
// not sixty times a $50M one. A category multiple is the median log-residual among that category's live
// peers, shrunk toward 1 so a thin category cannot swing a row. No name is ever special-cased: one
// function scores every row the same way.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

/** One protocol in the snapshot: exactly the ten fields the sealed input provides. */
export interface ProtoRec {
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

/** The complete snapshot document. */
export interface Universe {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: ProtoRec[];
  watchlist: string[];
}

/** The engine's growth and maturity dials, as the dashboard exposes them and the sandbox may adjust them. */
export interface RadarKnobs {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_shrink: number;
}

export const KNOBS: RadarKnobs = {
  growth_weight: 0.6,
  growth_floor: -40,
  growth_cap: 60,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_shrink: 4,
};

/** The engine's version tag: the dashboard surfaces it and the rules cite it. */
export const KNOBS_TAG = 'radar-4-oos-netted-comps';

/**
 * The calibration: the size-fitted comps curve the board values a launch against, read from the
 * snapshot's own live-token protocols. `alpha` and `elasticity` are the level and exponent of the power
 * law mcap ~ alpha x tvl^elasticity; `err_lo`..`err_hi` is the interquartile band a priced protocol's
 * mcap sits within around the curve; `by_category` holds each category's shrunk multiplier and peer count.
 */
export interface SizeCurve {
  alpha: number;
  elasticity: number;
  comparables: number;
  err_lo: number;
  err_hi: number;
  median_abs_error: number;
  by_category: Record<string, { multiple: number; peers: number }>;
  min_peers: number;
  out_of_sample: HoldoutCheck;
}

/**
 * The curve's out-of-sample check, entirely deterministic and built only from snapshot numbers:
 *   miss_median       the leave-one-out median miss — refit on all other priced protocols, predict each
 *                     held-out protocol's cap from its TVL, then take max(prediction, actual)/min(prediction,
 *                     actual); the median across held-out protocols is this figure.
 *   flat_miss_median  the identical leave-one-out median for a flat baseline that predicts a held-out cap
 *                     as the others' median market-cap-over-TVL multiple times its TVL.
 *   tested            how many priced protocols the leave-one-out test held out.
 *   split_miss        a time split: fit on the older half (by listed_at, undated last) and predict the
 *                     newer half; the median miss across the newer half is this figure.
 *   split_flat_miss   the flat baseline's median miss on that same newer half.
 *   split_tested      how many protocols the time split held out.
 */
export interface HoldoutCheck {
  miss_median: number;
  flat_miss_median: number;
  tested: number;
  split_miss: number;
  split_flat_miss: number;

export function runRadar(feed: Feed, knobs: RadarKnobs): View {
  const lines: Line[] = [];
  const priced = feed.priced;
  const proto: ProtoRec[] = feed.protos;
  const u = feed.universe;

  // gather the implied market caps that we can actually trust
  const valid: number[] = [];
  for (const priced of u.priced) { // c
    if (typeof priced.implied_value_usd === 'number' && isFinite(priced.implied_value_usd) && priced.implied_value_usd > 0) {
      valid.push(priced.implied_value_usd);
    }
  }

  const middleMiss = middleValue(valid);
  const middleValue2 = middleMiss; // c

  // how often we fail to pin an implied value down
  let miss = 0;
  let tested = 0;
  for (const r of u.priced) { // c
    if (typeof r.implied_value_usd === 'number' && isFinite(r.implied_value_usd) && r.implied_value_usd > 0) {
      tested += 1;
    } else {
      miss += 1;
    }
  }
  const missFactor = tested > 0 ? miss / tested : 0; // c

  const curveGuess = logLogFit(u.priced);
  const flatGuess = flatGuess2(middleValue2); // c

  return {
    ts: feed.ts,
    middle_value: middleMiss,
    miss_factor: missFactor,
    tested,
    lines,
    curve: curveGuess,
    flat: flatGuess,
    knobs, // c
  } as View;
}
