# --- Stage 1: build the React (Vite) frontend ---
FROM node:20-slim AS frontend

WORKDIR /frontend

# Install deps first for better layer caching.
COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build


# --- Stage 2: Python app that serves the API and the built SPA ---
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# The built SPA lands at /app/frontend_dist, which app/main.py serves.
COPY --from=frontend /frontend/dist ./frontend_dist

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
