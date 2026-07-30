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

