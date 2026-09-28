# Newsletter et offre de bienvenue

La rubrique des paramètres concerne la newsletter de konzoCRM.com, indépendamment des coordonnées et des clients de chaque entreprise. Une proposition facultative apparaît après la connexion et le guide d’accueil. « Non merci » est mémorisé côté serveur.

L’inscription exige un accord explicite, puis une confirmation par email. Le lien expire après 24 heures, est à usage unique et contient son jeton dans un fragment d’URL, jamais dans les journaux HTTP. Les API ne renvoient aucun jeton. Une simple visite du lien n’inscrit pas la personne : elle doit cliquer sur la page de confirmation. Les demandes sont limitées et un renvoi invalide le précédent lien.

Le consentement conserve le texte, sa version, sa source, les dates, l’utilisateur et l’entreprise. Les désabonnements sont possibles depuis les paramètres ou le lien email, sans nécessiter un abonnement CRM actif. La console plateforme permet de consulter les inscriptions avec pagination, recherche et filtres. Les envois marketing doivent toujours exclure les demandes en attente, désabonnés, comptes désactivés et adresses qui ont changé. Ce module ne prétend pas établir une conformité juridique et ne constitue pas encore un outil d’envoi de campagnes.

## Réduction

Après confirmation, une entreprise sans précédent abonnement peut recevoir 5 % sur la première facture de son premier abonnement mensuel Pro ou Premium. Les renouvellements, abonnements existants, périodes annuelles et remises répétées sont exclus. Le retrait du consentement n’efface pas une offre déjà acquise.

Le serveur détermine l’éligibilité ; aucune remise, adresse destinataire ou entreprise fournie par le navigateur ne peut la remplacer. Il crée un coupon Stripe privé par entreprise avec `percent_off=5`, `duration=once` et `max_redemptions=1`, puis l’ajoute à la session Checkout existante. Stripe applique l’arrondi et limite les utilisations. La confirmation du paiement conserve les contrôles existants du client Stripe, du prix et de l’entreprise, avec le webhook signé. La remise porte sur le montant avant taxes ; la configuration fiscale de la facturation est indépendante.

Une session Checkout ouverte avant confirmation de la newsletter n’est pas modifiée rétroactivement : revenir à la facturation et ouvrir une nouvelle session. Stripe reste dans le mode déjà configuré ; le mode test ne collecte aucun paiement réel.

## Téléphone de contact

Le propriétaire de la plateforme renseigne le numéro dans **Admin SaaS → Vue d’ensemble → Téléphone de contact konzoCRM.com**. Il est ensuite affiché dans **Paramètres → Besoin d’aide ?**, avec un lien d’appel. Ce numéro est distinct du téléphone de chaque entreprise cliente, utilisé sur ses propres documents. Aucun numéro n’est inventé si le champ est vide.

## Données et vérification

La migration `2026-09-28-newsletter.sql` crée uniquement la table d’inscriptions et ajoute des colonnes nullable aux entreprises et aux paramètres de plateforme. Elle ne réinitialise aucune donnée. Le déploiement effectue les sauvegardes et vérifications de migration existantes.

Les tests PostgreSQL utilisent des tables temporaires pour contrôler confirmation, jetons invalides, isolation, échec SMTP, retrait du consentement, périodes mensuelles et unicité du coupon. Les tests frontend contrôlent l’accord explicite, les erreurs et le refus mémorisé. Une session Stripe test a aussi vérifié 49 CAD → 46,55 CAD avec un coupon à usage unique, sans paiement ; les objets de vérification ont été retirés.
