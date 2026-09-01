from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator
from typing import List, Optional, Annotated, Any
from bson import ObjectId
import uuid
from datetime import datetime, timezone

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

# ---------------------------------------------------------------------------
# Company profile (the artisan using the app). Static for the MVP.
# ---------------------------------------------------------------------------
COMPANY = {
    "name": "Martin Rénovation",
    "artisan_name": "Martin Dubois",
    "siret": "849 204 112 00018",
    "address": "14 Rue des Artisans, 69003 Lyon",
    "phone": "06 12 34 56 78",
    "email": "contact@martin-renovation.fr",
    "assurance": "MAAF Décennale N° 98234102-B",
    "tva_intra": "FR 76 849204112",
}

STATUSES = ["brouillon", "envoye", "a_relancer", "accepte"]


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
def _validate_object_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    tva: float = 20.0


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
    relance_count: int = 0
    time_saved_min: int = 25  # estimated minutes saved thanks to AI


class QuoteUpsert(BaseModel):
    client: Client = Field(default_factory=Client)
    description: str = ""
    lignes: List[QuoteLine] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    description: str


# ---------------------------------------------------------------------------
# Totals
# ---------------------------------------------------------------------------
def compute_totals(lignes: List[dict]) -> dict:
    total_ht = 0.0
    total_tva = 0.0
    for l in lignes:
        line_ht = float(l.get("quantite", 0)) * float(l.get("prix_unitaire_ht", 0))
        total_ht += line_ht
        total_tva += line_ht * float(l.get("tva", 0)) / 100.0
    total_ht = round(total_ht, 2)
    total_tva = round(total_tva, 2)
    return {
        "total_ht": total_ht,
        "total_tva": total_tva,
        "total_ttc": round(total_ht + total_tva, 2),
    }


def serialize_quote(doc: dict) -> dict:
    doc.pop("_id", None)
    doc["totaux"] = compute_totals(doc.get("lignes", []))
    return doc


async def next_numero() -> str:
    year = datetime.now(timezone.utc).year
    count = await db.quotes.count_documents({})
    return f"DEV-{year}-{count + 1:03d}"


# ---------------------------------------------------------------------------
# AI analysis
# ---------------------------------------------------------------------------
AI_SYSTEM = (
    "Tu es un assistant expert en chiffrage pour artisans du bâtiment en France. "
    "À partir d'une description de chantier en français, tu produis les lignes d'un devis. "
    "Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format:\n"
    '{"lignes": [{"designation": str, "quantite": number, "unite": str, '
    '"prix_unitaire_ht": number, "tva": number}]}\n'
    "Règles: unite ∈ [m², ml, m³, u, h, forfait, ens.]. "
    "tva ∈ [5.5, 10, 20] (10 pour rénovation de logement ancien par défaut). "
    "Utilise des prix unitaires HT réalistes du marché français. "
    "Décompose le chantier en prestations distinctes (préparation, fournitures, main d'œuvre) "
    "avec des désignations claires et professionnelles."
)


async def analyze_description(description: str) -> List[dict]:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"devis-{uuid.uuid4()}",
        system_message=AI_SYSTEM,
    ).with_model("openai", "gpt-5.4")

    msg = UserMessage(text=f"Description du chantier:\n{description}\n\nGénère les lignes du devis en JSON.")
    resp = await chat.send_message(msg)

    text = resp if isinstance(resp, str) else str(resp)
    # strip markdown fences if any
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    data = json.loads(text)
    lignes = data.get("lignes", [])
    out = []
    for l in lignes:
        out.append(QuoteLine(
            designation=str(l.get("designation", "Prestation")),
            quantite=float(l.get("quantite", 1) or 1),
            unite=str(l.get("unite", "u")),
            prix_unitaire_ht=float(l.get("prix_unitaire_ht", 0) or 0),
            tva=float(l.get("tva", 20) or 20),
        ).model_dump())
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "SOCLE Artisan API"}


@api_router.get("/company")
async def get_company():
    return COMPANY


@api_router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="Description vide")
    try:
        lignes = await analyze_description(req.description)
    except Exception as e:
        logger.exception("AI analyze failed")
        raise HTTPException(status_code=500, detail=f"Analyse IA impossible: {e}")
    return {"lignes": lignes, "totaux": compute_totals(lignes)}


@api_router.get("/quotes")
async def list_quotes(statut: Optional[str] = None):
    query = {"statut": statut} if statut else {}
    docs = await db.quotes.find(query).sort("created_at", -1).to_list(500)
    return [serialize_quote(d) for d in docs]


@api_router.get("/quotes/{quote_id}")
async def get_quote(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    return serialize_quote(doc)


@api_router.post("/quotes")
async def create_quote(payload: QuoteUpsert):
    numero = await next_numero()
    quote = Quote(
        numero=numero,
        client=payload.client,
        description=payload.description,
        lignes=payload.lignes,
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
async def set_status(quote_id: str, body: dict):
    statut = body.get("statut")
    if statut not in STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    update = {"statut": statut, "updated_at": now_iso()}
    if statut == "envoye":
        update["sent_at"] = now_iso()
    if statut == "accepte":
        update["accepted_at"] = now_iso()
    await db.quotes.update_one({"id": quote_id}, {"$set": update})
    doc.update(update)
    return serialize_quote(doc)


@api_router.post("/quotes/{quote_id}/relance")
async def relance(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    totaux = compute_totals(doc.get("lignes", []))
    client_nom = doc.get("client", {}).get("nom", "").strip() or "Madame, Monsieur"
    prenom = client_nom.split(" ")[0] if client_nom else "Madame, Monsieur"
    message = (
        f"Bonjour {prenom},\n\n"
        f"Je me permets de revenir vers vous concernant le devis {doc['numero']} "
        f"d'un montant de {totaux['total_ttc']:.2f} € TTC que je vous ai transmis.\n\n"
        f"Avez-vous pu en prendre connaissance ? Je reste à votre entière disposition "
        f"pour toute question ou ajustement, et pour convenir d'une date de démarrage des travaux.\n\n"
        f"Bien cordialement,\n{COMPANY['artisan_name']}\n{COMPANY['name']}\n{COMPANY['phone']}"
    )
    return {"message": message}


@api_router.post("/quotes/{quote_id}/mark-relance")
async def mark_relance(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    await db.quotes.update_one(
        {"id": quote_id},
        {"$set": {"statut": "a_relancer", "updated_at": now_iso()},
         "$inc": {"relance_count": 1}},
    )
    doc = await db.quotes.find_one({"id": quote_id})
    return serialize_quote(doc)


@api_router.get("/dashboard/stats")
async def dashboard_stats():
    docs = await db.quotes.find({}).to_list(1000)
    stats = {
        "a_preparer": 0, "envoyes": 0, "a_relancer": 0, "acceptes": 0,
        "ca_potentiel": 0.0, "ca_accepte": 0.0, "relance_total": 0.0,
        "temps_gagne_min": 0, "total_devis": len(docs),
    }
    for d in docs:
        t = compute_totals(d.get("lignes", []))
        ttc = t["total_ttc"]
        s = d.get("statut")
        stats["temps_gagne_min"] += d.get("time_saved_min", 0)
        if s == "brouillon":
            stats["a_preparer"] += 1
        elif s == "envoye":
            stats["envoyes"] += 1
            stats["ca_potentiel"] += ttc
        elif s == "a_relancer":
            stats["a_relancer"] += 1
            stats["ca_potentiel"] += ttc
            stats["relance_total"] += ttc
        elif s == "accepte":
            stats["acceptes"] += 1
            stats["ca_accepte"] += ttc
    for k in ("ca_potentiel", "ca_accepte", "relance_total"):
        stats[k] = round(stats[k], 2)
    return stats


# ---------------------------------------------------------------------------
# Seed demo data
# ---------------------------------------------------------------------------
DEMO_QUOTES = [
    {
        "numero": "DEV-2026-001",
        "statut": "a_relancer",
        "client": {"nom": "Mme Dubois", "telephone": "06 45 78 12 90",
                   "email": "c.dubois@email.fr", "adresse": "8 Rue de la République, 47000 Agen"},
        "description": "Refaire la peinture du salon de 32 m², deux couches blanc mat, protéger le sol, reboucher quelques fissures et remplacer 8 mètres de plinthes.",
        "lignes": [
            {"designation": "Protection du sol et du mobilier (bâches)", "quantite": 32, "unite": "m²", "prix_unitaire_ht": 2.5, "tva": 10},
            {"designation": "Rebouchage et ponçage des fissures", "quantite": 1, "unite": "forfait", "prix_unitaire_ht": 120, "tva": 10},
            {"designation": "Peinture murs et plafond - 2 couches blanc mat", "quantite": 32, "unite": "m²", "prix_unitaire_ht": 28, "tva": 10},
            {"designation": "Fourniture et pose de plinthes", "quantite": 8, "unite": "ml", "prix_unitaire_ht": 14, "tva": 10},
        ],
        "sent": True, "relance_count": 1, "days_ago": 9,
    },
    {
        "numero": "DEV-2026-002",
        "statut": "envoye",
        "client": {"nom": "M. Lefebvre", "telephone": "07 88 23 45 67",
                   "email": "lefebvre.pro@email.fr", "adresse": "22 Avenue Jean Jaurès, 69007 Lyon"},
        "description": "Rénovation salle de bain : dépose ancien carrelage, pose faïence murale 12 m² et carrelage sol 6 m², remplacement meuble vasque.",
        "lignes": [
            {"designation": "Dépose ancien carrelage et évacuation", "quantite": 18, "unite": "m²", "prix_unitaire_ht": 22, "tva": 10},
            {"designation": "Pose faïence murale", "quantite": 12, "unite": "m²", "prix_unitaire_ht": 55, "tva": 10},
            {"designation": "Pose carrelage au sol", "quantite": 6, "unite": "m²", "prix_unitaire_ht": 60, "tva": 10},
            {"designation": "Fourniture et pose meuble vasque", "quantite": 1, "unite": "u", "prix_unitaire_ht": 480, "tva": 10},
        ],
        "sent": True, "relance_count": 0, "days_ago": 3,
    },
    {
        "numero": "DEV-2026-003",
        "statut": "accepte",
        "client": {"nom": "Boulangerie Petitpain", "telephone": "04 78 12 34 56",
                   "email": "contact@petitpain.fr", "adresse": "5 Place du Marché, 69003 Lyon"},
        "description": "Peinture de la devanture et de l'arrière-boutique, environ 60 m², teinte au choix.",
        "lignes": [
            {"designation": "Préparation des supports et sous-couche", "quantite": 60, "unite": "m²", "prix_unitaire_ht": 12, "tva": 20},
            {"designation": "Peinture finition 2 couches", "quantite": 60, "unite": "m²", "prix_unitaire_ht": 26, "tva": 20},
        ],
        "sent": True, "accepted": True, "relance_count": 0, "days_ago": 15,
    },
    {
        "numero": "DEV-2026-004",
        "statut": "brouillon",
        "client": {"nom": "M. Garcia", "telephone": "06 11 22 33 44",
                   "email": "garcia.j@email.fr", "adresse": "3 Impasse des Lilas, 69100 Villeurbanne"},
        "description": "Pose de parquet flottant dans deux chambres, environ 28 m².",
        "lignes": [
            {"designation": "Fourniture parquet flottant chêne", "quantite": 28, "unite": "m²", "prix_unitaire_ht": 32, "tva": 10},
            {"designation": "Pose parquet flottant + sous-couche", "quantite": 28, "unite": "m²", "prix_unitaire_ht": 24, "tva": 10},
            {"designation": "Fourniture et pose de plinthes", "quantite": 22, "unite": "ml", "prix_unitaire_ht": 12, "tva": 10},
        ],
        "sent": False, "relance_count": 0, "days_ago": 0,
    },
]


async def seed_if_empty():
    count = await db.quotes.count_documents({})
    if count > 0:
        return
    from datetime import timedelta
    for d in DEMO_QUOTES:
        created = datetime.now(timezone.utc) - timedelta(days=d.get("days_ago", 0))
        q = Quote(
            numero=d["numero"],
            client=Client(**d["client"]),
            description=d["description"],
            lignes=[QuoteLine(**l) for l in d["lignes"]],
            statut=d["statut"],
            relance_count=d.get("relance_count", 0),
            created_at=created.isoformat(),
            updated_at=created.isoformat(),
            sent_at=created.isoformat() if d.get("sent") else None,
            accepted_at=created.isoformat() if d.get("accepted") else None,
        )
        await db.quotes.insert_one(q.model_dump())
    logger.info("Seeded demo quotes")


@api_router.post("/seed")
async def force_seed():
    await db.quotes.delete_many({})
    await seed_if_empty()
    return {"seeded": True}


@app.on_event("startup")
async def startup():
    await seed_if_empty()


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
