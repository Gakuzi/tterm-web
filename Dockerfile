FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tterm/ tterm/
COPY web/dist/ web/dist/

ENV PYTHONUNBUFFERED=1
ENV TTERM_SIGNER_DIR=/app/data/signer
ENV TTERM_WEB_DIST=web/dist

EXPOSE 8290 8291

CMD ["python", "-m", "tterm.dev"]
