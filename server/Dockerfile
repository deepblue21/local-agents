FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY local_agents ./local_agents
RUN mkdir -p /data /run/local-agents && chown -R 10001:10000 /data /run/local-agents /app
USER 10001:10000
CMD ["python", "-m", "local_agents.main"]
