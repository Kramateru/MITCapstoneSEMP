'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface WavCallRecordingResult {
  blob: Blob;
  durationSeconds: number;
  mimeType: 'audio/wav';
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

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

export function useWavCallRecorder() {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixGainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playbackSourcesRef = useRef<Map<HTMLMediaElement, MediaElementAudioSourceNode>>(new Map());
  const sampleRateRef = useRef(44100);
  const chunksRef = useRef<Float32Array[]>([]);
  const recordedSamplesRef = useRef(0);
  const pausedRef = useRef(false);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(async () => {
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const startCapture = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    try {
      setError(null);
      chunksRef.current = [];
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
      const source = audioContext.createMediaStreamSource(stream);
      const mixGain = audioContext.createGain();
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

      source.connect(mixGain);
      mixGain.connect(processor);
      processor.connect(monitorGain);
      monitorGain.connect(audioContext.destination);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      mixGainRef.current = mixGain;
      processorRef.current = processor;
      gainRef.current = monitorGain;
      sampleRateRef.current = audioContext.sampleRate || 44100;
      setIsCapturing(true);
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : 'Unable to start the call recorder.';
      setError(message);
      await cleanup();
      setIsCapturing(false);
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
    } catch (error) {
      console.error('Unable to register playback audio for mixed recording.', error);
      return false;
    }
  }, []);

  const setCapturePaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
    setIsPaused(paused);
  }, []);

  const stopCapture = useCallback(async () => {
    if (!isCapturing) {
      return null;
    }

    const durationSeconds = recordedSamplesRef.current / Math.max(sampleRateRef.current, 1);
    const mergedSamples = mergeBuffers(chunksRef.current);
    const blob = encodeWav(mergedSamples, sampleRateRef.current);

    await cleanup();
    chunksRef.current = [];
    recordedSamplesRef.current = 0;
    pausedRef.current = false;
    setIsCapturing(false);
    setIsPaused(false);

    return {
      blob,
      durationSeconds,
      mimeType: 'audio/wav' as const,
    } satisfies WavCallRecordingResult;
  }, [cleanup, isCapturing]);

  const discardCapture = useCallback(async () => {
    chunksRef.current = [];
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
