
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of your source code
COPY . .

# Build the TypeScript code into JavaScript
RUN npm run build


# --- Production Stage ---
# This stage creates the final, lightweight container for running the app
FROM node:18-alpine

WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy built code and production dependencies from the 'builder' stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/build ./build

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Change ownership and switch to the non-root user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the application port
EXPOSE 3001

# Add the health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.request({host:'localhost',port:3001,path:'/health',timeout:2000}, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

# Set the command to start the server
CMD ["npm", "start"]
