# Use Node.js 24 LTS as the base image
FROM node:26-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
    yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN echo "✓ ffmpeg" && ffmpeg -version | head -1 && \
    echo "✓ yt-dlp" && yt-dlp --version && \
    echo "✓ python3" && python3 --version && \
    echo "✓ curl" && curl --version | head -1

# Install pnpm and uv
RUN npm install -g pnpm@10
ADD https://astral.sh/uv/install.sh /install.sh
RUN chmod +x /install.sh && sh /install.sh && rm /install.sh
ENV PATH="/root/.local/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy package files and install Node dependencies
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# Copy Python dependency files and install them using uv
COPY tests/yt-download/pyproject.toml ./tests/yt-download/
RUN uv venv tests/yt-download/.venv && \
    uv pip install -r tests/yt-download/pyproject.toml --python tests/yt-download/.venv && \ 
    uv pip install --upgrade --pre yt-dlp yt-dlp-ejs --python tests/yt-download/.venv

# Add venv bin to path
ENV PATH="/app/tests/yt-download/.venv/bin:$PATH"

# Copy the rest of the application
COPY . .

# Ensure output directory exists
RUN mkdir -p output

# Default command (can be overridden by CronJobs)
CMD ["pnpm", "start"]
