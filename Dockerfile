FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATA_DIR=/data
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund || true
COPY . .
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
