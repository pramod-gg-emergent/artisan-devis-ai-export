"""Iteration 9: verify /api/transcribe endpoint used by revamped useDictation.js.
Covers: 200 with JSON {text:str} for small wav, 400 empty, 413 >25MB."""
import os
import io
import struct
import wave
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
API = f"{BASE_URL}/api"


def _tiny_wav_bytes(seconds: float = 0.3, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(seconds * rate)
        # near silence
        frames = struct.pack("<" + "h" * n, *([0] * n))
        w.writeframes(frames)
    return buf.getvalue()


class TestTranscribe:
    def test_transcribe_small_wav_ok(self):
        data = _tiny_wav_bytes()
        r = requests.post(
            f"{API}/transcribe",
            files={"file": ("audio.wav", data, "audio/wav")},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "text" in j and isinstance(j["text"], str)

    def test_transcribe_empty_returns_400(self):
        r = requests.post(
            f"{API}/transcribe",
            files={"file": ("audio.webm", b"", "audio/webm")},
            timeout=30,
        )
        assert r.status_code == 400

    def test_transcribe_too_large_returns_413(self):
        # 25MB + 1 byte of zeros
        big = b"\x00" * (25 * 1024 * 1024 + 1)
        r = requests.post(
            f"{API}/transcribe",
            files={"file": ("audio.webm", big, "audio/webm")},
            timeout=120,
        )
        assert r.status_code == 413


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
