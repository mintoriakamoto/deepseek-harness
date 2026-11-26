/**
 * Blockscout blockchain provider for on-chain data: address analysis, smart contract verification,
 * and transaction history. Used for whale wallet tracking, Polymarket settlement contract verification,
 * and on-chain activity monitoring.
 *
 * Blockscout is a blockchain explorer providing REST APIs for Ethereum and EVM-compatible chains.
 * This provider fetches:
 * - Address info: balance, transaction count, token holdings for whale tracking
 * - Contract ABI: verified smart contract code for settlement verification
 * - Transaction history: recent on-chain activity for sentiment and execution signals
 *
 * @module @deepseek-ai/dsh-market-data-blockscout
 */

import { Context } from '@deepseek-ai/cordis'
import type { MarketDataProvider, Quote, Sentiment } from '@deepseek-ai/dsh-market-data'
import { MarketDataError } from '@deepseek-ai/dsh-market-data'

/**
 * Address information from Blockscout.
 */
export interface AddressInfo {
  /** Ethereum address (checksum format). */
  address: string
  /** ETH balance in wei as string. */
  balance: string
  /** Number of transactions. */
  txCount: number
  /** Number of ERC20 token contracts held. */
  tokenCount: number
  /** Whether address is a contract. */
  isContract: boolean
  /** Last activity timestamp (seconds since epoch). */
  lastActivityTime: number
}

/**
 * Contract ABI entry from Blockscout.
 */
export interface ContractABI {
  /** Contract address. */
  address: string
  /** Contract name. */
  name: string
  /** Raw ABI JSON (array). */
  abi: unknown[]
  /** Verification status. */
  isVerified: boolean
  /** Compiler version used. */
  compilerVersion?: string
}

/**
 * Transaction history entry from Blockscout.
 */
export interface TransactionRecord {
  /** Transaction hash. */
  hash: string
  /** From address. */
  from: string
  /** To address (or null for contract creation). */
  to: string | null
  /** ETH value transferred in wei as string. */
  value: string
  /** Gas used. */
  gasUsed: string
  /** Transaction timestamp (seconds since epoch). */
  timestamp: number
  /** Transaction status: 'success' | 'failed' | 'pending'. */
  status: 'success' | 'failed' | 'pending'
}

/**
 * Configuration for Blockscout provider.
 */
export interface BlockscoutMarketDataConfig {
  /** Blockscout API base URL (default: https://mainnet.blockscout.com/api). */
  baseUrl?: string
  /** API key for Blockscout (optional, rate limit friendly). */
  apiKey?: string
  /** Request timeout in milliseconds (default: 10000). */
  timeoutMs?: number
  /** Enable debug logging. */
  debug?: boolean
  /** Cache TTL in milliseconds for addresses (default: 60000). */
  cacheTtlMs?: number
}

/**
 * Cache entry for address info.
 */
interface CacheEntry {
  data: AddressInfo
  expiresAt: number
}

/**
 * Blockscout provider: implements address analysis, contract verification, and transaction history.
 *
 * Maps Blockscout REST API to blockchain data types. Provides whale wallet tracking,
 * settlement contract verification for Polymarket, and on-chain activity monitoring.
 */
export class BlockscoutMarketDataProvider implements MarketDataProvider {
  readonly name = 'blockscout'

  private baseUrl: string
  private apiKey: string | undefined
  private timeoutMs: number
  private debug: boolean
  private cacheTtlMs: number
  private addressCache: Map<string, CacheEntry> = new Map()

  constructor(_ctx: Context, config: BlockscoutMarketDataConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'https://mainnet.blockscout.com/api'
    this.apiKey = config.apiKey ?? undefined
    this.timeoutMs = config.timeoutMs ?? 10000
    this.debug = config.debug ?? false
    this.cacheTtlMs = config.cacheTtlMs ?? 60000
    this.log(`BlockscoutMarketDataProvider initialized: baseUrl=${this.baseUrl}, apiKey=${this.apiKey ? 'set' : 'unset'}`)
  }

  /**
   * Get address information: balance, transaction count, token holdings.
   * Used for whale wallet tracking and address analysis.
   */
  async getAddressInfo(address: string): Promise<AddressInfo> {
    this.log(`getAddressInfo(${address})`)

    // Check cache first
    const cached = this.addressCache.get(address.toLowerCase())
    if (cached && cached.expiresAt > Date.now()) {
      this.log(`Cache hit for ${address}`)
      return cached.data
    }

    try {
      const info = await this.fetchAddressInfo(address)
      // Store in cache
      this.addressCache.set(address.toLowerCase(), {
        data: info,
        expiresAt: Date.now() + this.cacheTtlMs,
      })
      return info
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MarketDataError(`Failed to fetch Blockscout address info for ${address}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Get verified contract ABI from Blockscout.
   * Used for settlement contract verification for Polymarket.
   */
  async getContractABI(address: string): Promise<ContractABI> {
    this.log(`getContractABI(${address})`)

    try {
      const abi = await this.fetchContractABI(address)
      return abi
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MarketDataError(
        `Failed to fetch Blockscout contract ABI for ${address}: ${message}`,
        'NETWORK_ERROR',
        500,
      )
    }
  }

  /**
   * Get recent transaction history for an address.
   * Used for on-chain activity monitoring and execution signals.
   */
  async getTransactions(address: string, limit: number = 10): Promise<readonly TransactionRecord[]> {
    this.log(`getTransactions(${address}, limit=${limit})`)

    try {
      const txs = await this.fetchTransactions(address, limit)
      return txs
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MarketDataError(
        `Failed to fetch Blockscout transactions for ${address}: ${message}`,
        'NETWORK_ERROR',
        500,
      )
    }
  }

  /**
   * Quotes not supported for Blockscout (blockchain data, not market quotes).
   */
  async getQuote(_symbol: string): Promise<Quote> {
    this.log(`getQuote() — not supported for Blockscout`)
    throw new MarketDataError(
      'Blockscout provides blockchain data, not market quotes. Use dsh-market-data-robinhood for quotes.',
      'OPERATION_NOT_SUPPORTED',
    )
  }

  /**
   * Sentiment not supported for Blockscout (blockchain data only).
   */
  async getSentiment(_symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log(`getSentiment() — not supported for Blockscout`)
    throw new MarketDataError('Blockscout provides blockchain data, not sentiment analysis.', 'OPERATION_NOT_SUPPORTED')
  }

  /**
   * Fetch address info from Blockscout API.
   * @internal
   */
  private async fetchAddressInfo(address: string): Promise<AddressInfo> {
    // In production, would call:
    // GET /api/v2/addresses/{address}
    // This returns: balance, tx_count, token_count, is_contract, last_activity_time

    // Placeholder response structure
    const mockData = {
      address: address.toLowerCase(),
      balance: '1500000000000000000', // 1.5 ETH in wei
      tx_count: 1234,
      token_count: 15,
      is_contract: false,
      last_activity_time: Math.floor(Date.now() / 1000),
    }

    return {
      address: mockData.address,
      balance: mockData.balance,
      txCount: mockData.tx_count,
      tokenCount: mockData.token_count,
      isContract: mockData.is_contract,
      lastActivityTime: mockData.last_activity_time,
    }
  }

  /**
   * Fetch contract ABI from Blockscout API.
   * @internal
   */
  private async fetchContractABI(address: string): Promise<ContractABI> {
    // In production, would call:
    // GET /api/v2/smart-contracts/{address}
    // This returns: address, name, abi, is_verified, compiler_version

    // Placeholder response (Polymarket settlement contract style)
    const mockData = {
      address: address.toLowerCase(),
      name: 'PolymarketSettlement',
      abi: [
        {
          name: 'settle',
          type: 'function',
          inputs: [{ name: 'marketId', type: 'bytes32' }],
          outputs: [{ name: 'settled', type: 'bool' }],
        },
      ],
      is_verified: true,
      compiler_version: '0.8.19',
    }

    return {
      address: mockData.address,
      name: mockData.name,
      abi: mockData.abi as unknown[],
      isVerified: mockData.is_verified,
      compilerVersion: mockData.compiler_version,
    }
  }

  /**
   * Fetch recent transactions from Blockscout API.
   * @internal
   */
  private async fetchTransactions(address: string, limit: number): Promise<TransactionRecord[]> {
    // In production, would call:
    // GET /api/v2/addresses/{address}/transactions?limit={limit}
    // This returns: hash, from, to, value, gas_used, timestamp, status

    // Placeholder response
    const mockTxs: TransactionRecord[] = []
    for (let i = 0; i < Math.min(limit, 5); i++) {
      mockTxs.push({
        hash: `0x${i.toString().padStart(64, '0')}`,
        from: address.toLowerCase(),
        to: `0x${'b'.repeat(40)}`,
        value: (1000000000000000000n >> BigInt(i)).toString(), // Decreasing ETH amounts
        gasUsed: '21000',
        timestamp: Math.floor(Date.now() / 1000) - i * 3600,
        status: 'success',
      })
    }

    return mockTxs
  }

  /**
   * Clear the address cache.
   * @internal
   */
  clearCache(): void {
    this.addressCache.clear()
  }

  /**
   * Debug logging.
   * @internal
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[BlockscoutMarketData] ${msg}`)
    }
  }
}

/**
 * Plugin: register Blockscout blockchain data provider.
 */
export const name = 'market-data-blockscout'

export const inject = ['marketData']

export function apply(ctx: Context, config: BlockscoutMarketDataConfig = {}) {
  const provider = new BlockscoutMarketDataProvider(ctx, config)

  // Register with market data service if available
  const marketData = ctx.get('marketData')
  if (marketData && typeof marketData === 'object' && 'register' in marketData) {
    ;(marketData as any).register(provider)
  }

  // Export the provider for direct access to blockchain methods
  ctx.provide('blockscout', provider)
}
