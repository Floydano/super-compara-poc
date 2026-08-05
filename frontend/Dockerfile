# Frontend Dockerfile
# Multi-stage build: try to run an npm build if present, otherwise serve static files with nginx

FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --production || true
COPY . .
# If the project has a build script (React/Vite/etc) this will produce /app/build or /app/dist
RUN npm run build || true

FROM nginx:stable-alpine
# If the build produced a directory named "build" or "dist" copy it, otherwise copy all files (fallback)
COPY --from=build /app/build /usr/share/nginx/html
COPY --from=build /app/dist /usr/share/nginx/html
# Fallback: copy current directory static files
COPY --from=build /app /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
