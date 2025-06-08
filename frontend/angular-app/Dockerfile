FROM node:24-alpine AS builder

WORKDIR /app

# Create a non-root user for the build stage
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files with correct ownership
COPY --chown=nodejs:nodejs package.json yarn.lock ./

# Create necessary directories with correct permissions
RUN mkdir -p /app/.angular /app/dist /app/node_modules && \
    chown -R nodejs:nodejs /app

# Switch to non-root user for installation
USER nodejs

# Install dependencies
RUN yarn install --frozen-lockfile --ignore-scripts

# Copy source code with correct ownership
COPY --chown=nodejs:nodejs . .

# Force rebuild by adding timestamp
RUN echo "Build timestamp: $(date)" > /tmp/build-timestamp.txt

# Ensure Angular cache directory has correct permissions
RUN mkdir -p .angular/cache && chmod -R 755 .angular

# Build the angular-telemetry package first
RUN cd packages/angular-telemetry && yarn install && yarn build

# Build the Angular app with SSR
RUN yarn build:ssr || (cat .angular/cache/*/ecommerce-frontend/*.log && exit 1)

# Compile the server wrapper and instrumentation to JavaScript
# These need to be compiled separately to avoid bundling instrumentation
RUN yarn add --dev typescript @types/node @types/express
RUN npx tsc server-wrapper.ts --outDir dist/ecommerce-frontend/server --module esnext --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --allowImportingTsExtensions false --resolveJsonModule true
RUN npx tsc src/instrumentation.ts --outDir dist/ecommerce-frontend/server/src --module esnext --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck --allowImportingTsExtensions false --resolveJsonModule true

# Debug: List the dist directory structure
RUN ls -la dist/ && ls -la dist/ecommerce-frontend/ || true

# Production stage
FROM node:24-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user and set up app directory with correct ownership
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app && \
    chown -R nodejs:nodejs /app

# Switch to non-root user for all subsequent operations
USER nodejs

WORKDIR /app

# All COPY operations now happen as nodejs user, avoiding chown
COPY --from=builder /app/package.json /app/yarn.lock ./

# Install production dependencies as nodejs user
RUN yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 80

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server wrapper which loads instrumentation then starts Angular SSR
CMD ["node", "dist/ecommerce-frontend/server/server-wrapper.js"]