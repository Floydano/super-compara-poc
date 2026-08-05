# Kubernetes deployment instructions (español)

Estos archivos ayudan a construir imágenes Docker para frontend y backend y desplegarlas en un cluster Kubernetes.

Pasos resumidos:

1) Construir imágenes (ejemplo usando GitHub Container Registry GHCR):

   # Frontend
   docker build -t ghcr.io/Floydano/super-compara-poc-frontend:latest ./frontend

   # Backend
   docker build -t ghcr.io/Floydano/super-compara-poc-backend:latest ./backend

2) Autenticarse en GHCR (si vas a usar GHCR):

   echo $CR_PAT | docker login ghcr.io -u Floydano --password-stdin

   # donde CR_PAT es un Personal Access Token con permisos para write:packages

3) Push de las imágenes:

   docker push ghcr.io/Floydano/super-compara-poc-frontend:latest
   docker push ghcr.io/Floydano/super-compara-poc-backend:latest

4) Desplegar en Kubernetes:

   # Crear namespace
   kubectl apply -f k8s/namespace.yaml

   # Deploy backend y service
   kubectl apply -f k8s/backend-deployment.yaml -n super-compara
   kubectl apply -f k8s/backend-service.yaml -n super-compara

   # Deploy frontend y service
   kubectl apply -f k8s/frontend-deployment.yaml -n super-compara
   kubectl apply -f k8s/frontend-service.yaml -n super-compara

   # Crear ingress (ajusta host y configuración SSL según tu cluster)
   kubectl apply -f k8s/ingress.yaml -n super-compara

Notas y opciones:

- Si tus imágenes van a un registry privado configura imagePullSecrets en los deployments.
- Ajusta los nombres de las imágenes en los YAML según el registry que uses (Docker Hub, GHCR, ECR, etc.).
- El Dockerfile del frontend intenta ejecutar "npm run build" en caso de que el proyecto sea React/Vite; si tu frontend ya es HTML estático, nginx servirá los archivos tal cual.
- Cambia "example.com" en k8s/ingress.yaml por tu dominio, o usa Ingress tipo LoadBalancer / Service con type: LoadBalancer si no usas Ingress.

Si quieres, puedo:
- Ajustar los Dockerfile para un framework concreto (React, Vite, Next, etc.) si me dices cuál usa el frontend.
- Crear imagePullSecrets y un Secret para tokens si necesitas un ejemplo de despliegue con imágenes privadas.
