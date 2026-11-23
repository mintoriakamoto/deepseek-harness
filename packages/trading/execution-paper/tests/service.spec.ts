/**
 * Tests for paper trading execution service.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { PaperExecutionService } from '../src/index.ts'
import type { PlaceOrderRequest, ValidationConfig } from '@deepseek-ai/dsh-execution'

describe('PaperExecutionService', () => {
  let ctx: Context
  let service: PaperExecutionService

  beforeEach(() => {
    ctx = new Context()
    service = new PaperExecutionService(ctx, {
      slippagePercent: 0.1,
      startingBalance: 100000,
      enablePartialFills: false,
    })
  })

  describe('placeOrder', () => {
    it('places a buy limit order and fills immediately', async () => {
      const request: PlaceOrderRequest = {
        clientOrderId: 'test-1',
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const result = await service.placeOrder(request)

      expect(result.order.status).toBe('filled')
      expect(result.order.filledQuantity).toBe(100)
      expect(result.order.remainingQuantity).toBe(0)
      expect(result.order.fills).toHaveLength(1)
      expect(result.order.avgFillPrice).toBeCloseTo(150.0015, 4) // 150 * 1.001 (0.1% slippage)
    })

    it('places a sell limit order and fills immediately', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 150,
      }

      const result = await service.placeOrder(request)

      expect(result.order.status).toBe('filled')
      expect(result.order.filledQuantity).toBe(50)
      expect(result.order.avgFillPrice).toBeCloseTo(149.985, 4) // 150 * 0.999 (0.1% negative slippage)
    })

    it('updates balance after buy order', async () => {
      const initialBalance = service.getBalance()

      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      await service.placeOrder(request)

      const finalBalance = service.getBalance()
      const spent = initialBalance - finalBalance

      // Should spend approximately 100 * 150 = 15000
      expect(spent).toBeGreaterThan(14900)
      expect(spent).toBeLessThan(15100)
    })

    it('updates balance after sell order', async () => {
      const initialBalance = service.getBalance()

      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 150,
      }

      await service.placeOrder(request)

      const finalBalance = service.getBalance()
      const proceeds = finalBalance - initialBalance

      // Should receive approximately 50 * 150 = 7500
      expect(proceeds).toBeGreaterThan(7400)
      expect(proceeds).toBeLessThan(7600)
    })

    it('creates partial fills when enabled', async () => {
      const service2 = new PaperExecutionService(ctx, {
        enablePartialFills: true,
        numPartialFills: 2,
        startingBalance: 100000,
      })

      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const result = await service2.placeOrder(request)

      expect(result.order.fills).toHaveLength(2)
      expect(result.order.fills[0].quantity).toBe(50)
      expect(result.order.fills[1].quantity).toBe(50)
      // Fills should have different timestamps
      expect(result.order.fills[1].timestamp).toBeGreaterThan(result.order.fills[0].timestamp)
    })

    it('rejects invalid orders', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: -100,
        limitPrice: 150,
      }

      await expect(service.placeOrder(request)).rejects.toThrow()
    })

    it('rejects limit orders without limit price', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
      }

      await expect(service.placeOrder(request)).rejects.toThrow()
    })
  })

  describe('cancelOrder', () => {
    it('cancels a pending order', async () => {
      const placeRequest: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const { order } = await service.placeOrder(placeRequest)

      // For paper trading, orders fill immediately, so cannot cancel
      const cancelResult = await service.cancelOrder({ orderId: order.orderId })

      expect(cancelResult.success).toBe(false)
      expect(cancelResult.error).toContain('filled')
    })

    it('returns error for non-existent order', async () => {
      const cancelResult = await service.cancelOrder({
        orderId: 'nonexistent' as any,
      })

      expect(cancelResult.success).toBe(false)
      expect(cancelResult.error).toContain('not found')
    })
  })

  describe('getOrderStatus', () => {
    it('retrieves order status', async () => {
      const placeRequest: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const { order: placedOrder } = await service.placeOrder(placeRequest)

      const statusResult = await service.getOrderStatus({ orderId: placedOrder.orderId })

      expect(statusResult.order.orderId).toBe(placedOrder.orderId)
      expect(statusResult.order.status).toBe('filled')
    })

    it('throws error for non-existent order', async () => {
      await expect(
        service.getOrderStatus({ orderId: 'nonexistent' as any }),
      ).rejects.toThrow()
    })
  })

  describe('listOrders', () => {
    it('lists all placed orders', async () => {
      const request1: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const request2: PlaceOrderRequest = {
        symbol: 'MSFT',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 300,
      }

      await service.placeOrder(request1)
      await service.placeOrder(request2)

      const orders = await service.listOrders()

      expect(orders).toHaveLength(2)
      expect(orders[0].symbol).toBe('AAPL')
      expect(orders[1].symbol).toBe('MSFT')
    })
  })

  describe('estimateExecutionCost', () => {
    it('estimates cost for buy orders', () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const cost = service.estimateExecutionCost(request)

      // Should be approximately 100 * 150 with 0.1% slippage
      expect(cost).toBeGreaterThan(14900)
      expect(cost).toBeLessThan(15100)
    })

    it('estimates proceeds for sell orders', () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 150,
      }

      const proceeds = service.estimateExecutionCost(request)

      // Should be approximately 50 * 150 with -0.1% slippage
      expect(proceeds).toBeGreaterThan(7400)
      expect(proceeds).toBeLessThan(7600)
    })
  })

  describe('reset and balance management', () => {
    it('resets service state', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      await service.placeOrder(request)
      expect(service.listOrders()).resolves.toHaveLength(1)

      service.reset()
      const orders = await service.listOrders()
      expect(orders).toHaveLength(0)
    })

    it('resets balance on reset', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      await service.placeOrder(request)
      expect(service.getBalance()).toBeLessThan(100000)

      service.reset(50000)
      expect(service.getBalance()).toBe(50000)
    })

    it('allows manual balance setting', () => {
      service.setBalance(50000)
      expect(service.getBalance()).toBe(50000)
    })
  })
})
