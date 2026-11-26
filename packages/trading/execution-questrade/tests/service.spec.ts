/**
 * Tests for Questrade execution service.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { QuestradExecutionService } from '../src/index.ts'
import type { PlaceOrderRequest, OrderId } from '@deepseek-ai/dsh-execution'

describe('QuestradExecutionService', () => {
  let ctx: Context
  let service: QuestradExecutionService

  beforeEach(() => {
    ctx = new Context()
    service = new QuestradExecutionService(ctx, {
      slippagePercent: 0.15,
      startingBalance: 100000,
      commissionPerTrade: 4.95,
      enablePartialFills: false,
      maxOrderSize: 50000,
    })
  })

  describe('order placement', () => {
    it('places a buy limit order and fills immediately', async () => {
      const request: PlaceOrderRequest = {
        clientOrderId: 'test-1',
        symbol: 'TSX:ENB',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50.00,
      }

      const result = await service.placeOrder(request)

      expect(result.order.status).toBe('filled')
      expect(result.order.filledQuantity).toBe(100)
      expect(result.order.remainingQuantity).toBe(0)
      expect(result.order.fills).toHaveLength(1)
      // 50 * 1.0015 (0.15% slippage) = 50.075
      expect(result.order.avgFillPrice).toBeCloseTo(50.075, 2)
    })

    it('places a sell limit order and fills immediately', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:RCI',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 150.00,
      }

      const result = await service.placeOrder(request)

      expect(result.order.status).toBe('filled')
      expect(result.order.filledQuantity).toBe(50)
      // 150 * 0.9985 (0.15% negative slippage) = 149.775
      expect(result.order.avgFillPrice).toBeCloseTo(149.775, 2)
    })

    it('rejects fractional shares', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 10.5,
        limitPrice: 100,
      }

      await expect(service.placeOrder(request)).rejects.toThrow('Fractional shares')
    })

    it('rejects orders exceeding max size', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 60000,
        limitPrice: 100,
      }

      await expect(service.placeOrder(request)).rejects.toThrow('order size limit exceeded')
    })

    it('rejects limit orders without limit price', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
      }

      await expect(service.placeOrder(request)).rejects.toThrow()
    })

    it('rejects orders with insufficient balance', async () => {
      service.setBalance(1000)

      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 150,
      }

      await expect(service.placeOrder(request)).rejects.toThrow('Insufficient balance')
    })

    it('generates unique order IDs', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      const result1 = await service.placeOrder(request)
      const result2 = await service.placeOrder(request)

      expect(result1.order.orderId).not.toBe(result2.order.orderId)
      expect(result1.order.orderId).toMatch(/^qt-/)
      expect(result2.order.orderId).toMatch(/^qt-/)
    })

    it('preserves order metadata', async () => {
      const request: PlaceOrderRequest = {
        clientOrderId: 'custom-id-123',
        symbol: 'TSX:ENB',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
        timeInForce: 'day',
      }

      const result = await service.placeOrder(request)

      expect(result.order.clientOrderId).toBe('custom-id-123')
      expect(result.order.symbol).toBe('TSX:ENB')
      expect(result.order.side).toBe('buy')
      expect(result.order.type).toBe('limit')
      expect(result.order.timeInForce).toBe('day')
    })
  })

  describe('balance management', () => {
    it('deducts commission from buy orders', async () => {
      const initialBalance = service.getBalance()

      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      await service.placeOrder(request)

      const finalBalance = service.getBalance()
      const spent = initialBalance - finalBalance

      // 100 * 50.075 (with slippage) + 4.95 (commission) = 5012.70
      expect(spent).toBeGreaterThan(5000)
      expect(spent).toBeLessThan(5020)
    })

    it('deducts commission from sell orders', async () => {
      // First place a buy order to establish position
      const buyRequest: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(buyRequest)

      const balanceAfterBuy = service.getBalance()

      // Now sell
      const sellRequest: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'sell',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      await service.placeOrder(sellRequest)

      const finalBalance = service.getBalance()
      const proceeds = finalBalance - balanceAfterBuy

      // 100 * 49.925 (with negative slippage) - 4.95 (commission) = 4987.55
      expect(proceeds).toBeGreaterThan(4985)
      expect(proceeds).toBeLessThan(4990)
    })

    it('tracks balance correctly after multiple trades', async () => {
      const initialBalance = 100000

      // Buy 100 shares at 50
      const buyRequest1: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(buyRequest1)

      // Sell 50 shares at 55
      const sellRequest: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 55,
      }
      await service.placeOrder(sellRequest)

      // Buy another 100 shares at 52
      const buyRequest2: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 52,
      }
      await service.placeOrder(buyRequest2)

      const finalBalance = service.getBalance()

      // Verify balance has changed in expected direction
      expect(finalBalance).toBeLessThan(initialBalance)
      expect(service.getTotalCommissionsPaid()).toBe(3 * 4.95) // 3 orders
    })
  })

  describe('position tracking', () => {
    it('tracks position after buy order', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      await service.placeOrder(request)

      const position = service.getPosition('TSX:ENB')
      expect(position).toBeDefined()
      expect(position!.quantity).toBe(100)
      expect(position!.avgCost).toBeCloseTo(50.075, 2)
    })

    it('tracks position after multiple buys', async () => {
      const request1: PlaceOrderRequest = {
        symbol: 'TSX:RCI',
        side: 'buy',
        type: 'limit',
        quantity: 50,
        limitPrice: 100,
      }
      await service.placeOrder(request1)

      const request2: PlaceOrderRequest = {
        symbol: 'TSX:RCI',
        side: 'buy',
        type: 'limit',
        quantity: 50,
        limitPrice: 110,
      }
      await service.placeOrder(request2)

      const position = service.getPosition('TSX:RCI')
      expect(position!.quantity).toBe(100)
      // Average of (50*100.15 + 50*110.165) / 100
      const expectedAvg = (100.15 * 50 + 110.165 * 50) / 100
      expect(position!.avgCost).toBeCloseTo(expectedAvg, 1)
    })

    it('reduces position after sell order', async () => {
      // Buy 100
      const buyRequest: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(buyRequest)

      // Sell 30
      const sellRequest: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'sell',
        type: 'limit',
        quantity: 30,
        limitPrice: 55,
      }
      await service.placeOrder(sellRequest)

      const position = service.getPosition('TSX:TD')
      expect(position!.quantity).toBe(70)
    })

    it('removes position when quantity reaches zero', async () => {
      // Buy 100
      const buyRequest: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(buyRequest)

      // Sell 100
      const sellRequest: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'sell',
        type: 'limit',
        quantity: 100,
        limitPrice: 55,
      }
      await service.placeOrder(sellRequest)

      const position = service.getPosition('TSX:ENB')
      expect(position).toBeUndefined()
    })

    it('lists all positions', async () => {
      // Create multiple positions
      const req1: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(req1)

      const req2: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'buy',
        type: 'limit',
        quantity: 50,
        limitPrice: 100,
      }
      await service.placeOrder(req2)

      const positions = service.getPositions()
      expect(positions).toHaveLength(2)
      expect(positions.map(p => p.symbol).sort()).toEqual(['TSX:ENB', 'TSX:TD'])
    })
  })

  describe('order cancellation', () => {
    it('cannot cancel filled order', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      const { order } = await service.placeOrder(request)

      const cancelResult = await service.cancelOrder({ orderId: order.orderId })

      expect(cancelResult.success).toBe(false)
      expect(cancelResult.error).toContain('filled')
    })

    it('returns error for non-existent order', async () => {
      const cancelResult = await service.cancelOrder({
        orderId: 'nonexistent' as OrderId,
      })

      expect(cancelResult.success).toBe(false)
      expect(cancelResult.error).toContain('not found')
    })
  })

  describe('order status', () => {
    it('retrieves order status', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      const { order: placedOrder } = await service.placeOrder(request)

      const statusResult = await service.getOrderStatus({ orderId: placedOrder.orderId })

      expect(statusResult.order.orderId).toBe(placedOrder.orderId)
      expect(statusResult.order.status).toBe('filled')
    })

    it('throws error for non-existent order', async () => {
      await expect(
        service.getOrderStatus({ orderId: 'nonexistent' as OrderId }),
      ).rejects.toThrow('not found')
    })

    it('lists all orders', async () => {
      const request1: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(request1)

      const request2: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 100,
      }
      await service.placeOrder(request2)

      const orders = await service.listOrders()

      expect(orders).toHaveLength(2)
      expect(orders[0].symbol).toBe('TSX:TD')
      expect(orders[1].symbol).toBe('TSX:ENB')
    })
  })

  describe('slippage calculation', () => {
    it('applies slippage correctly to buy orders', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 100,
      }

      const result = await service.placeOrder(request)

      // 100 * 1.0015 = 100.15
      expect(result.order.avgFillPrice).toBeCloseTo(100.15, 2)
    })

    it('applies slippage correctly to sell orders', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'sell',
        type: 'limit',
        quantity: 100,
        limitPrice: 100,
      }

      const result = await service.placeOrder(request)

      // 100 * 0.9985 = 99.85
      expect(result.order.avgFillPrice).toBeCloseTo(99.85, 2)
    })

    it('estimates execution cost with slippage', () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 100,
      }

      const cost = service.estimateExecutionCost(request)

      // 100 * 100.15 = 10015
      expect(cost).toBeCloseTo(10015, 0)
    })
  })

  describe('commission handling', () => {
    it('charges correct commission per trade', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 100,
      }

      const initialBalance = service.getBalance()
      await service.placeOrder(request)
      const finalBalance = service.getBalance()

      const spent = initialBalance - finalBalance
      const expectedCost = 100 * 100.15 + 4.95 // order cost + commission
      expect(spent).toBeCloseTo(expectedCost, 1)
    })

    it('calculates total commissions paid', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      await service.placeOrder(request)
      await service.placeOrder(request)
      await service.placeOrder(request)

      expect(service.getTotalCommissionsPaid()).toBe(3 * 4.95)
    })

    it('returns order count', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      await service.placeOrder(request)
      await service.placeOrder(request)

      expect(service.getOrderCount()).toBe(2)
    })
  })

  describe('concurrent orders', () => {
    it('handles multiple simultaneous order placements', async () => {
      const requests: PlaceOrderRequest[] = [
        { symbol: 'TSX:TD', side: 'buy', type: 'limit', quantity: 100, limitPrice: 50 },
        { symbol: 'TSX:ENB', side: 'buy', type: 'limit', quantity: 50, limitPrice: 100 },
        { symbol: 'TSX:RCI', side: 'sell', type: 'limit', quantity: 75, limitPrice: 150 },
      ]

      const results = await Promise.all(requests.map(req => service.placeOrder(req)))

      expect(results).toHaveLength(3)
      expect(results.every(r => r.order.status === 'filled')).toBe(true)
      expect(service.getOrderCount()).toBe(3)
    })

    it('maintains correct positions across concurrent trades', async () => {
      const requests: PlaceOrderRequest[] = [
        { symbol: 'TSX:TD', side: 'buy', type: 'limit', quantity: 100, limitPrice: 50 },
        { symbol: 'TSX:TD', side: 'buy', type: 'limit', quantity: 100, limitPrice: 55 },
        { symbol: 'TSX:TD', side: 'sell', type: 'limit', quantity: 50, limitPrice: 60 },
      ]

      await Promise.all(requests.map(req => service.placeOrder(req)))

      const position = service.getPosition('TSX:TD')
      expect(position!.quantity).toBe(150) // 100 + 100 - 50
    })
  })

  describe('partial fills', () => {
    it('creates partial fills when enabled', async () => {
      const service2 = new QuestradExecutionService(ctx, {
        enablePartialFills: true,
        numPartialFills: 2,
        startingBalance: 100000,
      })

      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      const result = await service2.placeOrder(request)

      expect(result.order.fills).toHaveLength(2)
      expect(result.order.fills[0].quantity).toBe(50)
      expect(result.order.fills[1].quantity).toBe(50)
      expect(result.order.fills[1].timestamp).toBeGreaterThan(result.order.fills[0].timestamp)
    })

    it('handles partial fills with remainder', async () => {
      const service2 = new QuestradExecutionService(ctx, {
        enablePartialFills: true,
        numPartialFills: 3,
        startingBalance: 100000,
      })

      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      const result = await service2.placeOrder(request)

      // 100 / 3 = 33, with remainder 1
      const quantities = result.order.fills.map(f => f.quantity)
      expect(quantities[0]).toBe(33)
      expect(quantities[1]).toBe(33)
      expect(quantities[2]).toBe(34)
      expect(quantities.reduce((a, b) => a + b)).toBe(100)
    })
  })

  describe('reset and initialization', () => {
    it('resets service to initial state', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      await service.placeOrder(request)
      expect(service.getOrderCount()).toBe(1)
      expect(service.getPositions()).toHaveLength(1)

      service.reset()

      expect(service.getOrderCount()).toBe(0)
      expect(service.getPositions()).toHaveLength(0)
      expect(service.getBalance()).toBe(100000)
    })

    it('resets with custom starting balance', async () => {
      service.reset(50000)
      expect(service.getBalance()).toBe(50000)
    })

    it('allows manual balance setting', () => {
      service.setBalance(50000)
      expect(service.getBalance()).toBe(50000)
    })
  })

  describe('edge cases', () => {
    it('handles minimum order size', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 1,
        limitPrice: 100,
      }

      const result = await service.placeOrder(request)
      expect(result.order.filledQuantity).toBe(1)
    })

    it('handles maximum order size', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:CHEAP',
        side: 'buy',
        type: 'limit',
        quantity: 50000,
        limitPrice: 1,
      }

      const result = await service.placeOrder(request)
      expect(result.order.filledQuantity).toBe(50000)
    })

    it('provides execution style identifier', () => {
      expect(service.executionStyle).toBe('questrade')
    })

    it('calculates unrealized P&L', async () => {
      // Buy 100 at 50
      const buyRequest: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(buyRequest)

      // Position avg cost is 50.075 with slippage
      // If current price is 55, unrealized P&L should be (55 - 50.075) * 100 = 492.5
      const priceMap = new Map([['TSX:TD', 55]])
      const pnl = service.calculateTotalUnrealizedPnl(priceMap)

      expect(pnl).toBeGreaterThan(490)
      expect(pnl).toBeLessThan(500)
    })

    it('calculates position-specific P&L', async () => {
      const buyRequest: PlaceOrderRequest = {
        symbol: 'TSX:ENB',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }
      await service.placeOrder(buyRequest)

      const positionPnl = service.calculatePositionPnl('TSX:ENB', 55)

      expect(positionPnl).toBeGreaterThan(490)
      expect(positionPnl).toBeLessThan(500)
    })

    it('handles zero position P&L calculation', () => {
      const pnl = service.calculatePositionPnl('TSX:NONEXISTENT', 100)
      expect(pnl).toBe(0)
    })

    it('fills are recorded with timestamps', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      const beforeOrder = Date.now()
      const result = await service.placeOrder(request)
      const afterOrder = Date.now()

      expect(result.order.fills).toHaveLength(1)
      expect(result.order.fills[0].timestamp).toBeGreaterThanOrEqual(beforeOrder)
      expect(result.order.fills[0].timestamp).toBeLessThanOrEqual(afterOrder)
    })

    it('maintains order history', async () => {
      const req1: PlaceOrderRequest = {
        clientOrderId: 'order1',
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 100,
        limitPrice: 50,
      }

      const req2: PlaceOrderRequest = {
        clientOrderId: 'order2',
        symbol: 'TSX:ENB',
        side: 'sell',
        type: 'limit',
        quantity: 50,
        limitPrice: 100,
      }

      await service.placeOrder(req1)
      await service.placeOrder(req2)

      const orders = await service.listOrders()
      expect(orders).toHaveLength(2)
      expect(orders[0].clientOrderId).toBe('order1')
      expect(orders[1].clientOrderId).toBe('order2')
    })

    it('rejects orders with zero quantity', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 0,
        limitPrice: 50,
      }

      await expect(service.placeOrder(request)).rejects.toThrow()
    })

    it('rejects negative quantities', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: -100,
        limitPrice: 50,
      }

      await expect(service.placeOrder(request)).rejects.toThrow()
    })

    it('handles very small order sizes', async () => {
      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 1,
        limitPrice: 500,
      }

      const result = await service.placeOrder(request)
      expect(result.order.filledQuantity).toBe(1)
    })

    it('averages fill prices correctly with partial fills', async () => {
      const service2 = new QuestradExecutionService(ctx, {
        enablePartialFills: true,
        numPartialFills: 3,
        startingBalance: 1000000,
      })

      const request: PlaceOrderRequest = {
        symbol: 'TSX:TD',
        side: 'buy',
        type: 'limit',
        quantity: 300,
        limitPrice: 50,
      }

      const result = await service2.placeOrder(request)

      // All fills at same price with slippage
      const avgFillPrice = result.order.avgFillPrice
      expect(avgFillPrice).toBeCloseTo(50.075, 2)
      expect(result.order.fills).toHaveLength(3)
    })
  })

  describe('configuration', () => {
    it('uses custom configuration values', () => {
      const service2 = new QuestradExecutionService(ctx, {
        maxOrderSize: 100000,
        commissionPerTrade: 9.99,
        slippagePercent: 0.5,
        startingBalance: 50000,
      })

      expect(service2.getBalance()).toBe(50000)
    })

    it('uses default configuration when not provided', () => {
      const service2 = new QuestradExecutionService(ctx)
      expect(service2.getBalance()).toBe(100000)
    })
  })
})
