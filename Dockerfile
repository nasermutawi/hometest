FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
# Mount a persistent volume at /data so the database survives deploys.
ENV DATABASE_PATH=/data/household.db
ENV PORT=3000
EXPOSE 3000
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
