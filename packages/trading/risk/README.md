---
description: "Risk management seam: position sizing, Greeks limits, circuit breakers, pre-execution gates."
---

# @deepseek-ai/dsh-risk-policy

Risk policy is the **hard stop** between LLM decision and actual execution. It enforces non-negotiable constraints.

## Service Definition

```ts
interface RiskPolicy {
  // Check if trade can be placed
  canPlace(trade: ProposedTrade, portfolio: Portfolio): { approved: boolean; reason?: string };
  
  // Position sizing given account & risk tolerance
  getSizeForTrade(trade: ProposedTrade, portfolio: Portfolio): number;
  
  // Check if portfolio violates Greeks limits
  checkGreeksLimits(portfolio: Portfolio): { breached: boolean; details?: string };
  
  // Check if daily loss limit hit
  checkDailyLossLimit(portfolio: Portfolio): boolean;
  
  // Emergency circuit breaker
  checkCircuitBreakers(market: MarketSnapshot): boolean;
}
```

## Providers

**Simple Provider** (`@deepseek-ai/dsh-risk-simple`):
- Position sizing: 1-2% portfolio risk per trade
- IV adjustment: Reduce 30-50% at high IV, add 20-30% at low IV
- Greeks limits: Delta 0.30, Gamma 0.05, Vega -50
- Daily loss: 2% portfolio (non-negotiable)
- Circuit breakers: Margin 1.5x, IV spike >85th percentile, gamma blowup (2σ change)

## Configuration

```yaml
- name: '@deepseek-ai/dsh-risk-simple'
  config:
    dailyLossLimit: 0.02  # 2% portfolio
    greeksLimits:
      maxDelta: 0.30
      maxGamma: 0.05
      maxVega: -50
    positionSizing:
      baseRisk: 0.015      # 1.5% per trade
      ivAdjustment: true
      recoveryThrottle: true  # Half-size after -1% loss
```

## Edge: What It Prevents

- **Overnight gap blowups**: Gamma limits prevent concentrated short gamma
- **Revenge trading**: Daily loss limit + recovery throttle
- **Correlated liquidation**: Greeks diversification across asset classes
- **Tail risk**: Circuit breaker on IV spikes
- **Margin call**: 1.5x minimum enforced before breach

## Implementation Status

- [x] Interface definition
- [ ] Simple provider (in progress)
- [ ] Configuration validation
- [ ] Integration tests
