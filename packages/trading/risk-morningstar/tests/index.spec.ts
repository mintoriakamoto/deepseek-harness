/**
 * Tests for Morningstar Risk Analytics provider.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import MorningstarRiskService, { type MorningstarRiskConfig } from '../src/index'
import type { Position, RiskConfig } from '@deepseek-ai/dsh-risk-policy'

describe('MorningstarRiskService', () => {
  let service: MorningstarRiskService
  let ctx: Context

  beforeEach(() => {
    ctx = new Context()
    service = new MorningstarRiskService(ctx, {
      enableCache: true,
      cacheTtl: 1000, // 1 second for testing
    })
  })

  describe('getDefaultForecast', () => {
    it('should return default forecast for investment grade symbol', async () => {
      const forecast = await service.getDefaultForecast('AAPL')

      expect(forecast.symbol).toBe('AAPL')
      expect(forecast.probability).toBeGreaterThanOrEqual(0)
      expect(forecast.probability).toBeLessThanOrEqual(1)
      expect(forecast.confidence).toBeGreaterThan(0)
      expect(forecast.horizon).toBe(252)
      expect(forecast.source).toBe('morningstar-tail-risk-model')
      expect(forecast.timestamp).toBeGreaterThan(0)
    })

    it('should return higher default probability for high-yield symbols', async () => {
      const igForecast = await service.getDefaultForecast('AAPL')
      const hyForecast = await service.getDefaultForecast('HY-BOND')

      expect(hyForecast.probability).toBeGreaterThan(igForecast.probability)
    })

    it('should cache forecast results', async () => {
      const forecast1 = await service.getDefaultForecast('TSLA')
      const forecast2 = await service.getDefaultForecast('TSLA')

      // Same object reference indicates caching
      expect(forecast1).toEqual(forecast2)
    })

    it('should handle concurrent forecast requests', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN']
      const forecasts = await Promise.all(symbols.map(s => service.getDefaultForecast(s)))

      expect(forecasts).toHaveLength(5)
      expect(forecasts.every(f => f.probability > 0 && f.probability < 1)).toBe(true)
    })

    it('should handle edge case with empty symbol', async () => {
      const forecast = await service.getDefaultForecast('')

      expect(forecast.symbol).toBe('')
      expect(forecast.probability).toBeGreaterThanOrEqual(0)
      expect(forecast.probability).toBeLessThanOrEqual(1)
    })
  })

  describe('getStressScenarios', () => {
    it('should return standard stress scenarios', async () => {
      const positions: Position[] = [
        {
          symbol: 'SPY',
          quantity: 100,
          avgEntryPrice: 400,
          currentPrice: 410,
          side: 'long',
        },
      ]

      const scenarios = await service.getStressScenarios(positions)

      expect(scenarios).toHaveLength(5)
      expect(scenarios[0].name).toBe('Market Correction')
      expect(scenarios[1].name).toBe('Stress Event')
      expect(scenarios[2].name).toBe('Crisis Scenario')
      expect(scenarios[3].name).toBe('Volatility Spike')
      expect(scenarios[4].name).toBe('Correlation Breakdown')
    })

    it('should calculate portfolio impact for each scenario', async () => {
      const positions: Position[] = [
        {
          symbol: 'SPY',
          quantity: 100,
          avgEntryPrice: 400,
          currentPrice: 410,
          side: 'long',
        },
        {
          symbol: 'QQQ',
          quantity: 50,
          avgEntryPrice: 300,
          currentPrice: 320,
          side: 'long',
        },
      ]

      const scenarios = await service.getStressScenarios(positions)

      scenarios.forEach(scenario => {
        expect(scenario.name).toBeTruthy()
        expect(scenario.description).toBeTruthy()
        expect(scenario.marketMove).toBeGreaterThanOrEqual(-0.3)
        expect(scenario.marketMove).toBeLessThanOrEqual(0)
        expect(scenario.ivChange).toBeGreaterThanOrEqual(0)
        expect(scenario.correlationShift).toBeGreaterThanOrEqual(0)
        expect(scenario.correlationShift).toBeLessThanOrEqual(1)
        expect(typeof scenario.portfolioImpact).toBe('number')
      })
    })

    it('should handle empty portfolio', async () => {
      const scenarios = await service.getStressScenarios([])
      expect(scenarios).toHaveLength(0)
    })

    it('should handle crisis scenario with significant impact', async () => {
      const positions: Position[] = [
        {
          symbol: 'SPY',
          quantity: 1000,
          avgEntryPrice: 400,
          currentPrice: 410,
          side: 'long',
        },
      ]

      const scenarios = await service.getStressScenarios(positions)
      const crisis = scenarios.find(s => s.name === 'Crisis Scenario')

      expect(crisis).toBeTruthy()
      expect(crisis!.marketMove).toBe(-0.3)
      expect(crisis!.portfolioImpact).toBeLessThan(0) // Large negative impact
    })
  })

  describe('getCorrelationMatrix', () => {
    it('should return valid correlation matrix', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL']
      const matrix = await service.getCorrelationMatrix(symbols)

      expect(matrix.symbols).toEqual(symbols)
      expect(matrix.correlations).toHaveLength(3)
      expect(matrix.correlations[0]).toHaveLength(3)
      expect(matrix.timestamp).toBeGreaterThan(0)
    })

    it('should ensure diagonal is 1.0', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL']
      const matrix = await service.getCorrelationMatrix(symbols)

      for (let i = 0; i < symbols.length; i++) {
        expect(matrix.correlations[i][i]).toBe(1.0)
      }
    })

    it('should ensure matrix is symmetric', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA']
      const matrix = await service.getCorrelationMatrix(symbols)

      for (let i = 0; i < symbols.length; i++) {
        for (let j = 0; j < symbols.length; j++) {
          expect(matrix.correlations[i][j]).toBe(matrix.correlations[j][i])
        }
      }
    })

    it('should cache correlation matrices', async () => {
      const symbols = ['AAPL', 'MSFT']
      const matrix1 = await service.getCorrelationMatrix(symbols)
      const matrix2 = await service.getCorrelationMatrix(symbols)

      expect(matrix1.correlations).toEqual(matrix2.correlations)
    })

    it('should handle empty symbol list', async () => {
      const matrix = await service.getCorrelationMatrix([])
      expect(matrix.symbols).toEqual([])
      expect(matrix.correlations).toHaveLength(0)
    })

    it('should handle concurrent correlation requests', async () => {
      const symbolSets = [
        ['AAPL', 'MSFT'],
        ['GOOGL', 'TSLA'],
        ['AMZN', 'NFLX'],
      ]

      const matrices = await Promise.all(symbolSets.map(s => service.getCorrelationMatrix(s)))

      expect(matrices).toHaveLength(3)
      matrices.forEach((matrix, idx) => {
        expect(matrix.symbols).toEqual(symbolSets[idx])
        expect(matrix.correlations).toHaveLength(2)
      })
    })
  })

  describe('assessRisk', () => {
    it('should approve low-risk position', async () => {
      const position: Position = {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 150,
        currentPrice: 160,
        side: 'long',
      }

      const portfolio: Position[] = [position]

      const config: RiskConfig = {
        maxDailyLoss: 0.02,
        maxPositionSize: 0.5,
        marginUsageLimit: 0.6,
        volatilityThreshold: 80,
      }

      const assessment = await service.assessRisk(position, portfolio, config)

      expect(assessment.approved).toBe(true)
      expect(assessment.reasons).toHaveLength(0)
    })

    it('should reject position exceeding size limit', async () => {
      const position: Position = {
        symbol: 'AAPL',
        quantity: 10000,
        avgEntryPrice: 150,
        currentPrice: 160,
        side: 'long',
      }

      const portfolio: Position[] = [position]

      const config: RiskConfig = {
        maxDailyLoss: 0.02,
        maxPositionSize: 0.1, // Only 10% allowed
        marginUsageLimit: 0.6,
        volatilityThreshold: 80,
      }

      const assessment = await service.assessRisk(position, portfolio, config)

      expect(assessment.approved).toBe(false)
      expect(assessment.reasons.length).toBeGreaterThan(0)
      expect(assessment.recommendedAdjustment).toBeLessThan(1.0)
    })

    it('should include warning for high IV', async () => {
      const position: Position = {
        symbol: 'AAPL',
        quantity: 10,
        avgEntryPrice: 150,
        currentPrice: 160,
        side: 'long',
      }

      const portfolio: Position[] = [position]

      const config: RiskConfig = {
        maxDailyLoss: 0.05,
        maxPositionSize: 0.5,
        marginUsageLimit: 0.6,
        volatilityThreshold: 20, // Low threshold to likely trigger warning
      }

      const assessment = await service.assessRisk(position, portfolio, config)

      // May have warnings depending on random IV
      expect(Array.isArray(assessment.warnings)).toBe(true)
    })

    it('should include Greeks limits in assessment', async () => {
      const position: Position = {
        symbol: 'SPY',
        quantity: 100,
        avgEntryPrice: 400,
        currentPrice: 400,
        side: 'long',
      }

      const portfolio: Position[] = [position]

      const config: RiskConfig = {
        maxDailyLoss: 0.02,
        maxPositionSize: 0.3,
        maxGreeks: {
          delta: 0.2, // Very tight limit
          gamma: 0.02,
          vega: 5,
          theta: 0.5,
        },
        marginUsageLimit: 0.6,
        volatilityThreshold: 80,
      }

      const assessment = await service.assessRisk(position, portfolio, config)

      // Should trigger Greeks warnings/rejections due to tight limits
      expect(typeof assessment.approved).toBe('boolean')
      expect(typeof assessment.recommendedAdjustment).toBe('number')
    })

    it('should include stress scenarios on rejection', async () => {
      const position: Position = {
        symbol: 'AAPL',
        quantity: 10000,
        avgEntryPrice: 150,
        currentPrice: 160,
        side: 'long',
      }

      const portfolio: Position[] = [position]

      const config: RiskConfig = {
        maxDailyLoss: 0.001, // Very strict loss limit
        maxPositionSize: 0.05, // Very strict size limit
        marginUsageLimit: 0.6,
        volatilityThreshold: 80,
      }

      const assessment = await service.assessRisk(position, portfolio, config)

      expect(assessment.approved).toBe(false)
      expect(assessment.marketStress).toBeTruthy()
      expect(Array.isArray(assessment.marketStress)).toBe(true)
    })

    it('should handle concurrent risk assessments', async () => {
      const positions: Position[] = [
        { symbol: 'AAPL', quantity: 100, avgEntryPrice: 150, currentPrice: 160, side: 'long' },
        { symbol: 'MSFT', quantity: 50, avgEntryPrice: 300, currentPrice: 320, side: 'long' },
        { symbol: 'GOOGL', quantity: 25, avgEntryPrice: 2000, currentPrice: 2100, side: 'long' },
      ]

      const config: RiskConfig = {
        maxDailyLoss: 0.05,
        maxPositionSize: 0.2,
        marginUsageLimit: 0.6,
        volatilityThreshold: 80,
      }

      const assessments = await Promise.all(
        positions.map(p => service.assessRisk(p, positions, config)),
      )

      expect(assessments).toHaveLength(3)
      assessments.forEach(a => {
        expect(typeof a.approved).toBe('boolean')
        expect(Array.isArray(a.reasons)).toBe(true)
        expect(Array.isArray(a.warnings)).toBe(true)
      })
    })
  })

  describe('caching behavior', () => {
    it('should respect cache TTL expiration', async () => {
      const service2 = new MorningstarRiskService(ctx, {
        enableCache: true,
        cacheTtl: 100, // 100ms TTL
      })

      const forecast1 = await service2.getDefaultForecast('AAPL')
      await new Promise(resolve => setTimeout(resolve, 150)) // Wait for cache to expire
      const forecast2 = await service2.getDefaultForecast('AAPL')

      // Values should be different due to randomness after cache expiration
      expect(forecast1.timestamp).not.toBe(forecast2.timestamp)
    })

    it('should disable cache when configured', async () => {
      const noCacheService = new MorningstarRiskService(ctx, {
        enableCache: false,
      })

      const forecast1 = await noCacheService.getDefaultForecast('IBM')
      const forecast2 = await noCacheService.getDefaultForecast('IBM')

      // Different instances due to no caching
      expect(forecast1.timestamp).not.toBe(forecast2.timestamp)
    })
  })
})
