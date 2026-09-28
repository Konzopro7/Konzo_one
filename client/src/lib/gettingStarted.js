// Keep the guide aligned with existing modules and permissions.
export function gettingStartedSteps(role) {
  const steps = [{
    title: "Personnalisez votre profil", path: "/profile", action: "Ouvrir mon profil",
    description: "Importez une photo ou un logo personnel et vérifiez votre nom affiché. Cliquez sur « Enregistrer mon profil » pour mettre à jour votre compte.",
    check: "Votre image personnelle apparaît dans le CRM. Le logo des documents se règle dans les paramètres de l’entreprise."
  }];
  if (role === "admin") steps.push({
    title: "Préparez votre espace", path: "/settings", action: "Ouvrir les paramètres",
    description: "Renseignez les coordonnées de votre entreprise, la devise et les conditions de paiement. Vérifiez les modèles d’emails avant votre premier envoi.",
    check: "Vos coordonnées apparaîtront sur les prochains documents."
  });
  steps.push({
    title: "Retrouvez vos clients", path: "/clients", action: "Ouvrir les clients",
    description: ["admin", "commercial"].includes(role)
      ? "Cliquez sur « Ajouter un client ». Renseignez son nom, son entreprise et ses coordonnées. Complétez sa fiche avec sa langue préférée, ses tags et vos notes."
      : "Consultez les fiches clients. Utilisez la recherche pour retrouver un nom, une entreprise ou un email, puis ouvrez l’historique pour consulter les documents liés.",
    check: "Une fiche à jour facilite le suivi et évite les doublons."
  });
  if (["admin", "commercial"].includes(role)) steps.push({
    title: "Organisez votre suivi commercial", path: "/pipeline", action: "Ouvrir le pipeline",
    description: "Ajoutez un prospect, indiquez sa source et suivez son statut. Utilisez « Convertir » lorsqu’il est prêt à devenir client. Créez ensuite une opportunité et faites évoluer son étape au fil de vos échanges.",
    check: "Le pipeline vous aide à savoir quels dossiers faire avancer."
  });
  steps.push({
    title: ["admin", "commercial"].includes(role) ? "Préparez votre premier devis" : "Consultez les devis",
    path: "/quotes", action: "Ouvrir les devis",
    description: ["admin", "commercial"].includes(role)
      ? "Cliquez sur « Nouveau devis », sélectionnez le client et ajoutez les lignes de produits ou services. Vérifiez quantités, prix, rabais, taux de taxe, devise et validité. Téléchargez le PDF pour le relire avant d’envoyer l’email."
      : "Retrouvez les propositions commerciales et leur statut. Le PDF permet de consulter le document complet.",
    check: "Vérifiez toujours le destinataire et les montants avant un envoi."
  });
  steps.push({
    title: role === "readonly" ? "Suivez les factures" : "Facturez et suivez les paiements",
    path: "/invoices", action: "Ouvrir les factures",
    description: role === "readonly"
      ? "Consultez les factures, leurs échéances et leur statut. Utilisez le tableau de bord pour suivre l’activité de votre entreprise."
      : "Créez une facture ou, avec un rôle administrateur ou commercial, convertissez un devis en facture depuis les devis. Vérifiez l’échéance et les montants. Consultez les actions disponibles pour le PDF, l’envoi par email et, si Stripe est configuré, le lien de paiement.",
    check: "Contrôlez les encaissements avant de mettre à jour un statut de paiement."
  });
  if (role === "finance" || role === "admin") steps.push({
    title: "Suivez votre activité financière", path: "/ledger", action: "Ouvrir le grand livre",
    description: "Consultez le grand livre et ses filtres. Enregistrez vos dépenses dans le module Dépenses et vérifiez régulièrement les factures en attente.",
    check: "Le grand livre simplifié accompagne votre suivi ; faites valider vos données comptables selon vos besoins."
  });
  if (role === "admin") steps.push({
    title: "Invitez votre équipe", path: "/team", action: "Ouvrir l’équipe",
    description: "Ajoutez les utilisateurs dans le module Équipe et choisissez leur rôle : administrateur, commercial, finance ou lecture seule. Transmettez leurs accès de manière sécurisée ; chaque nouveau compte disposera de ce guide.",
    check: "Attribuez uniquement les droits nécessaires au travail de chacun."
  });
  return steps;
}

export const guideQuestions = [
  { question: "Où retrouver ce guide ?", answer: "Le bouton Guide reste accessible en haut de votre espace, même après avoir fermé le message de bienvenue." },
  { question: "Pourquoi certaines actions ne sont-elles pas visibles ?", answer: "Votre rôle détermine vos accès. Si une action manque, demandez à l’administrateur de votre entreprise de vérifier votre rôle dans le module Équipe." },
  { question: "Comment envoyer un devis ou une facture ?", answer: "Utilisez l’action « Envoyer email » dans la liste du module concerné, si votre rôle l’autorise. Vérifiez l’adresse du client et relisez le PDF. L’envoi nécessite une configuration email opérationnelle." },
  { question: "Comment gérer les taxes et les devises ?", answer: "Vérifiez la devise et le taux de taxe sur chaque document. L’administrateur peut définir les préférences de l’entreprise dans les paramètres. Faites confirmer les taux applicables à votre situation avant la facturation." },
  { question: "Comment travailler sans envoyer de document par erreur ?", answer: "Commencez par créer et relire vos fiches et documents. La création et le téléchargement d’un PDF ne déclenchent pas un envoi d’email. Utilisez des destinataires de test pour vos premiers essais." }
];
