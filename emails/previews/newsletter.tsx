import * as React from "react";
import { NewsletterEmail } from "../templates/newsletter";

export default function Preview() {
  return (
    <NewsletterEmail
      titolo="Un nuovo capitolo"
      contenutoHtml={`
        <p>Ciao,</p>
        <p>Volevo condividere con te alcune novità su questo periodo di lavoro e i progetti in corso.</p>
        <p>Stiamo lavorando a qualcosa di speciale che verrà annunciato nelle prossime settimane. Rimani sintonizzato.</p>
        <p>Grazie per il supporto,<br /><strong>NB</strong></p>
      `}
      ctaUrl="https://example.com"
      ctaLabel="Scopri di più"
      unsubscribeUrl="https://example.com/newsletter/disiscrizione?token=abc123def456"
    />
  );
}
