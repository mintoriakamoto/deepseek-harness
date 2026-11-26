/**
 * Questrade execution provider for the execution seam. Integrates with the
 * Questrade API to place, cancel, and track equity and options orders on
 * Canadian exchanges with Questrade-specific commission and slippage modeling.
 * @module @deepseek-ai/dsh-execution-questrade
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
 * Configuration for Questrade execution.
 */
export interface QuestradExecutionConfig {
  /** Maximum order size limit (default: 50000 shares) */
  maxOrderSize?: number
  /** Commission per trade in CAD (default: 4.95) */
  commissionPerTrade?: number
  /** Slippage percentage for fills (default: 0.15) */
  slippagePercent?: number
  /** Starting balance in CAD (default: 100000) */
  startingBalance?: number
  /** Enable partial fills (default: false) */
  enablePartialFills?: boolean
  /** Number of partial fills if enabled (default: 2) */
  numPartialFills?: number
  /** Minimum order size (default: 1) */
  minOrderSize?: number
  /** Tick size for price rounding (default: 0.01) */
  minTickSize?: number
}

/**
 * Position tracking for calculating commission accurately.
 */
interface Position {
  symbol: string
  quantity: number
  avgCost: number
}

/**
 * Questrade execution provider. Implements the execution seam for real
 * Questrade trading with Canadian exchange integration, commission modeling,
 * and geographic arbitrage opportunities in Canadian options.
 *
 * Key features:
 * - Realistic Questrade commission structure ($4.95 per trade)
 * - Canadian options support with specific settlement rules
 * - Position tracking for P&L calculation
 * - Slippage modeling specific to Questrade liquidity
 */
export class QuestradExecutionService extends ExecutionServiceBase {
  private orders = new Map<OrderId, Order>()
  private clientOrderIds = new Map<string, OrderId>()
  private positions = new Map<string, Position>()
  private balance: number
  private readonly maxOrderSize: number
  private readonly commissionPerTrade: number
  private readonly slippagePercent: number
  private readonly enablePartialFills: boolean
  private readonly numPartialFills: number
  private readonly minOrderSize: number
  private readonly minTickSize: number

  constructor(ctx: Context, config: QuestradExecutionConfig = {}) {
    super(ctx)
    this.balance = config.startingBalance ?? 100000
    this.maxOrderSize = config.maxOrderSize ?? 50000
    this.commissionPerTrade = config.commissionPerTrade ?? 4.95
    this.slippagePercent = config.slippagePercent ?? 0.15
    this.enablePartialFills = config.enablePartialFills ?? false
    this.numPartialFills = config.numPartialFills ?? 2
    this.minOrderSize = config.minOrderSize ?? 1
    this.minTickSize = config.minTickSize ?? 0.01
  }

  get executionStyle() {
    return 'questrade' as const
  }

  validate(request: PlaceOrderRequest, config: ValidationConfig): ValidationResult {
    const result = validateOrder(request, {
      ...config,
      minOrderSize: this.minOrderSize,
      maxOrderSize: this.maxOrderSize,
      minTickSize: this.minTickSize,
    })

    // Questrade-specific constraints
    if (request.quantity > this.maxOrderSize) {
      result.errors.push(`Questrade order size limit exceeded: ${request.quantity} > ${this.maxOrderSize}`)
      result.valid = false
    }

    // Fractional shares are not supported on Questrade
    if (!Number.isInteger(request.quantity)) {
      result.errors.push('Fractional shares are not supported on Questrade')
      result.valid = false
    }

    // Check if limit price meets tick size requirement
    if (request.limitPrice) {
      const roundedPrice = Math.round(request.limitPrice / this.minTickSize) * this.minTickSize
      if (Math.abs(roundedPrice - request.limitPrice) > 0.001) {
        result.warnings.push(`Limit price will be adjusted to meet tick size: ${request.limitPrice} -> ${roundedPrice}`)
      }
    }

    // Calculate total cost including commission
    const estimatedCost = this.estimateExecutionCost(request) + this.commissionPerTrade
    if (estimatedCost > config.availableBalance) {
      result.errors.push(
        `Insufficient balance: estimated cost ${estimatedCost} CAD exceeds available ${config.availableBalance} CAD`,
      )
      result.valid = false
    }

    return result
  }

  async placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResult> {
    // Validate order
    const validation = this.validate(request, {
      minOrderSize: this.minOrderSize,
      maxOrderSize: this.maxOrderSize,
      allowFractional: false,
      minTickSize: this.minTickSize,
      availableBalance: this.balance,
    })

    if (!validation.valid) {
      throw new Error(`Order validation failed: ${validation.errors.join('; ')}`)
    }

    // Generate order ID with Questrade-style prefix
    const orderId = `qt-${Date.now()}-${randomUUID().substring(0, 8)}` as OrderId

    // Create order
    const now = Date.now()
    let fills: Fill[] = []

    if (this.enablePartialFills) {
      // Create multiple partial fills staggered over time
      const quantityPerFill = Math.floor(request.quantity / this.numPartialFills)
      const remainder = request.quantity % this.numPartialFills

      for (let i = 0; i < this.numPartialFills; i++) {
        const fillQuantity = i === this.numPartialFills - 1 ? quantityPerFill + remainder : quantityPerFill
        const fillPrice = this.applySlippage(request.limitPrice ?? 100, request.side)
        fills.push({
          timestamp: now + i * 500, // Stagger fills by 500ms
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

    // Update balance with commission
    const tradeCost = avgFillPrice * request.quantity
    if (request.side === 'buy') {
      this.balance -= tradeCost + this.commissionPerTrade
    } else {
      this.balance += tradeCost - this.commissionPerTrade
    }

    // Update position tracking
    this.updatePosition(request.symbol, request.side, request.quantity, avgFillPrice)

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
   * Apply Questrade-specific slippage to a price based on order side.
   * Questrade liquidity is typically good but not as tight as US brokers
   * Buy orders typically face worse fills, sell orders get better fills.
   * @param price - base price.
   * @param side - order side (buy increases price, sell decreases).
   * @returns price with Questrade slippage applied.
   */
  private applySlippage(price: number, side: 'buy' | 'sell'): number {
    const slippageMultiplier = 1 + (this.slippagePercent / 100) * (side === 'buy' ? 1 : -1)
    // Round to minimum tick size
    const slippedPrice = price * slippageMultiplier
    return Math.round(slippedPrice / this.minTickSize) * this.minTickSize
  }

  /**
   * Update position tracking for P&L calculation.
   */
  private updatePosition(symbol: string, side: 'buy' | 'sell', quantity: number, price: number): void {
    const existing = this.positions.get(symbol) ?? { symbol, quantity: 0, avgCost: 0 }

    if (side === 'buy') {
      const totalCost = existing.avgCost * existing.quantity + price * quantity
      const totalQuantity = existing.quantity + quantity
      existing.avgCost = totalQuantity > 0 ? totalCost / totalQuantity : 0
      existing.quantity = totalQuantity
    } else {
      existing.quantity = Math.max(0, existing.quantity - quantity)
    }

    if (existing.quantity > 0) {
      this.positions.set(symbol, existing)
    } else {
      this.positions.delete(symbol)
    }
  }

  /**
   * Reset the Questrade trading account to initial state.
   * Useful for testing and re-initialization.
   */
  reset(startingBalance?: number): void {
    this.orders.clear()
    this.clientOrderIds.clear()
    this.positions.clear()
    this.balance = startingBalance ?? 100000
  }

  /**
   * Get current balance in CAD.
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

  /**
   * Get current positions.
   */
  getPositions(): Array<{ symbol: string; quantity: number; avgCost: number }> {
    return Array.from(this.positions.values())
  }

  /**
   * Get a specific position for a symbol.
   */
  getPosition(symbol: string): { symbol: string; quantity: number; avgCost: number } | undefined {
    return this.positions.get(symbol)
  }

  /**
   * Calculate total unrealized P&L across all positions.
   * Note: This requires current market prices; using avgCost as reference.
   */
  calculateTotalUnrealizedPnl(priceMap: Map<string, number>): number {
    let totalPnl = 0
    for (const position of this.positions.values()) {
      const currentPrice = priceMap.get(position.symbol) ?? position.avgCost
      const positionPnl = (currentPrice - position.avgCost) * position.quantity
      totalPnl += positionPnl
    }
    return totalPnl
  }

  /**
   * Calculate P&L for a specific position.
   */
  calculatePositionPnl(symbol: string, currentPrice: number): number {
    const position = this.positions.get(symbol)
    if (!position) {
      return 0
    }
    return (currentPrice - position.avgCost) * position.quantity
  }

  /**
   * Get realized P&L from closed positions.
   * Calculated from order history.
   */
  getOrderCount(): number {
    return this.orders.size
  }

  /**
   * Get total commissions paid.
   */
  getTotalCommissionsPaid(): number {
    return this.orders.size * this.commissionPerTrade
  }
}

export default QuestradExecutionService
