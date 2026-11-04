# =============================================================================
# Fleet Agent - Docker API Sidecar (2-stage build)
# =============================================================================
# SECURITY: Non-root user, health check, minimal image
# =============================================================================

# Stage 1: base with security patches
FROM python:3.12.14-slim@sha256:2c941e860699f878900b0edc2403613c234d4b32eda3cc9fa7036991a2a63c4a AS base
RUN rm -rf /var/lib/apt/lists/* && apt-get -o Acquire::Retries=5 -o Acquire::http::Pipeline-Depth=0 update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Stage 2: install dependencies
FROM base AS deps
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: runner (no build artifacts)
FROM base AS runner

RUN groupadd --system agent && useradd --system --gid agent agent

WORKDIR /app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY app.py .

# Defense-in-depth: remove any .env leaked into build context
RUN rm -f .env .env.*

USER agent
EXPOSE 5050

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5050/health')" || exit 1

CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "2", "--timeout", "120", "app:app"]
