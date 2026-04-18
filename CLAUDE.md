# nb-backend

API serverless per NB. Express app che gira sia localmente (dev) sia come handler Lambda (prod) tramite `@vendia/serverless-express`.

## Stack

- **Runtime**: Node 20 in dev (tsx), `nodejs22.x` arm64 su Lambda.
- **Framework**: Express 4 + CORS con whitelist da env.
- **DB**: MySQL 8 (mysql2/promise), pool a `connectionLimit: 2` — adatto a Lambda.
- **Auth**: AWS Cognito JWT (jwks-rsa in dev, claims da API Gateway authorizer in prod).
- **Storage**: S3 (`@aws-sdk/client-s3`) con presigned URLs per upload diretto da frontend.
- **Email**: `@react-email/components` per template + `@aws-sdk/client-sesv2` per invio.
- **IaC**: Pulumi (TypeScript) in `infra/`.
- **Bundle**: esbuild → `dist/handler.js` (CJS, sourcemap, no minify).

## Comandi

```
npm run auth        # aws sso login --profile=personal (necessario per credenziali AWS in dev)
npm run dev         # tsx watch su src/dev.ts, porta 3007
npm run build       # esbuild → dist/
npm run typecheck   # tsc --noEmit
npm run email:preview  # react-email dev --port 3001 (preview template email)
```

## Layout

```
src/
├── app.ts              Express app: CORS, middleware, registrazione router (no app.listen)
├── dev.ts              Entry point locale: carica dotenv e fa app.listen()
├── handler.ts          Entry point Lambda: serverlessExpress({ app })
├── db/pool.ts          Singleton mysql2 Pool
├── middleware/
│   ├── auth.ts         JWT Cognito (AUTH_MODE: local | apigw)
│   ├── admin.ts        requireAdmin (verifica gruppo Cognito "Admin")
│   └── error-handler.ts createHttpError + errorHandler finale
├── routes/             Un file per entità, tutti montati con app.use() senza prefix
├── types/index.ts      Interface TypeScript condivise (AuthenticatedRequest, Evento, Press, ecc.)
database/schema.sql     Schema MySQL + migration ALTER commentate per DB esistenti
emails/
├── client.ts           SES v2 client
├── send.ts             sendEmail({ to, subject, template }) — render React → HTML
├── templates/          Template React Email (base layout + transazionali)
└── previews/           File per `npm run email:preview`
infra/                  Stack Pulumi — vedi sezione Infra sotto
```

## Pattern delle rotte (seguire sempre)

Ogni router segue lo stesso schema. Esempio per "foo":

```ts
const router = Router();
const adminOnly = [authMiddleware, requireAdmin];

// Pubbliche (GET only)
router.get("/foo", ...);                    // lista
router.get("/foo/:publicId", ...);          // dettaglio

// Admin (tutti i verbi)
router.get("/admin/foo", adminOnly, ...);
router.get("/admin/foo/:publicId", adminOnly, ...);
router.post("/admin/foo", adminOnly, ...);
router.put("/admin/foo/:publicId", adminOnly, ...);
router.delete("/admin/foo/:publicId", adminOnly, ...);
```

Regole:

- **`publicId` (UUID via `randomUUID()`)** è l'identificatore esterno; `id` numerico è interno.
- Le query usano **placeholders `?`** con `pool.execute(sql, params)` — mai stringhe interpolate.
- Errori utente → `next(createHttpError(status, msg))`; errori inattesi → `next(err)` e gestiti da `errorHandler`.
- Risposte 204 su PUT/DELETE, 201 con body su POST creazione.
- Cast esplicito del risultato mysql2 a `[any[], any]` per accedere a `rows`/`insertId`.

## Auth

`authMiddleware` popola `req.user = { email, groups, isAdmin }` partendo da:

- **`AUTH_MODE=local`** (dev): verifica RS256 con JWKS Cognito.
- **`AUTH_MODE=apigw`** (prod): legge `event.requestContext.authorizer.jwt.claims` via `getCurrentInvoke()` (Vendia).

`parseGroups()` gestisce tutte le forme in cui Cognito può serializzare `cognito:groups` (array, stringa JSON, stringa CSV, stringa singola).

## Database

- Schema in `database/schema.sql`. Per applicarlo a un DB esistente, usare le migration `ALTER TABLE` commentate sotto ogni tabella.
- **Nomi tabelle/colonne in italiano** (`eventi`, `immagini`, `descrizioneIT`). Mantenere la convenzione.
- **Campi bilingue** con suffisso `IT`/`EN`.
- **Timestamp**: `createdAt` default + `updatedAt ON UPDATE CURRENT_TIMESTAMP`.
- **`emailSentAt`** traccia se una newsletter è già stata inviata per quell'entità — prima di inviare controllare/resettare a seconda del caso.

## Email

- Invii con `sendEmail({ to, subject, template: React.createElement(...) })` — il template è un componente React Email.
- `FRONTEND_URL` è usato per costruire link di unsubscribe/conferma — sempre iniettarlo nel componente.
- Configuration Set SES: `nb-transactional`; sender: `SES_FROM_EMAIL`.
- Iterazione sui subscribers confermati: `SELECT email, token FROM subscribers WHERE confermato = 1`.

## Infra (Pulumi)

- Stack file: `Pulumi.dev.yaml` — richiede `weddingcutStackRef` per il DB RDS condiviso.
- **Cognito** User Pool `nb-users` + client `nb-admin-client` + gruppo `Admin`. Token 8h (access/id), refresh 30gg.
- **API Gateway HTTP** con JWT authorizer: le rotte in `publicRoutes[]` sono `NONE`, tutto il resto cade su `$default` con `JWT`. **Se aggiungi una nuova rotta pubblica**, aggiungila anche a quell'array.
- **Lambda** `nb-api`: 256 MB, timeout 30s, env var iniettate dal config Pulumi.
- **S3**: bucket media `nb-media-zatarra97` (pubblico in lettura) per immagini/audio; bucket frontend `nb-frontend-<stack>` privato dietro CloudFront OAC.
- **CloudFront**: error 403/404 → `/index.html` (SPA fallback).
- **SES**: se `sesDomain` è set, crea DomainIdentity + DKIM + MAIL FROM `mail.<dominio>`; i DKIM tokens sono in output.
- **CI IAM users** (`nb-ci-frontend`, `nb-ci-backend`) con access keys esportate come secret output.

## Variabili d'ambiente (dev, `.env`)

```
PORT=3007
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_DATABASE
COGNITO_REGION, COGNITO_USER_POOL_ID
CORS_FRONTEND         # CSV origin consentite
AUTH_MODE=local       # local in dev, apigw in Lambda
NODE_ENV=development
S3_MEDIA_BUCKET, S3_REGION
```

In Lambda queste sono iniettate da Pulumi — non modificare manualmente in console.

## Do/Don't

- **Do** aggiungere nuove rotte pubbliche anche in `infra/index.ts` `publicRoutes[]`, altrimenti verranno bloccate dall'authorizer JWT.
- **Do** cancellare e reinserire le righe figlie su UPDATE 1:N (pattern già in `events.routes.ts` per `event_dates`).
- **Do** auto-assegnare `ordine = MAX(ordine) + 1` nei POST per entità con campo `ordine` (Press, PhotoAlbums, MusicAlbums, immagini). Nei PUT usare `ordine = COALESCE(?, ordine)` per preservare il valore esistente se il payload lo omette — il riordino passa esclusivamente da `PATCH /admin/<entità>/reorder`.
- **Don't** alzare `connectionLimit` del pool: Lambda scala orizzontalmente, connessioni totali esplodono rapidamente.
- **Don't** loggare il JWT o payload sensibili. `errorHandler` nasconde già i dettagli dei 500.
- **Don't** chiamare `app.listen()` dentro `app.ts` — rompe il handler Lambda.
