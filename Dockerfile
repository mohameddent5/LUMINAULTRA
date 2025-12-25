# Use Node.js 18
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your app code
COPY . .

# Build the application
RUN npm run build

# Expose the port (Koyeb needs this)
EXPOSE 5000

# Start the server
CMD ["npm", "run", "start"]
