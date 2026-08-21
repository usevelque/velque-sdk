// Velque reference price: the last Nasdaq trade for the stock, taken from two
// independent free sources and converted to one token unit through the
// ScaledUiAmount multiplier. Signed by the market's oracle key (set_reference).
//
// Rules that keep bad data off the chain:
//   - a source is valid if its trade is at most MAX_AGE_S seconds old;
//   - two valid sources must agree within AGREE_BPS, and their average is used;
//   - a single valid source is accepted if the token price on Jupiter is close
//     (JUP_BPS); otherwise no reference is set and the market stays in Dark.

const MAX_AGE_S = 120;
const AGREE_BPS = 50;   // 0.5%
const JUP_BPS = 300;    // 3%
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; velque-oracle/1.0)', accept: 'application/json' };

async function getJson(url, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Nasdaq: last trade of the regular session. */
export async function nasdaqLast(symbol) {
  const j = await getJson(`https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=stocks`);
  const p = j?.data?.primaryData;
  if (!p?.lastSalePrice) throw new Error('nasdaq: no price');
  const price = Number(String(p.lastSalePrice).replace(/[$,]/g, ''));
  // "Sep 30, 2026 10:13 AM ET" -> unix; the time is New York local
  const m = String(p.lastTradeTimestamp || '').match(/([A-Za-z]{3}) (\d+), (\d{4}) (\d+):(\d+) (AM|PM)/);
  let at = null;
  if (m) {
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]);
    let h = Number(m[4]) % 12 + (m[6] === 'PM' ? 12 : 0);
    const guess = Date.UTC(+m[3], mon, +m[2], h, +m[5]) / 1000;
    at = guess + nyOffsetMin(guess) * -60; // NY local -> UTC
  }
  return { source: 'nasdaq', price, at };
}

/** Yahoo Finance: price and time of the last regular-session trade. */
export async function yahooLast(symbol) {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`);
  const m = j?.chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) throw new Error('yahoo: no price');
  return { source: 'yahoo', price: Number(m.regularMarketPrice), at: Number(m.regularMarketTime) };
}

