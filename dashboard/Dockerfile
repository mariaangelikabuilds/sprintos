FROM node:24
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run ui:build
ENV NODE_ENV=production
EXPOSE 8792
CMD ["npx", "tsx", "server/index.ts"]
