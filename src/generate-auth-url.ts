import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

console.log('Environment variables:', {
  DROPBOX_APP_KEY: process.env.DROPBOX_APP_KEY,
  DROPBOX_APP_SECRET: process.env.DROPBOX_APP_SECRET,
  DROPBOX_REDIRECT_URI: process.env.DROPBOX_REDIRECT_URI
});

import * as auth from './auth.js';

const { url, codeVerifier } = auth.generateAuthUrl();

console.log(`
Dropbox OAuth Setup Instructions:

1. Visit this URL in your browser to authorize the application:
${url}

2. After authorization, you'll be redirected to your redirect URI with a code parameter.

3. Copy the code from the URL and use it along with this code verifier to exchange for tokens:
Code Verifier: ${codeVerifier}

Note: Keep the code verifier safe - you'll need it to complete the OAuth flow.
`);
