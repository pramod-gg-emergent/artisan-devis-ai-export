import { useRef, useState, useCallback } from "react";
import { API } from "@/lib/apiClient";

// Dictation hook. Prefers the browser Web Speech API (live streaming);
// falls back to MediaRecorder + Emergent-managed Whisper STT (batch) when unavailable.
export function useDictation() {
  const recRef = useRef(null);
  const finalRef = useRef("");
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const liveRef = useRef(null);
  const doneRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const SR =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasMR =
    typeof window !== "undefined" &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    typeof window.MediaRecorder !== "undefined";
  const mode = SR ? "speech" : hasMR ? "whisper" : null;
  const supported = !!mode;

  const start = useCallback(
    (base = "", onLive, onDone) => {
      liveRef.current = onLive;
      doneRef.current = onDone;
      finalRef.current = base ? base + " " : "";

      if (SR) {
        const rec = new SR();
        rec.lang = "fr-FR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalRef.current += r[0].transcript + " ";
            else interim += r[0].transcript;
          }
          onLive && onLive((finalRef.current + interim).trim());
        };
        rec.onend = () => {
          setListening(false);
          onDone && onDone(finalRef.current.trim());
        };
        rec.onerror = () => setListening(false);
        recRef.current = rec;
        try {
          rec.start();
          setListening(true);
        } catch {
          setListening(false);
        }
        return;
      }

      if (hasMR) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            streamRef.current = stream;
            chunksRef.current = [];
            const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
            const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            mr.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };
            mr.onstop = async () => {
              setListening(false);
              const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
              streamRef.current && streamRef.current.getTracks().forEach((t) => t.stop());
              if (!blob.size) return;
              setTranscribing(true);
              try {
                const fd = new FormData();
                fd.append("file", blob, "audio.webm");
                const res = await fetch(`${API}/transcribe`, { method: "POST", body: fd });
                const data = await res.json();
                const text = ((finalRef.current || "") + " " + (data.text || "")).trim();
                liveRef.current && liveRef.current(text);
                doneRef.current && doneRef.current(text);
              } catch {
                /* ignore transcription errors */
              } finally {
                setTranscribing(false);
              }
            };
            mrRef.current = mr;
            mr.start();
            setListening(true);
          })
          .catch(() => setListening(false));
      }
    },
    [SR, hasMR]
  );

  const stop = useCallback(() => {
    if (recRef.current && SR) {
      try { recRef.current.stop(); } catch {}
    } else if (mrRef.current) {
      try { if (mrRef.current.state !== "inactive") mrRef.current.stop(); } catch {}
    }
    setListening(false);
    return finalRef.current.trim();
  }, [SR]);

  return { supported, mode, listening, transcribing, start, stop };
}

export default useDictation;
