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

