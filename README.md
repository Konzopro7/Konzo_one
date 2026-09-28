# konzoCRM.com

CRM SaaS multi-agence construit sur React, Express et PostgreSQL. Le projet évolue progressivement en conservant son design, ses données et ses URL.

La version en ligne est accessible sur **[https://konzocrm.com](https://konzocrm.com)**.
Les adresses `localhost` ci-dessous concernent uniquement le développement sur votre ordinateur.

## Démarrer

Avec PostgreSQL actif et les fichiers .env existants configurés :

```powershell
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

Ouvrir http://localhost:5173. L’API écoute sur http://localhost:4000/api.

Pour la version XAMPP déjà installée :

```powershell
Start-Process "http://localhost/konzotech-one/"
```

Apache et l’API Node doivent être démarrés. Voir le guide ci-dessous.

## Documentation

- [Architecture et organisation du code](docs/ARCHITECTURE.md)
- [Démarrage local, sauvegardes, migrations et tests](docs/LOCAL_AND_MIGRATIONS.md)
- [Déploiement de production](docs/GREENGEEKS_DEPLOYMENT.md)
- [Stripe, essais et annulation des abonnements](docs/STRIPE_AND_TRIALS.md)
- [Vérification du parcours client](docs/CLIENT_READINESS.md)
- [Audit, écarts et plan de développement](docs/AUDIT_ET_PLAN_INTEGRATION.md)

Le dossier client contient l’interface ; server contient l’API et SQL ; shared contient l’identité du produit ; scripts et docs regroupent les outils et guides d’exploitation.

## Fonctionnalités présentes

- Agences, utilisateurs, quatre rôles et abonnements Pro/Premium.
- Contacts, profils CRM détaillés, prospects, opportunités et pipeline.
- Devis, factures, PDF, emails, portail documentaire et paiement Stripe.
- Fournisseurs, achats, dépenses, inventaire et grand livre simplifié.
- Dashboard, exports, relances, journal d’activité et conversations WhatsApp.

Entreprises clientes relationnelles, tâches, projets, support, campagnes et automatisations avancées restent dans le plan d’intégration. Le cahier des charges complet n’est pas encore livré.

## Tests et migrations

```powershell
npm test
npm run build
npm run migrate --prefix server -- --dry-run
```

Avant la première utilisation du runner, suivre la procédure de baseline dans le guide. Sauvegarder avant toute migration. Ne jamais supprimer le volume PostgreSQL pour mettre à jour une installation contenant des données.

## Configuration et marque

Les exemples se trouvent dans server/.env.example, client/.env.example et leurs variantes de production. Aucun secret réel n’est versionné. Les webhooks nécessitent leurs secrets de signature.

La double authentification est obligatoire pour tous les comptes CRM. Configurez `MFA_ENCRYPTION_KEY` avant de démarrer l’API et sauvegardez cette clé avec la base. Consultez le [guide administration et sécurité](docs/SECURITY_AND_MFA.md) pour la connexion, les codes de secours et les journaux.

La console propriétaire **Admin SaaS** permet le pilotage et la gestion des espaces/utilisateurs. L’intégration Google Analytics 4 se configure depuis cette console : [guide propriétaire et GA4](docs/PLATFORM_ADMIN_AND_GA4.md).

Le nom public **konzoCRM.com** est centralisé dans shared/brand.mjs. Les noms d’agences enregistrés, les logos et le design sont conservés. Les identifiants techniques historiques restent compatibles : base, volume, dépôt GitHub, dossier local et sous-chemin XAMPP.

La production utilise konzocrm.com avec HTTPS et un déploiement automatique après validation des tests sur la branche main. Les paramètres des fournisseurs externes restent privés sur le serveur.
