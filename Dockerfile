# Monny API — portable multi-stage image (Cloud Run / App Runner / Azure Container Apps).
# Build: docker build -t monny-api .
# Run:   docker run --rm -p 8000:8000 -e MONNY_DRY_RUN=1 monny-api

FROM python:3.12-slim AS builder

WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --upgrade pip \
    && pip install --prefix=/install .

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MONNY_DRY_RUN=1 \
    MONNY_LIVE=0 \
    MONNY_TENANTS_DIR=/app/tenants \
    MONNY_DATA_DIR=/app/data \
    MONNY_DEFAULT_TENANT=demo \
    MONNY_API_HOST=0.0.0.0 \
    MONNY_API_PORT=8000 \
    MONNY_CORS_ORIGINS=* \
    PATH="/install/bin:$PATH" \
    PYTHONPATH="/install/lib/python3.12/site-packages"

WORKDIR /app

# Non-root user
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin monny \
    && mkdir -p /app/data \
    && chown -R monny:monny /app

COPY --from=builder /install /install
COPY tenants ./tenants
COPY fixtures ./fixtures

USER monny

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["uvicorn", "monny.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
