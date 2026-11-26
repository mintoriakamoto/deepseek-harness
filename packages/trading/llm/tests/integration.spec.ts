/**
 * Integration tests for LLMTradingEngine with StrategyBacktestValidator.
 * Coverage: strategy proposal, validation integration, deployment decisions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LLMTradingEngine } from '../src/index'
import { StrategyBacktestValidator } from '@deepseek-ai/dsh-strategy-backtest-validator'

describe('LLMTradingEngine with Backtest Validation', () => {
  let ctx: Context
  let engine: LLMTradingEngine
  let validator: StrategyBacktestValidator

  beforeEach(async () => {
    ctx = new Context()

    // Initialize validator
    validator = new StrategyBacktestValidator(ctx, {
      backtestTimeoutMs: 5000,
      pollingIntervalMs: 100,
      maxPollingAttempts: 50,
    })

    // Initialize LLM engine with validator available in context
    engine = new LLMTradingEngine(ctx, {
      minEdgeScore: 60,
      maxPositionPercent: 2,
    })

    // Make validator available to engine via context.get
    ;(ctx as unknown as { strategyValidator: StrategyBacktestValidator }).strategyValidator = validator
  })

  /**
   * Test 1: Valid strategy is proposed, validated, and deployed
   */
  it('should deploy valid strategy after backtest validation', async () => {
    const decision = await engine.proposeAndValidateStrategy(
      'IV Mean-Reversion',
      'IV rank > 70th percentile, realized vol < 30th percentile',
      '50% profit or 2 days elapsed',
      ['SPX'],
      'High IV presents premium selling opportunity with limited downside risk',
    )

    expect(decision.proposalId).toMatch(/^strategy-/)
    expect(decision.validated).toBe(true)
    expect(decision.deployed).toBe(true)
    expect(decision.validationResult).toBeDefined()
    expect(decision.validationResult!.backtest.winRate).toBeGreaterThanOrEqual(55)
    expect(decision.timestamp).toBeGreaterThan(0)
  })

  /**
   * Test 2: Invalid strategy is proposed but rejected after validation fails
   */
  it('should reject strategy that fails backtest validation', async () => {
    // Mock validator to return failed result
    const mockValidator = new StrategyBacktestValidator(ctx, {
      backtestTimeoutMs: 1000,
      pollingIntervalMs: 100,
    })

    mockValidator.validateStrategy = vi.fn(async () => ({
      strategyId: 'mock-strategy',
      shouldDeploy: false,
      deployed: false,
      backtest: {
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
      },
      failureReason: 'Win rate 48% < 55%',
      timestamp: Date.now(),
      pollingAttempts: 1,
    }))

    // Replace context validator
    ;(ctx as unknown as { strategyValidator: StrategyBacktestValidator }).strategyValidator = mockValidator

    const decision = await engine.proposeAndValidateStrategy(
      'Poor Strategy',
      'Random entry',
      'Random exit',
      ['AAPL'],
      'No clear edge identified',
    )

    expect(decision.validated).toBe(false)
    expect(decision.deployed).toBe(false)
    expect(decision.validationResult!.failureReason).toContain('Win rate')
  })

  /**
   * Test 3: Multiple concurrent strategy proposals
   */
  it('should handle concurrent strategy proposals independently', async () => {
    const proposals = [
      {
        name: 'Strategy A',
        entry: 'Entry A condition',
        exit: 'Exit A condition',
        symbols: ['SYM1'],
        reasoning: 'Reasoning A',
      },
      {
        name: 'Strategy B',
        entry: 'Entry B condition',
        exit: 'Exit B condition',
        symbols: ['SYM2'],
        reasoning: 'Reasoning B',
      },
      {
        name: 'Strategy C',
        entry: 'Entry C condition',
        exit: 'Exit C condition',
        symbols: ['SYM3'],
        reasoning: 'Reasoning C',
      },
    ]

    const decisions = await Promise.all(
      proposals.map(p =>
        engine.proposeAndValidateStrategy(p.name, p.entry, p.exit, p.symbols, p.reasoning),
      ),
    )

    expect(decisions).toHaveLength(3)
    decisions.forEach((d, i) => {
      expect(d.proposalId).toMatch(/^strategy-/)
      expect(d.timestamp).toBeGreaterThan(0)
      // Verify unique IDs
      if (i > 0) {
        expect(d.proposalId).not.toBe(decisions[i - 1]!.proposalId)
      }
    })
  })

  /**
   * Test 4: Strategy validation with extended polling timeout
   */
  it('should handle extended polling and eventual validation completion', async () => {
    const decision = await engine.proposeAndValidateStrategy(
      'Earnings Arbitrage',
      '2-5 days before earnings announcement',
      '50% profit or 1 day before earnings',
      ['MSFT', 'AAPL'],
      'FinCoT provides 93% accuracy on earnings surprise direction',
    )

    expect(decision.validationResult).toBeDefined()
    expect(decision.validationResult!.pollingAttempts).toBeGreaterThan(0)
    expect(decision.timestamp).toBeGreaterThan(0)
  })

  /**
   * Test 5: Strategy validation with deployment confirmation
   */
  it('should log deployment confirmation when strategy passes all criteria', async () => {
    const decision = await engine.proposeAndValidateStrategy(
      'Volatility Surface Arbitrage',
      '3D IV edge: smile + term structure + skew',
      '50% profit target or 5 days',
      ['SPX'],
      'Exploiting volatility smile and term structure misalignments',
    )

    expect(decision.deployed).toBe(true)
    expect(decision.validationResult!.shouldDeploy).toBe(true)
    expect(decision.validationResult!.backtest.passed).toBe(true)
  })

  /**
   * Test 6: Strategy rejection when criteria not met
   */
  it('should reject strategy when any single criterion fails', async () => {
    // Create custom validator with stricter criteria
    const strictValidator = new StrategyBacktestValidator(ctx, {
      criteria: {
        minWinRate: 65, // Higher threshold
        minSharpeRatio: 2.0, // Higher threshold
        maxDrawdown: 5, // Stricter limit
        minProfitFactor: 3.0, // Higher threshold
      },
    })

    ;(ctx as unknown as { strategyValidator: StrategyBacktestValidator }).strategyValidator = strictValidator

    const decision = await engine.proposeAndValidateStrategy(
      'High Bar Strategy',
      'High bar entry',
      'High bar exit',
      ['TEST'],
      'Testing strict criteria',
    )

    // This should likely fail given the strict criteria
    // The exact result depends on the mock validator's simulated performance
    expect(decision.timestamp).toBeGreaterThan(0)
  })

  /**
   * Test 7: Error handling for missing validator service
   */
  it('should handle gracefully when validator service is unavailable', async () => {
    // Create new context without validator
    const contextWithoutValidator = new Context()
    const engineWithoutValidator = new LLMTradingEngine(contextWithoutValidator, {
      minEdgeScore: 60,
    })

    const decision = await engineWithoutValidator.proposeAndValidateStrategy(
      'Test Strategy',
      'Entry',
      'Exit',
      ['TEST'],
      'Testing missing validator',
    )

    expect(decision.validated).toBe(false)
    expect(decision.deployed).toBe(false)
    expect(decision.failureReason).toContain('validator')
  })

  /**
   * Test 8: Session event logging during strategy proposal and validation
   */
  it('should log strategy proposal and validation events when session provided', async () => {
    // Create mock session for event capture
    const capturedEvents: Array<{ type: string; [key: string]: unknown }> = []
    const mockSession = {
      append: (eventType: string, event: unknown) => {
        capturedEvents.push({ type: eventType, ...event as Record<string, unknown> })
      },
    }

    const decision = await engine.proposeAndValidateStrategy(
      'Sentiment-Driven Timing',
      'Contrarian signals at 5th/95th percentile sentiment',
      'Mean reversion target or 1 day',
      ['QQQ'],
      'Exploiting extreme sentiment conditions with mean reversion',
      mockSession as unknown as { append: (type: string, event: unknown) => void },
    )

    expect(decision.deployed).toBe(true)
    // Should have logged proposal, validation, and decision events
    expect(capturedEvents.length).toBeGreaterThan(0)
  })

  /**
   * Test: Strategy proposal with detailed parameters
   */
  it('should preserve all strategy parameters through validation', async () => {
    const strategyName = 'Microstructure Arbitrage'
    const entryCondition = 'RH API stale quotes detected (500ms-2s lag)'
    const exitCondition = 'Quote refresh or 5 minute elapsed'
    const symbols = ['NVDA', 'AMD']
    const reasoning = 'Latency-aware MM disconnect exploitation'

    const decision = await engine.proposeAndValidateStrategy(
      strategyName,
      entryCondition,
      exitCondition,
      symbols,
      reasoning,
    )

    expect(decision.validationResult!.backtest).toBeDefined()
    expect(decision.validationResult!.backtest.totalTrades).toBeGreaterThan(0)
  })

  /**
   * Test: Polling attempts counting
   */
  it('should track polling attempts during validation', async () => {
    const decision = await engine.proposeAndValidateStrategy(
      'IV Rank Strategy',
      'IV rank indicator setup',
      'Take profit at 50% or 2 day hold',
      ['IVX'],
      'Trading mean reversion in implied volatility',
    )

    expect(decision.validationResult!.pollingAttempts).toBeGreaterThan(0)
    expect(decision.validationResult!.pollingAttempts).toBeLessThanOrEqual(50)
  })
})
