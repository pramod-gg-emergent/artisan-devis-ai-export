"""Backend API tests for SOCLE Artisan – Assistant Devis IA."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend env
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ---- Health & seed
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_company(s):
    r = s.get(f"{API}/company")
    assert r.status_code == 200
    assert r.json()["name"] == "Martin Rénovation"


# ---- Dashboard stats
def test_dashboard_stats(s):
    r = s.get(f"{API}/dashboard/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ("a_preparer", "envoyes", "a_relancer", "acceptes",
              "ca_potentiel", "ca_accepte", "relance_total",
              "temps_gagne_min", "total_devis"):
        assert k in d
    assert d["total_devis"] >= 4


# ---- Quotes listing & filter
def test_list_quotes_all(s):
    r = s.get(f"{API}/quotes")
    assert r.status_code == 200
    quotes = r.json()
    assert len(quotes) >= 4
    numeros = {q["numero"] for q in quotes}
    for n in ("DEV-2026-001", "DEV-2026-002", "DEV-2026-003", "DEV-2026-004"):
        assert n in numeros


@pytest.mark.parametrize("statut", ["brouillon", "envoye", "a_relancer", "accepte"])
def test_list_quotes_filter(s, statut):
    r = s.get(f"{API}/quotes", params={"statut": statut})
    assert r.status_code == 200
    for q in r.json():
        assert q["statut"] == statut


# ---- Get single quote with totaux
def test_get_quote_totaux(s):
    quotes = s.get(f"{API}/quotes").json()
    qid = quotes[0]["id"]
    r = s.get(f"{API}/quotes/{qid}")
    assert r.status_code == 200
    q = r.json()
    assert "totaux" in q
    t = q["totaux"]
    assert set(t.keys()) == {"total_ht", "total_tva", "total_ttc"}
    # verify math
    expected_ht = round(sum(l["quantite"] * l["prix_unitaire_ht"] for l in q["lignes"]), 2)
    assert abs(t["total_ht"] - expected_ht) < 0.01


def test_get_quote_404(s):
    r = s.get(f"{API}/quotes/nope-xxxx")
    assert r.status_code == 404


# ---- AI analyze (real LLM)
def test_analyze_ai(s):
    desc = ("Chez Mme Dubois à Agen, refaire la peinture du salon de 32 m², "
            "deux couches blanc mat, protéger le sol, reboucher les fissures et "
            "remplacer 8 mètres de plinthes.")
    r = s.post(f"{API}/analyze", json={"description": desc}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "lignes" in data and "totaux" in data
    assert isinstance(data["lignes"], list) and len(data["lignes"]) >= 2
    for l in data["lignes"]:
        for k in ("designation", "quantite", "unite", "prix_unitaire_ht", "tva"):
            assert k in l
        assert isinstance(l["quantite"], (int, float))
        assert isinstance(l["prix_unitaire_ht"], (int, float))
    assert data["totaux"]["total_ttc"] > 0


def test_analyze_empty(s):
    r = s.post(f"{API}/analyze", json={"description": "  "})
    assert r.status_code == 400


# ---- CRUD quotes
def test_create_update_status_relance_flow(s):
    payload = {
        "client": {"nom": "TEST_Client", "telephone": "0600000000",
                   "email": "test@example.com", "adresse": "1 rue test"},
        "description": "TEST desc",
        "lignes": [
            {"designation": "Prestation A", "quantite": 2, "unite": "u",
             "prix_unitaire_ht": 100, "tva": 20},
        ],
    }
    r = s.post(f"{API}/quotes", json=payload)
    assert r.status_code == 200, r.text
    q = r.json()
    qid = q["id"]
    assert q["numero"].startswith("DEV-")
    assert q["statut"] == "brouillon"
    assert q["totaux"]["total_ht"] == 200.0
    assert q["totaux"]["total_ttc"] == 240.0

    # Verify GET after create
    g = s.get(f"{API}/quotes/{qid}").json()
    assert g["client"]["nom"] == "TEST_Client"

    # Update
    payload["client"]["nom"] = "TEST_Client_Updated"
    payload["lignes"].append({"designation": "Prestation B", "quantite": 1,
                              "unite": "u", "prix_unitaire_ht": 50, "tva": 10})
    r = s.put(f"{API}/quotes/{qid}", json=payload)
    assert r.status_code == 200
    upd = r.json()
    assert upd["client"]["nom"] == "TEST_Client_Updated"
    assert len(upd["lignes"]) == 2
    assert upd["totaux"]["total_ht"] == 250.0

    # Set status envoye
    r = s.post(f"{API}/quotes/{qid}/status", json={"statut": "envoye"})
    assert r.status_code == 200
    j = r.json()
    assert j["statut"] == "envoye"
    assert j["sent_at"] is not None

    # Relance message
    r = s.post(f"{API}/quotes/{qid}/relance")
    assert r.status_code == 200
    msg = r.json()["message"]
    assert "Bonjour" in msg
    assert j["numero"] in msg

    # Mark relance
    r = s.post(f"{API}/quotes/{qid}/mark-relance")
    assert r.status_code == 200
    j2 = r.json()
    assert j2["statut"] == "a_relancer"
    assert j2["relance_count"] == 1

    # Accept
    r = s.post(f"{API}/quotes/{qid}/status", json={"statut": "accepte"})
    assert r.status_code == 200
    assert r.json()["accepted_at"] is not None

    # Invalid status
    r = s.post(f"{API}/quotes/{qid}/status", json={"statut": "bad"})
    assert r.status_code == 400
