FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# Persistent data folder (mount a volume here in prod)
ENV DATA_DIR=/data
ENV PORT=3000

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
