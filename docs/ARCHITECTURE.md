# Architecture de konzoCRM.com

## Organisation du dépôt

```text
client/
  src/pages/        Écrans et parcours métier
  src/components/  Formulaires, modales, tableaux et composants réutilisés
  src/layout/      Navigation, sidebar et header existants
  src/hooks/       Authentification et état partagé
  src/lib/         API, formatage et uploads
  public/          Logos et favicon conservés
  tests/           Tests de composants avec API simulée
server/
  src/routes/      API Express existante sous /api
  src/middleware/ Authentification, rôles et webhooks
  src/services/   Emails, PDF, relances, WhatsApp et migrations
  src/utils/      Calculs, numérotation, validation et mapping
  sql/schema.sql  Schéma initial historique
  sql/migrations/ Évolutions SQL ordonnées, immuables une fois appliquées
shared/
  brand.mjs        Nom et identité textuelle du produit
scripts/           Démarrage local et builds
docs/              Architecture, exploitation, déploiement et feuille de route
```

Cette organisation conserve les emplacements du code existant. Les nouveaux modules doivent suivre ces conventions ; aucun déplacement massif n’est nécessaire.

## Conventions à préserver

- React/Vite/Tailwind côté client, Express/PostgreSQL côté serveur.
- `agencies` et `agency_id` restent la frontière multi-tenant. Une entreprise cliente future sera une entité CRM distincte.
- Réutiliser `clients`, `prospects`, `opportunities`, `quotes`, `invoices`, le catalogue d’inventaire, Stripe, PDFKit et les emails existants.
- Les changements de profil contact omis d’un ancien appel API ne doivent pas écraser les nouvelles informations.
- Toute référence métier et toute requête doivent être contrôlées dans l’agence courante ; masquer un bouton ne remplace pas une permission API.
- Les colonnes nouvelles sont additives et nullable pour les anciens enregistrements. Les migrations déjà enregistrées ne sont pas réécrites.
- Garder les styles, logos, composants et routes actuels. Le nom produit change ; les noms des agences et des clients enregistrés restent leurs données.

## Identité du produit et compatibilité

Le nom public est **konzoCRM.com** ; le domaine canonique visé est `konzocrm.com`. `shared/brand.mjs` est la référence utilisée par le code. Le titre HTML statique dans `client/index.html` doit rester cohérent avec ce nom.

Les noms npm, le dépôt GitHub `Konzo_one`, le répertoire `KONZO-SAAS`, les clés localStorage, les identifiants Docker/PostgreSQL et le chemin XAMPP `/konzotech-one/` restent historiques pour préserver les installations. Ils ne sont pas des marques affichées au client et ne doivent pas être renommés par remplacement global.

Les fichiers SVG existants sont conservés. Les coordonnées SMTP/PDF de chaque agence sont prioritaires sur les valeurs de repli ; aucun changement de nom ne réécrit les données des agences. L’expéditeur SMTP réel doit rester une adresse vérifiée. Le changement de domaine exige séparément DNS, certificat TLS, configuration API/CORS et URLs de retour des fournisseurs.
