// Velque program client: builds instructions and reads accounts.
// The byte layout is defined in program/src/state.rs; the offsets here match it (v3).
// Instructions that need the mints, token programs and vaults take the market
// snapshot `mk` from readMarket, so Token and Token-2022 are handled the same way.
import { PublicKey, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('MXG3VzXQucitJ4MSWWd1ddEat5FRS8KFF5j1uZRW7jz');
export const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const BUY = 0;
export const SELL = 1;
export const TIF_ONE = 0;
export const TIF_GTC = 1;
export const ENTRY = 80;
export const HEADER = 128;
export const MARKET_TAG = 7;
export const BOOK_TAG = 7;

const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const acc = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable });
const ro = (pubkey) => acc(pubkey, false, false);
const w = (pubkey) => acc(pubkey, false, true);
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

export const ata = (owner, mint, prog = TOKEN) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), prog.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
export const marketPda = (baseMint) => pda([Buffer.from('market'), baseMint.toBuffer()]);
export const bookPda = (market, id) => pda([Buffer.from('book'), market.toBuffer(), u64(id)]);

export const computeLimit = (units) => ComputeBudgetProgram.setComputeUnitLimit({ units });

/** Accounts for one side: base for a sell, quote for a buy. */
const legKeys = (mk, side, userAcc) => side === SELL
  ? [w(userAcc), w(mk.vbase), ro(mk.baseMint), ro(mk.baseProg)]
  : [w(userAcc), w(mk.vquote), ro(mk.quoteMint), ro(mk.quoteProg)];

/** Both sides: base account, quote account, two vaults, two mints, two programs. */
const bothKeys = (mk, baseAcc, quoteAcc) => [
  w(baseAcc), w(quoteAcc), w(mk.vbase), w(mk.vquote),
  ro(mk.baseMint), ro(mk.quoteMint), ro(mk.baseProg), ro(mk.quoteProg),
];

export function initMarketIx({ authority, baseMint, quoteMint, baseProg = TOKEN, quoteProg = TOKEN, windowSecs, tick, lot, reference, maxAge, bandBps, minNotional }) {
  const market = marketPda(baseMint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      acc(authority, true, true), w(market), ro(baseMint), ro(quoteMint),
      w(ata(market, baseMint, baseProg)), w(ata(market, quoteMint, quoteProg)),
      ro(baseProg), ro(quoteProg), ro(ATA_PROGRAM), ro(SystemProgram.programId),
    ],
    data: Buffer.concat([Buffer.from([0]), u64(windowSecs), u64(tick), u64(lot), u64(reference), u64(maxAge), u64(bandBps), u64(minNotional)]),
  });
}

/** Order into the current window's auction (Dark only). */
export function placeIx({ owner, mk, side, price, qty, src, tif = 0 }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [acc(owner, true, true), ro(mk.address), w(bookPda(mk.address, mk.auctionId)), ...legKeys(mk, side, src), ro(SystemProgram.programId)],
    data: Buffer.concat([Buffer.from([1, side]), u64(price), u64(qty), Buffer.from([tif])]),
  });
}

export function cancelIx({ owner, mk, index, side, dest }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [acc(owner, true, false), ro(mk.address), w(bookPda(mk.address, mk.auctionId)), ...legKeys(mk, side, dest)],
    data: Buffer.concat([Buffer.from([2]), u16(index)]),
  });
}

/** Clear the window. During Day, if the window holds orders, this is the opening cross. */
export function clearIx({ cranker, mk }) {
  const m = mk.address;
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      acc(cranker, true, true), w(m), w(bookPda(m, mk.auctionId)),
      w(bookPda(m, BigInt(mk.auctionId) + 1n)), w(dayPda(m)), ro(SystemProgram.programId),
    ],
    data: Buffer.from([3]),
  });
}

export function claimIx({ owner, mk, book, index, baseDest, quoteDest }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [acc(owner, true, false), ro(mk.address), w(book), ...bothKeys(mk, baseDest, quoteDest)],
    data: Buffer.concat([Buffer.from([4]), u16(index)]),
  });
}

export function setReferenceIx({ authority, market, price }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [acc(authority, true, false), w(market)],
    data: Buffer.concat([Buffer.from([5]), u64(price)]),
  });
}

export function closeBookIx({ book, payer }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [w(book), w(payer)],
    data: Buffer.from([6]),
  });
}

/** The book is fully settled and can be closed (see close_book in the program). */
export const isSettled = (book) => book.cleared && book.orders.every((o) =>
  o.status === 'cancelled' || o.status === 'claimed' || (o.status === 'live' && o.filled === 0n && o.escrow === 0n));

/** 'day' while the reference is fresh, otherwise 'dark'. now is in unix seconds. */
export const session = (mk, now) =>
  mk.refAt > 0 && now >= mk.refAt && now - mk.refAt <= Number(mk.maxAge) ? 'day' : 'dark';

const rd = (d, o) => d.readBigUInt64LE(o);
const key = (d, o) => new PublicKey(d.subarray(o, o + 32));

export async function readMarket(conn, market) {
  const a = await conn.getAccountInfo(market);
  if (!a) return null;
  const d = a.data;
  return {
    address: market, baseDecimals: d[2], quoteDecimals: d[3], decimals: d[2],
    authority: key(d, 8), baseMint: key(d, 40), quoteMint: key(d, 72), baseProg: key(d, 104), quoteProg: key(d, 136),
    vbase: key(d, 168), vquote: key(d, 200),
    windowSecs: rd(d, 232), tick: rd(d, 240), lot: rd(d, 248), auctionId: rd(d, 256),
    windowStart: Number(d.readBigInt64LE(264)), windowEnd: Number(d.readBigInt64LE(272)),
    reference: rd(d, 280), lastPrice: rd(d, 288), auctionsCleared: rd(d, 296),
    refAt: Number(d.readBigInt64LE(304)), maxAge: rd(d, 312), bandBps: rd(d, 320), daySeq: rd(d, 328), minNotional: rd(d, 336),
  };
}

const STATUS = { 1: 'live', 2: 'cancelled', 3: 'claimed' };

export async function readBook(conn, book) {
  const a = await conn.getAccountInfo(book);
  if (!a) return null;
  const d = a.data;
  const n = d.readUInt16LE(4);
  const orders = [];
  for (let i = 0; i < n; i++) {
    const o = HEADER + i * ENTRY;
    orders.push({
      index: i, owner: key(d, o), price: rd(d, o + 32), qty: rd(d, o + 40), filled: rd(d, o + 48),
      escrow: rd(d, o + 56), side: d[o + 64] === BUY ? 'buy' : 'sell', status: STATUS[d[o + 65]] ?? 'empty',
      tif: d[o + 66] === 1 ? 'gtc' : 'one',
    });
  }
  return {
    address: book, cleared: d[2] === 1, auctionId: rd(d, 40), windowEnd: Number(d.readBigInt64LE(48)),
    clearPrice: rd(d, 56), volume: rd(d, 64), imbalance: rd(d, 72), reference: rd(d, 80),
    clearedAt: Number(d.readBigInt64LE(88)), payer: key(d, 96), orders,
  };
}

// ---------------------------------------------------------------- Nasdaq hours
// Regular session 9:30 to 16:00 New York time, weekdays, excluding exchange holidays.
// The keeper updates the reference only during these hours; once it stops, the
// reference goes stale and the on-chain market falls into Dark by itself.
const HOLIDAYS = new Set([
  '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});

function nyParts(sec) {
  const p = Object.fromEntries(NY.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function nasdaqOpen(sec) {
  const p = nyParts(sec);
  if (p.weekday === 'Sat' || p.weekday === 'Sun' || HOLIDAYS.has(p.date)) return false;
  return p.minutes >= 570 && p.minutes < 960;
}

