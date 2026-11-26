# @deepseek-ai/dsh-risk-morningstar

**Morningstar Risk Analytics provider for tail-risk modeling and stress testing**

Provides structured credit risk insights, default probability forecasts, portfolio stress scenarios, and correlation matrices for trading risk management.

## Features

- **Default probability forecasts**: Credit default probability predictions based on tail-risk models
- **Stress scenarios**: Five standard scenarios covering market corrections, crises, volatility spikes, and correlation breakdowns
- **Correlation matrices**: Asset correlations for portfolio diversification analysis
- **Risk assessment**: Pre-execution gates with Greeks limits, margin checks, and volatility thresholds
- **Result caching**: Configurable caching with TTL to reduce redundant computations

## Installation

```bash
pnpm add @deepseek-ai/dsh-risk-morningstar @deepseek-ai/dsh-risk-policy
```

## Usage

### As a Plugin

Register in a cordis configuration:

```ts
import MorningstarRiskService from '@deepseek-ai/dsh-risk-morningstar'

export const plugins = [
  {
    plugin: MorningstarRiskService,
    config: {
      enableCache: true,
      cacheTtl: 3600000, // 1 hour
    },
  },
]
```

### Direct API

```ts
import { Context } from '@deepseek-ai/cordis'
import MorningstarRiskService from '@deepseek-ai/dsh-risk-morningstar'

const ctx = new Context()
const morningstar = new MorningstarRiskService(ctx, {
  enableCache: true,
  cacheTtl: 60 * 60 * 1000, // 1 hour
})

// Get default forecast
const forecast = await morningstar.getDefaultForecast('AAPL')
console.log(forecast) // => { symbol, probability, confidence, ... }

// Get stress scenarios
const scenarios = await morningstar.getStressScenarios(portfolio)
scenarios.forEach(s => {
  console.log(`${s.name}: ${s.description}`)
})

// Get correlation matrix
const corr = await morningstar.getCorrelationMatrix(['SPY', 'TLT', 'GLD'])
console.log(corr.correlations) // => symmetric matrix

// Assess trade risk
const assessment = await morningstar.assessRisk(trade, portfolio, config)
if (!assessment.approved) {
  console.error(assessment.reasons)
}
```

## Stress Scenarios

The provider generates five standard stress scenarios:

| Scenario | Market Move | IV Change | Correlation | Use Case |
|---|---|---|---|---|
| Market Correction | -5% | +500bps | 0.10 | Normal pullback |
| Stress Event | -15% | +1500bps | 0.50 | Significant sell-off |
| Crisis Scenario | -30% | +3000bps | 0.90 | Severe market crisis |
| Volatility Spike | 0% | +2000bps | 0.30 | Isolated IV increase |
| Correlation Breakdown | -10% | +1000bps | 0.95 | Diversification fails |

Portfolio impact is estimated through simulated Greeks and vega exposure.

## Configuration

```ts
interface MorningstarRiskConfig {
  apiEndpoint?: string    // Future: Morningstar API endpoint
  cacheTtl?: number       // Cache TTL in milliseconds (default: 1 hour)
  enableCache?: boolean   // Enable result caching (default: true)
}
```

## Default Forecast Model

Credit default probabilities are estimated based on:
- Asset type: High-yield bonds (HY) return ~8% base; investment grade ~2%
- Confidence: 75-95% range based on data freshness
- Horizon: 252 trading days (1 year)

In production, this would integrate with Morningstar's proprietary default prediction models.

## Correlation Model

Asset correlations are computed based on:
- **Same sector**: 0.7-0.9 (high correlation)
- **Same credit class** (e.g., both high-yield): 0.6-0.75
- **Stocks vs bonds**: 0.3-0.45 (diversification benefit)

Ensures symmetry: `corr[i][j] === corr[j][i]`

## Risk Assessment

Evaluates trades using configurable limits:

```ts
const config = {
  maxDailyLoss: 0.02,          // 2% portfolio loss limit
  maxPositionSize: 0.10,       // 10% portfolio size limit
  maxGreeks: {
    delta: 0.30,
    gamma: 0.05,
    vega: 50,
    theta: 0.1,
  },
  marginUsageLimit: 0.60,      // 60% margin utilization
  volatilityThreshold: 80,     // Top 20% IV percentile
}

const assessment = await service.assessRisk(trade, portfolio, config)
// => { approved, reasons, warnings, recommendedAdjustment, ... }
```

Returns:
- **approved**: Boolean trade approval
- **reasons**: Array of rejection reasons (empty if approved)
- **warnings**: Non-blocking concerns
- **recommendedAdjustment**: Position sizing factor (< 1.0 if downsized)
- **estimatedLoss**: Worst-case loss estimate
- **marketStress**: Stress scenarios (included on rejection)

## Caching

Results are cached by key (symbol for forecasts, sorted symbol list for correlations):

```ts
// Cache lookup key for correlation matrix
const key = ['AAPL', 'MSFT', 'GOOGL'].sort().join(',')
// Different ordering returns same cached result

// Cache TTL: requests within TTL reuse cached data
// After TTL expires, next request triggers fresh computation
```

Disable caching for testing:

```ts
const service = new MorningstarRiskService(ctx, { enableCache: false })
```

## Model Experience

The Morningstar provider does not directly expose model-visible interfaces. Risk assessment results are used internally by the execution layer for trade approval before reaching the LLM.

## Known Limitations and Deferred Work

- **API integration**: Currently uses simulated models; production requires Morningstar Risk API credentials
- **Real Greeks calculation**: Uses simplified linear Greeks estimation; production needs options pricing library (Black-Scholes or similar)
- **Historical backtesting**: Stress scenarios use static parameters; edge-case scenarios (crashes, circuit breakers) require scenario library
- **Multi-currency portfolios**: Current implementation treats all positions uniformly; FX correlation and basis risk not modeled
- **Dynamic correlation**: Correlations use fixed heuristics; crisis periods show correlation breakdown not captured by historical models
- **Live data feeds**: Forecast and correlation caching assumes update frequency; production requires real-time data refresh strategy
