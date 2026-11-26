# @deepseek-ai/dsh-execution-questrade

Questrade execution provider for the DeepSeek Harness trading system. Implements the execution seam with Questrade-specific commission structure, slippage modeling, and Canadian exchange integration for geographic arbitrage in Canadian options.

## Overview

The Questrade provider fills orders with realistic execution characteristics matched to the Questrade brokerage, including:
- Commission of $4.95 CAD per trade
- Realistic slippage of 0.15% (tighter than other providers, reflecting Questrade's liquidity)
- Position tracking for P&L calculation
- Support for Canadian equity and options symbols on TSX

```ts
import { Context } from '@deepseek-ai/cordis'
import QuestradExecutionService from '@deepseek-ai/dsh-execution-questrade'

const ctx = new Context()
ctx.plugin(QuestradExecutionService)

const result = await ctx.execution.placeOrder({
  symbol: 'TSX:ENB',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 50.00,
})

console.log(result.order.status) // 'filled'
console.log(result.order.avgFillPrice) // ~50.075 (with 0.15% slippage)
```

## Configuration

```ts
interface QuestradExecutionConfig {
  // Maximum order size limit (default: 50000 shares)
  maxOrderSize?: number
  // Commission per trade in CAD (default: 4.95)
  commissionPerTrade?: number
  // Slippage percentage for fills (default: 0.15)
  slippagePercent?: number
  // Starting balance in CAD (default: 100000)
  startingBalance?: number
  // Enable partial fills (default: false)
  enablePartialFills?: boolean
  // Number of partial fills if enabled (default: 2)
  numPartialFills?: number
  // Minimum order size (default: 1)
  minOrderSize?: number
  // Tick size for price rounding (default: 0.01)
  minTickSize?: number
}
```

### Configuration Example

```ts
const service = new QuestradExecutionService(ctx, {
  maxOrderSize: 100000,
  commissionPerTrade: 4.95,
  slippagePercent: 0.15,
  startingBalance: 50000,
  enablePartialFills: false,
  minTickSize: 0.01,
})
```

## Behavior

### Instant Fills

By default, all orders are filled immediately upon placement:

```ts
const result = await service.placeOrder({
  symbol: 'TSX:ENB',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 50.00,
})

console.log(result.order.status) // 'filled' (not 'pending')
console.log(result.order.filledQuantity) // 100
```

### Questrade Commission Structure

All trades incur a $4.95 CAD commission, deducted from the account balance:

```ts
// Buy 100 shares at 50.00
const buyResult = await service.placeOrder({
  symbol: 'TSX:TD',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 50.00,
})

// Cost = 100 * 50.075 (slippage) + 4.95 (commission) = 5012.70 CAD
// Balance reduced by 5012.70

// Sell 100 shares at 55.00
const sellResult = await service.placeOrder({
  symbol: 'TSX:TD',
  side: 'sell',
  type: 'limit',
  quantity: 100,
  limitPrice: 55.00,
})

// Proceeds = 100 * 54.925 (slippage) - 4.95 (commission) = 5487.55 CAD
// Balance increased by 5487.55
```

### Slippage Simulation

Fills are applied at a slippage-adjusted price (0.15% by default):

- **Buy orders**: price increased by slippage percentage (0.15% → 50.00 * 1.0015 = 50.075)
- **Sell orders**: price decreased by slippage percentage (0.15% → 50.00 * 0.9985 = 49.925)

This models realistic execution on Canadian exchanges where liquidity is good but not as tight as US brokers.

```ts
// Buy at 100, 0.15% slippage
const buyResult = await service.placeOrder({
  symbol: 'TSX:TD',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 100,
})
console.log(buyResult.order.avgFillPrice) // ~100.15

// Sell at 100, 0.15% slippage
const sellResult = await service.placeOrder({
  symbol: 'TSX:TD',
  side: 'sell',
  type: 'limit',
  quantity: 100,
  limitPrice: 100,
})
console.log(sellResult.order.avgFillPrice) // ~99.85
```

### Position Tracking

The provider tracks all open positions with average cost basis:

```ts
// Buy 100 at 50
await service.placeOrder({
  symbol: 'TSX:ENB',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 50,
})

// Buy 100 at 55
await service.placeOrder({
  symbol: 'TSX:ENB',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 55,
})

const position = service.getPosition('TSX:ENB')
console.log(position.quantity) // 200
console.log(position.avgCost) // ~52.5375 (average of 50.075 and 55.0825)
```

### Balance Tracking

The account tracks balance with proper accounting:

- **Buy orders**: balance decreases by (quantity × fill price with slippage) + commission
- **Sell orders**: balance increases by (quantity × fill price with slippage) - commission

```ts
const service = new QuestradExecutionService(ctx, { startingBalance: 100000 })

console.log(service.getBalance()) // 100000

await service.placeOrder({
  symbol: 'TSX:ENB',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 50,
})

console.log(service.getBalance()) // ~94982.30 (spent 5017.70 CAD)
```

### Partial Fills

When `enablePartialFills: true`, orders are split into multiple partial fills with staggered timestamps:

```ts
const service = new QuestradExecutionService(ctx, {
  enablePartialFills: true,
  numPartialFills: 2,
})

const result = await service.placeOrder({
  symbol: 'TSX:TD',
  side: 'buy',
  type: 'limit',
  quantity: 100,
  limitPrice: 50,
})

console.log(result.order.fills.length) // 2
console.log(result.order.fills[0].quantity) // 50
console.log(result.order.fills[1].quantity) // 50
console.log(result.order.fills[1].timestamp > result.order.fills[0].timestamp) // true
```

## Public API

### Order Methods

- **`validate(request, config)`**: Validate order against Questrade constraints.
- **`placeOrder(request)`**: Place order and return immediately with filled status.
- **`cancelOrder(request)`**: Cancel order (fails if already filled).
- **`getOrderStatus(request)`**: Retrieve order state.
- **`listOrders()`**: List all placed orders.
- **`estimateExecutionCost(request)`**: Estimate order cost with slippage.

### Position Methods

```ts
// Get a specific position
const position = service.getPosition('TSX:ENB')

// Get all positions
const positions = service.getPositions()

// Calculate P&L
const pnl = service.calculatePositionPnl('TSX:ENB', 55) // Using current price
const totalPnl = service.calculateTotalUnrealizedPnl(priceMap)
```

### Balance and Analytics

```ts
// Get current balance
const balance = service.getBalance()

// Set balance directly (testing only)
service.setBalance(10000)

// Analytics
const orderCount = service.getOrderCount()
const totalCommissions = service.getTotalCommissionsPaid()
```

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

The Questrade provider enforces these constraints:

```ts
const result = service.validate(request, {
  minOrderSize: 1,
  maxOrderSize: 50000,
  allowFractional: false,     // Questrade doesn't support fractional shares
  minTickSize: 0.01,
  availableBalance: 100000,
})

if (!result.valid) {
  console.error('Validation failed:', result.errors)
}
```

## Commission Impact on Strategies

The $4.95 CAD commission significantly impacts trading strategies:

- **Minimum viable trade**: ~1000 CAD worth of shares to keep commission below 0.5%
- **Scalping**: Not recommended due to fixed commission
- **Swing trading**: Recommended for multi-day positions
- **Options**: Commission applies to each leg of multi-leg strategies

## Canadian Exchange Symbols

The provider supports standard TSX symbol formats:

- **Equities**: `TSX:ENB`, `TSX:TD`, `TSX:RCI`, etc.
- **Options**: Follow Canadian options naming conventions

## Known Limitations and Deferred Work

- Market order pricing uses a default of 100 CAD; in production, use `estimateExecutionCost()` to look up current prices.
- Partial fills do not interact with dynamic market data; they are deterministic based on configuration.
- Canadian Options-specific features (settlement, early assignment) are not modeled; use this provider for equities and equity-like instruments.
- Order modification (amend quantity or price) is not supported; callers must cancel and resubmit.
- Multi-leg options strategies require multiple orders and commission is charged per leg.
- Real-time liquidity modeling for Canadian options is not implemented; use fixed slippage for now.
- Questrade's tiered commission structure (based on trading volume) is not modeled.
