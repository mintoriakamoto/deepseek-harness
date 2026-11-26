/**
 * Financial Datasets provider: earnings calendar, beneficial owner transactions, and derived sentiment.
 *
 * This provider implements market data sentiment via fundamental analysis of:
 * - Upcoming earnings dates and historical accuracy
 * - Insider transaction patterns (net buy/sell signals)
 * - Derived sentiment combining earnings quality + insider activity
 *
 * @module @deepseek-ai/dsh-market-data-financial-datasets
 */

import { Context } from '@deepseek-ai/cordis'
import type {
  MarketDataProvider,
  Sentiment,
} from '@deepseek-ai/dsh-market-data'
import { createSubscriptionId, MarketDataError as MDError } from '@deepseek-ai/dsh-market-data'
import type {
  EarningsEvent,
  BeneficialOwnerTransaction,
  InsiderTradingMetrics,
} from './types.ts'
import { FinancialDataError } from './types.ts'

export * from './types.ts'

/**
 * Configuration for Financial Datasets provider.
 */
export interface FinancialDatasetsConfig {
  /** Enable debug logging. */
  debug?: boolean
  /** Cache TTL for earnings data (milliseconds, default: 1 hour). */
  earningsCacheTtlMs?: number
  /** Cache TTL for insider transaction data (milliseconds, default: 30 minutes). */
  insiderCacheTtlMs?: number
}

/**
 * Financial Datasets provider: sentiment from earnings calendar and insider transactions.
 *
 * Implements the MarketDataProvider interface with getSentiment(). Derives sentiment
 * from:
 * 1. Earnings surprise history (beat rate)
 * 2. Insider buy/sell signals
 * 3. Upcoming earnings catalysts
 *
 * In production, this would fetch from APIs like Financial Datasets, SEC Edgar, or similar.
 * For now, provides mock data with realistic derivation logic.
 */
export class FinancialDatasetsProvider implements MarketDataProvider {
  readonly name = 'financial-datasets'

  private debug: boolean
  private earningsCacheTtlMs: number
  private insiderCacheTtlMs: number
  private earningsCache: Map<string, { data: EarningsEvent[]; expiresAt: number }> = new Map()
  private insiderCache: Map<string, { data: BeneficialOwnerTransaction[]; expiresAt: number }> =
    new Map()

  constructor(_ctx: Context, config: FinancialDatasetsConfig = {}) {
    this.debug = config.debug ?? false
    this.earningsCacheTtlMs = config.earningsCacheTtlMs ?? 3_600_000 // 1 hour
    this.insiderCacheTtlMs = config.insiderCacheTtlMs ?? 1_800_000 // 30 minutes
  }

  /**
   * Get aggregated sentiment for one or more symbols from fundamental data.
   *
   * Sentiment combines:
   * - Earnings surprise history (beat rate → positive sentiment)
   * - Insider buy/sell pattern (net buys → positive sentiment)
   * - Upcoming earnings timing (days to earnings reduce sentiment)
   *
   * Score: -1 (strong bearish) to 1 (strong bullish), 0 (neutral).
   */
  async getSentiment(symbols: readonly string[]): Promise<readonly Sentiment[]> {
    this.log(`getSentiment(${symbols.length} symbols)`)

    const results: Sentiment[] = []

    for (const symbol of symbols) {
      try {
        const earnings = await this.getEarningsCalendar(symbol)
        const insider = await this.getInsiderTradingMetrics(symbol)

        // Derive sentiment from fundamental data
        const score = this.deriveSentiment(symbol, earnings, insider)

        results.push({
          symbol,
          score,
          sampleCount: earnings.length + insider.transactionCount,
          timestamp: Date.now(),
          sourceScores: {
            earnings: this.earningsSentiment(earnings),
            insider: insider.sentiment,
          },
        })
      } catch (err) {
        this.log(`Error computing sentiment for ${symbol}: ${err}`)
        // Return neutral sentiment on error rather than failing entire operation
        results.push({
          symbol,
          score: 0,
          sampleCount: 0,
          timestamp: Date.now(),
        })
      }
    }

    return results
  }

  /**
   * Get upcoming and recent earnings events for one symbol.
   *
   * Returns scheduled earnings dates, historical accuracy, and guidance expectations.
   * Requires real API (Financial Datasets, Yahoo Finance API, etc) in production.
   */
  async getEarningsCalendar(symbol: string): Promise<readonly EarningsEvent[]> {
    this.log(`getEarningsCalendar(${symbol})`)

    // Check cache
    const cached = this.earningsCache.get(symbol)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    try {
      // In production: const data = await this.fetchFromApi(symbol)
      // For now, return mock data with realistic patterns
      const mockEarnings = this.generateMockEarningsData(symbol)

      // Cache result
      this.earningsCache.set(symbol, {
        data: mockEarnings,
        expiresAt: Date.now() + this.earningsCacheTtlMs,
      })

      return mockEarnings
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new FinancialDataError(
        `Failed to fetch earnings for ${symbol}: ${message}`,
        'EARNINGS_FETCH_ERROR',
        500,
      )
    }
  }

  /**
   * Get beneficial owner transactions for one symbol.
   *
   * Returns insider buy/sell transactions from Form 4 filings.
   */
  async getBeneficialOwners(symbol: string): Promise<readonly BeneficialOwnerTransaction[]> {
    this.log(`getBeneficialOwners(${symbol})`)

    // Check cache
    const cached = this.insiderCache.get(symbol)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    try {
      // In production: const data = await this.fetchFromApi(symbol)
      // For now, return mock insider transaction data
      const mockTransactions = this.generateMockInsiderTransactions(symbol)

      // Cache result
      this.insiderCache.set(symbol, {
        data: mockTransactions,
        expiresAt: Date.now() + this.insiderCacheTtlMs,
      })

      return mockTransactions
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new FinancialDataError(
        `Failed to fetch insider transactions for ${symbol}: ${message}`,
        'INSIDER_FETCH_ERROR',
        500,
      )
    }
  }

  /**
   * Get aggregated insider trading metrics for one symbol.
   *
   * Summarizes net buy/sell activity and derives sentiment signal.
   */
  private async getInsiderTradingMetrics(symbol: string): Promise<InsiderTradingMetrics> {
    const transactions = await this.getBeneficialOwners(symbol)

    // Filter to last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recentTransactions = transactions.filter(
      t => new Date(t.filingDate).getTime() >= thirtyDaysAgo,
    )

    // Count net buys vs sells
    const buys = recentTransactions.filter(t => t.transactionType === 'buy').length
    const sells = recentTransactions.filter(t => t.transactionType === 'sell').length

    // Sentiment from insider activity: more buys = positive, more sells = negative
    const sentiment = recentTransactions.length > 0
      ? Math.min(1, Math.max(-1, (buys - sells) / recentTransactions.length))
      : 0

    return {
      symbol,
      insiderNetBuys: buys - sells,
      transactionCount: recentTransactions.length,
      sentiment,
      timestamp: Date.now(),
    }
  }

  /**
   * Derive overall sentiment from earnings history and insider activity.
   * @internal
   */
  private deriveSentiment(
    _symbol: string,
    earnings: readonly EarningsEvent[],
    insider: InsiderTradingMetrics,
  ): number {
    // 1. Earnings beat rate (past 4 quarters)
    const earningsSentiment = this.earningsSentiment(earnings)

    // 2. Insider sentiment
    const insiderSentiment = insider.sentiment

    // 3. Upcoming earnings catalyst (bias downward if earnings imminent due to uncertainty)
    const upcomingEarningsAdj = earnings.length > 0 ? -0.1 : 0

    // Weighted average: 60% earnings, 40% insider
    const combined = earningsSentiment * 0.6 + insiderSentiment * 0.4 + upcomingEarningsAdj

    // Clamp to [-1, 1]
    return Math.min(1, Math.max(-1, combined))
  }

  /**
   * Compute sentiment from earnings surprise history.
   * @internal
   */
  private earningsSentiment(earnings: readonly EarningsEvent[]): number {
    if (earnings.length === 0) return 0

    // Count beat rate from most recent 4 quarters
    const beatCount = earnings
      .filter(e => e.epsSurprisePercent !== null && e.epsSurprisePercent > 0)
      .slice(0, 4).length

    // 4 beats = 1.0, 3 beats = 0.5, 2 beats = 0, 1 beat = -0.5, 0 beats = -1.0
    return (beatCount - 2) / 2
  }

  /**
   * Generate mock earnings calendar data for testing/demo.
   * @internal
   */
  private generateMockEarningsData(symbol: string): EarningsEvent[] {
    const now = new Date()

    // Create realistic earnings pattern: 4 recent quarters + 1 upcoming
    const events: EarningsEvent[] = []

    // Add past 4 quarters with realistic beat patterns
    for (let i = 4; i >= 1; i--) {
      const quarterDate = new Date(now)
      quarterDate.setMonth(quarterDate.getMonth() - i * 3)

      const beatChance = Math.random()
      const epsEstimate = 1.5 + Math.random()
      const epsActual =
        beatChance > 0.4
          ? epsEstimate + Math.random() * 0.3 // Beat
          : epsEstimate - Math.random() * 0.3 // Miss

      events.push({
        symbol,
        announcementDate: quarterDate.toISOString().split('T')[0],
        fiscalPeriod: `Q${((quarterDate.getMonth() / 3) | 0) + 1}`,
        fiscalYear: quarterDate.getFullYear(),
        epsEstimate,
        epsActual,
        epsSurprisePercent: ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100,
        revenueEstimate: 5000 + Math.random() * 1000,
        revenueActual: 5000 + Math.random() * 1000,
        revenueSurprisePercent: Math.random() * 10 - 5,
        priorGuidance: ['beat', 'meet', 'miss'][Math.floor(Math.random() * 3)] as any,
        expectedGuidance: ['beat', 'meet', 'miss'][Math.floor(Math.random() * 3)] as any,
        announcementTime: 'after-hours',
      })
    }

    // Add upcoming earnings (30-45 days out)
    const upcomingDate = new Date(now)
    upcomingDate.setDate(upcomingDate.getDate() + 30 + Math.floor(Math.random() * 15))

    events.push({
      symbol,
      announcementDate: upcomingDate.toISOString().split('T')[0],
      fiscalPeriod: `Q${((upcomingDate.getMonth() / 3) | 0) + 1}`,
      fiscalYear: upcomingDate.getFullYear(),
      epsEstimate: 1.5 + Math.random(),
      epsActual: null,
      epsSurprisePercent: null,
      revenueEstimate: 5000 + Math.random() * 1000,
      revenueActual: null,
      revenueSurprisePercent: null,
      priorGuidance: null,
      expectedGuidance: 'meet',
      announcementTime: 'after-hours',
    })

    return events
  }

  /**
   * Generate mock insider transaction data for testing/demo.
   * @internal
   */
  private generateMockInsiderTransactions(symbol: string): BeneficialOwnerTransaction[] {
    const transactions: BeneficialOwnerTransaction[] = []

    // Add 5-10 recent transactions
    const transactionCount = 5 + Math.floor(Math.random() * 6)
    const insiderNames = ['CEO', 'CFO', 'COO', 'Director', 'VP Sales', 'General Counsel']

    for (let i = 0; i < transactionCount; i++) {
      const daysAgo = Math.floor(Math.random() * 30)
      const filingDate = new Date()
      filingDate.setDate(filingDate.getDate() - daysAgo)

      const isBuy = Math.random() > 0.4 // 60% buys, 40% sells for realistic insider pattern
      const shares = 1000 + Math.floor(Math.random() * 100_000)
      const price = 100 + Math.random() * 50

      transactions.push({
        symbol,
        owner: insiderNames[Math.floor(Math.random() * insiderNames.length)],
        transactionType: isBuy ? 'buy' : 'sell',
        shares,
        pricePerShare: price,
        transactionValue: shares * price,
        filingDate: filingDate.toISOString().split('T')[0],
        transactionDate: filingDate.toISOString().split('T')[0],
        ownershipPercent: 0.1 + Math.random() * 2,
        filingType: 'Form 4',
      })
    }

    return transactions
  }

  /**
   * Log debug message if enabled.
   * @internal
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(`[FinancialDatasets] ${message}`)
    }
  }
}
