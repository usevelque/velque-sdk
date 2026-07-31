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

