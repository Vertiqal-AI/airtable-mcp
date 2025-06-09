FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the TypeScript project
RUN npm run build

# Expose the port the MCP server will run on (default 8000, configurable via environment variable)
EXPOSE 8000

# Set environment variable for the port (can be overridden)
ENV PORT=8000

# Command to start the server
CMD ["npm", "start"]
