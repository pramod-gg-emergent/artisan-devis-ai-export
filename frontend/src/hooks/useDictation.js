import { useRef, useState, useCallback } from "react";
import { API } from "@/lib/apiClient";

// Dictation hook — MediaRecorder + Emergent-managed Whisper STT ONLY.
// Web Speech API removed entirely (unreliable / auto-stops on mobile).
// Recording stays active until the user explicitly calls stop().

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (e) {
      console.error("[useDictation] isTypeSupported check failed for", m, e);
    }
  }
  return "";
}

function extFromMime(mime) {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function useDictation() {
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const baseRef = useRef("");
  const liveRef = useRef(null);
  const doneRef = useRef(null);

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const supported =
    typeof navigator !== "undefined" &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined";

  const start = useCallback(
    async (base = "", onLive, onDone) => {
      if (!supported) {
        console.error("[useDictation] MediaRecorder/getUserMedia not supported on this browser");
        return;
      }
      baseRef.current = base ? base + " " : "";
      liveRef.current = onLive;
      doneRef.current = onDone;
      chunksRef.current = [];

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("[useDictation] getUserMedia OK");
      } catch (e) {
        console.error("[useDictation] getUserMedia failed:", e);
        setListening(false);
        return;
      }
      streamRef.current = stream;

      const mimeType = pickMimeType();
      let mr;
      try {
        mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        console.log("[useDictation] MediaRecorder created, mimeType:", mr.mimeType || "(default)");
      } catch (e) {
        console.error("[useDictation] MediaRecorder creation failed:", e);
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        return;
      }

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onerror = (e) => console.error("[useDictation] MediaRecorder error:", e.error || e);
      mr.onstop = async () => {
        console.log("[useDictation] recorder stopped");
        const type = mr.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        console.log("[useDictation] blob size/type:", blob.size, blob.type);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (!blob.size) {
          console.error("[useDictation] empty audio blob — nothing to transcribe");
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, `audio.${extFromMime(type)}`);
          console.log("[useDictation] POST /api/transcribe →", `${API}/transcribe`);
          const res = await fetch(`${API}/transcribe`, { method: "POST", body: fd });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error("[useDictation] transcribe HTTP error:", res.status, txt);
            return;
          }
          const data = await res.json();
          console.log("[useDictation] transcription received:", data && data.text);
          const text = ((baseRef.current || "") + (data.text || "")).trim();
          liveRef.current && liveRef.current(text);
          doneRef.current && doneRef.current(text);
        } catch (e) {
          console.error("[useDictation] transcribe request failed:", e);
        } finally {
          setTranscribing(false);
        }
      };

      mrRef.current = mr;
      try {
        mr.start(); // no timeslice: single blob on stop, keeps recording until stop()
        setListening(true);
        console.log("[useDictation] recorder started");
      } catch (e) {
        console.error("[useDictation] recorder start failed:", e);
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
      }
    },
    [supported]
  );

  const stop = useCallback(() => {
    const mr = mrRef.current;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch (e) {
        console.error("[useDictation] recorder stop failed:", e);
      }
    }
    setListening(false);
    return (baseRef.current || "").trim();
  }, []);

  return { supported, mode: "whisper", listening, transcribing, start, stop };
}

export default useDictation;
