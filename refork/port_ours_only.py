#!/usr/bin/env python3
"""
port_ours_only.py — S0-002 (chantier 0-SOCLE, re-fork Qalem v0.3.0)

Copie mecanique et rejouable des fichiers OURS_ONLY (personnalisations
exclusives a la carriere `main`) depuis le repo principal OpenMAIC
(branche `main`) vers le worktree refork-v030-wt (branche `refork-v030`).

Source de verite : refork/inventaire.json (cle "ours_only", liste de
264 chemins relatifs).

Strategie de copie, par fichier, dans cet ordre (FR-1 : toujours
chercher l'equivalent carriere d'abord) :
  1. `git show main:<path>` (execute avec cwd = repo OpenMAIC, qui
     partage le meme `.git` que ce worktree) -> contenu exact du blob
     versionne sur main.
  2. Si (1) echoue (fichier non suivi par git sur main : gitignore ou
     genere), repli sur une lecture brute du fichier sur le disque du
     repo OpenMAIC, au meme chemin relatif. Ce repli est un ecart au
     protocole FR-1 strict, motive et journalise explicitement pour
     chaque fichier concerne dans refork/port-log.md (voir markers
     "git" vs "fs-fallback" dans le rapport).

Aucune adaptation du contenu : copie brute octet pour octet.

Idempotent : une deuxieme execution ne reecrit que les fichiers dont le
contenu source a change ; les fichiers deja identiques sont comptes
"unchanged" et ne sont pas touches sur le disque.

Usage :
    python refork/port_ours_only.py [--repo-root PATH] [--inventaire PATH] [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import subprocess
import sys
from pathlib import Path

# Console Windows (cp1252) incapable d'encoder les accents francais ; on force
# UTF-8 en sortie pour eviter un crash sur un simple print() de rapport.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def find_inventaire(worktree_root: Path, explicit: Path | None) -> Path:
    if explicit is not None:
        if not explicit.is_file():
            raise SystemExit(f"inventaire.json introuvable : {explicit}")
        return explicit
    candidates = [
        worktree_root / "refork" / "inventaire.json",
        worktree_root.parent / "refork" / "inventaire.json",
    ]
    for c in candidates:
        if c.is_file():
            return c
    raise SystemExit(
        "inventaire.json introuvable. Chemins essayes : "
        + ", ".join(str(c) for c in candidates)
    )


def find_repo_root(worktree_root: Path, explicit: Path | None) -> Path:
    if explicit is not None:
        if not (explicit / ".git").exists():
            raise SystemExit(f"--repo-root ne pointe pas vers un repo git : {explicit}")
        return explicit
    candidate = worktree_root.parent / "OpenMAIC"
    if (candidate / ".git").exists():
        return candidate
    raise SystemExit(
        f"Repo principal OpenMAIC introuvable a l'emplacement attendu : {candidate}. "
        "Utiliser --repo-root pour le preciser explicitement."
    )


def git_show(repo_root: Path, rel_path: str) -> tuple[bytes | None, str | None]:
    """Retourne (contenu, None) si succes, ou (None, message_erreur) si echec."""
    proc = subprocess.run(
        ["git", "show", f"main:{rel_path}"],
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


# Exceptions motivees (FR-1 : ecrire du neuf / preserver l'existant est
# l'exception motivee) : chemins que ce script NE DOIT PAS ecraser meme s'ils
# figurent dans OURS_ONLY, parce que le worktree refork-v030 contient deja,
# a cet emplacement, un fichier PLUS RECENT que la carriere main (superset
# strict : tout le contenu de main + du travail deja fait dans CE worktree).
# Verifie : `.ralph/progress.md` sur main est un prefixe EXACT (33 lignes)
# du fichier du worktree (34 lignes, ajoute l'entree Session Log S0-001).
# Ecraser ecrirait la version main par-dessus et detruirait silencieusement
# le suivi actif du Ralph loop de re-fork lui-meme.
PROTECTED_PATHS = {
    ".ralph/progress.md": (
        "suivi actif du Ralph loop de re-fork (deja modifie par S0-001 dans ce "
        "worktree) ; le contenu main est un prefixe exact du contenu worktree "
        "(superset strict) -> ecraser detruirait l'entree Session Log S0-001"
    ),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=None,
                         help="Chemin du repo OpenMAIC (ou vit `main`). Defaut : <parent-worktree>/OpenMAIC")
    parser.add_argument("--inventaire", type=Path, default=None,
                         help="Chemin de refork/inventaire.json. Defaut : recherche worktree puis niveau chapeau")
    parser.add_argument("--dry-run", action="store_true",
                         help="N'ecrit rien, affiche seulement ce qui serait fait")
    args = parser.parse_args()

    script_path = Path(__file__).resolve()
    refork_dir = script_path.parent
    worktree_root = refork_dir.parent

    inventaire_path = find_inventaire(worktree_root, args.inventaire)
    repo_root = find_repo_root(worktree_root, args.repo_root)

    with inventaire_path.open(encoding="utf-8") as f:
        inventaire = json.load(f)

    ours_only = inventaire.get("ours_only")
    if not isinstance(ours_only, list):
        raise SystemExit("inventaire.json : cle 'ours_only' absente ou invalide")

    # Dedup tout en preservant l'ordre (l'inventaire ne doit pas contenir
    # de doublons, mais on se protege).
    seen = set()
    paths = []
    for p in ours_only:
        if p not in seen:
            seen.add(p)
            paths.append(p)

    written, updated, unchanged, git_sourced, fs_fallback_sourced = [], [], [], [], []
    errors = []
    protected = []  # (rel_path, motif) — presents mais volontairement non ecrases

    for rel_path in paths:
        content, git_err = git_show(repo_root, rel_path)
        source = "git"
        if content is None:
            content = read_fs_fallback(repo_root, rel_path)
            source = "fs-fallback"
            if content is None:
                errors.append((rel_path, f"git show a echoue ({git_err}) ET absent du disque OpenMAIC"))
                continue
            fs_fallback_sourced.append(rel_path)
        else:
            git_sourced.append(rel_path)

        dest = worktree_root / rel_path
        existing = dest.read_bytes() if dest.is_file() else None

        if rel_path in PROTECTED_PATHS and existing is not None and existing != content:
            if not existing.startswith(content):
                raise SystemExit(
                    f"PROTECTION INVALIDE pour {rel_path} : le contenu du worktree n'est "
                    "plus un superset du contenu carriere (main a change ou le worktree a "
                    "diverge autrement). Verification manuelle requise avant de continuer."
                )
            protected.append((rel_path, PROTECTED_PATHS[rel_path]))
            continue

        if existing == content:
            unchanged.append(rel_path)
            continue

        if args.dry_run:
            (updated if existing is not None else written).append(rel_path)
            continue

        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        if existing is not None:
            updated.append(rel_path)
        else:
            written.append(rel_path)

    # --- Verification : ecart script vs inventaire (non pertinent en dry-run,
    # puisque rien n'a ete ecrit sur disque) ---
    ecarts = []
    if not args.dry_run:
        for rel_path in paths:
            dest = worktree_root / rel_path
            if not dest.is_file():
                ecarts.append((rel_path, "absent du worktree apres execution"))
                continue
            content, git_err = git_show(repo_root, rel_path)
            if content is None:
                content = read_fs_fallback(repo_root, rel_path)
            if content is None:
                ecarts.append((rel_path, "source introuvable (git ET disque)"))
                continue
            if rel_path in PROTECTED_PATHS:
                # Exception documentee : on exige un superset strict (le
                # fichier existe et contient integralement le contenu
                # carriere), pas une egalite octet pour octet.
                if not dest.read_bytes().startswith(content):
                    ecarts.append((rel_path, "protege mais n'est plus un superset du contenu carriere"))
                continue
            if dest.read_bytes() != content:
                ecarts.append((rel_path, "contenu different de la source"))

    total = len(paths)
    ok_count = total - len(ecarts)

    # --- Rapport console ---
    print(f"Inventaire : {inventaire_path}")
    print(f"Repo carriere (main) : {repo_root}")
    print(f"Worktree cible : {worktree_root}")
    print(f"Total OURS_ONLY attendu : {total}")
    print(f"  - source git show main:<path> : {len(git_sourced)}")
    print(f"  - source repli filesystem (non suivi sur main) : {len(fs_fallback_sourced)}")
    print(f"  - nouveaux fichiers ecrits : {len(written)}")
    print(f"  - fichiers mis a jour (contenu different) : {len(updated)}")
    print(f"  - fichiers deja a jour (idempotence) : {len(unchanged)}")
    print(f"  - erreurs (source introuvable) : {len(errors)}")
    print(f"  - proteges (non ecrases, deja plus recents que main) : {len(protected)}")
    for p, motif in protected:
        print(f"      - {p} : {motif}")
    if args.dry_run:
        print("Verification post-copie : ignoree (--dry-run, rien n'a ete ecrit)")
    else:
        print(f"Verification post-copie : {ok_count}/{total} conformes, ecarts = {len(ecarts)}")
    if errors:
        print("\nERREURS :")
        for p, msg in errors:
            print(f"  - {p} : {msg}")
    if ecarts:
        print("\nECARTS (script vs inventaire) :")
        for p, msg in ecarts:
            print(f"  - {p} : {msg}")

    # --- Log d'execution (rejouable, append) ---
    log_path = refork_dir / "port-log.md"
    now = datetime.datetime.now().isoformat(timespec="seconds")
    lines = []
    lines.append(f"\n## Execution {now}{' (dry-run)' if args.dry_run else ''}\n")
    lines.append(f"- Inventaire : `{inventaire_path}`")
    lines.append(f"- Repo carriere (main) : `{repo_root}`")
    lines.append(f"- Worktree cible : `{worktree_root}`")
    lines.append(f"- Total OURS_ONLY attendu : {total}")
    lines.append(f"- Source `git show main:<path>` : {len(git_sourced)}")
    lines.append(f"- Source repli filesystem (fichier non suivi sur main — gitignore/genere) : {len(fs_fallback_sourced)}")
    if fs_fallback_sourced:
        lines.append("  - Fichiers concernes par le repli filesystem (motif FR-1 : `git show` echoue car "
                      "fichier absent de l'historique `main`, present seulement sur le disque du repo carriere) :")
        for p in fs_fallback_sourced:
            lines.append(f"    - `{p}`")
    lines.append(f"- Fichiers proteges (non ecrases, superset strict deja present dans le worktree) : {len(protected)}")
    for p, motif in protected:
        lines.append(f"  - `{p}` : {motif}")
    lines.append(f"- Nouveaux fichiers ecrits : {len(written)}")
    lines.append(f"- Fichiers mis a jour : {len(updated)}")
    lines.append(f"- Fichiers deja a jour (idempotence) : {len(unchanged)}")
    lines.append(f"- Erreurs : {len(errors)}")
    for p, msg in errors:
        lines.append(f"  - ERREUR `{p}` : {msg}")
    lines.append(f"- Verification post-copie : {ok_count}/{total} conformes, ecarts = {len(ecarts)}")
    for p, msg in ecarts:
        lines.append(f"  - ECART `{p}` : {msg}")
    lines.append(f"- Hash sha256 de l'ensemble des 264 chemins (contenu concatene, ordre inventaire) : "
                  f"{sha256_bytes(b''.join((worktree_root / p).read_bytes() for p in paths if (worktree_root / p).is_file()))}")

    if not args.dry_run:
        with log_path.open("a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print(f"\nLog ecrit dans : {log_path}")
    else:
        print("\n[dry-run] log non ecrit")

    if errors or ecarts:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
