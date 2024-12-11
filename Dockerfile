# Use the official Node.js image from Docker Hub
FROM node:14

# Create and set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the application port (ajusta según sea necesario)
EXPOSE 3000

# Define the command to run the application
CMD ["node", "script.js"]
