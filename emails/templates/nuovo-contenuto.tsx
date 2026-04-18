import * as React from "react";
import { Section, Text, Button, Img, Hr } from "react-email";
import { BaseTemplate } from "./base";

export type TipoContenuto = "album" | "date";

interface Props {
  tipo: TipoContenuto;
  titolo: string;
  descrizione?: string;
  immagineUrl?: string;
  ctaUrl?: string;
  unsubscribeUrl: string;
}

const ETICHETTE: Record<TipoContenuto, { tag: string; cta: string }> = {
  album: { tag: "Nuovo Album", cta: "Ascolta ora" },
  date:  { tag: "Nuove Date",  cta: "Scopri i dettagli" },
};

export const NuovoContenutoEmail = ({
  tipo,
  titolo,
  descrizione,
  immagineUrl,
  ctaUrl,
  unsubscribeUrl,
}: Props) => {
  const { tag, cta } = ETICHETTE[tipo];
  return (
    <BaseTemplate
      unsubscribeUrl={unsubscribeUrl}
      previewText={`${tag}: ${titolo}`}
    >
      <Section>
        {/* Etichetta tipo */}
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-400 m-0 mb-4">
          {tag}
        </Text>

        {/* Immagine copertina */}
        {immagineUrl && (
          <Img
            src={immagineUrl}
            alt={titolo}
            width="100%"
            className="rounded-xl mb-6 object-cover"
            style={{ maxHeight: "260px" }}
          />
        )}

        {/* Titolo */}
        <Text className="text-2xl font-bold text-gray-900 m-0 mb-4">
          {titolo}
        </Text>

        {/* Descrizione — supporta \n e --- come separatori */}
        {descrizione && descrizione.split('\n').map((line, i) =>
          line.trim() === '---'
            ? <Hr key={i} className="border-gray-100 my-4" />
            : line.trim()
              ? <Text key={i} className="text-base text-gray-600 leading-relaxed m-0 mb-1">{line}</Text>
              : <Text key={i} style={{ margin: '4px 0' }}>&nbsp;</Text>
        )}

        {/* CTA */}
        {ctaUrl && (
          <>
            <Hr className="border-gray-100 my-6" />
            <Button
              href={ctaUrl}
              className="bg-gray-900 text-white text-sm font-semibold px-6 py-3 rounded-xl no-underline"
            >
              {cta}
            </Button>
          </>
        )}
      </Section>
    </BaseTemplate>
  );
};
