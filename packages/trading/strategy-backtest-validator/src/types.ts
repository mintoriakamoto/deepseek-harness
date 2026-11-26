/**
 * Strategy backtest validator types for TEXT TO QUANT integration.
 * @module dsh-strategy-backtest-validator/types
 */

/**
 * A trading strategy proposal from the LLM decision engine.
 */
export interface StrategyProposal {
  /** Unique identifier for this strategy proposal */
  id: string
  /** Strategy name/description */
  name: string
  /** Entry condition description */
  entryCondition: string
  /** Exit condition description */
  exitCondition: string
  /** Target symbol(s) */
  symbols: string[]
  /** Position sizing details */
  positionSize: number
  /** Stop loss percentage */
  stopLossPct?: number
  /** Take profit percentage */
  takeProfitPct?: number
  /** Confidence score from LLM (0-100) */
  confidence: number
  /** Strategy reasoning from LLM */
  reasoning: string
}

/**
 * Backtest results from TEXT TO QUANT validation.
 */
export interface BacktestResult {
  /** Whether validation is still pending */
  pending: boolean
  /** Whether backtest validation passed */
  passed: boolean
  /** Win rate percentage (0-100) */
  winRate: number
  /** Sharpe ratio */
  sharpeRatio: number
  /** Maximum drawdown percentage */
  maxDrawdown: number
  /** Total number of trades backtested */
  totalTrades: number
  /** Annualized return percentage */
  annualizedReturn: number
  /** Profit factor (gross profit / gross loss) */
  profitFactor: number
  /** Average trade size */
  avgTradeSize: number
  /** Recovery factor (net profit / max drawdown) */
  recoveryFactor: number
  /** Timestamp of backtest completion */
  completedAt?: number
}

/**
 * Validation criteria for backtest results.
 */
export interface ValidationCriteria {
  /** Minimum acceptable win rate (default: 55%) */
  minWinRate: number
  /** Minimum acceptable Sharpe ratio (default: 1.0) */
  minSharpeRatio: number
  /** Maximum acceptable drawdown (default: 15%) */
  maxDrawdown: number
  /** Minimum acceptable profit factor (default: 1.5) */
  minProfitFactor: number
}

/**
 * Result of strategy validation including decision.
 */
export interface StrategyValidationResult {
  /** ID of the strategy proposal */
  strategyId: string
  /** Whether the strategy should be deployed */
  shouldDeploy: boolean
  /** Detailed backtest results */
  backtest: BacktestResult
  /** Failure reason if applicable */
  failureReason?: string
  /** Validation timestamp */
  timestamp: number
  /** Polling attempts made */
  pollingAttempts: number
}

/**
 * Configuration for the strategy validator service.
 */
export interface StrategyValidatorConfig {
  /** Maximum time to wait for backtest result in ms (default: 30000) */
  backtestTimeoutMs?: number
  /** Polling interval in ms (default: 1000) */
  pollingIntervalMs?: number
  /** Maximum polling attempts (default: 30) */
  maxPollingAttempts?: number
  /** Validation criteria (defaults provided) */
  criteria?: Partial<ValidationCriteria>
  /** TEXT TO QUANT API endpoint */
  textToQuantApiUrl?: string
}
