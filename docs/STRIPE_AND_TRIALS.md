# Stripe test et essais de 30 jours

L'intégration Stripe existante reste celle du CRM. La clé secrète et le secret
de signature webhook sont uniquement dans `/etc/konzocrm/server.env` sur le VPS.
Ils ne sont jamais ajoutés à GitHub, au frontend ou aux tests. Le mode temporaire
est `STRIPE_MODE=test` avec des clés `sk_test_` / `pk_test_`. Les produits et prix
test reprennent les offres existantes : Pro 49 CAD/mois, Premium 99 CAD/mois.

Le webhook enregistré est `https://konzocrm.com/api/payments/webhook`. Les
événements Checkout, les changements d'abonnement et les factures Stripe payées
ou échouées synchronisent la facturation. La signature est obligatoire, un
événement du mauvais mode est rejeté et le traitement est transactionnel et
idempotent grâce à la migration additive `stripe_webhook_events`.

La confirmation du paiement vérifie le paiement effectif, l'entreprise, le
client Stripe et le prix configuré, puis récupère l'état de l'abonnement dans
Stripe. Elle utilise les dates de période Stripe, dont celles portées par les
items sur les API récentes. Un ancien abonnement ne remplace pas un abonnement
actif plus récent. Le portail de facturation permet de gérer un abonnement
existant sans en créer un second pour changer de plan.

## Expiration des essais

La durée de 30 jours à l'inscription reste celle du modèle existant. À la date
de fin, toutes les API métier refusent l'accès, même avec un JWT encore valide.
Un contrôle au démarrage et chaque minute passe les essais échus à `past_due`
et écrit une entrée dans le journal d'audit. Un essai sans date de fin est aussi
inaccessible. Les essais encore valides et les abonnements payants actifs ne
sont pas touchés par ce contrôle.

Les utilisateurs ne sont pas supprimés ou désactivés dans `users.is_active` :
l'accès à la facturation, au profil et à la double authentification reste
possible pour renouveler l'abonnement. Les données métier restent conservées.
Le blocage du CRM apparaît dans les composants existants, avec un lien vers la
facturation. Un paiement valide permet de récupérer l'accès à ces données.

## Validation

Tests PostgreSQL avec tables temporaires : essais échus ou valides, abonnements
actifs, conservation des utilisateurs, isolation des clients Stripe,
confirmation impayée, événements rejoués, panne retriable, annulation et ancien
abonnement. Les tests ne contactent pas Stripe et utilisent des clés fictives.
La configuration réelle test est vérifiée séparément en créant puis expirant
une session Checkout, sans effectuer de paiement.

La page de facturation annonce explicitement le mode test. Aucune somme réelle
n'est encaissée avec ces clés. Pour tester un paiement, utiliser les données de
carte proposées dans la documentation Stripe, jamais une carte réelle.

## Annulation par le client

Dans Abonnement, l’administrateur de l’entreprise dispose du bouton « Annuler
mon abonnement ». Il ouvre directement la confirmation Stripe, sans annuler
l’abonnement au clic. Le serveur utilise uniquement les identifiants Stripe
de l’entreprise authentifiée, vérifie leur correspondance et refuse une
configuration de portail qui ne prévoit pas l’annulation en fin de période.
Stripe conserve l’abonnement actif jusqu’à cette date ; les webhooks existants
actualisent ensuite son statut. Les données CRM ne sont pas supprimées.
Les essais gratuits sans abonnement Stripe se terminent automatiquement et
ne nécessitent pas d’annulation de prélèvement.

## Passage futur en mode réel

Configurer explicitement les clés, produits/prix et webhook du mode réel.
Réconcilier les abonnements accordés en test : un abonnement test n'est pas une
preuve de paiement réel. Ne pas réutiliser les identifiants Stripe test dans le
mode réel, ni supprimer les données CRM. Prévoir un sandbox Stripe distinct pour
les tests locaux afin de ne pas mélanger les identifiants d'entreprises locales
et ceux du VPS. Toute clé secrète partagée en conversation doit être renouvelée
dans Stripe et remplacée dans l'environnement serveur.
