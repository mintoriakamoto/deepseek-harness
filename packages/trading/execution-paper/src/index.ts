/**
 * Paper trading provider for the execution seam. Instant fills with
 * configurable mock slippage and no real balance constraints. Useful for
 * testing and demos.
 * @module @deepseek-ai/dsh-execution-paper
 */

import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import type {
  OrderId,
  PlaceOrderRequest,
  PlaceOrderResult,
  CancelOrderRequest,
  CancelOrderResult,
  GetOrderStatusRequest,
  GetOrderStatusResult,
  Order,
  Fill,
  ValidationConfig,
  ValidationResult,
} from '@deepseek-ai/dsh-execution'
import { ExecutionService as ExecutionServiceBase, validateOrder } from '@deepseek-ai/dsh-execution'

/**
 * Configuration for paper trading execution.
 */
export interface PaperExecutionConfig {
  /** Slippage percentage to apply on fills (0-100, default 0.1 for 0.1%) */
  slippagePercent?: number
  /** Starting balance for the paper account (default 100000) */
  startingBalance?: number
  /** Enable partial fills instead of instant full fills (default false) */
  enablePartialFills?: boolean
  /** Number of fills to split orders into if partialFills enabled (default 2) */
  numPartialFills?: number
}

/**
 * Paper trading execution provider. Implements the execution seam for
 * backtesting and demos. All orders are filled immediately with configurable
 * slippage and no real constraints.
 */
export class PaperExecutionService extends ExecutionServiceBase {
  private orders = new Map<OrderId, Order>()
  private clientOrderIds = new Map<string, OrderId>()
  private balance: number
  private readonly slippagePercent: number
  private readonly enablePartialFills: boolean
  private readonly numPartialFills: number

  constructor(ctx: Context, config: PaperExecutionConfig = {}) {
    super(ctx)
    this.balance = config.startingBalance ?? 100000
    this.slippagePercent = config.slippagePercent ?? 0.1
    this.enablePartialFills = config.enablePartialFills ?? false
    this.numPartialFills = config.numPartialFills ?? 2
  }

  get executionStyle() {
    return 'paper' as const
  }

  validate(request: PlaceOrderRequest, config: ValidationConfig): ValidationResult {
    // For paper trading, we have unlimited balance, so just validate the order itself
    const result = validateOrder(request, {
      ...config,
      availableBalance: Number.POSITIVE_INFINITY, // Unlimited for paper trading
    })
    return result
  }

  async placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResult> {
    // Validate order
    const validation = this.validate(request, {
      minOrderSize: 1,
      maxOrderSize: 1_000_000,
      allowFractional: true,
      minTickSize: 0.01,
      availableBalance: this.balance,
    })

    if (!validation.valid) {
      throw new Error(`Order validation failed: ${validation.errors.join('; ')}`)
    }

    // Generate order ID
    const orderId = randomUUID() as OrderId

    // Create order
    const now = Date.now()
    let fills: Fill[] = []

    if (this.enablePartialFills) {
      // Create multiple partial fills
      const quantityPerFill = Math.floor(request.quantity / this.numPartialFills)
      const remainder = request.quantity % this.numPartialFills

      for (let i = 0; i < this.numPartialFills; i++) {
        const fillQuantity = i === this.numPartialFills - 1 ? quantityPerFill + remainder : quantityPerFill
        const fillPrice = this.applySlippage(request.limitPrice ?? 100, request.side)
        fills.push({
          timestamp: now + i * 100, // Stagger fills by 100ms
          quantity: fillQuantity,
          price: fillPrice,
          fillId: `${orderId}-${i}`,
        })
      }
    } else {
      // Instant full fill
      const fillPrice = this.applySlippage(request.limitPrice ?? 100, request.side)
      fills = [
        {
          timestamp: now,
          quantity: request.quantity,
          price: fillPrice,
          fillId: `${orderId}-0`,
        },
      ]
    }

    // Calculate average fill price
    let totalValue = 0
    let totalQuantity = 0
    for (const fill of fills) {
      totalValue += fill.price * fill.quantity
      totalQuantity += fill.quantity
    }
    const avgFillPrice = totalQuantity > 0 ? totalValue / totalQuantity : 0

    // Update balance
    if (request.side === 'buy') {
      const cost = avgFillPrice * request.quantity
      this.balance -= cost
    } else {
      const proceeds = avgFillPrice * request.quantity
      this.balance += proceeds
    }

    // Create order object
    const order: Order = {
      orderId,
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      filledQuantity: request.quantity,
      remainingQuantity: 0,
      status: 'filled',
      limitPrice: request.limitPrice,
      stopPrice: request.stopPrice,
      timeInForce: request.timeInForce ?? 'day',
      avgFillPrice,
      fills,
      createdAt: now,
      updatedAt: now,
    }

    // Store order
    this.orders.set(orderId, order)
    if (request.clientOrderId) {
      this.clientOrderIds.set(request.clientOrderId, orderId)
    }

    return { order }
  }

  async cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResult> {
    const order = this.orders.get(request.orderId)

    if (!order) {
      return {
        success: false,
        error: `Order not found: ${request.orderId}`,
      }
    }

    // If already filled, cannot cancel
    if (order.status === 'filled') {
      return {
        success: false,
        error: `Cannot cancel filled order: ${request.orderId}`,
        order,
      }
    }

    // Mark as cancelled
    const updated: Order = {
      ...order,
      status: 'cancelled',
      updatedAt: Date.now(),
    }
    this.orders.set(request.orderId, updated)

    return {
      success: true,
      order: updated,
    }
  }

  async getOrderStatus(request: GetOrderStatusRequest): Promise<GetOrderStatusResult> {
    const order = this.orders.get(request.orderId)

    if (!order) {
      throw new Error(`Order not found: ${request.orderId}`)
    }

    return { order }
  }

  override async listOrders(): Promise<Order[]> {
    return Array.from(this.orders.values())
  }

  estimateExecutionCost(request: PlaceOrderRequest): number {
    const price = this.applySlippage(request.limitPrice ?? 100, request.side)
    return price * request.quantity
  }

  /**
   * Apply slippage to a price based on the order side.
   * @param price - base price.
   * @param side - order side (buy increases price, sell decreases).
   * @returns price with slippage applied.
   */
  private applySlippage(price: number, side: 'buy' | 'sell'): number {
    const slippageMultiplier = 1 + (this.slippagePercent / 100) * (side === 'buy' ? 1 : -1)
    return price * slippageMultiplier
  }

  /**
   * Reset the paper trading account to initial state.
   * Useful for testing and re-initialization.
   */
  reset(startingBalance?: number): void {
    this.orders.clear()
    this.clientOrderIds.clear()
    this.balance = startingBalance ?? 100000
  }

  /**
   * Get current balance.
   */
  getBalance(): number {
    return this.balance
  }

  /**
   * Set balance directly (for testing).
   */
  setBalance(balance: number): void {
    this.balance = balance
  }
}

export default PaperExecutionService
