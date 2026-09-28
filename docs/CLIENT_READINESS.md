# Qualité du parcours client

## Corrections livrées

- Conservation du design et des composants existants ; aucun changement de navigation.
- Dates PostgreSQL DATE transmises comme jours calendaires, sans conversion de fuseau ; dates invalides refusées avant toute écriture.
- Calcul des totaux partagé entre l’aperçu et l’API, avec les règles d’arrondi existantes. Aucun recalcul des documents déjà enregistrés.
- Migration de précision du taux sur devis/factures de NUMERIC(6,4) vers NUMERIC(7,5), pour conserver notamment 14,975 %. Les prix et quantités sont validés à deux décimales, comme leurs colonnes existantes.
- Droits des devis et factures alignés sur l’API ; consultation et PDF accessibles aux lecteurs, modification réservée aux rôles autorisés.
- Formulaires clients/devis/factures protégés contre les doubles envois, fermeture bloquée pendant l’enregistrement, limites et erreurs compréhensibles.
- Échec de chargement distinct d’une liste vide, avec possibilité de réessayer. Un enregistrement réussi n’est pas présenté comme un échec si l’actualisation de la liste échoue.
- Modales utilisables au clavier : focus initial, Tab/Shift+Tab, Échap, retour au bouton d’origine et blocage du défilement en arrière-plan.
- Portail documentaire : pas de document ancien conservé après un changement de lien ; panne distincte d’un lien introuvable ; seuls les devis envoyés et non expirés peuvent être acceptés.
- Paiement public Stripe : retour vers la facture publique, sans connexion CRM ; la confirmation du paiement repose toujours sur le webhook signé, jamais sur le paramètre d’URL.
- Saisie du taux de taxe en pourcentage, quantités fractionnaires, descriptions accessibles et champs associés à leurs labels.

## Configuration et limites à connaître

Stripe est actuellement en **mode test** : les abonnements et paiements test ne sont pas des encaissements réels. Le passage en production financière nécessite des clés/prix/webhooks du mode réel et la réconciliation des comptes test.

L’envoi réel des emails, des liens de réinitialisation et des documents nécessite un SMTP opérationnel. Sans configuration, le système doit annoncer l’indisponibilité ; ne pas promettre une livraison.

Le taux de taxe des documents demeure celui saisi par l’agence. Cette amélioration ne constitue pas un moteur de taxes provinciales ni une déclaration de conformité juridique.

Les grandes listes ne disposent pas encore toutes d’une pagination serveur. Les modules entreprises relationnelles, tâches, projets, tickets et campagnes restent dans la feuille de route. Ne pas présenter cette passe de qualité comme la livraison intégrale du cahier des charges.

## Vérification

Tests de composants et DOM sur les permissions, erreurs, doubles clics et focus ; tests API sur les dates et documents invalides ; intégrations PostgreSQL sur l’isolation des données, MFA et facturation ; build de production et contrôles du déploiement. Aucune migration destructive et aucune suppression de données.
