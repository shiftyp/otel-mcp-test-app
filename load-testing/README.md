# K6 Browser-Based Load Testing

This directory contains k6 load testing scripts that run through real browsers, allowing for comprehensive end-to-end testing of the e-commerce platform with dynamic configuration via feature flags.

## Overview

The browser-based load tests simulate real user interactions through actual browser instances, providing more realistic load patterns and catching issues that API-only tests might miss.

### Key Features

1. **Real Browser Testing**: Uses Chromium to execute actual frontend code
2. **Feature Flag Integration**: Test behavior changes dynamically based on feature flags
3. **Performance Optimization Testing**: Triggers various "optimizations" that may have side effects
4. **Comprehensive Scenarios**: Covers browsing, searching, purchasing, and edge cases

## Test Scripts

### 1. `unified-browser-test.js`
The main browser test that:
- Fetches configuration from feature flags at runtime
- Executes different user scenarios based on weights
- Monitors browser performance and errors
- Supports multiple device profiles (desktop, tablet, mobile)
- Tests all frontend functionality through real browser interactions

### 2. `dynamic-load-test.js`
API-based test that:
- Dynamically configures test parameters from feature flags
- Supports complex load patterns
- Useful for backend-only testing
- Can trigger various optimization side effects based on context

## Running Tests

### Prerequisites

1. Install k6 with browser support:
```bash
# MacOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

2. Ensure services are running:
```bash
# Frontend (Angular app)
cd frontend/angular-app
npm start

# Backend services
docker-compose up -d

# Feature flags (optional but recommended)
kubectl port-forward -n ecommerce svc/flagd 8013:8013
```

### Quick Start

```bash
# Run smoke test (quick validation)
./run-browser-tests.sh smoke

# Run standard load test
./run-browser-tests.sh load

# Run stress test with optimizations
./run-browser-tests.sh stress

# Run chaos test (all problematic optimizations enabled)
./run-browser-tests.sh chaos
```

### Advanced Usage

```bash
# Run with visible browser (not headless)
K6_BROWSER_HEADLESS=false ./run-browser-tests.sh load

# Run against different environment
BASE_URL=https://staging.example.com ./run-browser-tests.sh load

# Run continuous tests every 10 minutes
./run-browser-tests.sh continuous 600 load

# Custom k6 execution
k6 run \
  -e BASE_URL=http://localhost:4200 \
  -e FLAGD_URL=http://localhost:8013 \
  -e TEST_TYPE=custom \
  --out json=results.json \
  k6-scripts/unified-browser-test.js
```

## Test Scenarios

The browser tests execute various scenarios based on feature flag configuration:

### 1. Browse Products
- Navigate to product listing
- View product details
- Add items to cart
- Tests lazy loading and pagination

### 2. Search Products
- Type search queries with realistic speed
- Handle validation and race conditions
- Test search result interactions

### 3. Purchase Flow
- Complete user journey from browsing to checkout
- Test form validation
- Simulate cart abandonment

### 4. Heavy Cart
- Add many items rapidly
- Test performance with large carts
- Trigger N+1 query optimizations

### 5. Infinite Scroll
- Scroll through paginated content
- Detect duplicate items
- Test scroll performance

### 6. Multi-Tab Sync
- Open multiple browser tabs
- Test cart synchronization
- Detect sync failures

### 7. Performance Stress
- Add many DOM elements
- Trigger animations
- Test under heavy load

## Feature Flag Configuration

The tests adapt behavior based on feature flags:

### Test Configuration Flags
```json
{
  "browserTestConfiguration": {
    "enableSmokeTest": true,
    "enableProgressiveLoad": true,
    "smokeVUs": 1,
    "progressiveStages": [...],
    "headless": true
  }
}
```

### Scenario Weights
```json
{
  "browserScenarioWeights": {
    "browseProducts": 30,
    "searchProducts": 20,
    "purchaseFlow": 15,
    "heavyCart": 10,
    "infiniteScroll": 15,
    "multiTab": 10
  }
}
```

### Performance Optimizations
```json
{
  "paginationStrategy": "infinite",
  "renderingMode": "progressive",
  "sessionReplication": "eventual",
  "mobileCorsPolicy": "relaxed"
}
```

## Metrics and Monitoring

The tests collect various metrics:

- **Page Load Time**: Time to load pages
- **Interaction Time**: Time for user interactions
- **API Call Time**: Backend response times
- **Error Rate**: Browser and console errors
- **Duplicate Products**: Count of duplicated items
- **Sync Failures**: Cross-tab synchronization issues

## Results and Reports

Test results are saved in `./test-results/` with:
- `results.json`: Raw k6 metrics
- `results.csv`: CSV format for analysis
- `summary.json`: Test summary
- `console.log`: Full test output
- `report.txt`: Generated summary report

## Troubleshooting

### Browser won't start
- Ensure k6 is installed with browser support
- Check if Chromium dependencies are installed
- Try running with `K6_BROWSER_HEADLESS=false` to see errors

### Feature flags not working
- Verify flagd is running: `curl http://localhost:8013/health`
- Check flagd configuration includes browser flags
- Tests will use defaults if flagd is unavailable

### Tests timing out
- Increase timeout in test scripts
- Check if frontend is accessible
- Verify backend services are healthy

### High error rates
- Check browser console for JavaScript errors
- Verify all services are running correctly
- Review feature flag settings for problematic optimizations

## Best Practices

1. **Start with smoke tests** to validate basic functionality
2. **Run load tests** to establish baseline performance
3. **Use stress tests** carefully as they enable problematic optimizations
4. **Monitor OpenTelemetry** traces and metrics during tests
5. **Review browser console** errors in test output
6. **Adjust scenario weights** based on real user behavior
7. **Use continuous testing** for ongoing validation

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: Browser Load Tests
on:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Start services
        run: docker-compose up -d
        
      - name: Wait for services
        run: ./scripts/wait-for-services.sh
        
      - name: Run browser load test
        run: |
          cd load-testing
          ./run-browser-tests.sh load
          
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: load-testing/test-results/
```

## Contributing

When adding new test scenarios:

1. Add the scenario to `unified-browser-test.js`
2. Update scenario weights in feature flags
3. Document any new metrics collected
4. Test both with and without feature flags
5. Update this README with new scenario details