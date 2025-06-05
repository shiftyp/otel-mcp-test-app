#!/bin/bash

# K6 Browser-based Load Testing Script with Feature Flag Configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
BASE_URL="${BASE_URL:-http://localhost:4200}"
FLAGD_URL="${FLAGD_URL:-http://localhost:8013}"
TEST_TYPE="${TEST_TYPE:-browser-load}"
ENVIRONMENT="${ENVIRONMENT:-test}"
K6_BROWSER_HEADLESS="${K6_BROWSER_HEADLESS:-true}"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if k6 browser is available
check_k6_browser() {
    if ! k6 version | grep -q "browser"; then
        print_error "k6 browser module not available. Please install k6 with browser support."
        print_info "Visit: https://k6.io/docs/using-k6-browser/running-browser-tests/"
        exit 1
    fi
}

# Function to check service health
check_services() {
    print_info "Checking service health..."
    
    # Check frontend
    if curl -sf "${BASE_URL}/health" > /dev/null 2>&1 || curl -sf "${BASE_URL}" > /dev/null 2>&1; then
        print_info "Frontend is accessible at ${BASE_URL}"
    else
        print_warn "Frontend may not be accessible at ${BASE_URL}"
    fi
    
    # Check flagd
    if curl -sf "${FLAGD_URL}/health" > /dev/null 2>&1; then
        print_info "Feature flag service is accessible at ${FLAGD_URL}"
    else
        print_warn "Feature flag service may not be accessible at ${FLAGD_URL}"
        print_warn "Tests will run with default configuration"
    fi
}

# Function to update feature flags for testing
update_test_flags() {
    local test_profile=$1
    print_info "Updating feature flags for test profile: ${test_profile}"
    
    case $test_profile in
        "smoke")
            # Conservative settings for smoke tests
            cat > /tmp/test-flags.json <<EOF
{
  "browserTestConfiguration": {
    "enableSmokeTest": true,
    "enableProgressiveLoad": false,
    "smokeVUs": 1,
    "smokeDuration": "2m",
    "headless": true
  },
  "performanceTargets": {
    "errorRate": 0.05,
    "pageLoadP95": 3000,
    "interactionP95": 1000
  },
  "browserScenarioWeights": {
    "browseProducts": 50,
    "searchProducts": 30,
    "purchaseFlow": 20
  }
}
EOF
            ;;
            
        "load")
            # Standard load test configuration
            cat > /tmp/test-flags.json <<EOF
{
  "browserTestConfiguration": {
    "enableSmokeTest": false,
    "enableProgressiveLoad": true,
    "progressiveStages": [
      { "duration": "1m", "target": 3 },
      { "duration": "3m", "target": 5 },
      { "duration": "5m", "target": 8 },
      { "duration": "2m", "target": 5 },
      { "duration": "1m", "target": 0 }
    ],
    "headless": ${K6_BROWSER_HEADLESS}
  },
  "performanceTargets": {
    "errorRate": 0.1,
    "pageLoadP95": 4000,
    "interactionP95": 1500
  },
  "browserScenarioWeights": {
    "browseProducts": 25,
    "searchProducts": 20,
    "purchaseFlow": 15,
    "heavyCart": 15,
    "infiniteScroll": 15,
    "multiTab": 10
  },
  "infiniteScrollConfig": {
    "maxScrolls": 5,
    "scrollSpeed": 300
  }
}
EOF
            ;;
            
        "stress")
            # Stress test with performance optimizations enabled
            cat > /tmp/test-flags.json <<EOF
{
  "browserTestConfiguration": {
    "enableSmokeTest": false,
    "enableProgressiveLoad": true,
    "enableSpikeTest": true,
    "progressiveStages": [
      { "duration": "1m", "target": 5 },
      { "duration": "2m", "target": 10 },
      { "duration": "3m", "target": 15 },
      { "duration": "2m", "target": 20 },
      { "duration": "1m", "target": 0 }
    ],
    "headless": true
  },
  "performanceTargets": {
    "errorRate": 0.2,
    "pageLoadP95": 5000,
    "interactionP95": 2000
  },
  "browserScenarioWeights": {
    "browseProducts": 20,
    "searchProducts": 15,
    "purchaseFlow": 10,
    "heavyCart": 20,
    "infiniteScroll": 20,
    "multiTab": 10,
    "performanceStress": 5
  },
  "heavyCartConfig": {
    "itemCount": 12,
    "useQuickAdd": true
  },
  "infiniteScrollConfig": {
    "maxScrolls": 7,
    "scrollSpeed": 500
  },
  "performanceStressConfig": {
    "componentCount": 50,
    "animationCount": 20
  },
  "paginationStrategy": "infinite",
  "renderingMode": {
    "strategy": "progressive",
    "priority": "low"
  },
  "sessionReplication": "eventual",
  "mobileCorsPolicy": "relaxed"
}
EOF
            ;;
            
        "chaos")
            # Chaos testing with all optimizations that may cause issues
            cat > /tmp/test-flags.json <<EOF
{
  "browserTestConfiguration": {
    "enableAllTests": true,
    "headless": ${K6_BROWSER_HEADLESS}
  },
  "performanceTargets": {
    "errorRate": 0.3,
    "pageLoadP95": 6000,
    "interactionP95": 3000
  },
  "distributedCacheMode": "optimized",
  "memoryManagement": "aggressive",
  "inventoryAlgorithm": "fastPath",
  "dataFetchStrategy": "parallel",
  "networkResilience": "minimal",
  "mobileCorsPolicy": "relaxed",
  "paginationStrategy": "infinite",
  "cacheWarmupStrategy": "preemptive",
  "sessionReplication": "eventual",
  "renderingMode": "progressive"
}
EOF
            ;;
    esac
    
    # TODO: Upload flags to flagd if API is available
    # For now, we'll pass them as environment variables
    export TEST_FLAGS=$(cat /tmp/test-flags.json)
}

# Function to run browser test
run_browser_test() {
    local test_name=$1
    local test_script=$2
    local test_profile=$3
    
    print_info "Running ${test_name} with profile: ${test_profile}"
    
    # Update feature flags for this test profile
    update_test_flags "$test_profile"
    
    # Set up environment
    export BASE_URL
    export FLAGD_URL
    export FLAGD_BROWSER_URL="${FLAGD_URL}"
    export TEST_TYPE="${test_profile}"
    export ENVIRONMENT
    export K6_BROWSER_HEADLESS
    
    # Create output directory
    local output_dir="./test-results/$(date +%Y%m%d_%H%M%S)_${test_profile}"
    mkdir -p "$output_dir"
    
    # Run the test
    print_info "Starting k6 browser test..."
    
    if k6 run \
        --out json="$output_dir/results.json" \
        --out csv="$output_dir/results.csv" \
        --summary-export="$output_dir/summary.json" \
        "$test_script" 2>&1 | tee "$output_dir/console.log"; then
        
        print_info "Test completed successfully"
        print_info "Results saved to: $output_dir"
        
        # Generate simple report
        generate_report "$output_dir"
    else
        print_error "Test failed"
        return 1
    fi
}

# Function to generate test report
generate_report() {
    local output_dir=$1
    local report_file="$output_dir/report.txt"
    
    print_info "Generating test report..."
    
    cat > "$report_file" <<EOF
# K6 Browser Load Test Report
Generated: $(date)
Test Type: ${TEST_TYPE}
Environment: ${ENVIRONMENT}
Base URL: ${BASE_URL}

## Test Configuration
- Headless: ${K6_BROWSER_HEADLESS}
- Feature Flags: ${FLAGD_URL}

## Results Summary
EOF
    
    # Extract key metrics from summary if available
    if [ -f "$output_dir/summary.json" ]; then
        echo "### Performance Metrics" >> "$report_file"
        jq -r '.metrics | to_entries | .[] | "- \(.key): \(.value.avg // .value.rate // .value.value)"' \
            "$output_dir/summary.json" >> "$report_file" 2>/dev/null || true
    fi
    
    # Check for errors in console log
    echo -e "\n### Errors" >> "$report_file"
    grep -i "error\|fail" "$output_dir/console.log" | head -20 >> "$report_file" || echo "No errors found" >> "$report_file"
    
    print_info "Report generated: $report_file"
    
    # Display summary
    echo -e "\n${GREEN}=== Test Summary ===${NC}"
    tail -20 "$report_file"
}

# Function to run continuous testing
run_continuous() {
    local interval=${1:-300}  # Default 5 minutes
    local test_profile=${2:-"load"}
    
    print_info "Starting continuous browser testing every ${interval} seconds"
    print_info "Press Ctrl+C to stop"
    
    while true; do
        run_browser_test "Continuous Browser Test" "./k6-scripts/unified-browser-test.js" "$test_profile"
        
        print_info "Waiting ${interval} seconds before next run..."
        sleep "$interval"
    done
}

# Main script
main() {
    print_info "K6 Browser-based Load Testing"
    
    # Check prerequisites
    check_k6_browser
    check_services
    
    # Parse command line arguments
    case "${1:-help}" in
        "smoke")
            run_browser_test "Smoke Test" "./k6-scripts/unified-browser-test.js" "smoke"
            ;;
        "load")
            run_browser_test "Load Test" "./k6-scripts/unified-browser-test.js" "load"
            ;;
        "stress")
            run_browser_test "Stress Test" "./k6-scripts/unified-browser-test.js" "stress"
            ;;
        "chaos")
            run_browser_test "Chaos Test" "./k6-scripts/unified-browser-test.js" "chaos"
            ;;
        "continuous")
            run_continuous "${2:-300}" "${3:-load}"
            ;;
        "help"|*)
            cat <<EOF
Usage: $0 [command] [options]

Commands:
  smoke       Run a quick smoke test (1 VU, 2 minutes)
  load        Run a standard load test (progressive 0-8 VUs)
  stress      Run a stress test with performance optimizations
  chaos       Run chaos test with all problematic optimizations
  continuous  Run tests continuously (interval in seconds, test profile)

Environment Variables:
  BASE_URL              Frontend URL (default: http://localhost:4200)
  FLAGD_URL             Feature flag service URL (default: http://localhost:8013)
  K6_BROWSER_HEADLESS   Run browser in headless mode (default: true)
  TEST_TYPE             Test type identifier
  ENVIRONMENT           Environment name (default: test)

Examples:
  # Run smoke test
  $0 smoke
  
  # Run load test with visible browser
  K6_BROWSER_HEADLESS=false $0 load
  
  # Run continuous testing every 10 minutes
  $0 continuous 600 load
  
  # Run stress test against production-like environment
  BASE_URL=https://staging.example.com $0 stress
EOF
            ;;
    esac
}

# Run main function
main "$@"