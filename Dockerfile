FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY public ./public
COPY server ./server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
USER node
EXPOSE 4173
CMD ["node", "server/index.mjs"]
