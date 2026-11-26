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

  describe('edge cases and advanced scenarios', () => {
    it('handles fractional shares', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSLA',
        side: 'buy',
        type: 'limit',
        quantity: 10.5,
        limitPrice: 100,
      }

      const result = await service.placeOrder(request)

      expect(result.order.filledQuantity).toBe(10.5)
      expect(result.order.status).toBe('filled')
    })

    it('handles very small quantities', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'BTC',
        side: 'buy',
        type: 'limit',
        quantity: 0.001,
        limitPrice: 50000,
      }

      const result = await service.placeOrder(request)

      expect(result.order.filledQuantity).toBe(0.001)
      expect(result.order.status).toBe('filled')
    })

    it('handles large quantities', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'PENNY',
        side: 'buy',
        type: 'limit',
        quantity: 1_000_000,
        limitPrice: 0.01,
      }

      const result = await service.placeOrder(request)

      expect(result.order.filledQuantity).toBe(1_000_000)
      expect(result.order.status).toBe('filled')
    })

    it('calculates average fill price correctly with partial fills', async () => {
      const service2 = new PaperExecutionService(ctx, {
        enablePartialFills: true,
        numPartialFills: 3,
        startingBalance: 1_000_000,
      })

      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 300,
        limitPrice: 150,
      }

      const result = await service2.placeOrder(request)

      // All fills should have the same price with slippage
      const avgFillPrice = result.order.avgFillPrice
      expect(avgFillPrice).toBeCloseTo(150.0015, 4) // All fills at same price
      expect(result.order.fills).toHaveLength(3)
      expect(result.order.fills[0].price).toBe(result.order.fills[1].price)
      expect(result.order.fills[1].price).toBe(result.order.fills[2].price)
    })

    it('generates unique order IDs', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const result1 = await service.placeOrder(request)
      const result2 = await service.placeOrder(request)

      expect(result1.order.orderId).not.toBe(result2.order.orderId)
    })

    it('preserves order metadata', async () => {
      const request: PlaceOrderRequest = {
        clientOrderId: 'custom-id-123',
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
        timeInForce: 'day',
      }

      const result = await service.placeOrder(request)

      expect(result.order.clientOrderId).toBe('custom-id-123')
      expect(result.order.symbol).toBe('AAPL')
      expect(result.order.side).toBe('buy')
      expect(result.order.type).toBe('limit')
      expect(result.order.timeInForce).toBe('day')
    })

    it('provides execution style identifier', () => {
      expect(service.executionStyle).toBe('paper')
    })

    it('handles multiple consecutive trades', async () => {
      const initialBalance = service.getBalance()

      // First buy order
      const buyRequest: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }
      await service.placeOrder(buyRequest)
      const afterFirstBuy = service.getBalance()

      // Sell part of position
      const sellRequest: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 160,
      }
      await service.placeOrder(sellRequest)
      const afterSell = service.getBalance()

      // Buy more
      const buyMoreRequest: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 155,
      }
      await service.placeOrder(buyMoreRequest)
      const afterSecondBuy = service.getBalance()

      // Verify balance changes are correct
      expect(afterFirstBuy).toBeLessThan(initialBalance)
      expect(afterSell).toBeGreaterThan(afterFirstBuy)
      expect(afterSecondBuy).toBeLessThan(afterSell)
    })

    it('handles zero remaining quantity correctly', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const result = await service.placeOrder(request)

      expect(result.order.remainingQuantity).toBe(0)
      expect(result.order.filledQuantity + result.order.remainingQuantity).toBe(result.order.quantity)
    })

    it('applies slippage correctly to buy orders', async () => {
      const service2 = new PaperExecutionService(ctx, {
        slippagePercent: 0.5,
        startingBalance: 100000,
      })

      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 100,
      }

      const result = await service2.placeOrder(request)

      // Buy side: price increases by slippage
      // 100 * (1 + 0.005) = 100.5
      expect(result.order.avgFillPrice).toBeCloseTo(100.5, 2)
    })

    it('applies slippage correctly to sell orders', async () => {
      const service2 = new PaperExecutionService(ctx, {
        slippagePercent: 0.5,
        startingBalance: 100000,
      })

      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'sell',
        type: 'limit',
        quantity: 100,
        limitPrice: 100,
      }

      const result = await service2.placeOrder(request)

      // Sell side: price decreases by slippage
      // 100 * (1 - 0.005) = 99.5
      expect(result.order.avgFillPrice).toBeCloseTo(99.5, 2)
    })

    it('handles partial fills with remainder', async () => {
      const service2 = new PaperExecutionService(ctx, {
        enablePartialFills: true,
        numPartialFills: 3,
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

      // 100 / 3 = 33, with remainder 1
      // So quantities should be 33, 33, 34
      const quantities = result.order.fills.map(f => f.quantity)
      expect(quantities[0]).toBe(33)
      expect(quantities[1]).toBe(33)
      expect(quantities[2]).toBe(34)
      expect(quantities.reduce((a, b) => a + b)).toBe(100)
    })

    it('maintains order history across operations', async () => {
      const req1: PlaceOrderRequest = {
        clientOrderId: 'order1',
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const req2: PlaceOrderRequest = {
        clientOrderId: 'order2',
        symbol: 'MSFT',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 300,
      }

      const result1 = await service.placeOrder(req1)
      const result2 = await service.placeOrder(req2)

      const orders = await service.listOrders()
      expect(orders).toHaveLength(2)

      // Verify both orders are stored
      expect(orders[0].clientOrderId).toBe('order1')
      expect(orders[1].clientOrderId).toBe('order2')
    })

    it('uses default starting balance when not specified', () => {
      const defaultService = new PaperExecutionService(ctx)
      expect(defaultService.getBalance()).toBe(100000)
    })

    it('uses default slippage when not specified', async () => {
      const defaultService = new PaperExecutionService(ctx, { startingBalance: 100000 })

      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 100,
      }

      const result = await defaultService.placeOrder(request)

      // Default slippage is 0.1%
      // 100 * 1.001 = 100.1
      expect(result.order.avgFillPrice).toBeCloseTo(100.1, 3)
    })

    it('recalculates balance accurately after multiple operations', async () => {
      const initialBalance = 100000
      service.setBalance(initialBalance)

      // Buy 100 AAPL at 150 (with 0.1% slippage)
      const buyRequest: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }
      const buyResult = await service.placeOrder(buyRequest)
      const spentOnBuy = buyResult.order.avgFillPrice * 100

      // Sell 50 AAPL at 160 (with 0.1% slippage)
      const sellRequest: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 160,
      }
      const sellResult = await service.placeOrder(sellRequest)
      const receivedFromSell = sellResult.order.avgFillPrice * 50

      const expectedBalance = initialBalance - spentOnBuy + receivedFromSell
      expect(service.getBalance()).toBeCloseTo(expectedBalance, 1)
    })

    it('rejects orders with zero quantity', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 0,
        limitPrice: 150,
      }

      await expect(service.placeOrder(request)).rejects.toThrow()
    })

    it('fills are recorded with timestamps', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      const beforeOrder = Date.now()
      const result = await service.placeOrder(request)
      const afterOrder = Date.now()

      expect(result.order.fills).toHaveLength(1)
      expect(result.order.fills[0].timestamp).toBeGreaterThanOrEqual(beforeOrder)
      expect(result.order.fills[0].timestamp).toBeLessThanOrEqual(afterOrder)
    })
  })
})
