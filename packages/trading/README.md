# Trading System Packages

This group contains packages for the DeepSeek Harness autonomous trading system. The trading system enables LLM-powered decision-making for multi-asset trading on platforms like Robinhood (options and equities) and Polymarket (prediction markets).

## Packages

### Market Data

- **[market-data-coindesk](./market-data-coindesk/)**: CoinDesk crypto market data provider with IV surface support for derivatives pricing

## Architecture

The trading system comprises several layers:

1. **Market Data Layer**: Data providers (e.g., CoinDesk) that supply prices, historical bars, and volatility surfaces
2. **Strategy Layer**: LLM-powered decision engines that analyze market data and generate trading signals
3. **Execution Layer**: Order execution providers that interface with trading platforms (Robinhood, Polymarket)
4. **Risk Management Layer**: Position tracking, portfolio analytics, and risk controls

## Development

### Adding a New Market Data Provider

1. Create a new package in `packages/trading/market-data-<name>/`
2. Implement the core provider interface:
   - `getQuote(symbol)`: Fetch current spot prices
   - `getBars(symbol, interval, limit)`: Fetch historical OHLCV data
   - `getVolatilitySurface(symbol, spotPrice)`: Fetch IV surfaces for options
3. Add comprehensive tests covering:
   - Quote fetching
   - Bar retrieval with different intervals
   - Volatility surface structure
   - API error handling
   - Timeout handling
   - Concurrent requests
   - Caching behavior
   - Data normalization
4. Update this README with the new provider

## Testing

```bash
# Run all trading system tests
pnpm run test -- packages/trading

# Run with coverage
pnpm run test:coverage -- packages/trading

# Run specific provider tests
pnpm run test -- packages/trading/market-data-coindesk
```

## Related Documentation

- [DeepSeek Harness Architecture](../../docs/architecture.md)
- [Trading System Design](../../docs/trading-system.md) (when available)
- [Package Guidelines](../AGENTS.md)
