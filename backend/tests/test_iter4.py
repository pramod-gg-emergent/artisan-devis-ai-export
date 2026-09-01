"""Iteration 4 backend tests: dispatch-answers, edit-voice, TVA guard, email label."""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module", autouse=True)
def _seed():
    r = requests.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200


def _create_quote(lines, email="delivered@resend.dev", nom="TEST Iter4"):
    payload = {
        "client": {"nom": nom, "email": email, "telephone": "0102030405",
                   "adresse": "1 rue test 69000 Lyon"},
        "description": "test iter4",
        "lignes": lines,
    }
    r = requests.post(f"{API}/quotes", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# --- dispatch-answers ---
def test_dispatch_answers_distributes():
    qs = [
        "Quelle est la surface totale des murs à peindre en m² ?",
        "Combien de fissures faut-il reboucher ?",
        "Faut-il peindre également le plafond ?",
    ]
    tr = "les murs font 57 m², 4 fissures, on ne peint pas le plafond"
    r = requests.post(f"{API}/dispatch-answers", json={"questions": qs, "transcript": tr}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "answers" in data
    ans = data["answers"]
    # all three keys populated
    assert "57" in (ans.get("0") or "")
    assert "4" in (ans.get("1") or "")
    a2 = (ans.get("2") or "").lower()
    assert any(w in a2 for w in ("non", "pas", "aucun"))


# --- edit-voice: modify + add ---
def test_edit_voice_modify_and_add():
    lignes = [
        {"id": "L1", "designation": "Peinture murs 2 couches", "quantite": 30, "unite": "m²",
         "prix_unitaire_ht": 12.5, "tva": 10, "source": "catalogue", "catalog_code": "PEINT-01"},
        {"id": "L2", "designation": "Plinthes", "quantite": 8, "unite": "ml",
         "prix_unitaire_ht": 14, "tva": 10, "source": "catalogue", "catalog_code": "PLINT-01"},
    ]
    tr = "Passe la peinture à 15 euros le mètre carré et ajoute 50 euros de déplacement"
    r = requests.post(f"{API}/edit-voice", json={"lignes": lignes, "transcript": tr}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["intent"] == "edit"
    assert isinstance(d["changes"], list) and len(d["changes"]) >= 1
    out = d["lignes"]
    peinture = next((l for l in out if "peinture" in l["designation"].lower()), None)
    assert peinture is not None
    assert peinture["prix_unitaire_ht"] == 15
    assert peinture["id"] == "L1"  # id preserved
    depl = next((l for l in out if "déplacement" in l["designation"].lower() or "deplacement" in l["designation"].lower()), None)
    assert depl is not None, f"no déplacement line: {out}"
    assert float(depl["prix_unitaire_ht"]) == 50 or float(depl["quantite"]) * float(depl["prix_unitaire_ht"]) == 50
    assert depl.get("tva") is None
    assert "totaux" in d


def test_edit_voice_delete():
    lignes = [
        {"id": "L1", "designation": "Peinture murs", "quantite": 30, "unite": "m²",
         "prix_unitaire_ht": 12.5, "tva": 10, "source": "catalogue", "catalog_code": "PEINT-01"},
        {"id": "L2", "designation": "Fourniture et pose de plinthes", "quantite": 8, "unite": "ml",
         "prix_unitaire_ht": 14, "tva": 10, "source": "catalogue", "catalog_code": "PLINT-01"},
    ]
    r = requests.post(f"{API}/edit-voice",
                      json={"lignes": lignes, "transcript": "supprime la ligne plinthes"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["intent"] == "edit"
    assert all("plinthes" not in l["designation"].lower() for l in d["lignes"])
    assert any("peinture" in l["designation"].lower() for l in d["lignes"])


def test_edit_voice_confirm_intent():
    lignes = [{"id": "L1", "designation": "Peinture", "quantite": 30, "unite": "m²",
               "prix_unitaire_ht": 12.5, "tva": 10, "source": "catalogue", "catalog_code": "PEINT-01"}]
    r = requests.post(f"{API}/edit-voice",
                      json={"lignes": lignes, "transcript": "c'est bon valide le devis"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["intent"] == "confirm"
    assert d["confirm_action"] in ("save", "send")
    # lignes not modified
    assert d["lignes"][0]["prix_unitaire_ht"] == 12.5


# --- TVA guard ---
def test_tva_guard_blocks_pdf_send_status():
    q = _create_quote([
        {"designation": "Peinture", "quantite": 10, "unite": "m²",
         "prix_unitaire_ht": 12.5, "tva": None, "source": "manuel"},
    ])
    qid = q["id"]
    msg = "Vérifiez et définissez la TVA avant d'envoyer le devis"

    r = requests.get(f"{API}/quotes/{qid}/pdf", timeout=30)
    assert r.status_code == 400
    assert msg in r.json()["detail"]

    r = requests.post(f"{API}/quotes/{qid}/send-email", json={"app_base_url": BASE_URL}, timeout=30)
    assert r.status_code == 400
    assert msg in r.json()["detail"]

    r = requests.post(f"{API}/quotes/{qid}/status", json={"statut": "envoye"}, timeout=30)
    assert r.status_code == 400
    assert msg in r.json()["detail"]

    # Now set TVA and retry
    put = {"client": q["client"], "description": q["description"],
           "lignes": [{**q["lignes"][0], "tva": 20}]}
    r = requests.put(f"{API}/quotes/{qid}", json=put, timeout=30)
    assert r.status_code == 200

    r = requests.get(f"{API}/quotes/{qid}/pdf", timeout=30)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"

    r = requests.post(f"{API}/quotes/{qid}/status", json={"statut": "envoye"}, timeout=30)
    assert r.status_code == 200

    # cleanup
    requests.post(f"{API}/seed", timeout=30)


# --- Email label + live send ---
def test_email_label_and_live_send():
    from backend import server  # type: ignore
    html = server.build_email_html("Bonjour", {"numero": "TEST-001", "totaux": {"total_ttc": 100}},
                                   {"name": "SOCLE"}, "https://example.com/x")
    assert "Voir et accepter le devis en ligne" in html
    assert "signer" not in html.lower()

    q = _create_quote([
        {"designation": "Peinture", "quantite": 10, "unite": "m²",
         "prix_unitaire_ht": 12.5, "tva": 20, "source": "manuel"},
    ], email="delivered@resend.dev")
    r = requests.post(f"{API}/quotes/{q['id']}/send-email",
                      json={"app_base_url": BASE_URL}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["mode"] == "live"
    assert d["sent"] is True
    requests.post(f"{API}/seed", timeout=30)
