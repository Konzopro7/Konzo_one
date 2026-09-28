# Console propriétaire et Google Analytics 4

La console existante reste à `/platform`, accessible dans **Admin SaaS** aux comptes autorisés dans `SUPER_ADMIN_EMAILS`, après double authentification. Les routes ordinaires des entreprises gardent leur isolation. Aucun mécanisme d’impersonation ou de contournement MFA n’est ajouté.

## Pilotage et gestion

- **Vue d’ensemble** : entreprises, utilisateurs actifs, abonnements, couverture MFA, suspensions, inscriptions et trafic API. La valeur mensuelle des plans ne compte que les abonnements actifs et reste une estimation tarifaire, pas un encaissement vérifié.
- **Entreprises et utilisateurs** : recherche, filtre d’abonnement, pagination de 20 lignes, consultation des dix modules existants (utilisateurs, contacts, prospects, opportunités, devis, factures, fournisseurs, achats, dépenses, inventaire). Les fiches détaillées affichent les données et lignes de documents ; les mots de passe, secrets MFA et jetons privés sont exclus.
- **Gestion** : rôles, activation/désactivation des comptes, suspension/réouverture des espaces, plan et statut des abonnements locaux. Les comptes propriétaire, l’espace courant et le dernier administrateur actif sont protégés dans cette console. Les changements de compte invalident ses sessions. Chaque intervention exige un motif et est journalisée avec avant/après.
- **Abonnements Stripe** : leurs plans/statuts ne peuvent pas être modifiés localement lorsqu’un abonnement Stripe est lié. Stripe et ses webhooks restent la source de leur facturation. Une modification administrative locale ne déclenche jamais de paiement.
- **Suspension** : bloque les API métier authentifiées ; le profil, le guide, la facturation et la console propriétaire restent atteignables selon leurs permissions habituelles. Les liens publics de documents existants ne sont pas supprimés ni invalidés par cette suspension d’espace.
- **Connexions et sécurité**, **Interventions admin** : journaux séparés, réutilisant `audit_logs`. La consultation des données par le propriétaire est également journalisée.

Les modules futurs du cahier des charges ne sont pas créés par cette console. Les opérations métier continuent de se modifier depuis leurs modules existants. Cette version ne supprime pas de comptes/entreprises/données.

## Configuration GA4

1. Créer ou sélectionner une propriété Google Analytics 4 et son flux Web. Dans **Admin SaaS → Google Analytics 4**, renseigner l’identifiant de mesure `G-…` et l’identifiant numérique de propriété. Ces deux identifiants ne sont pas des mots de passe.
2. Dans Google Analytics, désactiver la **mesure améliorée** automatique du flux Web. La console demande de confirmer cette opération avant d’activer le suivi ; elle ne modifie pas la propriété Google à votre place. Les pages vues sont envoyées manuellement pour éviter les doubles comptages et les collectes automatiques de formulaires/URLs.
3. Pour afficher les rapports intégrés, activer **Google Analytics Data API** dans un projet Google Cloud et créer un compte de service. Ajouter son adresse email aux accès de la propriété GA4 avec une permission de lecture adaptée.
4. Garder son fichier JSON de clé privée hors du repository et du web root. Définir `GA4_CREDENTIALS_PATH` avec son chemin absolu dans `server/.env`, puis redémarrer l’API. La clé n’est jamais téléchargée depuis le navigateur ni retournée par les endpoints.
5. Activer le suivi si souhaité. Visiter les pages publiques, accepter la mesure d’audience et vérifier les événements dans Google Analytics. Les bloqueurs, refus et délais de traitement peuvent limiter ou retarder les chiffres.

Sans identifiants, le suivi reste désactivé. Sans propriété et fichier de compte de service, le tableau affiche **Connexion Google à compléter** plutôt que des chiffres inventés. Un accès Google refusé affiche une erreur explicite. La connexion réelle à Google nécessite les identifiants et permissions de votre propre compte ; les tests automatiques n’utilisent ni propriété réelle ni clé privée.

## Collecte et confidentialité

Le script Google n’est chargé qu’après acceptation du visiteur sur l’accueil, les tarifs ou la connexion. Les écrans CRM, la réinitialisation de mot de passe et les portails privés sont exclus. Les préférences se changent sur les pages publiques ; un refus retire le document de collecte et les cookies GA concernés sur le domaine courant.

La collecte fonctionne dans un document séparé `analytics-frame.html`, sans navigation CRM ni champs de formulaire. Il accepte uniquement des messages de son parent de même origine et des chemins explicitement autorisés. Les événements utilisent des titres constants et des URLs canoniques sans query string ni fragment. Ils ne reçoivent aucun nom/email de compte, montant financier, identifiant client ou jeton privé. Les options publicitaires sont désactivées. Google reste un prestataire externe de mesure d’audience ; adapter votre politique et vos choix de conservation. Cette intégration ne constitue pas une certification juridique.

## Rapports

Rapports de 7, 30 ou 90 jours : utilisateurs actifs, sessions, pages vues, taux d’engagement, évolution journalière, canaux d’acquisition et pages populaires. L’API Google est appelée avec le scope `analytics.readonly`. Les résultats restent dans la console propriétaire, avec un cache de cinq minutes et un timeout réseau. Les chiffres GA4 sont distincts du trafic API enregistré par le SaaS.

## Migration et validation

Sauvegarder la base et appliquer `2026-09-28-platform-console.sql` via le runner existant. La migration ajoute `agencies.is_suspended` (défaut `false`) et une configuration globale singleton `platform_settings`. Elle ne crée pas un nouvel équivalent de tenant/organisation et ne touche pas aux relations métier.

Les tests couvrent les permissions propriétaire, les lectures par entreprise, l’exclusion des secrets, les protections d’administration, les mutations journalisées, les suspensions, les réglages GA4, la lecture de rapports simulés et la collecte frontend sans URL privée. Les services locaux sont vérifiés par HTTP ; l’accès réel à Google nécessite une vérification après configuration.

Documentation officielle : [pages vues](https://developers.google.com/analytics/devguides/collection/ga4/views), [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart), [consentement Google](https://developers.google.com/tag-platform/security/guides/consent).
