# Use node:alpine for smaller image size
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 100000

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
RUN yarn build

FROM node:20-alpine AS runner

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

# Create non-root user and set as owner of /app before anything is copied
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app && \
    chown -R nodejs:nodejs /app

# Switch to non-root user for all subsequent operations
USER nodejs

WORKDIR /app

# All COPY operations now happen as nodejs user, avoiding chown
COPY --from=deps /app/package.json /app/yarn.lock ./
COPY --from=builder /app/dist ./dist

# Install production dependencies as nodejs user
RUN yarn install --production --frozen-lockfile --network-timeout 100000 && \
    yarn cache clean && \
    rm -rf /tmp/*

EXPOSE 3002

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]