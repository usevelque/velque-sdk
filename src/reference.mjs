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

/** Token price on Jupiter (used as a cross-check). */
export async function jupiterPrice(mint) {
  const j = await getJson(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
  const t = j.find((x) => x.id === mint);
  return t?.usdPrice ? Number(t.usdPrice) : null;
}

function nyOffsetMin(sec) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const o = Object.fromEntries(f.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute) - Math.floor(sec / 60) * 60000) / 60000);
}

/**
 * Token reference price in quote units (micro-USDC per whole token), a multiple of tick.
 * Returns { price, share, multiplier, sources, reason } or { price: null, reason }.
 */
export async function nasdaqReference({ symbol, tick, multiplier = 1, jupiterMint, nowSec = Math.floor(Date.now() / 1000) }) {
  const got = await Promise.allSettled([nasdaqLast(symbol), yahooLast(symbol)]);
  const fresh = got.filter((g) => g.status === 'fulfilled').map((g) => g.value)
    .filter((q) => q.price > 0 && (q.at == null || nowSec - q.at <= MAX_AGE_S));
  const errors = got.filter((g) => g.status === 'rejected').map((g) => String(g.reason?.message || g.reason));
  let share = null;
  if (fresh.length >= 2) {
    const [a, b] = fresh;
    if ((Math.abs(a.price - b.price) / Math.min(a.price, b.price)) * 10_000 > AGREE_BPS) {
      return { price: null, reason: `sources disagree: ${a.source} ${a.price} vs ${b.source} ${b.price}` };
    }
    share = (a.price + b.price) / 2;
  } else if (fresh.length === 1) {
    const jup = jupiterMint ? await jupiterPrice(jupiterMint).catch(() => null) : null;
    const tokenGuess = fresh[0].price * multiplier;
    if (!jup || (Math.abs(jup - tokenGuess) / tokenGuess) * 10_000 > JUP_BPS) {
      return { price: null, reason: `one source (${fresh[0].source}) and no Jupiter confirmation` };
    }
    share = fresh[0].price;
  } else {
    return { price: null, reason: `no fresh source${errors.length ? ': ' + errors.join('; ') : ''}` };
  }
  const token = share * multiplier;
  const t = BigInt(tick);
  const price = (BigInt(Math.round(token * 1e6)) / t) * t;
  return { price, share, multiplier, sources: fresh.map((q) => `${q.source} ${q.price}`) };
}
