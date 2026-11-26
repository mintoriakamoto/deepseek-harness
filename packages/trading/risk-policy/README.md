# @deepseek-ai/dsh-risk-policy

**Risk policy service: pre-execution risk gates and position sizing**

Part of the trading system's risk framework. Defines the service contract for risk assessment, stress testing, and portfolio analysis.

## Overview

The risk policy service provides a capability seam for multi-provider risk analysis:

- **Default forecasts**: Credit default probability predictions for securities
- **Stress scenarios**: Portfolio impact modeling for market shocks
- **Correlation matrices**: Asset relationships for portfolio diversification analysis
- **Risk assessment**: Pre-execution gates for trade approval

## Service Definition

### RiskPolicyRegistry

The core service (`ctx.riskPolicy`) manages multiple risk providers with fallback logic:

```ts
import { Context } from '@deepseek-ai/cordis'
import type { RiskPolicyRegistry } from '@deepseek-ai/dsh-risk-policy'

// In a plugin
export function apply(ctx: Context) {
  const riskPolicy = ctx.riskPolicy

  // Try providers in order
  const forecast = await riskPolicy.getDefaultForecast('AAPL')
  const scenarios = await riskPolicy.getStressScenarios(portfolio)
  const corr = await riskPolicy.getCorrelationMatrix(['SPY', 'TLT'])
  const assessment = await riskPolicy.assessRisk(trade, portfolio, config)
}
```

## Provider Interface

Implement `RiskProvider` to contribute risk analysis capabilities:

```ts
import type { RiskProvider, Position, RiskConfig } from '@deepseek-ai/dsh-risk-policy'

export class MyRiskProvider implements RiskProvider {
  name = 'my-provider'

  async getDefaultForecast(symbol: string) {
    // Return credit default probability
    return {
      symbol,
      probability: 0.02,
      confidence: 0.85,
      horizon: 252,
      source: 'my-model',
      timestamp: Date.now(),
    }
  }

  async getStressScenarios(positions: Position[]) {
    // Return array of stress test scenarios
    return [
      {
        name: 'Market Correction',
        description: 'Normal pullback',
        marketMove: -0.05,
        ivChange: 500,
        correlationShift: 0.1,
        portfolioImpact: -50000,
      },
    ]
  }

  async getCorrelationMatrix(symbols: string[]) {
    // Return asset correlation matrix
    const n = symbols.length
    const corr = Array(n).fill(0).map(() => Array(n).fill(0))
    for (let i = 0; i < n; i++) {
      corr[i][i] = 1.0
      for (let j = i + 1; j < n; j++) {
        const r = 0.5 // example correlation
        corr[i][j] = corr[j][i] = r
      }
    }
    return { symbols, correlations: corr, timestamp: Date.now() }
  }

  async assessRisk(position, portfolio, config) {
    // Evaluate trade for Greeks limits, margin, daily loss
    return {
      approved: true,
      reasons: [],
      warnings: [],
      recommendedAdjustment: 1.0,
      estimatedLoss: 0,
      marketStress: [],
    }
  }
}
```

## Registration

Register a provider in a plugin:

```ts
import { Context } from '@deepseek-ai/cordis'
import type { RiskPolicyRegistry } from '@deepseek-ai/dsh-risk-policy'

export function apply(ctx: Context) {
  const riskPolicy = ctx.get('riskPolicy') as RiskPolicyRegistry
  const provider = new MyRiskProvider()

  return riskPolicy.register(provider)
}
```

## Available Providers

- **`@deepseek-ai/dsh-risk-simple`**: Hard stops enforcement (Greeks, margin, daily loss)
- **`@deepseek-ai/dsh-risk-morningstar`**: Tail-risk modeling and stress scenarios

## Configuration

Risk configuration passed to `assessRisk()`:

```ts
interface RiskConfig {
  maxDailyLoss: number          // Portfolio percentage (e.g., 0.02 = 2%)
  maxPositionSize: number       // Portfolio percentage (e.g., 0.1 = 10%)
  maxGreeks?: {
    delta: number              // Delta limit (e.g., 0.30)
    gamma: number              // Gamma limit (e.g., 0.05)
    vega: number               // Vega limit (e.g., 50)
    theta: number              // Theta limit (e.g., 0.1)
  }
  marginUsageLimit: number      // Margin percentage (e.g., 0.6 = 60%)
  volatilityThreshold: number   // IV percentile (e.g., 80 = top 20%)
}
```

## Model Experience

The risk policy service has no direct model exposure. Risk providers are called internally by the execution layer before trades are placed. Greeks limits and position sizing directly influence which trades are permitted.

## Known Limitations and Deferred Work

- **Correlated Greeks across portfolio**: Current implementations treat positions independently; portfolio Greeks aggregation requires real-time Greeks data
- **Multi-leg Greeks simulation**: Complex options strategies require Monte Carlo for accurate Greeks; simplified linear approximations in use
- **Real-time data integration**: Risk assessment uses cached data; live Greeks feeds require persistent connections
- **Custom risk models**: Provider interface is extensible; examples show simple implementations; sophisticated models require full integration
