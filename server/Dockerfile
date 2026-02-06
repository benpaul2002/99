FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/ ./shared/

RUN npm install

COPY server/ ./server/
RUN cd server && npx tsc

FROM node:20-alpine
WORKDIR /app

COPY server/.env .env
COPY --from=builder /app/server/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/server/dist ./dist

EXPOSE 8080
CMD ["node", "dist/server/index.js"]