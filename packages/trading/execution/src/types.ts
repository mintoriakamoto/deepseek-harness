/**
 * Execution types for the trading execution seam. Order lifecycle, fills,
 * and status tracking across multiple execution providers.
 * @module dsh-execution/types
 */

/**
 * Unique identifier for an order, assigned by the execution provider.
 * Branded type to prevent accidental mixing with other string IDs.
 */
export type OrderId = string & { readonly __brand: 'OrderId' }

/**
 * Side of an order: buy or sell.
 */
export type OrderSide = 'buy' | 'sell'

/**
 * Type of order: limit, market, etc.
 */
export type OrderType = 'limit' | 'market'

/**
 * Status of an order through its lifecycle.
 */
export type OrderStatus =
  | 'pending' // Order accepted but not yet placed on exchange
  | 'open' // Order placed and waiting for execution
  | 'partially_filled' // Partially executed
  | 'filled' // Fully executed
  | 'cancelled' // User cancelled or expired
  | 'rejected' // Provider rejected the order
  | 'failed' // Execution failed

/**
 * Time-in-force for an order.
 */
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok'

/**
 * Execution style supported by the provider.
 */
export type ExecutionStyle = 'paper' | 'robinhood' | 'polymarket' | 'questrade'

/**
 * Order placement request. Caller provides the basic order details;
 * the executor resolves provider-specific requirements and validates the order.
 */
export interface PlaceOrderRequest {
  /** Unique identifier for the order in the caller's context. */
  clientOrderId?: string | undefined
  /** Symbol or instrument identifier (e.g., 'AAPL', '0x...' for crypto). */
  symbol: string
  /** Side of the order: buy or sell. */
  side: OrderSide
  /** Type of order: limit or market. */
  type: OrderType
  /** Quantity to execute. */
  quantity: number
  /** Limit price for limit orders (required for limit orders). */
  limitPrice?: number | undefined
  /** Stop price for stop orders. */
  stopPrice?: number | undefined
  /** Time-in-force for the order (default: 'day'). */
  timeInForce?: TimeInForce | undefined
}

/**
 * Order cancellation request.
 */
export interface CancelOrderRequest {
  /** Order ID to cancel. */
  orderId: OrderId
}

/**
 * Order status query request.
 */
export interface GetOrderStatusRequest {
  /** Order ID to check. */
  orderId: OrderId
}

/**
 * A single fill record for a partial or complete execution.
 */
export interface Fill {
  /** Timestamp of the fill in milliseconds since epoch. */
  timestamp: number
  /** Quantity filled in this transaction. */
  quantity: number
  /** Price at which this quantity was filled. */
  price: number
  /** Provider-assigned fill ID. */
  fillId?: string | undefined
}

/**
 * Complete order state and execution history.
 */
export interface Order {
  /** Provider-assigned order ID. */
  orderId: OrderId
  /** Caller's order ID if provided. */
  clientOrderId?: string | undefined
  /** Symbol or instrument identifier. */
  symbol: string
  /** Side of the order. */
  side: OrderSide
  /** Type of the order. */
  type: OrderType
  /** Original quantity requested. */
  quantity: number
  /** Filled quantity so far. */
  filledQuantity: number
  /** Remaining quantity to fill. */
  remainingQuantity: number
  /** Order status. */
  status: OrderStatus
  /** Limit price (for limit orders). */
  limitPrice?: number | undefined
  /** Stop price (for stop orders). */
  stopPrice?: number | undefined
  /** Time-in-force. */
  timeInForce: TimeInForce
  /** Average fill price (filled quantity / total filled). */
  avgFillPrice?: number | undefined
  /** Fill records in chronological order. */
  fills: Fill[]
  /** Error message if rejected or failed. */
  error?: string | undefined
  /** Timestamp when order was placed (ms since epoch). */
  createdAt: number
  /** Timestamp of last status update (ms since epoch). */
  updatedAt: number
}

/**
 * Result of a place order operation.
 */
export interface PlaceOrderResult {
  /** The placed order. */
  order: Order
}

/**
 * Result of a cancel order operation.
 */
export interface CancelOrderResult {
  /** Whether the cancellation succeeded. */
  success: boolean
  /** Error message if cancellation failed. */
  error?: string | undefined
  /** Updated order state after cancellation attempt. */
  order?: Order | undefined
}

/**
 * Result of a get order status operation.
 */
export interface GetOrderStatusResult {
  /** The order state. */
  order: Order
}

/**
 * Error returned by execution operations.
 */
export interface ExecutionError {
  /** Error code for structured handling. */
  code:
    | 'validation_error' // Input validation failed
    | 'insufficient_balance' // Not enough funds/margin
    | 'order_not_found' // Order ID does not exist
    | 'execution_rejected' // Provider rejected the order
    | 'execution_failed' // Execution failed for another reason
    | 'network_error' // Network connectivity issue
    | 'provider_error' // Provider-specific error
  /** Human-readable error message. */
  message: string
  /** Provider-specific error details if available. */
  details?: Record<string, unknown> | undefined
}

/**
 * Configuration for order validation.
 */
export interface ValidationConfig {
  /** Minimum order size (in base units). */
  minOrderSize: number
  /** Maximum order size (in base units). */
  maxOrderSize: number
  /** Whether fractional shares are allowed. */
  allowFractional: boolean
  /** Minimum tick size for the symbol (price precision). */
  minTickSize: number
  /** Available balance/buying power. */
  availableBalance: number
}

/**
 * Result of order validation.
 */
export interface ValidationResult {
  /** Whether the order is valid. */
  valid: boolean
  /** Validation errors if any. */
  errors: string[]
  /** Warnings that do not prevent execution. */
  warnings: string[]
  /** Estimated execution cost/proceeds. */
  estimatedCost?: number | undefined
}
