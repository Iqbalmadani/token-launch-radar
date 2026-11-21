// Token launch radar — model "comps-2".
//
// One sealed DefiLlama snapshot in, one ranked board out. Nothing here touches
// the network and nothing is keyed to a protocol's name: every number a row
// carries is derived from the snapshot's own figures, in the open, below.
//
// THE VALUE MODEL
// The snapshot's live-token protocols are the market's own answer to "what is
// a token worth at this TVL". Of the 758 protocols, 128 record a token with a
// market cap, so they are the comps set. On them we fit, by ordinary least
// squares on log10 scales:
//
//     log10(mcap) = A + B * log10(tvl) + G * momentum
//     momentum    = clamp(change_7d, -25, 25) / 100
//
// Momentum is inside the fit, not bolted on: fitted on the comps it earns its
// coefficient, and the held-out grading below shows it earning its place
// (chain count and age were tried as further terms the same way and were
// rejected — both graded worse held out). The term is winsorized at +/-25%:
// the comps price a freshly surging TVL cheaper per dollar — spiked TVL is
// often incentive-driven and mean-reverts, while market caps move slower
// than TVL in both directions — but one wild week must not dominate a
// ranking, so beyond +/-25% a move stops moving the price. Held out, the
// winsorized term grades the same as the raw one (3.39x either way); what
// the cap removes is the tail, not the signal. A protocol's base value is the
// fitted surface read at its own figures, adjusted by the median residual of
// its category among the comps (shrunk toward zero by n/(n+12), so a category
// with two comps barely moves the surface). One tilt then remains, stated:
//
//     maturityMult = 0.6 + 0.4 * min(age_days, 1095)/1095   (unknown age: 365)
//     implied      = round(base * maturityMult)
//
// Age is a tilt and not a fit term on purpose: the comps' prices already
// contain their ages, while a launch ranking should still pay something for
// three years of operating without a token.
//
// THE VALIDATION
// The fit is graded the way it is used: 5-fold held out, folds assigned by
// slug order (deterministic), each fold's comps predicted from a fit on the
// other four. The dashboard prints the median fold error of this model next
// to the flat 0.25 x TVL rule and the size-only curve with its category term,
// all computed from the snapshot at run time — the numbers are not typed
// into the page, they are recomputed on every run. The dashboard also plots
// every comp against the fitted curve and gives each row the middle-half
// range of the comps' own residuals, so the model's scatter is on show.
//
// THE BOARD
// Every watchlist slug, plus every other pre-token protocol the watchlist's
// own exclusion rules let through (no wrapped/staked/bridged product, no
// versioned pool, no exchange product), whatever its TVL: the watchlist is
// the floor, and the radar's job is the protocols under it.
//
// FARM PLANS
// Each row's plan is costed from the row itself: a capital tier from its TVL,
// a per-transaction gas price from its main chain, a hold from its age, one
// primary and one secondary action from its category. The verdict nets the
// plan's fees against its capital: FARM at <=5% fee drag, THIN at <=15%,
// SKIP above that — a plan whose gas eats the position is not a plan.

export interface SnapshotProtocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'comps-2';

/** Shrinkage for the category term: a category's median residual counts n/(n+K). */
export const CATEGORY_SHRINK_K = 12;
/** The momentum term's clamp, and the maturity tilt's shape. */
export const GROWTH_FLOOR = -25;
export const GROWTH_CAP = 25;
export const MATURITY_FLOOR = 0.6;
export const MATURITY_RANGE = 0.4;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;

/** Gas per transaction in USD by main chain: the farm plan's price list, stated in the dashboard. */
export const GAS_USD: Record<string, number> = {
  Ethereum: 12, Solana: 0.05, Base: 0.8, Arbitrum: 0.6, Optimism: 0.6,
  'BNB Chain': 0.4, Polygon: 0.1, Avalanche: 0.5, Tron: 0.3, Sui: 0.05, Aptos: 0.05,
};
export const GAS_DEFAULT_USD = 0.5;

/** Verdict thresholds on fee drag (total plan fees / capital), as the dashboard states them. */
export const FARM_MAX_DRAG = 0.05;
export const THIN_MAX_DRAG = 0.15;

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Why a pre-token protocol is not a launch candidate, or null when it is one. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (PRODUCT_CATEGORIES.has(p.category ?? '')) return 'product-category';
  if (VERSIONED.test(p.name)) return 'versioned-name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped-or-staked-name';
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return 'exchange-name';
  return null;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!;
};
const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

/** The momentum term exactly as the fit sees it: 7-day TVL change, clamped, in hundreds. */
export function growthTerm(p: SnapshotProtocol): number {
  const raw = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  return Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, raw)) / 100;
}

/** Solve a small linear system by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const k = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!; M[c] = M[piv]!; M[piv] = tmp;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let cc = c; cc <= k; cc++) M[r]![cc]! -= f * M[c]![cc]!;
    }
  }
  return M.map((row, i) => row[k]! / row[i]!);
}

/** Least squares of log10(mcap) on the given feature functions, over the comps rows. */
function fitOLS(rows: SnapshotProtocol[], features: ((p: SnapshotProtocol) => number)[]): { coef: number[]; r2: number } {
  const k = features.length + 1;
  const A = Array.from({ length: k }, () => Array(k).fill(0));
  const b = Array(k).fill(0);
  const ys = rows.map((p) => Math.log10(p.mcap_usd!));
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let syy = 0;
  for (const y of ys) syy += (y - my) ** 2;
  for (const p of rows) {
    const x = [1, ...features.map((f) => f(p))];
    const y = Math.log10(p.mcap_usd!);
    for (let i = 0; i < k; i++) { b[i]! += x[i]! * y; for (let j = 0; j < k; j++) A[i]![j]! += x[i]! * x[j]!; }
  }
  const coef = solve(A, b);
  let sse = 0;
  for (const p of rows) {
    const x = [1, ...features.map((f) => f(p))];
    const pred = x.reduce((s, v, i) => s + v * coef[i]!, 0);
    sse += (Math.log10(p.mcap_usd!) - pred) ** 2;
  }
  return { coef, r2: syy === 0 ? 0 : 1 - sse / syy };
}

const logTvl = (p: SnapshotProtocol) => Math.log10(Math.max(1, p.tvl_usd));

/** Each category's median log10 residual under a predictor, shrunk by n/(n+K) and capped at +/-0.5. */
export function categoryAdjustments(rows: SnapshotProtocol[], predict: (p: SnapshotProtocol) => number): Map<string, { adj: number; n: number }> {
  const byCat = new Map<string, number[]>();
  for (const p of rows) {
    const key = p.category ?? '(none)';
    const r = Math.log10(p.mcap_usd!) - predict(p);
    const list = byCat.get(key);
    if (list) list.push(r); else byCat.set(key, [r]);
  }
  const out = new Map<string, { adj: number; n: number }>();
  for (const [cat, rs] of byCat) {
    const shrunk = median(rs) * (rs.length / (rs.length + CATEGORY_SHRINK_K));
    out.set(cat, { adj: Math.max(-0.5, Math.min(0.5, shrunk)), n: rs.length });
  }
  return out;
}

export interface Fit {
  a: number; b: number; g: number; r2: number; comps: number;
  cat: Map<string, { adj: number; n: number }>;
  residQ25: number; residQ75: number;
}

function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

export function fitModel(snapshot: Snapshot): Fit {
  const comps = compsOf(snapshot);
  const { coef, r2 } = fitOLS(comps, [logTvl, growthTerm]);
  const [a, b, g] = coef as [number, number, number];
  const predict = (p: SnapshotProtocol) => a + b * logTvl(p) + g * growthTerm(p);
  const cat = categoryAdjustments(comps, predict);
  const residuals = comps.map((p) => Math.log10(p.mcap_usd!) - (predict(p) + (cat.get(p.category ?? '(none)')?.adj ?? 0)));
  return { a, b, g, r2, comps: comps.length, cat, residQ25: quantile(residuals, 0.25), residQ75: quantile(residuals, 0.75) };
}

/** The fitted surface read at one protocol, before the maturity tilt. */
export function baseValue(fit: Fit, p: SnapshotProtocol): { base: number; catAdj: number; catN: number } {
  const entry = fit.cat.get(p.category ?? '(none)');
  const catAdj = entry ? entry.adj : 0;
  const base = Math.pow(10, fit.a + fit.b * logTvl(p) + fit.g * growthTerm(p) + catAdj);
  return { base, catAdj, catN: entry ? entry.n : 0 };
}

export function maturity(p: SnapshotProtocol, asOf: string): { maturityMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const ageFor = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_FLOOR + (Math.min(Math.max(ageFor, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  return { maturityMult, age };
}

/**
 * Held-out grading, 5 folds by slug order, median ratio error (larger over
 * smaller, so 3.4 reads "typically within 3.4x") for three models: the flat
 * starter rule, the size-only curve with its category term, and this model —
 * the fitted surface with momentum inside it and the category term on top.
 */
export function validateModel(snapshot: Snapshot): { flat: number; curveCat: number; full: number; folds: number; comps: number } {
  const comps = compsOf(snapshot).sort((x, y) => (x.slug < y.slug ? -1 : 1));
  const ratioErr = (pred: number, actual: number) => Math.max(pred / actual, actual / pred);
  const errs = { flat: [] as number[], curveCat: [] as number[], full: [] as number[] };
  const FOLDS = 5;
  for (let f = 0; f < FOLDS; f++) {
    const train = comps.filter((_, i) => i % FOLDS !== f);
    const test = comps.filter((_, i) => i % FOLDS === f);
    const sizeOnly = fitOLS(train, [logTvl]);
    const predSize = (p: SnapshotProtocol) => sizeOnly.coef[0]! + sizeOnly.coef[1]! * logTvl(p);
    const catSize = categoryAdjustments(train, predSize);
    const full = fitOLS(train, [logTvl, growthTerm]);
    const predFull = (p: SnapshotProtocol) => full.coef[0]! + full.coef[1]! * logTvl(p) + full.coef[2]! * growthTerm(p);
    const catFull = categoryAdjustments(train, predFull);
    for (const p of test) {
      errs.flat.push(ratioErr(0.25 * p.tvl_usd, p.mcap_usd!));
      errs.curveCat.push(ratioErr(Math.pow(10, predSize(p) + (catSize.get(p.category ?? '(none)')?.adj ?? 0)), p.mcap_usd!));
      errs.full.push(ratioErr(Math.pow(10, predFull(p) + (catFull.get(p.category ?? '(none)')?.adj ?? 0)), p.mcap_usd!));
    }
  }
  return { flat: median(errs.flat), curveCat: median(errs.curveCat), full: median(errs.full), folds: FOLDS, comps: comps.length };
}

// ---------- farm plans ----------

export interface FarmPlan {
  capital_usd: number;
  gas_per_tx_usd: number;
  weeks: number;
  fees_usd: number;
  fee_drag_pct: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  verdict_reason: string;
  steps: string[];
}

function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 250;
  if (tvl >= 200_000_000) return 150;
  if (tvl >= 50_000_000) return 100;
  if (tvl >= 10_000_000) return 75;
  return 50;
}

function weeksFor(age: number | null): number {
  if (age === null) return 6;
  if (age < 180) return 8;
  if (age < 365) return 6;
  return 4;
}

function actionsFor(p: SnapshotProtocol): { primary: string; secondary: string } {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return { primary: `supply USDC as collateral to ${n}`, secondary: `borrow a small stablecoin amount against the supply, then repay it` };
  if (c.includes('dex') || c.includes('amm'))
    return { primary: `provide USDC liquidity to ${n}'s main pool`, secondary: `swap a small amount through the same pool each week` };
  if (c.includes('curator') || c.includes('allocator'))
    return { primary: `deposit USDC into a ${n} vault and keep the vault shares`, secondary: `move a small part of the position to a second ${n} vault` };
  if (c.includes('rwa'))
    return { primary: `mint ${n}'s yield asset with USDC and hold it`, secondary: `add a second, smaller mint from a fresh deposit` };
  if (c.includes('derivative') || c.includes('perpetual'))
    return { primary: `deposit USDC margin on ${n} and open one small hedged position`, secondary: `close and reopen the hedge once so both sides record activity` };
  if (c.includes('prediction'))
    return { primary: `fund the account and take one position in a liquid market on ${n}`, secondary: `take a second position in a different market` };
  if (c.includes('insurance'))
    return { primary: `buy cover from ${n} for a position you already hold`, secondary: `renew the cover once before it expires` };
  if (c.includes('stable'))
    return { primary: `mint or deposit the stable asset through ${n}`, secondary: `redeem a small part and mint it again` };
  if (c.includes('yield'))
    return { primary: `deposit USDC into ${n}'s main yield vault`, secondary: `claim and redeposit the rewards once` };
  if (c.includes('bridge'))
    return { primary: `bridge USDC through ${n} and use the funds on the far chain`, secondary: `bridge a smaller amount back the other way` };
  if (c.includes('staking') || c.includes('restak'))
    return { primary: `stake the chain's asset through ${n} and keep the receipt token`, secondary: `add a second, smaller stake` };
  return { primary: `deposit USDC into ${n} and keep the position open`, secondary: `make a second, smaller deposit from the same wallet` };
}

const money = (v: number): string => (v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`);

/** A protocol's costed farm plan: every step names its cost and its time. */
export function farmPlan(p: SnapshotProtocol, age: number | null): FarmPlan {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = GAS_USD[chain] ?? GAS_DEFAULT_USD;
  const capital = capitalFor(p.tvl_usd);
  const weeks = weeksFor(age);
  const txCount = weeks + 5; // wallet setup, primary, secondary, one weekly action per week, claim, exit
  const fees = Math.round(gas * txCount * 100) / 100;
  const drag = fees / capital;
  const verdict = drag <= FARM_MAX_DRAG ? 'FARM' : drag <= THIN_MAX_DRAG ? 'THIN' : 'SKIP';
  const verdict_reason = verdict === 'FARM'
    ? `fees of ${money(fees)} are ${(drag * 100).toFixed(1)}% of the ${money(capital)} position, under the 5% FARM line`
    : verdict === 'THIN'
      ? `fees of ${money(fees)} are ${(drag * 100).toFixed(1)}% of the ${money(capital)} position: farm only with a larger position or a cheaper chain`
      : `fees of ${money(fees)} eat ${(drag * 100).toFixed(1)}% of the ${money(capital)} position, over the 15% SKIP line at this size`;
  const { primary, secondary } = actionsFor(p);
  const steps = [
    `Open a fresh wallet for ${p.name} alone and keep its seed phrase offline on paper. Cost: ${money(gas)} for the first ${chain} transaction. Time: 5 minutes.`,
    `Capital step: ${primary}. Cost: ${money(capital)} of capital plus ${money(gas)} of ${chain} gas. Time: 15 minutes to set up.`,
    `Second action: ${secondary}. Cost: ${money(gas)} of ${chain} gas, no new capital. Time: 10 minutes.`,
    `Repeat one qualifying action a week for ${weeks} weeks (a deposit, a swap, a claim or a vote in ${p.name}'s app). Cost: ${money(gas)} a week, ${money(gas * weeks)} in all. Time: 10 minutes a week.`,
    `Hold the ${money(capital)} position for the full ${weeks} weeks so the activity spans more than one weekly snapshot. Cost: the capital stays locked; the whole plan's fees come to ${money(fees)}. Time: ${weeks} weeks.`,
    `Check ${p.name}'s own points or rewards page and claim only from the link it publishes; never pay a third party to claim. Cost: ${money(gas)} of gas, and no fee to check. Time: 10 minutes.`,
    `Log the wallet, the dates and every transaction hash, then unwind or roll the position by the same steps in reverse. Cost: ${money(gas)} of gas to exit. Time: 10 minutes.`,
  ];
  return { capital_usd: capital, gas_per_tx_usd: gas, weeks, fees_usd: fees, fee_drag_pct: Math.round(drag * 1000) / 10, verdict, verdict_reason, steps };
}

// ---------- the board ----------

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  multiple: number;
  base_value_usd: number;
  category_adj_log10: number;
  category_comps: number;
  growth_term: number;
  maturity_multiplier: number;
  range_low_usd: number;
  range_high_usd: number;
  farm: Omit<FarmPlan, 'steps'>;
  farm_steps: string[];
}

export interface Funnel {
  protocols: number;
  token_recorded: number;
  token_with_mcap: number;
  pre_token: number;
  excluded: Record<string, number>;
  board_rows: number;
  watchlist: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: { a: number; b: number; g: number; r2: number; comps: number; resid_q25: number; resid_q75: number };
  validation: { flat: number; curveCat: number; full: number; folds: number; comps: number };
  funnel: Funnel;
  rows: BoardRow[];
  comps: { t: number; m: number }[];
  live: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number; multiple: number }[];
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot);
  const validation = validateModel(snapshot);
  const watch = new Set(snapshot.watchlist);

  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find((x) => x.slug === slug);
    if (p) chosen.set(slug, p);
  }
  const excluded: Record<string, number> = {};
  let preCount = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    preCount++;
    const reason = exclusionReason(p);
    if (reason !== null) { excluded[reason] = (excluded[reason] ?? 0) + 1; continue; }
    if (!chosen.has(p.slug)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { base, catAdj, catN } = baseValue(fit, p);
    const m = maturity(p, snapshot.as_of);
    const implied = Math.max(1, Math.round(base * m.maturityMult));
    return { p, base, catAdj, catN, m, implied };
  });
  scored.sort((x, y) => y.implied - x.implied || (x.p.slug < y.p.slug ? -1 : 1));

  const board: BoardRow[] = scored.map((s, i) => {
    const plan = farmPlan(s.p, s.m.age);
    const { steps, ...farm } = plan;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.m.age,
      token_status: 'pre-token',
      watchlist: watch.has(s.p.slug),
      implied_value_usd: s.implied,
      multiple: Math.round((s.implied / Math.max(1, s.p.tvl_usd)) * 1000) / 1000,
      base_value_usd: Math.round(s.base),
      category_adj_log10: Math.round(s.catAdj * 1000) / 1000,
      category_comps: s.catN,
      growth_term: Math.round(growthTerm(s.p) * 1000) / 1000,
      maturity_multiplier: Math.round(s.m.maturityMult * 1000) / 1000,
      range_low_usd: Math.max(1, Math.round(s.implied * Math.pow(10, fit.residQ25))),
      range_high_usd: Math.round(s.implied * Math.pow(10, fit.residQ75)),
      farm,
      farm_steps: steps,
    };
  });

  const compsAll = compsOf(snapshot);
  const live = compsAll
    .sort((x, y) => (y.mcap_usd! - x.mcap_usd!) || (x.slug < y.slug ? -1 : 1))
    .slice(0, 24)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, multiple: Math.round((p.mcap_usd! / Math.max(1, p.tvl_usd)) * 1000) / 1000 }));

  const round4 = (v: number) => Math.round(v * 10000) / 10000;
  const round3 = (v: number) => Math.round(v * 1000) / 1000;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit: { a: round4(fit.a), b: round4(fit.b), g: round4(fit.g), r2: round3(fit.r2), comps: fit.comps, resid_q25: round3(fit.residQ25), resid_q75: round3(fit.residQ75) },
    validation,
    funnel: {
      protocols: snapshot.protocols.length,
      token_recorded: snapshot.protocols.length - preCount,
      token_with_mcap: compsAll.length,
      pre_token: preCount,
      excluded,
      board_rows: board.length,
      watchlist: snapshot.watchlist.length,
    },
    rows: board,
    comps: compsAll.map((p) => ({ t: p.tvl_usd, m: p.mcap_usd! })),
    live,
  };
  return { board, radar };
}

/** Why a board fails the gate's shape, or null: coverage, ranks, order, farm steps, values. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `board holds ${board.length} rows, under the 100-row floor`;
  const ranks = board.map((r) => r.rank).sort((x, y) => x - y);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((x, y) => x.rank - y.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${byRank[i]!.rank} outvalues rank ${byRank[i - 1]!.rank}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all rows share one implied value';
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) { const t = s.trim(); if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} chars`; }
  }
  return null;
}

export class SnapshotError extends Error {}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !(o.floor_usd > 0)) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) throw new SnapshotError('snapshot.json lacks protocols/watchlist');
  const protocols = (o.protocols as Record<string, unknown>[]).map((p) => ({
    slug: String(p.slug), name: String(p.name),
    category: typeof p.category === 'string' ? p.category : null,
    chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
    tvl_usd: typeof p.tvl_usd === 'number' ? p.tvl_usd : 0,
    change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
    mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
    listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
    gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
    symbol: typeof p.symbol === 'string' ? p.symbol : null,
  }));
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** The dashboard's data as one script: window.RADAR, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
