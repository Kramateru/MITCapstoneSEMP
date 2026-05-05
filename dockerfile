# Use a lightweight Python image
FROM python:3.12-slim

# Install system dependencies for eSpeak
RUN apt-get update && apt-get install -y \
    espeak-ng \
    libespeak1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the project
COPY . .

# Command to run your app (adjust 'backend.main:app' to your actual entry point)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "10000"]
