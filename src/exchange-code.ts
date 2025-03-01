import * as auth from './auth.js';
import { createInterface } from 'readline';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

async function exchangeCode() {
  try {
    // Prompt for authorization code and code verifier
    const code = await new Promise<string>((resolve) => {
      rl.question('Enter the authorization code from the redirect URL: ', resolve);
    });

    const codeVerifier = await new Promise<string>((resolve) => {
      rl.question('Enter the code verifier from the previous step: ', resolve);
    });

    // Exchange code for tokens
    const tokens = await auth.exchangeCodeForTokens(code.trim(), codeVerifier.trim());
    
    console.log('\nSuccess! Tokens have been saved.');
    console.log('Access token expires at:', new Date(tokens.expiresAt).toLocaleString());
    console.log('Scopes:', tokens.scope.join(', '));
  } catch (error) {
    console.error('\nError exchanging code for tokens:', error);
  } finally {
    rl.close();
  }
}

exchangeCode().catch(console.error);
