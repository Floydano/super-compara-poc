# Backend Dockerfile
# Simple Node.js backend container. Expects an entrypoint like server.js or index.js in repository root of backend/

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production || npm install --production
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
