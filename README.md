# @lntt/create

CLI per scaffoldare un nuovo progetto a partire da [`LunetteOrg/starter`](https://github.com/LunetteOrg/starter). `lntt` è l'abbreviazione (consonanti) di "lunette" usata come namespace npm; l'org GitHub resta `LunetteOrg`.

## Uso

```bash
npm create @lntt my-app
# oppure
pnpm create @lntt my-app
```

Poi:

```bash
cd my-app
pnpm install
pnpm infra:up
pnpm dev
```

## Cosa fa

1. Scarica uno snapshot pulito di `LunetteOrg/starter@main` (tarball, niente storia git).
2. Rinomina i placeholder con il nome scelto:
   - `@starter/*` → `@<nome>/*` (pacchetti workspace)
   - `starter-db`, `starter-web` → `<nome>-db`, `<nome>-web` (`render.yaml`)
   - `"name": "starter"` → `"name": "<nome>"` (root `package.json`, devcontainer)
   - Credenziali Postgres in `compose.yaml` e `.github/workflows/ci.yml`
3. Esegue `git init` + primo commit.

## Requisiti

- Node ≥ 20
- `curl` e `tar` (presenti su macOS/Linux/WSL).
- `git` (opzionale: senza, salta solo `git init`).

## Vincoli sul nome progetto

Kebab-case, deve iniziare con una lettera: `^[a-z][a-z0-9-]*$`.

Esempi validi: `acme`, `my-app`, `lunette-shop`.

## Roadmap

Vedi [LunetteOrg/starter#3](https://github.com/LunetteOrg/starter/issues/3) per l'evoluzione verso prompt interattivi e multi-template.

## Licenza

MIT
