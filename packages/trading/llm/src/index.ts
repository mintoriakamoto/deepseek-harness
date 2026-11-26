/**
 * LLM decision engine with integrated backtest validation.
 *
 * The LLM trading engine:
 * 1. Analyzes markets using multiple data sources
 * 2. Proposes strategies with reasoning
 * 3. Validates strategies using TEXT TO QUANT backtest validator
 * 4. Deploys only strategies that pass validation
 * 5. Logs all decisions durably
 *
 * @module @deepseek-ai/dsh-llm-trading
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { StrategyBacktestValidator, StrategyProposal, StrategyValidationResult } from '@deepseek-ai/dsh-strategy-backtest-validator'
import type { Session } from '@deepseek-ai/dsh-session'

export type {
  StrategyProposal,
  BacktestResult,
  StrategyValidationResult,
  ValidationCriteria,
  StrategyValidatorConfig,
} from '@deepseek-ai/dsh-strategy-backtest-validator'

declare module '@deepseek-ai/cordis' {
  interface Context {
    llmTrading: LLMTradingEngine
  }
}

/**
 * Configuration for the LLM trading engine.
 */
export interface LLMTradingConfig {
  /** Minimum edge score required (0-100) */
  minEdgeScore?: number
  /** Maximum position size as percent of portfolio */
  maxPositionPercent?: number
}

/**
 * Result of LLM strategy proposal and validation.
 */
export interface LLMStrategyDecision {
  /** Unique proposal ID */
  proposalId: string
  /** Whether strategy passed validation */
  validated: boolean
  /** Whether strategy was deployed */
  deployed: boolean
  /** Validation results if any */
  validationResult?: StrategyValidationResult
  /** Failure reason if applicable */
  failureReason?: string
  /** Timestamp of decision */
  timestamp: number
}

/**
 * LLM-driven trading engine with integrated backtest validation.
 *
 * Integrates the StrategyBacktestValidator to validate proposed strategies
 * before deployment. Only strategies that pass validation criteria are deployed.
 */
export class LLMTradingEngine extends Service {
  private minEdgeScore: number
  private maxPositionPercent: number
  private strategyCounter = 0

  constructor(ctx: Context, config: LLMTradingConfig = {}) {
    super(ctx, 'llmTrading')

    this.minEdgeScore = config.minEdgeScore ?? 60
    this.maxPositionPercent = config.maxPositionPercent ?? 2
  }

  /**
   * Propose a strategy from LLM analysis and validate it before deployment.
   *
   * This method:
   * 1. Creates a strategy proposal with LLM reasoning
   * 2. Submits it to the backtest validator
   * 3. Validates results against criteria
   * 4. Returns decision on whether to deploy
   *
   * @param strategyName - descriptive name for the strategy
   * @param entryCondition - entry logic description
   * @param exitCondition - exit logic description
   * @param symbols - target symbols to trade
   * @param reasoning - LLM reasoning for the strategy
   * @param session - optional session for event logging
   * @returns strategy decision with validation results
   */
  async proposeAndValidateStrategy(
    strategyName: string,
    entryCondition: string,
    exitCondition: string,
    symbols: string[],
    reasoning: string,
    session?: Session,
  ): Promise<LLMStrategyDecision> {
    this.strategyCounter++
    const proposalId = `strategy-${this.strategyCounter}-${Date.now()}`

    try {
      // Create strategy proposal
      const proposal: StrategyProposal = {
        id: proposalId,
        name: strategyName,
        entryCondition,
        exitCondition,
        symbols,
        positionSize: this.maxPositionPercent,
        confidence: this.minEdgeScore,
        reasoning,
      }

      // Log proposal if session available
      if (session) {
        try {
          session.append('strategy/proposed', {
            proposalId,
            proposal,
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          console.error('Failed to log strategy proposal:', error)
        }
      }

      // Get validator service
      const validator = this.ctx.get('strategyValidator') as StrategyBacktestValidator | undefined
      if (!validator) {
        throw new Error('Strategy backtest validator not available')
      }

      // Validate strategy with backtest
      const validationResult = await validator.validateStrategy(proposal)

      // Log validation result
      if (session) {
        try {
          session.append('strategy/validated', {
            proposalId,
            validationResult,
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          console.error('Failed to log validation result:', error)
        }
      }

      // Determine if should deploy
      const shouldDeploy = validationResult.shouldDeploy

      // Log deployment decision
      if (session) {
        try {
          session.append('strategy/decision', {
            proposalId,
            decision: shouldDeploy ? 'deploy' : 'reject',
            reason: validationResult.failureReason || 'All criteria met',
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          console.error('Failed to log deployment decision:', error)
        }
      }

      return {
        proposalId,
        validated: validationResult.shouldDeploy,
        deployed: shouldDeploy,
        validationResult,
        timestamp: Date.now(),
      }
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown error'

      // Log error
      if (session) {
        try {
          session.append('strategy/error', {
            proposalId,
            error: failureReason,
            timestamp: new Date().toISOString(),
          })
        } catch (logError) {
          console.error('Failed to log strategy error:', logError)
        }
      }

      return {
        proposalId,
        validated: false,
        deployed: false,
        failureReason,
        timestamp: Date.now(),
      }
    }
  }

  /**
   * Analyze market conditions and propose a strategy.
   * @internal - placeholder for LLM market analysis
   */
  private analyzeMarketConditions(): { strategyName: string; entryCondition: string; exitCondition: string } {
    return {
      strategyName: 'IV Mean-Reversion',
      entryCondition: 'IV rank > 70th percentile, realized vol < 30th percentile',
      exitCondition: '50% profit or 2 days elapsed',
    }
  }
}

/**
 * Load the LLM trading engine as a Cordis plugin.
 * Usage: `ctx.plugin(llmTrading, config)`
 */
export const name = 'llmTrading'
export const inject = ['cordis']

export async function apply(ctx: Context, config?: LLMTradingConfig): Promise<void> {
  ctx.plugin(LLMTradingEngine, config ?? {})
}
