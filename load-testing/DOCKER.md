# Docker-based K6 Load Testing

This directory includes a Dockerfile and scripts for running k6 load tests in Docker containers, providing a consistent testing environment without requiring local k6 installation.

## Features

- **Browser Support**: Full Chromium browser included for browser-based tests
- **Feature Flag Integration**: Connects to flagd service for dynamic test configuration
- **Multiple Test Types**: API and browser tests in the same container
- **Result Persistence**: Test results saved to host volume

## Quick Start

### 1. Build the Docker Image

```bash
docker build -t k6-load-test load-testing/
```

### 2. Run Tests

#### Using the Script (Recommended)

```bash
# Run API load test in Docker
./run-load-test-docker.sh load --docker

# Run browser test in Docker
./run-load-test-docker.sh browser --docker

# Run with custom environment
./run-load-test-docker.sh stress --docker \
  --env BASE_URL=http://staging.example.com \
  --env FLAGD_URL=http://flagd.example.com:8013
```

#### Using Docker Directly

```bash
# API Test
docker run --rm \
  --network=host \
  -v $(pwd)/load-testing/k6-scripts:/scripts:ro \
  -v $(pwd)/load-testing/results:/results \
  -e BASE_URL=http://localhost:4200 \
  -e FLAGD_URL=http://localhost:8013 \
  -e TEST_TYPE=load \
  k6-load-test \
  run --out json=/results/test.json /scripts/dynamic-load-test.js

# Browser Test
docker run --rm \
  --network=host \
  -v $(pwd)/load-testing/k6-scripts:/scripts:ro \
  -v $(pwd)/load-testing/results:/results \
  -e K6_BROWSER_ENABLED=true \
  -e K6_BROWSER_HEADLESS=true \
  k6-load-test \
  run --out json=/results/browser-test.json /scripts/unified-browser-test.js
```

#### Using Docker Compose

```bash
# Run browser test
docker-compose -f load-testing/docker-compose.k6.yml run k6-browser-test

# Run API test
docker-compose -f load-testing/docker-compose.k6.yml run k6-api-test

# Run with custom configuration
TEST_TYPE=stress K6_VUS=100 K6_DURATION=10m \
  docker-compose -f load-testing/docker-compose.k6.yml run k6-api-test
```

## Environment Variables

### Required for Tests

- `BASE_URL`: Frontend application URL (default: `http://host.docker.internal:4200`)
- `FLAGD_URL`: Feature flag service URL (default: `http://host.docker.internal:8013`)
- `USERS_API`: User service API URL (default: `http://host.docker.internal:3001/api/users`)
- `PRODUCTS_API`: Product service API URL (default: `http://host.docker.internal:3002/api/products`)

### Test Configuration

- `TEST_TYPE`: Type of test (smoke, load, stress, browser)
- `K6_VUS`: Number of virtual users
- `K6_DURATION`: Test duration (e.g., 5m, 300s)
- `K6_BROWSER_ENABLED`: Enable browser module (true/false)
- `K6_BROWSER_HEADLESS`: Run browser in headless mode (true/false)

### Feature Flag Context

- `ENVIRONMENT`: Environment name for feature flags (test, staging, production)

## Network Modes

### Host Network (Default)

Best for testing services running on the host machine:

```bash
docker run --network=host k6-load-test ...
```

URLs can use `localhost` or `host.docker.internal`.

### Bridge Network

For testing services in Docker Compose:

```bash
docker run --network=ecommerce_default k6-load-test ...
```

Use service names (e.g., `http://frontend:4000`).

### Custom Network

```bash
docker run --network=my-network k6-load-test ...
```

## Test Results

Results are saved to `./load-testing/results/` with timestamps:

- `{test-type}-{timestamp}.json` - Raw k6 metrics
- `{test-type}-{timestamp}.csv` - CSV format
- `{test-type}-{timestamp}-summary.json` - Test summary

## Debugging

### View Container Logs

```bash
docker logs -f <container-id>
```

### Run Interactive Shell

```bash
docker run -it --rm \
  -v $(pwd)/load-testing/k6-scripts:/scripts:ro \
  k6-load-test \
  /bin/sh
```

### Test Browser Connectivity

```bash
docker run --rm k6-load-test \
  run --vus 1 --duration 10s \
  -e 'import { browser } from "k6/experimental/browser"; 
      export default async function() { 
        const page = browser.newPage(); 
        await page.goto("http://example.com"); 
        console.log("Title:", await page.title()); 
        page.close(); 
      }'
```

## Troubleshooting

### Cannot Connect to Services

1. **Using localhost**: Change to `host.docker.internal` or use `--network=host`
2. **Service not accessible**: Check if services are running and ports are exposed
3. **CORS issues**: Ensure services allow requests from Docker container IPs

### Browser Tests Failing

1. **Out of memory**: Increase Docker memory limit
2. **Chrome crashes**: Reduce number of VUs or use `--no-sandbox` Chrome flag
3. **Timeout errors**: Increase page timeout values in test scripts

### Feature Flags Not Working

1. **Cannot reach flagd**: Verify flagd URL is accessible from container
2. **Wrong context**: Check TEST_TYPE and other context variables
3. **Flag not found**: Ensure flags are configured in flagd

## Performance Tips

1. **Resource Limits**: Set appropriate CPU/memory limits in docker-compose.yml
2. **Concurrent VUs**: Browser tests should use fewer VUs (5-20) than API tests (50-500)
3. **Host Network**: Use `--network=host` for better performance when testing local services
4. **Result Storage**: Mount results directory to persist test data

## Advanced Usage

### Custom Dockerfile

Create a custom Dockerfile for specific needs:

```dockerfile
FROM k6-load-test:latest

# Add custom scripts
COPY my-tests/ /scripts/

# Install additional tools
USER root
RUN apk add --no-cache curl jq
USER k6

# Override default command
CMD ["run", "/scripts/my-test.js"]
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run Load Tests
  run: |
    docker build -t k6-load-test ./load-testing
    docker run --rm \
      -v ${{ github.workspace }}/load-testing/results:/results \
      -e BASE_URL=${{ secrets.STAGING_URL }} \
      -e TEST_TYPE=smoke \
      k6-load-test
    
- name: Upload Results
  uses: actions/upload-artifact@v3
  with:
    name: k6-results
    path: load-testing/results/
```