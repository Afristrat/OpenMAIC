FROM mcr.microsoft.com/playwright:v1.58.2-noble AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8090
CMD ["node", "dist/server.js"]
