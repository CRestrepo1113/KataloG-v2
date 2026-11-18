FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for rembg, onnxruntime & pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-cache lightweight neural network models during build for instant container startup
RUN python -c "import rembg; rembg.new_session('silueta'); rembg.new_session('u2netp')"


COPY . .

# Render exposes PORT dynamically via environment variable
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

