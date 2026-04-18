import * as React from "react";
import { ConfermaIscrizioneEmail } from "../templates/conferma-iscrizione";

export default function Preview() {
  return (
    <ConfermaIscrizioneEmail
      confirmUrl="https://example.com/newsletter/conferma?token=abc123def456"
      unsubscribeUrl="https://example.com/newsletter/disiscrizione?token=abc123def456"
    />
  );
}
