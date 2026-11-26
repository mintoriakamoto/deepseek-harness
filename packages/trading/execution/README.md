# @deepseek-ai/dsh-execution

Abstract execution service seam (`ctx.execution`) for the DeepSeek Harness, covering order placement, cancellation, and status tracking across multiple execution providers.

## Overview

The execution seam provides a unified interface for trading order management. Implementations handle the specifics of different execution venues (paper trading, live brokers, prediction markets), while callers work against a consistent, typed contract.

```ts
import type { ExecutionService, PlaceOrderRequest } from '@deepseek-ai/dsh-execution'

const ctx = /* Cordis context */
const execution = ctx.execution // resolved from plugin tree

const result = await execution.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 150,
})

console.log(result.order.status) // 'filled', 'pending', etc.
```

## Service Definition

The `ExecutionService` abstract class defines the core capability seam:

- **`validate(request, config)`**: Validate an order against constraints and configuration.
- **`placeOrder(request)`**: Place an order and await its initial acceptance or rejection.
- **`cancelOrder(request)`**: Cancel an open order (best-effort).
- **`getOrderStatus(request)`**: Get current status and fills for an order.
- **`listOrders()`**: List all orders (optional implementation).
- **`estimateExecutionCost(request)`**: Calculate estimated cost or proceeds for pre-flight checks.

## Types

### Order Lifecycle

```ts
type OrderStatus =
  | 'pending' // Accepted but not yet placed
  | 'open' // Placed and waiting for execution
  | 'partially_filled' // Partially executed
  | 'filled' // Fully executed
  | 'cancelled' // User cancelled or expired
  | 'rejected' // Provider rejected
  | 'failed' // Execution failed
```

### Order Request

```ts
interface PlaceOrderRequest {
  clientOrderId?: string
  symbol: string // Symbol or instrument ID
  side: 'buy' | 'sell'
  type: 'limit' | 'market'
  quantity: number
  limitPrice?: number // Required for limit orders
  stopPrice?: number
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok'
}
```

### Order State

```ts
interface Order {
  orderId: OrderId
  clientOrderId?: string
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  filledQuantity: number
  remainingQuantity: number
  status: OrderStatus
  limitPrice?: number
  stopPrice?: number
  timeInForce: TimeInForce
  avgFillPrice?: number
  fills: Fill[]
  error?: string
  createdAt: number // ms since epoch
  updatedAt: number // ms since epoch
}
```

### Fill Record

```ts
interface Fill {
  timestamp: number // ms since epoch
  quantity: number
  price: number
  fillId?: string
}
```

### Validation Result

```ts
interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  estimatedCost?: number
}
```

## Error Handling

Errors are structured with codes for programmatic handling:

```ts
interface ExecutionError {
  code:
    | 'validation_error'
    | 'insufficient_balance'
    | 'order_not_found'
    | 'execution_rejected'
    | 'execution_failed'
    | 'network_error'
    | 'provider_error'
  message: string
  details?: Record<string, unknown>
}
```

The `errors` module provides helpers for creating and handling structured errors:

```ts
import { validationError, insufficientBalanceError, orderNotFoundError } from '@deepseek-ai/dsh-execution/errors'

throw validationError('Order quantity too small', { minSize: 1 })
throw insufficientBalanceError('Not enough balance', { required: 1000, available: 500 })
```

## Validation

The `validation` module provides reusable validation logic:

```ts
import { validateOrder, validateQuantityAndPrice } from '@deepseek-ai/dsh-execution/validation'
import type { ValidationConfig } from '@deepseek-ai/dsh-execution'

const config: ValidationConfig = {
  minOrderSize: 1,
  maxOrderSize: 100000,
  allowFractional: true,
  minTickSize: 0.01,
  availableBalance: 50000,
}

const result = validateOrder(request, config)
if (!result.valid) {
  console.error('Validation failed:', result.errors)
}
```

## Providers

This package defines the seam; execution behavior is provided by separate packages:

- **`@deepseek-ai/dsh-execution-paper`**: Paper trading with configurable slippage (testing, demos).
- **`@deepseek-ai/dsh-execution-robinhood`**: Real Robinhood equity orders via MCP.
- **`@deepseek-ai/dsh-execution-polymarket`**: Prediction market orders on Polymarket via API.

## Semantics

Implementations must honor these semantics:

- **Order IDs** are provider-assigned and immutable after placement.
- **Order state** is eventually consistent: status updates may lag provider state by implementation-defined intervals.
- **Fill prices and quantities** are immutable once recorded.
- **Cancellation** is best-effort: no guarantee it reaches the provider or prevents fills after the request is sent.
- **Errors** are structured with codes for programmatic handling; callers should not parse error messages.

## Known Limitations and Deferred Work

- Multi-leg orders (spreads, straddles) are not yet supported.
- Conditional order logic (if-then, one-cancels-other) is not yet implemented.
- Real-time order book and market data are out of scope; callers use separate market data APIs.
- Crypto execution is limited to Polymarket API; full cryptocurrency exchange integration deferred.
