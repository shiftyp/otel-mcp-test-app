# K6 Load Testing Container with Browser Support
FROM grafana/k6:latest-with-browser

# Install additional dependencies for browser testing
USER root
RUN apk --no-cache add \
    chromium \
    chromium-chromedriver \
    udev \
    ttf-freefont \
    font-noto-emoji \
    && rm -rf /var/cache/apk/*

# Create directory for test scripts
WORKDIR /scripts

# Copy k6 test scripts
COPY k6-scripts/ /scripts/

# Create directory for test results
RUN mkdir -p /results && \
    chmod 777 /results

# Set environment variables for Chrome
ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/ \
    K6_BROWSER_ENABLED=true \
    K6_BROWSER_HEADLESS=true

# Switch back to k6 user
USER k6

# Default environment variables that can be overridden
ENV BASE_URL=http://host.docker.internal:4200 \
    FLAGD_URL=http://host.docker.internal:8013 \
    USERS_API=http://host.docker.internal:3001/api/users \
    PRODUCTS_API=http://host.docker.internal:3002/api/products \
    TEST_TYPE=load \
    ENVIRONMENT=docker

# Volume for test results
VOLUME ["/results"]

# Default command (can be overridden)
CMD ["run", "--out", "json=/results/test-results.json", "/scripts/unified-browser-test.js"]