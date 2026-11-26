/**
 * Tests for order validation.
 */

import { describe, it, expect } from 'vitest'
import { validateOrder, validateQuantityAndPrice } from '../src/validation.ts'
import type { PlaceOrderRequest, ValidationConfig } from '../src/types.ts'

describe('validateOrder', () => {
  const baseConfig: ValidationConfig = {
    minOrderSize: 1,
    maxOrderSize: 1000,
    allowFractional: true,
    minTickSize: 0.01,
    availableBalance: 10000,
  }

  it('validates a valid limit buy order', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      limitPrice: 150,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('validates a valid market sell order', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'sell',
      type: 'market',
      quantity: 50,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects orders with invalid symbol', () => {
    const request: PlaceOrderRequest = {
      symbol: '',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      limitPrice: 150,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Symbol is required'))
  })

  it('rejects orders with invalid side', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'invalid' as 'buy' | 'sell',
      type: 'limit',
      quantity: 100,
      limitPrice: 150,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(false)
  })

  it('rejects orders below minimum size', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 0.5,
      limitPrice: 150,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('below minimum order size'))
  })

  it('rejects orders above maximum size', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 2000,
      limitPrice: 150,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('exceeds maximum order size'))
  })

  it('rejects fractional shares when not allowed', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100.5,
      limitPrice: 150,
    }

    const result = validateOrder(request, { ...baseConfig, allowFractional: false })
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Fractional shares not allowed'))
  })

  it('rejects limit orders without limit price', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Limit price is required'))
  })

  it('rejects negative limit prices', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      limitPrice: -150,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(false)
  })

  it('rejects orders exceeding available balance', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      limitPrice: 200,
    }

    const result = validateOrder(request, { ...baseConfig, availableBalance: 10000 })
    // 100 * 200 = 20000, with 5% slippage = 21000 > 10000
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Insufficient balance'))
  })

  it('warns on prices not aligned with tick size', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      limitPrice: 150.123,
    }

    const result = validateOrder(request, baseConfig)
    expect(result.warnings).toContainEqual(expect.stringContaining('minimum tick size'))
  })

  it('rejects invalid time-in-force', () => {
    const request: PlaceOrderRequest = {
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      limitPrice: 150,
      timeInForce: 'invalid' as 'day' | 'gtc' | 'ioc' | 'fok',
    }

    const result = validateOrder(request, baseConfig)
    expect(result.valid).toBe(false)
  })
})

describe('validateQuantityAndPrice', () => {
  const baseConfig: ValidationConfig = {
    minOrderSize: 1,
    maxOrderSize: 1000,
    allowFractional: true,
    minTickSize: 0.01,
    availableBalance: 10000,
  }

  it('validates valid quantity and price', () => {
    const result = validateQuantityAndPrice(100, 150, baseConfig)
    expect(result).toBe(true)
  })

  it('rejects quantity below minimum', () => {
    const result = validateQuantityAndPrice(0.5, 150, baseConfig)
    expect(result).toBe(false)
  })

  it('rejects quantity above maximum', () => {
    const result = validateQuantityAndPrice(2000, 150, baseConfig)
    expect(result).toBe(false)
  })

  it('rejects fractional shares when not allowed', () => {
    const result = validateQuantityAndPrice(100.5, 150, { ...baseConfig, allowFractional: false })
    expect(result).toBe(false)
  })

  it('rejects negative price', () => {
    const result = validateQuantityAndPrice(100, -150, baseConfig)
    expect(result).toBe(false)
  })
})
