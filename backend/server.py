from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage

import io
import base64
import secrets
import ipaddress
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from fastapi import Request
from fastapi.responses import Response

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get('EMERGENT_EMAIL_KEY')
EMAIL_FROM_NAME = os.environ.get('EMAIL_FROM_NAME', 'SOCLE Artisan')
EMAIL_REPLY_TO = os.environ.get('EMAIL_REPLY_TO')

app = FastAPI(title="SOCLE Artisan – Assistant Devis IA")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Stored statuses. "a_relancer" is a *derived* state (échéance atteinte), not stored.
STATUSES = ["brouillon", "envoye", "relance", "accepte", "refuse"]

DEFAULT_COMPANY = {
    "key": "company",
    "name": "Martin Rénovation",
    "artisan_name": "Martin Dubois",
    "siret": "849 204 112 00018",
    "address": "14 Rue des Artisans, 69003 Lyon",
    "phone": "06 12 34 56 78",
    "email": "contact@martin-renovation.fr",
    "assurance": "MAAF Décennale N° 98234102-B",
    "tva_intra": "FR 76 849204112",
    "relance_delay_days": 7,
    "is_demo": True,
}

DEMO_CATALOG = [
    {"code": "PROT-01", "designation": "Protection du sol et du mobilier", "unite": "forfait", "prix_unitaire_ht": 85, "tva": 10, "category": "Préparation"},
    {"code": "PREP-01", "designation": "Préparation des supports (ponçage, lessivage)", "unite": "m²", "prix_unitaire_ht": 6.5, "tva": 10, "category": "Préparation"},
    {"code": "FISS-01", "designation": "Rebouchage et traitement de fissure", "unite": "u", "prix_unitaire_ht": 18, "tva": 10, "category": "Préparation"},
    {"code": "PEINT-01", "designation": "Peinture murs 2 couches (acrylique)", "unite": "m²", "prix_unitaire_ht": 12.5, "tva": 10, "category": "Peinture"},
    {"code": "PEINT-02", "designation": "Peinture plafond 2 couches", "unite": "m²", "prix_unitaire_ht": 14, "tva": 10, "category": "Peinture"},
    {"code": "PLINT-01", "designation": "Fourniture et pose de plinthes", "unite": "ml", "prix_unitaire_ht": 14, "tva": 10, "category": "Menuiserie"},
    {"code": "PLINT-02", "designation": "Dépose de plinthes existantes", "unite": "ml", "prix_unitaire_ht": 4.5, "tva": 10, "category": "Menuiserie"},
    {"code": "DEPOSE-01", "designation": "Dépose et évacuation ancien revêtement", "unite": "m²", "prix_unitaire_ht": 22, "tva": 10, "category": "Démolition"},
    {"code": "CARR-01", "designation": "Pose faïence murale", "unite": "m²", "prix_unitaire_ht": 55, "tva": 10, "category": "Carrelage"},
    {"code": "CARR-02", "designation": "Pose carrelage au sol", "unite": "m²", "prix_unitaire_ht": 60, "tva": 10, "category": "Carrelage"},
    {"code": "PARQ-01", "designation": "Fourniture et pose parquet flottant", "unite": "m²", "prix_unitaire_ht": 56, "tva": 10, "category": "Sol"},
    {"code": "MO-01", "designation": "Main d'œuvre (taux horaire)", "unite": "h", "prix_unitaire_ht": 45, "tva": 10, "category": "Main d'œuvre"},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def fmt_eur(v: float) -> str:
    s = f"{float(v or 0):,.2f}"
    s = s.replace(",", "\u00a0").replace(".", ",")
    return f"{s}\u00a0€"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class Client(BaseModel):
    nom: str = ""
    telephone: str = ""
    email: str = ""
    adresse: str = ""


class QuoteLine(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    designation: str
    quantite: float = 1
    unite: str = "u"
    prix_unitaire_ht: float = 0
    tva: Optional[float] = None
    source: str = "manuel"  # catalogue | estimation | manuel
    catalog_code: Optional[str] = None


class Quote(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero: str
    client: Client = Field(default_factory=Client)
    description: str = ""
    lignes: List[QuoteLine] = Field(default_factory=list)
    statut: str = "brouillon"
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    sent_at: Optional[str] = None
    accepted_at: Optional[str] = None
    refused_at: Optional[str] = None
    last_relance_at: Optional[str] = None
    next_relance_at: Optional[str] = None
    relance_count: int = 0
    relance_delay_days: int = 7
    time_saved_min: int = 25
    public_token: Optional[str] = None
    refus_comment: Optional[str] = None


class QuoteUpsert(BaseModel):
    client: Client = Field(default_factory=Client)
    description: str = ""
    lignes: List[QuoteLine] = Field(default_factory=list)


class StatusUpdate(BaseModel):
    statut: str
    relance_delay_days: Optional[int] = None


class AnalyzeRequest(BaseModel):
    description: str
    answers: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: str
    artisan_name: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    siret: str = ""
    tva_intra: str = ""
    assurance: str = ""
    relance_delay_days: int = 7


class CatalogItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str = ""
    designation: str
    unite: str = "u"
    prix_unitaire_ht: float = 0
    tva: float = 10
    category: str = ""


class CatalogUpdate(BaseModel):
    items: List[CatalogItem]


# ---------------------------------------------------------------------------
# Totals & serialization
# ---------------------------------------------------------------------------
def compute_totals(lignes: List[dict]) -> dict:
    total_ht = 0.0
    total_tva = 0.0
    for l in lignes:
        line_ht = float(l.get("quantite", 0) or 0) * float(l.get("prix_unitaire_ht", 0) or 0)
        total_ht += line_ht
        total_tva += line_ht * float(l.get("tva") or 0) / 100.0
    total_ht = round(total_ht, 2)
    total_tva = round(total_tva, 2)
    return {"total_ht": total_ht, "total_tva": total_tva, "total_ttc": round(total_ht + total_tva, 2)}


TVA_UNDEFINED_MSG = "Vérifiez et définissez la TVA avant d'envoyer le devis."


def has_undefined_tva(lignes: List[dict]) -> bool:
    return any(l.get("tva") in (None, "") for l in lignes)


def effective_status(doc: dict) -> str:
    s = doc.get("statut")
    if s in ("envoye", "relance"):
        nr = parse_iso(doc.get("next_relance_at"))
        if nr and nr <= now_utc():
            return "a_relancer"
    return s


def serialize_quote(doc: dict) -> dict:
    doc.pop("_id", None)
    doc["totaux"] = compute_totals(doc.get("lignes", []))
    doc["effective_statut"] = effective_status(doc)
    return doc


async def next_numero() -> str:
    year = now_utc().year
    count = await db.quotes.count_documents({})
    return f"DEV-{year}-{count + 1:03d}"


async def get_company() -> dict:
    doc = await db.settings.find_one({"key": "company"})
    if not doc:
        await db.settings.insert_one(dict(DEFAULT_COMPANY))
        doc = dict(DEFAULT_COMPANY)
    doc.pop("_id", None)
    return doc


async def get_catalog_items() -> List[dict]:
    items = await db.catalog.find({}).to_list(500)
    for i in items:
        i.pop("_id", None)
    return items


# ---------------------------------------------------------------------------
# AI analysis (two-phase: clarifying questions -> priced lines from catalog)
# ---------------------------------------------------------------------------
def build_ai_system(catalog: List[dict]) -> str:
    cat_lines = "\n".join(
        f"- [{c.get('code','')}] {c['designation']} | {c.get('unite','u')} | "
        f"{c.get('prix_unitaire_ht',0)} €/HT | TVA {c.get('tva',10)}%"
        for c in catalog
    )
    return (
        "Tu es un assistant de chiffrage pour artisans du bâtiment en France.\n"
        "RÈGLES ABSOLUES:\n"
        "1. Ne JAMAIS inventer une donnée métier manquante (surface, hauteur, nombre d'éléments, quantité).\n"
        "2. Surface des murs à peindre: la surface AU SOL n'est JAMAIS suffisante, et la hauteur sous "
        "plafond SEULE ne suffit pas non plus. Pour chiffrer une peinture murale, demande soit la surface "
        "totale des murs, soit les dimensions/périmètre de la pièce AVEC la hauteur sous plafond.\n"
        "3. Si la description ne permet pas de calculer de façon fiable une quantité ou une surface, "
        "tu poses d'abord 2 à 4 questions complémentaires courtes et précises, et tu NE génères PAS de lignes.\n"
        "4. Pour les prix, utilise EXCLUSIVEMENT le catalogue tarifaire ci-dessous. Si une prestation "
        "correspond à une entrée: source='catalogue', reprends son code et son prix_unitaire_ht. "
        "Sinon source='estimation', prix_unitaire_ht=0. Ne présente jamais un prix inventé comme certain.\n"
        "5. TVA: ne présélectionne PAS 10% par défaut. Si le contexte fiscal n'est pas explicite dans la "
        "description (nature du bien, ancienneté du logement, neuf/rénovation), mets tva=null (À définir) "
        "et signale-le dans 'note', ou pose une question sur le taux applicable.\n\n"
        f"CATALOGUE TARIFAIRE (démonstration):\n{cat_lines}\n\n"
        "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.\n"
        'Si informations manquantes: {"status":"questions","questions":["...","..."]}\n'
        'Sinon: {"status":"lignes","note":"hypothèses éventuelles","lignes":[{"designation":str,'
        '"quantite":number,"unite":str,"prix_unitaire_ht":number,"tva":number|null,'
        '"source":"catalogue"|"estimation","catalog_code":str|null}]}'
    )


def _extract_json(text: str) -> dict:
    text = text if isinstance(text, str) else str(text)
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        text = m.group(0)
    return json.loads(text)


async def analyze_description(description: str, answers: Optional[str], catalog: List[dict]) -> dict:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"devis-{uuid.uuid4()}",
        system_message=build_ai_system(catalog),
    ).with_model("openai", "gpt-5.4")

    if answers:
        prompt = (
            f"Description du chantier:\n{description}\n\n"
            f"Réponses de l'artisan aux questions:\n{answers}\n\n"
            "Génère maintenant les lignes du devis (status=lignes) en tenant compte de ces réponses. "
            "Ne repose pas de questions."
        )
    else:
        prompt = (
            f"Description du chantier:\n{description}\n\n"
            "Analyse la description. Si des données manquent pour chiffrer correctement, pose des questions "
            "(status=questions). Sinon génère les lignes (status=lignes)."
        )

    resp = await chat.send_message(UserMessage(text=prompt))
    data = _extract_json(resp)

    if data.get("status") == "questions" and not answers:
        qs = [str(q) for q in data.get("questions", []) if str(q).strip()]
        if qs:
            return {"status": "questions", "questions": qs}

    lignes_raw = data.get("lignes", [])
    lignes = []
    for l in lignes_raw:
        tva = l.get("tva", None)
        lignes.append(QuoteLine(
            designation=str(l.get("designation", "Prestation")),
            quantite=float(l.get("quantite", 1) or 1),
            unite=str(l.get("unite", "u")),
            prix_unitaire_ht=float(l.get("prix_unitaire_ht", 0) or 0),
            tva=(None if tva in (None, "", "null") else float(tva)),
            source=str(l.get("source", "estimation")),
            catalog_code=l.get("catalog_code") or None,
        ).model_dump())
    return {"status": "lignes", "note": data.get("note", ""), "lignes": lignes, "totaux": compute_totals(lignes)}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "SOCLE Artisan API"}


@api_router.get("/company")
async def company_get():
    return await get_company()


@api_router.put("/company")
async def company_put(payload: CompanyUpdate):
    data = payload.model_dump()
    data["is_demo"] = False
    await db.settings.update_one({"key": "company"}, {"$set": data}, upsert=True)
    return await get_company()


@api_router.get("/catalog")
async def catalog_get():
    items = await get_catalog_items()
    company = await get_company()
    return {"items": items, "is_demo": company.get("is_demo", True)}


@api_router.put("/catalog")
async def catalog_put(payload: CatalogUpdate):
    await db.catalog.delete_many({})
    docs = [i.model_dump() for i in payload.items]
    if docs:
        await db.catalog.insert_many(docs)
    return {"items": await get_catalog_items()}


@api_router.post("/catalog/reset")
async def catalog_reset():
    await db.catalog.delete_many({})
    await seed_catalog()
    return {"items": await get_catalog_items()}


@api_router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="Description vide")
    catalog = await get_catalog_items()
    try:
        return await analyze_description(req.description, req.answers, catalog)
    except Exception as e:
        logger.exception("AI analyze failed")
        raise HTTPException(status_code=500, detail=f"Analyse IA impossible: {e}")


@api_router.get("/quotes")
async def list_quotes(statut: Optional[str] = None):
    docs = await db.quotes.find({}).sort("created_at", -1).to_list(500)
    result = [serialize_quote(d) for d in docs]
    if statut:
        result = [q for q in result if q["effective_statut"] == statut]
    return result


@api_router.get("/quotes/{quote_id}")
async def get_quote(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    return serialize_quote(doc)


@api_router.post("/quotes")
async def create_quote(payload: QuoteUpsert):
    company = await get_company()
    quote = Quote(
        numero=await next_numero(),
        client=payload.client,
        description=payload.description,
        lignes=payload.lignes,
        relance_delay_days=company.get("relance_delay_days", 7),
    )
    doc = quote.model_dump()
    await db.quotes.insert_one(doc)
    return serialize_quote(doc)


@api_router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, payload: QuoteUpsert):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    update = {
        "client": payload.client.model_dump(),
        "description": payload.description,
        "lignes": [l.model_dump() for l in payload.lignes],
        "updated_at": now_iso(),
    }
    await db.quotes.update_one({"id": quote_id}, {"$set": update})
    doc.update(update)
    return serialize_quote(doc)


@api_router.post("/quotes/{quote_id}/status")
async def set_status(quote_id: str, body: StatusUpdate):
    if body.statut not in STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    company = await get_company()
    update = {"statut": body.statut, "updated_at": now_iso()}
    if body.statut == "envoye":
        if has_undefined_tva(doc.get("lignes", [])):
            raise HTTPException(status_code=400, detail=TVA_UNDEFINED_MSG)
        delay = body.relance_delay_days or company.get("relance_delay_days", 7)
        update["sent_at"] = doc.get("sent_at") or now_iso()
        update["relance_delay_days"] = delay
        update["next_relance_at"] = (now_utc() + timedelta(days=delay)).isoformat()
        if not doc.get("public_token"):
            update["public_token"] = secrets.token_urlsafe(12)
    elif body.statut == "accepte":
        update["accepted_at"] = now_iso()
        update["next_relance_at"] = None
    elif body.statut == "refuse":
        update["refused_at"] = now_iso()
        update["next_relance_at"] = None
    await db.quotes.update_one({"id": quote_id}, {"$set": update})
    doc.update(update)
    return serialize_quote(doc)


@api_router.post("/quotes/{quote_id}/relance")
async def relance_message(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    company = await get_company()
    totaux = compute_totals(doc.get("lignes", []))
    nom = (doc.get("client", {}).get("nom") or "").strip() or "Madame, Monsieur"
    message = (
        f"Bonjour {nom},\n\n"
        f"Je me permets de revenir vers vous concernant le devis {doc['numero']} "
        f"d'un montant de {fmt_eur(totaux['total_ttc'])} TTC que je vous ai transmis.\n\n"
        f"Avez-vous pu en prendre connaissance ? Je reste à votre entière disposition pour toute "
        f"question ou ajustement, et pour convenir d'une date de démarrage des travaux.\n\n"
        f"Bien cordialement,\n{company.get('artisan_name') or company.get('name')}\n"
        f"{company.get('name')}\n{company.get('phone')}"
    )
    return {"message": message}


@api_router.post("/quotes/{quote_id}/mark-relance")
async def mark_relance(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    company = await get_company()
    delay = doc.get("relance_delay_days") or company.get("relance_delay_days", 7)
    await db.quotes.update_one(
        {"id": quote_id},
        {"$set": {
            "statut": "relance",
            "last_relance_at": now_iso(),
            "next_relance_at": (now_utc() + timedelta(days=delay)).isoformat(),
            "updated_at": now_iso(),
        }, "$inc": {"relance_count": 1}},
    )
    doc = await db.quotes.find_one({"id": quote_id})
    return serialize_quote(doc)


@api_router.get("/dashboard/stats")
async def dashboard_stats():
    docs = await db.quotes.find({}).to_list(1000)
    stats = {
        "a_preparer": 0, "envoyes": 0, "a_relancer": 0, "relances": 0, "acceptes": 0, "refuses": 0,
        "ca_potentiel": 0.0, "ca_accepte": 0.0, "relance_total": 0.0,
        "temps_gagne_min": 0, "total_devis": len(docs),
    }
    for d in docs:
        ttc = compute_totals(d.get("lignes", []))["total_ttc"]
        eff = effective_status(d)
        stored = d.get("statut")
        stats["temps_gagne_min"] += d.get("time_saved_min", 0)
        if stored == "relance":
            stats["relances"] += 1
        if eff == "brouillon":
            stats["a_preparer"] += 1
        elif eff == "envoye":
            stats["envoyes"] += 1
            stats["ca_potentiel"] += ttc
        elif eff == "relance":
            stats["ca_potentiel"] += ttc
        elif eff == "a_relancer":
            stats["a_relancer"] += 1
            stats["ca_potentiel"] += ttc
            stats["relance_total"] += ttc
        elif eff == "accepte":
            stats["acceptes"] += 1
            stats["ca_accepte"] += ttc
        elif eff == "refuse":
            stats["refuses"] += 1
    for k in ("ca_potentiel", "ca_accepte", "relance_total"):
        stats[k] = round(stats[k], 2)
    return stats


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------
DEMO_QUOTES = [
    {
        "numero": "DEV-2026-001", "statut": "relance",
        "client": {"nom": "Mme Dubois", "telephone": "06 45 78 12 90", "email": "c.dubois@email.fr", "adresse": "8 Rue de la République, 47000 Agen"},
        "description": "Refaire la peinture du salon de 32 m² au sol, deux couches blanc mat, protéger le sol, reboucher quelques fissures et remplacer 8 mètres de plinthes.",
        "lignes": [
            {"designation": "Protection du sol et du mobilier", "quantite": 1, "unite": "forfait", "prix_unitaire_ht": 85, "tva": 10, "source": "catalogue", "catalog_code": "PROT-01"},
            {"designation": "Rebouchage et traitement de fissure", "quantite": 4, "unite": "u", "prix_unitaire_ht": 18, "tva": 10, "source": "catalogue", "catalog_code": "FISS-01"},
            {"designation": "Peinture murs 2 couches (acrylique)", "quantite": 58, "unite": "m²", "prix_unitaire_ht": 12.5, "tva": 10, "source": "catalogue", "catalog_code": "PEINT-01"},
            {"designation": "Fourniture et pose de plinthes", "quantite": 8, "unite": "ml", "prix_unitaire_ht": 14, "tva": 10, "source": "catalogue", "catalog_code": "PLINT-01"},
        ],
        "sent_days_ago": 12, "relance_count": 1, "last_relance_days_ago": 5, "next_relance_days_ago": 1,
    },
    {
        "numero": "DEV-2026-002", "statut": "envoye",
        "client": {"nom": "M. Lefebvre", "telephone": "07 88 23 45 67", "email": "lefebvre.pro@email.fr", "adresse": "22 Avenue Jean Jaurès, 69007 Lyon"},
        "description": "Rénovation salle de bain : dépose ancien carrelage, pose faïence murale 12 m² et carrelage sol 6 m².",
        "lignes": [
            {"designation": "Dépose et évacuation ancien revêtement", "quantite": 18, "unite": "m²", "prix_unitaire_ht": 22, "tva": 10, "source": "catalogue", "catalog_code": "DEPOSE-01"},
            {"designation": "Pose faïence murale", "quantite": 12, "unite": "m²", "prix_unitaire_ht": 55, "tva": 10, "source": "catalogue", "catalog_code": "CARR-01"},
            {"designation": "Pose carrelage au sol", "quantite": 6, "unite": "m²", "prix_unitaire_ht": 60, "tva": 10, "source": "catalogue", "catalog_code": "CARR-02"},
        ],
        "sent_days_ago": 2, "relance_count": 0, "next_relance_days_ahead": 5,
    },
    {
        "numero": "DEV-2026-003", "statut": "accepte",
        "client": {"nom": "Boulangerie Petitpain", "telephone": "04 78 12 34 56", "email": "contact@petitpain.fr", "adresse": "5 Place du Marché, 69003 Lyon"},
        "description": "Peinture de la devanture et de l'arrière-boutique, environ 60 m² de murs.",
        "lignes": [
            {"designation": "Préparation des supports (ponçage, lessivage)", "quantite": 60, "unite": "m²", "prix_unitaire_ht": 6.5, "tva": 20, "source": "catalogue", "catalog_code": "PREP-01"},
            {"designation": "Peinture murs 2 couches (acrylique)", "quantite": 60, "unite": "m²", "prix_unitaire_ht": 12.5, "tva": 20, "source": "catalogue", "catalog_code": "PEINT-01"},
        ],
        "sent_days_ago": 15, "accepted": True, "relance_count": 0,
    },
    {
        "numero": "DEV-2026-004", "statut": "brouillon",
        "client": {"nom": "M. Garcia", "telephone": "06 11 22 33 44", "email": "garcia.j@email.fr", "adresse": "3 Impasse des Lilas, 69100 Villeurbanne"},
        "description": "Pose de parquet flottant dans deux chambres, environ 28 m².",
        "lignes": [
            {"designation": "Fourniture et pose parquet flottant", "quantite": 28, "unite": "m²", "prix_unitaire_ht": 56, "tva": 10, "source": "catalogue", "catalog_code": "PARQ-01"},
            {"designation": "Fourniture et pose de plinthes", "quantite": 22, "unite": "ml", "prix_unitaire_ht": 14, "tva": 10, "source": "catalogue", "catalog_code": "PLINT-01"},
        ],
        "relance_count": 0,
    },
]


async def seed_catalog():
    if await db.catalog.count_documents({}) > 0:
        return
    for c in DEMO_CATALOG:
        await db.catalog.insert_one(CatalogItem(**c).model_dump())
    logger.info("Seeded demo catalog")


async def seed_quotes():
    if await db.quotes.count_documents({}) > 0:
        return
    for d in DEMO_QUOTES:
        created = now_utc() - timedelta(days=d.get("sent_days_ago", 0))
        sent_at = created.isoformat() if "sent_days_ago" in d else None
        next_relance = None
        if "next_relance_days_ago" in d:
            next_relance = (now_utc() - timedelta(days=d["next_relance_days_ago"])).isoformat()
        elif "next_relance_days_ahead" in d:
            next_relance = (now_utc() + timedelta(days=d["next_relance_days_ahead"])).isoformat()
        last_relance = None
        if "last_relance_days_ago" in d:
            last_relance = (now_utc() - timedelta(days=d["last_relance_days_ago"])).isoformat()
        q = Quote(
            numero=d["numero"],
            client=Client(**d["client"]),
            description=d["description"],
            lignes=[QuoteLine(**l) for l in d["lignes"]],
            statut=d["statut"],
            relance_count=d.get("relance_count", 0),
            created_at=created.isoformat(),
            updated_at=created.isoformat(),
            sent_at=sent_at,
            accepted_at=created.isoformat() if d.get("accepted") else None,
            last_relance_at=last_relance,
            next_relance_at=next_relance,
        )
        await db.quotes.insert_one(q.model_dump())
    logger.info("Seeded demo quotes")


@api_router.post("/seed")
async def force_seed():
    await db.quotes.delete_many({})
    await db.catalog.delete_many({})
    await db.settings.delete_many({"key": "company"})
    await seed_catalog()
    await get_company()
    await seed_quotes()
    return {"seeded": True}


@app.on_event("startup")
async def startup():
    await seed_catalog()
    await get_company()
    await seed_quotes()


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------
STATUS_LABELS = {
    "brouillon": "Brouillon", "envoye": "Envoyé", "relance": "Relancé",
    "a_relancer": "À relancer", "accepte": "Accepté", "refuse": "Refusé",
}


def build_pdf(quote: dict, company: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    PET = colors.HexColor('#0F2D3A')
    LAG = colors.HexColor('#00A896')
    MUT = colors.HexColor('#64748B')
    LIGHT = colors.HexColor('#F1F5F9')

    styles = getSampleStyleSheet()
    small = ParagraphStyle('small', parent=styles['Normal'], fontSize=8.5, textColor=MUT, leading=12)
    white = ParagraphStyle('white', parent=styles['Normal'], fontSize=9, textColor=colors.white, leading=13)
    whiteb = ParagraphStyle('whiteb', parent=styles['Normal'], fontSize=20, textColor=colors.white, leading=22)
    lag = ParagraphStyle('lag', parent=styles['Normal'], fontSize=22, textColor=LAG, leading=24, alignment=2)
    whiter = ParagraphStyle('whiter', parent=styles['Normal'], fontSize=9, textColor=colors.white, leading=13, alignment=2)
    cell = ParagraphStyle('cell', parent=styles['Normal'], fontSize=9, textColor=PET, leading=12)
    normal = ParagraphStyle('n', parent=styles['Normal'], fontSize=9.5, textColor=PET, leading=13)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=14 * mm, bottomMargin=14 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm)
    story = []

    left = [
        Paragraph(f"<b>{escape(company.get('name',''))}</b>", whiteb),
        Spacer(1, 3),
        Paragraph(escape(company.get('address', '')), white),
        Paragraph(f"Tél. {escape(company.get('phone',''))}", white),
        Paragraph(f"SIRET {escape(company.get('siret',''))}", white),
    ]
    right = [
        Paragraph("DEVIS", lag),
        Paragraph(f"N° {escape(quote['numero'])}", whiter),
        Paragraph(dt_fr(quote.get('created_at')), whiter),
        Paragraph(f"Statut : {STATUS_LABELS.get(quote.get('effective_statut', quote.get('statut')), '')}", whiter),
    ]
    header = Table([[left, right]], colWidths=[110 * mm, 70 * mm])
    header.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), PET),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 12), ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(header)
    story.append(Spacer(1, 10))

    cl = quote.get('client', {})
    client_box = Table([[
        Paragraph("<b>CLIENT</b>", small),
    ], [
        Paragraph(f"<b>{escape(cl.get('nom',''))}</b>", normal),
    ], [
        Paragraph(escape(cl.get('adresse', '')), small),
    ], [
        Paragraph(f"{escape(cl.get('telephone',''))}  ·  {escape(cl.get('email',''))}", small),
    ]], colWidths=[180 * mm])
    client_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (0, 0), 8), ('BOTTOMPADDING', (0, -1), (0, -1), 8),
    ]))
    story.append(client_box)
    story.append(Spacer(1, 12))

    data = [[Paragraph("<b>Désignation</b>", ParagraphStyle('h', parent=cell, textColor=colors.white)),
             Paragraph("<b>Qté</b>", ParagraphStyle('h2', parent=cell, textColor=colors.white, alignment=2)),
             Paragraph("<b>Unité</b>", ParagraphStyle('h3', parent=cell, textColor=colors.white, alignment=1)),
             Paragraph("<b>P.U. HT</b>", ParagraphStyle('h4', parent=cell, textColor=colors.white, alignment=2)),
             Paragraph("<b>TVA</b>", ParagraphStyle('h5', parent=cell, textColor=colors.white, alignment=2)),
             Paragraph("<b>Total HT</b>", ParagraphStyle('h6', parent=cell, textColor=colors.white, alignment=2))]]
    rcell = ParagraphStyle('rc', parent=cell, alignment=2)
    ccell = ParagraphStyle('cc', parent=cell, alignment=1)
    for l in quote.get('lignes', []):
        lht = float(l.get('quantite', 0) or 0) * float(l.get('prix_unitaire_ht', 0) or 0)
        tva = l.get('tva')
        tva_txt = f"{fnum(tva)} %" if tva not in (None, "") else "À déf."
        desig = escape(l.get('designation', ''))
        if l.get('source') == 'estimation':
            desig += ' <font color="#D97706">(estimation)</font>'
        data.append([
            Paragraph(desig, cell),
            Paragraph(fnum(l.get('quantite')), rcell),
            Paragraph(escape(str(l.get('unite', ''))), ccell),
            Paragraph(fmt_eur(l.get('prix_unitaire_ht')), rcell),
            Paragraph(tva_txt, rcell),
            Paragraph(fmt_eur(lht), rcell),
        ])
    tbl = Table(data, colWidths=[78 * mm, 16 * mm, 16 * mm, 24 * mm, 18 * mm, 28 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PET),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#E2E8F0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 10))

    t = quote.get('totaux', {})
    totals = Table([
        [Paragraph("Total HT", small), Paragraph(fmt_eur(t.get('total_ht')), ParagraphStyle('r', parent=normal, alignment=2))],
        [Paragraph("TVA", small), Paragraph(fmt_eur(t.get('total_tva')), ParagraphStyle('r2', parent=normal, alignment=2))],
        [Paragraph("<b>Total TTC</b>", ParagraphStyle('tw', parent=white, fontSize=11)),
         Paragraph(f"<b>{fmt_eur(t.get('total_ttc'))}</b>", ParagraphStyle('tl', parent=white, fontSize=12, textColor=LAG, alignment=2))],
    ], colWidths=[45 * mm, 40 * mm])
    totals.setStyle(TableStyle([
        ('BACKGROUND', (0, 2), (-1, 2), PET),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    wrap = Table([[totals]], colWidths=[180 * mm])
    wrap.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'RIGHT')]))
    story.append(wrap)
    story.append(Spacer(1, 16))

    legal = (f"{escape(company.get('assurance',''))} · TVA intracom. {escape(company.get('tva_intra',''))} · "
             f"Devis valable 30 jours à compter de sa date d'émission. "
             f"Bon pour accord : signature et date du client.")
    story.append(Paragraph(legal, small))

    doc.build(story)
    return buf.getvalue()


def dt_fr(iso: Optional[str]) -> str:
    d = parse_iso(iso)
    if not d:
        return ""
    mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
            "septembre", "octobre", "novembre", "décembre"]
    return f"{d.day} {mois[d.month - 1]} {d.year}"


def fnum(v) -> str:
    if v in (None, ""):
        return ""
    f = float(v)
    s = f"{f:,.2f}".rstrip("0").rstrip(".") if f != int(f) else f"{int(f)}"
    return s.replace(",", " ")


# ---------------------------------------------------------------------------
# Email (Emergent-managed Resend) — see playbook guardrails
# ---------------------------------------------------------------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, attachments=None) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    if attachments:
        payload["attachments"] = attachments
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                            headers={"X-Email-Key": EMAIL_KEY}, json=payload)
    resp.raise_for_status()
    return resp.json().get("id")


def safe_base_url(origin: Optional[str]) -> Optional[str]:
    if not origin:
        return None
    origin = origin.strip().rstrip("/")
    if not origin.lower().startswith("https://"):
        return None
    host = urlparse(origin).hostname or ""
    if not _host_ok(host) or urlparse(origin).username is not None:
        return None
    return origin


def default_email_message(quote: dict, company: dict) -> str:
    nom = (quote.get("client", {}).get("nom") or "").strip() or "Madame, Monsieur"
    ttc = fmt_eur(quote.get("totaux", {}).get("total_ttc"))
    artisan = company.get("artisan_name") or company.get("name")
    return (
        f"Bonjour {nom},\n\n"
        f"Veuillez trouver ci-joint le devis {quote['numero']} d'un montant de {ttc} TTC.\n"
        f"Vous pouvez le consulter, l'accepter ou le refuser en ligne via le bouton ci-dessous.\n\n"
        f"Je reste à votre disposition pour toute question.\n\n"
        f"Bien cordialement,\n{artisan}\n{company.get('name')}\n{company.get('phone','')}"
    )


def build_email_html(message: str, quote: dict, company: dict, link: Optional[str]) -> str:
    safe = escape(message).replace("\n", "<br>")
    button = ""
    if link:
        button = (f'<tr><td style="padding:18px 0"><a href="{escape(link)}" '
                  f'style="background:#00A896;color:#ffffff;padding:13px 24px;border-radius:10px;'
                  f'text-decoration:none;font-weight:bold;display:inline-block;font-size:14px">'
                  f'Voir et accepter le devis en ligne</a></td></tr>')
    name = escape(company.get('name', ''))
    return (
        f'<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;'
        f'font-family:Arial,Helvetica,sans-serif;color:#0F2D3A">'
        f'<tr><td style="background:#0F2D3A;padding:22px;border-radius:12px 12px 0 0">'
        f'<div style="color:#ffffff;font-size:20px;font-weight:bold">{name}</div>'
        f'<div style="color:#7fd4cc;font-size:13px;margin-top:2px">Devis {escape(quote["numero"])}</div>'
        f'</td></tr>'
        f'<tr><td style="padding:22px;font-size:15px;line-height:1.55">{safe}'
        f'<div style="margin-top:14px;font-size:15px"><strong>Total TTC : '
        f'{escape(fmt_eur(quote.get("totaux",{}).get("total_ttc")))}</strong></div>'
        f'{button}</td></tr>'
        f'<tr><td style="padding:14px 22px;border-top:1px solid #eee;color:#888;font-size:12px">'
        f'Envoyé par {name}. Ce message ne vous demandera jamais vos identifiants ni vos '
        f'coordonnées bancaires.</td></tr></table>'
    )


async def ensure_public_token(quote_id: str) -> str:
    doc = await db.quotes.find_one({"id": quote_id})
    tok = doc.get("public_token")
    if not tok:
        tok = secrets.token_urlsafe(12)
        await db.quotes.update_one({"id": quote_id}, {"$set": {"public_token": tok}})
    return tok


class SendEmailRequest(BaseModel):
    personal_message: Optional[str] = None
    app_base_url: Optional[str] = None
    relance_delay_days: Optional[int] = None


class RefuseRequest(BaseModel):
    comment: Optional[str] = None


PUBLIC_COMPANY_FIELDS = ("name", "artisan_name", "address", "phone", "email", "siret", "tva_intra", "assurance")


# ---------------------------------------------------------------------------
# PDF / Email / Public routes
# ---------------------------------------------------------------------------
@api_router.get("/quotes/{quote_id}/pdf")
async def quote_pdf(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    if has_undefined_tva(doc.get("lignes", [])):
        raise HTTPException(status_code=400, detail=TVA_UNDEFINED_MSG)
    company = await get_company()
    pdf = build_pdf(serialize_quote(doc), company)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="devis-{doc["numero"]}.pdf"'})


@api_router.get("/quotes/{quote_id}/email-preview")
async def email_preview(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    company = await get_company()
    q = serialize_quote(doc)
    to = (q.get("client", {}) or {}).get("email", "")
    return {
        "to": to,
        "has_email": bool(to),
        "subject": f"Devis {q['numero']} — {company.get('name','')}",
        "default_message": default_email_message(q, company),
        "email_configured": bool(EMAIL_KEY),
    }


@api_router.post("/quotes/{quote_id}/send-email")
async def send_quote_email(quote_id: str, req: SendEmailRequest):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    company = await get_company()
    q = serialize_quote(dict(doc))
    to = (q.get("client", {}) or {}).get("email", "")
    if not to:
        raise HTTPException(status_code=400, detail="Aucune adresse email client renseignée")
    if has_undefined_tva(doc.get("lignes", [])):
        raise HTTPException(status_code=400, detail=TVA_UNDEFINED_MSG)

    token = await ensure_public_token(quote_id)
    base = safe_base_url(req.app_base_url)
    link = f"{base}/devis-client/{token}" if base else None

    message = req.personal_message or default_email_message(q, company)
    subject = f"Devis {q['numero']} — {company.get('name','')}"
    html = build_email_html(message, q, company, link)
    pdf = build_pdf(q, company)
    attachments = [{"filename": f"devis-{q['numero']}.pdf",
                    "content": base64.b64encode(pdf).decode()}]

    mode = "live"
    email_id = None
    if EMAIL_KEY:
        try:
            email_id = await send_email(to=to, subject=subject, html=html, attachments=attachments)
        except Exception as e:
            logger.error(f"Email send failed, falling back to demo mode: {e}")
            mode = "demo"
    else:
        mode = "demo"

    delay = req.relance_delay_days or company.get("relance_delay_days", 7)
    await db.quotes.update_one({"id": quote_id}, {"$set": {
        "statut": "envoye",
        "sent_at": doc.get("sent_at") or now_iso(),
        "relance_delay_days": delay,
        "next_relance_at": (now_utc() + timedelta(days=delay)).isoformat(),
        "public_token": token,
        "updated_at": now_iso(),
    }})
    return {"sent": mode == "live", "mode": mode, "email_id": email_id, "to": to,
            "public_link": link, "attached_pdf": True}


@api_router.get("/public/quotes/{token}")
async def public_quote(token: str):
    doc = await db.quotes.find_one({"public_token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    company = await get_company()
    return {
        "quote": serialize_quote(doc),
        "company": {k: company.get(k, "") for k in PUBLIC_COMPANY_FIELDS},
    }


@api_router.post("/public/quotes/{token}/accept")
async def public_accept(token: str):
    doc = await db.quotes.find_one({"public_token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    if doc.get("statut") not in ("accepte", "refuse"):
        await db.quotes.update_one({"public_token": token}, {"$set": {
            "statut": "accepte", "accepted_at": now_iso(), "next_relance_at": None,
            "decision_source": "client", "updated_at": now_iso(),
        }})
    doc = await db.quotes.find_one({"public_token": token})
    return {"statut": "accepte", "accepted_at": doc.get("accepted_at")}


@api_router.post("/public/quotes/{token}/refuse")
async def public_refuse(token: str, req: RefuseRequest):
    doc = await db.quotes.find_one({"public_token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    if doc.get("statut") not in ("accepte", "refuse"):
        await db.quotes.update_one({"public_token": token}, {"$set": {
            "statut": "refuse", "refused_at": now_iso(), "next_relance_at": None,
            "refus_comment": (req.comment or "").strip()[:1000],
            "decision_source": "client", "updated_at": now_iso(),
        }})
    return {"statut": "refuse"}


class DispatchRequest(BaseModel):
    questions: List[str]
    transcript: str


class VoiceEditRequest(BaseModel):
    lignes: List[QuoteLine]
    transcript: str


async def _llm_json(system: str, prompt: str) -> dict:
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"voice-{uuid.uuid4()}",
                   system_message=system).with_model("openai", "gpt-5.4")
    resp = await chat.send_message(UserMessage(text=prompt))
    return _extract_json(resp)


@api_router.post("/dispatch-answers")
async def dispatch_answers(req: DispatchRequest):
    if not req.transcript.strip() or not req.questions:
        return {"answers": {}}
    system = (
        "Tu reçois une liste de questions numérotées et une dictée libre en français. "
        "Répartis les informations de la dictée dans la bonne question. "
        "Ne réponds pas toi-même aux questions: extrais uniquement ce que dit l'utilisateur. "
        "Laisse une chaîne vide si l'information n'est pas fournie. "
        'Réponds UNIQUEMENT en JSON: {"answers": {"0": "texte", "1": ""}}'
    )
    qs = "\n".join(f"{i}. {q}" for i, q in enumerate(req.questions))
    prompt = f"Questions:\n{qs}\n\nDictée:\n{req.transcript}"
    try:
        data = await _llm_json(system, prompt)
    except Exception as e:
        logger.exception("dispatch failed")
        raise HTTPException(status_code=500, detail=f"Répartition impossible: {e}")
    ans = data.get("answers", {}) or {}
    return {"answers": {str(k): str(v) for k, v in ans.items()}}


@api_router.post("/edit-voice")
async def edit_voice(req: VoiceEditRequest):
    if not req.transcript.strip():
        raise HTTPException(status_code=400, detail="Instruction vide")
    current = [l.model_dump() for l in req.lignes]
    system = (
        "Tu modifies un devis d'artisan selon une instruction orale en français. "
        "On te donne les lignes actuelles (JSON, chacune avec un id) et l'instruction.\n"
        "Détermine l'intention: 'confirm' si l'utilisateur demande SEULEMENT de valider/enregistrer/"
        "envoyer (ex: 'valide', 'c'est bon', 'enregistre', 'envoie', 'renvoie'), sinon 'edit'.\n"
        "Pour 'edit': renvoie TOUTES les lignes mises à jour en conservant les id existants, sans "
        "toucher aux lignes non concernées. Actions: modifier prix_unitaire_ht, quantite, unite, tva; "
        "ajouter une ligne (id vide, source 'manuel'); supprimer une ligne. Pour un ajout dont le "
        "contexte TVA est inconnu, mets tva=null. Ne modifie jamais une ligne sans raison explicite.\n"
        "Décris chaque changement dans 'changes' (français clair, ex: 'Peinture: 12,50 € -> 15,00 €/m²').\n"
        'Réponds UNIQUEMENT en JSON: {"intent":"edit"|"confirm","confirm_action":"save"|"send"|null,'
        '"changes":["..."],"lignes":[{"id":str,"designation":str,"quantite":number,"unite":str,'
        '"prix_unitaire_ht":number,"tva":number|null,"source":str,"catalog_code":str|null}],"summary":str}'
    )
    prompt = f"Lignes actuelles:\n{json.dumps(current, ensure_ascii=False)}\n\nInstruction:\n{req.transcript}"
    try:
        data = await _llm_json(system, prompt)
    except Exception as e:
        logger.exception("edit-voice failed")
        raise HTTPException(status_code=500, detail=f"Interprétation impossible: {e}")
    intent = data.get("intent", "edit")
    if intent == "confirm":
        return {"intent": "confirm", "confirm_action": data.get("confirm_action") or "save",
                "changes": [], "lignes": current, "summary": data.get("summary", ""),
                "totaux": compute_totals(current)}
    out = []
    for l in data.get("lignes", current):
        tva = l.get("tva", None)
        out.append(QuoteLine(
            id=l.get("id") or str(uuid.uuid4()),
            designation=str(l.get("designation", "")),
            quantite=float(l.get("quantite", 1) or 1),
            unite=str(l.get("unite", "u")),
            prix_unitaire_ht=float(l.get("prix_unitaire_ht", 0) or 0),
            tva=(None if tva in (None, "", "null") else float(tva)),
            source=str(l.get("source", "manuel")),
            catalog_code=l.get("catalog_code") or None,
        ).model_dump())
    return {"intent": "edit", "confirm_action": None,
            "changes": [str(c) for c in data.get("changes", [])],
            "lignes": out, "summary": data.get("summary", ""),
            "totaux": compute_totals(out)}


class ParseClientRequest(BaseModel):
    transcript: str


def normalize_email(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"\s*arobase\s*", "@", s)
    s = re.sub(r"\s*(?:point|dot)\s*", ".", s)
    s = re.sub(r"\s*tiret\s+bas\s*", "_", s)
    s = re.sub(r"\s*(?:underscore|souligné)\s*", "_", s)
    s = re.sub(r"\s*tiret\s*", "-", s)
    s = s.replace(" ", "").strip(" .")
    return s


@api_router.post("/parse-client")
async def parse_client(req: ParseClientRequest):
    if not req.transcript.strip():
        return {"nom": "", "adresse": "", "telephone": "", "email": ""}
    system = (
        "Tu extrais les coordonnées d'un client à partir d'une phrase dictée en français. "
        "Retourne UNIQUEMENT du JSON {\"nom\":str,\"adresse\":str,\"telephone\":str,\"email\":str}. "
        "nom = nom de la personne OU raison sociale. adresse = adresse complète (numéro, rue, code postal, ville). "
        "Pour l'email, convertis 'arobase' en @ et 'point' en '.', supprime les espaces, mets en minuscules. "
        "Pour le téléphone, garde les chiffres (espaces autorisés). Laisse une chaîne vide si l'information est absente."
    )
    try:
        data = await _llm_json(system, req.transcript)
    except Exception as e:
        logger.exception("parse-client failed")
        raise HTTPException(status_code=500, detail=f"Extraction impossible: {e}")
    return {
        "nom": str(data.get("nom", "")).strip(),
        "adresse": str(data.get("adresse", "")).strip(),
        "telephone": str(data.get("telephone", "")).strip(),
        "email": normalize_email(str(data.get("email", ""))),
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
