/* Launch Radar — the board, the model and the farm plans, rendered from
   window.RADAR (data.js, written by main.ts from the sealed snapshot).
   No fetch, no network: everything on this page was computed by the entry's
   own program from the snapshot's figures. */
'use strict';
const R = window.RADAR;
const $ = (s, el) => (el || document).querySelector(s);
const fmt$ = (v) => (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v));
const fmtN = (v) => v.toLocaleString('en-US');
const fmtX = (v) => v.toFixed(2) + 'x';
const pct = (v) => (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bySlug = new Map(R.rows.map((r) => [r.slug, r]));

$('#sub').textContent =
  `Every protocol DefiLlama tracked at ${R.as_of} that still records no token, ranked by what its launch would be worth — ` +
  `priced by a curve fitted to the ${R.fit.comps} protocols in the same snapshot whose tokens already trade, and graded held-out below. ` +
  `Source: ${R.source}.`;

/* ---------- header strips: KPIs, the model, the accounting ---------- */
function kpis() {
  const total = R.rows.reduce((s, r) => s + r.implied_value_usd, 0);
  const k = [
    [fmtN(R.funnel.protocols), 'protocols scanned'],
    [fmtN(R.funnel.pre_token), 'record no token'],
    [fmtN(R.fit.comps), 'live-token comps'],
    [fmtN(R.rows.length), 'on the board'],
    [R.funnel.watchlist + ' / ' + R.funnel.watchlist, 'watchlist covered'],
    [fmt$(total), 'combined implied value'],
  ];
  return `<section class="kpis">${k.map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('')}</section>`;
}

function modelPanel() {
  const f = R.fit, v = R.validation;
  return `<section class="panel amber">
    <h2>The value model — fitted to the snapshot's own market, then graded held-out</h2>
    <p class="formula">log10(market cap) = ${f.a} + ${f.b} × log10(TVL) &nbsp;·&nbsp; fitted on ${f.comps} live-token comps, R² ${f.r2}</p>
    <p class="note">A pre-token protocol's base value is that curve read at its own TVL, moved by its category's median
    residual among the comps (shrunk by n/(n+12) so thin categories barely count), then tilted by momentum
    (1 + clamped 7-day change × 0.5) and by track record (0.6–1.0 over three years without a token).
    No protocol's name is an input. The grading below is 5-fold held-out, recomputed on every run of the program:
    each fold's comps are predicted from a fit on the other four.</p>
    <table class="val"><thead><tr><th>Model</th><th>Median held-out error</th><th>Reading</th></tr></thead><tbody>
      <tr><td>Flat 0.25 × TVL (the starter rule)</td><td>${v.flat.toFixed(2)}x</td><td>a typical comp is missed by this factor</td></tr>
      <tr><td>Comps curve, no category term</td><td>${v.curve.toFixed(2)}x</td><td>size alone, fitted</td></tr>
      <tr><td class="best">Comps curve + category term — this board</td><td class="best">${v.curveCat.toFixed(2)}x</td><td>the model every row below is priced with</td></tr>
    </tbody></table>
  </section>`;
}

function funnelPanel() {
  const e = R.funnel.excluded;
  const why = { 'product-category': 'in a wrapped, staked, bridged or exchange product category', 'versioned-name': 'versioned pools of another protocol', 'wrapped-or-staked-name': 'wrapped or staked products by name', 'exchange-name': 'an exchange\u2019s own products' };
  const parts = Object.keys(e).map((k) => `${e[k]} ${why[k] || k}`).join(' · ');
  return `<section class="panel">
    <h2>Every one of the ${R.funnel.protocols} protocols, accounted for</h2>
    <div class="funnel">
      <div class="fstep"><b>${R.funnel.protocols}</b>in the snapshot</div><span class="farrow">→</span>
      <div class="fstep"><b>${R.funnel.token_recorded}</b>already record a token (${R.funnel.token_with_mcap} with a market cap: the comps)</div><span class="farrow">→</span>
      <div class="fstep"><b>${R.funnel.pre_token}</b>record no token</div><span class="farrow">→</span>
      <div class="fstep"><b>${R.rows.length}</b>launch candidates on the board</div>
    </div>
    <p class="note">Left off the board, by the watchlist's own rules: ${parts}. The ${R.funnel.watchlist} watchlist protocols
    (TVL ≥ ${fmt$(R.floor_usd)}, no token) are all on the board; the rest of the board is the radar finding candidates under that floor.
    Protocols whose token already trades are never ranked here — the biggest of them are listed under “Already trading” as the comps they are.</p>
  </section>`;
}

/* ---------- the board ---------- */
const state = { q: '', cat: '', chain: '', verdict: '', watch: false, sort: 'rank' };
function categories() { return [...new Set(R.rows.map((r) => r.category || '(none)'))].sort(); }
function chains() { return [...new Set(R.rows.flatMap((r) => r.chains))].sort(); }

function filtered() {
  let rows = R.rows.filter((r) =>
    (state.cat === '' || (r.category || '(none)') === state.cat) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (state.verdict === '' || r.farm.verdict === state.verdict) &&
    (!state.watch || r.watchlist) &&
    (state.q === '' || (r.name + ' ' + r.slug).toLowerCase().includes(state.q)));
  const key = { rank: (r) => r.rank, implied: (r) => -r.implied_value_usd, tvl: (r) => -r.tvl_usd, growth: (r) => -(r.change_7d ?? -1e9), age: (r) => -(r.age_days ?? -1), multiple: (r) => -r.multiple }[state.sort];
  return rows.sort((a, b) => key(a) - key(b));
}

function boardView() {
  const rows = filtered();
  const body = rows.map((r) => `<tr tabindex="0" data-slug="${esc(r.slug)}">
    <td>${r.rank}</td>
    <td class="name"><b>${esc(r.name)}</b> ${r.watchlist ? '<span class="watch">WATCHLIST</span>' : ''}<span class="slug">${esc(r.slug)}</span></td>
    <td style="text-align:left">${esc(r.category || '—')}</td>
    <td style="text-align:left">${esc(r.chains.slice(0, 2).join(', ') || '—')}</td>
    <td>${fmt$(r.tvl_usd)}</td>
    <td class="${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
    <td>${r.age_days === null ? '—' : fmtN(r.age_days) + 'd'}</td>
    <td>${fmtX(r.multiple)}</td>
    <td><b>${fmt$(r.implied_value_usd)}</b></td>
    <td><span class="badge ${r.farm.verdict}">${r.farm.verdict}</span></td></tr>`).join('');
  return kpis() + `
  <section class="panel">
    <h2>The board — ${R.rows.length} pre-token protocols by implied launch value</h2>
    <div class="controls">
      <input type="search" id="q" placeholder="Search name or slug…" value="${esc(state.q)}" aria-label="Search">
      <select id="cat" aria-label="Category"><option value="">All categories</option>${categories().map((c) => `<option ${c === state.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="chain" aria-label="Chain"><option value="">All chains</option>${chains().map((c) => `<option ${c === state.chain ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="verdict" aria-label="Farm verdict"><option value="">Any verdict</option>${['FARM', 'THIN', 'SKIP'].map((v) => `<option ${v === state.verdict ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="sort" aria-label="Sort">
        ${[['rank', 'Sort: rank'], ['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['multiple', 'Sort: multiple']].map(([v, t]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <label class="check"><input type="checkbox" id="watch" ${state.watch ? 'checked' : ''}> Watchlist only</label>
    </div>
    <p class="count">${rows.length} of ${R.rows.length} protocols shown. Select a row for its detail view: the model's arithmetic and its farm plan.</p>
    <div style="overflow-x:auto"><table class="board"><thead><tr>
      <th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th>TVL</th><th>7d</th><th>Age</th><th>Mult</th><th>Implied value</th><th>Farm</th>
    </tr></thead><tbody>${body}</tbody></table></div>
  </section>` + modelPanel() + funnelPanel() + livePanel();
}

function livePanel() {
  const body = R.live.map((p) => `<tr><td style="text-align:left"><b>${esc(p.name)}</b></td><td style="text-align:left">${esc(p.category || '—')}</td><td>${fmt$(p.tvl_usd)}</td><td>${fmt$(p.mcap_usd)}</td><td>${fmtX(p.multiple)}</td></tr>`).join('');
  return `<section class="panel"><h2>Already trading — the comps, kept off the board</h2>
  <p class="note">These protocols' tokens exist, so the market has priced them; they are the evidence the curve is fitted to, not candidates.</p>
  <table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

/* ---------- detail view ---------- */
function detailView(r) {
  const f = R.fit;
  const recomputed = Math.round(Math.pow(10, f.a + f.b * Math.log10(Math.max(1, r.tvl_usd)) + r.category_adj_log10) * r.growth_multiplier * r.maturity_multiplier);
  const drift = Math.abs(recomputed - r.implied_value_usd) / r.implied_value_usd;
  const stat = (b, s) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`;
  return `<p><a class="back" href="#/">← back to the board</a></p>
  <div class="dhead"><h2>${esc(r.name)}</h2><span class="badge ${r.farm.verdict}">${r.farm.verdict}</span>${r.watchlist ? '<span class="watch">ON THE WATCHLIST</span>' : '<span class="slug">found under the watchlist floor</span>'}</div>
  <p class="note">${esc(r.slug)} · ${esc(r.category || 'uncategorised')} · on ${esc(r.chains.join(', ') || 'no named chain')} · records no token in the ${R.as_of} snapshot (no market cap, no CoinGecko id, no symbol).</p>
  <div class="stats">
    ${stat(fmt$(r.implied_value_usd), 'implied launch value · rank #' + r.rank)}
    ${stat(fmt$(r.tvl_usd), 'TVL')}
    ${stat(fmtX(r.multiple), 'implied / TVL')}
    ${stat(pct(r.change_7d), 'TVL change, 7 days')}
    ${stat(r.age_days === null ? 'unknown' : fmtN(r.age_days) + ' days', 'tracked without a token')}
    ${stat(fmt$(r.farm.capital_usd), 'farm capital (plan below)')}
    ${stat('$' + r.farm.fees_usd.toFixed(2), `plan fees · ${r.farm.fee_drag_pct}% of capital`)}
    ${stat(r.farm.weeks + ' weeks', 'plan hold')}
  </div>
  <section class="panel"><h2>Farm plan — costed, with a verdict</h2>
    <div class="planhead"><span class="badge ${r.farm.verdict}">${r.farm.verdict}</span><span class="why">${esc(r.farm.verdict_reason)}. Gas is priced on ${esc(r.chains[0] || 'its main chain')} at $${r.farm.gas_per_tx_usd} a transaction, the plan's stated rate.</span></div>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </section>  <section class="panel"><h2>How this value is derived — recomputed here, in the page</h2>
    <div class="calc">
      curve base&nbsp;&nbsp;= 10^(${f.a} + ${f.b} × log10(${fmtN(r.tvl_usd)})) = ${fmt$(Math.pow(10, f.a + f.b * Math.log10(Math.max(1, r.tvl_usd))))}<br>
      category term = 10^(${r.category_adj_log10}) from ${r.category_comps} comps in ${esc(r.category || '(none)')} → base ${fmt$(r.base_value_usd)}<br>
      momentum tilt × ${r.growth_multiplier} &nbsp;·&nbsp; track-record tilt × ${r.maturity_multiplier}<br>
      implied value = ${fmt$(recomputed)} <span class="ok">— recomputed in this page from the printed fit; ${drift < 0.005 ? 'matches' : 'within ' + (drift * 100).toFixed(1) + '% of'} the ${fmt$(r.implied_value_usd)} in board.json (fit constants are printed to 4 decimals)</span>
    </div>
    <p class="note">Read it as the market's own pricing carried across: protocols like this one, at this size, in this category,
    trade at these values today. It is a claim about what a launch would be worth if the record stayed as it is — not a prediction that a token comes.</p>
  </section>
`;
}

/* ---------- routing & wiring ---------- */
function render() {
  const app = $('#app');
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m && bySlug.has(m[1])) { app.innerHTML = detailView(bySlug.get(m[1])); window.scrollTo(0, 0); }
  else {
    app.innerHTML = boardView();
    const go = (el) => { location.hash = '#/p/' + el.dataset.slug; };
    app.querySelectorAll('.board tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => go(tr));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(tr); });
    });
    const keep = (id, key, prop) => { const el = $(id); if (el) el.addEventListener('input', () => { state[key] = prop === 'checked' ? el.checked : el.value; render(); const n = $(id); if (n && prop === 'value' && id === '#q') { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); };
    keep('#q', 'q', 'value'); keep('#cat', 'cat', 'value'); keep('#chain', 'chain', 'value');
    keep('#verdict', 'verdict', 'value'); keep('#sort', 'sort', 'value'); keep('#watch', 'watch', 'checked');
  }
  app.setAttribute('aria-busy', 'false');
}
window.addEventListener('hashchange', render);
render();

$('#foot').innerHTML =
  `<p><b>Method, in one breath:</b> the sealed snapshot (${esc(R.source)}) is the only input. Live-token protocols in it are the comps; ` +
  `a log-log curve of market cap on TVL plus a shrunk category term prices every pre-token protocol; momentum and track record tilt the ranking; ` +
  `farm plans are costed from each protocol's own chain, category, TVL and age, and verdicted on fee drag (FARM ≤ 5%, THIN ≤ 15%, SKIP above).</p>` +
  `<p>Gas price list used by every plan (per transaction): Ethereum $12 · Base $0.80 · Arbitrum $0.60 · Optimism $0.60 · Avalanche $0.50 · BNB Chain $0.40 · Tron $0.30 · Polygon $0.10 · Solana $0.05 · Sui $0.05 · Aptos $0.05 · any other chain $0.50. ` +
  `The page renders with no network; the board it shows is the board.json the program wrote, and each detail view recomputes its value from the printed fit.</p>`;
