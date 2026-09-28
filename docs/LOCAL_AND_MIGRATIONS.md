# Démarrage et migrations — konzoCRM.com

## Développement local

Depuis la racine du dépôt, avec PostgreSQL démarré et les fichiers `.env` locaux configurés :

```powershell
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

Frontend : `http://localhost:5173`. API : `http://localhost:4000/api`.

Ne pas écraser un `.env` existant avec un exemple. Les secrets ne sont jamais committés.

## XAMPP

Apache sert uniquement le frontend ; PostgreSQL et l’API Node sont séparés de XAMPP/MySQL.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-start-api.ps1
powershell -ExecutionPolicy Bypass -File scripts/local-deploy-xampp.ps1
Start-Process "http://localhost/konzotech-one/"
```

Démarrer Apache dans XAMPP si nécessaire. Le chemin historique reste valide après le renommage. Recharger avec Ctrl+F5 après un nouveau build. Lancer l’API avec `REMINDERS_ENABLED=false` dans un environnement d’essai pour éviter des relances réelles.

## Première inscription au suivi des migrations

Sauvegarder la base avec `pg_dump` au format personnalisé et vérifier l’archive avec `pg_restore --list`. Conserver le fichier hors du dépôt. Une archive lisible n’équivaut pas à un exercice complet de restauration.

Pour une installation existante correspondant au schéma historique :

```powershell
npm run migrate:baseline --prefix server -- --dry-run
npm run migrate:baseline --prefix server
npm run migrate --prefix server -- --dry-run
npm run migrate --prefix server
```

Le baseline vérifie la présence des tables/colonnes historiques puis enregistre les cinq migrations anciennes **sans les rejouer**. Il ne prouve pas à lui seul la conformité de toutes les contraintes ou des anciennes migrations de données. Si la vérification échoue, analyser et migrer la version ancienne sur une copie avant de poursuivre. Ne pas supprimer un volume ou relancer un seed pour résoudre un écart.

Le mode `--dry-run` exécute la transaction puis la rollback : aucune modification persistante. Les migrations du projet doivent rester transactionnelles, sans effets externes. Le suivi enregistre un checksum normalisé des fins de ligne ; un fichier appliqué modifié ou manquant bloque la suite.

Pour une base neuve : appliquer `server/sql/schema.sql` une seule fois, puis exécuter baseline et migrations ci-dessus. Le seed est réservé à une base de démonstration explicitement isolée, jamais à la base existante.

## Mises à jour suivantes

Sauvegarder, tester sur une copie, lancer le dry-run puis `npm run migrate --prefix server` avant de démarrer le nouveau backend. Ne pas modifier le SQL d’une migration déjà appliquée. Créer un nouveau fichier daté pour toute correction. Revenir au code précédent en cas de besoin ; les colonnes additives peuvent rester en place.

## Validation

```powershell
npm test
npm run build
```

Les tests PostgreSQL sont optionnels et utilisent `TEST_DATABASE_URL`. Le test finance/contacts crée des tables temporaires et annule sa transaction. Les tests ordinaires n’accèdent pas aux données réelles et n’envoient aucun message.

## Domaine de production

Les exemples de production visent `https://konzocrm.com` et `https://api.konzocrm.com`. Cela ne signifie pas que DNS, TLS ou hébergement sont configurés. Voir [le guide de déploiement](GREENGEEKS_DEPLOYMENT.md). Les liens publics déjà envoyés doivent rester accessibles via l’ancien domaine ou une redirection conservant chemin et paramètres.

Le déploiement serveur doit inclure `shared/` à côté de `server/`, car l’API importe l’identité du produit depuis ce dossier.
