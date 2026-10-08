'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useClientValue } from '@/shared/useClientValue';

const getRecognitionClass = () => window.SpeechRecognition || window.webkitSpeechRecognition;

const normalize = text =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * The session's recognised segments, in order, merged into one text. Some engines (Chrome on
 * Android/Samsung devices, some Windows setups) deliver the same final segment twice, or make each
 * new segment repeat the previous one ("ciao" → "ciao come stai"): a segment that extends the last
 * one replaces it, one already contained in it is dropped, so no word is ever written twice.
 */
export function mergeSegments(segments) {
  const parts = [];
  for (const raw of segments) {
    const text = raw.trim();
    if (!text) continue;
    const last = parts.at(-1);
    if (last) {
      const previous = normalize(last);
      const current = normalize(text);
      if (current.startsWith(previous)) {
        parts[parts.length - 1] = text;
        continue;
      }
      if (previous.startsWith(current) || previous.endsWith(current)) continue;
    }
    parts.push(text);
  }
  return parts.join(' ');
}
const isSpeechRecognitionSupported = () => Boolean(getRecognitionClass());

/**
 * Italian dictation through the Web Speech API, where the browser offers it. `onTranscript`
 * receives the full text to show: on every result it is rebuilt from scratch — the text there was
 * before dictation started, plus every segment of this session, merged by `mergeSegments` — instead
 * of appending each new final segment. Appending is what wrote words twice on engines that deliver
 * a segment more than once.
 */
export function useVoiceInput({ onTranscript }) {
  const supported = useClientValue(isSpeechRecognitionSupported, false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  // `base`: text before dictation (or as last edited by hand); `from`: first result index of this
  // session still to use — results before a manual edit are already in `base`; `seen`: results
  // received so far
  const sessionRef = useRef({ base: '', from: 0, seen: 0 });
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
      const session = sessionRef.current;
      session.seen = event.results.length;
      const segments = [];
      for (let i = session.from; i < event.results.length; i++) segments.push(event.results[i][0].transcript);
      const text = [session.base.trim(), mergeSegments(segments)].filter(Boolean).join(' ');
      onTranscriptRef.current(text.replace(/\s+/g, ' '));
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
      sessionRef.current = { base: currentText || '', from: 0, seen: 0 };
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
    sessionRef.current = { base: '', from: 0, seen: 0 };
    if (!listening) return;
    sentRef.current = true;
    recognitionRef.current?.stop();
  }, [listening]);

  /** Keeps dictation in sync when the operator edits the text by hand. */
  const setConfirmedText = useCallback(text => {
    const session = sessionRef.current;
    // the hand-edited text already holds everything recognised so far: only later results are added
    sessionRef.current = { base: text, from: session.seen, seen: session.seen };
  }, []);

  return { supported, listening, toggle, stopForSend, setConfirmedText };
}
