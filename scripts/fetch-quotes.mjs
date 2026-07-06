// Fetches delayed quotes from Yahoo Finance and writes quotes.json for the dashboard.
import { writeFileSync } from "node:fs";

const SYMBOLS = ["VOO", "VTI", "NVDA", "MSFT", "COST", "JPM", "BAH", "ACGL", "SFM"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const out = { updated: Date.now(), results: [] };

for (const t of SYMBOLS) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=5m&range=1d&includePrePost=false`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const meta = res?.meta ?? {};
    const spark = (res?.indicators?.quote?.[0]?.close ?? []).filter((x) => x != null);
    out.results.push({
      symbol: t,
      price: meta.regularMarketPrice ?? (spark.length ? spark[spark.length - 1] : null),
      prevClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      high52: meta.fiftyTwoWeekHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? null,
      spark,
    });
  } catch (e) {
    console.error(`${t}: ${e.message}`);
    out.results.push({ symbol: t, error: true });
  }
}

writeFileSync("quotes.json", JSON.stringify(out));
console.log(`wrote quotes.json (${out.results.filter((r) => !r.error).length}/${SYMBOLS.length} ok)`);
