# Deploy to Azure Container Apps

Skill Library's reference Azure topology in `rg-ossian-dev`:

| Resource | Name | Purpose |
|----------|------|---------|
| Container Registry | `acrskilllibossiandev` | Docker images |
| Storage account | `stskilllibossiandev` | Azure Files share for `/data` |
| Log Analytics | `log-skill-library` | Container Apps logs |
| Container Apps env | `cae-skill-library` | Shared runtime |
| Container App | `ca-skill-library` | App workload |

## Live URL

```text
https://ca-skill-library.lemonocean-b6e4fb43.swedencentral.azurecontainerapps.io
```

Health:

```text
GET /health
```

## Redeploy after code changes

```sh
az acr build --registry acrskilllibossiandev --image skill-library:latest --platform linux/amd64 .
DIGEST=$(az acr repository show --name acrskilllibossiandev --image skill-library:latest --query digest -o tsv)
az containerapp update -g rg-ossian-dev -n ca-skill-library \
  --image "acrskilllibossiandev.azurecr.io/skill-library@${DIGEST}" \
  --revision-suffix "v$(date +%Y%m%d%H%M)"
```

## Microsoft SSO

Entra app registration: **Skill Library**

Redirect URI:

```text
https://ca-skill-library.lemonocean-b6e4fb43.swedencentral.azurecontainerapps.io/api/auth/callback/microsoft
```

Tenant: `rebtech.se` (`0ddf0690-fd4e-4688-b7c3-e4605688aade`)

First SSO login receives the `admin` role automatically.

## Secrets

Runtime secrets live in the Container App configuration (not in git). Rotate via:

```sh
az containerapp secret set -g rg-ossian-dev -n ca-skill-library --secrets ...
az containerapp update -g rg-ossian-dev -n ca-skill-library ...
```

Required secrets/env:
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` (must match public URL)
- `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID`
- `SKILL_LIBRARY_API_KEYS`

## Agent prompt

For greenfield Azure deploys, use [deploy-agent-prompt.md](./deploy-agent-prompt.md) with `PLATFORM: azure-container-apps`.
