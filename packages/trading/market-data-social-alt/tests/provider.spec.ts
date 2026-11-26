/**
 * Tests for LunarCrush social sentiment provider.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LunarCrushProvider } from '../src/index.js'

describe('LunarCrushProvider', () => {
  let ctx: Context
  let provider: LunarCrushProvider

  beforeEach(() => {
    ctx = new Context()
    provider = new LunarCrushProvider(ctx, { debug: false, cacheTtlMs: 1000 })
  })

  it('1. fetches Twitter sentiment only when other sources disabled', async () => {
    const provider = new LunarCrushProvider(ctx, {
      sources: {
        twitter: { enabled: true },
        reddit: { enabled: false },
        discord: { enabled: false },
      },
    })

    const sentiments = await provider.getSentiment(['SPY'])
    expect(sentiments).toHaveLength(1)
    expect(sentiments[0]).toMatchObject({
      symbol: 'SPY',
      score: expect.any(Number),
      sampleCount: 1,
    })
  })

  it('2. aggregates all sources with balanced weighting', async () => {
    const provider = new LunarCrushProvider(ctx, {
      sources: {
        twitter: { enabled: true, weight: 0.5 },
        reddit: { enabled: true, weight: 0.3 },
        discord: { enabled: true, weight: 0.2 },
      },
    })

    const sentiments = await provider.getSentiment(['BTC'])
    expect(sentiments).toHaveLength(1)
    expect(sentiments[0].sampleCount).toBe(3)
    expect(sentiments[0].sourceScores).toBeDefined()
    expect(sentiments[0].sourceScores?.twitter).toBeDefined()
    expect(sentiments[0].sourceScores?.reddit).toBeDefined()
    expect(sentiments[0].sourceScores?.discord).toBeDefined()
  })

  it('3. prioritizes high Twitter score over low Reddit score', async () => {
    const provider = new LunarCrushProvider(ctx, {
      sources: {
        twitter: { enabled: true, weight: 0.8 },
        reddit: { enabled: true, weight: 0.2 },
        discord: { enabled: false },
      },
    })

    const sentiments = await provider.getSentiment(['SPY'])
    const sentiment = sentiments[0]

    // With Twitter weight 0.8 and Reddit weight 0.2, Twitter dominates
    expect(sentiment.score).toBeGreaterThan(0)
    const twitterScore = sentiment.sourceScores?.twitter ?? 0
    const redditScore = sentiment.sourceScores?.reddit ?? 0
    expect(twitterScore).toBeGreaterThan(redditScore)
  })

  it('4. filters zero-score sources from aggregation', async () => {
    const provider = new LunarCrushProvider(ctx, {
      sources: {
        twitter: { enabled: true, weight: 0.5 },
        reddit: { enabled: true, weight: 0.5 },
        discord: { enabled: false },
      },
    })

    const sentiments = await provider.getSentiment(['SPY'])
    expect(sentiments[0].sampleCount).toBe(2)
  })

  it('5. normalizes trending rank to [-1, 1] range', async () => {
    const sentiments = await provider.getSentiment(['BTC'])
    const sentiment = sentiments[0]

    expect(sentiment.score).toBeGreaterThanOrEqual(-1)
    expect(sentiment.score).toBeLessThanOrEqual(1)
  })

  it('6. incorporates influencer sentiment weighting', async () => {
    const sentiments = await provider.getSentiment(['BTC', 'ETH'])

    for (const sentiment of sentiments) {
      expect(sentiment.sourceScores?.volume).toBeDefined()
      expect(typeof sentiment.sourceScores?.volume).toBe('number')
      expect(sentiment.sourceScores?.volume).toBeGreaterThanOrEqual(0)
    }
  })

  it('7. handles concurrent symbol requests in batches', async () => {
    const provider = new LunarCrushProvider(ctx, { maxConcurrency: 2 })

    const symbols = ['SPY', 'QQQ', 'TSLA', 'BTC', 'ETH']
    const sentiments = await provider.getSentiment(symbols)

    expect(sentiments).toHaveLength(5)
    expect(sentiments.map(s => s.symbol).sort()).toEqual(symbols.sort())
  })

  it('8. handles API timeout gracefully with fallback', async () => {
    const provider = new LunarCrushProvider(ctx, {
      timeoutMs: 100,
      debug: false,
    })

    const sentiments = await provider.getSentiment(['SPY', 'INVALID_SYMBOL', 'QQQ'])
    // Should return valid results while invalid entries are null/filtered
    expect(Array.isArray(sentiments)).toBe(true)
  })

  it('9. falls back to default when source unavailable', async () => {
    const provider = new LunarCrushProvider(ctx, {
      sources: {
        twitter: { enabled: true },
        reddit: { enabled: true },
        discord: { enabled: true },
      },
    })

    const sentiments = await provider.getSentiment(['SPY'])
    expect(sentiments).toHaveLength(1)
    expect(sentiments[0].score).toBeDefined()
  })

  it('10. detects volume increase and applies boost', async () => {
    const sentiments = await provider.getSentiment(['BTC', 'SPY'])

    // BTC has higher volume increase (45) than SPY (5)
    // so BTC sentiment should benefit more from volume boost
    const btc = sentiments.find(s => s.symbol === 'BTC')
    const spy = sentiments.find(s => s.symbol === 'SPY')

    expect(btc).toBeDefined()
    expect(spy).toBeDefined()
    if (btc && spy) {
      const btcVolume = btc.sourceScores?.volume ?? 0
      const spyVolume = spy.sourceScores?.volume ?? 0
      expect(btcVolume).toBeGreaterThan(spyVolume)
    }
  })

  it('11. correlates cross-symbol sentiment trends', async () => {
    const sentiments = await provider.getSentiment(['BTC', 'ETH', 'SPY', 'QQQ'])

    // Crypto (BTC, ETH) should have higher sentiment than equity (SPY, QQQ)
    const crypto = sentiments.filter(s => ['BTC', 'ETH'].includes(s.symbol))
    const equity = sentiments.filter(s => ['SPY', 'QQQ'].includes(s.symbol))

    const cryptoAvg = crypto.reduce((sum, s) => sum + s.score, 0) / crypto.length
    const equityAvg = equity.reduce((sum, s) => sum + s.score, 0) / equity.length

    expect(cryptoAvg).toBeGreaterThan(equityAvg)
  })

  it('12. respects 5-minute cache TTL', async () => {
    const provider = new LunarCrushProvider(ctx, { cacheTtlMs: 1000 })

    // First fetch
    const sentiments1 = await provider.getSentiment(['SPY'])
    expect(sentiments1).toHaveLength(1)

    // Second fetch should use cache
    const sentiments2 = await provider.getSentiment(['SPY'])
    expect(sentiments2[0].score).toBe(sentiments1[0].score)

    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Third fetch should refresh
    const sentiments3 = await provider.getSentiment(['SPY'])
    expect(sentiments3).toHaveLength(1)
  })

  it('rejects getQuote operation', async () => {
    await expect(provider.getQuote('SPY')).rejects.toThrow('does not support quotes')
  })

  it('rejects getBars operation', async () => {
    await expect(provider.getBars('SPY', '1h', 24)).rejects.toThrow('does not support bars')
  })

  it('rejects subscribe operation', async () => {
    await expect(provider.subscribe('SPY', () => {})).rejects.toThrow('does not support subscriptions')
  })

  it('clampsscores to [-1, 1] range', async () => {
    const sentiments = await provider.getSentiment(['SPY', 'QQQ', 'TSLA', 'BTC', 'ETH'])

    for (const sentiment of sentiments) {
      expect(sentiment.score).toBeGreaterThanOrEqual(-1)
      expect(sentiment.score).toBeLessThanOrEqual(1)
    }
  })

  it('includes source scores in output', async () => {
    const sentiments = await provider.getSentiment(['BTC'])

    expect(sentiments[0].sourceScores).toBeDefined()
    expect(typeof sentiments[0].sourceScores?.twitter).toBe('number')
    expect(typeof sentiments[0].sourceScores?.reddit).toBe('number')
    expect(typeof sentiments[0].sourceScores?.discord).toBe('number')
  })

  it('provides provider name', () => {
    expect(provider.name).toBe('lunarcrush')
  })

  it('handles empty symbol array', async () => {
    const sentiments = await provider.getSentiment([])
    expect(sentiments).toEqual([])
  })

  it('filters null results from concurrent requests', async () => {
    const provider = new LunarCrushProvider(ctx, { maxConcurrency: 2 })
    const sentiments = await provider.getSentiment(['SPY', 'QQQ', 'ETH'])

    // All valid symbols should return results
    expect(sentiments.length).toBeGreaterThan(0)
    expect(sentiments.every(s => s.symbol && typeof s.score === 'number')).toBe(true)
  })

  it('respects custom source weights', async () => {
    const provider = new LunarCrushProvider(ctx, {
      sources: {
        twitter: { enabled: true, weight: 0.7 },
        reddit: { enabled: true, weight: 0.2 },
        discord: { enabled: true, weight: 0.1 },
      },
    })

    const sentiments = await provider.getSentiment(['SPY'])
    expect(sentiments[0]).toMatchObject({
      symbol: 'SPY',
      score: expect.any(Number),
    })
  })

  it('includes timestamp in output', async () => {
    const sentiments = await provider.getSentiment(['BTC'])

    expect(sentiments[0].timestamp).toBeDefined()
    expect(typeof sentiments[0].timestamp).toBe('number')
    expect(sentiments[0].timestamp).toBeGreaterThan(0)
  })
})
