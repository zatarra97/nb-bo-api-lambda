import * as React from "react";
import { Section, Text, Button, Hr } from "react-email";
import { BaseTemplate } from "./base";

interface Props {
  titolo: string;
  /**
   * Contenuto HTML libero (es. da TipTap). Viene iniettato via dangerouslySetInnerHTML.
   * Usare solo tag semplici: p, strong, em, ul, ol, li, h2, h3, blockquote.
   */
  contenutoHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
  unsubscribeUrl: string;
}

export const NewsletterEmail = ({
  titolo,
  contenutoHtml,
  ctaUrl,
  ctaLabel,
  unsubscribeUrl,
}: Props) => (
  <BaseTemplate unsubscribeUrl={unsubscribeUrl} previewText={titolo}>
    <Section>
      <Text className="text-2xl font-bold text-gray-900 mt-0 mb-6">
        {titolo}
      </Text>

      {/* Contenuto rich text — stili inline per compatibilità email */}
      <div
        style={{
          fontSize: "15px",
          lineHeight: "1.7",
          color: "#374151",
        }}
        dangerouslySetInnerHTML={{ __html: contenutoHtml }}
      />

      {ctaUrl && ctaLabel && (
        <>
          <Hr className="border-gray-100 my-8" />
          <Button
            href={ctaUrl}
            className="bg-gray-900 text-white text-sm font-semibold px-6 py-3 rounded-xl no-underline"
          >
            {ctaLabel}
          </Button>
        </>
      )}
    </Section>
  </BaseTemplate>
);
