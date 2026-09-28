# Hébergement konzoCRM.com

## Architecture installée

VPS Ubuntu Hostinger `76.13.115.72`. Nginx existant, PostgreSQL 16 existant,
Node 24 installé séparément dans `/opt/konzocrm/node`.
Le site `kinoushstore.com` conserve son service, sa base et sa configuration.

- Frontend Vite construit avec `--base=/` et `VITE_API_URL=/api`.
- API Express : service `konzocrm`, écoute uniquement `127.0.0.1:4000`.
- Nginx transmet `/api/` et `/uploads/` sans changer les routes existantes.
- Base et rôle dédiés : `konzocrm`. Aucune base existante réinitialisée.
- Releases : `/opt/konzocrm/releases/`, lien `/opt/konzocrm/current`.
- Secrets : `/etc/konzocrm/server.env`, permissions `0640 root:konzocrm`.
- Photos et logos persistants : `/var/lib/konzocrm/uploads`.
- Sauvegardes privées : `/var/backups/konzocrm`.

La clé MFA d'origine doit être conservée avec la base. Les anciens JWT ne sont
pas réutilisés : le secret de production est distinct. Les comptes, mots de passe
et facteurs existants sont conservés.

## Première installation

`deploy/install-vps.sh` exige une nouvelle installation et refuse une base
`konzocrm` déjà présente. Préparer une archive du code et du build, une archive
du contenu de `server/uploads`, un export SQL sans propriétaires ni ACL,
une sauvegarde PostgreSQL native, `create-db.sql` et `server.env` dans
`/root/konzocrm-transfer` (0700, fichiers 0600). Ne jamais les ajouter au Git.

L'export depuis PostgreSQL 18 vers PostgreSQL 16 retire uniquement le paramètre
`SET transaction_timeout = 0` absent de PG16. La restauration utilise
`ON_ERROR_STOP=1`. Vérifier tous les nombres de lignes, les migrations et les
secrets MFA après restauration. Les URL locales des logos dans `agency_settings`
et des avatars dans `users` deviennent `https://konzocrm.com/uploads/...`.

## DNS et HTTPS

HTTPS a été activé le 28 septembre 2026 pour `konzocrm.com` et
`www.konzocrm.com`. Le renouvellement automatique est activé. Les serveurs DNS
autoritaires répondent avec `76.13.115.72`, et `www` reste un CNAME du domaine
principal. Certains résolveurs peuvent conserver temporairement l'ancienne
adresse GreenGeeks à cause du TTL de 14400 secondes.

Au déploiement initial, les serveurs GreenGeeks refusaient les requêtes pour ce
domaine. Il faut activer sa zone DNS puis configurer :

| Type | Nom | Valeur |
| --- | --- | --- |
| A | @ | 76.13.115.72 |
| CNAME | www | konzocrm.com |

Ne pas toucher aux MX/TXT de messagerie. Vérifier qu'aucun ancien AAAA pour ces
deux noms n'envoie les visiteurs vers un autre serveur. La section « Nameserver
Registration » crée des serveurs DNS privés et ne remplace pas le Zone Editor.
Pas de sous-domaine API nécessaire pour cette installation.

Une fois les deux noms résolus vers le VPS et le port 80 accessible :

```bash
bash /opt/konzocrm/current/deploy/activate-https.sh
curl --fail https://konzocrm.com/api/health
certbot renew --dry-run
```

Le certificat Let's Encrypt et le renouvellement utilisent le Certbot existant.
Le service Nginx existant est rechargé après validation de sa configuration.
Avant cette activation, le vhost HTTP répond 503 : aucun mot de passe ne doit
être saisi sur une connexion HTTP publique.

## Vérifications et exploitation

```bash
systemctl status konzocrm --no-pager
journalctl -u konzocrm -n 50 --no-pager
curl --fail http://127.0.0.1:4000/api/health
bash /opt/konzocrm/current/deploy/backup-vps.sh
```

Pour les prochaines mises à jour, sauvegarder d'abord. Construire une nouvelle
release, installer ses dépendances sous Linux, garder les uploads hors de la
release, analyser les migrations puis les appliquer avec l'environnement de
production chargé. Changer le lien `current` et redémarrer `konzocrm`.
Ne pas relancer l'installateur initial. Un retour au code précédent doit tenir
compte de la compatibilité des migrations, sans écraser des données nouvelles.

## Déploiement automatique GitHub

Le workflow `.github/workflows/deploy.yml` teste les pull requests et les pushes
sur `main` : tests serveur avec PostgreSQL 16 isolé, tests frontend, build Vite,
validation Bash. Seul `main` peut déclencher le déploiement ; les secrets SSH
sont utilisés dans un job séparé qui n'exécute aucune dépendance du repository.
Les actions GitHub utilisées sont fixées par SHA.

Le job appelle `konzocrm-deploy@76.13.115.72` avec `deploy <SHA>`. Sa clé est
distincte de la clé SSH administrateur, sans terminal, transfert de ports ni
commande arbitraire. La clé privée et la clé publique du serveur vérifiée via
l'accès SSH existant sont dans les secrets GitHub `KONZOCRM_DEPLOY_KEY` et
`KONZOCRM_KNOWN_HOSTS`. Aucun secret de production DB/MFA/SMTP n'est dans GitHub.

La commande forcée utilise `/usr/local/sbin/konzocrm-deploy-gateway`, appartenant
à root. Elle vérifie que le SHA est le dernier commit de `main`, prend un verrou,
récupère le code public depuis GitHub et construit la release sans privilèges
root ni accès aux secrets de production. Une seconde vérification de `main`
évite d'activer une version dépassée pendant sa construction.

Après validation des migrations à blanc, elle sauvegarde la base, les uploads
et l'environnement, arrête brièvement l'API, applique les migrations avec le
compte du service, change atomiquement le lien `current`, redémarre et vérifie
la base via l'API, HTTPS et la page de connexion. La construction ne coupe pas
le site ; le redémarrage peut produire une brève interruption de l'API.

Si l'activation échoue, le code précédent est réactivé. Les migrations validées
restent en place : on ne restaure pas automatiquement une ancienne base, ce qui
pourrait supprimer des données nouvelles. Les migrations doivent donc rester
additives et compatibles avec la version précédente. Les anciennes releases
et sauvegardes sont conservées ; prévoir leur nettoyage encadré à long terme.

Deux déploiements ne tournent pas simultanément et un déploiement en cours n'est
pas annulé par un nouveau push. Les versions intermédiaires devenues obsolètes
peuvent être ignorées : le dernier `main` validé est l'objectif.

Les configurations root (Nginx, systemd, cron, gateway) et les secrets ne sont
pas remplacés automatiquement par le code du repository. Leur évolution reste
une opération d'administration explicite. Pour installer ou remplacer le
gateway avec la clé publique dédiée transférée dans `/root/konzocrm-transfer`,
utiliser `deploy/setup-auto-deploy.sh` via l'accès administrateur.

Suivi : `https://github.com/Konzopro7/Konzo_one/actions`.
Le SHA en production est dans `/opt/konzocrm/current/.deployed-commit`.

Les sauvegardes sur le VPS protègent contre une erreur de déploiement. Prévoir
aussi une copie hors VPS et une politique de conservation avant l'exploitation
commerciale. Aucun effacement automatique des sauvegardes n'est configuré.
Une tâche `/etc/cron.d/konzocrm-backup` lance une sauvegarde chaque jour à
07:17 UTC via `/usr/local/sbin/konzocrm-backup` (copie stable du script).

## Services externes

SMTP n'était pas configuré au premier transfert. Configurer un expéditeur
autorisé et ses paramètres SMTP pour la récupération de mot de passe et les
emails clients. `REMINDERS_ENABLED=false` évite de lancer les anciennes relances
automatiquement pendant la mise en service. Stripe et GA4 restent configurables
dans leurs mécanismes existants ; leur connexion réelle doit être vérifiée
séparément. Ne jamais placer leurs secrets dans `client/.env` ou Git.
