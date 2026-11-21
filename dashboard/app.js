/* Launch Radar — the board, the models and the farm plans, rendered from
   window.RADAR (data.js, written by main.ts from the sealed snapshot).
   No fetch, no network: everything on this page was computed by the entry's
   own program from the snapshot's figures, or is recomputed here from the
   printed fits. Pins, compare, the palette and the simulator are page tools:
   they change what you are looking at, never the board underneath. */
'use strict';
const R = window.RADAR;
const $ = (s, el) => (el || document).querySelector(s);
const fmt$ = (v) => (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v));
const fmtN = (v) => v.toLocaleString('en-US');
const fmtX = (v) => v.toFixed(2) + 'x';
const pct = (v) => (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bySlug = new Map(R.rows.map((r) => [r.slug, r]));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

$('#sub').textContent =
  `Every protocol DefiLlama tracked at ${R.as_of} that still records no token, ranked by what its launch would be worth — ` +
  `priced by a surface fitted to the ${R.fit.comps} protocols in the same snapshot whose tokens already trade, with a precedent model ` +
  `for how token-like each profile is, and graded held-out below. Source: ${R.source}. Press Ctrl+K to jump anywhere.`;

/* ---------- header strips: KPIs, the models, the accounting ---------- */
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

function scatter() {
  const pts = R.comps, f = R.fit;
  const W = 720, H = 272, L = 66, B = 24, T = 8, Rt = 38;
  const xs = pts.map((p) => Math.log10(p.t)), ys = pts.map((p) => Math.log10(p.m));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - Rt);
  const Y = (v) => H - B - ((v - y0) / (y1 - y0)) * (H - B - T);
  let grid = '';
  for (let v = x0; v <= x1; v++) grid += `<line x1="${X(v)}" y1="${T}" x2="${X(v)}" y2="${H - B}" stroke="#232e3a"/><text x="${X(v)}" y="${H - 8}" fill="#5d6d7c" font-size="10" text-anchor="middle" font-family="monospace">${fmt$(Math.pow(10, v))}</text>`;
  for (let v = y0; v <= y1; v++) grid += `<line x1="${L}" y1="${Y(v)}" x2="${W - Rt}" y2="${Y(v)}" stroke="#232e3a"/><text x="${L - 6}" y="${Y(v) + 3}" fill="#5d6d7c" font-size="10" text-anchor="end" font-family="monospace">${fmt$(Math.pow(10, v))}</text>`;
  const line = (off) => { let d = ''; for (let i = 0; i <= 24; i++) { const lx = x0 + ((x1 - x0) * i) / 24; d += (i ? 'L' : 'M') + X(lx).toFixed(1) + ' ' + Y(f.a + f.b * lx + off).toFixed(1) + ' '; } return d; };
  const dots = pts.map((p) => `<circle cx="${X(Math.log10(p.t)).toFixed(1)}" cy="${Y(Math.log10(p.m)).toFixed(1)}" r="2.6" fill="#2dd4bf" opacity="0.55"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Scatter of the ${pts.length} live-token comps, market cap against TVL on log scales, with the fitted line">
    ${grid}${dots}
    <path d="${line(f.resid_q25)}" fill="none" stroke="#ffb224" stroke-width="1" stroke-dasharray="4 4" opacity="0.45"/>
    <path d="${line(f.resid_q75)}" fill="none" stroke="#ffb224" stroke-width="1" stroke-dasharray="4 4" opacity="0.45"/>
    <path d="${line(0)}" fill="none" stroke="#ffb224" stroke-width="2.2"/>
    <text x="${W - Rt}" y="${H}" fill="#5d6d7c" font-size="10" text-anchor="end" font-family="monospace">TVL →</text>
  </svg>
  <p class="note" style="margin-top:2px">Every comp plotted: market cap against TVL, log scales. Amber is the fitted size line at zero momentum;
  the dashed pair is the middle half of the comps' own residuals — the scatter the model honestly carries, and the range each row's detail view quotes.</p>`;
}

function modelPanel() {
  const f = R.fit, v = R.validation, o = R.odds;
  return `<section class="panel amber">
    <h2>The value model — fitted to the snapshot's own market, then graded held-out</h2>
    <p class="formula">log10(market cap) = ${f.a} + ${f.b} × log10(TVL) + ${f.g} × momentum &nbsp;·&nbsp; fitted on ${f.comps} live-token comps, R² ${f.r2}</p>
    <p class="note">Momentum (the 7-day TVL change, winsorized at ±25% so one wild week moves a price at most ~2.2x) is inside
    the fit, not bolted on: it earned its coefficient on the comps — a negative one, because freshly surging TVL prices
    cheaper per dollar among tokens that already trade — and chain count and age were tried as further terms and
    rejected, both grading worse held out. A pre-token
    protocol's base value is the fitted surface read at its own figures, moved by its category's median residual among
    the comps (shrunk by n/(n+12) so thin categories barely count), then tilted once, by track record
    (0.6–1.0 over three years without a token). No protocol's name is an input. The grading below is 5-fold held-out,
    recomputed on every run of the program: each fold's comps are predicted from a fit on the other four.</p>
    ${scatter()}
    <table class="val"><thead><tr><th>Model</th><th>Median held-out error</th><th>Reading</th></tr></thead><tbody>
      <tr><td>Flat 0.25 × TVL (the starter rule)</td><td>${v.flat.toFixed(2)}x</td><td>a typical comp is missed by this factor</td></tr>
      <tr><td>Size-only curve + category term</td><td>${v.curveCat.toFixed(2)}x</td><td>TVL alone, fitted</td></tr>
      <tr><td class="best">Fitted surface, momentum inside + category term — this board</td><td class="best">${v.full.toFixed(2)}x</td><td>the model every row below is priced with</td></tr>
    </tbody></table>
    <h3>The precedent model — how token-like is this profile?</h3>
    <p class="formula">logit(P(token)) = ${o.a} + ${o.b} × log10(TVL) + ${o.c} × log10(1 + age in days) &nbsp;·&nbsp; logistic fit on all ${o.n} protocols</p>
    <p class="note">A second fit answers the radar's other question. Across the whole snapshot, ${o.base_rate_pct}% of protocols already
    record a token; this model reads each pre-token protocol's size and track record and estimates how often a profile like
    its belongs to a protocol that has one. Age does the heavy lifting (${o.c} per log-day) — time without a token is the
    exception, not the rule. Graded ${o.folds}-fold held-out like the value model: <b>AUC ${o.auc}</b> (0.5 is guessing) and
    <b>Brier ${o.brier}</b>, against ${o.base_brier} for always answering the base rate — a modest, honest edge, printed
    because a radar should show its instruments' limits. Each board row carries the estimate plus the raw count behind it:
    how many of its category peers already record a token. It is a precedent rate, never a promise that a token comes.</p>
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

function livePanel() {
  const body = R.live.map((p) => `<tr><td style="text-align:left"><b>${esc(p.name)}</b></td><td style="text-align:left">${esc(p.category || '—')}</td><td>${fmt$(p.tvl_usd)}</td><td>${fmt$(p.mcap_usd)}</td><td>${fmtX(p.multiple)}</td></tr>`).join('');
  return `<section class="panel"><h2>Already trading — the comps, kept off the board</h2>
  <p class="note">These protocols' tokens exist, so the market has priced them; they are the evidence the curve is fitted to, not candidates.</p>
  <table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th></tr></thead><tbody>${body}</tbody></table></section>`;
}

/* ---------- the board: filters, pins, compare ---------- */
const state = { q: '', cat: '', chain: '', verdict: '', watch: false, sort: 'rank' };
const pins = new Set();
const cmp = [];
function categories() { return [...new Set(R.rows.map((r) => r.category || '(none)'))].sort(); }
function chains() { return [...new Set(R.rows.flatMap((r) => r.chains))].sort(); }

function filtered() {
  let rows = R.rows.filter((r) =>
    (state.cat === '' || (r.category || '(none)') === state.cat) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (state.verdict === '' || r.farm.verdict === state.verdict) &&
    (!state.watch || r.watchlist) &&
    (state.q === '' || (r.name + ' ' + r.slug).toLowerCase().includes(state.q)));
  const key = { rank: (r) => r.rank, implied: (r) => -r.implied_value_usd, tvl: (r) => -r.tvl_usd, growth: (r) => -(r.change_7d ?? -1e9), age: (r) => -(r.age_days ?? -1), multiple: (r) => -r.multiple, precedent: (r) => -r.precedent_pct }[state.sort];
  return rows.sort((a, b) => key(a) - key(b));
}

function boardView() {
  const rows = filtered();
  const body = rows.map((r) => `<tr tabindex="0" data-slug="${esc(r.slug)}" class="${pins.has(r.slug) ? 'pinned' : ''}">
    <td>${r.rank}</td>
    <td class="name"><b>${esc(r.name)}</b> ${r.watchlist ? '<span class="watch">WATCHLIST</span>' : ''}<span class="slug">${esc(r.slug)}</span></td>
    <td style="text-align:left">${esc(r.category || '—')}</td>
    <td>${fmt$(r.tvl_usd)}</td>
    <td class="${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
    <td>${r.age_days === null ? '—' : fmtN(r.age_days) + 'd'}</td>
    <td><b>${r.precedent_pct}%</b><span class="slug">${r.peer_token}/${r.peer_total} peers tokened</span></td>
    <td><b>${fmt$(r.implied_value_usd)}</b></td>
    <td><span class="badge ${r.farm.verdict}">${r.farm.verdict}</span></td>
    <td class="tools"><button class="tool pinb" data-pin="${esc(r.slug)}" title="Pin this protocol">${pins.has(r.slug) ? 'pinned' : 'pin'}</button><label class="cmpl" title="Select to compare"><input type="checkbox" data-cmp="${esc(r.slug)}" ${cmp.includes(r.slug) ? 'checked' : ''}> cmp</label></td></tr>`).join('');
  const pinStrip = pins.size === 0 ? '' : `<div class="strip"><span class="strip-label">Pinned:</span>${[...pins].map((s) => `<a class="chip" href="#/p/${esc(s)}">${esc(bySlug.get(s).name)}</a>`).join('')}<button class="tool" id="clearpins">clear pins</button></div>`;
  const cmpBar = cmp.length === 0 ? '' : `<div class="strip cmpstrip"><span class="strip-label">Compare (${cmp.length}/3):</span>${cmp.map((s) => `<span class="chip">${esc(bySlug.get(s).name)}</span>`).join('')}<button class="tool go" id="gocmp" ${cmp.length < 2 ? 'disabled' : ''}>compare side by side →</button><button class="tool" id="clearcmp">clear</button></div>`;
  return kpis() + `
  <section class="panel">
    <h2>The board — ${R.rows.length} pre-token protocols by implied launch value</h2>
    <div class="controls">
      <input type="search" id="q" placeholder="Search name or slug…" value="${esc(state.q)}" aria-label="Search">
      <select id="cat" aria-label="Category"><option value="">All categories</option>${categories().map((c) => `<option ${c === state.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="chain" aria-label="Chain"><option value="">All chains</option>${chains().map((c) => `<option ${c === state.chain ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="verdict" aria-label="Farm verdict"><option value="">Any verdict</option>${['FARM', 'THIN', 'SKIP'].map((v) => `<option ${v === state.verdict ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="sort" aria-label="Sort">
        ${[['rank', 'Sort: rank'], ['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['precedent', 'Sort: precedent'], ['growth', 'Sort: 7d growth'], ['age', 'Sort: age'], ['multiple', 'Sort: multiple']].map(([v, t]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <label class="check"><input type="checkbox" id="watch" ${state.watch ? 'checked' : ''}> Watchlist only</label>
      <button class="tool go" id="csv">Export CSV</button>
      <button class="tool" id="openpal">Ctrl+K palette</button>
    </div>
    ${pinStrip}${cmpBar}
    <p class="count">${rows.length} of ${R.rows.length} protocols shown. Select a row for its detail view: the model's arithmetic, its farm plan and a capital simulator. Pin rows to keep them in view; tick cmp on two or three to compare them.</p>
    <div style="overflow-x:auto"><table class="board"><thead><tr>
      <th>#</th><th>Protocol</th><th>Category</th><th>TVL</th><th>7d</th><th>Age</th><th>Precedent</th><th>Implied value</th><th>Farm</th><th></th>
    </tr></thead><tbody>${body}</tbody></table></div>
  </section>` + modelPanel() + funnelPanel() + livePanel();
}

function exportCSV() {
  const head = 'rank,slug,name,category,tvl_usd,change_7d_pct,age_days,precedent_pct,peer_token,peer_total,implied_value_usd,range_low_usd,range_high_usd,multiple,farm_verdict,farm_capital_usd,farm_fees_usd,fee_drag_pct,watchlist';
  const cell = (v) => (v === null || v === undefined ? '' : /[",]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  const lines = filtered().map((r) => [r.rank, r.slug, r.name, r.category || '', r.tvl_usd, r.change_7d ?? '', r.age_days ?? '', r.precedent_pct, r.peer_token, r.peer_total, r.implied_value_usd, r.range_low_usd, r.range_high_usd, r.multiple, r.farm.verdict, r.farm.capital_usd, r.farm.fees_usd, r.farm.fee_drag_pct, r.watchlist].map(cell).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head, ...lines].join('\n')], { type: 'text/csv' }));
  a.download = 'token-launch-radar-board.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- compare view ---------- */
function compareView() {
  const rs = cmp.map((s) => bySlug.get(s)).filter(Boolean);
  const maxV = Math.max(...rs.map((r) => r.implied_value_usd));
  const row = (label, fn) => `<tr><td style="text-align:left;color:var(--dim)">${label}</td>${rs.map((r) => `<td>${fn(r)}</td>`).join('')}</tr>`;
  return `<p><a class="back" href="#/">← back to the board</a></p>
  <section class="panel"><h2>Side by side — ${rs.map((r) => esc(r.name)).join(' vs ')}</h2>
  <div class="bars">${rs.map((r) => `<div class="bar-row"><span>${esc(r.name)}</span><div class="bar"><i style="width:${Math.max(2, (r.implied_value_usd / maxV) * 100)}%"></i></div><b>${fmt$(r.implied_value_usd)}</b></div>`).join('')}</div>
  <div style="overflow-x:auto"><table class="val">
    ${row('Rank', (r) => '#' + r.rank)}
    ${row('Category', (r) => esc(r.category || '—'))}
    ${row('Chains', (r) => esc(r.chains.join(', ') || '—'))}
    ${row('TVL', (r) => fmt$(r.tvl_usd))}
    ${row('TVL change, 7d', (r) => pct(r.change_7d))}
    ${row('Age without a token', (r) => (r.age_days === null ? 'unknown' : fmtN(r.age_days) + ' days'))}
    ${row('Implied launch value', (r) => '<b>' + fmt$(r.implied_value_usd) + '</b>')}
    ${row('Honest range', (r) => fmt$(r.range_low_usd) + ' – ' + fmt$(r.range_high_usd))}
    ${row('Implied / TVL', (r) => fmtX(r.multiple))}
    ${row('Precedent (token-like profile)', (r) => r.precedent_pct + '% · ' + r.peer_token + '/' + r.peer_total + ' category peers tokened')}
    ${row('Farm verdict', (r) => `<span class="badge ${r.farm.verdict}">${r.farm.verdict}</span>`)}
    ${row('Farm capital · fees · hold', (r) => `${fmt$(r.farm.capital_usd)} · $${r.farm.fees_usd.toFixed(2)} (${r.farm.fee_drag_pct}%) · ${r.farm.weeks} weeks`)}
    ${row('Detail', (r) => `<a class="back" href="#/p/${esc(r.slug)}">open →</a>`)}
  </table></div>
  <p class="note">Every figure is the board's own: implied values from the fitted surface, ranges from the comps' residuals, precedent from the logistic fit and its peer counts, farm figures from each protocol's costed plan.</p></section>`;
}

/* ---------- detail view: tabs for plan, model math, simulator ---------- */
let dtab = 'plan';
const simState = new Map();
function simFor(r) {
  if (!simState.has(r.slug)) simState.set(r.slug, { capital: r.farm.capital_usd, pool: 2, share: 0.25 });
  return simState.get(r.slug);
}
function simCalc(r) {
  const s = simFor(r);
  const at = (v) => (v * s.pool * s.share) / 10000;
  const fees = r.farm.fees_usd;
  const net = at(r.implied_value_usd) - fees;
  return {
    low: at(r.range_low_usd), mid: at(r.implied_value_usd), high: at(r.range_high_usd), fees,
    net, roi: s.capital > 0 ? (net / s.capital) * 100 : 0,
    breakeven: r.implied_value_usd * s.share > 0 ? (fees / (r.implied_value_usd * s.share)) * 10000 : 0,
  };
}
function simPanel(r) {
  const s = simFor(r), c = simCalc(r);
  const num = (id, val, step) => `<input type="number" id="${id}" value="${val}" step="${step}" min="0">`;
  return `<section class="panel"><h2>Capital simulator — what the plan pays under stated assumptions</h2>
    <p class="note">Scenario arithmetic, not a forecast. You set three assumptions; the page does the rest from this row's own
    figures. The reward pool is the share of the launch's implied value you assume is paid to farmers; your share is the slice
    of that pool you assume this one wallet earns. The plan's fees are gas-driven and do not scale with capital.</p>
    <div class="sim">
      <label>Your capital (USD) ${num('simcap', s.capital, '10')}</label>
      <label>Reward pool, % of implied value ${num('simpool', s.pool, '0.5')}</label>
      <label>Your share of the pool, % ${num('simshare', s.share, '0.1')}</label>
    </div>
    <div class="stats">
      <div class="stat"><b>${fmt$(c.low)} – ${fmt$(c.high)}</b><span>reward at the honest range</span></div>
      <div class="stat"><b>${fmt$(c.mid)}</b><span>reward at the implied value</span></div>
      <div class="stat"><b class="${c.net >= 0 ? 'pos' : 'neg'}">${c.net >= 0 ? '+' : '−'}${fmt$(Math.abs(c.net))}</b><span>net of the plan's $${c.fees.toFixed(2)} fees, at implied</span></div>
      <div class="stat"><b>${c.roi.toFixed(1)}%</b><span>net return on your capital</span></div>
    </div>
    <p class="note">Break-even: the pool would need to be <b>${c.breakeven.toFixed(2)}%</b> of the implied value (at your assumed share)
    for the reward to cover the plan's fees alone. Compare that with what launches in this category have historically shared —
    the model's job is the value and the precedent; the assumptions, and the call, are yours.</p>
  </section>`;
}

function detailView(r) {
  const f = R.fit, o = R.odds;
  const recomputed = Math.round(Math.pow(10, f.a + f.b * Math.log10(Math.max(1, r.tvl_usd)) + f.g * r.growth_term + r.category_adj_log10) * r.maturity_multiplier);
  const drift = Math.abs(recomputed - r.implied_value_usd) / r.implied_value_usd;
  const prec = Math.round(100 * sigmoid(o.a + o.b * Math.log10(Math.max(1, r.tvl_usd)) + o.c * Math.log10(1 + (r.age_days ?? 365))));
  const stat = (b, s) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`;
  const tabs = [['plan', 'Farm plan'], ['math', 'Model math'], ['sim', 'Simulator']].map(([k, t]) => `<button class="tab ${dtab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
  let body = '';
  if (dtab === 'plan') body = `<section class="panel"><h2>Farm plan — costed, with a verdict</h2>
    <div class="planhead"><span class="badge ${r.farm.verdict}">${r.farm.verdict}</span><span class="why">${esc(r.farm.verdict_reason)}. Gas is priced on ${esc(r.chains[0] || 'its main chain')} at $${r.farm.gas_per_tx_usd} a transaction, the plan's stated rate.</span></div>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </section>`;
  else if (dtab === 'math') body = `<section class="panel"><h2>How this value is derived — recomputed here, in the page</h2>
    <div class="calc">
      size line&nbsp;&nbsp;&nbsp;= 10^(${f.a} + ${f.b} × log10(${fmtN(r.tvl_usd)})) = ${fmt$(Math.pow(10, f.a + f.b * Math.log10(Math.max(1, r.tvl_usd))))}<br>
      momentum term = 10^(${f.g} × ${r.growth_term}) — its 7-day TVL change of ${pct(r.change_7d)}, winsorized, inside the fit<br>
      category term = 10^(${r.category_adj_log10}) from ${r.category_comps} comps in ${esc(r.category || '(none)')} → base ${fmt$(r.base_value_usd)}<br>
      track-record tilt × ${r.maturity_multiplier}<br>
      implied value = ${fmt$(recomputed)} <span class="ok">— recomputed in this page from the printed fit; ${drift < 0.005 ? 'matches' : 'within ' + (drift * 100).toFixed(1) + '% of'} the ${fmt$(r.implied_value_usd)} in board.json (fit constants are printed to 4 decimals)</span><br>
      honest range&nbsp;&nbsp;= ${fmt$(r.range_low_usd)} – ${fmt$(r.range_high_usd)} — the middle half of the comps' own residuals (10^${f.resid_q25} to 10^${f.resid_q75}) carried onto this row<br>
      precedent&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= ${prec}% <span class="ok">— recomputed here from the printed logistic fit; board.json carries ${r.precedent_pct}%</span> · raw peers: ${r.peer_token} of ${r.peer_total} protocols in ${esc(r.category || '(none)')} already record a token (snapshot-wide base rate ${o.base_rate_pct}%)
    </div>
    <p class="note">Read it as the market's own pricing carried across: protocols like this one, at this size, in this category,
    trade at these values today. It is a claim about what a launch would be worth if the record stayed as it is — not a prediction that a token comes.</p>
  </section>`;
  else body = simPanel(r);
  return `<p><a class="back" href="#/">← back to the board</a> &nbsp;<button class="tool pinb" data-pin="${esc(r.slug)}">${pins.has(r.slug) ? 'pinned' : 'pin this protocol'}</button></p>
  <div class="dhead"><h2>${esc(r.name)}</h2><span class="badge ${r.farm.verdict}">${r.farm.verdict}</span>${r.watchlist ? '<span class="watch">ON THE WATCHLIST</span>' : '<span class="slug">found under the watchlist floor</span>'}</div>
  <p class="note">${esc(r.slug)} · ${esc(r.category || 'uncategorised')} · on ${esc(r.chains.join(', ') || 'no named chain')} · records no token in the ${R.as_of} snapshot (no market cap, no CoinGecko id, no symbol).</p>
  <div class="stats">
    ${stat(fmt$(r.implied_value_usd), 'implied launch value · rank #' + r.rank)}
    ${stat(fmt$(r.tvl_usd), 'TVL')}
    ${stat(fmtX(r.multiple), 'implied / TVL')}
    ${stat(r.precedent_pct + '%', 'precedent · ' + r.peer_token + '/' + r.peer_total + ' peers tokened')}
    ${stat(r.age_days === null ? 'unknown' : fmtN(r.age_days) + ' days', 'tracked without a token')}
    ${stat(fmt$(r.farm.capital_usd), 'farm capital (plan below)')}
    ${stat('$' + r.farm.fees_usd.toFixed(2), `plan fees · ${r.farm.fee_drag_pct}% of capital`)}
    ${stat(r.farm.weeks + ' weeks', 'plan hold')}
  </div>
  <div class="tabs">${tabs}</div>
  ${body}`;
}

/* ---------- command palette ---------- */
let palIdx = 0;
function palItems() {
  const q = $('#palq').value.toLowerCase();
  const cmds = [
    { label: 'Go to the board', act: () => { location.hash = '#/'; } },
    { label: 'Compare selected protocols', act: () => { if (cmp.length >= 2) location.hash = '#/compare'; } },
    { label: 'Export the board as CSV (current filters)', act: exportCSV },
    { label: 'Clear pins', act: () => { pins.clear(); render(); } },
  ].filter((c) => c.label.toLowerCase().includes(q));
  const prots = R.rows.filter((r) => (r.name + ' ' + r.slug).toLowerCase().includes(q)).slice(0, 9)
    .map((r) => ({ label: `${r.name} — #${r.rank} · ${fmt$(r.implied_value_usd)} · precedent ${r.precedent_pct}%`, act: () => { location.hash = '#/p/' + r.slug; } }));
  return [...cmds, ...prots];
}
function palRender() {
  const items = palItems();
  palIdx = Math.min(palIdx, Math.max(0, items.length - 1));
  $('#pallist').innerHTML = items.map((it, i) => `<li class="${i === palIdx ? 'on' : ''}" data-pal="${i}">${esc(it.label)}</li>`).join('') || '<li class="none">no match</li>';
  $('#pallist').querySelectorAll('[data-pal]').forEach((li) => li.addEventListener('click', () => { palRun(items[+li.dataset.pal]); }));
}
function palRun(it) { if (!it) return; palClose(); it.act(); }
function palOpen() { $('#pal').hidden = false; $('#palq').value = ''; palIdx = 0; palRender(); $('#palq').focus(); }
function palClose() { $('#pal').hidden = true; }
$('#palq').addEventListener('input', () => { palIdx = 0; palRender(); });
$('#palq').addEventListener('keydown', (e) => {
  const items = palItems();
  if (e.key === 'ArrowDown') { palIdx = Math.min(palIdx + 1, items.length - 1); palRender(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { palIdx = Math.max(palIdx - 1, 0); palRender(); e.preventDefault(); }
  else if (e.key === 'Enter') palRun(items[palIdx]);
  else if (e.key === 'Escape') palClose();
});
$('#pal').addEventListener('click', (e) => { if (e.target === $('#pal')) palClose(); });
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#pal').hidden ? palOpen() : palClose(); } });

/* ---------- routing & wiring ---------- */
function render() {
  const app = $('#app');
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m && bySlug.has(m[1])) {
    app.innerHTML = detailView(bySlug.get(m[1]));
    window.scrollTo(0, 0);
    app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { dtab = b.dataset.tab; render(); }));
    app.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', () => { pins.has(b.dataset.pin) ? pins.delete(b.dataset.pin) : pins.add(b.dataset.pin); render(); }));
    const r = bySlug.get(m[1]), s = simFor(r);
    const wire = (id, key, parse) => { const el = $(id); if (el) el.addEventListener('input', () => { s[key] = parse(el.value); render(); const n = $(id); if (n) { n.focus(); n.setSelectionRange(String(n.value).length, String(n.value).length); } }); };
    if (dtab === 'sim') { wire('#simcap', 'capital', Number); wire('#simpool', 'pool', Number); wire('#simshare', 'share', Number); }
  } else if (location.hash === '#/compare' && cmp.length >= 2) {
    app.innerHTML = compareView();
    window.scrollTo(0, 0);
  } else {
    app.innerHTML = boardView();
    const go = (slug) => { location.hash = '#/p/' + slug; };
    app.querySelectorAll('.board tbody tr').forEach((tr) => {
      tr.addEventListener('click', (e) => { if (e.target.closest('.tools') || e.target.closest('label')) return; go(tr.dataset.slug); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(tr.dataset.slug); });
    });
    app.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pins.has(b.dataset.pin) ? pins.delete(b.dataset.pin) : pins.add(b.dataset.pin); render(); }));
    app.querySelectorAll('[data-cmp]').forEach((cb) => cb.addEventListener('change', () => {
      const s = cb.dataset.cmp;
      if (cb.checked) { if (cmp.length >= 3) { cb.checked = false; return; } cmp.push(s); } else { const i = cmp.indexOf(s); if (i >= 0) cmp.splice(i, 1); }
      render();
    }));
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('#csv', exportCSV); on('#openpal', palOpen);
    on('#clearpins', () => { pins.clear(); render(); });
    on('#clearcmp', () => { cmp.length = 0; render(); });
    on('#gocmp', () => { if (cmp.length >= 2) location.hash = '#/compare'; });
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
  `a fitted surface of market cap on TVL and momentum, plus a shrunk category term, prices every pre-token protocol; a logistic precedent model ` +
  `on the same snapshot rates how token-like each profile is; track record tilts the ranking; ` +
  `farm plans are costed from each protocol's own chain, category, TVL and age, and verdicted on fee drag (FARM ≤ 5%, THIN ≤ 15%, SKIP above).</p>` +
  `<p>Gas price list used by every plan (per transaction): Ethereum $12 · Base $0.80 · Arbitrum $0.60 · Optimism $0.60 · Avalanche $0.50 · BNB Chain $0.40 · Tron $0.30 · Polygon $0.10 · Solana $0.05 · Sui $0.05 · Aptos $0.05 · any other chain $0.50. ` +
  `The page renders with no network; the board it shows is the board.json the program wrote, and each detail view recomputes its value and its precedent from the printed fits.</p>`;
