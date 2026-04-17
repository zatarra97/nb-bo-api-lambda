import * as React from "react";
import { Section, Text, Button } from "react-email";
import { BaseTemplate } from "./base";

interface Props {
  confirmUrl: string;
  unsubscribeUrl: string;
}

export const ConfermaIscrizioneEmail = ({ confirmUrl, unsubscribeUrl }: Props) => (
  <BaseTemplate
    unsubscribeUrl={unsubscribeUrl}
    previewText="Conferma la tua iscrizione alla newsletter"
  >
    <Section>
      <Text className="text-2xl font-bold text-gray-900 mt-0 mb-2">
        Benvenuto!
      </Text>
      <Text className="text-base text-gray-600 leading-7 mt-0 mb-8">
        Grazie per esserti iscritto alla newsletter. Clicca il pulsante qui
        sotto per confermare il tuo indirizzo email e iniziare a ricevere
        gli aggiornamenti.
      </Text>
      <Button
        href={confirmUrl}
        className="bg-gray-900 text-white text-sm font-semibold px-6 py-3 rounded-xl no-underline"
      >
        Conferma iscrizione
      </Button>
      <Text className="text-xs text-gray-400 mt-8 mb-0">
        Se non hai richiesto questa iscrizione puoi ignorare questa email.
        Il link scade entro 48 ore.
      </Text>
    </Section>
  </BaseTemplate>
);
