FROM node:20-alpine AS builder
WORKDIR /app

COPY client/package*.json ./client/
COPY shared/ ./shared/

WORKDIR /app/client
RUN npm install

COPY client/ ./

ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_SESSION_URL
ARG REDIS_URL
ARG PORT
ARG NODE_ENV
ARG WEB_ORIGIN
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_SESSION_URL=$NEXT_PUBLIC_SESSION_URL
ENV REDIS_URL=$REDIS_URL
ENV PORT=$PORT
ENV NODE_ENV=$NODE_ENV
ENV WEB_ORIGIN=$WEB_ORIGIN
RUN npm run build

FROM node:20-alpine
WORKDIR /app/client

COPY --from=builder /app/client/public ./public
COPY --from=builder /app/client/.next ./.next
COPY --from=builder /app/client/node_modules ./node_modules
COPY --from=builder /app/client/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]