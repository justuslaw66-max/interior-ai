# syntax=docker/dockerfile:1
# The floor-plan import worker (npm run worker:floor-plans) with the local vectorizer runtime on board:
# Node 24 for the worker, a Python 3 virtual environment pinned by requirements.txt (OpenCV 4, scikit-image,
# pytesseract) and the tesseract program with English data. The doctor runs at build time, so an image that
# cannot run the vectorizer does not build.
#
# Build from the repository root (the worker runs the repository, not a bundle):
#     docker build -f services/floorplan-vectorizer/worker.Dockerfile -t interior-ai-floor-plan-worker .
# Run with the app's server environment (DATABASE_URL, APP_ENV=production|staging, the FLOOR_PLAN_* storage
# settings, OPENAI_API_KEY if the vision pass is on) - see README.md, "On the machine that runs imports":
#     docker run --rm --env-file .env.worker interior-ai-floor-plan-worker
#     docker run --rm --env-file .env.worker interior-ai-floor-plan-worker npm run worker:floor-plan-deletions
# Check a running container:
#     docker exec <container> /app/services/floorplan-vectorizer/.venv/bin/python3 services/floorplan-vectorizer/doctor.py --run

FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv tesseract-ocr tesseract-ocr-eng ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The Python side first: it changes rarely and caches well.
COPY services/floorplan-vectorizer/requirements.txt services/floorplan-vectorizer/requirements.txt
RUN python3 -m venv services/floorplan-vectorizer/.venv \
 && services/floorplan-vectorizer/.venv/bin/pip install --no-cache-dir --upgrade pip \
 && services/floorplan-vectorizer/.venv/bin/pip install --no-cache-dir -r services/floorplan-vectorizer/requirements.txt

# The worker is `ts-node` over the repository, so devDependencies are needed: install before NODE_ENV=production.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts/prisma-generate.mjs ./scripts/prisma-generate.mjs
RUN npm ci --include=dev

COPY . .

ENV NODE_ENV=production \
    FLOOR_PLAN_PROCESSING_MODE=background \
    FLOOR_PLAN_VECTORIZER_ENABLED=1 \
    FLOOR_PLAN_VECTORIZER_PYTHON=/app/services/floorplan-vectorizer/.venv/bin/python3 \
    FLOOR_PLAN_VECTORIZER_DIR=services/floorplan-vectorizer

# The runtime must be whole, or the image is not worth having.
RUN services/floorplan-vectorizer/.venv/bin/python3 services/floorplan-vectorizer/doctor.py --run

RUN chown -R node:node /app
USER node

CMD ["npm", "run", "worker:floor-plans"]
