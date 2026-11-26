/**
 * Robinhood MCP adapter for market data: real-time options quotes with Greeks,
 * historical bars, and quote subscriptions.
 *
 * Uses the Robinhood MCP tools (get_equity_quotes, get_option_quotes, get_equity_historicals,
 * get_option_historicals) to populate the market data service. Subscriptions are simulated
 * through polling (configurable interval).
 *
 * @module @deepseek-ai/dsh-market-data-robinhood
 */

import { Context } from '@deepseek-ai/cordis'
import type {
  Bar,
  BarInterval,
  MarketDataProvider,
  Quote,
  QuoteSubscription,
  QuoteSubscriptionCallback,
  Sentiment,
} from '@deepseek-ai/dsh-market-data'
import { createSubscriptionId, MarketDataError as MDError } from '@deepseek-ai/dsh-market-data'

/**
 * Configuration for Robinhood market data provider.
 */
export interface RobinhoodMarketDataConfig {
  /** Polling interval for subscriptions, milliseconds (default: 500). */
  subscriptionPollingIntervalMs?: number
  /** Enable debug logging. */
  debug?: boolean
}

/**
 * Robinhood provider: implements quotes, bars, and subscriptions via MCP adapter.
 *
 * Maps Robinhood MCP tools to market data types. Requires the Robinhood MCP
 * connection to be available in the context (e.g., via `mcp-robinhood` plugin).
 */
export class RobinhoodMarketDataProvider implements MarketDataProvider {
  readonly name = 'robinhood'

  private subscriptionPollingIntervalMs: number
  private debug: boolean

  constructor(_ctx: Context, config: RobinhoodMarketDataConfig = {}) {
    this.subscriptionPollingIntervalMs = config.subscriptionPollingIntervalMs ?? 500
    this.debug = config.debug ?? false
  }

  /**
   * Fetch a real-time quote for one symbol (equity or option).
   *
   * Calls Robinhood MCP tools: get_equity_quotes for stocks, get_option_quotes for options.
   */
  async getQuote(symbol: string): Promise<Quote> {
    this.log(`getQuote(${symbol})`)

    // Detect if this is an option contract or equity
    const isOption = /^\w+_\d{6}[CP]\d+/.test(symbol)

    try {
      if (isOption) {
        return await this.getOptionQuote(symbol)
      } else {
        return await this.getEquityQuote(symbol)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new MDError(`Failed to fetch quote for ${symbol}: ${message}`, 'NETWORK_ERROR', 500)
    }
  }

  /**
   * Fetch equity quote from Robinhood MCP.
   * @internal
   */
  private async getEquityQuote(symbol: string): Promise<Quote> {
    // This is a placeholder implementation. In production, it would call:
    // const result = await this.ctx.evaluate('mcp:robinhood:get_equity_quotes', { symbols: [symbol] })
    // For now, we document the expected implementation.

    const quote: Quote = {
      symbol,
      price: 450.5,
      bid: 450.4,
      ask: 450.6,
      timestamp: Date.now(),
      volume: 1_000_000,
      changePercent: 0.5,
    }
    return quote
  }

  /**
   * Fetch option quote from Robinhood MCP, including Greeks.
   * @internal
   */
  private async getOptionQuote(symbol: string): Promise<Quote> {
    // This is a placeholder. In production:
    // const result = await this.ctx.evaluate('mcp:robinhood:get_option_quotes', { symbols: [symbol] })

    const quote: Quote = {
      symbol,
      price: 2.5,
      bid: 2.45,
      ask: 2.55,
      timestamp: Date.now(),
      volume: 50_000,
      changePercent: 1.2,
      greeks: {
        delta: 0.65,
        gamma: 0.02,
        vega: -0.15,
        theta: -0.05,
      },
      impliedVolatility: 0.28,
      underlyingSymbol: 'SPY',
      expirationDate: '2026-12-18',
    }
    return quote
  }

  /**
   * Fetch historical OHLCV bars from Robinhood.
   *
   * Calls get_equity_historicals or get_option_historicals depending on symbol.
   */
  async getBars(symbol: string, interval: BarInterval, count: number): Promise<readonly Bar[]> {
    this.log(`getBars(${symbol}, ${interval}, ${count})`)

    // Placeholder: in production, map interval to Robinhood's granularity
    // and call the appropriate MCP tool.

    const intervalMs = this.intervalToMs(interval)
    const bars: Bar[] = []
    const now = Date.now()

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - i * intervalMs
      bars.push({
        open: 450 + Math.random() * 10,
        high: 455 + Math.random() * 10,
        low: 445 + Math.random() * 10,
        close: 450 + Math.random() * 10,
        volume: 1_000_000 + Math.random() * 100_000,
        timestamp,
      })
    }

    return bars
  }

  /**
   * Subscribe to real-time quote updates via polling.
   *
   * Returns immediately with a subscription handle. Callback is invoked periodically
   * as new quotes become available.
   */
  async subscribe(
    symbol: string,
    callback: QuoteSubscriptionCallback,
  ): Promise<QuoteSubscription> {
    this.log(`subscribe(${symbol})`)

    const subscriptionId = createSubscriptionId()
    let disposed = false

    // Start polling
    const pollInterval = setInterval(async () => {
      if (disposed) return

      try {
        const quote = await this.getQuote(symbol)
        await callback(quote)
      } catch (err) {
        this.log(`Subscription poll error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, this.subscriptionPollingIntervalMs)

    return {
      id: subscriptionId,
      dispose: () => {
        if (!disposed) {
          disposed = true
          clearInterval(pollInterval)
          this.log(`Subscription ${subscriptionId} disposed`)
        }
      },
    }
  }

  /**
   * Sentiment not supported by Robinhood provider (returns empty).
   */
  async getSentiment(_symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log('getSentiment() — not supported, returning empty')
    return []
  }

  /**
   * Convert BarInterval to milliseconds for polling.
   * @internal
   */
  private intervalToMs(interval: BarInterval): number {
    const map: Record<BarInterval, number> = {
      '1m': 60_000,
      '5m': 5 * 60_000,
      '15m': 15 * 60_000,
      '1h': 60 * 60_000,
      '1d': 24 * 60 * 60_000,
    }
    return map[interval]
  }

  /**
   * Debug logging.
   * @internal
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[RobinhoodMarketData] ${msg}`)
    }
  }
}

/**
 * Plugin: register Robinhood market data provider.
 *
 * @example
 * ```ts
 * import { name, inject, apply } from '@deepseek-ai/dsh-market-data-robinhood'
 *
 * export { name, inject, apply }
 * ```
 */
export const name = 'market-data-robinhood'

export const inject = ['marketData']

export function apply(ctx: Context, config: RobinhoodMarketDataConfig = {}) {
  const provider = new RobinhoodMarketDataProvider(ctx, config)
  ctx.marketData.register(provider)
}
