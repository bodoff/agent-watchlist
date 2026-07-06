// Fetches delayed quotes + daily history from Stooq and writes quotes.json for the dashboard.
// price/prevClose: Stooq delayed quote endpoint; spark: last 30 daily closes; 52wk range: last 252 trading days.
import { writeFileSync } from "node:fs";

const SYMBOLS = ["VOO", "VTI", "NVDA", "MSFT", "COST", "JPM", "BAH", "ACGL", "SFM"];
const UA = "Mozilla/5.0 (compatible; agent-watchlist/1.0)";

async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// Batch delayed quotes: Symbol,Date,Time,Open,High,Low,Close,Volume
const quoteCsv = await getText(
  `https://stooq.com/q/l/?s=${SYMBOLS.map((s) => s.toLowerCase() + ".us").join(",")}&f=sd2t2ohlcv&h&e=csv`,
);
const live = {};
for (const line of quoteCsv.trim().split("\n").slice(1)) {
  const [sym, date, , , , , close] = line.split(",");
  if (!sym || close === "N/D") continue;
  live[sym.replace(".US", "")] = { price: parseFloat(close), date };
}

const out = { updated: Date.now(), results: [] };

for (const t of SYMBOLS) {
  try {
    const hist = await getText(`https://stooq.com/q/d/l/?s=${t.toLowerCase()}.us&i=d`);
    const rows = hist
      .trim()
      .split("\n")
      .slice(1)
      .map((l) => l.split(","))
      .filter((c) => c.length >= 5 && c[4] !== "N/D")
      .slice(-252); // ~1 trading year
    if (!rows.length) throw new Error("no history");
    const closes = rows.map((c) => parseFloat(c[4]));
    const highs = rows.map((c) => parseFloat(c[2]));
    const lows = rows.map((c) => parseFloat(c[3]));
    const lastHistDate = rows[rows.length - 1][0];

    const lv = live[t];
    const price = lv?.price ?? closes[closes.length - 1];
    // If history already includes the live-quote date, previous close is one row back.
    const prevClose =
      lv && lastHistDate === lv.date && closes.length > 1
        ? closes[closes.length - 2]
        : closes[closes.length - 1] === price && closes.length > 1
          ? closes[closes.length - 2]
          : closes[closes.length - 1];

    let spark = closes.slice(-30);
    if (lv && lastHistDate !== lv.date) spark = [...spark.slice(1), lv.price];

    out.results.push({
      symbol: t,
      price,
      prevClose,
      high52: Math.max(...highs),
      low52: Math.min(...lows),
      spark,
    });
  } catch (e) {
    console.error(`${t}: ${e.message}`);
    out.results.push({ symbol: t, error: true });
  }
}

writeFileSync("quotes.json", JSON.stringify(out));
console.log(`wrote quotes.json (${out.results.filter((r) => !r.error).length}/${SYMBOLS.length} ok)`);
