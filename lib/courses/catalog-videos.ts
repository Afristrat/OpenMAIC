/** Export MP4 terminé d'une formation, tel que lu dans `export_jobs`. */
export interface CatalogVideoRow {
  id: string;
  stage_id: string;
  created_at: string;
}

/**
 * Une formation du catalogue montre sa vidéo la plus récente : le dernier export MP4 terminé de sa salle.
 * Les lignes peuvent arriver dans n'importe quel ordre.
 */
export function latestVideoByStage(rows: readonly CatalogVideoRow[]): Map<string, string> {
  const latest = new Map<string, CatalogVideoRow>();
  for (const row of rows) {
    const current = latest.get(row.stage_id);
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) {
      latest.set(row.stage_id, row);
    }
  }
  return new Map([...latest].map(([stageId, row]) => [stageId, row.id]));
}
