import * as React from "react";
import { NuovoContenutoEmail } from "../templates/nuovo-contenuto";

export default function Preview() {
  return (
    <NuovoContenutoEmail
      tipo="date"
      titolo="Milano · Roma · Torino"
      descrizione="Tre nuove date annunciate per l'autunno. I biglietti sono disponibili in prevendita dal 1° maggio."
      ctaUrl="https://example.com/eventi"
      unsubscribeUrl="https://example.com/newsletter/disiscrizione?token=abc123def456"
    />
  );
}
