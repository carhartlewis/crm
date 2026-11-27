# Resume the gateway authorization after sign-in

Status: open

If a user opens the agent's gateway sign-in while signed out of the CRM, better-auth sends them to `/sign-in` with the OAuth query. The sign-in page does not yet continue the authorization afterwards (`oauthProviderClient` / `/oauth2/continue`). Rare today, because the agent channel already needs a signed-in user.
