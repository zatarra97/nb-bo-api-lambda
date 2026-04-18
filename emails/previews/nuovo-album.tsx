import * as React from "react";
import { NuovoContenutoEmail } from "../templates/nuovo-contenuto";

export default function Preview() {
  return (
    <NuovoContenutoEmail
      tipo="album"
      titolo="Titolo Album"
      descrizione="Disponibile su tutte le piattaforme di streaming. Un percorso in dodici tracce tra arrangiamenti acustici e sonorità contemporanee."
      immagineUrl="https://placehold.co/580x260/1a1a1a/ffffff?text=Cover+Album"
      ctaUrl="https://example.com/discografia"
      unsubscribeUrl="https://example.com/newsletter/disiscrizione?token=abc123def456"
    />
  );
}
