export const BROWSER_TTS_UNSUPPORTED_MESSAGE =
  'Text-to-speech is not supported in this browser. Please use Chrome or Edge.';

export type BrowserTtsSpeakOptions = {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceName?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
};

class BrowserTtsService {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

  isSupported() {
    return (
      typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && 'SpeechSynthesisUtterance' in window
    );
  }

  async getVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!this.isSupported()) {
      return [];
    }

    const availableVoices = window.speechSynthesis.getVoices();
    if (availableVoices.length > 0) {
      return availableVoices;
    }

    if (!this.voicesPromise) {
      this.voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          resolve(window.speechSynthesis.getVoices());
        }, 1000);

        const handleVoicesChanged = () => {
          window.clearTimeout(timeoutId);
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
          resolve(window.speechSynthesis.getVoices());
        };

        window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
      }).finally(() => {
        this.voicesPromise = null;
      });
    }

    return this.voicesPromise;
  }

  async speak(text: string, options: BrowserTtsSpeakOptions = {}) {
    if (!this.isSupported()) {
      const error = new Error(BROWSER_TTS_UNSUPPORTED_MESSAGE);
      options.onError?.(error);
      throw error;
    }

    const normalizedText = text.trim();
    if (!normalizedText) {
      options.onEnd?.();
      return;
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(normalizedText);
    const voices = await this.getVoices();
    const selectedVoice = this.pickVoice(voices, options.voiceName, options.lang);

    utterance.lang = selectedVoice?.lang || options.lang || 'en-US';
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    this.currentUtterance = utterance;

    await new Promise<void>((resolve, reject) => {
      utterance.onstart = () => {
        options.onStart?.();
      };
      utterance.onend = () => {
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        options.onEnd?.();
        resolve();
      };
      utterance.onerror = (event) => {
        const error = new Error(event.error || 'Browser speech synthesis failed.');
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        options.onError?.(error);
        reject(error);
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  pause() {
    if (!this.isSupported()) {
      return;
    }
    window.speechSynthesis.pause();
  }

  resume() {
    if (!this.isSupported()) {
      return;
    }
    window.speechSynthesis.resume();
  }

  stop() {
    if (!this.isSupported()) {
      this.currentUtterance = null;
      return;
    }
    window.speechSynthesis.cancel();
    this.currentUtterance = null;
  }

  private pickVoice(
    voices: SpeechSynthesisVoice[],
    voiceName?: string | null,
    lang?: string,
  ) {
    const normalizedVoiceName = (voiceName || '').trim().toLowerCase();
    if (normalizedVoiceName) {
      const matchedVoice = voices.find((voice) => voice.name.trim().toLowerCase() === normalizedVoiceName);
      if (matchedVoice) {
        return matchedVoice;
      }
    }

    const normalizedLang = (lang || '').trim().toLowerCase();
    if (normalizedLang) {
      const exactLangVoice = voices.find((voice) => voice.lang.trim().toLowerCase() === normalizedLang);
      if (exactLangVoice) {
        return exactLangVoice;
      }

      const sameLanguageVoice = voices.find((voice) => {
        const voiceLang = voice.lang.trim().toLowerCase();
        return voiceLang === normalizedLang || voiceLang.startsWith(`${normalizedLang.split('-')[0]}-`);
      });
      if (sameLanguageVoice) {
        return sameLanguageVoice;
      }
    }

    return voices.find((voice) => voice.default) || voices[0] || null;
  }
}

export const browserTtsService = new BrowserTtsService();
