# S1-012 — Preuve de persistance du worker de capture

Date : 2026-07-22  
Statut : partie infrastructure certifiée ; test visuel restant.

## Défaut constaté

Le code du worker résout une session Playwright par hôte sous
`/data/storage-states`, mais la définition effectivement déployée par Coolify
(`infra/coolify/qalem-runtime.yml`) ne déclarait ni ce répertoire ni un volume.
Une session enregistrée aurait donc disparu au prochain remplacement du
conteneur.

## Correction

Le runtime Coolify déclare désormais :

- `CAPTURE_STORAGE_STATE_DIR=/data/storage-states` ;
- le volume nommé `capture-storage-states` monté sur
  `/data/storage-states` en lecture-écriture.

La modification est portée par le commit `fe065b6`.

## Preuves système après déploiement

- Coolify a terminé le déploiement `dta4a440s1935v6knfk3m31i` sur le SHA
  `fe065b677a89a311e1d47392bc80792aaa696a5a`.
- Le worker porte l’image
  `a14gf0n3u719hnnd2yujrtmr_capture-worker:fe065b677a89a311e1d47392bc80792aaa696a5a`
  et son health check est `healthy`.
- `docker inspect` confirme le volume
  `a14gf0n3u719hnnd2yujrtmr_capture-storage-states` monté sur
  `/data/storage-states`.
- `https://qalem.ma/health` répond HTTP 200 après le déploiement.

## Ce qui reste volontairement ouvert

La session authentifiée de `proxy.ai-mpower.com` n’est pas encore déposée dans
ce volume. Le protocole S1-012 exige ensuite une vraie capture injectée dans
une scène puis validée visuellement. La story reste donc `passes: false`.
