# Passerelle OpenAI Images pour le sidecar Studio de la DGX

## Pourquoi

LiteLLM publie les services de la DGX sous forme d'entrées `openai/<nom>` qui pointent sur un
endpoint compatible OpenAI (par exemple `voxcpm` sur `host.docker.internal:18061/v1`). Les
six modèles d'images aujourd'hui déclarés sont tous des modèles Gemini du cloud.

Le sidecar Studio n'est pas compatible OpenAI : soumission asynchrone
`POST /workflow/flux-schnell/txt2img/async`, interrogation `GET /jobs/<id>`, résultat
`GET /jobs/<id>/result`, authentification par l'en-tête `X-Tamkin-Studio-Secret`. Une route
« passthrough » de LiteLLM ne retransmettait pas cet en-tête (constat de la session Tamkīn du
2026-08-20, `C:\Building ideas\docs\hub-litellm-passthrough-headers.md`).

Cette passerelle expose `POST /v1/images/generations` (format OpenAI) et traite le sidecar
elle-même. Le secret du sidecar reste dans la passerelle : ni LiteLLM ni Qalem ne le détiennent.
Qalem utilise ensuite son fournisseur d'images existant (`openai-image`), sans nouvel adaptateur.

## Variables

| Variable | Rôle |
|---|---|
| `SIDECAR_BASE_URL` | Adresse du sidecar, ex. `http://100.85.125.95:8189` (Tailscale) ou `http://192.168.100.20:8189` (LAN) |
| `SIDECAR_SECRET` | Secret accepté par le sidecar. **Un secret Qalem distinct, enregistré par l'administrateur du sidecar** : le secret Tamkīn ne se réutilise pas, et le secret vidéo Qalem (`QALEM_VIDEO_SIDECAR_SECRET`) est refusé en HTTP 401 sur les routes d'images (mesuré le 2026-10-10) |
| `GATEWAY_API_KEY` | Clé que LiteLLM présente à la passerelle (`Authorization: Bearer`) |
| `GATEWAY_MAX_PARALLEL` | Générations simultanées, 1 par défaut : la mémoire du GPU est partagée et un essai antérieur a fini en OOM |

## Déclaration LiteLLM

Fichier de configuration, sur le modèle de `voxcpm` :

```yaml
- model_name: flux-schnell
  litellm_params:
    model: openai/flux-schnell
    api_base: http://host.docker.internal:18190/v1   # port publié par la passerelle sur l'hôte de LiteLLM
    api_key: os.environ/DGX_IMAGE_GATEWAY_KEY
  model_info:
    mode: image_generation
```

Ou par l'API d'administration (`references/add-model.md` de la skill `litellm-admin`), avec le même contenu.
Ajouter `flux-schnell` à la liste des modèles autorisés de la clé LiteLLM de Qalem.

## Côté Qalem, après déclaration

Dans Coolify (application `qalem-runtime`) : ajouter `flux-schnell` à `IMAGE_OPENAI_MODELS`, puis
choisir ce modèle dans les réglages d'images. Aucune variable `IMAGE_DGX_*` n'est nécessaire.

## Lancement

```bash
docker build -t dgx-image-gateway infra/dgx-image-gateway
docker run -d --name dgx-image-gateway -p 18190:8190 \
  -e SIDECAR_BASE_URL=... -e SIDECAR_SECRET=... -e GATEWAY_API_KEY=... dgx-image-gateway
```

## Tests

```bash
cd infra/dgx-image-gateway && python -m pytest -q tests
```

## Limites connues

- Une image par requête (`n=1`), `response_format=b64_json` seulement, modèle `flux-schnell` seulement.
- Taille ramenée à 768 px sur le grand côté, comme l'adaptateur DGX de Qalem (S6-035).
- Limite de 55 secondes par génération, alignée sur l'adaptateur.
- L'activation en production exige une génération réelle réussie et la confirmation de
  l'administrateur du sidecar (critères de la story S6-035).
