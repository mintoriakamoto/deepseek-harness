/**
 * Risk policy types: pre-execution risk gates and position sizing.
 * @module @deepseek-ai/dsh-risk-policy
 */

/**
 * Portfolio position for risk analysis.
 */
export interface Position {
  symbol: string
  quantity: number
  avgEntryPrice: number
  currentPrice: number
  side: 'long' | 'short'
}

/**
 * Greeks for options positions (delta, gamma, vega, theta).
 */
export interface Greeks {
  delta: number
  gamma: number
  vega: number
  theta: number
  rho?: number
}

/**
 * Portfolio Greeks aggregated across all positions.
 */
export interface PortfolioGreeks {
  totalDelta: number
  totalGamma: number
  totalVega: number
  totalTheta: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Stress scenario for risk analysis.
 */
export interface StressScenario {
  name: string
  description: string
  marketMove: number // percentage change
  ivChange: number // basis points
  correlationShift: number // -1 to 1
  portfolioImpact: number // estimated P&L impact
}

/**
 * Default probability forecast.
 */
export interface DefaultForecast {
  symbol: string
  probability: number // 0-1
  confidence: number // 0-1
  horizon: number // days
  source: string
  timestamp: number
}

/**
 * Correlation matrix entry.
 */
export interface CorrelationMatrix {
  symbols: string[]
  correlations: number[][] // symmetric matrix
  timestamp: number
}

/**
 * Risk assessment result.
 */
export interface RiskAssessment {
  approved: boolean
  reasons: string[]
  warnings: string[]
  recommendedAdjustment?: number // position sizing factor
  estimatedLoss?: number // at risk value
  marketStress?: StressScenario[]
}

/**
 * Risk policy provider interface.
 */
export interface RiskProvider {
  name: string

  /**
   * Get default probability forecast for a symbol.
   */
  getDefaultForecast?(symbol: string): Promise<DefaultForecast>

  /**
   * Get stress test scenarios for the portfolio.
   */
  getStressScenarios?(positions: Position[]): Promise<StressScenario[]>

  /**
   * Get correlation matrix for portfolio assets.
   */
  getCorrelationMatrix?(symbols: string[]): Promise<CorrelationMatrix>

  /**
   * Assess risk for a proposed trade.
   */
  assessRisk?(
    position: Position,
    portfolio: Position[],
    config: RiskConfig,
  ): Promise<RiskAssessment>
}

/**
 * Risk policy configuration.
 */
export interface RiskConfig {
  maxDailyLoss: number // percentage of portfolio
  maxPositionSize: number // percentage of portfolio
  maxGreeks?: {
    delta: number
    gamma: number
    vega: number
    theta: number
  }
  marginUsageLimit: number // percentage of available
  volatilityThreshold: number // IV percentile
}

/**
 * Risk policy error.
 */
export class RiskPolicyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'RiskPolicyError'
  }
}
