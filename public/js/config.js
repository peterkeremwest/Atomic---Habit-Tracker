// Where Atomic's AWS back office lives. Fill these two in from the `sam deploy` outputs
// (backend/README.md): clientId = UserPoolClientId, apiUrl = ApiUrl. Until both are set,
// the app keeps working on this device only and SETTINGS says cloud sync isn't set up.
export const CLOUD = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_xmt1rEukj', // Forge's pool: one account for both apps
  clientId: '4go8ni9tia2dbd1srdgc416nvp', // Atomic's own badge reader on that pool
  apiUrl: 'https://bq79a6apm9.execute-api.us-east-1.amazonaws.com', // ApiUrl output of sam deploy
  cognitoEndpoint: '',               // leave empty (tests point this at a stand-in)
};
export const cloudReady = () => !!(CLOUD.clientId && CLOUD.apiUrl);
