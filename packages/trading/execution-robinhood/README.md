# @deepseek-ai/dsh-execution-robinhood

Robinhood execution provider for the DeepSeek Harness. Integrates with the Robinhood MCP server to place, cancel, and track real equity orders.

## Overview

The Robinhood provider implements the execution seam for live equity trading. It connects to Robinhood through the Robinhood MCP server, allowing callers to trade real accounts with the standard execution interface.

```ts
import { Context } from '@deepseek-ai/cordis'
import RobinhoodExecutionService from '@deepseek-ai/dsh-execution-robinhood'

const ctx = new Context()
// Robinhood MCP must be authenticated
ctx.plugin(RobinhoodExecutionService)

const result = await ctx.execution.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 10,
  limitPrice: 150,
})

console.log(result.order.status) // 'pending' or 'open'
console.log(result.order.orderId)
```

## Configuration

```ts
interface RobinhoodExecutionConfig {
  // Maximum order size limit (default: 10000 shares)
  maxOrderSize?: number
}
```

## Prerequisites

- Robinhood MCP server must be authenticated and available in the context
- Robinhood account with active login
- Sufficient buying power for buy orders

## Behavior

### Order Placement

Orders are submitted to Robinhood and begin in 'pending' or 'open' status. Unlike paper trading, they do not fill immediately.

```ts
const result = await service.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 10,
  limitPrice: 150,
})

console.log(result.order.status) // 'pending' (not 'filled')
```

### Order Tracking

Callers poll `getOrderStatus()` to track fills and status:

```ts
const statusResult = await service.getOrderStatus({
  orderId: result.order.orderId,
})

console.log(statusResult.order.status) // 'open', 'partially_filled', 'filled', etc.
console.log(statusResult.order.filledQuantity)
console.log(statusResult.order.fills)
```

### Market Data

Order estimation requires last price from market data:

```ts
const cost = service.estimateExecutionCost({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 10,
  limitPrice: 150,
})

// Returns 10 * 150 = 1500 (or current market estimate)
```

## MCP Integration

The Robinhood provider uses these MCP capabilities:

- **`place_equity_order`**: Submit a new order
- **`cancel_equity_order`**: Cancel an open order
- **`get_equity_orders`**: Fetch order status and fills
- **`get_equity_quotes`**: Get current price for estimation
- **`get_accounts`**: Retrieve account balance

The provider abstracts these calls, so callers use the standard execution interface.

## Validation

Robinhood-specific constraints are enforced:

- Maximum order size limit (default 10,000 shares)
- Fractional shares allowed but may have limited liquidity
- Minimum balance requirement for buy orders
- Symbol tradability checks (enforced by Robinhood at submission)

```ts
const result = service.validate(request, {
  minOrderSize: 1,
  maxOrderSize: 100000,
  allowFractional: true,
  minTickSize: 0.01,
  availableBalance: balance,
})

if (!result.valid) {
  console.error('Validation failed:', result.errors)
}
```

## Error Handling

Robinhood-specific errors are mapped to standard execution error codes:

- **`insufficient_balance`**: Account has insufficient buying power
- **`order_not_found`**: Order ID does not exist
- **`execution_rejected`**: Robinhood rejected the order (e.g., after-hours, restricted symbol)
- **`network_error`**: Connection to Robinhood failed
- **`provider_error`**: Other Robinhood API error

## Known Limitations and Deferred Work

- **Stub implementation**: This provider is a stub; actual MCP integration is in progress. Production code paths are not yet wired.
- **Order previews**: The provider does not yet call `preview_equity_order` before submission; full preview logic deferred.
- **Conditional orders**: Robinhood conditional order types (stop, stop-limit) are not yet fully integrated.
- **Crypto orders**: Robinhood crypto trading is out of scope; use `@deepseek-ai/dsh-execution-polymarket` for prediction markets.
- **Margin and leverage**: Margin requirements are validated by Robinhood at submission, not pre-validated by this provider.
- **Order modifications**: Amending orders (changing price/quantity) requires cancel-and-resubmit; Robinhood's native modify is not exposed.
- **Real-time updates**: Orders are not streamed in real time; callers must poll `getOrderStatus()` for updates.
