# LRS souverain Qalem

Ce service héberge les statements xAPI de Qalem sur ServeurIA. Il ne dépend pas
d’un SaaS : le volume Docker, les clés, l’administration et les sauvegardes
restent sous contrôle Qalem.

## Frontières

- `https://lrs.qalem.ma/xapi/*` est la seule surface publique ; Traefik émet le
  certificat Let’s Encrypt directement sur ServeurIA.
- L’interface d’administration SQL LRS n’est liée qu’à `127.0.0.1:18080`.
  Elle n’est donc accessible qu’au serveur ou par un tunnel SSH administrateur.
- Le DNS `lrs.qalem.ma` doit être un enregistrement direct, sans proxy CDN. Le
  CDN ne voit ainsi ni les corps de statements ni les identifiants Basic xAPI.
- LRS est inactif pour Qalem tant que le flag `xapi_emission` et une
  configuration chiffrée d’organisation ne sont pas explicitement activés.

## Persistance et reprise

La base SQLite vit dans le volume nommé `qalem_lrs_data`. La sauvegarde
opérationnelle met brièvement le conteneur en pause, archive le volume vers
`/var/backups/qalem-lrs`, puis le redémarre. La file xAPI de Qalem gère les
tentatives pendant cette indisponibilité contrôlée. Une restauration se fait
uniquement après vérification du SHA-256 de l’archive et recette `GET /xapi/about`.

Les valeurs de `.env` sont créées depuis le coffre ; elles ne doivent jamais
être ajoutées au dépôt, imprimées ou copiées dans une variable Coolify.

## Mise en service sûre

1. Créer le DNS direct et vérifier l’émission TLS par Traefik.
2. Créer le compte d’administration permanent, puis supprimer le compte seed et
   retirer ses variables de l’environnement du conteneur.
3. Conserver uniquement l’identifiant xAPI minimal pour Qalem ; ne jamais donner
   le compte d’administration à un tenant.
4. Vérifier une écriture, une lecture et une suppression d’acteur de recette,
   avec un acteur pseudonymisé, avant toute activation organisationnelle.

La suppression physique d’un acteur est activée dans SQL LRS exclusivement pour
ce cycle de confidentialité. Elle exige le compte d’administration local et ne
peut pas être appelée par la surface publique `/xapi`.
