# SOCLE Artisan – Assistant Devis IA

## Problème (énoncé original)
Application web responsive en français permettant à un artisan de transformer notes/dictée chantier en devis professionnel, puis de suivre envoi et relances. MVP mobile-first, très soigné visuellement, sans authentification. Parcours complet: description chantier → analyse IA → devis → validation → suivi/relance.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Routes préfixées `/api`. IA via emergentintegrations (LlmChat, modèle `gpt-5.4`, EMERGENT_LLM_KEY).
- **Frontend**: React 19 + react-router + react-query + Tailwind + shadcn/ui. Palette bleu pétrole / lagon.
- **Modèles**: Quote (numero, client, description, lignes[], statut, timestamps, relance_count), QuoteLine, Client. Totaux HT/TVA/TTC calculés côté serveur.

## Personas
- Artisan du bâtiment non technophile (ex: Martin Rénovation), sur smartphone en chantier.

## Requirements (statiques)
- Tableau de bord "À traiter aujourd'hui" + stats (à préparer, envoyés, à relancer, CA potentiel, temps gagné, CA accepté).
- Assistant Nouveau devis IA en 3 étapes: client → description (texte + dictée micro) → lignes éditables + totaux.
- Analyse IA: description → lignes structurées (désignation, quantité, unité, PU HT, TVA).
- Prévisualisation devis pro (coordonnées, numéro, date, client, tableau, totaux, mentions légales).
- Statuts Brouillon/Envoyé/À relancer/Accepté + actions Enregistrer/Envoyer/Marquer accepté/Relancer (message prérempli modifiable).

## Implémenté (2026-09-01)
- ✅ Dashboard, liste devis filtrable, wizard 3 étapes, éditeur de lignes réactif, prévisualisation, transitions de statut, modal de relance.
- ✅ Analyse IA réelle (gpt-5.4) → 8 lignes réalistes sur l'exemple Mme Dubois.
- ✅ 4 devis de démo préchargés (Martin Rénovation), auto-seed au démarrage; POST /api/seed pour réinitialiser.
- ✅ Dictée vocale (Web Speech API, fr-FR) avec waveform animée.
- ✅ Tests: 100% backend (13/13) et frontend end-to-end.

## Backlog priorisé
- P1: Génération PDF du devis + envoi email réel (Resend).
- P1: Persistance clients réutilisables (carnet clients).
- P2: Authentification multi-artisans, paramètres entreprise éditables.
- P2: Signature électronique / lien d'acceptation client.
- P2: Séquence de numérotation robuste (compteur dédié vs count_documents).

## Prochaines tâches
- Export PDF, envoi email, carnet clients.
