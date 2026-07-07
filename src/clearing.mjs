// Velque clearing in JS: a line-by-line port of program/src/clearing.rs.
// The app uses it so that anyone can recompute a cleared window from its orders
// and check the price and fills against what the program recorded.
// All numbers are BigInt. orders: [{ side: 'buy'|'sell', price, qty, live }].

const min = (a, b) => (a < b ? a : b);
const max = (a, b) => (a > b ? a : b);
const absDiff = (a, b) => (a > b ? a - b : b - a);

function sorted(orders) {
  // stable sort of live orders by price, matching the program's insertion sort
  return orders.map((o, i) => [o, i]).filter(([o]) => o.live)
    .sort((x, y) => (x[0].price < y[0].price ? -1 : x[0].price > y[0].price ? 1 : x[1] - y[1]))
    .map(([, i]) => i);
}

export function findPrice(orders, reference, tick) {
  const idx = sorted(orders);
  let buyTotal = 0n;
  for (const i of idx) if (orders[i].side === 'buy') buyTotal += orders[i].qty;
  let best = null;
  let lo = 0n, hi = 0n, sellLe = 0n, buyBelow = 0n;
  for (let g = 0; g < idx.length;) {
    const p = orders[idx[g]].price;
    let end = g, gb = 0n, gs = 0n;
    while (end < idx.length && orders[idx[end]].price === p) {
      const o = orders[idx[end]];
      if (o.side === 'buy') gb += o.qty; else gs += o.qty;
      end++;
    }
    sellLe += gs;
    const buyGe = buyTotal - buyBelow;
    const exec = min(buyGe, sellLe);
    if (exec > 0n) {
      const imb = max(buyGe, sellLe) - exec;
      const dist = absDiff(p, reference);
      if (!best) { best = [exec, imb, dist]; lo = hi = p; }
      else {
        const [be, bi, bd] = best;
        const better = exec > be || (exec === be && imb < bi) || (exec === be && imb === bi && dist < bd);
        if (better) { best = [exec, imb, dist]; lo = hi = p; }
        else if (exec === be && imb === bi && dist === bd) hi = p;
      }
    }
    buyBelow += gb;
    g = end;
  }
  if (!best) return { price: 0n, volume: 0n, imbalance: 0n };
  const price = lo === hi ? lo : ((lo + hi) / 2n / tick) * tick;
  return { price, volume: best[0], imbalance: best[1] };
}

function fillGroup(orders, group, side, lot, state, fills) {
  let total = 0n;
  for (const i of group) if (orders[i].side === side) total += orders[i].qty;
  if (total === 0n) return;
  if (total <= state.remaining) {
    for (const i of group) if (orders[i].side === side) fills[i] = orders[i].qty;
    state.remaining -= total;
    return;
  }
  const rem = state.remaining;
  let given = 0n;
  for (const i of group) {
    if (orders[i].side !== side) continue;
    const share = ((orders[i].qty * rem) / total / lot) * lot;
    fills[i] = share;
    given += share;
  }
  let left = rem - given;
  const order = group.filter((i) => orders[i].side === side).sort((a, b) => a - b);
  for (const i of order) {
    if (left < lot) break;
    if (fills[i] + lot <= orders[i].qty) { fills[i] += lot; left -= lot; }
  }
  state.remaining = 0n;
}

