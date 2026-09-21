# Audit et plan d’intégration — Konzotech CRM

Date : 21 septembre 2026. Référence : cahier des charges joint et instructions de préservation du SaaS existant.

## 1. Conclusion et périmètre

Le produit est un SaaS multi-agence opérationnel, avec un socle commercial et ERP déjà conséquent. Il faut étendre ce socle, pas reconstruire l’application. La priorité est de renforcer les contrôles d’accès et la fiabilité des opérations financières avant de multiplier les modules.

Cet audit porte sur le dépôt local : code frontend/backend, schéma SQL, cinq migrations, routes, services, configuration, scripts et tests. Les constats de sécurité sont issus de la lecture du code ; ils ne constituent pas une preuve d’exploitation en production. Aucun envoi réel, paiement, réinitialisation ou migration de la base utilisateur n’a été exécuté pour cet audit. La parité du schéma de production, les sauvegardes réellement disponibles et la configuration des fournisseurs externes restent à vérifier avant déploiement. Le responsive est présent dans le code ; aucune certification visuelle sur appareils réels n’est revendiquée.

État initial : `client/package-lock.json` était déjà signalé modifié. Cette modification préexistante doit être préservée.

## 2. Stack détectée

- Frontend : React 18, JavaScript/JSX, Vite 5, React Router 6, Tailwind CSS 3, Axios, Chart.js, Lucide, react-hot-toast.
- State management : contexte d’authentification et hooks React locaux ; pas de Redux ni de cache de requêtes central.
- Backend : Node.js en modules ESM, Express 4, Zod, bcryptjs, JWT, `pg` avec SQL paramétré et transactions explicites.
- Base : PostgreSQL ; Docker Compose déclare PostgreSQL 16. La version réellement déployée doit être contrôlée séparément.
- Documents : PDFKit ; stockage de fichiers local dans `server/uploads`.
- Communications : Nodemailer/SMTP, node-cron pour les relances, WhatsApp Cloud API.
- Paiements : SDK Stripe, Checkout pour factures et abonnements du SaaS.
- Développement/déploiement : scripts npm et PowerShell, frontend statique déployable sous XAMPP, API Node séparée ; documentation cPanel/GreenGeeks.
- Tests : Node test runner côté serveur et tests React avec react-test-renderer/Vite côté client.

Il n’y a pas de Django, ORM, TypeScript, Redis, Celery, traduction i18n centralisée ou API versionnée. Les recommandations de stack du cahier des charges ne justifient aucun remplacement.

## 3. Architecture à conserver

`client/src/App.jsx` déclare les routes, chargées à la demande. `ProtectedRoute` protège la connexion ; `useAuth` stocke le jeton et l’utilisateur dans localStorage. `AppLayout`, `Sidebar` et `Topbar` portent la navigation et l’identité visuelle. Les pages consomment `client/src/lib/api.js` et composent les composants partagés.

`server/src/server.js` monte 21 modules de routes sous `/api`, expose les uploads et démarre les relances. Les routes réalisent validation, autorisation et accès SQL ; les services factorisent PDF, emails et WhatsApp. `db.js` fournit le pool et les transactions.

Le tenant existant est **`agencies`**, relié par **`agency_id`**. Ne pas créer de table `organizations` concurrente. Un utilisateur appartient actuellement à une agence ; son email est globalement unique. Les rôles existants sont `admin`, `commercial`, `finance`, `readonly`. L’administration de plateforme repose sur une liste d’emails configurée.

Le schéma déclare 22 tables : agencies, users, agency_settings, clients, quotes, quote_items, invoices, invoice_items, reminder_logs, suppliers, purchases, purchase_items, expenses, inventory_items, stock_movements, prospects, opportunities, api_request_logs, audit_logs, chatbot_channels, chatbot_conversations, chatbot_messages.

Les lignes commerciales héritent de l’accès à leur document parent. La séparation entre agences repose surtout sur les clauses SQL ; aucune politique PostgreSQL RLS n’est définie. Les clés étrangères simples ne garantissent pas, à elles seules, l’appartenance au même tenant.

Routes publiques à préserver : `/`, `/pricing`, `/login`, `/portal/:type/:token`. Routes internes : `/dashboard`, `/pipeline`, `/quotes`, `/invoices`, `/clients`, `/messages`, `/purchases`, `/inventory`, `/expenses`, `/ledger`, `/billing`, `/platform`, `/activity`, `/team`, `/settings`.

## 4. Comparaison fonctionnelle

### Existant à réutiliser

- Inscription, connexion, essai, agence, équipe, rôles et statut actif.
- Clients : création, édition, suppression contrôlée, recherche locale, fiche avec devis et factures.
- Prospects : création, source, notes, statuts, conversion en client.
- Opportunités : prospect/client, valeur, probabilité, clôture prévue, notes, étapes et présentation par colonnes.
- Devis : numérotation, lignes, calculs, expiration renseignée, statuts, édition, PDF, email, lien public, conversion en facture.
- Factures : numérotation, échéance, lignes, PDF, email, statut payé/en attente et Checkout Stripe.
- Paramètres : identité, logo, conditions, modèles email, relances.
- Fournisseurs, achats, dépenses avec justificatifs, inventaire et mouvements de stock.
- Grand livre calculé, exports CSV/PDF, prévision de trésorerie et dashboard graphique.
- Portail documentaire par jeton : consultation, PDF, acceptation de devis, paiement.
- Journal technique d’activité, statistiques de plateforme, notifications de relance.
- Messagerie WhatsApp : conversations, réception, réponse manuelle, réponse automatique simple et simulation.

### Présent mais incomplet

- **Contacts / vue 360°** : `clients` est le registre à enrichir. Manquent prénom/nom structurés, fonction, seconde ligne téléphonique, adresse complète, langue, responsable, cycle de vie, tags, documents et timeline multicanal. Les historiques devis/factures existent déjà.
- **Entreprises clientes** : `company` est un texte dans plusieurs modèles. Il manque une entité relationnelle regroupant plusieurs contacts, avec coordonnées, secteur, site, identifiants fiscaux et responsable. Cette entreprise cliente ne doit pas être confondue avec l’agence propriétaire du SaaS.
- **Prospects** : import, responsables, tags, derniers contacts, statuts intermédiaires et conversion complète/idempotente à ajouter.
- **Opportunités/pipeline** : étapes fixes ; ni pipelines configurables, ni responsable, prochaine action, produits liés, devise propre, fichiers ou drag & drop complet. L’API propose plus d’actions que l’interface actuelle.
- **Catalogue** : l’inventaire contient déjà SKU, prix, coût, catégorie et unité. Étendre ce catalogue aux services et à l’état actif ; les lignes de devis/factures restent aujourd’hui libres.
- **Devis** : manquent duplication métier, suivi de consultation, expiration appliquée, rabais, taxes multiples et refus public. Copier un lien n’est pas dupliquer un devis.
- **Factures/paiements** : seulement deux statuts persistés ; pas de registre des paiements partiels, acomptes, remboursements, reçus ou solde détaillé. Un libellé de mode de paiement n’est pas une transaction traçable.
- **Taxes/devises** : taux unique, valeurs par défaut dispersées et CAD imposé à plusieurs endroits. Pas de barèmes datés/provinciaux ni de devise figée sur les documents.
- **Emails** : envoi documentaire SMTP avec PDF et modèles existants ; pas de boîte de réception CRM, programmation, suivi complet, consentement ou OAuth Gmail/Outlook.
- **Documents** : upload logo/justificatif présent ; pas de registre documentaire avec permissions et associations métier.
- **Notifications** : panneau des relances présent ; pas de notifications persistantes individuelles avec état lu/non lu pour tous les événements métier.
- **Audit** : traces HTTP et clés du corps de requête ; pas de véritable journal métier avant/après avec politique de conservation.
- **Portail** : liens documentaires, pas encore un espace client réunissant profil, projets, contrats, tickets et historique des paiements.
- **Dashboard/rapports** : conserver les graphiques et cartes ; enrichir leurs données après fiabilisation financière. La recherche du header retrouve des pages, pas les objets métier.
- **Tableaux/formulaires** : composants et états de chargement présents, mais pagination serveur, filtres/tri/sélection et erreurs persistantes non uniformes. Beaucoup d’erreurs ne produisent qu’un toast, puis une liste vide ou des indicateurs à zéro.
- **Accessibilité** : réutiliser les labels existants ; compléter le focus clavier, le retour du focus et la sémantique des modales sans changer leur aspect.

### Manquant

- Activités CRM centralisées, appels/réunions/notes, tâches assignées et calendrier.
- Projets, équipes projet, budgets, progression et suivi du temps.
- Tickets, échanges de support, catégories, affectation et SLA.
- Contrats, renouvellements et signatures.
- Campagnes, listes, segments, formulaires publics, consentements et désabonnements.
- Workflows configurables déclencheur → condition → action.
- Outils d’export personnel, incidents de confidentialité et conservation des données.
- Permissions granulaires et contrôles explicites d’export/attribution/approbation.
- Recherche globale métier, i18n fr-CA/en-CA, gestion cohérente CAD/USD/EUR/XOF.
- Intégrations Google/Microsoft, QuickBooks, Twilio, Drive/OneDrive, publicité Meta/Google ; WhatsApp existe déjà et doit être renforcé.

### À faire plus tard

Konzotech AI, scoring, prévisions intelligentes, recherche naturelle, campagnes avancées, intégrations multiples et automatisations complexes. Préparer des limites de modules propres, sans créer maintenant des tables vides ou des services distribués spéculatifs. Les outils de confidentialité ne doivent jamais être présentés automatiquement comme une certification juridique.

## 5. Problèmes techniques prioritaires

Les constats ci-dessous décrivent le code audité avant correction. Ils doivent être clos individuellement avec des tests.

1. **Critique — webhook Stripe non authentifié dans un cas de repli.** `routes/payments.js`, `handleStripeWebhook` : si la signature manque, le corps JSON est accepté sans vérification, même lorsqu’un secret est configuré. Des événements peuvent atteindre la mise à jour des factures/abonnements. Exiger secret et signature ; tester rejet avant toute écriture. Contrôler aussi montant, devise, statut et correspondance de session.
2. **Élevé — relations inter-agences du pipeline.** `routes/pipeline.js` accepte les IDs de client, prospect, devis et facture sans vérifier leur agence. Les jointures par ID seul peuvent exposer des noms d’une autre agence. Valider toutes les références en écriture et borner les jointures en lecture ; renforcer ensuite les contraintes SQL après inspection des données.
3. **Élevé — droits périmés dans les JWT.** `middleware/requireAuth.js` fait confiance au rôle/tenant du jeton pendant sa durée de validité. Un utilisateur désactivé ou rétrogradé n’est pas systématiquement rechargé. Vérifier le compte actuel et son agence à chaque requête ; différencier erreur de connexion et panne de base.
4. **Élevé — webhook WhatsApp.** Le POST public dans `routes/chatbot.js` n’authentifie pas la signature du fournisseur. La vérification GET du webhook ne protège pas les POST. Les faux événements peuvent déclencher des réponses. Prévoir validation sur corps brut et tests sans envoi réel.
5. **Élevé — fichiers publics et type de contenu.** `routes/uploads.js` se fie au MIME déclaré et accepte l’extension fournie ; `/uploads` est servi publiquement. Valider le contenu réel, traiter les SVG actifs, séparer logos publics et documents privés sans casser les fichiers existants.
6. **Élevé conditionnel — super-administration par email.** `platform.js`, `platformAdmin.js`, `auth.js` : une adresse privilégiée non encore enregistrée peut être revendiquée via une inscription sans vérification email. Lier le privilège à une identité provisionnée/vérifiée, pas à une simple déclaration d’adresse.
7. **Finances — confirmations d’abonnement rejouables.** `billing.js` réactive sur une session complète et remet une échéance relative ; l’état courant de l’abonnement doit être vérifié. Les changements de plan doivent éviter plusieurs abonnements concurrents. Prévoir idempotence et ordre des événements.
8. **Finances — total client multiplié.** `clients.js` joint simultanément devis et factures puis somme les factures. Plusieurs devis multiplient les lignes de factures : deux devis et une facture de 100 peuvent produire 200. Préagréger séparément.
9. **Finances — taux zéro perdu en édition.** `QuotesPage.jsx` et `InvoicesPage.jsx` utilisent `taxRate || 0.2` : ouvrir un document à taux zéro remplace ce taux par 20 %. Utiliser une valeur de repli uniquement en cas d’absence, puis tester aller-retour à zéro.
10. **Finances — concurrence et historique.** La numérotation verrouille la dernière ligne, mais ne sérialise pas correctement tous les cas, notamment une série vide. La conversion interne devis/facture peut créer des doublons concurrents. Les documents payés restent modifiables/supprimables ; introduire des règles métier compatibles et un historique explicite.
11. **CRM — conversion répétée.** La conversion prospect/client verrouille le prospect mais n’utilise pas son `converted_client_id` pour empêcher une nouvelle création. Réutiliser le client déjà créé et conserver les associations.
12. **Portail — transitions trop permissives.** L’acceptation doit vérifier validité et état du devis ; prévoir révocation/expiration contrôlée des liens et preuve d’acceptation. Ne pas exposer les jetons dans les journaux.
13. **Relances — paramètres non appliqués.** `services/reminders.js` n’utilise pas les modèles de relance enregistrés ; certains contenus sont construits en anglais et interpolés directement. Réutiliser le moteur de templates et son échappement.
14. **Relances — doublons et simulation.** Vérifier puis envoyer puis enregistrer ne réserve pas atomiquement le travail. Plusieurs processus peuvent envoyer deux fois. Le transport SMTP JSON ne constitue pas une livraison réelle ; distinguer simulation, envoi et échec.
15. **URL — racine frontend ambiguë.** `CLIENT_URL` sert à la fois à une liste CORS et à fabriquer des liens. Séparer URL publique canonique et origines autorisées. `ClientPortalPage.jsx` redirige vers `/portal/...` sans basename, ce qui casse le sous-répertoire XAMPP.
16. **Grand livre — filtres incorrects.** `ledger.js` commence les paramètres à `$1` dans les filtres alors que `$1` est déjà réservé à `agencyId`. Les exports filtrés peuvent échouer ou filtrer sur la mauvaise valeur. Les exports sont plafonnés sans signaler clairement la troncature. L’échappement CSV ne neutralise pas les formules de tableur.
17. **Indicateurs — sémantique à préciser.** Les revenus sont rattachés à la date de facture et non d’encaissement ; « clients actifs » compte tous les clients ; le grand livre inclut les dépenses approuvées comme sorties. Ce sont des approximations, pas une comptabilité complète.
18. **Durcissement général.** Pas de limitation des tentatives de connexion ; validation de dates/tailles inégale ; erreurs SQL parfois présentées comme erreurs d’authentification ; TLS PostgreSQL avec vérification de certificat désactivée en production. Les accès en lecture/export sont souvent autorisés à tous les rôles authentifiés.
19. **Journalisation/secrets.** URL complètes avec jetons dans les logs, IP transférée acceptée sans politique de proxy, logs best-effort sans conservation. Jetons WhatsApp stockés en clair. Prévoir masquage, chiffrement de secrets et audit métier ciblé.
20. **Performance.** Listes principales sans pagination ; conversations et messages chargés intégralement ; agrégations et index à adapter aux filtres. Conserver les contrats API existants pendant la transition.
21. **Migrations/exploitation.** Pas de registre d’exécution des migrations. La migration CAD remplace les anciennes préférences de devise : ne pas la rejouer comme conversion monétaire. Le README propose une suppression de volume Docker pour une mise à niveau : remplacer cette procédure par sauvegarde et migration additive. Les scripts de démarrage/arrêt ciblent largement `src/server.js`, pas uniquement ce dépôt.

## 6. Vérifications réalisées et limites

- `npm test` : 9 tests serveur et 8 tests client réussis sur le socle initial.
- `npm run build` : réussite, 1 718 modules transformés, pages chargées en chunks distincts.
- `npm audit` : serveur 4 alertes (2 élevées, 1 modérée, 1 faible) ; client 13 (6 élevées, 5 modérées, 2 faibles). Résultat du registre au moment de l’audit ; examiner la portée runtime/dev et chaque correctif avant mise à jour. Aucun `audit fix --force` exécuté.
- Les tests existants couvrent surtout calculs, abonnements, utilitaires WhatsApp et composants. Ils ne démontrent pas l’isolation des agences, les autorisations de toutes les routes, la sûreté des webhooks ou des migrations.
- Pas de test de charge, de restauration de sauvegarde, de paiement réel, de livraison SMTP ou de validation visuelle multi-écran réalisé dans cet audit.

## 7. Plan par phases et fichiers concernés

### Phase 1 — Fondations, par petits lots

1. Authentification : recharger l’utilisateur actif, rôle et agence depuis la base ; conserver les JWT et routes actuels. Fichiers : `middleware/requireAuth.js`, tests dédiés, puis `team.js` et `auth.js` selon besoin.
2. Isolation : sécuriser les références du pipeline et les jointures ; tests croisés agence A/B sur création, modification, consultation et suppression. Fichiers : `routes/pipeline.js`, puis audit systématique des autres routes.
3. Webhooks : signatures obligatoires, gestion des configurations absentes, validation des événements Stripe et WhatsApp, idempotence. Fichiers : `routes/payments.js`, `routes/chatbot.js`, `server.js`, services et tests.
4. Accès et fichiers : matrice explicite conservant les quatre rôles, restriction des exports, privilège plateforme vérifié, validation des uploads et séparation public/privé.
5. Exploitation : runner de migrations avec suivi/checksum, sauvegarde/restauration documentée, logs expurgés, erreurs cohérentes, URLs canoniques, correction ciblée des dépendances et tests CI.

Critère de sortie : compte désactivé refusé immédiatement, rétrogradation effective, aucun accès croisé A/B dans les scénarios testés, webhooks falsifiés rejetés sans effet, migrations compatibles avec la base antérieure. Les premiers correctifs d’authentification et de validation peuvent être faits sans migration.

### Phase 2 — CRM

Étendre `clients` ; ajouter les entreprises clientes et leurs liens ; compléter prospects et conversion ; rendre les pipelines configurables ; ajouter activités et tâches. Enrichir la fiche existante avec les mêmes modales/formulaires/tableaux. Fichiers : `clients.js`, `pipeline.js`, `ClientsPage.jsx`, `PipelinePage.jsx`, migrations ; nouveaux modules métier uniquement pour entreprises, activités et tâches. Introduire recherche, filtres et pagination progressivement.

### Phase 3 — Ventes

Étendre `inventory_items` au catalogue produits/services ; corriger d’abord taux zéro, agrégations et concurrence. Ajouter taxes configurables avec snapshots, statuts documentaires, duplication, paiements partiels et remboursements. Réutiliser Stripe, PDFKit, mailer et éditeur de lignes. Fichiers : `inventory.js`, `quotes.js`, `invoices.js`, `payments.js`, `billing.js`, `ledger.js`, `calculations.js`, `docNumbers.js`, services PDF/templates et pages correspondantes.

### Phase 4 — Exploitation

Projets et calendrier réutilisant les tâches ; registre documentaire avec ACL sur le stockage existant ; notifications persistantes dans le panneau existant. Ajouter les données utiles au dashboard sans refaire ses cartes. Créer seulement les routes/pages nécessaires ; préserver le système de navigation et son style.

### Phase 5 — Support

Tickets, messages, pièces jointes, priorités, affectation ; enrichissement progressif du portail existant. L’accès client doit être distinct d’un accès employé à toute l’agence. Préserver les anciennes URL par jeton pour les documents déjà envoyés. Contrats et renouvellements peuvent être intégrés ensuite selon les besoins commerciaux.

### Phase 6 — Automatisations

Fiabiliser d’abord les relances existantes ; événements métier persistés, exécutions idempotentes, retries bornés et historique. Puis règles déclencheur/condition/action simples. Une file PostgreSQL légère peut suffire au départ ; Redis ou microservices ne sont pas un prérequis.

### Phase 7 — Marketing

Consentements traçables avant campagnes : canal/type/statut/date/source/preuve/retrait ; désabonnements effectifs, segmentation, listes et formulaires. Réutiliser contacts, tags et email ; ne pas créer un deuxième carnet d’adresses.

### Phase 8 — Rapports

Rapports ventes/finance/support/marketing basés sur événements et paiements réels. Séparer montants par devise, appliquer permissions d’export et pagination. Réutiliser dashboard, Chart.js et exports existants.

### Phase 9 — Intégrations

Google/Microsoft puis QuickBooks/Twilio selon besoins validés ; OAuth, permissions minimales, secrets protégés, webhooks vérifiés et synchronisations idempotentes. Renforcer WhatsApp existant, sans second connecteur concurrent.

### Phase 10 — IA

Services limités au tenant et aux permissions existantes, après stabilisation des données. Résumés et rédaction assistée en premier ; aucune action sensible automatique implicite.

## 8. Évolution de la base sans perte de données

- Conserver `agencies`, `users`, leurs identifiants et tous les liens existants. Ne pas introduire automatiquement memberships ou organizations.
- Ajouter aux clients des colonnes nullable pour les informations CRM ; conserver `name`, `company`, email et `/clients` pour compatibilité. Ne pas découper automatiquement des noms ambigus.
- Créer une table d’entreprises **clientes** tenant-scopée et des `company_id` nullable. Conserver le texte historique ; ne pas fusionner deux entreprises sur le seul nom.
- Ajouter pipelines/étapes configurables avec correspondance des cinq étapes historiques ; maintenir temporairement `stage` pour les anciens consommateurs.
- Créer activités et tâches une seule fois, avec associations validées ; les projets réutiliseront ces tâches.
- Ajouter devise figée et détail de taxes aux nouveaux documents sans recalculer les anciens. Aucun taux légal supposé dans le code ; configuration centralisée avec juridiction et date d’effet.
- Ajouter un registre de paiements/allocations/remboursements. Une reprise des anciennes factures payées devra être marquée « historique importé » ; ne pas inventer une date d’encaissement ou une référence bancaire.
- Ajouter contraintes tenant cohérentes, unicités métier et index seulement après inventaire des incohérences/doublons. Ne pas supprimer silencieusement des enregistrements pour faire passer une contrainte.
- Ajouter métadonnées documentaires sans déplacer ni supprimer automatiquement les fichiers ; prévoir compatibilité des liens déjà utilisés.
- Ajouter table d’événements webhook et suivi des migrations au moment du lot concerné. Les tables projets/support/marketing ne sont créées que dans leur phase.
- Pour chaque migration : sauvegarde vérifiée, répétition sur copie isolée, vérification des volumes/relations, application contrôlée, déploiement compatible et procédure de retour applicatif. Ne pas lancer le seed sur la base utilisateur.

## 9. Risques de régression et stratégie de validation

Les zones les plus sensibles sont la session après changement de rôle, la facturation SaaS, les liens publics déjà envoyés, les anciennes devises, les conversions concurrentes, les exports et les uploads. La pagination ne doit pas remplacer brutalement un tableau JSON par un objet sans adapter tous ses consommateurs.

Pour chaque lot : tests unitaires utiles, tests de route avec agence A/B et rôles, tests SQL sur une base isolée pour contraintes/transactions, tests de migration avec anciennes données, puis build et parcours des pages touchées. Les doubles clics et événements répétés font partie des scénarios. Tester les paiements et emails avec doubles de test ou environnements sandbox, jamais sur les clients réels.

Avant les premières modifications visuelles fonctionnelles : captures de référence desktop/tablette/mobile des pages existantes. Comparer ensuite mêmes données et mêmes dimensions. Vérifier clavier, états loading/empty/error/success et comportement au sous-chemin `/konzotech-one/`.

## 10. Invariants de préservation

Ne pas modifier l’identité : logos, palette, typographie, rayons, boutons, cartes, tableaux, espacements, sidebar, header ou structure de navigation. Réutiliser `index.css`, `tailwind.config.js`, `AppLayout`, `Sidebar`, `Topbar`, `Modal`, `StatCard`, `StatusBadge`, `LineItemsEditor` et les classes `card`, `field-input`, `field-label`, `btn-primary`, `btn-secondary`.

Ne pas remplacer le dashboard, le PDF, Stripe, SMTP ou WhatsApp par des systèmes parallèles. Ne pas supprimer les migrations, tables, colonnes, données, fichiers ou URL existants. Préserver également achats, dépenses, fournisseurs et stocks, même s’ils sont moins centraux dans la première phase CRM.

Le résultat recherché reste le même SaaS visuellement, enrichi par des changements fonctionnels vérifiables et progressifs.

## 11. Suivi du premier lot — 21 septembre 2026

Après préparation et présentation de l’audit, le premier lot de phase 1 a été implémenté dans `middleware/requireAuth.js` : relecture du compte à chaque requête, rejet des comptes désactivés/supprimés, application du rôle et de l’email actuels, rejet d’un ancien jeton portant une autre agence, compatibilité avec les jetons historiques sans rôle/agence. Les erreurs de base passent désormais au gestionnaire serveur au lieu d’être assimilées à des identifiants invalides.

Huit tests dédiés couvrent rétrogradation, désactivation, suppression, changement d’agence, compatibilité historique, panne de base, jeton invalide et expiration. Les 25 tests serveur/client passent. Ces tests utilisent un accès SQL simulé et ne modifient aucune base utilisateur. Aucun frontend, style, URL ou schéma SQL n’est modifié par ce lot. Le constat 3 est traité pour les contrôles d’accès à chaque requête ; la révocation explicite des sessions à la déconnexion reste une évolution distincte. Les autres constats restent ouverts, notamment les webhooks et les relations du pipeline.
