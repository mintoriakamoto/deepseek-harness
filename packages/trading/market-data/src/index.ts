/**
 * Market data service: unified registry for quotes, bars, and real-time subscriptions.
 *
 * Providers register implementations via {@link MarketDataRegistry.register}, supporting
 * multi-provider fallback and consumer-specified routing. Subscriptions are grouped by
 * symbol for efficient broadcast.
 *
 * @module @deepseek-ai/dsh-market-data
 */

import { Context, Service, symbols } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import type { Fiber } from '@deepseek-ai/cordis'
import { brand } from '@deepseek-ai/dsh-brand'
import type {
  Bar,
  BarInterval,
  MarketDataProvider,
  MarketDataService,
  Quote,
  QuoteSubscription,
  QuoteSubscriptionCallback,
  Sentiment,
  SubscriptionId,
} from './types.ts'
import { MarketDataError } from './types.ts'

export * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    marketData: MarketDataRegistry
  }
}

/**
 * Provider registration: implementation of one or more market data operations
 * (getQuote, getBars, subscribe, getSentiment). A provider declares its supported
 * operations; fallback proceeds to the next registered provider on unsupported operation.
 */
export interface MarketDataProvider {
  /** Provider identifier (e.g., 'robinhood', 'polymarket', 'browser'). */
  readonly name: string

  /**
   * Get a real-time quote. Optional; consumer receives error if unsupported.
   */
  getQuote?: (symbol: string) => Promise<Quote>

  /**
   * Get historical bars. Optional; consumer receives error if unsupported.
   */
  getBars?: (symbol: string, interval: BarInterval, count: number) => Promise<readonly Bar[]>

  /**
   * Subscribe to real-time updates. Optional; consumer receives error if unsupported.
   * Callback may be async; implementation awaits each invocation (backpressure).
   * Returned subscription must include {@link QuoteSubscription.dispose}.
   */
  subscribe?: (symbol: string, callback: QuoteSubscriptionCallback) => Promise<QuoteSubscription>

  /**
   * Get aggregated sentiment. Optional; consumer receives error if unsupported.
   */
  getSentiment?: (symbols: readonly string[]) => Promise<readonly Sentiment[]>
}

/**
 * Registered provider with its owning fiber (for disposal tracking in HMR).
 */
interface RegisteredProvider {
  provider: MarketDataProvider
  fiber: Fiber
}

/**
 * Service: multi-provider registry with fallback and operation routing.
 *
 * Providers register in order and are tried in sequence until one supports
 * the requested operation. Disposal of a provider's fiber automatically
 * unregisters it.
 */
export class MarketDataRegistry extends Service implements MarketDataService {
  private providers: RegisteredProvider[] = []

  constructor(ctx: Context) {
    super(ctx, 'marketData')
  }

  /**
   * Register a provider implementation. Returns the disposer; disposal removes the provider.
   */
  register(provider: MarketDataProvider): () => void {
    const fiber = this.ctx[symbols.current]!
    const entry: RegisteredProvider = { provider, fiber }
    this.providers.push(entry)

    return () => {
      const idx = this.providers.indexOf(entry)
      if (idx !== -1) {
        this.providers.splice(idx, 1)
      }
    }
  }

  async getQuote(symbol: string, providerFilter?: MarketDataProvider): Promise<Quote> {
    const providers = providerFilter
      ? this.providers.filter(p => p.provider.name === providerFilter)
      : this.providers

    if (providers.length === 0) {
      throw new MarketDataError(
        providerFilter
          ? `No provider registered: ${providerFilter}`
          : 'No market data providers registered',
        'PROVIDER_NOT_FOUND',
      )
    }

    let lastError: Error | null = null

    for (const { provider } of providers) {
      if (!provider.getQuote) {
        const msg = `Provider ${provider.name} does not support getQuote`
        lastError = new MarketDataError(msg, 'OPERATION_NOT_SUPPORTED')
        continue
      }

      try {
        return await provider.getQuote(symbol)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new MarketDataError('All providers failed: getQuote', 'PROVIDER_EXHAUSTED')
  }

  async getBars(
    symbol: string,
    interval: BarInterval,
    count: number,
    providerFilter?: MarketDataProvider,
  ): Promise<readonly Bar[]> {
    const providers = providerFilter
      ? this.providers.filter(p => p.provider.name === providerFilter)
      : this.providers

    if (providers.length === 0) {
      throw new MarketDataError(
        providerFilter
          ? `No provider registered: ${providerFilter}`
          : 'No market data providers registered',
        'PROVIDER_NOT_FOUND',
      )
    }

    let lastError: Error | null = null

    for (const { provider } of providers) {
      if (!provider.getBars) {
        const msg = `Provider ${provider.name} does not support getBars`
        lastError = new MarketDataError(msg, 'OPERATION_NOT_SUPPORTED')
        continue
      }

      try {
        return await provider.getBars(symbol, interval, count)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new MarketDataError('All providers failed: getBars', 'PROVIDER_EXHAUSTED')
  }

  async subscribe(
    symbol: string,
    callback: QuoteSubscriptionCallback,
    providerFilter?: MarketDataProvider,
  ): Promise<QuoteSubscription> {
    const providers = providerFilter
      ? this.providers.filter(p => p.provider.name === providerFilter)
      : this.providers

    if (providers.length === 0) {
      throw new MarketDataError(
        providerFilter
          ? `No provider registered: ${providerFilter}`
          : 'No market data providers registered',
        'PROVIDER_NOT_FOUND',
      )
    }

    let lastError: Error | null = null

    for (const { provider } of providers) {
      if (!provider.subscribe) {
        const msg = `Provider ${provider.name} does not support subscribe`
        lastError = new MarketDataError(msg, 'OPERATION_NOT_SUPPORTED')
        continue
      }

      try {
        return await provider.subscribe(symbol, callback)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new MarketDataError('All providers failed: subscribe', 'PROVIDER_EXHAUSTED')
  }

  async getSentiment(
    symbols: readonly string[],
    providerFilter?: MarketDataProvider,
  ): Promise<readonly Sentiment[]> {
    const providers = providerFilter
      ? this.providers.filter(p => p.provider.name === providerFilter)
      : this.providers

    if (providers.length === 0) {
      throw new MarketDataError(
        providerFilter
          ? `No provider registered: ${providerFilter}`
          : 'No market data providers registered',
        'PROVIDER_NOT_FOUND',
      )
    }

    let lastError: Error | null = null

    for (const { provider } of providers) {
      if (!provider.getSentiment) {
        const msg = `Provider ${provider.name} does not support getSentiment`
        lastError = new MarketDataError(msg, 'OPERATION_NOT_SUPPORTED')
        continue
      }

      try {
        return await provider.getSentiment(symbols)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    throw new MarketDataError('All providers failed: getSentiment', 'PROVIDER_EXHAUSTED')
  }
}

/**
 * Helper: create a branded SubscriptionId.
 * @internal
 */
export function createSubscriptionId(): SubscriptionId {
  return brand<SubscriptionId>(randomUUID())
}
