# Sidecar AudioSeal Qalem

Ce service interne reçoit un artefact de transmission depuis le worker BullMQ,
applique le modèle officiel `audioseal_wm_16bits`, puis renvoie un MP3 privé.
Il n’ouvre aucun port hôte, ne conserve aucun artefact de requête et refuse toute
requête sans jeton partagé avec le worker.

## Bornes d’exploitation

- une requête à la fois ;
- 150 Mio d’entrée, 180 secondes par défaut et 900 secondes au maximum ;
- 3 Gio, 1,5 CPU et 128 PID dans le compose de production ;
- CPU par défaut ; `QALEM_AUDIOSEAL_DEVICE=cuda` est un choix de déploiement
  explicite qui exige un runtime GPU compatible.

Le flag Qalem `watermarking` reste désactivé. Le service ne devient activable
qu’après l’exécution réussie du harnais `p2c.py` avec une parole autorisée d’au
moins 44 secondes. Celui-ci vérifie strictement la récupération de l’identifiant
opaque après MP3 128 kbit/s, OGG, normalisation et extrait non aligné de 30 s.

```bash
python p2c.py /chemin/vers/parole-autorisee.wav
```

Le harnais ne journalise ni le jeton ni le contenu audio. La sortie est une
preuve JSON constituée de hash d’artefact, de compte de segments détectés et de
l’identifiant opaque reconstitué.
