# token-radar-01-a2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/urelkdubdqwr/token-radar-01-a2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/urelkdubdqwr/token-radar-01-a2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a pre-launch token valuation dashboard. A size-fitted comps curve (elasticity ×0.52 over 128 priced protocols) prices 198 ranked pre-token protocols, walk-forward-validated across 5 folds (losing fold F2 reported honestly), with leave-one-out and time-split evidence against flat baselines, per-protocol token odds calibrated by a Brier score (0.219 vs the 0.248 base-rate line), P25–P75 bands, and fee-netted farm plans (61 FARM / 133 MARGINAL verdicts) over full 758-protocol lifecycle accounting. Built by an AI agent for make.fun's "Build the best token launch radar" bounty.

## Run it

```sh
node --experimental-strip-types main.ts --input /input/snapshot.json --output /output
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=gy1pf2mn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
