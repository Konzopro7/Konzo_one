# Messagerie GreenGeeks et récupération des comptes

Les boîtes cPanel et le CRM sont deux systèmes distincts. Le CRM utilise le SMTP existant pour ses réinitialisations, devis, factures et relances ; aucune boîte supplémentaire n’est créée.

## DNS à corriger

Vérification du 28 septembre 2026 : le MX de konzocrm.com pointe vers konzocrm.com et mail.konzocrm.com est un CNAME vers le même nom. L’adresse du site étant 76.13.115.72, cela dirige aussi les emails entrants vers le VPS, qui n’héberge pas les boîtes GreenGeeks.

Le serveur GreenGeeks identifié pour cette installation est mtl203.greengeeks.net, 198.72.127.235. Son SMTP SSL est accessible depuis le VPS avec un certificat valide. Confirmer le serveur dans cPanel → Comptes email → Connect Devices avant d’activer les identifiants.

Dans la zone DNS GreenGeeks :

| Nom | Type | Valeur |
| --- | --- | --- |
| konzocrm.com | A | 76.13.115.72 — conserver |
| www.konzocrm.com | CNAME | konzocrm.com — conserver |
| mail.konzocrm.com | A | 198.72.127.235 — remplacer le CNAME actuel |
| konzocrm.com | MX, priorité 0 | mail.konzocrm.com — modifier la destination actuelle |

Dans cPanel → Email Routing, utiliser Local Mail Exchanger pour ces boîtes GreenGeeks. Conserver les clés DKIM et l’inclusion SPF fournie par GreenGeeks ; vérifier Email Deliverability après modification. Ne pas ajouter plusieurs enregistrements SPF.

## Envoi du CRM

Configurer exclusivement dans /etc/konzocrm/server.env, jamais dans Git ni dans le frontend :

```dotenv
SMTP_HOST=mtl203.greengeeks.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@konzocrm.com
SMTP_PASS=mot_de_passe_prive_de_la_boite
SMTP_FROM="konzoCRM.com <support@konzocrm.com>"
```

Le mot de passe est celui de la boîte email, pas celui du CRM ni de cPanel. Vérifier l’authentification SMTP et sauvegarder la configuration existante avant de l’activer. Tester ensuite une demande de récupération du compte propriétaire et vérifier sa réception et les journaux ; ne jamais enregistrer les liens de récupération dans les logs.

Le changement DNS de la messagerie conserve l’adresse du site. La propagation dépend des caches DNS. Le SMTP utilisant le nom du serveur GreenGeeks peut fonctionner avant la propagation du nom mail.konzocrm.com.

## Comportement sans SMTP

En production, l’envoi de documents ne peut plus être simulé ni être annoncé comme réussi sans serveur SMTP. Le formulaire de récupération affiche une indisponibilité si la configuration est absente ou incomplète. Le transport chiffré reste obligatoire et les connexions disposent de délais maximums.

Références : [paramètres GreenGeeks](https://www.greengeeks.com/support/article/where-to-find-mail-server-login-information-for-greengeeks-hosted-domains/) et [transport SMTP Nodemailer](https://nodemailer.com/smtp).
