FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep && rm -rf /var/lib/apt/lists/*
WORKDIR /runner
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY runner_app ./runner_app
RUN mkdir -p /workspace /run/local-agents /tmp/local-agents-home && chown -R 10002:10000 /workspace /run/local-agents /tmp/local-agents-home /runner
USER 10002:10000
CMD ["uvicorn", "runner_app.main:app", "--uds", "/run/local-agents/runner.sock", "--log-level", "warning"]
