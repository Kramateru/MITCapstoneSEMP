import json
import os
import queue
import sys

import sounddevice as sd
from vosk import KaldiRecognizer, Model


MODEL_PATH = "model"

if not os.path.exists(MODEL_PATH):
    print(
        "Please download the model from https://alphacephei.com/vosk/models and unzip as 'model'"
    )
    sys.exit(1)


audio_queue = queue.Queue()
model = Model(MODEL_PATH)
recognizer = KaldiRecognizer(model, 16000)


def audio_callback(indata, frames, time, status):
    """Handle each captured microphone block."""
    del frames, time

    if status:
        print(status, file=sys.stderr)

    audio_queue.put(bytes(indata))


try:
    with sd.RawInputStream(
        samplerate=16000,
        blocksize=8000,
        device=None,
        dtype="int16",
        channels=1,
        callback=audio_callback,
    ):
        print("BPO ASR System Active. Speak into your headset...")

        while True:
            data = audio_queue.get()
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                print(f"Agent/Customer: {result['text']}")
            else:
                partial = json.loads(recognizer.PartialResult())
                if partial["partial"]:
                    print(f"Typing... {partial['partial']}", end="\r")

except KeyboardInterrupt:
    print("\nStopping BPO System...")
