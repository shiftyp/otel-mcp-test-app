#!/bin/bash

# K6 Load Testing Runner with Docker Support
# Usage: ./run-load-test-docker.sh [test-type] [options]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_TEST_DIR="$SCRIPT_DIR/load-testing"
K6_SCRIPTS_DIR="$LOAD_TEST_DIR/k6-scripts"
RESULTS_DIR="$LOAD_TEST_DIR/results"
USE_DOCKER=${USE_DOCKER:-false}
DOCKER_IMAGE="k6-load-test:latest"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure results directory exists
mkdir -p "$RESULTS_DIR"

# Function to display usage
show_usage() {
    echo -e "${CYAN}K6 Load Testing Script with Docker Support${NC}"
    echo -e "${CYAN}==========================================${NC}"
    echo ""
    echo "Usage: $0 [test-type] [options]"
    echo ""
    echo "Test Types:"
    echo "  smoke       - Quick validation test (1 VU, 1 minute)"
    echo "  load        - Standard load test (progressive VUs)"
    echo "  stress      - Stress test with high load"
    echo "  browser     - Browser-based test"
    echo "  api         - API-only test"
    echo "  custom      - Run a custom test script"
    echo ""
    echo "Options:"
    echo "  --docker              Run tests in Docker container"
    echo "  --build               Force rebuild Docker image"
    echo "  --env KEY=VALUE       Set environment variable"
    echo "  --vus <number>        Number of virtual users"
    echo "  --duration <time>     Test duration (e.g., 5m, 300s)"
    echo "  --help               Show this help message"
    echo ""
    echo "Docker Environment Variables:"
    echo "  BASE_URL              Frontend URL (default: http://localhost:4200)"
    echo "  FLAGD_URL             Feature flag service URL (default: http://localhost:8013)"
    echo "  TEST_TYPE             Test type for feature flags"
    echo ""
    echo "Examples:"
    echo "  $0 smoke"
    echo "  $0 load --docker"
    echo "  $0 browser --docker --env BASE_URL=http://staging.example.com"
    echo "  $0 stress --docker --build"
}

# Build Docker image if needed
build_docker_image() {
    echo -e "${BLUE}Building k6 Docker image...${NC}"
    
    if ! docker build -t "$DOCKER_IMAGE" "$LOAD_TEST_DIR"; then
        echo -e "${RED}Failed to build Docker image${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
}

# Check if Docker image exists
check_docker_image() {
    if [[ "$FORCE_BUILD" == "true" ]] || ! docker images | grep -q "k6-load-test"; then
        build_docker_image
    fi
}

# Run k6 command
run_k6_command() {
    local script="$1"
    local output_prefix="$2"
    shift 2
    
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local result_file="${output_prefix}-${timestamp}"
    
    if [[ "$USE_DOCKER" == "true" ]]; then
        echo -e "${BLUE}Running k6 in Docker container...${NC}"
        
        # Check if Docker image exists
        check_docker_image
        
        # Build docker run command
        local docker_cmd="docker run --rm"
        
        # Add environment variables
        for env_var in "${DOCKER_ENV_VARS[@]}"; do
            docker_cmd="$docker_cmd -e $env_var"
        done
        
        # Add volumes
        docker_cmd="$docker_cmd -v $K6_SCRIPTS_DIR:/scripts:ro"
        docker_cmd="$docker_cmd -v $RESULTS_DIR:/results"
        
        # Add network mode for accessing host services
        if [[ "$DOCKER_NETWORK" == "host" ]]; then
            docker_cmd="$docker_cmd --network=host"
        fi
        
        # Add the image and k6 command
        docker_cmd="$docker_cmd $DOCKER_IMAGE run"
        docker_cmd="$docker_cmd --out json=/results/${result_file}.json"
        docker_cmd="$docker_cmd --out csv=/results/${result_file}.csv"
        docker_cmd="$docker_cmd --summary-export=/results/${result_file}-summary.json"
        
        # Add any additional k6 arguments
        for arg in "$@"; do
            docker_cmd="$docker_cmd $arg"
        done
        
        # Add the script
        docker_cmd="$docker_cmd /scripts/$script"
        
        # Execute
        eval $docker_cmd
        
    else
        echo -e "${BLUE}Running k6 locally...${NC}"
        
        # Check if k6 is installed
        if ! command -v k6 &> /dev/null; then
            echo -e "${RED}Error: k6 is not installed${NC}"
            echo "Please install k6 or use --docker flag"
            exit 1
        fi
        
        k6 run \
            --out "json=$RESULTS_DIR/${result_file}.json" \
            --out "csv=$RESULTS_DIR/${result_file}.csv" \
            --summary-export="$RESULTS_DIR/${result_file}-summary.json" \
            "$@" \
            "$K6_SCRIPTS_DIR/$script"
    fi
    
    echo -e "${GREEN}✓ Test completed. Results saved to: $RESULTS_DIR/${result_file}.*${NC}"
}

# Test execution functions
run_smoke_test() {
    echo -e "${CYAN}Running smoke test...${NC}"
    
    DOCKER_ENV_VARS+=("TEST_TYPE=smoke")
    
    run_k6_command \
        "dynamic-load-test.js" \
        "smoke" \
        --tag "testtype=smoke" \
        "${K6_ARGS[@]}"
}

run_load_test() {
    echo -e "${CYAN}Running load test...${NC}"
    
    DOCKER_ENV_VARS+=("TEST_TYPE=load")
    
    run_k6_command \
        "dynamic-load-test.js" \
        "load" \
        --tag "testtype=load" \
        "${K6_ARGS[@]}"
}

run_stress_test() {
    echo -e "${CYAN}Running stress test...${NC}"
    echo -e "${YELLOW}Warning: This will generate high load${NC}"
    
    DOCKER_ENV_VARS+=("TEST_TYPE=stress")
    
    run_k6_command \
        "dynamic-load-test.js" \
        "stress" \
        --tag "testtype=stress" \
        "${K6_ARGS[@]}"
}

run_browser_test() {
    echo -e "${CYAN}Running browser test...${NC}"
    
    DOCKER_ENV_VARS+=("TEST_TYPE=browser")
    DOCKER_ENV_VARS+=("K6_BROWSER_ENABLED=true")
    
    run_k6_command \
        "unified-browser-test.js" \
        "browser" \
        --tag "testtype=browser" \
        "${K6_ARGS[@]}"
}

run_api_test() {
    echo -e "${CYAN}Running API test...${NC}"
    
    DOCKER_ENV_VARS+=("TEST_TYPE=api")
    
    run_k6_command \
        "dynamic-load-test.js" \
        "api" \
        --tag "testtype=api" \
        "${K6_ARGS[@]}"
}

run_custom_test() {
    local script="$1"
    
    if [[ -z "$script" ]]; then
        echo -e "${RED}Error: No script specified for custom test${NC}"
        exit 1
    fi
    
    echo -e "${CYAN}Running custom test: $script${NC}"
    
    DOCKER_ENV_VARS+=("TEST_TYPE=custom")
    
    run_k6_command \
        "$script" \
        "custom" \
        "${K6_ARGS[@]}"
}

# Generate test report
generate_report() {
    echo -e "${CYAN}Generating test report...${NC}"
    
    # Find latest result files
    local latest_json=$(ls -t "$RESULTS_DIR"/*.json 2>/dev/null | head -n1)
    local latest_summary=$(ls -t "$RESULTS_DIR"/*-summary.json 2>/dev/null | head -n1)
    
    if [[ -z "$latest_json" ]]; then
        echo -e "${RED}No test results found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Latest test results:${NC}"
    echo "  JSON: $latest_json"
    echo "  Summary: $latest_summary"
    
    # If jq is available, pretty print the summary
    if command -v jq &> /dev/null && [[ -f "$latest_summary" ]]; then
        echo -e "\n${CYAN}Test Summary:${NC}"
        jq -r '
            "Duration: \(.state.testRunDurationMs / 1000)s",
            "VUs: \(.metrics.vus.max)",
            "Requests: \(.metrics.http_reqs.count)",
            "RPS: \(.metrics.http_reqs.rate)",
            "Errors: \(.metrics.http_req_failed.rate * 100)%",
            "P95 Response Time: \(.metrics.http_req_duration.p95)ms"
        ' "$latest_summary" 2>/dev/null || echo "Unable to parse summary"
    fi
}

# Clean test results
clean_results() {
    echo -e "${CYAN}Cleaning test results...${NC}"
    
    if [[ -d "$RESULTS_DIR" ]]; then
        rm -rf "$RESULTS_DIR"/*
        echo -e "${GREEN}✓ Test results cleaned${NC}"
    else
        echo -e "${YELLOW}No results directory found${NC}"
    fi
}

# Parse command line arguments
DOCKER_ENV_VARS=()
K6_ARGS=()
FORCE_BUILD=false
DOCKER_NETWORK=""
TEST_TYPE=""
CUSTOM_SCRIPT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --docker)
            USE_DOCKER=true
            shift
            ;;
        --build)
            FORCE_BUILD=true
            shift
            ;;
        --network)
            DOCKER_NETWORK="$2"
            shift 2
            ;;
        --env)
            if [[ "$2" =~ ^([^=]+)=(.*)$ ]]; then
                DOCKER_ENV_VARS+=("$2")
                K6_ARGS+=("--env" "$2")
            fi
            shift 2
            ;;
        --vus)
            K6_ARGS+=("--vus" "$2")
            shift 2
            ;;
        --duration)
            K6_ARGS+=("--duration" "$2")
            shift 2
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        smoke|load|stress|browser|api|custom|report|clean)
            TEST_TYPE="$1"
            shift
            if [[ "$TEST_TYPE" == "custom" && $# -gt 0 ]]; then
                CUSTOM_SCRIPT="$1"
                shift
            fi
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_usage
            exit 1
            ;;
    esac
done

# Set default environment variables for Docker
if [[ "$USE_DOCKER" == "true" ]]; then
    # Set default values if not already set
    DOCKER_ENV_VARS+=("BASE_URL=${BASE_URL:-http://host.docker.internal:4200}")
    DOCKER_ENV_VARS+=("FLAGD_URL=${FLAGD_URL:-http://host.docker.internal:8013}")
    DOCKER_ENV_VARS+=("ENVIRONMENT=${ENVIRONMENT:-docker}")
    
    # Default to host network for accessing local services
    if [[ -z "$DOCKER_NETWORK" ]]; then
        DOCKER_NETWORK="host"
    fi
fi

# Execute test based on type
case "$TEST_TYPE" in
    smoke)
        run_smoke_test
        ;;
    load)
        run_load_test
        ;;
    stress)
        run_stress_test
        ;;
    browser)
        run_browser_test
        ;;
    api)
        run_api_test
        ;;
    custom)
        run_custom_test "$CUSTOM_SCRIPT"
        ;;
    report)
        generate_report
        ;;
    clean)
        clean_results
        ;;
    *)
        echo -e "${RED}Error: No test type specified${NC}"
        show_usage
        exit 1
        ;;
esac