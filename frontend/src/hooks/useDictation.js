import { useRef, useState, useCallback } from "react";

// Web Speech API dictation hook (fr-FR). Falls back gracefully when unsupported.
export function useDictation() {
  const recRef = useRef(null);
  const finalRef = useRef("");
  const [listening, setListening] = useState(false);
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = !!SR;

  const start = useCallback(
    (base = "", onLive) => {
      if (!SR) return;
      const rec = new SR();
      rec.lang = "fr-FR";
      rec.continuous = true;
      rec.interimResults = true;
      finalRef.current = base ? base + " " : "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalRef.current += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        onLive && onLive((finalRef.current + interim).trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [SR]
  );

  const stop = useCallback(() => {
    try {
      recRef.current && recRef.current.stop();
    } catch {}
    setListening(false);
    return finalRef.current.trim();
  }, []);

  return { supported, listening, start, stop };
}

export default useDictation;
