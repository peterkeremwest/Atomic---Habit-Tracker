# Atomic back office (AWS, stack `atomic-backend`)

One SAM stack (`template.yaml`) with everything Atomic uses in AWS:

| Piece | What it is | Company version |
|---|---|---|
| `AtomicUserPoolClient` | A new app client on Forge's existing Cognito user pool (`us-east-1_xmt1rEukj`) | Atomic's own badge reader at the shared badge office |
| `AtomicTable` | DynamoDB, one partition per user (`pk = USER#<sub>`), point-in-time recovery on, kept even if the stack is deleted | The filing cabinet, one drawer per user |
| `HttpApi` | HTTP API with the Cognito JWT authorizer, CORS for the live site + localhost, throttled to 10 requests/second | The front desk with the bouncer |
| `DataFunction` | Lambda (`nodejs24.x`, arm64), `src/data/data.js` | The data clerk |
| `DataFunctionLogs` | Its CloudWatch logs, kept 30 days | The sign-in log, shredded after a month |
| `DataErrorsAlarm` + `AlertTopic` | Emails you if the clerk fails 3+ times in 5 minutes | Security camera with a pager |
| `MonthlyBudget` | Emails you at 80% of $5 actual spend, or if the month is forecast to pass $5 | The accountant's warning note |

The alarms and the budget are only created when you give an `AlertEmail`.

## Routes (all need `Authorization: Bearer <Cognito ID token>`)

- `GET /data` returns everything in your drawer: `{ items: { elements, isotopes, atoms, logs }, cursor }`
- `GET /data?since=<cursor>` returns only what arrived after the last pull
- `POST /data/batch` with `{ records: [{ store, record }] }` (up to 25) saves records. The newest `updatedAt` wins: an older copy never overwrites a newer one. Deletes are soft (`deletedAt`), so there is no DELETE route.

## First deploy (from your own terminal, not from Claude's shell)

```
cd backend
sam build
sam deploy --guided
```

Answers for the guided prompts:

- Stack name: `atomic-backend` · Region: `us-east-1` (must match the Cognito pool)
- `CognitoUserPoolId`, `AllowedOrigin`: press Enter to keep the defaults
- `AlertEmail`: your email (for the budget and error alarms)
- `MonthlyBudgetUsd`: Enter for 5
- Confirm changes before deploy: `y` · Allow SAM CLI IAM role creation: `Y`
- Save arguments to configuration file: `Y` (later deploys are just `sam build && sam deploy`)

Then:

1. Copy the two outputs `ApiUrl` and `UserPoolClientId` into `public/js/config.js` (`apiUrl` and `clientId`), or paste them to Claude.
2. Open the email from AWS Notifications and click **Confirm subscription**, or the error alarm can't reach you.
3. Push. Once Cloudflare rebuilds, SETTINGS on the live site shows SIGN IN.

## Check it without the app

```
# sign in on the live site, then in the browser console:
#   (await import('./js/auth.js')).idToken().then(console.log)
curl -H "Authorization: Bearer <ID_TOKEN>" <ApiUrl>/data
```

## Tests (in Claude's cloud workspace)

- `node test/backend.test.mjs`: the data clerk against an in-memory table (newest-wins, users can't see each other, validation)
- `node test/mock-cloud.mjs` + `python3 test/e2e_cloud.py`: two phones, one account, end to end, with a fake Cognito and the real clerk

## Teardown

`sam delete --stack-name atomic-backend` removes everything except the table (kept on purpose). Delete `AtomicTable` in the DynamoDB console if you really want it gone.
