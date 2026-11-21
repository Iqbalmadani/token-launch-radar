# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Iqbalmadani/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Iqbalmadani/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol in the sealed DefiLlama snapshot (758 protocols, as of
2026-11-14) that still records no token, ranked by what its token launch
would be worth — priced by the market itself.

## The model

The snapshot's live-token protocols are the comps: 128 of them record a
market cap. On those, `lib/model.ts` fits by least squares on log10 scales

```
log10(market cap) = 2.8961 + 0.523 × log10(TVL) − 1.397 × momentum   (R² 0.203, n = 128)
momentum = clamp(7-day TVL change, −25%, +25%) / 100
```

(constants recomputed from the snapshot on every run, never typed in).
Momentum sits inside the fit, winsorized so one wild week moves a price at
most ~2.2×; its fitted sign is negative — among tokens that already trade,
freshly surging TVL prices cheaper per dollar. A pre-token protocol's base
value is the fitted surface read at its own figures, moved by its
category's median residual among the comps (shrunk by n/(n+12)), then
tilted once, by track record without a token (0.6–1.0 over three years).
Each row also carries the honest range: the middle half of the comps' own
residuals carried onto its implied value.

Graded the way it is used — 5-fold held out, deterministic folds — the
model's median error is **3.38×**, against **4.96×** for the flat
0.25 × TVL rule and 3.55× for the size-only curve with its category term.
The dashboard prints this table from the run's own computation, and plots
every comp against the fitted line.

## The board

198 rows: all 40 watchlist protocols, plus every other pre-token protocol
the watchlist's own exclusion rules let through (no wrapped/staked/bridged
product, no versioned pool, no exchange product), at any TVL. Each row
carries a farm plan costed from the row itself — capital tier from TVL, gas
from its main chain, hold from its age, actions from its category — with a
verdict from fee drag: FARM ≤ 5%, THIN ≤ 15%, SKIP above.

The dashboard is static and renders fully offline: sortable, filterable,
with a detail view per protocol that recomputes its implied value in the
page from the printed fit.

## Run it

```sh
node main.ts --input <snapshot.json> --output <dir>
```

Node 22, standard library only, no network. Writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` (via
`vendor/makefun-board.ts`) into the output directory. Same snapshot in,
same bytes out: two runs are byte-identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=83wdz4pp&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
