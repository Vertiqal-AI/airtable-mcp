# Use a Node.js base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies with --legacy-peer-deps to handle potential peer dependency issues
RUN npm install --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# Copy or create tsconfig.json to ensure proper TypeScript configuration
COPY tsconfig.json* ./

# Build the TypeScript project
RUN npm run build

# Expose the port for the HTTP wrapper
EXPOSE 8000

# Set environment variable for the port
ENV PORT=3000

# Command to start the server
CMD ["npm", "start"]
