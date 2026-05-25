'use client';

import lamejs from 'lamejs';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface WavCallRecordingResult {
  blob: Blob;
  durationSeconds: number;
  mimeType: string;
  fileExtension: string;
}

type CaptureMode = 'media-recorder' | 'manual-mp3' | null;

type CaptureFormat = {
  mimeType: string;
  fileExtension: string;
};

const MP3_CAPTURE_FORMAT: CaptureFormat = {
  mimeType: 'audio/mpeg',
  fileExtension: 'mp3',
};

function normalizeMimeType(value?: string | null) {
  return String(value || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

function resolveFileExtensionFromMimeType(value?: string | null) {
  const normalized = normalizeMimeType(value);
  if (!normalized) {
    return '';
  }
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') {
    return 'mp3';
  }
  if (normalized === 'audio/mp4' || normalized === 'audio/m4a' || normalized === 'audio/x-m4a' || normalized === 'audio/aac') {
    return 'm4a';
  }
  if (normalized === 'audio/ogg' || normalized === 'audio/vorbis') {
    return 'ogg';
  }
  if (normalized === 'audio/webm') {
    return 'webm';
  }
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav' || normalized === 'audio/wave') {
    return 'wav';
  }
  return '';
}

function resolvePreferredCaptureFormat() {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  return MediaRecorder.isTypeSupported(MP3_CAPTURE_FORMAT.mimeType)
    ? MP3_CAPTURE_FORMAT
    : null;
}

function mergeBuffers(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function getCaptureErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Microphone access is blocked. Allow microphone permission in the browser, then start the call again.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No microphone was detected. Connect a microphone or headset before starting the mock call.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The microphone is busy in another app. Close the other app or release the device, then try again.';
    }
    if (error.name === 'OverconstrainedError') {
      return 'The current microphone does not support the requested call-recorder settings. Try another microphone or browser.';
    }
  }

  return error instanceof Error ? error.message : 'Unable to start the call recorder.';
}

function convertFloat32ToInt16(samples: Float32Array) {
  const output = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function encodeMp3(samples: Float32Array, sampleRate: number) {
  const pcmSamples = convertFloat32ToInt16(samples);
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const blockSize = 1152;
  const mp3Chunks: ArrayBuffer[] = [];

  for (let offset = 0; offset < pcmSamples.length; offset += blockSize) {
    const pcmChunk = pcmSamples.subarray(offset, offset + blockSize);
    const encodedChunk = encoder.encodeBuffer(pcmChunk);
    if (encodedChunk.length > 0) {
      mp3Chunks.push(Uint8Array.from(encodedChunk).buffer as ArrayBuffer);
    }
  }

  const flushedChunk = encoder.flush();
  if (flushedChunk.length > 0) {
    mp3Chunks.push(Uint8Array.from(flushedChunk).buffer as ArrayBuffer);
  }

  return new Blob(mp3Chunks, { type: MP3_CAPTURE_FORMAT.mimeType });
}

export function useWavCallRecorder() {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixGainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const playbackSourcesRef = useRef<Map<HTMLMediaElement, MediaElementAudioSourceNode>>(new Map());
  const sampleRateRef = useRef(44100);
  const chunksRef = useRef<Float32Array[]>([]);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordedSamplesRef = useRef(0);
  const captureModeRef = useRef<CaptureMode>(null);
  const captureFormatRef = useRef<CaptureFormat>(MP3_CAPTURE_FORMAT);
  const captureStartedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Best effort shutdown only.
        }
      }
      mediaRecorderRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    playbackSourcesRef.current.forEach((playbackSource) => {
      playbackSource.disconnect();
    });
    playbackSourcesRef.current.clear();
    if (mixGainRef.current) {
      mixGainRef.current.disconnect();
      mixGainRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }
    if (recordingDestinationRef.current) {
      try {
        recordingDestinationRef.current.disconnect();
      } catch {
        // MediaStream destinations can already be detached.
      }
      recordingDestinationRef.current.stream.getTracks().forEach((track) => track.stop());
      recordingDestinationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    captureModeRef.current = null;
    captureStartedAtRef.current = null;
  }, []);

  const startCapture = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    try {
      setError(null);
      chunksRef.current = [];
      mediaChunksRef.current = [];
      recordedSamplesRef.current = 0;
      pausedRef.current = false;
      setIsPaused(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      const AudioContextClass =
        window.AudioContext ||
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('The browser audio context is not available.');
      }

      const audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => undefined);
      }
      const source = audioContext.createMediaStreamSource(stream);
      const mixGain = audioContext.createGain();
      const recordingDestination = audioContext.createMediaStreamDestination();
      const preferredCaptureFormat = resolvePreferredCaptureFormat();

      source.connect(mixGain);
      mixGain.connect(recordingDestination);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      mixGainRef.current = mixGain;
      recordingDestinationRef.current = recordingDestination;
      captureStartedAtRef.current = performance.now();

      if (preferredCaptureFormat) {
        const recorder = new MediaRecorder(recordingDestination.stream, { mimeType: preferredCaptureFormat.mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            mediaChunksRef.current.push(event.data);
          }
        };
        recorder.onerror = (event) => {
          console.error('Mixed call recorder failed.', event);
        };
        mediaRecorderRef.current = recorder;
        captureModeRef.current = 'media-recorder';
        captureFormatRef.current = preferredCaptureFormat;
        recorder.start(250);
      } else {
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        const monitorGain = audioContext.createGain();
        monitorGain.gain.value = 0;

        processor.onaudioprocess = (event) => {
          if (pausedRef.current) {
            return;
          }
          const input = event.inputBuffer.getChannelData(0);
          chunksRef.current.push(new Float32Array(input));
          recordedSamplesRef.current += input.length;
        };

        mixGain.connect(processor);
        processor.connect(monitorGain);
        monitorGain.connect(audioContext.destination);

        processorRef.current = processor;
        gainRef.current = monitorGain;
        sampleRateRef.current = audioContext.sampleRate || 44100;
        captureModeRef.current = 'manual-mp3';
        captureFormatRef.current = MP3_CAPTURE_FORMAT;
      }

      setIsCapturing(true);
    } catch (captureError) {
      const message = getCaptureErrorMessage(captureError);
      setError(message);
      await cleanup();
      setIsCapturing(false);
      throw new Error(message);
    }
  }, [cleanup, isCapturing]);

  const registerPlaybackElement = useCallback((element: HTMLMediaElement | null) => {
    if (!element) {
      return false;
    }

    const audioContext = audioContextRef.current;
    const mixGain = mixGainRef.current;
    if (!audioContext || !mixGain) {
      return false;
    }

    const existingSource = playbackSourcesRef.current.get(element);
    if (existingSource) {
      return true;
    }

    try {
      const playbackSource = audioContext.createMediaElementSource(element);
      playbackSource.connect(mixGain);
      playbackSource.connect(audioContext.destination);
      playbackSourcesRef.current.set(element, playbackSource);
      return true;
    } catch (registerError) {
      console.error('Unable to register playback audio for mixed recording.', registerError);
      return false;
    }
  }, []);

  const setCapturePaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
    setIsPaused(paused);

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return;
    }

    try {
      if (paused && recorder.state === 'recording') {
        recorder.pause();
      } else if (!paused && recorder.state === 'paused') {
        recorder.resume();
      }
    } catch {
      // Browsers vary on pause/resume support for audio-only streams.
    }
  }, []);

  const stopCapture = useCallback(async () => {
    if (!isCapturing) {
      return null;
    }

    const captureMode = captureModeRef.current;
    if (captureMode === 'media-recorder' && mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current;
      const fallbackFormat = captureFormatRef.current;

      return new Promise<WavCallRecordingResult | null>((resolve) => {
        recorder.onstop = async () => {
          const durationSeconds = captureStartedAtRef.current != null
            ? Math.max((performance.now() - captureStartedAtRef.current) / 1000, 0)
            : 0;
          const fallbackMimeType = recorder.mimeType || fallbackFormat.mimeType;
          const blob = new Blob(mediaChunksRef.current, { type: fallbackMimeType });
          const resolvedMimeType = blob.type || fallbackMimeType;
          const resolvedExtension = resolveFileExtensionFromMimeType(resolvedMimeType) || fallbackFormat.fileExtension;

          await cleanup();
          mediaChunksRef.current = [];
          pausedRef.current = false;
          setIsCapturing(false);
          setIsPaused(false);

          resolve({
            blob,
            durationSeconds,
            mimeType: resolvedMimeType,
            fileExtension: resolvedExtension,
          });
        };

        recorder.stop();
      });
    }

    const durationSeconds = recordedSamplesRef.current / Math.max(sampleRateRef.current, 1);
    const mergedSamples = mergeBuffers(chunksRef.current);

    try {
      const blob = encodeMp3(mergedSamples, sampleRateRef.current);

      await cleanup();
      chunksRef.current = [];
      mediaChunksRef.current = [];
      recordedSamplesRef.current = 0;
      pausedRef.current = false;
      setIsCapturing(false);
      setIsPaused(false);

      return {
        blob,
        durationSeconds,
        mimeType: MP3_CAPTURE_FORMAT.mimeType,
        fileExtension: MP3_CAPTURE_FORMAT.fileExtension,
      } satisfies WavCallRecordingResult;
    } catch (encodeError) {
      await cleanup();
      chunksRef.current = [];
      mediaChunksRef.current = [];
      recordedSamplesRef.current = 0;
      pausedRef.current = false;
      setIsCapturing(false);
      setIsPaused(false);

      const message = encodeError instanceof Error
        ? encodeError.message
        : 'Unable to encode the final call recording as MP3.';
      setError(message);
      throw new Error(message);
    }
  }, [cleanup, isCapturing]);

  const discardCapture = useCallback(async () => {
    chunksRef.current = [];
    mediaChunksRef.current = [];
    recordedSamplesRef.current = 0;
    pausedRef.current = false;
    setIsCapturing(false);
    setIsPaused(false);
    await cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  return {
    startCapture,
    stopCapture,
    discardCapture,
    registerPlaybackElement,
    setCapturePaused,
    isCapturing,
    isPaused,
    error,
  };
}
