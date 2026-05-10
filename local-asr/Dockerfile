FROM qwenllm/qwen3-asr:latest

WORKDIR /app

RUN if command -v apt-get >/dev/null 2>&1; then \
      apt-get update && \
      apt-get install -y --no-install-recommends ffmpeg && \
      rm -rf /var/lib/apt/lists/*; \
    fi

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

COPY app.py /app/app.py

EXPOSE 8787

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8787"]
