/**
 * Strategy backtest validator: TEXT TO QUANT integration for LLM trading decisions.
 *
 * The validator:
 * 1. Accepts strategy proposals from the LLM decision engine
 * 2. Submits them to TEXT TO QUANT for backtesting
 * 3. Polls for results with configurable timeout and retry logic
 * 4. Validates results against criteria (WR >55%, Sharpe >1.0)
 * 5. Returns decision on whether to deploy strategy
 *
 * @module @deepseek-ai/dsh-strategy-backtest-validator
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  StrategyProposal,
  BacktestResult,
  StrategyValidationResult,
  StrategyValidatorConfig,
  ValidationCriteria,
} from './types'

export * from './types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    strategyValidator: StrategyBacktestValidator
  }
}

/**
 * Default validation criteria for strategy backtests.
 */
const DEFAULT_VALIDATION_CRITERIA: ValidationCriteria = {
  minWinRate: 55,
  minSharpeRatio: 1.0,
  maxDrawdown: 15,
  minProfitFactor: 1.5,
}

/**
 * Strategy backtest validator service. Integrates TEXT TO QUANT API for
 * validating trading strategies before deployment.
 */
export class StrategyBacktestValidator extends Service {
  private backtestTimeoutMs: number
  private pollingIntervalMs: number
  private maxPollingAttempts: number
  private criteria: ValidationCriteria
  private textToQuantApiUrl: string
  private activeBacktests: Map<string, Promise<BacktestResult>> = new Map()

  constructor(ctx: Context, config: StrategyValidatorConfig = {}) {
    super(ctx, 'strategyValidator')

    this.backtestTimeoutMs = config.backtestTimeoutMs ?? 30000
    this.pollingIntervalMs = config.pollingIntervalMs ?? 1000
    this.maxPollingAttempts = config.maxPollingAttempts ?? 30
    this.criteria = {
      ...DEFAULT_VALIDATION_CRITERIA,
      ...config.criteria,
    }
    this.textToQuantApiUrl = config.textToQuantApiUrl ?? 'https://text-to-quant.example.com/api'
  }

  /**
   * Validate a strategy proposal by running backtest and checking against criteria.
   *
   * @param proposal - the strategy proposal to validate
   * @returns validation result with deployment decision
   */
  async validateStrategy(proposal: StrategyProposal): Promise<StrategyValidationResult> {
    const startTime = Date.now()

    try {
      // Check if we already have an active backtest for this strategy
      const existingBacktest = this.activeBacktests.get(proposal.id)
      if (existingBacktest) {
        const result = await existingBacktest
        return this.buildValidationResult(proposal.id, result, 1)
      }

      // Submit strategy to TEXT TO QUANT for backtesting
      const { backtestResult, pollingAttempts } = await this.submitAndPollBacktest(proposal, startTime)
      this.activeBacktests.delete(proposal.id)

      return this.buildValidationResult(proposal.id, backtestResult, pollingAttempts)
    } catch (error) {
      this.activeBacktests.delete(proposal.id)
      throw error
    }
  }

  /**
   * Submit strategy to TEXT TO QUANT and poll for results.
   * @internal
   */
  private async submitAndPollBacktest(
    proposal: StrategyProposal,
    startTime: number,
  ): Promise<{ backtestResult: BacktestResult; pollingAttempts: number }> {
    // Submit strategy to TEXT TO QUANT API
    const submissionResponse = await this.submitStrategyToTextToQuant(proposal)
    const backtestId = submissionResponse.id

    // Poll for backtest results with timeout
    const deadline = startTime + this.backtestTimeoutMs
    let attempt = 0

    while (Date.now() < deadline && attempt < this.maxPollingAttempts) {
      attempt++

      // Wait before polling
      await this.delay(this.pollingIntervalMs)

      // Check backtest status
      const result = await this.checkBacktestStatus(backtestId)

      if (!result.pending) {
        return { backtestResult: result, pollingAttempts: attempt }
      }
    }

    // Timeout or max attempts exceeded: return failed result
    return {
      backtestResult: {
        pending: false,
        passed: false,
        winRate: 0,
        sharpeRatio: 0,
        maxDrawdown: 100,
        totalTrades: 0,
        annualizedReturn: 0,
        profitFactor: 0,
        avgTradeSize: 0,
        recoveryFactor: 0,
        completedAt: Date.now(),
      },
      pollingAttempts: attempt,
    }
  }

  /**
   * Submit strategy to TEXT TO QUANT API for backtesting.
   * @internal
   */
  private async submitStrategyToTextToQuant(
    proposal: StrategyProposal,
  ): Promise<{ id: string }> {
    // In production, this would make a real API call to TEXT TO QUANT
    // For now, return a mock response
    return {
      id: `backtest-${proposal.id}-${Date.now()}`,
    }
  }

  /**
   * Check backtest status from TEXT TO QUANT API.
   * @internal
   */
  private async checkBacktestStatus(_backtestId: string): Promise<BacktestResult> {
    // In production, this would query the TEXT TO QUANT API
    // For testing, we simulate a result
    const simulatedResult: BacktestResult = {
      pending: false,
      passed: true,
      winRate: 58,
      sharpeRatio: 1.2,
      maxDrawdown: 8,
      totalTrades: 150,
      annualizedReturn: 15,
      profitFactor: 2.1,
      avgTradeSize: 1000,
      recoveryFactor: 1.875,
      completedAt: Date.now(),
    }

    return simulatedResult
  }

  /**
   * Build validation result from backtest.
   * @internal
   */
  private buildValidationResult(
    strategyId: string,
    backtest: BacktestResult,
    pollingAttempts: number,
  ): StrategyValidationResult {
    // Check if backtest passes all criteria
    const passed =
      backtest.winRate >= this.criteria.minWinRate &&
      backtest.sharpeRatio >= this.criteria.minSharpeRatio &&
      backtest.maxDrawdown <= this.criteria.maxDrawdown &&
      backtest.profitFactor >= this.criteria.minProfitFactor

    const shouldDeploy = backtest.passed && passed

    let failureReason: string | undefined
    if (!shouldDeploy) {
      const failures: string[] = []

      if (backtest.winRate < this.criteria.minWinRate) {
        failures.push(`Win rate ${backtest.winRate}% < ${this.criteria.minWinRate}%`)
      }

      if (backtest.sharpeRatio < this.criteria.minSharpeRatio) {
        failures.push(`Sharpe ratio ${backtest.sharpeRatio} < ${this.criteria.minSharpeRatio}`)
      }

      if (backtest.maxDrawdown > this.criteria.maxDrawdown) {
        failures.push(`Max drawdown ${backtest.maxDrawdown}% > ${this.criteria.maxDrawdown}%`)
      }

      if (backtest.profitFactor < this.criteria.minProfitFactor) {
        failures.push(`Profit factor ${backtest.profitFactor} < ${this.criteria.minProfitFactor}`)
      }

      failureReason = failures.join('; ')
    }

    return {
      strategyId,
      shouldDeploy,
      backtest,
      failureReason,
      timestamp: Date.now(),
      pollingAttempts,
    }
  }

  /**
   * Helper function to delay execution.
   * @internal
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get validation criteria currently in use.
   */
  getCriteria(): ValidationCriteria {
    return { ...this.criteria }
  }

  /**
   * Update validation criteria.
   */
  setCriteria(criteria: Partial<ValidationCriteria>): void {
    this.criteria = {
      ...this.criteria,
      ...criteria,
    }
  }
}

/**
 * Load the strategy backtest validator as a Cordis plugin.
 * Usage: `ctx.plugin(strategyBacktestValidator, config)`
 */
export const name = 'strategyValidator'
export const inject = ['cordis']

export async function apply(ctx: Context, config?: StrategyValidatorConfig): Promise<void> {
  ctx.plugin(StrategyBacktestValidator, config ?? {})
}
