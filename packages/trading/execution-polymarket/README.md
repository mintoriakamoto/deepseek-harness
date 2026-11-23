# @deepseek-ai/dsh-execution-polymarket

Polymarket execution provider for the DeepSeek Harness. Integrates with the Polymarket API to place, cancel, and track prediction market orders.

## Overview

The Polymarket provider implements the execution seam for prediction market trading. It connects to Polymarket through REST API, allowing callers to trade on prediction markets with the standard execution interface.

```ts
import { Context } from '@deepseek-ai/cordis'
import PolymarketExecutionService from '@deepseek-ai/dsh-execution-polymarket'

const ctx = new Context()
ctx.plugin(PolymarketExecutionService, {
  apiKey: process.env.POLYMARKET_API_KEY,
})

const result = await ctx.execution.placeOrder({
  symbol: '0x...', // Market ID
  side: 'buy',
  type: 'limit',
  quantity: 100, // 100 shares
  limitPrice: 0.65, // $0.65 per share
})

console.log(result.order.status) // 'pending' or 'open'
```

## Configuration

```ts
interface PolymarketExecutionConfig {
  // Polymarket API base URL
  apiUrl?: string
  // API key for Polymarket access
  apiKey?: string
  // Maximum order size in USDC (default: 10000)
  maxOrderSize?: number
}
```

## Prerequisites

- Polymarket API key (from account settings)
- USDC funding in Polymarket account
- Market ID for the order symbol

## Behavior

### Order Placement

Orders are submitted to Polymarket. For limit orders, they remain open until filled or cancelled.

```ts
const result = await service.placeOrder({
  symbol: '0x1234...', // Polymarket market ID
  side: 'buy',
  type: 'limit',
  quantity: 100, // 100 shares
  limitPrice: 0.65, // Price between 0 and 1
})

console.log(result.order.status) // 'open' or 'pending'
```

### Price Range

Polymarket prices range from 0 to 1, representing the probability of an event:

- **0.00**: Event almost certainly won't happen
- **0.50**: 50/50 probability
- **1.00**: Event almost certainly will happen

```ts
const result = await service.placeOrder({
  symbol: 'market-id',
  side: 'buy',
  type: 'limit',
  quantity: 50,
  limitPrice: 0.55, // Buy at $0.55 (55% probability)
})
```

### Order Tracking

Callers poll `getOrderStatus()` to track fills:

```ts
const statusResult = await service.getOrderStatus({
  orderId: result.order.orderId,
})

console.log(statusResult.order.status) // 'open', 'partially_filled', 'filled'
console.log(statusResult.order.filledQuantity)
```

### Fill Pricing

Fills at the specified limit price or better. Average fill price tracks across partial fills:

```ts
const order = statusResult.order
console.log(order.avgFillPrice) // Average price across all fills
console.log(order.fills) // Array of individual fills
```

## Order Validation

Polymarket-specific constraints are enforced:

- Prices must be between 0 and 1
- Prices must align with 0.001 minimum tick size (e.g., 0.651, not 0.6513)
- Order value (quantity × price) must not exceed `maxOrderSize` USDC
- Balance must cover the order cost in USDC
- Fractional shares are always allowed (no whole-share requirement)

```ts
const result = service.validate(request, {
  minOrderSize: 1,
  maxOrderSize: 1_000_000,
  allowFractional: true,
  minTickSize: 0.001,
  availableBalance: balance,
})

if (!result.valid) {
  console.error('Validation failed:', result.errors)
}
```

## API Integration

The Polymarket provider uses these REST endpoints:

- **POST /orders**: Create a new order (internally signed)
- **DELETE /orders/{id}**: Cancel an order
- **GET /orders/{id}**: Fetch order status
- **GET /markets/{id}**: Get market data for price estimation
- **GET /account**: Retrieve balance and trading limits

Authentication is handled via API key in request headers.

## Order Types

### Limit Orders

Limit orders specify a maximum buy price or minimum sell price. They remain open until filled or cancelled:

```ts
await service.placeOrder({
  symbol: 'market-id',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 0.65,
})
```

### Market Orders

Market orders execute immediately at the best available price:

```ts
await service.placeOrder({
  symbol: 'market-id',
  side: 'buy',
  type: 'market',
  quantity: 50,
})
```

## Error Handling

Polymarket-specific errors are mapped to standard execution error codes:

- **`validation_error`**: Order parameters invalid (price out of range, etc.)
- **`insufficient_balance`**: Account lacks USDC for the order
- **`order_not_found`**: Order ID does not exist
- **`execution_rejected`**: Market closed, suspended, or other provider constraint
- **`network_error`**: API connection failed
- **`provider_error`**: Polymarket API error

## Known Limitations and Deferred Work

- **Stub implementation**: This provider is a stub; actual API integration is in progress. Production code paths are not yet wired.
- **Signing**: Order signing (crypto signing for self-custody) is not yet implemented; stub assumes centralized API key auth.
- **Real-time updates**: Orders are not streamed in real time; callers must poll `getOrderStatus()` for updates.
- **Order book data**: Live order book and market spreads are out of scope; callers use Polymarket API directly for market data.
- **Conditional orders**: Stop-loss and take-profit orders are not yet supported.
- **Batch orders**: Multi-leg orders and portfolio orders are not yet implemented.
- **AMM integration**: The Polymarket AMM for market orders requires further integration work.
- **Resolution and settlement**: Settlement after market resolution is not in scope; handled by Polymarket backend.
