# Stage 1: Build admin frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma/ ./prisma/
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:20-alpine

WORKDIR /app

# Copy backend production files
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-builder /app/prisma ./prisma

# Copy frontend build output
COPY --from=frontend-builder /app/admin/dist ./public

# Create uploads dir
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
