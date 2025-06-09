# Use a Node.js base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies with retries and clean cache
RUN npm cache clean --force && \
    npm install --legacy-peer-deps --verbose || \
    npm install --legacy-peer-deps --verbose

# Copy the rest of the application code
COPY . .

# Copy or create tsconfig.json
COPY tsconfig.json* ./

# Build the TypeScript project
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Set environment variable for the port
ENV PORT=3000

# Command to start the server
CMD ["npm", "start"]
