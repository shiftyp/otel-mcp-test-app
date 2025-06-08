0,# ADR-012: Web Vitals Integration

## Status
Accepted

## Context
Web Vitals are essential metrics for understanding real user experience in web applications. They include:
- Largest Contentful Paint (LCP): Loading performance
- First Input Delay (FID): Interactivity
- Cumulative Layout Shift (CLS): Visual stability
- First Contentful Paint (FCP): Perceived load speed
- Time to First Byte (TTFB): Server responsiveness

Currently, these metrics are tracked separately from application telemetry, making it difficult to correlate performance issues with specific user actions, feature usage, or backend operations. Teams often use separate tools for Web Vitals and application monitoring, missing valuable insights from integrated data.

## Decision
We will integrate Web Vitals collection directly into our OpenTelemetry instrumentation, treating them as first-class metrics alongside application telemetry.

The integration will:
1. Automatically collect all Core Web Vitals using the web-vitals library
2. Export Web Vitals as OpenTelemetry metrics with proper attributes
3. Correlate Web Vitals with active traces for context
4. Provide RxJS observables for real-time monitoring
5. Support custom thresholds and alerting
6. Include device and network context for segmentation

## Consequences

### Positive
- **Unified observability**: Web Vitals alongside application metrics
- **Correlation insights**: Link poor performance to specific features
- **Real-time monitoring**: Observable streams for live dashboards
- **Automatic collection**: No manual instrumentation needed
- **Standard compliance**: Uses Google's official web-vitals library
- **Context-aware**: Includes device, network, and user segment data

### Negative
- **Additional dependency**: Requires web-vitals library (~3KB gzipped)
- **Browser API limitations**: Some metrics only available in Chromium
- **Timing complexity**: Web Vitals have different lifecycles than spans
- **Increased cardinality**: More metrics and attributes to store

## Example
```typescript
// Automatic Web Vitals collection
initializeBrowserTelemetry({
  enableWebVitals: true,
  webVitalsConfig: {
    reportAllChanges: false, // Only report final values
    thresholds: {
      LCP: 2500, // Good threshold in ms
      FID: 100,
      CLS: 0.1
    }
  }
});

// Monitoring Web Vitals in real-time
@Component({
  template: `
    <div *ngIf="webVitals$ | async as vitals">
      <div [class.good]="vitals.LCP < 2500">
        LCP: {{ vitals.LCP }}ms
      </div>
      <div [class.poor]="vitals.CLS > 0.25">
        CLS: {{ vitals.CLS }}
      </div>
    </div>
  `
})
export class PerformanceMonitor {
  webVitals$ = this.telemetry.getWebVitals$();
}

// Correlating with traces
@Traced()
async loadDashboard() {
  // Web Vitals will be linked to this trace
  const data = await this.api.fetchDashboardData();
  // Poor LCP here indicates slow dashboard loading
}
```

## Implementation Notes
- Use `reportHandler` callback from web-vitals for streaming updates
- Store Web Vitals in trace attributes for correlation
- Implement graceful degradation for unsupported browsers
- Consider batching Web Vitals with other metrics
- Add browser and device attributes for segmentation

## References
- [Web Vitals Library](https://github.com/GoogleChrome/web-vitals)
- [Core Web Vitals](https://web.dev/vitals/)
- [Web Vitals in OpenTelemetry](https://opentelemetry.io/docs/demo/services/frontend/)