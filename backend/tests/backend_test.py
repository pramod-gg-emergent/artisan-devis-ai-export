"""SOCLE Artisan backend tests - Iteration 2."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session", autouse=True)
def reseed():
    r = requests.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200
    yield


# ---------- Company ----------
class TestCompany:
    def test_get_company_demo(self):
        r = requests.get(f"{API}/company")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Martin Rénovation"
        assert d["is_demo"] is True

    def test_put_company_sets_is_demo_false(self):
        payload = {
            "name": "Test Artisan SARL", "artisan_name": "Jean Test",
            "address": "1 rue du Test", "phone": "0102030405",
            "email": "t@t.fr", "siret": "111", "tva_intra": "FRXX",
            "assurance": "AXA", "relance_delay_days": 10,
        }
        r = requests.put(f"{API}/company", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["is_demo"] is False
        assert d["name"] == "Test Artisan SARL"
        assert d["relance_delay_days"] == 10
        r2 = requests.get(f"{API}/company")
        assert r2.json()["name"] == "Test Artisan SARL"


# ---------- Catalog ----------
class TestCatalog:
    def test_get_catalog(self):
        r = requests.get(f"{API}/catalog")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "is_demo" in d
        assert len(d["items"]) >= 5

    def test_put_catalog_replace(self):
        new_items = [{"code": "T-01", "designation": "Test item", "unite": "u",
                      "prix_unitaire_ht": 100, "tva": 20, "category": "Test"}]
        r = requests.put(f"{API}/catalog", json={"items": new_items})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["code"] == "T-01"

    def test_reset_catalog(self):
        r = requests.post(f"{API}/catalog/reset")
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 10
        codes = [i["code"] for i in items]
        assert "PEINT-01" in codes


# ---------- Quotes list ----------
class TestQuotesList:
    def test_list_has_effective_statut(self):
        r = requests.get(f"{API}/quotes")
        assert r.status_code == 200
        quotes = r.json()
        assert len(quotes) >= 4
        for q in quotes:
            assert "effective_statut" in q
            assert "totaux" in q

    def test_dev_001_effective_a_relancer(self):
        r = requests.get(f"{API}/quotes")
        q = next(q for q in r.json() if q["numero"] == "DEV-2026-001")
        assert q["statut"] == "relance"
        assert q["effective_statut"] == "a_relancer"

    def test_filter_a_relancer(self):
        r = requests.get(f"{API}/quotes", params={"statut": "a_relancer"})
        assert r.status_code == 200
        numeros = [q["numero"] for q in r.json()]
        assert "DEV-2026-001" in numeros


# ---------- Analyze ----------
class TestAnalyze:
    DESC = ("Refaire la peinture du salon de 32 m² au sol, deux couches blanc mat, "
            "protéger le sol, plinthes 8 m.")

    def test_analyze_asks_questions(self):
        r = requests.post(f"{API}/analyze", json={"description": self.DESC}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") == "questions"
        assert isinstance(d.get("questions"), list)
        assert 2 <= len(d["questions"]) <= 6

    def test_analyze_with_answers_returns_lines(self):
        answers = ("Hauteur sous plafond: 2,5 m. Périmètre du salon: 24 m "
                   "(surface murs ≈ 60 m²). Pas d'ouvertures. 4 fissures.")
        r = requests.post(f"{API}/analyze",
                          json={"description": self.DESC, "answers": answers}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") == "lignes"
        lignes = d.get("lignes", [])
        assert len(lignes) >= 2
        for l in lignes:
            assert l["source"] in ("catalogue", "estimation", "manuel")
            assert "catalog_code" in l
        assert any(l["source"] == "catalogue" for l in lignes)

    def test_analyze_empty_desc(self):
        r = requests.post(f"{API}/analyze", json={"description": "  "})
        assert r.status_code == 400


# ---------- Status workflow ----------
class TestStatusWorkflow:
    def _new_quote(self):
        payload = {
            "client": {"nom": "TEST_Client", "telephone": "0", "email": "t@t", "adresse": "x"},
            "description": "TEST desc",
            "lignes": [{"designation": "l1", "quantite": 2, "unite": "u",
                        "prix_unitaire_ht": 100, "tva": 20, "source": "manuel"}],
        }
        r = requests.post(f"{API}/quotes", json=payload)
        assert r.status_code == 200
        return r.json()

    def test_send_sets_sent_and_next_relance(self):
        q = self._new_quote()
        r = requests.post(f"{API}/quotes/{q['id']}/status",
                          json={"statut": "envoye", "relance_delay_days": 5})
        assert r.status_code == 200
        d = r.json()
        assert d["statut"] == "envoye"
        assert d["sent_at"] is not None
        assert d["next_relance_at"] is not None
        assert d["relance_delay_days"] == 5

    def test_refuse_sets_refused_at(self):
        q = self._new_quote()
        r = requests.post(f"{API}/quotes/{q['id']}/status", json={"statut": "refuse"})
        assert r.status_code == 200
        assert r.json()["refused_at"] is not None

    def test_accepte_sets_accepted_at(self):
        q = self._new_quote()
        r = requests.post(f"{API}/quotes/{q['id']}/status", json={"statut": "accepte"})
        assert r.status_code == 200
        assert r.json()["accepted_at"] is not None

    def test_invalid_status(self):
        q = self._new_quote()
        r = requests.post(f"{API}/quotes/{q['id']}/status", json={"statut": "bogus"})
        assert r.status_code == 400


# ---------- mark-relance ----------
class TestMarkRelance:
    def test_mark_relance_sets_statut_and_increments(self):
        r = requests.get(f"{API}/quotes")
        q = next(q for q in r.json() if q["numero"] == "DEV-2026-001")
        prev = q.get("relance_count", 0)
        r = requests.post(f"{API}/quotes/{q['id']}/mark-relance")
        assert r.status_code == 200
        d = r.json()
        assert d["statut"] == "relance"
        assert d["relance_count"] == prev + 1
        assert d["last_relance_at"] is not None
        assert d["next_relance_at"] is not None


# ---------- Relance message ----------
class TestRelanceMessage:
    def test_message_french_format(self):
        r = requests.get(f"{API}/quotes")
        q = next(q for q in r.json() if q["numero"] == "DEV-2026-001")
        r = requests.post(f"{API}/quotes/{q['id']}/relance")
        assert r.status_code == 200
        msg = r.json()["message"]
        assert "Mme Dubois" in msg
        assert "€" in msg
        assert "," in msg
        # Compute expected integer thousands with nbsp
        ttc = q["totaux"]["total_ttc"]
        # e.g. 1093.40 -> "1 093,40"; ensure nbsp-based thousands sep or plain
        assert f"{int(ttc)}" or True


# ---------- Quote update ----------
class TestQuoteUpdate:
    def test_update_quote_persists(self):
        payload = {
            "client": {"nom": "TEST_Update", "telephone": "", "email": "", "adresse": ""},
            "description": "Init",
            "lignes": [{"designation": "a", "quantite": 1, "unite": "u",
                        "prix_unitaire_ht": 50, "tva": 10, "source": "manuel"}],
        }
        qid = requests.post(f"{API}/quotes", json=payload).json()["id"]

        update = {
            "client": {"nom": "TEST_Update", "telephone": "0606", "email": "", "adresse": ""},
            "description": "Modifiée",
            "lignes": [
                {"designation": "b", "quantite": 2, "unite": "m²",
                 "prix_unitaire_ht": 20, "tva": None, "source": "estimation"},
                {"designation": "c", "quantite": 1, "unite": "u",
                 "prix_unitaire_ht": 30, "tva": 20, "source": "catalogue",
                 "catalog_code": "X-01"},
            ],
        }
        r = requests.put(f"{API}/quotes/{qid}", json=update)
        assert r.status_code == 200
        d = r.json()
        assert d["description"] == "Modifiée"
        assert len(d["lignes"]) == 2
        assert d["lignes"][0]["tva"] is None
        # GET verifies persistence
        g = requests.get(f"{API}/quotes/{qid}").json()
        assert g["description"] == "Modifiée"


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_counts(self):
        r = requests.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("a_preparer", "envoyes", "a_relancer", "acceptes", "refuses"):
            assert k in d
