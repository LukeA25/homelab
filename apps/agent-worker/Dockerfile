FROM python:3.12-slim

# git for the coding agent; deliberately no Docker CLI or socket (use homelab-ops).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY bin/homelab-ops /usr/local/bin/homelab-ops
RUN chmod +x /usr/local/bin/homelab-ops \
  && git config --system --add safe.directory /home/landerson/homelab

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
