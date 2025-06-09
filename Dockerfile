# Stage 1: The Builder
# This stage installs all dependencies (including devDependencies) and builds the project.
FROM node:18-alpine AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*.json ./

# Install all dependencies, including the ones needed for building (e.g., typescript)
RUN npm install

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

# Install ONLY production dependencies and skip devDependencies
RUN npm install --omit=dev

# Copy the built application from the 'builder' stage
COPY --from=builder /app/build ./build

# The 'scripts' folder is listed in the "files" array in package.json, so we copy it as well.
COPY --from=builder /app/scripts ./scripts

# --- Configuration for Railway ---
# Railway provides a PORT environment variable that your application should listen on.
# We'll set a default, but Railway will override it. The MCP SDK should automatically pick this up.
ENV PORT=8080
EXPOSE 8080

# Environment variable for the API key. You will set this in the Railway dashboard.
# Do NOT hardcode your key here.
ENV AIRTABLE_API_KEY=""

# The command to start the server when the container launches.
# This uses the "start" script from your package.json
CMD ["npm", "run", "start"]
