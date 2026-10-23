FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-vazirmatn fonts-dejavu-core ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund \
  && cd server && npm install --ignore-scripts --no-audit --no-fund \
  && npm run build:web
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app/server
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm start"]
