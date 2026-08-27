import { useState, useRef, useCallback, useEffect } from 'react';
import { saveRecording, listRecordings, deleteRecording as deleteRecordingFromStore, isIndexedDBSupported } from '../utils/recordingStore';

// MediaRecorder's default mimeType (webm/opus) isn't supported on Safari —
// feature-detect a fallback so recording still works there.
function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

export function useQuranRecorder(chapterId) {
  const [isSupported] = useState(
    () => typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && isIndexedDBSupported()
  );
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs]     = useState(0);
  const [recordings, setRecordings]   = useState([]);
  const [error, setError]             = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const streamRef         = useRef(null);
  const startTimeRef      = useRef(0);
  const tickRef           = useRef(null);
  const objectUrlsRef     = useRef(new Map());

  const refreshRecordings = useCallback(async () => {
    if (!isIndexedDBSupported() || !chapterId) return;
    try {
      setRecordings(await listRecordings(chapterId));
    } catch {
      setRecordings([]);
    }
  }, [chapterId]);

  useEffect(() => { refreshRecordings(); }, [refreshRecordings]);

  const startRecording = useCallback(async (fromV, toV) => {
    if (!isSupported) { setError('Recording is not supported in this browser'); return; }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const durationMs = Date.now() - startTimeRef.current;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        try {
          await saveRecording({ chapterId, fromV, toV, blob, durationMs });
          await refreshRecordings();
        } catch {
          setError('Could not save the recording');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setElapsedMs(0);
      tickRef.current = setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 200);
    } catch {
      setError('Microphone access was denied or is unavailable');
    }
  }, [isSupported, chapterId, refreshRecordings]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const getPlaybackUrl = useCallback((recording) => {
    if (objectUrlsRef.current.has(recording.id)) return objectUrlsRef.current.get(recording.id);
    const url = URL.createObjectURL(recording.blob);
    objectUrlsRef.current.set(recording.id, url);
    return url;
  }, []);

  const removeRecording = useCallback(async (id) => {
    const url = objectUrlsRef.current.get(id);
    if (url) { URL.revokeObjectURL(url); objectUrlsRef.current.delete(id); }
    await deleteRecordingFromStore(id);
    await refreshRecordings();
  }, [refreshRecordings]);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  return {
    isSupported, isRecording, elapsedMs, recordings, error,
    startRecording, stopRecording, getPlaybackUrl, removeRecording,
  };
}
