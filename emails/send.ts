import * as React from "react";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { render, toPlainText } from "react-email";
import { sesClient, SES_FROM } from "./client";

interface SendOptions {
  to: string | string[];
  subject: string;
  template: React.ReactElement;
}

export const sendEmail = async ({ to, subject, template }: SendOptions): Promise<void> => {
  const html = await render(template);
  const text = toPlainText(html);

  const recipients = Array.isArray(to) ? to : [to];

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: SES_FROM,
      Destination: { ToAddresses: recipients },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text, Charset: "UTF-8" },
          },
        },
      },
    })
  );
};
