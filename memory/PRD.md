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

## Refonte UI GONAXIS — Lot 3 Assistant (2026-10-10) — Itération 12
- ✅ Page /assistant (nav « Assistant ») : conversation, historique de session (sessionStorage), champ fixé en bas, micro lumineux (useDictation inchangé), suggestions.
- ✅ Intentions par règles (sans IA, `lib/assistant/intents.js`) + actions métier séparées (`lib/assistant/handlers.js`) réutilisant les API existantes : créer un devis (→ /nouveau pré-rempli), lister, rechercher (nom/numéro), devis à relancer, préparer une relance (brouillon via POST /relance, jamais envoyé), chiffres clés ; modules absents signalés « pas encore disponible ».
- ✅ Aucune API/BDD modifiée. Tests frontend 100% + parcours complet création devis IA (devis de test supprimé).

## Refonte UI GONAXIS — Lot 2 (2026-10-10) — Itération 11
- ✅ Thème sombre appliqué aux pages internes (Mon activité/Devis, Nouveau devis, Détail, Paramètres/Profil) via une couche CSS `html.theme-night` (variables shadcn + surcharges des anciens tokens petrol/lagon/statuts) ajoutée par Layout ; aucun composant métier, API ou logique modifié.
- ✅ Badges de statut recolorés pour fond sombre ; dialogues/sélecteurs sombres et lisibles ; page publique /devis-client reste claire.
- ✅ Tests frontend 100% (iteration_11).

## Refonte UI « SOCLE Artisan par GONAXIS » — Lot 1 (2026-10-10) — Itération 10
Demande : transformer progressivement l'app selon la maquette GONAXIS (thème bleu nuit néon). Choix utilisateur : tuiles sans données = démo badge « Bientôt » ; prénom depuis Paramètres (artisan_name) ; page client publique reste claire.
- ✅ Thème sombre (couleurs night/electric, glass-panel, glow) ; fond sombre sur l'Accueil, autres pages encore claires (Lot 2).
- ✅ En-tête « SOCLE Artisan par GONAXIS » + cloche (point rouge si devis à relancer) + avatar initiales.
- ✅ Navigation : Accueil, Mon activité (/devis), + central (/nouveau), Assistant (/nouveau provisoire), Profil (/parametres) ; desktop : nav haut + bouton + flottant.
- ✅ Accueil : salutation, gros micro (useDictation inchangé → /nouveau avec description pré-remplie), champ de question, raccourcis IA, outils connectés, À faire aujourd'hui, actions rapides, chiffres clés (données réelles). Composants dans `components/home/`.
- ✅ Tests frontend 100% (iteration_10).

## Correctif vocal (2026-09-01) — Itération 9 (useDictation.js uniquement)
- ✅ Bug mobile résolu : le micro démarrait puis s'arrêtait aussitôt (Web Speech API). `useDictation.js` réécrit pour n'utiliser QUE getUserMedia + MediaRecorder + POST /api/transcribe (Whisper). Web Speech API totalement supprimée (mode toujours 'whisper').
- ✅ Enregistrement actif jusqu'au clic explicite « Arrêter » ; aucun useEffect/cleanup/stale closure n'appelle stop() ; deps useCallback corrigées ([supported] / []).
- ✅ catch{} vides remplacés par une vraie gestion d'erreur + console.error ; logs d'étapes (getUserMedia → MediaRecorder → started → stopped → blob → POST → transcription) ; MIME négocié via MediaRecorder.isTypeSupported. Vérifié : blob non vide (~43 Ko webm/opus) et POST /api/transcribe déclenché. Tests 100% (backend 3/3, frontend).

## Correctif déploiement (2026-09-01) — Itération 8
- ✅ Blocage résolu : sonde de santé Kubernetes `GET /health` (sans préfixe /api) renvoyait 404 → ajout de `@app.get("/health")` → `{"status":"ok"}` (200 vérifié).
- ✅ Durcissement prod : `POST /api/seed` et `POST /api/catalog/reset` protégés par `ALLOW_DEMO_RESET` (403 si absent ; les données Atlas de prod ne sont jamais effacées). Seed de démarrage idempotent (insertion si vide) conservé.
- ✅ Projections MongoDB ajoutées (get_catalog_items, list_quotes, dashboard_stats). Deployment agent : PASS. Tests backend 11/11.

## Implémenté (2026-09-01) — Itération 7
- ✅ Reconnaissance vocale gérée par Emergent (OpenAI whisper-1) : endpoint POST /api/transcribe (audio → texte français). Le hook `useDictation` utilise l'API Web Speech du navigateur si disponible, sinon bascule automatiquement sur un enregistrement micro (MediaRecorder) transcrit côté serveur par Whisper. Garde 25 Mo max.
- ✅ La dictée fonctionne donc aussi sur les navigateurs sans reconnaissance vocale intégrée. Tests 100% (backend 10/10, frontend), aucune régression.

## Implémenté (2026-09-01) — Itération 6
- ✅ UX des actions vocales unifiée : suppression des petits micros par champ ; un seul gros bouton micro central en bas de l'écran (style bouton principal), action vocale principale de l'écran courant : client → renseigner le client à la voix ; questions IA → répondre aux précisions ; lignes → modifier le devis à la voix.
- ✅ Saisie clavier conservée dans tous les champs. Aucun autre changement (PDF, email, lien client, TVA, relances, statuts, données, design). Tests frontend 100%, sans régression.

## Implémenté (2026-09-01) — Itération 5
- ✅ Saisie vocale des informations client (écran Nouveau devis, étape 1) : bouton « Renseigner le client à la voix » qui dicte une phrase naturelle et remplit automatiquement nom/raison sociale, adresse, téléphone, email (POST /api/parse-client). Champs affichés pour vérification/correction avant validation.
- ✅ Micro individuel par champ (nom, téléphone, email, adresse) ; email dicté avec « arobase »/« point » normalisé + note de vérification visuelle.
- ✅ Saisie clavier conservée en secours si la reconnaissance vocale est indisponible. Aucun autre changement (IA, TVA, PDF, email, lien client, relances, statuts, design).
- ✅ Tests : 100% (backend 6/6, frontend) — aucune régression.

## Implémenté (2026-09-01) — Itération 4
- ✅ Saisie vocale des précisions IA : micro par champ + bouton global « Répondre à la voix » ; l'IA répartit une dictée libre dans les bonnes questions (POST /api/dispatch-answers). Saisie texte conservée en secours si la reconnaissance vocale est indisponible.
- ✅ Modification vocale du devis : « Modifier à la voix » (POST /api/edit-voice) interprète des instructions naturelles (changer prix/quantité/unité/TVA, ajouter/supprimer une ligne) et affiche les modifications proposées AVANT application — jamais de modification silencieuse.
- ✅ Validation vocale sécurisée : « valide », « c'est bon », « enregistre », « envoie » ouvrent uniquement une étape de confirmation ; confirmation explicite à l'écran requise avant enregistrement/renvoi.
- ✅ TVA : une ligne « À définir » (null) n'est jamais traitée comme 0 % ; envoi définitif ET PDF final bloqués tant que la TVA n'est pas fixée (message « Vérifiez et définissez la TVA avant d'envoyer le devis »), garde côté serveur (pdf, send-email, status envoye) + côté UI.
- ✅ Email : bouton « Voir et accepter le devis en ligne » (au lieu de « signer »).
- ✅ Tests : 100% des fonctions modifiées (backend 6/6, frontend 4/4).

## Implémenté (2026-09-01) — Itération 3
- ✅ PDF professionnel (reportlab) : bouton « Télécharger le PDF », rendu imprimable (entreprise, client, N°/date, lignes, qté, prix, TVA, totaux, mentions légales, statut) aux couleurs pétrole/lagon. Endpoint GET /api/quotes/{id}/pdf.
- ✅ Envoi email réel (Resend managé Emergent) avec PDF joint : prévisualisation (destinataire + objet en lecture seule, message modifiable), délai de relance (J+5/7/10) ; mode démonstration si non configuré. Respect des guardrails (recipient/objet/HTML côté serveur, message échappé).
- ✅ Lien client unique par devis envoyé + page publique mobile `/devis-client/:token` : Accepter / Refuser avec confirmation, page de confirmation, mise à jour auto du statut ; acceptation horodatée, refus avec commentaire facultatif.
- ✅ Workflow : acceptation/refus client -> statut Accepté/Refusé + arrêt des relances ; actions manuelles conservées.
- ✅ Corrections IA : surface murale jamais déduite de la hauteur seule (demande surface murs OU périmètre+hauteur) ; TVA non présélectionnée à 10% sans contexte (« À définir » ou question).
- ✅ Tests : 100% backend (30/30) et frontend end-to-end.

## Implémenté (2026-09-01) — Itération 2
- ✅ Bouton « Modifier le devis » (brouillon → édition) / « Modifier et renvoyer » (envoyé) via `/nouveau?edit=<id>` (PUT + renvoi).
- ✅ IA en 2 temps : questions de clarification si données manquantes (surface murs ≠ sol), puis génération avec les réponses.
- ✅ Catalogue tarifaire de démonstration éditable (page Paramètres) ; lignes taguées source=catalogue/estimation ; l'IA n'invente plus de prix.
- ✅ TVA modifiable par ligne avec option « À définir » (null, non comptée tant que non fixée).
- ✅ Infos entreprise configurables (raison sociale, adresse, tel, email, SIRET, TVA, assurance, délai relance) ; Martin Rénovation = démo (is_demo).
- ✅ Workflow statuts corrigé : Brouillon → Envoyé → À relancer (dérivé, échéance) → Relancé → Accepté/Refusé. Relance → statut « Relancé » + date + compteur.
- ✅ Message de relance : nom complet + montant format FR (1 093,40 €), modifiable.
- ✅ Date de prochaine relance configurable (J+5/J+7/J+10) à l'envoi ; devis échus dans « À traiter aujourd'hui ».
- ✅ Tests : 100% backend (19/19) et frontend end-to-end.

## Implémenté (2026-09-01) — Itération 1
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
- Relances email automatiques, import catalogue réel, carnet clients.
