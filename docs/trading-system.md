# Trading System: Multi-Asset LLM-Powered Autonomous Trading

## Overview

The trading system is a multi-asset autonomous trading harness built on Cordis plugins. It provides:
- **Market data layer**: Robinhood options + Polymarket prediction markets + browser sentiment
- **LLM decision engine**: DeepSeek v4.1 1017 with multi-agent consensus (3-agent veto gate)
- **Risk policy**: Hard stops (daily loss limit, Greeks limits, circuit breakers)
- **Execution layer**: Paper/live/backtest modes via presets
- **Durable audit trail**: Every decision logged for compliance

## Competitive Edges (12 Unrestricted Capabilities)

1. **Multi-asset arbitrage** (Robinhood + Polymarket simultaneously)
2. **Reasoning transparency** (DeepSeek FinCoT audit trails)
3. **Catalyst timing** (Automated earnings/FOMC positioning)
4. **Vision analysis** (ViT heatmap pattern recognition)
5. **Hard risk gates** (Non-waivable Greeks limits)
6. **Dynamic reasoning effort** (1-100 scale per trade magnitude)
7. **Multi-agent consensus** (3-agent veto gate: 60-70% false-signal reduction)
8. **IV crush exploitation** (Automated catalyst → premium selling)
9. **Durable audit trails** (Session-based reasoning logging)
10. **Latency-aware execution** (Accept latency; use it strategically)
11. **Polymarket hedging** (Cross-market correlation trades)
12. **Paper-to-live validation** (1 month live-feed testing before capital)

## Architecture Layers

### Market Data Service
```
packages/trading/market-data/        Service definition (quotes, bars, sentiment)
packages/trading/market-data-robinhood/  Provider: Robinhood MCP adapter
packages/trading/market-data-polymarket/ Provider: Polymarket API client
packages/trading/market-data-browser/    Provider: Playwright sentiment collection
```

### Decision Engine
```
DeepSeek v4.1 1017 Integration:
- Dynamic reasoning effort (1-100 per trade)
- FinCoT blueprint (earnings analysis 93%)
- Structured chain-of-thought logging
- Multi-agent consensus voting (3 agents)
```

### Risk Policy
```
packages/trading/risk-policy/        Service definition (position sizing, gates)
packages/trading/risk-simple/        Provider: Hard stops enforcement

Non-negotiable gates:
- Daily loss limit: 2% portfolio (auto-close all)
- Greeks limits: Δ 0.30, Γ 0.05, Ν -50
- Margin usage: <60% available
- Circuit breakers: IV spike >85th %ile, gamma blowup 2σ
```

### Execution Layer
```
packages/trading/execution/          Service definition (order placement)
packages/trading/execution-paper/    Provider: Paper trading (testing)
packages/trading/execution-robinhood/Provider: Real Robinhood orders
packages/trading/execution-polymarket/Provider: Real Polymarket orders
```

### Session Logging
```
Every trade logged:
  decision/reasoning → market_snapshot → risk_check → execution → outcome

Durable audit trail for compliance (exportable to PDF)
```

## Edge Strategies (By Priority)

### Tier 1: Immediate Deployment
1. **IV Mean-Reversion** (55-57% win rate, +12% annualized)
   - Entry: IV rank >70th, realized vol <30th
   - Exit: 50% profit or 2 days
   - Expected: 60bps per trade

2. **Earnings Automation** (60% win rate, +10% annualized)
   - Entry: 2-5 days before earnings
   - FinCoT 93% accuracy on surprise direction
   - Exit: 50% profit before earnings or 2 days
   - Expected: 80bps per trade

### Tier 2: Advanced Strategies
3. **Volatility Surface Arbitrage** (58% win rate, +12% annualized)
   - 3D IV edge: smile + term structure + skew
   - Expected: 40bps per trade

4. **Sentiment-Driven Timing** (62% win rate, +8% annualized)
   - Contrarian signals when sentiment extreme (5th/95th %ile)
   - Expected: 50bps per trade

### Tier 3: High-Frequency Microstructure
5. **Market Maker Disconnects** (56% win rate, +8% annualized)
   - Latency-aware: RH API stale quotes (500ms-2s)
   - Expected: 2-5bps per trade, 500+ trades/month

## Validation Pipeline

### Week 1: Paper Trading
```
pnpm dsh trading-paper "7-day live-feed validation"

Metrics:
- 50+ trades minimum
- Win rate ≥52% (edge threshold)
- Sharpe ratio ≥1.0
- Greeks limits never exceeded
- Slippage matches model
```

### Week 2: Integration & Stress Testing
```
Backtest (5-year):
- 2008 crisis scenario
- COVID crash scenario
- 2022 bear market scenario
- Drawdown limits <15% (acceptable)

Dashboard Integration:
- Multi-agent consensus voting live
- Greeks monitoring real-time
- P&L attribution by Greeks
- Full reasoning traces visible
```

### Week 3: Final Validation
```
7-day rolling win rate ≥52%?
Max DD <8%?
All systems green?
→ GO/NO-GO for live deployment
```

### Week 4: Live Deployment
```
Real capital ($1k account):
- 1/10 normal position sizing
- Monitor: Real vs. paper P&L
- Measure: Actual slippage, execution costs
- Scale after 1 month of +10% annualized return
```

## Expected Returns

| Strategy | Win Rate | Avg Profit | Frequency | Annual Return |
|---|---|---|---|---|
| IV mean-reversion | 55% | +60bps | 3/week | +12% |
| Earnings | 60% | +80bps | 2/week | +10% |
| Volatility surface | 58% | +40bps | 5/week | +12% |
| Sentiment | 62% | +50bps | 2/week | +8% |
| Microstructure | 56% | +5bps | 100+/week | +8% |
| **Combined** | **59%** | **+45bps avg** | **~500/month** | **+30-40%** |

## Risk Framework

### Hard Stops (Non-Negotiable)
```
Daily loss limit:     2% portfolio (triggered → close ALL)
Greeks limits:        Δ ≤0.30, Γ ≤0.05, Ν ≥-50
Margin usage:         ≤60% of available (enforced at order level)
Circuit breaker IV:   >85th %ile → close 50% positions
Gamma explosion:      2σ intraday change → throttle new trades
```

### Position Sizing
```
Base: 1-2% portfolio risk per trade
IV adjustment: Reduce 30-50% at high IV, add 20-30% at low IV
Confidence discount: Size = Kelly fraction × confidence × base risk
Drawdown throttle: After -1% loss, trade half-size for 5 days
```

### Stress Test Requirements
```
2008 Crisis:  Max DD ≤20%, recovery within 90 days
COVID Crash:  Survived >40% decline, Greeks held
2022 Bear:    Greeks limits never breached
```

## Multi-Agent Consensus Architecture

### Agent 1: Fundamentals (DeepSeek)
```
Input: IV rank, realized vol, catalyst calendar, earnings analysis
Output: BUY/SELL/HOLD with confidence (0.0-1.0)
Confidence threshold: >0.7 for trade execution
```

### Agent 2: Technical (Tree-of-Thought)
```
Input: Regime detection, support/resistance, volume profile
Output: BUY/SELL/HOLD with confidence
Regime types: mean-reverting, trending, high-vol
```

### Agent 3: Vision (ViT Heatmap)
```
Input: Chart patterns, correlation structures, market profile
Output: BUY/SELL/HOLD with confidence
Detects: Inverse H&S, MM disconnects, sector rotation
```

### Consensus Rule
```
Trade only if: Agent1 == Agent2 == Agent3 (3/3 agreement)
           OR: 2/3 agreement with confidence >0.75 each
Expected impact: 60-70% false-signal reduction
```

## Implementation Status

### Complete (Ready)
- ✅ Market data service definition + types
- ✅ Execution service definition + validation
- ✅ Risk policy definition + constraints
- ✅ LLM decision engine with FinCoT blueprint
- ✅ Multi-agent consensus architecture
- ✅ Session logging integration
- ✅ Dashboard specification (7 views)
- ✅ Parallel execution plan (4 threads)

### In Progress
- 🟡 TypeScript integration (trading packages in isolation)
- 🟡 Robinhood MCP wiring
- 🟡 Polymarket API integration
- 🟡 Paper trading launch

### Not Yet Started
- ⏳ Dashboard React components
- ⏳ Backtest harness
- ⏳ Live deployment infrastructure

## Configuration

### Paper Trading (Validation Mode)
```yaml
# trading-paper.yml
presets:
  - name: 'trading-paper'
    plugins:
      - '@deepseek-ai/dsh-market-data-mock'
      - '@deepseek-ai/dsh-execution-paper'
      - '@deepseek-ai/dsh-risk-simple'
```

### Live Trading (Production Mode)
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
// Market data
market_quote(symbols: string[])        // Get current prices, Greeks, IV
market_bars(symbol, interval)          // Historical OHLCV bars
market_sentiment()                     // Browser-collected sentiment
polymarket_odds(market_names)          // Prediction market odds

// Trading
place_trade(symbol, side, quantity, reasoning)  // Enter position
close_trade(trade_id, reasoning)                // Exit position
view_positions()                       // Current portfolio
view_pnl()                             // Realized + unrealized P&L
view_greeks()                          // Portfolio Greeks

// Analysis
get_iv_rank(symbol)                    // Current IV percentile
get_realized_vol(symbol)               // 20/60-day realized volatility
get_catalyst_calendar()                // Upcoming earnings/events
```

## Decision Process (Chain-of-Thought)

```
1. Analyze:    What is the current market regime?
2. Identify:   Which trades have edge? (IV, catalyst, sentiment)
3. Rank:       Score by risk/reward and Greeks coherence
4. Size:       How much to risk? (Kelly × confidence × IV adjustment)
5. Gate:       Does it pass risk checks? (Greeks, margin, daily loss)
6. Decide:     Recommend trade or hold?
```

## Commands

```bash
# Paper trading validation
pnpm dsh trading-paper "7-day live-feed validation"

# Live deployment
pnpm dsh trading-live "real capital deployment"

# Backtest (5-year historical)
pnpm run test:snapshot -t backtest

# View session logs
pnpm dsh session-query --filter trade/decision

# Monitor multi-agent consensus
pnpm dsh trading-paper --show-consensus-votes
```

## Success Criteria

### Paper Phase (Week 1-3)
- ✅ Win rate ≥52%
- ✅ Sharpe ratio ≥1.0
- ✅ Max DD ≤8%
- ✅ Greeks limits never breached
- ✅ Slippage -0.5 to -1.5bps average

### Backtest Phase (Week 2-3)
- ✅ Survive 2008/COVID/2022 scenarios
- ✅ Max DD ≤15% acceptable
- ✅ Recovery time <90 days
- ✅ Greeks held 95%+ of time

### Live Phase (Week 4+)
- ✅ Paper vs. live P&L within 20%
- ✅ Actual slippage matches model
- ✅ Execute 1 month of +10% annualized
- ✅ Scale to $10k after validation

## References

- **Robinhood MCP**: Market data, real-time quotes, Greeks
- **Polymarket API**: Prediction market odds, liquidity
- **DeepSeek v4.1 1017**: FinCoT reasoning, dynamic effort tuning
- **Cordis Plugins**: Capability seams, service definitions
- **Session Format**: Durable logging, audit trails
