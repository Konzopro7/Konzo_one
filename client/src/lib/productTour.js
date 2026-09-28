export function productTourSteps(role) {
  const steps = [
    { route: "/dashboard", target: "page-heading", title: "Votre activité en un regard", text: "Le tableau de bord rassemble les indicateurs et le suivi de votre entreprise. La visite vous montre maintenant les principaux endroits où cliquer." },
    { route: "/dashboard", target: "profile-link", title: "Votre profil, ici", text: "Cliquez sur cette pastille pour retrouver votre nom, votre photo ou votre logo personnel. Elle reste accessible en haut de chaque page." },
    { route: "/profile", target: "profile-upload", title: "Ajoutez votre photo ou votre logo", text: "Ce bouton permet de choisir une image PNG, JPG ou WebP. Après l’import, cliquez sur « Enregistrer mon profil ». L’image personnelle reste distincte du logo de l’entreprise." }
  ];
  if (role === "admin") steps.push({ route: "/settings", target: "company-logo", title: "Votre logo sur les documents", text: "Importez ici le logo de votre entreprise, puis enregistrez les modifications. Il apparaîtra sur vos devis et factures PDF." });
  steps.push({ route: "/clients", target: "client-search", title: "Retrouvez un client rapidement", text: "Tapez un nom, une entreprise ou un email dans ce champ pour filtrer votre carnet de clients. Vous pouvez ensuite ouvrir l’historique d’une fiche." });
  if (["admin", "commercial"].includes(role)) {
    steps.push({ route: "/clients", target: "client-create", title: "Créez votre première fiche client", text: "C’est ce bouton qui ouvre la fiche à remplir : nom, entreprise, coordonnées et informations complémentaires. Pour ouvrir le formulaire maintenant, utilisez le bouton ci-dessous ; la visite s’arrêtera et rien ne sera enregistré automatiquement.", action: "Utiliser ce bouton" });
    steps.push({ route: "/pipeline", target: "prospect-create", title: "Commencez votre suivi commercial", text: "Ajoutez un prospect avec ce bouton, puis suivez son statut et sa conversion dans le pipeline. Vous pouvez ouvrir le formulaire après la visite, ou dès maintenant avec le bouton ci-dessous.", action: "Utiliser ce bouton" });
    steps.push({ route: "/quotes", target: "quote-create", title: "Préparez un devis", text: "Ce bouton ouvre un nouveau devis. Sélectionnez votre client, ajoutez vos services et vérifiez les taxes. Une fois enregistré, les actions PDF, email et conversion apparaissent dans la liste.", action: "Utiliser ce bouton" });
  } else {
    steps.push({ route: "/quotes", target: "quotes-list", title: "Consultez les devis", text: "Vous retrouvez ici les propositions commerciales et leur statut. Les actions disponibles dépendent de votre rôle ; le PDF permet de consulter le document complet." });
  }
  if (["admin", "commercial", "finance"].includes(role)) {
    steps.push({ route: "/invoices", target: "invoice-create", title: "Créez une facture", text: "Cliquez ici pour choisir un client et préparer sa facture. Relisez le PDF avant un envoi. Si Stripe est configuré, le lien de paiement est disponible dans les actions de la facture.", action: "Utiliser ce bouton" });
  } else {
    steps.push({ route: "/invoices", target: "invoices-list", title: "Suivez la facturation", text: "Cette liste vous permet de consulter les montants, échéances et statuts des factures, dans la limite de vos droits." });
  }
  steps.push({ route: "/invoices", target: "guide-link", title: "Retrouvez l’aide à tout moment", text: "Le bouton Guide permet de relire les instructions ou de relancer cette visite. Vous pouvez maintenant terminer et utiliser le CRM à votre rythme." });
  return steps;
}

// Clamp the callout to the viewport and prefer the side with enough room.
export function tourPosition(rect, viewport, cardHeight = 310) {
  const gap = 18;
  const margin = 12;
  const width = Math.min(370, viewport.width - margin * 2);
  const left = Math.max(margin, Math.min(rect ? rect.left : (viewport.width - width) / 2, viewport.width - width - margin));
  const below = rect ? rect.bottom + gap : margin;
  const belowSpace = viewport.height - margin - below;
  const aboveSpace = rect ? rect.top - gap - margin : 0;
  const placement = belowSpace >= cardHeight || belowSpace >= aboveSpace ? "below" : "above";
  const available = placement === "below" ? belowSpace : aboveSpace;
  const maxHeight = Math.min(viewport.height - 24, Math.max(120, available));
  const top = placement === "below" ? Math.max(margin, below) : Math.max(margin, rect.top - gap - Math.min(cardHeight, maxHeight));
  return { left, top, width, maxHeight, placement };
}
