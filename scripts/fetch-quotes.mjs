// Fetches delayed quotes + daily history from Cboe's public delayed-quotes CDN
// and writes quotes.json for the dashboard.
// price/prevClose: quotes endpoint; spark: last 30 daily closes; 52wk range: last 252 trading days.
import { writeFileSync } from "node:fs";

const SYMBOLS = ["VOO", "VTI", "NVDA", "MSFT", "COST", "JPM", "BAH", "ACGL", "SFM"];
const UA = "Mozilla/5.0 (compatible; agent-watchlist/1.0)";

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const out = { updated: Date.now(), results: [] };

for (const t of SYMBOLS) {
  try {
    const q = await getJson(`https://cdn.cboe.com/api/global/delayed_quotes/quotes/${t}.json`);
    const h = await getJson(`https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/${t}.json`);
    const rows = (h?.data ?? []).filter((r) => r.close != null).slice(-252);
    if (!rows.length) throw new Error("no history");
    const qd = q?.data ?? {};
    const price = qd.current_price ?? rows[rows.length - 1].close;
    const prevClose = qd.prev_day_close ?? (rows.length > 1 ? rows[rows.length - 2].close : null);

    let spark = rows.slice(-30).map((r) => r.close);
    const lastTrade = (qd.last_trade_time ?? "").slice(0, 10);
    const lastHist = rows[rows.length - 1].date;
    if (lastTrade && lastHist && lastTrade > lastHist) spark = [...spark.slice(1), price];

    out.results.push({
      symbol: t,
      price,
      prevClose,
      high52: Math.max(...rows.map((r) => r.high ?? r.close)),
      low52: Math.min(...rows.map((r) => r.low ?? r.close)),
      spark,
    });
  } catch (e) {
    console.error(`${t}: ${e.message}`);
    out.results.push({ symbol: t, error: true });
  }
}

const ok = out.results.filter((r) => !r.error).length;
writeFileSync("quotes.json", JSON.stringify(out));
console.log(`wrote quotes.json (${ok}/${SYMBOLS.length} ok)`);
if (ok === 0) process.exit(1); // don't commit an all-error file
