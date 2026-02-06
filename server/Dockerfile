FROM node:20-alpine AS builder
WORKDIR /app

COPY server/package*.json ./server/
COPY shared/ ./shared/

WORKDIR /app/server
RUN npm install

COPY server/ ./
RUN npx tsc

FROM node:20-alpine
WORKDIR /app/server

COPY server/.env .env

COPY --from=builder /app/server/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/server/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]