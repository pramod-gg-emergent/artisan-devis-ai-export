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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

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
        "1. Ne JAMAIS inventer une donnée métier manquante (surface de murs, hauteur sous plafond, "
        "nombre d'éléments, quantité). La surface AU SOL d'une pièce n'est PAS la surface des murs à peindre.\n"
        "2. Si la description ne permet pas de calculer de façon fiable une quantité ou une surface, "
        "tu poses d'abord 2 à 4 questions complémentaires courtes et précises, et tu NE génères PAS de lignes.\n"
        "3. Pour les prix, utilise EXCLUSIVEMENT le catalogue tarifaire ci-dessous. "
        "Si une prestation correspond à une entrée du catalogue: source='catalogue', reprends son code, "
        "son prix_unitaire_ht et sa tva. Si aucune entrée ne correspond: source='estimation', "
        "prix_unitaire_ht=0 et tva=null (l'artisan complétera). Ne présente jamais un prix inventé comme certain.\n"
        "4. N'applique pas un taux de TVA au hasard: la TVA provient du catalogue; laisse null si incertaine.\n\n"
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
        delay = body.relance_delay_days or company.get("relance_delay_days", 7)
        update["sent_at"] = doc.get("sent_at") or now_iso()
        update["relance_delay_days"] = delay
        update["next_relance_at"] = (now_utc() + timedelta(days=delay)).isoformat()
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
