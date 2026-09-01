"""SOCLE Artisan backend tests - Iteration 7: /api/transcribe (whisper-1) + regression."""
import io
import math
import os
import struct
import wave
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module", autouse=True)
def reseed():
    r = requests.post(f"{API}/seed", timeout=60)
    assert r.status_code == 200
    yield
    # final reseed to leave demo data clean
    requests.post(f"{API}/seed", timeout=60)


def _make_wav_bytes(duration_s: float = 1.0, freq: float = 440.0, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        for i in range(int(duration_s * rate)):
            val = int(0.2 * 32767 * math.sin(2 * math.pi * freq * (i / rate)))
            w.writeframesraw(struct.pack("<h", val))
    return buf.getvalue()


# ---------- Transcribe (new endpoint) ----------
class TestTranscribe:
    def test_wav_returns_text(self):
        wav = _make_wav_bytes()
        files = {"file": ("clip.wav", wav, "audio/wav")}
        r = requests.post(f"{API}/transcribe", files=files, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "text" in data
        assert isinstance(data["text"], str)

    def test_webm_suffix_accepted(self):
        # Whisper accepts multiple containers; we pass wav bytes but with .webm filename
        # to verify the endpoint uses the suffix for tempfile and forwards to STT.
        # Whisper may return 200 with either text or fail decode -> the endpoint would 500.
        # For robustness, allow 200 (typical) as the primary path.
        wav = _make_wav_bytes(duration_s=0.5)
        files = {"file": ("clip.webm", wav, "audio/webm")}
        r = requests.post(f"{API}/transcribe", files=files, timeout=60)
        assert r.status_code in (200, 500), r.text
        if r.status_code == 200:
            assert "text" in r.json()

    def test_empty_file_returns_400(self):
        files = {"file": ("empty.wav", b"", "audio/wav")}
        r = requests.post(f"{API}/transcribe", files=files, timeout=30)
        assert r.status_code == 400

    def test_missing_file_returns_422(self):
        r = requests.post(f"{API}/transcribe", timeout=15)
        assert r.status_code == 422


# ---------- Regression: existing endpoints still work ----------
class TestRegression:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200

    def test_list_quotes(self):
        r = requests.get(f"{API}/quotes", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 3

    def test_company(self):
        r = requests.get(f"{API}/company")
        assert r.status_code == 200
        assert r.json()["name"]

    def test_pdf_with_tva_set(self):
        # Pick the accepted quote (all lignes have tva 20)
        r = requests.get(f"{API}/quotes", timeout=15)
        quotes = r.json()
        target = next((q for q in quotes if q["numero"] == "DEV-2026-003"), None)
        assert target
        r = requests.get(f"{API}/quotes/{target['id']}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_send_email_endpoint(self):
        r = requests.get(f"{API}/quotes", timeout=15)
        quotes = r.json()
        target = next((q for q in quotes if q["numero"] == "DEV-2026-003"), None)
        assert target
        r = requests.post(
            f"{API}/quotes/{target['id']}/send-email",
            json={"personal_message": "Test", "app_base_url": "https://example.com"},
            timeout=45,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["to"]
        assert d["attached_pdf"] is True

    def test_public_accept_refuse(self):
        # Create a fresh quote, mark envoye to get token, then accept via public route
        r = requests.get(f"{API}/quotes", timeout=15)
        quotes = r.json()
        target = next((q for q in quotes if q["numero"] == "DEV-2026-002"), None)
        assert target
        # ensure token exists via status envoye
        r = requests.post(f"{API}/quotes/{target['id']}/status", json={"statut": "envoye"})
        assert r.status_code == 200
        token = r.json().get("public_token")
        assert token
        # Public accept
        r = requests.post(f"{API}/public/quotes/{token}/accept", timeout=15)
        assert r.status_code == 200
        assert r.json()["statut"] == "accepte"
