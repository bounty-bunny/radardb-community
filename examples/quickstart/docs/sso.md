# Single sign-on (SSO)

## Supported providers
Quillstack supports SAML 2.0 with Okta, Microsoft Entra ID and Google Workspace. SSO is available on the Business and Enterprise plans.

## Setting up SAML
1. In Admin → Security, choose "Add identity provider".
2. Upload your provider's metadata XML or paste the metadata URL.
3. Map the email attribute to `NameID`.
4. Click "Test login" before enforcing SSO.

## Enforcing SSO
When SSO is enforced, password login is disabled for all members except one break-glass owner account.
