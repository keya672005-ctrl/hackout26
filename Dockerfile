# One image, one service: Node builds the SPA, Python serves both it and the
# API from the same origin (see backend/app.py). Split hosting would mean two
# dashboards, a CORS allowlist and a frontend that breaks when the backend
# sleeps — none of which this project needs.

# ---------------------------------------------------------------- build stage
FROM node:22-alpine AS web
WORKDIR /web

# Dependencies are copied on their own so an edit to src/ does not re-run the
# install layer. `npm ci` (not `install`) — the lockfile is the build input.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# -------------------------------------------------------------- runtime stage
FROM python:3.12-slim
WORKDIR /app

# Matches the local venv (3.12.10) — the gates prove this code on 3.12, so the
# image runs 3.12 rather than whatever `python:slim` happens to point at today.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
# `backend/static/` is the first place app.py looks for a built frontend.
COPY --from=web /web/dist ./backend/static

WORKDIR /app/backend

# Render injects $PORT and it is not optional — a container that hard-codes 8000
# is marked unhealthy and redeployed forever. `sh -c` for the expansion, `exec`
# so uvicorn is PID 1 and still receives SIGTERM on shutdown.
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
