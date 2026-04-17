import * as React from "react";
import { Html, Head, Body, Container, Section, Text, Hr, Link, Preview, Tailwind } from "react-email";

interface BaseTemplateProps {
  children: React.ReactNode;
  unsubscribeUrl: string;
  previewText?: string;
}

export const BaseTemplate = ({ children, unsubscribeUrl, previewText }: BaseTemplateProps) => (
  <Html lang="it" dir="ltr">
    <Head />
    {previewText && <Preview>{previewText}</Preview>}
    <Tailwind>
      <Body className="bg-white m-0 p-0" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <Container className="max-w-[580px] mx-auto px-6 py-10">

          {/* Header */}
          <Section className="border-b border-solid border-gray-100 pb-6 mb-10">
            <Text className="text-2xl font-bold tracking-widest uppercase text-gray-900 m-0">
              NB
            </Text>
          </Section>

          {/* Contenuto iniettato */}
          {children}

          {/* Footer */}
          <Hr className="border-gray-100 my-10" />
          <Text className="text-xs text-gray-400 text-center m-0 leading-6">
            Hai ricevuto questa email perché sei iscritto alla newsletter di NB.
            <br />
            <Link href={unsubscribeUrl} className="text-gray-400 underline">
              Clicca qui per disiscriverti
            </Link>
          </Text>

        </Container>
      </Body>
    </Tailwind>
  </Html>
);
