# Frontend Dockerfile
# Multi-stage build: intenta ejecutar `npm run build` si existe (React/Vite/etc) y garantiza que
# /app/build exista para la etapa final. Si no hay build/dist, copia un fallback de `public/` o la raíz.

FROM node:18-alpine AS build
WORKDIR /app

# Copiar package.json si existe y reinstalar dependencias (no fallar si no hay package.json)
COPY package*.json ./
RUN npm ci --production || true

# Copiar el resto del código y ejecutar build si existe
COPY . .
RUN npm run build || true

# Normalizar la salida de build: preferir ./build; si ./dist existe, renombrarlo; si ninguno existe,
# crear ./build usando ./public o copiando archivos estáticos como fallback.
RUN if [ -d ./build ]; then \
      echo "Using existing ./build"; \
    elif [ -d ./dist ]; then \
      echo "Found ./dist, moving to ./build" && mv ./dist ./build; \
    else \
      echo "No build/dist found — creating ./build as fallback" && mkdir -p ./build && \
      (cp -r ./public/* ./build 2>/dev/null || cp -r ./* ./build 2>/dev/null || true); \
    fi

FROM nginx:stable-alpine
# Copiar contenido preparado en /app/build al html de nginx
COPY --from=build /app/build /usr/share/nginx/html

# Eliminar posibles archivos default de nginx y fijar permisos si es necesario (opcional)
RUN rm -f /etc/nginx/conf.d/default.conf || true

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
