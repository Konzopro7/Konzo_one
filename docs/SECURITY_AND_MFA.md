# Administration et double authentification

## Où consulter l’activité

- **Activité** (`/activity`) : actions métier et journal des connexions de l’entreprise courante, réservé au rôle `admin`.
- **Admin SaaS** (`/platform`) : métriques de plateforme, trafic API et journal de sécurité global, réservé aux emails déjà configurés dans `SUPER_ADMIN_EMAILS`.
- Le nouveau journal possède recherche par nom/email, filtre réussi/refusé, actualisation et pagination de 30 événements. Une connexion avec un email inconnu est enregistrée comme compte non identifié ; l’adresse saisie n’est pas conservée.
- Les métriques de trafic concernent l’API. Cette console n’est pas un accès automatique à tous les documents métier des entreprises. Les actions réalisées hors API et les données historiques non journalisées ne sont pas reconstituées.

## Connexion obligatoire en deux étapes

Tous les comptes utilisateurs du CRM, y compris administrateurs et nouveaux inscrits, doivent fournir leur mot de passe puis un code TOTP d’une application compatible (Google Authenticator, Microsoft Authenticator, etc.). La première connexion présente un QR code et une clé manuelle. L’activation n’est enregistrée qu’après validation du code.

Dix codes de secours sont affichés une fois après activation. Le client attend leur sauvegarde déclarée avant d’ouvrir l’espace de travail. Chaque code fonctionne une seule fois. L’application peut être utilisée hors ligne après configuration ; le téléphone doit avoir une heure correctement synchronisée. Les anciennes sessions sont volontairement rejetées et nécessitent une nouvelle connexion. Les portails publics de devis/factures conservent leurs liens privés existants : ce sont des accès par jeton, pas des comptes utilisateurs du CRM.

Il n’existe aucun bouton administrateur pour contourner la double authentification. En cas de perte du téléphone **et** de tous les codes de secours, un opérateur doit vérifier l’identité hors application avant une récupération supervisée ; aucun endpoint public de réinitialisation n’est proposé dans cette version.

## Exploitation

1. Sauvegarder la base existante avant de lancer `npm run migrate --prefix server` (migration additive `2026-09-27-mandatory-mfa.sql`). Aucun compte ni document n’est supprimé.
2. Définir `MFA_ENCRYPTION_KEY` dans `server/.env` : clé aléatoire de 32 octets encodée en base64. Exemple de génération dans `.env.example`. Le serveur refuse de démarrer sans une clé valide.
3. Sauvegarder cette clé séparément et de manière protégée avec la base. Ne jamais la publier, la remplacer sans migration de chiffrement, ni la perdre : les facteurs déjà inscrits deviendraient illisibles.
4. Redémarrer l’API et reconstruire/déployer le frontend. En production, servir l’API et le frontend en HTTPS. Le HTTP actuel reste limité au test local XAMPP.

Les secrets TOTP sont chiffrés avec AES-256-GCM et liés à l’identifiant utilisateur. Les codes de secours aléatoires sont stockés sous forme de SHA-256. Les challenges après mot de passe sont opaques, hachés en base, limités à dix minutes et consommables une fois. Ils n’ouvrent aucune route authentifiée. Un changement de mot de passe, de facteur ou d’entreprise invalide le challenge. La vérification utilise des transactions et des verrous sur les comptes pour empêcher les réutilisations simultanées.

Cinq mauvaises vérifications bloquent le challenge et provoquent un blocage du compte pendant dix minutes, même avec de nouveaux challenges. Des limites supplémentaires par IP protègent connexion, inscription et endpoints MFA ; elles sont locales au processus. Un déploiement à plusieurs instances doit partager le stockage des limites IP. Ne pas activer `trust proxy` sans définir précisément les proxies réellement utilisés.

Les challenges expirés sont supprimés par lots lors des connexions suivantes. Les logs de sécurité réutilisent `audit_logs` ; ils contiennent utilisateur/entreprise, événement, résultat, heure, IP et méthode, sans mot de passe, code, secret ou jeton. Les nouvelles traces API retirent les query strings et masquent les jetons des portails. Les anciennes traces ne sont pas modifiées. La conservation des journaux reste à définir par l’opérateur ; cette fonctionnalité ne constitue pas une déclaration de conformité juridique.

## Validation

Tests unitaires : chiffrement, codes TOTP et rejeu, codes de secours, rejet des anciens JWT, rôles courants et nettoyage des logs. Tests HTTP/PostgreSQL facultatifs via `TEST_DATABASE_URL` : tables temporaires privées, migration additive, inscription et connexion en deux étapes, expiration, blocage, récupération et isolation des journaux. Aucun compte réel n’est inscrit à un facteur par ces tests. Tests React : étape MFA, erreurs et sauvegarde des codes avant connexion. Build Vite requis.

Références techniques : [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [otplib](https://otplib.yeojz.dev/guide/getting-started).

## Mot de passe oublié

Le lien **Mot de passe oublié ?** de `/login` ouvre `/forgot-password`. Après réception de l’email, `/reset-password` permet de saisir et confirmer un nouveau mot de passe. Le lien aléatoire de 256 bits est stocké seulement sous forme de hash, valable vingt minutes et consommé une fois. Son fragment est retiré de l’historique par la page et n’est envoyé ni à Apache ni dans les referrers. Les tokens sont associés à l’utilisateur, son entreprise et son mot de passe courant. Un compte désactivé, déplacé dans une autre entreprise, ou dont le mot de passe a déjà changé ne peut pas consommer l’ancien lien.

La réinitialisation invalide toutes les anciennes sessions et challenges de connexion, mais conserve le secret MFA et les codes de secours existants. Elle ne connecte jamais automatiquement l’utilisateur. La première configuration MFA reste nécessaire pour un compte qui ne l’a pas encore activée. Le nouveau mot de passe doit contenir au moins huit caractères et tenir dans les 72 octets pris en charge par bcrypt.

Configurer **SMTP_HOST**, les identifiants et **SMTP_FROM** dans `server/.env`. Configurer **PUBLIC_CLIENT_URL** avec l’adresse réelle du frontend, sous-chemin inclus : localement `http://localhost/konzotech-one`, en production `https://konzocrm.com`. Cette URL provient uniquement de la configuration serveur, jamais du header Host. La production exige HTTPS. Sans SMTP, l’API retourne une erreur claire pour toute adresse, sans prétendre avoir envoyé un email et sans exposer de lien public de récupération.

Avec SMTP, la réponse publique est identique pour tous les emails. La livraison utilise le service email existant après la réponse HTTP pour éviter de révéler l’existence d’un compte par les délais SMTP. Les demandes sont limitées par IP, à une toutes les 90 secondes par compte et cinq par heure. Si le processus s’arrête avant la livraison, l’utilisateur peut refaire sa demande après le délai ; cette version n’introduit pas de file d’envoi persistante. Un échec de livraison invalide le token et apparaît dans le journal de sécurité. Une notification est aussi envoyée après modification du mot de passe si SMTP est configuré, sans inclure le nouveau mot de passe.

Pour une installation locale sans SMTP, un opérateur ayant accès à la machine peut lancer dans `server` :

```powershell
npm run recover:local -- --email ADRESSE_DU_COMPTE --file C:\CHEMIN_PRIVE\recuperation.html
```

Cet outil est interdit en production et pour une base distante. Il crée un fichier HTML privé, jamais publié dans XAMPP ou Git. L’utilisateur l’ouvre pour choisir lui-même son mot de passe. Ne pas partager le fichier et le supprimer après utilisation. Aucun endpoint web ne propose ce contournement de livraison SMTP ; l’outil ne désactive pas MFA.

Référence : [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
