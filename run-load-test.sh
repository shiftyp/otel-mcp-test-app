#!/bin/bash

# Load testing runner for e-commerce platform
# Usage: ./run-load-test.sh [smoke|load|stress|spike|browser]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_TEST_DIR="$SCRIPT_DIR/load-testing"
K6_SCRIPTS_DIR="$LOAD_TEST_DIR/k6-scripts"
RESULTS_DIR="$LOAD_TEST_DIR/results"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test types
declare -A TEST_CONFIGS=(
    ["smoke"]="1 VU for 1 minute - Basic functionality check"
    ["load"]="Ramp to 50 VUs over 2m, hold 5m - Normal load test"
    ["stress"]="Ramp to 200 VUs over 5m, hold 5m - Stress test"
    ["spike"]="Spike to 100 VUs instantly - Spike test"
    ["browser"]="5 VUs browser test for 5m - Frontend performance"
    ["custom"]="Custom k6 script execution"
)

print_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}                    E-Commerce Load Testing Suite                        ${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_usage() {
    echo "Usage: $0 [test-type] [options]"
    echo ""
    echo "Test Types:"
    for test in "${!TEST_CONFIGS[@]}"; do
        echo -e "  ${GREEN}$test${NC} - ${TEST_CONFIGS[$test]}"
    done
    echo ""
    echo "Options:"
    echo "  --vus <number>      Override number of virtual users"
    echo "  --duration <time>   Override test duration (e.g., 30s, 5m)"
    echo "  --out <format>      Output format (json, csv, influxdb)"
    echo "  --tag <key=value>   Add custom tags"
    echo "  --env <key=value>   Set environment variables"
    echo "  --no-summary        Disable end-of-test summary"
    echo "  --watch             Watch test progress in real-time"
    echo ""
    echo "Examples:"
    echo "  $0 smoke"
    echo "  $0 load --vus 100 --duration 10m"
    echo "  $0 custom my-test.js --env BASE_URL=http://production.com"
}

check_dependencies() {
    if ! command -v k6 &> /dev/null; then
        echo -e "${RED}Error: k6 is not installed${NC}"
        echo "Install k6:"
        echo "  macOS: brew install k6"
        echo "  Linux: sudo snap install k6"
        echo "  Or download from: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi

    # Create results directory
    mkdir -p "$RESULTS_DIR"
}

check_services() {
    echo -e "${BLUE}Checking service health...${NC}"
    
    local services=(
        "http://localhost:3001/health:User Service"
        "http://localhost:3002/health:Product Service"
        "http://localhost:4000/:Frontend"
    )
    
    local all_healthy=true
    
    for service_info in "${services[@]}"; do
        IFS=':' read -r url name <<< "$service_info"
        if curl -f -s "$url" > /dev/null; then
            echo -e "  ${GREEN}✓${NC} $name is healthy"
        else
            echo -e "  ${RED}✗${NC} $name is not responding"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = false ]; then
        echo -e "${YELLOW}Warning: Some services are not healthy. Continue anyway? (y/n)${NC}"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

run_smoke_test() {
    echo -e "${GREEN}Running smoke test...${NC}"
    k6 run \
        --vus "${VUS:-1}" \
        --duration "${DURATION:-1m}" \
        --out "json=$RESULTS_DIR/smoke-$(date +%Y%m%d-%H%M%S).json" \
        --tag "testtype=smoke" \
        "${EXTRA_ARGS[@]}" \
        "$K6_SCRIPTS_DIR/dynamic-load-test.js"
}

run_load_test() {
    echo -e "${GREEN}Running load test...${NC}"
    k6 run \
        --out "json=$RESULTS_DIR/load-$(date +%Y%m%d-%H%M%S).json" \
        --tag "testtype=load" \
        "${EXTRA_ARGS[@]}" \
        "$K6_SCRIPTS_DIR/dynamic-load-test.js"
}

run_stress_test() {
    echo -e "${GREEN}Running stress test...${NC}"
    k6 run \
        --out "json=$RESULTS_DIR/stress-$(date +%Y%m%d-%H%M%S).json" \
        --tag "testtype=stress" \
        --env SCENARIO=stress \
        "${EXTRA_ARGS[@]}" \
        "$K6_SCRIPTS_DIR/dynamic-load-test.js"
}

run_spike_test() {
    echo -e "${GREEN}Running spike test...${NC}"
    k6 run \
        --vus "${VUS:-100}" \
        --duration "${DURATION:-2m}" \
        --out "json=$RESULTS_DIR/spike-$(date +%Y%m%d-%H%M%S).json" \
        --tag "testtype=spike" \
        "${EXTRA_ARGS[@]}" \
        "$K6_SCRIPTS_DIR/dynamic-load-test.js"
}

run_browser_test() {
    echo -e "${GREEN}Running browser performance test...${NC}"
    echo -e "${YELLOW}Note: This requires k6 browser module${NC}"
    
    K6_BROWSER_ENABLED=true k6 run \
        --out "json=$RESULTS_DIR/browser-$(date +%Y%m%d-%H%M%S).json" \
        --tag "testtype=browser" \
        "${EXTRA_ARGS[@]}" \
        "$K6_SCRIPTS_DIR/unified-browser-test.js"
}

run_custom_test() {
    local script="$1"
    if [ ! -f "$script" ]; then
        echo -e "${RED}Error: Script '$script' not found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Running custom test: $script${NC}"
    k6 run \
        --out "json=$RESULTS_DIR/custom-$(date +%Y%m%d-%H%M%S).json" \
        --tag "testtype=custom" \
        "${EXTRA_ARGS[@]}" \
        "$script"
}

generate_report() {
    local result_file="$1"
    echo -e "${BLUE}Generating test report...${NC}"
    
    # Basic report generation
    if [ -f "$result_file" ]; then
        echo "Results saved to: $result_file"
        
        # Show key metrics
        echo -e "\n${CYAN}Key Metrics:${NC}"
        jq -r '.metrics.http_req_duration | "Response Time: p95=\(.p95)ms, p99=\(.p99)ms"' "$result_file" 2>/dev/null || true
        jq -r '.metrics.http_reqs | "Total Requests: \(.count)"' "$result_file" 2>/dev/null || true
        jq -r '.metrics.http_req_failed | "Failed Requests: \(.count)"' "$result_file" 2>/dev/null || true
    fi
}

monitor_test() {
    echo -e "${BLUE}Monitoring test progress...${NC}"
    echo "View real-time metrics in:"
    echo "  - Jaeger: http://localhost:16686"
    echo "  - OpenSearch Dashboards: http://localhost:5601"
    echo "  - Grafana: http://localhost:3000"
}

# Main execution
main() {
    print_header
    check_dependencies
    
    if [ $# -eq 0 ]; then
        print_usage
        exit 0
    fi
    
    local test_type="$1"
    shift
    
    # Parse additional arguments
    EXTRA_ARGS=()
    while [ $# -gt 0 ]; do
        case "$1" in
            --vus)
                VUS="$2"
                shift 2
                ;;
            --duration)
                DURATION="$2"
                shift 2
                ;;
            --out)
                EXTRA_ARGS+=("--out" "$2")
                shift 2
                ;;
            --tag)
                EXTRA_ARGS+=("--tag" "$2")
                shift 2
                ;;
            --env)
                EXTRA_ARGS+=("--env" "$2")
                shift 2
                ;;
            --no-summary)
                EXTRA_ARGS+=("--no-summary")
                shift
                ;;
            --watch)
                WATCH_MODE=true
                shift
                ;;
            *)
                if [[ "$test_type" == "custom" ]]; then
                    CUSTOM_SCRIPT="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Check services before running tests
    check_services
    
    # Start monitoring if requested
    if [ "$WATCH_MODE" = true ]; then
        monitor_test &
    fi
    
    # Run the appropriate test
    case "$test_type" in
        smoke)
            run_smoke_test
            ;;
        load)
            run_load_test
            ;;
        stress)
            run_stress_test
            ;;
        spike)
            run_spike_test
            ;;
        browser)
            run_browser_test
            ;;
        custom)
            run_custom_test "$CUSTOM_SCRIPT"
            ;;
        *)
            echo -e "${RED}Unknown test type: $test_type${NC}"
            print_usage
            exit 1
            ;;
    esac
    
    # Generate report
    latest_result=$(ls -t "$RESULTS_DIR"/*.json 2>/dev/null | head -n1)
    if [ -n "$latest_result" ]; then
        generate_report "$latest_result"
    fi
    
    echo -e "\n${GREEN}Load test completed!${NC}"
}

# Run main function
main "$@"