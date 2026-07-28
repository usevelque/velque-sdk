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

