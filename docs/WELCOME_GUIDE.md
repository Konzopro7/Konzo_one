# Guide de prise en main — konzoCRM.com

Les nouveaux comptes reçoivent un message de bienvenue à leur première connexion dans l’espace CRM, qu’ils soient créés par inscription ou par le module Équipe. « Découvrir le guide » ouvre `/guide`. « Plus tard » et « Fermer » ferment la proposition. Le bouton Guide du header permet de la retrouver à tout moment.

Le guide décrit uniquement les modules actuellement disponibles. Les étapes sont adaptées aux rôles existants : administrateur, commercial, finance et lecture seule. Les liens ouvrent les modules sans créer de données ni envoyer de messages. Aucun email automatique n’est ajouté par cette fonctionnalité.

La migration additive `server/sql/migrations/2026-09-27-welcome-guide.sql` ajoute `users.onboarding_status`. Les comptes déjà présents prennent la valeur `existing` et conservent leur expérience de connexion. Le défaut `pending` concerne les créations suivantes. L’endpoint authentifié `PUT /api/auth/onboarding` mémorise `seen` uniquement pour l’utilisateur courant et son agence ; il n’accepte pas un autre utilisateur comme cible. Ce choix est conservé en base, y compris lors d’une connexion sur un autre appareil.

Appliquer les migrations avant de démarrer le nouveau backend, après sauvegarde :

```powershell
npm run migrate --prefix server -- --dry-run
npm run migrate --prefix server
npm test
npm run build
```

Le contenu est centralisé dans `client/src/lib/gettingStarted.js`. Mettre à jour les instructions lorsqu’un module change, sans modifier les styles du CRM.

## Visite interactive

Le message de bienvenue propose « Me guider dans le CRM ». Le choix est mémorisé avant le démarrage, comme pour le guide écrit. Les comptes existants peuvent lancer ou relancer la visite depuis Guide → « Lancer la visite interactive ».

La visite met en évidence les vrais éléments via des attributs `data-tour` : tableau de bord, profil, import d’image, logo de l’entreprise (administrateurs), recherche client, puis créations de prospects, devis et factures selon les rôles. Le contenu et les routes sont centralisés dans `client/src/lib/productTour.js`.

« Suivant » et « Précédent » changent de page pour présenter chaque repère. « Quitter », la croix et Échap rendent immédiatement l’interface accessible. Le bouton « Utiliser ce bouton » termine la visite puis ouvre le vrai formulaire indiqué, uniquement sur les boutons de création autorisés. La visite n’enregistre aucune fiche et n’envoie aucun document ; après sa fermeture, les actions habituelles du CRM s’appliquent.

Les indications se repositionnent au redimensionnement et au défilement. Elles restent dans la fenêtre et deviennent défilables sur les petits écrans. Si un élément tarde à apparaître ou n’existe pas, la visite affiche un message et permet de réessayer, continuer ou quitter. La progression de cette visite reste en mémoire jusqu’à sa fermeture ou un rechargement ; elle peut toujours être relancée.

Le portail React de la visite est placé hors de `#root`, rendu temporairement `inert`, pour conserver les repères visibles sans permettre une action métier par erreur derrière la visite. Les styles réutilisent les cartes et boutons existants ; aucune bibliothèque de visite ni modification du thème n’est nécessaire. jsdom est une dépendance de test à la racine. Les tests DOM couvrent le changement de page, le repérage, les retours, Échap, la restauration du focus et l’ouverture volontaire du formulaire après fermeture.

Vérification manuelle : ouvrir Guide avec un compte existant ; créer un compte dans un environnement de test et vérifier le message de bienvenue ; fermer puis recharger et se reconnecter pour vérifier qu’il ne réapparaît pas ; ouvrir Guide avec les quatre rôles ; vérifier clavier et affichage mobile. Les tests automatisés couvrent les instructions par rôle, les erreurs et retries, le ciblage de l’utilisateur, ainsi que la migration sur des tables PostgreSQL temporaires (avec `TEST_DATABASE_URL`).
