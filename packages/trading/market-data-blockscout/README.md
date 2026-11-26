# @deepseek-ai/dsh-market-data-blockscout

Blockscout blockchain provider for on-chain data: whale wallet tracking, smart contract verification, and transaction monitoring. Used by the trading system to verify Polymarket settlement contracts and monitor whale activity.

## Overview

Blockscout is a blockchain explorer providing REST APIs for Ethereum and EVM-compatible chains. This provider implements three core operations:

- **`getAddressInfo()`**: Fetch whale wallet details (balance, transaction count, token holdings)
- **`getContractABI()`**: Verify Polymarket settlement contract code and ABI
- **`getTransactions()`**: Monitor recent on-chain activity for execution signals

## Installation

```bash
pnpm add @deepseek-ai/dsh-market-data-blockscout
```

## Usage

### As a Plugin

Register the provider in your `cordis.yml`:

```yaml
plugins:
  market-data-blockscout:
    baseUrl: https://mainnet.blockscout.com/api
    apiKey: ${BLOCKSCOUT_API_KEY}
    cacheTtlMs: 60000
    debug: false
```

### Direct API Access

Once registered, access blockchain methods through the market data service or directly:

```typescript
// Get whale wallet details
const addressInfo = await blockscout.getAddressInfo('0x...');
console.log(`Balance: ${addressInfo.balance}, Txs: ${addressInfo.txCount}`);

// Verify settlement contract
const abi = await blockscout.getContractABI('0xPolymarket...');
console.log(`Contract: ${abi.name}, Verified: ${abi.isVerified}`);

// Monitor on-chain activity
const txs = await blockscout.getTransactions('0x...', 10);
txs.forEach(tx => console.log(`${tx.hash}: ${tx.status}`));
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | `https://mainnet.blockscout.com/api` | Blockscout API base URL |
| `apiKey` | string | undefined | Optional API key for rate-limit friendly access |
| `timeoutMs` | number | 10000 | Request timeout in milliseconds |
| `cacheTtlMs` | number | 60000 | Cache TTL for address info in milliseconds |
| `debug` | boolean | false | Enable debug logging |

## Data Types

### AddressInfo

```typescript
interface AddressInfo {
  address: string              // Checksum format
  balance: string              // ETH in wei
  txCount: number              // Total transactions
  tokenCount: number           // ERC20 tokens held
  isContract: boolean          // Contract flag
  lastActivityTime: number     // Unix timestamp (seconds)
}
```

### ContractABI

```typescript
interface ContractABI {
  address: string              // Contract address
  name: string                 // Contract name
  abi: unknown[]               // Raw ABI (function/event descriptors)
  isVerified: boolean          // Verification status
  compilerVersion?: string     // e.g., "0.8.19"
}
```

### TransactionRecord

```typescript
interface TransactionRecord {
  hash: string                 // Tx hash
  from: string                 // From address
  to: string | null            // To address (null for contract creation)
  value: string                // ETH value in wei
  gasUsed: string              // Gas consumed
  timestamp: number            // Unix timestamp (seconds)
  status: 'success' | 'failed' | 'pending'  // Execution status
}
```

## Caching

Address info responses are cached with a configurable TTL (default 60 seconds). Cache keys normalize addresses to lowercase for consistent lookups.

```typescript
// First call fetches from API
const info1 = await blockscout.getAddressInfo('0xAbCd...');

// Subsequent calls within TTL return cached result
const info2 = await blockscout.getAddressInfo('0xabcd...');

// Clear cache manually
provider.clearCache();
```

## Edge Cases and Limitations

- **Contract creation transactions**: `to` field is `null` for transactions that deploy new contracts
- **Large values**: Transaction amounts are returned as strings to preserve precision (BigInt required for arithmetic)
- **Unverified contracts**: `getContractABI()` works only for verified contracts on Blockscout
- **Chain support**: Defaults to Ethereum mainnet; configure `baseUrl` for other chains (Polygon, Arbitrum, etc.)
- **Rate limiting**: Blockscout free tier has rate limits; consider using `apiKey` for increased limits

## Known Limitations and Deferred Work

- Subscriptions not supported (Blockscout provides HTTP API only, no WebSocket)
- No historical data aggregation (transaction filtering/search deferred to consumer)
- ERC20 token details deferred to consumer (token balances tracked but not individual token info)
- Polygon/Arbitrum/Optimism support deferred (chain-agnostic config design ready, not tested)

## Model Experience

This provider is **model-visible** only through explicit consumer calls. It does not automatically inject blockchain data into model prompts. Consumers call methods directly and pass results to the model as part of their operation context.

**Token usage**: Minimal (100-200 tokens per call for typical address/contract data). Cache reduces repeat calls.

**KV-cache effects**: None (blockchain data is deterministic and cached at provider level, not at model attention layer).

## See Also

- [Market Data Service](../market-data) — parent service definition
- [Polymarket Settlement Verification](../execution-polymarket) — example consumer
- [Whale Activity Monitor](../market-data-whale) — related provider
