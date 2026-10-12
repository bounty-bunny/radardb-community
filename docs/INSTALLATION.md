# Installation

## Requirements

| | |
|---|---|
| Node.js | 20.9 or newer (tested on 24.x) |
| OS | Windows, macOS, Linux (CPU inference; no GPU needed) |
| Memory | 2–4 GB for the demo and small corpora; about 5 GB peak was measured for a 10,000-document corpus with one embedding representation |
| Disk | about 500 MB for dependencies, plus models (about 45 MB) and your workspace caches |
| Network | only for `npm install` and the first model download |

## Install

```bash
git clone <repository-url> radardb && cd radardb
npm ci            # or npm install
npm run radar -- doctor
```

**npm 11 note.** npm may report that `esbuild`, `onnxruntime-node` and `protobufjs` have install scripts "not yet covered by allowScripts". In our clean-install test (Windows, Node 24, npm 11) the build, all tests and a full optimize → deploy → query run worked without approving them. If inference fails on your platform, review and approve them with `npm approve-scripts <package>`.

## Run

| Mode | Command | Notes |
|---|---|---|
| Development | `npm run dev` | hot reload; binds to 127.0.0.1:3000 |
| Production build | `npm run build && npm start` | binds to 127.0.0.1 |
| Headless | `npm run optimize`, `npm run benchmark`, `npm run radar` | no server needed |

## Configuration (environment variables)

| Variable | Default | Effect |
|---|---|---|
| `RADAR_DATA_DIR` | `./.radar` | workspace state and caches |
| `RADAR_SOURCES_ROOT` | `./sources` | root that filesystem sources must stay inside |
| `RADAR_API_KEY` | unset | when set, `/api/v1/*` requires `Authorization: Bearer <key>` |
| `RADAR_ALLOW_REMOTE` | unset | `1` lets the control plane answer non-localhost hosts. **Unsafe on shared networks**: there is no user authentication |
| `RADAR_LOG_QUERIES` | `1` | `0` stops logging query text in the local request log |

## Offline use

After one online run (or `npm run optimize` once), models are cached under `node_modules/@huggingface/transformers/.cache/` and everything runs offline. To prepare an air-gapped machine, copy that cache directory from a connected installation of the same version.

## Docker

There is no official image yet; it is planned (see [ROADMAP.md](ROADMAP.md)). If you build one, include the license texts of bundled native libraries (libvips, LGPL-3.0) and models (Apache-2.0); see `NOTICE`.

## Uninstall

Delete the repository directory. Your data lives only in `RADAR_DATA_DIR` and `RADAR_SOURCES_ROOT`.
