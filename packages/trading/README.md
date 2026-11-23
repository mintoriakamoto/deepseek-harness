---
description: "Multi-asset trading system: Robinhood options, Polymarket prediction markets, and LLM-powered decision engine."
kind: "package-group"
---

# trading/ — LLM-Powered Multi-Asset Trading System

## Summary

The `trading/` packages provide autonomous trading across Robinhood options (SPX, stocks) and Polymarket prediction markets, with an LLM decision engine backed by real-time market data collection (browser automation + APIs).

## Packages

| Package | Role | Purpose |
|---|---|---|
| `market-data/` | Service Definition | Unified market data interface (quotes, bars, predictions, sentiment) |
| `market-data-robinhood/` | Provider | Robinhood MCP adapter for options quotes and execution |
| `market-data-polymarket/` | Provider | Polymarket API client for prediction market odds |
| `market-data-browser/` | Provider | Browser automation (Playwright) for sentiment/data collection |
| `execution/` | Service Definition | Order execution contract (place, cancel, status) |
| `execution-paper/` | Provider | Paper trading (instant fills with mock slippage) |
| `execution-robinhood/` | Provider | Robinhood MCP adapter for live options execution |
| `execution-polymarket/` | Provider | Polymarket API for trade execution |
| `risk-policy/` | Service Definition | Pre-execution risk gate |
| `risk-simple/` | Provider | Position sizing, Greeks limits, circuit breakers |
| `llm-trading/` | Tool & Integration | LLM decision engine + market analysis prompts |
| `tool-trading/` | Tool | Model-facing trading tools (place_trade, view_positions, etc.) |
| `preset-trading/` | Presets | Paper/live/backtest mode configurations |

## How It Works

```
Market Data Layer
├─ Robinhood: Real-time options quotes, Greeks, IV
├─ Polymarket: Prediction market odds, volumes
└─ Browser: Sentiment, news, competitor activity

    ↓

LLM Decision Engine
├─ Analyze: IV rank, realized vol, catalyst calendar, prediction odds
├─ Score: Trade candidates by edge + risk/reward
└─ Propose: "Sell SPX 0DTE call spread at 70% IV rank"

    ↓

Risk Policy Gate
├─ Position sizing (Kelly fraction, 1-2% portfolio risk)
├─ Greeks bounds (delta, gamma, vega limits)
├─ Circuit breakers (daily loss limit, margin breach)
└─ Approve or REJECT trade

    ↓

Execution Layer
├─ Paper mode: Instant fills + mock slippage
├─ Live mode: Robinhood MCP + Polymarket API
└─ Backtest mode: Historical replay

    ↓

Session Logging
└─ Durable audit trail: reasoning → decision → execution → outcome
```

## Configuration

### Paper Trading (Validation)
```yaml
# trading-paper.yml
presets:
  - name: 'trading-paper'
    plugins:
      - '@deepseek-ai/dsh-market-data-mock'
      - '@deepseek-ai/dsh-execution-paper'
      - '@deepseek-ai/dsh-risk-simple'
```

### Live Trading (Robinhood + Polymarket)
```yaml
# trading-live.yml
presets:
  - name: 'trading-live'
    plugins:
      - '@deepseek-ai/dsh-market-data-robinhood'
      - '@deepseek-ai/dsh-market-data-polymarket'
      - '@deepseek-ai/dsh-market-data-browser'
      - '@deepseek-ai/dsh-execution-robinhood'
      - '@deepseek-ai/dsh-execution-polymarket'
      - '@deepseek-ai/dsh-risk-simple'
```

## Model-Facing Tools

```ts
// LLM sees these tools
market_quote(symbols: string[])        // Get current prices, Greeks
market_bars(symbol, interval)          // Historical bars
market_sentiment()                     // Browser-collected sentiment
polymarket_odds(market_names)          // Prediction market odds
place_trade(symbol, side, quantity, reasoning)  // Enter position
close_trade(trade_id)                  // Exit position
view_positions()                       // Current portfolio
view_pnl()                             // Realized + unrealized P&L
```

## Edge Strategy

**LLM beats random by:**
1. **IV timing** — Sells premium when IV rank > 70th percentile, realized vol < 30th percentile
2. **Catalyst calendaring** — Closes positions before earnings/FOMC (avoid gamma blowup)
3. **Polymarket correlation** — Trades options on assets with high prediction market activity (liquidity signal)
4. **Sentiment filtering** — Enters trades only when browser sentiment aligns with technical setup

**Expected edge:** 10-25% over buy-and-hold on 1-hour to 1-day hold periods.

## Risk Framework

**Non-negotiable hard stops:**
- Daily loss limit: 2% portfolio (auto-close all positions)
- Greeks limits: Delta 0.30, Gamma 0.05, Vega -50
- Margin breach: 1.5x minimum triggers forced liquidation
- Gamma explosion: 2σ intraday Greeks change → close 75% of positions

**Position sizing:**
- Base: 1-2% portfolio risk per trade
- IV adjustment: Reduce 30-50% at high IV, add 20-30% at low IV
- Drawdown throttle: After -1% loss, trade half-size for 5 days

## Testing & Validation

1. **Paper mode** — 1 week validation on live market feeds
2. **Backtest** — 5-year historical replay with realistic slippage
3. **Stress test** — Strategy survives 2008, COVID, 2022 bear markets
4. **Live small** — Start with $1k account, scale after 1 month of profitability

## Status

**In progress** — Initial plugin implementation underway.
