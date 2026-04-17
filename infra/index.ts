import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const config = new pulumi.Config();
const stack = pulumi.getStack();

// RDS — riuso dell'istanza esistente via StackReference
// Formato: "organization/project/stack" (Pulumi Cloud) o "project/stack" (backend locale)
// Esempio: "myorg/weddingcut/dev" oppure "weddingcut/dev"
const weddingcutStackRef = config.require("weddingcutStackRef");
const wcStack = new pulumi.StackReference(weddingcutStackRef);
const dbAddress = wcStack.getOutput("dbAddress") as pulumi.Output<string>;
const dbPort = wcStack.getOutput("dbPort") as pulumi.Output<number>;

// Database
const dbUsername = config.get("dbUsername") || "admin";
const dbPassword = config.requireSecret("dbPassword");
const dbName = config.get("dbName") || "nb";

// CORS — CloudFront URL + localhost per dev
// Dopo il primo deploy, aggiornare con l'URL CloudFront reale
const allowedOriginsRaw = config.get("allowedOrigins") || "http://localhost:5175";
const corsOrigins = allowedOriginsRaw.split(",").map((s) => s.trim());

// ---------------------------------------------------------------------------
// Cognito User Pool — nuovo pool dedicato a NB (admin del sito)
// ---------------------------------------------------------------------------
const userPool = new aws.cognito.UserPool("nb-user-pool", {
  name: "nb-users",
  usernameAttributes: ["email"],
  autoVerifiedAttributes: ["email"],
  mfaConfiguration: "OFF",
  passwordPolicy: {
    minimumLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: false,
    temporaryPasswordValidityDays: 7,
  },
  accountRecoverySetting: {
    recoveryMechanisms: [{ name: "verified_email", priority: 1 }],
  },
  tags: { Project: "nb", Environment: stack },
});

const userPoolClient = new aws.cognito.UserPoolClient("nb-user-pool-client", {
  name: "nb-admin-client",
  userPoolId: userPool.id,
  generateSecret: false,
  explicitAuthFlows: [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ],
  tokenValidityUnits: {
    accessToken: "hours",
    idToken: "hours",
    refreshToken: "days",
  },
  accessTokenValidity: 8,
  idTokenValidity: 8,
  refreshTokenValidity: 30,
});

const adminGroup = new aws.cognito.UserGroup("nb-admin-group", {
  name: "Admin",
  userPoolId: userPool.id,
  description: "Amministratori NB",
});

// ---------------------------------------------------------------------------
// IAM Role Lambda
// ---------------------------------------------------------------------------
const lambdaRole = new aws.iam.Role("nb-lambda-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Principal: { Service: "lambda.amazonaws.com" },
      Effect: "Allow",
    }],
  }),
  tags: { Project: "nb", Environment: stack },
});

new aws.iam.RolePolicyAttachment("nb-lambda-logs", {
  role: lambdaRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

new aws.iam.RolePolicy("nb-lambda-s3-policy", {
  role: lambdaRole.name,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Action: ["s3:PutObject", "s3:DeleteObject"],
      Resource: "arn:aws:s3:::nb-media-zatarra97/*",
    }],
  }),
});

new aws.iam.RolePolicy("nb-lambda-ses-policy", {
  role: lambdaRole.name,
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Action: ["ses:SendEmail", "ses:SendRawEmail", "sesv2:SendEmail"],
      Resource: "*",
    }],
  }),
});

// ---------------------------------------------------------------------------
// SES — Configuration Set (monitoraggio bounce/complaint)
// ---------------------------------------------------------------------------
const sesConfigSet = new aws.ses.ConfigurationSet("nb-ses-config", {
  name: "nb-transactional",
});

// ---------------------------------------------------------------------------
// SES — Domain Identity (da configurare con il dominio reale)
// Aggiungere il dominio con: pulumi config set sesDomain <tuo-dominio>
// Poi: pulumi up → verranno generati i token DKIM da aggiungere al DNS Aruba
// ---------------------------------------------------------------------------
const sesDomain = config.get("sesDomain");

let dkimTokensOutput: pulumi.Output<string[]> | undefined;

if (sesDomain) {
  const domainIdentity = new aws.ses.DomainIdentity("nb-ses-domain", {
    domain: sesDomain,
  });

  const dkim = new aws.ses.DomainDkim("nb-ses-dkim", {
    domain: domainIdentity.domain,
  });

  dkimTokensOutput = dkim.dkimTokens;

  // MAIL FROM personalizzato (es. mail.tuodominio.com)
  new aws.ses.MailFrom("nb-ses-mail-from", {
    domain: domainIdentity.domain,
    mailFromDomain: pulumi.interpolate`mail.${sesDomain}`,
    behaviorOnMxFailure: "UseDefaultValue",
  });
}

// ---------------------------------------------------------------------------
// Lambda Function
// ---------------------------------------------------------------------------
const lambdaFunction = new aws.lambda.Function("nb-api", {
  runtime: "nodejs22.x",
  architectures: ["arm64"],
  handler: "handler.handler",
  role: lambdaRole.arn,
  code: new pulumi.asset.FileArchive(path.resolve(__dirname, "../dist")),
  memorySize: 256,
  timeout: 30,
  environment: {
    variables: {
      DB_HOST: dbAddress,
      DB_PORT: dbPort.apply((p) => String(p)),
      DB_USER: dbUsername,
      DB_PASSWORD: dbPassword,
      DB_DATABASE: dbName,
      COGNITO_REGION: "eu-north-1",
      COGNITO_USER_POOL_ID: userPool.id,
      CORS_FRONTEND: allowedOriginsRaw,
      NODE_ENV: "production",
      AUTH_MODE: "apigw",
      S3_MEDIA_BUCKET: "nb-media-zatarra97",
      S3_REGION: "eu-north-1",
      SES_REGION: "eu-north-1",
      SES_FROM_EMAIL: sesDomain ? `newsletter@${sesDomain}` : config.get("sesFromEmail") || "newsletter@example.com",
      FRONTEND_URL: config.get("frontendUrl") || "http://localhost:5175",
    },
  },
  tags: { Project: "nb", Environment: stack },
});

// ---------------------------------------------------------------------------
// API Gateway HTTP con JWT Authorizer
// ---------------------------------------------------------------------------
const httpApi = new aws.apigatewayv2.Api("nb-http-api", {
  protocolType: "HTTP",
  corsConfiguration: {
    allowOrigins: corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowCredentials: true,
    maxAge: 86400,
  },
  tags: { Project: "nb", Environment: stack },
});

const jwtAuthorizer = new aws.apigatewayv2.Authorizer("nb-jwt-auth", {
  apiId: httpApi.id,
  authorizerType: "JWT",
  identitySources: ["$request.header.Authorization"],
  jwtConfiguration: {
    issuer: pulumi.interpolate`https://cognito-idp.eu-north-1.amazonaws.com/${userPool.id}`,
    audiences: [userPoolClient.id],
  },
});

const lambdaIntegration = new aws.apigatewayv2.Integration("nb-lambda-integration", {
  apiId: httpApi.id,
  integrationType: "AWS_PROXY",
  integrationUri: lambdaFunction.arn,
  payloadFormatVersion: "2.0",
});

// Route pubbliche (senza auth)
const publicRoutes: Array<{ key: string; routeKey: string }> = [
  { key: "health",          routeKey: "GET /health" },
  { key: "options",         routeKey: "OPTIONS /{proxy+}" },
  { key: "events",          routeKey: "GET /events" },
  { key: "events-detail",   routeKey: "GET /events/{proxy+}" },
  { key: "press",           routeKey: "GET /press" },
  { key: "photo-albums",    routeKey: "GET /photo-albums" },
  { key: "photo-albums-detail", routeKey: "GET /photo-albums/{proxy+}" },
  { key: "music-albums",    routeKey: "GET /music-albums" },
  { key: "content-blocks",  routeKey: "GET /content-blocks" },
  { key: "subscribe",       routeKey: "POST /subscribe" },
  { key: "confirm",         routeKey: "GET /confirm" },
  { key: "unsubscribe",     routeKey: "DELETE /unsubscribe" },
];

for (const { key, routeKey } of publicRoutes) {
  new aws.apigatewayv2.Route(`nb-route-${key}`, {
    apiId: httpApi.id,
    routeKey,
    target: pulumi.interpolate`integrations/${lambdaIntegration.id}`,
    authorizationType: "NONE",
  });
}

// Route catch-all con JWT auth (admin)
new aws.apigatewayv2.Route("nb-route-default", {
  apiId: httpApi.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${lambdaIntegration.id}`,
  authorizationType: "JWT",
  authorizerId: jwtAuthorizer.id,
});

new aws.apigatewayv2.Stage("nb-stage", {
  apiId: httpApi.id,
  name: "$default",
  autoDeploy: true,
});

new aws.lambda.Permission("nb-api-lambda-perm", {
  action: "lambda:InvokeFunction",
  function: lambdaFunction.name,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${httpApi.executionArn}/*/*`,
});

// ---------------------------------------------------------------------------
// S3 Media Bucket — immagini, audio preview (accesso pubblico in lettura)
// ---------------------------------------------------------------------------
const mediaBucket = new aws.s3.BucketV2("nb-media-bucket", {
  bucket: "nb-media-zatarra97",
  tags: { Project: "nb", Environment: stack },
});

const mediaPublicAccess = new aws.s3.BucketPublicAccessBlock("nb-media-public-access", {
  bucket: mediaBucket.id,
  blockPublicAcls: false,
  blockPublicPolicy: false,
  ignorePublicAcls: false,
  restrictPublicBuckets: false,
});

new aws.s3.BucketPolicy("nb-media-bucket-policy", {
  bucket: mediaBucket.id,
  policy: mediaBucket.arn.apply((arn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `${arn}/*`,
      }],
    })
  ),
}, { dependsOn: [mediaPublicAccess] });

new aws.s3.BucketCorsConfigurationV2("nb-media-cors", {
  bucket: mediaBucket.id,
  corsRules: [{
    allowedHeaders: ["*"],
    allowedMethods: ["PUT", "GET"],
    allowedOrigins: [...corsOrigins, "http://localhost:5175"],
    maxAgeSeconds: 3000,
  }],
});

// ---------------------------------------------------------------------------
// S3 Frontend Bucket + CloudFront (SPA)
// ---------------------------------------------------------------------------
const frontendBucket = new aws.s3.BucketV2("nb-frontend", {
  bucket: `nb-frontend-${stack}`,
  tags: { Project: "nb", Environment: stack },
});

new aws.s3.BucketPublicAccessBlock("nb-frontend-block", {
  bucket: frontendBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

const oac = new aws.cloudfront.OriginAccessControl("nb-oac", {
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

const cloudfront = new aws.cloudfront.Distribution("nb-cdn", {
  enabled: true,
  defaultRootObject: "index.html",
  origins: [{
    domainName: frontendBucket.bucketRegionalDomainName,
    originId: "s3-nb-frontend",
    originAccessControlId: oac.id,
  }],
  defaultCacheBehavior: {
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD"],
    targetOriginId: "s3-nb-frontend",
    viewerProtocolPolicy: "redirect-to-https",
    forwardedValues: { queryString: false, cookies: { forward: "none" } },
    compress: true,
  },
  customErrorResponses: [
    { errorCode: 403, responseCode: 200, responsePagePath: "/index.html", errorCachingMinTtl: 0 },
    { errorCode: 404, responseCode: 200, responsePagePath: "/index.html", errorCachingMinTtl: 0 },
  ],
  restrictions: { geoRestriction: { restrictionType: "none" } },
  viewerCertificate: { cloudfrontDefaultCertificate: true },
  tags: { Project: "nb", Environment: stack },
});

new aws.s3.BucketPolicy("nb-frontend-policy", {
  bucket: frontendBucket.id,
  policy: pulumi.all([frontendBucket.arn, cloudfront.arn]).apply(([bucketArn, cfArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Sid: "AllowCloudFrontServicePrincipal",
        Effect: "Allow",
        Principal: { Service: "cloudfront.amazonaws.com" },
        Action: "s3:GetObject",
        Resource: `${bucketArn}/*`,
        Condition: { StringEquals: { "AWS:SourceArn": cfArn } },
      }],
    })
  ),
});

// ---------------------------------------------------------------------------
// CI/CD IAM Users
// ---------------------------------------------------------------------------
const frontendDeployer = new aws.iam.User("nb-ci-frontend", {
  name: "nb-ci-frontend",
  tags: { Project: "nb" },
});

new aws.iam.UserPolicy("nb-ci-frontend-policy", {
  user: frontendDeployer.name,
  policy: pulumi.all([frontendBucket.arn, cloudfront.arn]).apply(([bucketArn, cfArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject"],
          Resource: [bucketArn, `${bucketArn}/*`],
        },
        {
          Effect: "Allow",
          Action: "cloudfront:CreateInvalidation",
          Resource: cfArn,
        },
      ],
    })
  ),
});

const frontendDeployerKey = new aws.iam.AccessKey("nb-ci-frontend-key", {
  user: frontendDeployer.name,
});

const backendDeployer = new aws.iam.User("nb-ci-backend", {
  name: "nb-ci-backend",
  tags: { Project: "nb" },
});

new aws.iam.UserPolicy("nb-ci-backend-policy", {
  user: backendDeployer.name,
  policy: lambdaFunction.arn.apply((lambdaArn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Action: ["lambda:UpdateFunctionCode", "lambda:GetFunction"],
        Resource: lambdaArn,
      }],
    })
  ),
});

const backendDeployerKey = new aws.iam.AccessKey("nb-ci-backend-key", {
  user: backendDeployer.name,
});

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
export const apiUrl = httpApi.apiEndpoint;
export const cloudfrontUrl = pulumi.interpolate`https://${cloudfront.domainName}`;
export const cloudfrontDistributionId = cloudfront.id;
export const frontendBucketName = frontendBucket.bucket;
export const mediaBucketName = mediaBucket.bucket;

export const cognitoUserPoolId = userPool.id;
export const cognitoClientId = userPoolClient.id;

export const frontendCiAccessKeyId = frontendDeployerKey.id;
export const frontendCiSecretAccessKey = pulumi.secret(frontendDeployerKey.secret);
export const backendCiAccessKeyId = backendDeployerKey.id;
export const backendCiSecretAccessKey = pulumi.secret(backendDeployerKey.secret);

// Token DKIM da aggiungere come record CNAME nel DNS Aruba (formato: <token>._domainkey.<dominio>)
export const sesDkimTokens = dkimTokensOutput;
