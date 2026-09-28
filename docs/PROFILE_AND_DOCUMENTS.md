# Profil personnel et documents commerciaux

Cliquer sur la pastille du compte dans le header ouvre `/profile`. Chaque rôle peut modifier son propre nom affiché et importer ou retirer une photo/logo personnelle. L’email, le rôle et l’entreprise restent gérés par les mécanismes existants. La photo personnelle ne remplace pas le logo de l’entreprise.

Les administrateurs peuvent importer le logo de l’entreprise dans Paramètres → Identité puis enregistrer les modifications. Ce logo apparaît désormais dans les PDF de devis, factures et bons d’achat. PNG, JPG et WebP sont pris en charge (5 Mo à l’import). Le serveur vérifie et normalise les images pour permettre leur affichage dans les PDF. Les anciennes images locales WebP sont également reconnues.

Le moteur PDFKit existant reste utilisé. Les couleurs sont celles des documents précédents. La mise en page ajoute le logo, une hiérarchie plus claire, des coordonnées sans placeholders fictifs, les statuts, les totaux, les notes des devis et une pagination. Les descriptions et conditions longues passent sur les pages suivantes avec en-têtes et pieds de page. Les montants enregistrés, les numéros et les règles de calcul ne changent pas ; « Taxes » remplace le libellé générique « TVA ». Les PDF téléchargés, les pièces jointes email et ceux du portail utilisent le même générateur.

Le générateur ne télécharge pas de logo distant : il lit uniquement les fichiers importés depuis cette API appartenant à l’entreprise. Pour un logo renseigné par lien externe, l’importer dans les paramètres afin de l’intégrer au PDF. Les avatars sont enregistrés dans le dossier du compte et ne peuvent pas être associés au profil d’un autre compte.

La migration additive `2026-09-27-user-avatar.sql` ajoute uniquement `users.avatar_url`, nullable. Sauvegarder la base, lancer `npm run migrate --prefix server -- --dry-run`, puis `npm run migrate --prefix server` avant de redémarrer l’API. Installer les dépendances serveur avec `npm ci --prefix server` : Sharp est utilisé pour valider les images et convertir WebP en PNG. Les images reprennent le stockage public existant des uploads.

Validation : `npm test`, `npm run build`, tests PostgreSQL optionnels avec `TEST_DATABASE_URL` (tables temporaires et rollback). Pour produire des exemples avec données fictives sans contacter de clients :

```powershell
node scripts/preview-business-pdfs.mjs
```

Les exemples sont écrits dans `output/pdf/` et ignorés par Git. Vérifier le logo, les descriptions, les montants, la pagination et les conditions après toute modification du générateur.
