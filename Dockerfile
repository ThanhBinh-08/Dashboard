FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATA_DIR=/data
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund || true
COPY . .
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
STOPSIGNAL SIGTERM
CMD ["node", "server.js"]
