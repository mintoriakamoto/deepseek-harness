/**
 * Tests for StrategyBacktestValidator service.
 * Coverage: validation logic, polling, timeouts, and deployment decisions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { StrategyBacktestValidator, type StrategyProposal } from '../src/index'
import type { BacktestResult } from '../src/types'

describe('StrategyBacktestValidator', () => {
  let ctx: Context
  let validator: StrategyBacktestValidator

  beforeEach(async () => {
    ctx = new Context()
    validator = new StrategyBacktestValidator(ctx, {
      backtestTimeoutMs: 5000,
      pollingIntervalMs: 100,
      maxPollingAttempts: 50,
    })
  })

  /**
   * Test 1: Valid strategy passes validation and deploys
   */
  it('should validate and deploy strategy when backtest passes criteria', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-1',
      name: 'IV Mean-Reversion',
      entryCondition: 'IV rank > 70th percentile',
      exitCondition: '50% profit or 2 days',
      symbols: ['SPX'],
      positionSize: 2,
      confidence: 65,
      reasoning: 'High IV presents premium selling opportunity',
    }

    const result = await validator.validateStrategy(proposal)

    expect(result.strategyId).toBe('strategy-1')
    expect(result.shouldDeploy).toBe(true)
    expect(result.backtest.passed).toBe(true)
    expect(result.backtest.winRate).toBeGreaterThanOrEqual(55)
    expect(result.backtest.sharpeRatio).toBeGreaterThanOrEqual(1.0)
    expect(result.failureReason).toBeUndefined()
  })

  /**
   * Test 2: Strategy with low win rate is rejected
   */
  it('should reject strategy when win rate is below threshold', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-2',
      name: 'Poor Strategy',
      entryCondition: 'Random entry',
      exitCondition: 'Random exit',
      symbols: ['AAPL'],
      positionSize: 1,
      confidence: 40,
      reasoning: 'No clear edge',
    }

    // Mock a low win-rate result
    const validatorWithMock = validator as unknown as { checkBacktestStatus: () => Promise<BacktestResult> }
    validatorWithMock.checkBacktestStatus = async () => ({
      pending: false,
      passed: false,
      winRate: 48, // Below 55% threshold
      sharpeRatio: 0.8,
      maxDrawdown: 25,
      totalTrades: 100,
      annualizedReturn: 2,
      profitFactor: 1.1,
      avgTradeSize: 500,
      recoveryFactor: 0.08,
      completedAt: Date.now(),
    })

    const result = await validator.validateStrategy(proposal)

    expect(result.shouldDeploy).toBe(false)
    expect(result.failureReason).toContain('48%')
  })

  /**
   * Test 3: Strategy with low Sharpe ratio is rejected
   */
  it('should reject strategy when Sharpe ratio is below threshold', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-3',
      name: 'Volatile Strategy',
      entryCondition: 'High volatility',
      exitCondition: 'Stop loss',
      symbols: ['TSLA'],
      positionSize: 2,
      confidence: 70,
      reasoning: 'Betting on volatility',
    }

    // Mock a low Sharpe ratio result
    const validatorWithMock = validator as unknown as { checkBacktestStatus: () => Promise<BacktestResult> }
    validatorWithMock.checkBacktestStatus = async () => ({
      pending: false,
      passed: false,
      winRate: 60,
      sharpeRatio: 0.5, // Below 1.0 threshold
      maxDrawdown: 20,
      totalTrades: 150,
      annualizedReturn: 10,
      profitFactor: 1.8,
      avgTradeSize: 800,
      recoveryFactor: 0.5,
      completedAt: Date.now(),
    })

    const result = await validator.validateStrategy(proposal)

    expect(result.shouldDeploy).toBe(false)
    expect(result.failureReason).toContain('Sharpe ratio')
  })

  /**
   * Test 4: Strategy with excessive drawdown is rejected
   */
  it('should reject strategy when max drawdown exceeds threshold', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-4',
      name: 'Risky Strategy',
      entryCondition: 'Aggressive entry',
      exitCondition: 'Wide stops',
      symbols: ['BTC'],
      positionSize: 5,
      confidence: 50,
      reasoning: 'High risk, high reward',
    }

    // Mock a high drawdown result
    const validatorWithMock = validator as unknown as { checkBacktestStatus: () => Promise<BacktestResult> }
    validatorWithMock.checkBacktestStatus = async () => ({
      pending: false,
      passed: false,
      winRate: 56,
      sharpeRatio: 1.2,
      maxDrawdown: 25, // Exceeds 15% threshold
      totalTrades: 200,
      annualizedReturn: 15,
      profitFactor: 2.0,
      avgTradeSize: 1000,
      recoveryFactor: 0.6,
      completedAt: Date.now(),
    })

    const result = await validator.validateStrategy(proposal)

    expect(result.shouldDeploy).toBe(false)
    expect(result.failureReason).toContain('Max drawdown')
  })

  /**
   * Test 5: Polling timeout handling
   */
  it('should handle backtest polling timeout gracefully', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-5',
      name: 'Timeout Test',
      entryCondition: 'Test entry',
      exitCondition: 'Test exit',
      symbols: ['TEST'],
      positionSize: 1,
      confidence: 60,
      reasoning: 'Testing timeout behavior',
    }

    // Mock a function that always returns pending
    const validatorWithMock = validator as unknown as { checkBacktestStatus: () => Promise<BacktestResult> }
    validatorWithMock.checkBacktestStatus = async () => ({
      pending: true,
      passed: false,
      winRate: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      totalTrades: 0,
      annualizedReturn: 0,
      profitFactor: 0,
      avgTradeSize: 0,
      recoveryFactor: 0,
    })

    const start = Date.now()
    const result = await validator.validateStrategy(proposal)
    const elapsed = Date.now() - start

    expect(result.shouldDeploy).toBe(false)
    expect(elapsed).toBeGreaterThanOrEqual(4800) // Close to 5000ms timeout
    expect(result.backtest.winRate).toBe(0)
  })

  /**
   * Test 6: Concurrent strategy validations
   */
  it('should handle concurrent strategy validations', async () => {
    const proposals: StrategyProposal[] = [
      {
        id: 'strategy-6a',
        name: 'Strategy A',
        entryCondition: 'Entry A',
        exitCondition: 'Exit A',
        symbols: ['SYM1'],
        positionSize: 1,
        confidence: 65,
        reasoning: 'Strategy A reasoning',
      },
      {
        id: 'strategy-6b',
        name: 'Strategy B',
        entryCondition: 'Entry B',
        exitCondition: 'Exit B',
        symbols: ['SYM2'],
        positionSize: 1,
        confidence: 65,
        reasoning: 'Strategy B reasoning',
      },
      {
        id: 'strategy-6c',
        name: 'Strategy C',
        entryCondition: 'Entry C',
        exitCondition: 'Exit C',
        symbols: ['SYM3'],
        positionSize: 1,
        confidence: 65,
        reasoning: 'Strategy C reasoning',
      },
    ]

    const results = await Promise.all(
      proposals.map(p => validator.validateStrategy(p)),
    )

    expect(results).toHaveLength(3)
    expect(results.every(r => r.timestamp > 0)).toBe(true)
    results.forEach((result, index) => {
      expect(result.strategyId).toBe(proposals[index]!.id)
    })
  })

  /**
   * Test 7: Deployment confirmation for passing strategy
   */
  it('should confirm deployment when all criteria are met', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-7',
      name: 'Earnings Arbitrage',
      entryCondition: '2-5 days before earnings',
      exitCondition: '50% profit or day before earnings',
      symbols: ['MSFT'],
      positionSize: 1.5,
      confidence: 72,
      reasoning: 'FinCoT 93% accuracy on earnings surprise direction',
    }

    const result = await validator.validateStrategy(proposal)

    expect(result.shouldDeploy).toBe(true)
    expect(result.backtest.passed).toBe(true)
    expect(result.backtest.totalTrades).toBeGreaterThan(0)
    expect(result.backtest.profitFactor).toBeGreaterThanOrEqual(1.5)
    expect(result.pollingAttempts).toBeGreaterThan(0)
  })

  /**
   * Test 8: Failed backtest logging and decision
   */
  it('should log failed backtest and prevent deployment', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-8',
      name: 'Failed Strategy',
      entryCondition: 'Failed entry',
      exitCondition: 'Failed exit',
      symbols: ['FAIL'],
      positionSize: 2,
      confidence: 55,
      reasoning: 'This strategy will fail validation',
    }

    // Mock a failed backtest result
    const validatorWithMock = validator as unknown as { checkBacktestStatus: () => Promise<BacktestResult> }
    validatorWithMock.checkBacktestStatus = async () => ({
      pending: false,
      passed: false, // Backtest itself failed
      winRate: 45,
      sharpeRatio: 0.3,
      maxDrawdown: 50,
      totalTrades: 50,
      annualizedReturn: -15,
      profitFactor: 0.5,
      avgTradeSize: 500,
      recoveryFactor: -0.3,
      completedAt: Date.now(),
    })

    const result = await validator.validateStrategy(proposal)

    expect(result.shouldDeploy).toBe(false)
    expect(result.failureReason).toBeTruthy()
    expect(result.deployed === false).toBe(true)
    expect(result.backtest.passed).toBe(false)
  })

  /**
   * Test: Validation criteria customization
   */
  it('should respect custom validation criteria', () => {
    const customValidator = new StrategyBacktestValidator(ctx, {
      criteria: {
        minWinRate: 60,
        minSharpeRatio: 1.5,
        maxDrawdown: 10,
        minProfitFactor: 2.0,
      },
    })

    const criteria = customValidator.getCriteria()
    expect(criteria.minWinRate).toBe(60)
    expect(criteria.minSharpeRatio).toBe(1.5)
    expect(criteria.maxDrawdown).toBe(10)
    expect(criteria.minProfitFactor).toBe(2.0)
  })

  /**
   * Test: Polling attempts tracking
   */
  it('should track polling attempts correctly', async () => {
    const proposal: StrategyProposal = {
      id: 'strategy-polling',
      name: 'Polling Test',
      entryCondition: 'Entry',
      exitCondition: 'Exit',
      symbols: ['TEST'],
      positionSize: 1,
      confidence: 60,
      reasoning: 'Test polling',
    }

    const result = await validator.validateStrategy(proposal)

    expect(result.pollingAttempts).toBeGreaterThan(0)
    expect(result.pollingAttempts).toBeLessThanOrEqual(50)
  })
})
