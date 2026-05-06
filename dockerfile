FROM python:3.12-slim
RUN apt-get update && apt-get install -y espeak ffmpeg libespeak1
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
CMD ["./scripts/start-backend.sh"]
