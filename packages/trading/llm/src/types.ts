/**
 * Type definitions for trading session events emitted by the LLM decision engine.
 * These events are logged durably for post-trade analysis and audit trails.
 *
 * @module @deepseek-ai/dsh-llm-trading/types
 */

/**
 * Market snapshot captured at decision time for reproducibility.
 */
export interface MarketSnapshot {
  /** Implied volatility rank percentile (0-100) */
  ivRank: number
  /** Realized volatility percentile (0-100) */
  realizedVolPercentile: number
  /** Current volatility skew indicator */
  skew: number
  /** Sentiment score from multiple sources (-1 to 1) */
  sentiment: number
  /** Timestamp of the snapshot */
  timestamp: number
  /** Number of symbols analyzed */
  symbolsAnalyzed: number
}

/**
 * Individual trade candidate from market analysis.
 */
export interface TradeCandidate {
  /** Stock symbol or instrument identifier */
  symbol: string
  /** Trade side: buy or sell */
  side: 'buy' | 'sell'
  /** Quantity to trade */
  quantity: number
  /** Edge score from 0-100 based on IV, realized vol, catalyst, sentiment */
  edgeScore: number
  /** Expected return percentage */
  expectedReturn: number
  /** Risk-reward ratio */
  riskReward: number
}

/**
 * Risk check evaluation result.
 */
export interface RiskCheckResult {
  /** Whether the trade passes all risk checks */
  approved: boolean
  /** Current portfolio delta (must be < 0.30 total) */
  portfolioDelta: number
  /** Current portfolio gamma (must be < 0.05 total) */
  portfolioGamma: number
  /** Current portfolio vega (must be > -50 total) */
  portfolioVega: number
  /** Margin utilization percentage */
  marginUtilization: number
  /** Daily P&L percentage */
  dailyPnlPercent: number
  /** Detailed violation reasons if not approved */
  violations: string[]
}

/**
 * Decision made by the LLM trading engine - emitted before execution.
 * This is the core audit log for reproducibility and compliance.
 *
 * @mode emit
 */
export interface TradeDecisionEvent {
  /** ISO8601 timestamp when decision was made */
  timestamp: string
  /** Full reasoning trace from DeepSeek including chain-of-thought */
  reasoning: string
  /** Complete confidence level (0-100) in this decision */
  confidence: number
  /** Market state captured at decision time */
  marketSnapshot: MarketSnapshot
  /** All candidate trades evaluated before selection */
  candidateTrades: TradeCandidate[]
  /** The selected trade to execute (or null if hold decision) */
  selectedTrade: TradeCandidate | null
  /** Result of risk validation checks */
  riskCheck: RiskCheckResult
  /** Position size in dollars being risked */
  positionSize: number
  /** Expected return in dollars if thesis succeeds */
  expectedReturn: number
}

/**
 * Execution confirmation - emitted after order placement.
 * Logs the order ID and initial status for linking fills to decisions.
 *
 * @mode emit
 */
export interface TradeExecutionEvent {
  /** Decision sequence that triggered this execution */
  decisionSeq: number
  /** Order ID from the execution provider */
  orderId: string
  /** Execution style (paper, robinhood, polymarket, etc) */
  executionStyle: string
  /** Initial order status */
  status: string
  /** ISO8601 timestamp when order was placed */
  timestamp: string
  /** Order details for confirmation */
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  /** Estimated execution cost in dollars */
  estimatedCost: number
}

/**
 * Fill confirmation - emitted when order partially or fully fills.
 * Records the actual execution price and quantity.
 *
 * @mode emit
 */
export interface TradeFillEvent {
  /** Order ID that filled */
  orderId: string
  /** Quantity filled in this event (may be partial) */
  quantityFilled: number
  /** Actual execution price per unit */
  fillPrice: number
  /** Total value of fill (quantity * price) */
  fillValue: number
  /** ISO8601 timestamp of the fill */
  timestamp: string
  /** Whether this is a partial fill or final fill */
  isFinal: boolean
}

/**
 * Trade outcome - emitted when position is closed or expiration reached.
 * Records the actual P&L and outcome vs thesis.
 *
 * @mode emit
 */
export interface TradeOutcomeEvent {
  /** Order ID of the original entry order */
  orderId: string
  /** Entry price (average fill price) */
  entryPrice: number
  /** Exit price (average fill price on close) */
  exitPrice: number
  /** Number of units traded */
  quantity: number
  /** Gross P&L in dollars (before commissions) */
  grossPnl: number
  /** Commission paid in dollars */
  commissions: number
  /** Net P&L in dollars */
  netPnl: number
  /** Return percentage on position */
  returnPercent: number
  /** Whether thesis was correct (+1 for win, -1 for loss, 0 for breakeven) */
  outcome: 1 | -1 | 0
  /** ISO8601 timestamp when position was closed */
  timestamp: string
  /** Days the position was held */
  daysHeld: number
  /** Reason for close (stop loss, profit target, expiration, manual) */
  closeReason: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * LLM trading decision: market analysis, reasoning, risk checks, and trade recommendation.
     * Emitted before execution to create an immutable audit trail.
     *
     * @mode emit
     */
    'trade/decision': TradeDecisionEvent

    /**
     * Trade execution confirmation: order placed and assigned an order ID.
     * Emitted after successful order placement for execution tracking.
     *
     * @mode emit
     */
    'trade/execution': TradeExecutionEvent

    /**
     * Order fill notification: partial or full fill at specified price.
     * Emitted when the execution provider reports a fill.
     *
     * @mode emit
     */
    'trade/fill': TradeFillEvent

    /**
     * Trade outcome: position closed with final P&L and thesis validation.
     * Emitted after position exit to complete the trade lifecycle.
     *
     * @mode emit
     */
    'trade/outcome': TradeOutcomeEvent
  }
}
