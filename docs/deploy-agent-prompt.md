# Deploy Skill Library with an agent

Give an agent with shell access on the target host the prompt in **Copy this prompt** below. Fill in the `USER INPUTS` section first.

For humans: see [deployment.md](./deployment.md) for topology notes and [operations.md](./operations.md) for day-2 ops.

---

## Copy this prompt

```text
Deploy Skill Library (self-hosted skill registry) on this machine.

## USER INPUTS — fill these in before running

PUBLIC_URL: https://skills.example.com
HOST_PORT: 3000
REPO_URL: https://github.com/ossianhempel/skill-library.git
REPO_REF: main
DEPLOY_DIR: /opt/skill-library
DATA_VOLUME: skill-library-data

# Microsoft Entra ID (required for browser login). Get from Azure Portal → App registrations.
MICROSOFT_CLIENT_ID:
MICROSOFT_CLIENT_SECRET:
MICROSOFT_TENANT_ID:

# Optional. Leave blank to use bundled PGlite (recommended for first deploy).
DATABASE_URL:

# Optional. One of: docker-compose, coolify, plain-docker, azure-container-apps
PLATFORM: docker-compose

# Azure-only (when PLATFORM=azure-container-apps)
AZURE_RESOURCE_GROUP:
AZURE_LOCATION: swedencentral

## Goal

Run one production container that serves:
- Web UI at PUBLIC_URL
- API at PUBLIC_URL/api/*
- Health at PUBLIC_URL/health

Persistent data must survive container restarts (database + artifacts under /data).

## Constraints

- Do not commit .env or print secrets into git.
- Do not force-push or rewrite git history.
- Use the repo's Dockerfile and docker-compose.yml unless PLATFORM requires a platform-native equivalent.
- BETTER_AUTH_URL must exactly match PUBLIC_URL (scheme + host, no trailing slash).
- Azure redirect URI must be: ${PUBLIC_URL}/api/auth/callback/microsoft

## Procedure

0. Load inputs as shell variables (use the USER INPUTS values above)
   ```sh
   PUBLIC_URL="https://skills.example.com"   # from USER INPUTS
   HOST_PORT=3000
   REPO_URL="https://github.com/ossianhempel/skill-library.git"
   REPO_REF="main"
   DEPLOY_DIR="/opt/skill-library"
   DATA_VOLUME="skill-library-data"
   MICROSOFT_CLIENT_ID=""                    # from USER INPUTS
   MICROSOFT_CLIENT_SECRET=""                # from USER INPUTS
   MICROSOFT_TENANT_ID=""                    # from USER INPUTS
   DATABASE_URL=""                           # from USER INPUTS, optional
   PLATFORM="docker-compose"                 # from USER INPUTS
   ```

1. Preflight
   - Confirm Docker (and Docker Compose plugin) are installed: `docker --version` and `docker compose version`.
   - Confirm PUBLIC_URL is reachable from the internet if SSO is required (Microsoft OAuth callback).
   - If PUBLIC_URL uses HTTPS behind a reverse proxy, ensure the proxy forwards `X-Forwarded-Host` and `X-Forwarded-Proto`, or set BETTER_AUTH_URL to the public HTTPS URL.

2. Fetch code
   ```sh
   sudo mkdir -p "$DEPLOY_DIR"
   sudo chown "$(whoami)" "$DEPLOY_DIR"
   git clone --branch "$REPO_REF" --depth 1 "$REPO_URL" "$DEPLOY_DIR"
   cd "$DEPLOY_DIR"
   ```

3. Generate secrets (do not reuse example values)
   ```sh
   BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
   MAINTAINER_TOKEN="$(openssl rand -hex 24)"
   USER_TOKEN="$(openssl rand -hex 24)"
   ```

4. Create .env in DEPLOY_DIR (mode 600)
   ```sh
   cat > .env <<EOF
   PORT=${HOST_PORT}
   SKILL_LIBRARY_DATA_DIR=/data
   BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
   BETTER_AUTH_URL=${PUBLIC_URL}
   MICROSOFT_CLIENT_ID=${MICROSOFT_CLIENT_ID}
   MICROSOFT_CLIENT_SECRET=${MICROSOFT_CLIENT_SECRET}
   MICROSOFT_TENANT_ID=${MICROSOFT_TENANT_ID}
   SKILL_LIBRARY_API_KEYS=${MAINTAINER_TOKEN}:maintainer:maintainer-1,${USER_TOKEN}:user:user-1
   EOF
   chmod 600 .env
   ```

   If DATABASE_URL is set, append:
   ```sh
   echo "DATABASE_URL=${DATABASE_URL}" >> .env
   ```

5. Deploy

   ### PLATFORM = docker-compose (default)
   ```sh
   cd "$DEPLOY_DIR"
   docker compose up --build -d
   docker compose ps
   ```

   If DATABASE_URL is set:
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.postgres.yml up --build -d
   ```

   ### PLATFORM = coolify
   - Create a new Docker Compose or Dockerfile app pointing at REPO_URL / REPO_REF.
   - Set all .env variables from step 4 in Coolify's environment UI.
   - Mount a persistent volume at `/data`.
   - Expose container port 3000; map to PUBLIC_URL via Coolify proxy/TLS.
   - Deploy and wait for healthy status.

   ### PLATFORM = azure-container-apps
   Summary for a new Azure deploy:
   1. `az group create` (or use existing `AZURE_RESOURCE_GROUP`)
   2. Create ACR, storage account + file share, Log Analytics, Container Apps environment
   3. `az acr build --registry <acr> --image skill-library:latest --platform linux/amd64 .`
   4. Register Entra app with redirect `${PUBLIC_URL}/api/auth/callback/microsoft`
   5. Mount Azure Files at `/data` on the Container App
   6. Set env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `MICROSOFT_*`, `SKILL_LIBRARY_API_KEYS`
   7. Verify `curl ${PUBLIC_URL}/health`

   ### PLATFORM = plain-docker (no compose)
   ```sh
   cd "$DEPLOY_DIR"
   docker build -t skill-library:local .
   docker volume create "$DATA_VOLUME"
   docker run -d --name skill-library \
     --restart unless-stopped \
     -p "${HOST_PORT}:3000" \
     -v "${DATA_VOLUME}:/data" \
     --env-file .env \
     skill-library:local
   ```

6. Verify (all must pass)
   ```sh
   curl -fsS "http://127.0.0.1:${HOST_PORT}/health"
   curl -fsS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${HOST_PORT}/"
   curl -fsS -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${HOST_PORT}/api/auth/get-session"
   docker compose logs --tail 50 skill-library 2>/dev/null || docker logs --tail 50 skill-library
   ```

   Expected:
   - /health returns `{"ok":true,"mode":"pglite"}` or `"mode":"postgres"`
   - / returns 200
   - /api/auth/get-session returns 200 (session may be null before login)

7. Azure check (if MICROSOFT_* were provided)
   - Confirm App Registration redirect URI is `${PUBLIC_URL}/api/auth/callback/microsoft`
   - Open PUBLIC_URL in a browser, click "Sign in with Microsoft", complete login
   - First SSO user becomes admin automatically

8. CLI smoke (optional, from the host if node is available, or skip)
   ```sh
   curl -fsS -H "Authorization: Bearer ${USER_TOKEN}" \
     "http://127.0.0.1:${HOST_PORT}/api/workspaces"
   ```

## Done when

- Container is running and restart policy is set (unless-stopped or platform equivalent)
- /health is OK
- .env exists only on the host, not in git
- You can report PUBLIC_URL, HOST_PORT, DEPLOY_DIR, and volume name

## Report back to the user

Return a short summary with:
- PUBLIC_URL and whether HTTPS is configured
- Container name / compose project status
- Health check output
- Whether Microsoft login was tested and succeeded
- Generated API tokens (MAINTAINER_TOKEN, USER_TOKEN) — deliver securely, not in public logs
- Anything still blocked (missing Azure creds, DNS, TLS, firewall)

Do not stop at "image built" — confirm the health endpoint responds and the container stays up.
```

---

## Minimal local smoke (no SSO)

For a quick laptop test without Azure:

```sh
git clone https://github.com/ossianhempel/skill-library.git
cd skill-library
cp .env.example .env
# Edit BETTER_AUTH_SECRET to a random value; keep BETTER_AUTH_URL=http://localhost:3000
docker compose up --build
curl http://localhost:3000/health
```

Browser SSO will not work until Microsoft credentials are set. CLI/MCP still work via `SKILL_LIBRARY_API_KEYS`.
