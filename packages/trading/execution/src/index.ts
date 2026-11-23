/**
 * Service Definition for the `ctx.execution` capability seam, covering order
 * placement, cancellation, and status tracking across multiple execution
 * providers (paper trading, Robinhood, Polymarket, etc.).
 * @module @deepseek-ai/dsh-execution
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  OrderId,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  ExecutionStyle,
  PlaceOrderRequest,
  PlaceOrderResult,
  CancelOrderRequest,
  CancelOrderResult,
  GetOrderStatusRequest,
  GetOrderStatusResult,
  Order,
  Fill,
  ExecutionError,
  ValidationConfig,
  ValidationResult,
} from './types.ts'

export type {
  OrderId,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  ExecutionStyle,
  PlaceOrderRequest,
  PlaceOrderResult,
  CancelOrderRequest,
  CancelOrderResult,
  GetOrderStatusRequest,
  GetOrderStatusResult,
  Order,
  Fill,
  ExecutionError,
  ValidationConfig,
  ValidationResult,
} from './types.ts'

export {
  validationError,
  insufficientBalanceError,
  orderNotFoundError,
  executionRejectedError,
  executionFailedError,
  networkError,
  providerError,
  throwExecutionError,
  ExecutionErrorException,
  isExecutionError,
  toExecutionError,
} from './errors.ts'

export { validateOrder, validateQuantityAndPrice } from './validation.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    execution: ExecutionService
  }
}

/**
 * Abstract execution service for order management. Subclass, implement the
 * abstract methods, and load the subclass as a plugin — it registers as
 * `ctx.execution` (one implementation per context; loading a second throws,
 * which is cordis' standard duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - Order IDs are provider-assigned and immutable after placement.
 * - Order state is eventually consistent: status updates may lag provider
 *   state by implementation-defined intervals.
 * - Fill prices and quantities are immutable once recorded.
 * - Cancellation is best-effort: no guarantee it reaches the provider or
 *   prevents fills after the request is sent.
 * - Errors are structured with codes for programmatic handling; callers
 *   should not parse error messages.
 */
export abstract class ExecutionService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'execution')
  }

  /**
   * The execution style this provider implements (paper, robinhood, polymarket).
   * @returns the execution style identifier.
   */
  abstract get executionStyle(): ExecutionStyle

  /**
   * Validate an order request before execution. Checks order size limits,
   * balance requirements, and instrument-specific constraints.
   * @param request - the order request to validate.
   * @param config - validation configuration including balance and size limits.
   * @returns validation result with errors and warnings if any.
   */
  abstract validate(request: PlaceOrderRequest, config: ValidationConfig): ValidationResult

  /**
   * Place an order and await its initial acceptance or rejection by the provider.
   * Does not wait for fills.
   * @param request - the order request with symbol, side, quantity, and pricing.
   * @returns placed order with initial status.
   * @throws ExecutionError on validation failure, provider rejection, or network error.
   */
  abstract placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResult>

  /**
   * Cancel an open order. Best-effort: cancellation may fail if the order
   * has already filled or expired.
   * @param request - the cancellation request with order ID.
   * @returns cancellation result with updated order state.
   * @throws ExecutionError on network error or provider failure.
   */
  abstract cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResult>

  /**
   * Get current status of an order. Fetches the latest state from the provider
   * if the implementation supports live updates.
   * @param request - the status query with order ID.
   * @returns current order state including fills and status.
   * @throws ExecutionError if order not found or provider error.
   */
  abstract getOrderStatus(request: GetOrderStatusRequest): Promise<GetOrderStatusResult>

  /**
   * List all orders (optional implementation). If not implemented, returns
   * an empty array. Useful for providers that support bulk order queries.
   * @returns array of orders; empty array if not implemented.
   */
  async listOrders(): Promise<Order[]> {
    return []
  }

  /**
   * Calculate estimated execution cost or proceeds for an order. Used for
   * pre-flight checks and UI display.
   * @param request - the order request.
   * @returns estimated cost (for buy orders) or proceeds (for sell orders).
   */
  abstract estimateExecutionCost(request: PlaceOrderRequest): number
}

export default ExecutionService
