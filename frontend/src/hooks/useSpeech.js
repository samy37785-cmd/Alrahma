import { useCallback } from 'react';

// Browser Speech Recognition (Chrome/Edge expose webkitSpeechRecognition).
const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function useSpeech() {
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const sttSupported = !!SpeechRecognition;

  // Speak `text` in the given language/accent (e.g. 'ar-SA' or 'it-IT').
  const speak = useCallback(
    (text, lang = 'ar-SA', rate = 0.85) => {
      if (!ttsSupported) return;
      window.speechSynthesis.cancel(); // stop anything currently speaking
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    },
    [ttsSupported]
  );

  // Listen once and resolve with the recognized transcript.
  const listen = useCallback(
    (lang = 'ar-SA') =>
      new Promise((resolve, reject) => {
        if (!SpeechRecognition) return reject(new Error('not-supported'));
        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (e) => resolve(e.results[0][0].transcript.trim());
        recognition.onerror = (e) => reject(new Error(e.error));
        recognition.onend = () => {}; // no-op; result/error already handle resolution
        recognition.start();
      }),
    []
  );

  return { speak, listen, ttsSupported, sttSupported };
}
