import { SESv2Client } from "@aws-sdk/client-sesv2";

const REGION = process.env.SES_REGION || process.env.S3_REGION || "eu-north-1";

export const sesClient = new SESv2Client({ region: REGION });

export const SES_FROM = process.env.SES_FROM_EMAIL || "newsletter@example.com";
