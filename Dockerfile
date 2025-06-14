FROM node:20-slim

# Install minimal dependencies
RUN apt-get update && \
    apt-get install -y \
    wget \
    fonts-liberation \
    libx11-6 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]