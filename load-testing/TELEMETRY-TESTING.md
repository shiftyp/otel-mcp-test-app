# Telemetry Testing Suite

This directory contains comprehensive tests for validating OpenTelemetry instrumentation in the e-commerce application.

## Quick Start

Run the interactive test suite:

```bash
./run-telemetry-tests.sh
```

## Available Tests

### 1. Focused Telemetry Test
- **File**: `k6-scripts/focused-telemetry-test.js`
- **Purpose**: Logs every telemetry request with detailed information
- **Best for**: Debugging telemetry issues, verifying span creation

### 2. Browser Telemetry Test
- **File**: `k6-scripts/browser-telemetry-test.js`
- **Purpose**: Structured browser test with telemetry tracking and reporting
- **Best for**: Validating browser instrumentation coverage

### 3. Comprehensive Telemetry Test
- **File**: `k6-scripts/comprehensive-telemetry-test.js`
- **Purpose**: Tests all frontend operations systematically
- **Best for**: Full coverage validation, identifying missing instrumentation

### 4. Angular Telemetry Test
- **File**: `k6-scripts/angular-telemetry-test.js`
- **Purpose**: Angular-specific telemetry testing (lifecycle, signals, routing)
- **Best for**: Validating Angular framework instrumentation

## Test Parameters

The interactive script allows you to configure:

- **VUs (Virtual Users)**: Number of concurrent users
- **Duration**: How long to run the test (e.g., 30s, 1m, 5m)

Press `P` in the menu to set custom parameters.

## Running Individual Tests

You can also run tests directly with k6:

```bash
# Basic run
k6 run k6-scripts/comprehensive-telemetry-test.js

# With custom parameters
k6 run --vus 5 --duration 2m k6-scripts/browser-telemetry-test.js

# With environment variables
BASE_URL=http://localhost:80 k6 run k6-scripts/focused-telemetry-test.js
```

## Test Output

Each test run generates:

1. **JSON Output**: Raw k6 metrics data
2. **Summary JSON**: Aggregated metrics
3. **Log File**: Console output and debug information
4. **Consolidated Report**: Markdown report with telemetry coverage analysis

Results are saved in the `results/` directory with timestamps.

## Key Metrics Tracked

- **telemetry_requests_total**: Total telemetry requests sent
- **telemetry_data_sent_bytes**: Total bytes of telemetry data
- **telemetry_trace_requests**: Number of trace exports
- **telemetry_metric_requests**: Number of metric exports
- **telemetry_spans_created**: Individual spans created
- **instrumented_functions_called**: Tracked function executions
- **telemetry_data_percentage**: Overhead as percentage of total traffic

## Telemetry Validation

The tests validate:

### Frontend
- Document load instrumentation
- Fetch/XHR request tracing
- User interaction tracking
- Angular component lifecycle
- Signal updates and computations
- Router navigation events
- Form validation tracking

### Backend
- Service endpoint spans
- Database operation tracing
- Redis cache instrumentation
- Inter-service trace propagation
- gRPC communication tracing

## Troubleshooting

### No Telemetry Data
1. Ensure services are running: `docker-compose ps`
2. Check collector is accessible: `curl http://localhost:4318/v1/traces`
3. Verify browser console for errors
4. Check service logs for instrumentation issues

### Missing Spans
1. Verify @Traced decorators are applied
2. Check telemetry service injection
3. Ensure instrumentation.ts is imported
4. Review browser network tab for /telemetry/ requests

### Test Failures
1. Check test logs in `results/` directory
2. Verify application is accessible at BASE_URL
3. Ensure k6 browser module is installed
4. Check for JavaScript errors in browser console

## Viewing Results

### Jaeger UI
Access distributed traces at http://localhost:16686

### Test Reports
Generated reports show:
- Test execution summary
- Telemetry metrics breakdown  
- Coverage analysis checklist
- Missing instrumentation identification

## Contributing

When adding new instrumentation:
1. Update relevant test to exercise new code paths
2. Add assertions for expected spans
3. Update TELEMETRY-COVERAGE.md documentation
4. Run comprehensive test to verify