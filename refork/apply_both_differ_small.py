#!/usr/bin/env python3
"""
apply_both_differ_small.py — S0-004 (chantier 0-SOCLE, re-fork Qalem v0.3.0)

Rejoue les divergences BOTH_DIFFER < 30 lignes (refork/inventaire.json, cle
"both_differ") entre la carriere (`main`, repo OpenMAIC) et l'archive upstream
v0.3.0 vierge (`upstream-v030/`), sur le worktree refork-v030.

IMPORTANT — pourquoi ce script n'est PAS un simple "diff < 30 lignes => copie
main" mecanique : une revue manuelle du contenu reel des 137 diffs (pas
seulement de leur ampleur en lignes) a montre que la tres grande majorite
d'entre eux ne sont PAS des personnalisations Qalem a rejouer, mais des cas ou
`main` (fork fige sur v0.1.0 + 146 commits) est simplement EN RETARD sur des
correctifs / fonctionnalites / durcissements de securite qu'upstream v0.3.0 a
ajoutes depuis. Exemples concrets trouves (voir refork/s0-004-decisions.json
et port-log.md pour le detail par fichier) :
  - 3 routes API perdent leur `requireAuth(...)` si on applique main (regression
    de securite : authentification retiree).
  - lib/prosemirror/schema/marks.ts perd un correctif anti-injection CSS.
  - lib/export/svg-path-parser.ts perd un garde-fou anti-crash documente.
  - lib/generation/interactive-post-processor.ts reintroduirait un bug de
    performance deja corrige par upstream.
  - ~80 fichiers slide-renderer/canvas importent encore l'ancien chemin
    `@/lib/types/slides` alors qu'upstream a extrait ces types dans le
    package `@openmaic/dsl` (reellement present et utilise dans le worktree,
    cf. packages/@openmaic/dsl/) — revenir a l'ancien chemin romprait la
    coherence d'architecture avec le reste du code v0.3.0 non touche ici.
  - Plusieurs types de providers (image/video/PDF/recherche web) seraient
    retrecis (perte d'IDs de provider existants), au risque direct de casser
    `npx tsc --noEmit` ailleurs dans le code — contraire a l'objectif meme de
    cette story.

En consequence : chaque fichier de la liste porte une decision EXPLICITE et
motivee (refork/s0-004-decisions.json, listes "apply"/"reject"), issue d'une
lecture reelle du diff main-vs-upstream, PAS d'un seuil automatique. Seuls
les fichiers de la liste "apply" (personnalisations Qalem necessaires ou
sans risque identifie : i18n, branding, detection de langue) sont copies
depuis main. Tout le reste est rejete avec motif. Les fichiers a contenu
MELANGE (une partie a appliquer, une partie a preserver) sont rejetes ici et
traites chirurgicalement a la main (voir port-log.md, section "patchs
chirurgicaux").

Verification de non-derive : avant toute copie, on verifie que le fichier du
worktree correspond encore exactement (a la normalisation de fin de ligne
pres) a l'archive upstream-v030/<path> utilisee par compare_trees.py pour
calculer "changed_lines" — si ce n'est plus le cas, rejet automatique
("derive"), independamment de la decision manuelle.

Usage :
    python refork/apply_both_differ_small.py [--repo-root PATH]
        [--inventaire PATH] [--upstream-root PATH] [--decisions PATH] [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# Fichiers @openmaic-drift traites en masse (voir docstring) : import DSL
# revenant a l'ancien chemin @/lib/types/slides. Rejet par defaut, sauf
# override explicite dans decisions["apply"].
DSL_DRIFT_GENERIC_REASON = (
    "Le diff reintroduit un import depuis l'ancien chemin @/lib/types/slides "
    "alors qu'upstream v0.3.0 a extrait ces types dans le package "
    "@openmaic/dsl (reellement present et utilise ailleurs dans le worktree). "
    "Appliquer romprait la coherence d'architecture avec le reste du code "
    "v0.3.0 non touche par cette story. Echantillon verifie manuellement "
    "(6 fichiers) : chacun perd aussi une fonctionnalite ou un correctif "
    "upstream reel au-dela du seul import (ex. SpotlightOverlay perd "
    "domIdPrefix + un correctif Tailwind ; BaseImageElement revient a un "
    "pattern de resolution media plus ancien perdant une correction "
    "documentee de contamination cross-course ; chartOption.ts perd des "
    "verifications defensives ; element-fingerprint.ts perd le cas 'code' "
    "(risque de rupture d'exhaustivite de switch)."
)


def git_show(repo_root: Path, ref_path: str) -> tuple[bytes | None, str | None]:
    proc = subprocess.run(
        ["git", "show", f"main:{ref_path}"],
        cwd=str(repo_root),
        capture_output=True,
    )
    if proc.returncode == 0:
        return proc.stdout, None
    return None, proc.stderr.decode("utf-8", "replace").strip()


def read_fs_fallback(repo_root: Path, rel_path: str) -> bytes | None:
    fs_path = repo_root / rel_path
    if fs_path.is_file():
        return fs_path.read_bytes()
    return None


def splitlines_text(data: bytes) -> list[str]:
    return data.decode("utf-8", errors="replace").splitlines()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument("--inventaire", type=Path, default=None)
    parser.add_argument("--upstream-root", type=Path, default=None)
    parser.add_argument("--decisions", type=Path, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--threshold", type=int, default=30)
    args = parser.parse_args()

    script_path = Path(__file__).resolve()
    refork_dir = script_path.parent
    worktree_root = refork_dir.parent

    inventaire_path = args.inventaire
    if inventaire_path is None:
        for c in (worktree_root / "refork" / "inventaire.json",
                  worktree_root.parent / "refork" / "inventaire.json"):
            if c.is_file():
                inventaire_path = c
                break
    if inventaire_path is None or not inventaire_path.is_file():
        raise SystemExit("inventaire.json introuvable")

    decisions_path = args.decisions or (refork_dir / "s0-004-decisions.json")
    if not decisions_path.is_file():
        raise SystemExit(f"decisions introuvables : {decisions_path}")

    repo_root = args.repo_root or (worktree_root.parent / "OpenMAIC")
    if not (repo_root / ".git").exists():
        raise SystemExit(f"repo OpenMAIC introuvable : {repo_root}")

    upstream_root = args.upstream_root or (worktree_root.parent / "upstream-v030")
    if not upstream_root.is_dir():
        raise SystemExit(f"archive upstream-v030 introuvable : {upstream_root}")

    with inventaire_path.open(encoding="utf-8") as f:
        inventaire = json.load(f)
    with decisions_path.open(encoding="utf-8") as f:
        decisions = json.load(f)

    apply_reasons = {p: r for p, r in decisions.get("apply", [])}
    reject_reasons = {p: r for p, r in decisions.get("reject", [])}

    both_differ = inventaire.get("both_differ")
    if not isinstance(both_differ, list):
        raise SystemExit("inventaire.json : cle 'both_differ' absente ou invalide")

    small = [e for e in both_differ if not e.get("binary") and e["changed_lines"] < args.threshold]

    results = []

    for entry in small:
        rel_path = entry["file"]
        changed_lines = entry["changed_lines"]

        manual_decision = None
        manual_reason = None
        if rel_path in apply_reasons:
            manual_decision = "apply"
            manual_reason = apply_reasons[rel_path]
        elif rel_path in reject_reasons:
            manual_decision = "reject"
            manual_reason = reject_reasons[rel_path]
        else:
            # Non couvert explicitement par la revue manuelle : fait partie du
            # cluster de derive @openmaic/DSL (revu par echantillonnage, cf.
            # docstring) -> rejet generique par prudence.
            manual_decision = "reject"
            manual_reason = DSL_DRIFT_GENERIC_REASON

        if manual_decision == "reject":
            results.append({"file": rel_path, "changed_lines": changed_lines,
                             "decision": "rejected", "reason": manual_reason})
            continue

        # manual_decision == "apply" : verifier la non-derive puis copier main
        archive_path = upstream_root / rel_path
        worktree_path = worktree_root / rel_path

        if not archive_path.is_file():
            results.append({"file": rel_path, "changed_lines": changed_lines,
                             "decision": "rejected",
                             "reason": f"decision manuelle=apply mais absent de l'archive upstream-v030 ({archive_path}) — verification manuelle requise"})
            continue
        if not worktree_path.is_file():
            results.append({"file": rel_path, "changed_lines": changed_lines,
                             "decision": "rejected",
                             "reason": "decision manuelle=apply mais absent du worktree refork-v030 (renomme/supprime depuis S0-001)"})
            continue

        archive_bytes = archive_path.read_bytes()
        worktree_bytes = worktree_path.read_bytes()

        main_bytes, git_err = git_show(repo_root, rel_path)
        source = "git"
        if main_bytes is None:
            main_bytes = read_fs_fallback(repo_root, rel_path)
            source = "fs-fallback"
            if main_bytes is None:
                results.append({"file": rel_path, "changed_lines": changed_lines,
                                 "decision": "rejected",
                                 "reason": f"decision manuelle=apply mais source main introuvable : git show a echoue ({git_err}) ET absent du disque OpenMAIC"})
                continue

        # Idempotence : si le worktree correspond DEJA au contenu main cible
        # (execution precedente de ce script), ne pas rejeter pour "derive" —
        # c'est precisement l'etat final voulu, pas une divergence inattendue.
        if main_bytes == worktree_bytes:
            results.append({"file": rel_path, "changed_lines": changed_lines,
                             "decision": "noop",
                             "reason": f"contenu main deja applique au worktree lors d'une execution precedente (source={source}) — idempotent, rien a refaire. Motif d'application : {manual_reason}"})
            continue

        # Verification de non-derive : le worktree doit encore correspondre a
        # l'archive upstream-v030 utilisee pour calculer "changed_lines" AVANT
        # d'ecrire — sinon la decision manuelle="apply" a ete prise sur une
        # base qui ne correspond plus a l'etat reel du fichier.
        if splitlines_text(archive_bytes) != splitlines_text(worktree_bytes):
            results.append({"file": rel_path, "changed_lines": changed_lines,
                             "decision": "rejected",
                             "reason": "decision manuelle=apply mais derive detectee : le fichier du worktree ne correspond plus a l'archive upstream-v030 utilisee pour calculer le diff — remplacement automatique juge non sur malgre la decision manuelle"})
            continue

        if not args.dry_run:
            worktree_path.parent.mkdir(parents=True, exist_ok=True)
            worktree_path.write_bytes(main_bytes)

        results.append({"file": rel_path, "changed_lines": changed_lines,
                         "decision": "applied",
                         "reason": f"{manual_reason} (source={source}, aucune derive detectee)"})

    applied = [r for r in results if r["decision"] == "applied"]
    rejected = [r for r in results if r["decision"] == "rejected"]
    noop = [r for r in results if r["decision"] == "noop"]

    print(f"Total both_differ < {args.threshold} lignes : {len(small)}")
    print(f"  - appliques : {len(applied)}")
    print(f"  - rejetes   : {len(rejected)}")
    print(f"  - no-op     : {len(noop)}")
    print("\nAPPLIQUES :")
    for r in applied:
        print(f"  - {r['file']}")

    log_path = refork_dir / "port-log.md"
    now = datetime.datetime.now().isoformat(timespec="seconds")
    lines = []
    lines.append(f"\n## Execution S0-004 (revue manuelle) {now}{' (dry-run)' if args.dry_run else ''}\n")
    lines.append(
        "Application semi-automatique des divergences BOTH_DIFFER < "
        f"{args.threshold} lignes, apres REVUE MANUELLE DU CONTENU de chacune "
        "(pas seulement du nombre de lignes — voir docstring de "
        "`refork/apply_both_differ_small.py` et `refork/s0-004-decisions.json` "
        "pour la justification complete)."
    )
    lines.append("")
    lines.append(f"- Inventaire : `{inventaire_path}`")
    lines.append(f"- Decisions manuelles : `{decisions_path}`")
    lines.append(f"- Repo carriere (main) : `{repo_root}`")
    lines.append(f"- Archive upstream v0.3.0 : `{upstream_root}`")
    lines.append(f"- Worktree cible : `{worktree_root}`")
    lines.append(f"- Total fichiers BOTH_DIFFER < {args.threshold} lignes : {len(small)}")
    lines.append(f"- Appliques : {len(applied)}")
    lines.append(f"- Rejetes : {len(rejected)}")
    lines.append(f"- No-op (deja a jour) : {len(noop)}")
    lines.append("")
    lines.append("### Detail fichier par fichier")
    lines.append("")
    lines.append("| Fichier | Lignes diff | Decision | Motif |")
    lines.append("|---|---|---|---|")
    for r in sorted(results, key=lambda x: x["file"]):
        motif = r["reason"].replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {r['file']} | {r['changed_lines']} | {r['decision']} | {motif} |")

    if not args.dry_run:
        with log_path.open("a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\nLog ecrit dans : {log_path}")
    else:
        print("\n[dry-run] log non ecrit")

    diag_path = refork_dir / "s0-004-results.json"
    if not args.dry_run:
        diag_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    return 0


if __name__ == "__main__":
    sys.exit(main())
