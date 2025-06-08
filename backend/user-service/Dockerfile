FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY tsconfig.json ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY src ./src

# Build the application
RUN yarn build

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
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy built application
COPY --from=builder /app/dist ./dist

EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "-r", "./dist/instrumentation.js", "dist/server.js"]