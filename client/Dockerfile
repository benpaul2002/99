FROM node:20-alpine AS builder
WORKDIR /app

COPY client/package*.json ./client/
COPY shared/ ./shared/

WORKDIR /app/client
RUN npm install

COPY client/ ./
COPY client/.env .env
RUN npm run build

FROM node:20-alpine
WORKDIR /app/client

COPY --from=builder /app/client/public ./public
COPY --from=builder /app/client/.next ./.next
COPY --from=builder /app/client/node_modules ./node_modules
COPY --from=builder /app/client/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]