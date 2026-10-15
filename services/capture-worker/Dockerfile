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
# Non-root : pwuser est créé par l'image Playwright (utils/docker/Dockerfile.noble).
# Le répertoire du volume nommé est créé et attribué avant USER : Docker recopie
# propriétaire et droits de l'image dans un volume nommé vide au premier montage.
RUN mkdir -p /data/storage-states && chown -R pwuser:pwuser /data/storage-states
USER pwuser
EXPOSE 8090
CMD ["node", "dist/server.js"]
