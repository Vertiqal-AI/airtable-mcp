# Stage 1: The Builder
# This stage installs all dependencies (including devDependencies) and builds the project.
FROM node:18-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*.json ./

# Add --ignore-scripts to prevent the "prepare" script from running during install.
# This is the key fix to prevent the out-of-memory (exit code 137) error,
# as it stops the build process from being triggered inside the install step.
RUN npm install --ignore-scripts

# Copy the rest of the application source code
COPY . .

# Run the build script defined in package.json
# This will compile the TypeScript code into JavaScript in the /build directory
RUN npm run build


# Stage 2: The Production Image
# This stage creates the final, lightweight image with only the necessary files to run the application.
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json again
COPY package*.json ./

# Install ONLY production dependencies and skip devDependencies, also ignoring scripts.
RUN npm install --omit=dev --ignore-scripts
