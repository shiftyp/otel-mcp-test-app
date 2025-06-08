#!/bin/bash

# Interactive script to run telemetry tests

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Create results directory
mkdir -p "${RESULTS_DIR}"

# Available tests
declare -A TESTS=(
    ["1"]="focused-telemetry|k6-scripts/focused-telemetry-test.js|Focused test that logs every telemetry request"
    ["2"]="browser-telemetry|k6-scripts/browser-telemetry-test.js|Structured browser test with telemetry tracking"
    ["3"]="comprehensive-telemetry|k6-scripts/comprehensive-telemetry-test.js|Comprehensive test of all frontend operations"
    ["4"]="angular-telemetry|k6-scripts/angular-telemetry-test.js|Angular-specific telemetry testing"
)

# Default test parameters
DEFAULT_VUS=1
DEFAULT_DURATION="1m"
CUSTOM_VUS=""
CUSTOM_DURATION=""

# Function to display menu
show_menu() {
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}         OpenTelemetry Test Suite${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Test Parameters:${NC}"
    echo -e "  VUs: ${GREEN}${CUSTOM_VUS:-$DEFAULT_VUS}${NC} | Duration: ${GREEN}${CUSTOM_DURATION:-$DEFAULT_DURATION}${NC}"
    echo ""
    echo -e "${YELLOW}Available Tests:${NC}"
    echo ""
    
    for key in "${!TESTS[@]}"; do
        IFS='|' read -r name file desc <<< "${TESTS[$key]}"
        echo -e "  ${BLUE}$key)${NC} ${GREEN}$name${NC}"
        echo -e "     $desc"
        echo ""
    done | sort -n
    
    echo -e "  ${BLUE}A)${NC} ${GREEN}Run All Tests${NC}"
    echo -e "     Execute all telemetry tests in sequence"
    echo ""
    echo -e "  ${BLUE}P)${NC} ${GREEN}Set Parameters${NC}"
    echo -e "     Configure VUs and duration for tests"
    echo ""
    echo -e "  ${BLUE}Q)${NC} ${GREEN}Quit${NC}"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
}

# Function to set test parameters
set_parameters() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Test Parameters Configuration${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Get VUs
    echo -e "${YELLOW}Virtual Users (VUs):${NC}"
    echo -e "Current: ${GREEN}${CUSTOM_VUS:-$DEFAULT_VUS}${NC}"
    echo -n "Enter new value (or press Enter to keep current): "
    read -r new_vus
    if [ -n "$new_vus" ]; then
        if [[ "$new_vus" =~ ^[0-9]+$ ]] && [ "$new_vus" -gt 0 ]; then
            CUSTOM_VUS="$new_vus"
            echo -e "${GREEN}✓ VUs set to: $CUSTOM_VUS${NC}"
        else
            echo -e "${RED}Invalid value. VUs must be a positive integer.${NC}"
        fi
    fi
    
    echo ""
    
    # Get Duration
    echo -e "${YELLOW}Test Duration:${NC}"
    echo -e "Current: ${GREEN}${CUSTOM_DURATION:-$DEFAULT_DURATION}${NC}"
    echo -e "${BLUE}Format: 30s, 1m, 5m, 1h, etc.${NC}"
    echo -n "Enter new value (or press Enter to keep current): "
    read -r new_duration
    if [ -n "$new_duration" ]; then
        if [[ "$new_duration" =~ ^[0-9]+[smh]$ ]]; then
            CUSTOM_DURATION="$new_duration"
            echo -e "${GREEN}✓ Duration set to: $CUSTOM_DURATION${NC}"
        else
            echo -e "${RED}Invalid format. Use format like: 30s, 1m, 5m, 1h${NC}"
        fi
    fi
    
    echo ""
    echo -e "${GREEN}Parameters updated!${NC}"
    read -p "Press Enter to continue..."
}

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local test_desc=$3
    local output_file="${RESULTS_DIR}/${test_name}-${TIMESTAMP}"
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Running: ${GREEN}$test_name${NC}"
    echo -e "Description: $test_desc"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Build k6 command with custom parameters
    local k6_cmd="k6 run"
    
    # For browser tests, use environment variables instead of CLI flags
    # as they conflict with scenario configuration
    if [[ "$test_file" == *"browser"* ]]; then
        if [ -n "$CUSTOM_VUS" ]; then
            export VUS="$CUSTOM_VUS"
        fi
        if [ -n "$CUSTOM_DURATION" ]; then
            export TEST_DURATION="$CUSTOM_DURATION"
        fi
    else
        # For non-browser tests, use CLI flags
        if [ -n "$CUSTOM_VUS" ]; then
            k6_cmd="$k6_cmd --vus $CUSTOM_VUS"
        fi
        if [ -n "$CUSTOM_DURATION" ]; then
            k6_cmd="$k6_cmd --duration $CUSTOM_DURATION"
        fi
    fi
    
    k6_cmd="$k6_cmd \"${test_file}\""
    
    # Show command being run
    echo -e "${BLUE}Command:${NC} $k6_cmd"
    echo ""
    
    if eval "$k6_cmd"; then
        echo -e "\n${GREEN}✓ Test completed successfully${NC}"
        
        # Extract key metrics from summary
        if [ -f "${output_file}-summary.json" ]; then
            echo -e "\n${YELLOW}Key Metrics:${NC}"
            
            # Parse telemetry metrics
            local telemetry_requests=$(jq -r '.metrics.telemetry_requests_total.values.count // 0' "${output_file}-summary.json" 2>/dev/null)
            local telemetry_bytes=$(jq -r '.metrics.telemetry_data_sent_bytes.values.count // 0' "${output_file}-summary.json" 2>/dev/null)
            local trace_requests=$(jq -r '.metrics.telemetry_trace_requests.values.count // 0' "${output_file}-summary.json" 2>/dev/null)
            local metric_requests=$(jq -r '.metrics.telemetry_metric_requests.values.count // 0' "${output_file}-summary.json" 2>/dev/null)
            
            echo -e "  ${BLUE}•${NC} Telemetry Requests: ${GREEN}$telemetry_requests${NC}"
            echo -e "  ${BLUE}•${NC} Telemetry Data: ${GREEN}$(numfmt --to=iec-i --suffix=B $telemetry_bytes 2>/dev/null || echo "${telemetry_bytes} bytes")${NC}"
            echo -e "  ${BLUE}•${NC} Trace Requests: ${GREEN}$trace_requests${NC}"
            echo -e "  ${BLUE}•${NC} Metric Requests: ${GREEN}$metric_requests${NC}"
            
            # Show any custom metrics
            echo -e "\n${YELLOW}Additional Metrics:${NC}"
            jq -r '.metrics | to_entries[] | select(.key | contains("instrumented") or contains("angular") or contains("lifecycle")) | "  • \(.key): \(.value.values.count // .value.values.value // "N/A")"' "${output_file}-summary.json" 2>/dev/null || true
        fi
        
        echo -e "\n${BLUE}Results saved to:${NC}"
        echo -e "  • JSON: ${output_file}.json"
        echo -e "  • Summary: ${output_file}-summary.json"
        echo -e "  • Logs: ${output_file}.log"
    else
        echo -e "\n${RED}✗ Test failed${NC}"
        echo -e "Check ${output_file}.log for details"
        
        # Show last few lines of error
        if [ -f "${output_file}.log" ]; then
            echo -e "\n${RED}Last few lines of output:${NC}"
            tail -n 10 "${output_file}.log"
        fi
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# Function to run all tests
run_all_tests() {
    echo -e "\n${GREEN}Running all telemetry tests...${NC}\n"
    
    for key in $(echo "${!TESTS[@]}" | tr ' ' '\n' | sort -n); do
        IFS='|' read -r name file desc <<< "${TESTS[$key]}"
        run_test "$name" "${SCRIPT_DIR}/$file" "$desc"
    done
    
    generate_consolidated_report
}

# Function to generate consolidated report
generate_consolidated_report() {
    echo -e "\n${GREEN}Generating Consolidated Report...${NC}"
    local REPORT_FILE="${RESULTS_DIR}/telemetry-report-${TIMESTAMP}.md"
    
    cat > "${REPORT_FILE}" << EOF
# Telemetry Test Report
Generated: $(date)

## Test Summary

EOF

    # Add test results to report
    local total_telemetry_requests=0
    local total_telemetry_bytes=0
    local tests_run=0
    
    for test in focused-telemetry browser-telemetry comprehensive-telemetry angular-telemetry unified-browser; do
        if [ -f "${RESULTS_DIR}/${test}-${TIMESTAMP}-summary.json" ]; then
            tests_run=$((tests_run + 1))
            echo "### ${test}" >> "${REPORT_FILE}"
            echo '```json' >> "${REPORT_FILE}"
            jq '.metrics | {
                telemetry_requests: .telemetry_requests_total.values.count,
                telemetry_bytes: .telemetry_data_sent_bytes.values.count,
                trace_requests: .telemetry_trace_requests.values.count,
                metric_requests: .telemetry_metric_requests.values.count,
                instrumented_functions: .instrumented_functions_called.values.count,
                telemetry_percentage: .telemetry_data_percentage.values.avg
            }' "${RESULTS_DIR}/${test}-${TIMESTAMP}-summary.json" >> "${REPORT_FILE}" 2>/dev/null || echo "No telemetry data" >> "${REPORT_FILE}"
            echo '```' >> "${REPORT_FILE}"
            echo "" >> "${REPORT_FILE}"
            
            # Accumulate totals
            local requests=$(jq -r '.metrics.telemetry_requests_total.values.count // 0' "${RESULTS_DIR}/${test}-${TIMESTAMP}-summary.json" 2>/dev/null)
            local bytes=$(jq -r '.metrics.telemetry_data_sent_bytes.values.count // 0' "${RESULTS_DIR}/${test}-${TIMESTAMP}-summary.json" 2>/dev/null)
            total_telemetry_requests=$((total_telemetry_requests + requests))
            total_telemetry_bytes=$((total_telemetry_bytes + bytes))
        fi
    done

    # Add summary
    cat >> "${REPORT_FILE}" << EOF

## Overall Summary

- **Tests Run**: $tests_run
- **Total Telemetry Requests**: $total_telemetry_requests
- **Total Telemetry Data**: $(numfmt --to=iec-i --suffix=B $total_telemetry_bytes 2>/dev/null || echo "${total_telemetry_bytes} bytes")

## Telemetry Coverage Analysis

Based on the test results, here's the telemetry coverage:

### Frontend Instrumentation
- [ ] Document Load (browser)
- [ ] Fetch/XHR requests
- [ ] User interactions
- [ ] Angular component lifecycle
- [ ] Angular signals
- [ ] Router navigation
- [ ] Form validation

### Backend Instrumentation
- [ ] User service endpoints
- [ ] Product service endpoints  
- [ ] Cart service endpoints
- [ ] Database operations
- [ ] Redis operations
- [ ] gRPC communication

### Trace Propagation
- [ ] Browser to backend
- [ ] Service to service
- [ ] Database context

EOF

    echo -e "${BLUE}Report saved to: ${REPORT_FILE}${NC}"
}

# Main menu loop
main() {
    clear
    
    while true; do
        show_menu
        echo -n "Select an option: "
        read -r choice
        
        case "$choice" in
            [1-5])
                if [ -n "${TESTS[$choice]}" ]; then
                    IFS='|' read -r name file desc <<< "${TESTS[$choice]}"
                    run_test "$name" "${SCRIPT_DIR}/$file" "$desc"
                else
                    echo -e "${RED}Invalid option${NC}"
                    sleep 1
                fi
                ;;
            [Aa])
                run_all_tests
                ;;
            [Pp])
                set_parameters
                ;;
            [Qq])
                echo -e "\n${GREEN}Exiting...${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option. Please try again.${NC}"
                sleep 1
                ;;
        esac
        
        clear
    done
}

# Start the interactive menu
main