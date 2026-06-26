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

