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

