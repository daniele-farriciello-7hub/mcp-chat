'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useClientValue } from '@/shared/useClientValue';

const getRecognitionClass = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const isSpeechRecognitionSupported = () => Boolean(getRecognitionClass());

/**
 * Italian dictation through the Web Speech API, where the browser offers it. Interim results are
 * rewritten on top of the confirmed text; `onTranscript` receives the full text to show.
 */
export function useVoiceInput({ onTranscript }) {
  const supported = useClientValue(isSpeechRecognitionSupported, false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const confirmedTextRef = useRef('');
  // stop() is not immediate: one last onresult arrives afterwards. After a send it must be ignored,
  // or it writes the tail of the sentence back into the now empty input. After a plain stop it must
  // arrive, because it holds the text to review.
  const sentRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const Recognition = getRecognitionClass();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = 'it-IT';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = event => {
      if (sentRef.current) return;
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) {
        confirmedTextRef.current = `${confirmedTextRef.current}${finalText}`.replace(/\s+/g, ' ').trimStart();
      }
      onTranscriptRef.current((confirmedTextRef.current + interimText).trimStart());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
    };
  }, []);

  /** Starts listening, appending to `currentText`, or stops if already listening. */
  const toggle = useCallback(
    currentText => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      if (listening) {
        recognition.stop();
        return;
      }
      confirmedTextRef.current = currentText ? `${currentText} ` : '';
      sentRef.current = false;
      try {
        recognition.start();
        setListening(true);
      } catch {
        // already listening
      }
    },
    [listening]
  );

  /** Stops listening because the message was sent: the trailing result is discarded. */
  const stopForSend = useCallback(() => {
    confirmedTextRef.current = '';
    if (!listening) return;
    sentRef.current = true;
    recognitionRef.current?.stop();
  }, [listening]);

  /** Keeps dictation in sync when the operator edits the text by hand. */
  const setConfirmedText = useCallback(text => {
    confirmedTextRef.current = text;
  }, []);

  return { supported, listening, toggle, stopForSend, setConfirmedText };
}
