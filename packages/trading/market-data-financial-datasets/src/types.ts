/**
 * Financial Datasets types: earnings calendar, beneficial owners, and insider transaction history.
 *
 * @module @deepseek-ai/dsh-market-data-financial-datasets/types
 */

/**
 * Earnings calendar event for one symbol: upcoming announcement and historical surprises.
 */
export interface EarningsEvent {
  /** Stock symbol. */
  symbol: string
  /** Scheduled earnings date (ISO8601). */
  announcementDate: string
  /** Fiscal period (Q1, Q2, Q3, Q4, FY). */
  fiscalPeriod: string
  /** Fiscal year. */
  fiscalYear: number
  /** EPS estimate consensus (mean analyst estimate). */
  epsEstimate: number | null
  /** Actual reported EPS (null if not yet released). */
  epsActual: number | null
  /** EPS surprise percentage: (actual - estimate) / |estimate| * 100. */
  epsSurprisePercent: number | null
  /** Revenue estimate consensus (in millions). */
  revenueEstimate: number | null
  /** Actual reported revenue (in millions). */
  revenueActual: number | null
  /** Revenue surprise percentage. */
  revenueSurprisePercent: number | null
  /** Prior-day guidance (beat, meet, miss, or null). */
  priorGuidance: 'beat' | 'meet' | 'miss' | null
  /** Current guidance expectation (beat, meet, miss). */
  expectedGuidance: 'beat' | 'meet' | 'miss'
  /** Time of day for announcement (pre-market, after-hours, etc). */
  announcementTime: 'pre-market' | 'after-hours' | 'regular' | null
}

/**
 * Beneficial owner transaction: insider purchase/sale with SEC filing details.
 */
export interface BeneficialOwnerTransaction {
  /** Stock symbol. */
  symbol: string
  /** Insider name or title (CEO, CFO, Director, etc). */
  owner: string
  /** Transaction type: buy or sell. */
  transactionType: 'buy' | 'sell'
  /** Number of shares traded. */
  shares: number
  /** Price per share. */
  pricePerShare: number
  /** Total transaction value. */
  transactionValue: number
  /** Filing date (ISO8601). */
  filingDate: string
  /** Transaction date (ISO8601). */
  transactionDate: string
  /** Beneficial ownership percentage after transaction. */
  ownershipPercent: number
  /** SEC filing type (Form 4, Form 3, etc). */
  filingType: string
}

/**
 * Aggregated insider trading activity for one symbol.
 */
export interface InsiderTradingMetrics {
  /** Stock symbol. */
  symbol: string
  /** Net insider buy/sell count over last 30 days. */
  insiderNetBuys: number
  /** Total number of insider transactions in period. */
  transactionCount: number
  /** Sentiment derived from insider activity (1 = strong buy signal, -1 = strong sell). */
  sentiment: number
  /** Timestamp of aggregation (milliseconds since epoch). */
  timestamp: number
}

/**
 * Error thrown when financial data operations fail.
 */
export class FinancialDataError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'FinancialDataError'
  }
}
