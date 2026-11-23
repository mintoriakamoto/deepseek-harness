# @deepseek-ai/dsh-execution-paper

Paper trading execution provider for the DeepSeek Harness. Implements the execution seam with instant fills, configurable mock slippage, and no real constraints.

## Overview

The paper trading provider fills all orders immediately with configurable slippage, making it suitable for backtesting, demos, and testing harness-level trading logic without connecting to real brokers.

```ts
import { Context } from '@deepseek-ai/cordis'
import PaperExecutionService from '@deepseek-ai/dsh-execution-paper'

const ctx = new Context()
ctx.plugin(PaperExecutionService)

const result = await ctx.execution.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 150,
})

console.log(result.order.status) // 'filled'
console.log(result.order.avgFillPrice) // ~150.0015 (with 0.1% slippage)
```

## Configuration

```ts
interface PaperExecutionConfig {
  // Slippage percentage to apply on fills (0-100, default 0.1 for 0.1%)
  slippagePercent?: number
  // Starting balance for the paper account (default 100000)
  startingBalance?: number
  // Enable partial fills instead of instant full fills (default false)
  enablePartialFills?: boolean
  // Number of fills to split orders into if partialFills enabled (default 2)
  numPartialFills?: number
}
```

### Configuration Example

```ts
const service = new PaperExecutionService(ctx, {
  slippagePercent: 0.5, // 0.5% slippage
  startingBalance: 50000,
  enablePartialFills: true,
  numPartialFills: 3,
})
```

## Behavior

### Instant Fills

By default, all orders are filled immediately upon placement:

```ts
const result = await service.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 150,
})

console.log(result.order.status) // 'filled' (not 'pending')
console.log(result.order.filledQuantity) // 100
```

### Slippage Simulation

Fills are applied at a slippage-adjusted price:

- **Buy orders**: price increased by slippage percentage (0.1% by default → 150 * 1.001)
- **Sell orders**: price decreased by slippage percentage (0.1% by default → 150 * 0.999)

```ts
// Buy at 150, 0.1% slippage
const buyResult = await service.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 150,
})
console.log(buyResult.order.avgFillPrice) // ~150.0015

// Sell at 150, 0.1% slippage
const sellResult = await service.placeOrder({
  symbol: 'AAPL',
  side: 'sell',
  type: 'limit',
  quantity: 100,
  limitPrice: 150,
})
console.log(sellResult.order.avgFillPrice) // ~149.985
```

### Partial Fills

When `enablePartialFills: true`, orders are split into multiple partial fills with staggered timestamps:

```ts
const service = new PaperExecutionService(ctx, {
  enablePartialFills: true,
  numPartialFills: 2,
})

const result = await service.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 150,
})

console.log(result.order.fills.length) // 2
console.log(result.order.fills[0].quantity) // 50
console.log(result.order.fills[1].quantity) // 50
console.log(result.order.fills[1].timestamp > result.order.fills[0].timestamp) // true
```

### Balance Tracking

The paper account tracks balance with proper accounting:

- **Buy orders**: balance decreases by (quantity × fill price)
- **Sell orders**: balance increases by (quantity × fill price)

```ts
const service = new PaperExecutionService(ctx, { startingBalance: 100000 })

console.log(service.getBalance()) // 100000

await service.placeOrder({
  symbol: 'AAPL',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 150,
})

console.log(service.getBalance()) // ~85000 (spent 15000)
```

## Public API

### Methods

- **`validate(request, config)`**: Validate order against configuration (always passes for paper with unlimited balance).
- **`placeOrder(request)`**: Place order and return immediately with filled status.
- **`cancelOrder(request)`**: Cancel order (fails if already filled).
- **`getOrderStatus(request)`**: Retrieve order state.
- **`listOrders()`**: List all placed orders.
- **`estimateExecutionCost(request)`**: Estimate order cost with slippage.

### Testing Helpers

```ts
// Reset to initial state
service.reset()

// Reset with custom starting balance
service.reset(50000)

// Get current balance
const balance = service.getBalance()

// Set balance directly (testing only)
service.setBalance(10000)
```

## Order Validation

The paper provider validates orders but allows unlimited balance. For strict validation, provide a custom `ValidationConfig`:

```ts
const result = service.validate(request, {
  minOrderSize: 1,
  maxOrderSize: 100000,
  allowFractional: true,
  minTickSize: 0.01,
  availableBalance: 50000, // Enforce a limit
})

if (!result.valid) {
  console.error('Validation failed:', result.errors)
}
```

## Known Limitations and Deferred Work

- Market order pricing uses a default of 100; in production, use `estimateExecutionCost()` to look up current prices.
- Partial fills do not interact with dynamic market data; they are deterministic based on configuration.
- Cancellation always succeeds for open orders (not yet filled) but fails for already-filled orders, mirroring real broker behavior only partially.
- Order modification (amend quantity or price) is not supported; callers must cancel and resubmit.
