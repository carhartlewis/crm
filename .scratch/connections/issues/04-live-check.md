# Connect Granola and Superhuman for real

Status: open

Tests cover the flow against fakes and a real in-memory better-auth server, and a live probe registered dynamically with both servers. Not yet done: a full browser sign-in to Granola and Superhuman, and a chat turn that calls their tools. Check which of their tools carry `readOnlyHint`; a server without annotations shows no tools at `read`. Superhuman's metadata lists no scopes, so it gets its default scope and may not issue a refresh token.
