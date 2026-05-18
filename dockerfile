FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash espeak ffmpeg libespeak1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
RUN chmod +x ./scripts/start-backend.sh

CMD ["bash", "./scripts/start-backend.sh"]
