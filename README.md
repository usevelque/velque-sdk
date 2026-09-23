# velque-sdk

JavaScript client for Velque, the order book for tokenized stocks on Solana.

It has three parts, each usable on its own:

| Module | What is in it |
| --- | --- |
| `velque-sdk/client` | Instruction builders for every program instruction, account decoders, session and Nasdaq clock helpers |
| `velque-sdk/clearing` | The auction clearing rule, ported line for line from the on-chain program |
| `velque-sdk/reference` | The oracle reference price: Nasdaq last trade times the token's dividend multiplier |

## Install

```bash
npm install github:usevelque/velque-sdk @solana/web3.js
```

## Read a market

```js
import { Connection, PublicKey } from '@solana/web3.js';
import { readMarket, readBook, readDay, bookPda, session } from 'velque-sdk';

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const market = new PublicKey('D7eareS94eDwofGZQHJK3egWz21hFbKAoYsh6CHBKSxU');

const mk = await readMarket(conn, market);
const now = Math.floor(Date.now() / 1000);

console.log(session(mk, now));             // 'day' or 'dark'
console.log(Number(mk.reference) / 1e6);   // reference price, quote units per whole token

const book = await readBook(conn, bookPda(market, mk.auctionId)); // current auction window
const day = await readDay(conn, market);                          // { bids, asks, slots }
```

## Place an order

Every builder takes the market snapshot from `readMarket`, so the same call works for SPL Token and Token-2022 mints.

```js
import { Transaction } from '@solana/web3.js';
import { placeDayIx, placeIx, ata, BUY, TIF_GTC, computeLimit } from 'velque-sdk';

const baseAcc = ata(wallet.publicKey, mk.baseMint, mk.baseProg);
const quoteAcc = ata(wallet.publicKey, mk.quoteMint, mk.quoteProg);

// Day: matches at once at resting prices, the rest waits in the book
const dayOrder = placeDayIx({ owner: wallet.publicKey, mk, side: BUY, price: 230_500_000n, qty: 100_000_000n, baseAcc, quoteAcc });

// Dark: waits in the current window and clears with everyone else at one price
const nightOrder = placeIx({ owner: wallet.publicKey, mk, side: BUY, price: 230_500_000n, qty: 100_000_000n, src: quoteAcc, tif: TIF_GTC });

const tx = new Transaction().add(computeLimit(300_000), session(mk, now) === 'day' ? dayOrder : nightOrder);
```

Prices are quote units per whole base token (USDC has 6 decimals, so `230_500_000n` is $230.50). Quantities are base units (xStocks have 8 decimals, so `100_000_000n` is one token).

## Replay an auction

```js
import { readBook, readMarket, bookPda, replay } from 'velque-sdk';

const book = await readBook(conn, bookPda(market, 4n));
const result = replay(book, await readMarket(conn, market));

console.log(result.ok);               // true if price, volume and every fill match the chain
console.log(result.price, result.volume, result.fills);
```

`replay` uses only the orders and the reference stored in the book. See [auction-replay](https://github.com/usevelque/auction-replay) for a command-line version.

