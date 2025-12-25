# Use standard Node image (safer than alpine for compatibility)
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies)
RUN npm install

# Copy all files
COPY . .

# Disable strict type checking during build (prevents crash on warnings)
ENV CI=false

# Build the app
RUN npm run build

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "run", "start"]
