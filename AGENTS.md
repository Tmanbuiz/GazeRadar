# GazeRadar project instructions

- Host this application only in the owner's Cloudflare account, with source in Tmanbuiz/GazeRadar on GitHub.
- Do not create, publish, update or mirror it using ChatGPT Sites or ChatGPT-hosted runtimes. The previous Site has been deleted at the owner's request.
- Do not add ChatGPT sign-in, hosting manifests, app connectors or links to a ChatGPT-hosted workspace.
- Use the ordinary Cloudflare Vite/Workers workflow. Build with pnpm run build and deploy with pnpm run deploy in the owner's configured Cloudflare build environment.
- Account authentication uses a server-side email-code session (`lib/login.ts`) or verified Cloudflare Access tokens. Never use client-supplied user-ID headers or a hardcoded shared identity as an authentication shortcut.
- Preserve existing migrations and concurrent changes. Use GitHub branch-head checks before updating main.
