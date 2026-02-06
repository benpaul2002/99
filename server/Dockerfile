FROM node:20-alpine AS builder
WORKDIR /app

COPY server/package*.json ./
COPY shared/ ./shared/

RUN npm install

COPY server/ ./

RUN npx tsc

FROM node:20-alpine
WORKDIR /app

COPY server/.env .env

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server/index.js"]