"""Iteration 3 - PDF, email, public accept/refuse, AI wall+TVA fixes."""
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


@pytest.fixture(scope="module", autouse=True)
def reseed():
    r = requests.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200
    yield


def _all_quotes():
    return requests.get(f"{API}/quotes").json()


def _by_num(n):
    return next(q for q in _all_quotes() if q["numero"] == n)


# ---------- PDF ----------
class TestPDF:
    def test_pdf_returned(self):
        q = _by_num("DEV-2026-002")
        r = requests.get(f"{API}/quotes/{q['id']}/pdf")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 2000

    def test_pdf_404(self):
        r = requests.get(f"{API}/quotes/does-not-exist/pdf")
        assert r.status_code == 404


# ---------- Email preview ----------
class TestEmailPreview:
    def test_preview_with_email(self):
        q = _by_num("DEV-2026-004")  # brouillon with client email
        r = requests.get(f"{API}/quotes/{q['id']}/email-preview")
        assert r.status_code == 200
        d = r.json()
        assert d["has_email"] is True
        assert d["to"] == q["client"]["email"]
        assert d["subject"].startswith(f"Devis {q['numero']}")
        assert "Bonjour" in d["default_message"]
        assert d["email_configured"] in (True, False)


# ---------- Send email ----------
class TestSendEmail:
    def _create_quote_with_email(self, email):
        payload = {
            "client": {"nom": "TEST_Send", "telephone": "", "email": email, "adresse": ""},
            "description": "TEST send",
            "lignes": [{"designation": "l1", "quantite": 1, "unite": "u",
                        "prix_unitaire_ht": 100, "tva": 20, "source": "manuel"}],
        }
        return requests.post(f"{API}/quotes", json=payload).json()

    def test_send_email_live_to_resend_test(self):
        q = self._create_quote_with_email("delivered@resend.dev")
        r = requests.post(
            f"{API}/quotes/{q['id']}/send-email",
            json={"personal_message": "Bonjour, voici le devis.",
                  "app_base_url": BASE_URL,
                  "relance_delay_days": 5},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mode"] == "live"
        assert d["sent"] is True
        assert d["attached_pdf"] is True
        assert d["public_link"] and "/devis-client/" in d["public_link"]

        # Artisan-side reflects envoye + tokens + dates
        g = requests.get(f"{API}/quotes/{q['id']}").json()
        assert g["statut"] == "envoye"
        assert g["sent_at"] is not None
        assert g["next_relance_at"] is not None
        assert g["public_token"] is not None

    def test_send_email_no_client_email(self):
        payload = {
            "client": {"nom": "TEST_NoMail", "telephone": "", "email": "", "adresse": ""},
            "description": "x",
            "lignes": [{"designation": "l", "quantite": 1, "unite": "u",
                        "prix_unitaire_ht": 10, "tva": 20, "source": "manuel"}],
        }
        q = requests.post(f"{API}/quotes", json=payload).json()
        r = requests.post(f"{API}/quotes/{q['id']}/send-email", json={})
        assert r.status_code == 400


# ---------- Public accept/refuse ----------
class TestPublic:
    def _sent_quote(self):
        payload = {
            "client": {"nom": "TEST_Pub", "telephone": "", "email": "delivered@resend.dev", "adresse": ""},
            "description": "x",
            "lignes": [{"designation": "l", "quantite": 1, "unite": "u",
                        "prix_unitaire_ht": 100, "tva": 20, "source": "manuel"}],
        }
        q = requests.post(f"{API}/quotes", json=payload).json()
        r = requests.post(f"{API}/quotes/{q['id']}/send-email",
                          json={"app_base_url": BASE_URL})
        return q["id"], r.json()["public_link"].rsplit("/", 1)[-1]

    def test_public_get(self):
        qid, tok = self._sent_quote()
        r = requests.get(f"{API}/public/quotes/{tok}")
        assert r.status_code == 200
        d = r.json()
        assert "quote" in d and "company" in d
        assert d["quote"]["id"] == qid
        # PUBLIC_COMPANY_FIELDS only
        assert "relance_delay_days" not in d["company"]
        assert "is_demo" not in d["company"]

    def test_public_get_bad_token(self):
        r = requests.get(f"{API}/public/quotes/nosuchtoken")
        assert r.status_code == 404

    def test_public_accept(self):
        qid, tok = self._sent_quote()
        r = requests.post(f"{API}/public/quotes/{tok}/accept")
        assert r.status_code == 200
        assert r.json()["statut"] == "accepte"
        g = requests.get(f"{API}/quotes/{qid}").json()
        assert g["statut"] == "accepte"
        assert g["accepted_at"] is not None
        assert g["next_relance_at"] is None
        assert g.get("decision_source") == "client"

    def test_public_refuse_with_comment(self):
        qid, tok = self._sent_quote()
        r = requests.post(f"{API}/public/quotes/{tok}/refuse",
                          json={"comment": "Trop cher, merci."})
        assert r.status_code == 200
        g = requests.get(f"{API}/quotes/{qid}").json()
        assert g["statut"] == "refuse"
        assert g["refused_at"] is not None
        assert g["next_relance_at"] is None
        assert g["refus_comment"] == "Trop cher, merci."


# ---------- AI fixes ----------
class TestAIFixes:
    def test_wall_surface_from_height_alone_asks_questions(self):
        desc = "peindre les murs du salon, hauteur sous plafond 2,5 m"
        r = requests.post(f"{API}/analyze", json={"description": desc}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "questions", f"Expected questions, got: {d}"
        joined = " ".join(d["questions"]).lower()
        # Must ask for wall surface, perimeter or dimensions
        assert any(k in joined for k in ("surface", "périmètre", "perimetre", "dimension", "longueur", "largeur")), \
            f"Questions must ask about walls surface/dimensions: {d['questions']}"

    def test_no_default_tva_10_without_context(self):
        # Description with no fiscal context
        desc = "Installer 6 spots LED encastrés dans le plafond du couloir."
        r = requests.post(f"{API}/analyze",
                          json={"description": desc,
                                "answers": "6 spots, plafond en placo, alim déjà existante."},
                          timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        if d["status"] == "questions":
            joined = " ".join(d["questions"]).lower()
            assert "tva" in joined or "logement" in joined or "ancien" in joined
        else:
            lignes = d["lignes"]
            assert lignes
            # Not silently default all lines to 10%
            tvas = [l.get("tva") for l in lignes]
            assert not (all(t == 10 for t in tvas)), \
                f"AI silently defaulted all lines to TVA 10%: {tvas}"
