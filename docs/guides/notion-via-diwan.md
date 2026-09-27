# Utiliser Notion comme source via Diwan

Qalem ne reçoit jamais de jeton Notion. Chaque organisation autorise son propre espace depuis la bibliothèque de sources ; Diwan conserve la connexion chiffrée, limite les lectures aux pages explicitement partagées et renvoie à Qalem des versions documentaires traçables.

## Parcours auteur

1. Ouvrir **Bibliothèque de sources**, puis **Vérifier les connexions**.
2. Dans la carte **Notion**, choisir **Connecter**.
3. Dans Notion, sélectionner l’espace et les pages à partager avec Diwan.
4. Revenir dans Qalem, vérifier les connexions, rechercher une page et l’importer.
5. Suivre l’import jusqu’à l’état prêt, actualiser la bibliothèque, puis sélectionner la source avant de générer la formation.

La déconnexion empêche toute nouvelle lecture depuis Notion. Elle ne supprime pas les versions déjà importées et citées dans une formation, afin de préserver la traçabilité ; leur retrait se fait avec les fonctions de révocation documentaire de Diwan.

## Configuration opérateur

Diwan exige `DIWAN_NOTION_CLIENT_ID` et `DIWAN_NOTION_CLIENT_SECRET`. La connexion publique Notion doit déclarer exactement ce rappel :

`https://diwan.ai-mpower.com/api/v1/consumers/qalem/connectors/notion/callback`

Qalem n’exige aucune clé Notion supplémentaire. Il utilise uniquement son jeton consommateur Diwan propre au tenant dans `QALEM_DIWAN_TENANT_TOKENS`.

## Limites et sécurité

- Une page non partagée avec la connexion Notion n’est ni recherchable ni importable.
- La recherche est bornée à 100 résultats par page ; un import accepte au plus 20 pages distinctes.
- Une version est épinglée avec son identifiant externe et sa date de dernière modification. Une modification ultérieure de la page ne réécrit pas silencieusement la version déjà utilisée.
- Qalem refuse toute URL d’autorisation qui ne cible pas `api.notion.com` et ne transmet jamais un identifiant d’organisation fourni par le navigateur.
- Le fonctionnement réel doit être validé avec une page autorisée, une page interdite, une révocation et une formation dont les passages cités proviennent de la version importée.
