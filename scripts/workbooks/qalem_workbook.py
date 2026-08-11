#!/usr/bin/env python3
"""Generate and assess Qalem workbooks with Python's standard library only."""

from __future__ import annotations

import json
import math
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
PROFILE = "cash-flow-13-week"
WEEKS = 13


def col_name(index: int) -> str:
    result = ""
    value = index + 1
    while value:
        value, remainder = divmod(value - 1, 26)
        result = chr(65 + remainder) + result
    return result


def safe_sheet_name(value: object, fallback: str) -> str:
    name = re.sub(r"[\\/*?:\[\]]", " ", str(value or fallback)).strip()[:31]
    return name or fallback


def cell_xml(ref: str, value: object, style: int = 0) -> str:
    style_attr = f' s="{style}"' if style else ""
    if value is None:
        return f'<c r="{ref}"{style_attr}/>'
    if isinstance(value, bool):
        return f'<c r="{ref}" t="b"{style_attr}><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)) and math.isfinite(value):
        return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'
    text = str(value)
    if text.startswith("=") and len(text) > 1:
        return f'<c r="{ref}"{style_attr}><f>{escape(text[1:])}</f></c>'
    return f'<c r="{ref}" t="inlineStr"{style_attr}><is><t xml:space="preserve">{escape(text)}</t></is></c>'


def worksheet_xml(rows: list[list[object]], styles: dict[str, int] | None = None) -> str:
    styles = styles or {}
    rendered_rows: list[str] = []
    for row_index, row in enumerate(rows, 1):
        cells = []
        for col_index, value in enumerate(row):
            ref = f"{col_name(col_index)}{row_index}"
            cells.append(cell_xml(ref, value, styles.get(ref, 0)))
        rendered_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    dimension = f"A1:{col_name(max((len(row) for row in rows), default=1) - 1)}{max(len(rows), 1)}"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{NS}"><dimension ref="{dimension}"/>'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="B4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>'
        '<cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="14" width="14" customWidth="1"/></cols>'
        f'<sheetData>{"".join(rendered_rows)}</sheetData></worksheet>'
    )


def styles_xml() -> str:
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="{NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="# ##0 [$MAD]"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><i/><color rgb="FF475569"/><name val="Aptos"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172554"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3C4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'''


def cash_flow_workbook() -> tuple[list[dict[str, object]], dict[str, dict[str, int]]]:
    weeks = [f"Semaine {index}" for index in range(1, WEEKS + 1)]
    instructions = [
        ["Budget de trésorerie glissant sur 13 semaines"],
        ["Objectif", "Anticiper le point bas de trésorerie et décider avant la rupture."],
        ["Devise", "MAD"],
        ["1", "Lisez le cas pratique."],
        ["2", "Saisissez les montants dans les cellules jaunes de la feuille Trésorerie 13 semaines."],
        ["3", "Conservez les décaissements en valeurs positives. Les formules calculent leur effet."],
        ["4", "Ajoutez une hypothèse de scénario, puis déposez le fichier dans Qalem pour contrôle."],
        ["Important", "Les données sont fictives et servent uniquement à l'exercice."],
    ]
    case_rows = [
        ["Cas pratique fictif", *weeks],
        ["Solde initial", 125000, *([None] * 12)],
        ["Encaissements clients", 62000, 54000, 73000, 48000, 68000, 81000, 57000, 76000, 65000, 92000, 71000, 84000, 98000],
        ["Autres encaissements", 0, 12000, 0, 0, 18000, 0, 0, 10000, 0, 0, 15000, 0, 0],
        ["Fournisseurs", 37000, 42000, 51000, 39000, 47000, 56000, 44000, 53000, 46000, 58000, 49000, 55000, 61000],
        ["Salaires", 0, 0, 72000, 0, 0, 0, 72000, 0, 0, 0, 72000, 0, 0],
        ["Charges fixes", 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000],
        ["Impôts et taxes", 0, 0, 0, 28000, 0, 0, 0, 0, 34000, 0, 0, 0, 0],
        ["Remboursements", 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000, 6000],
        ["Autres décaissements", 4000, 3000, 5000, 4000, 6000, 3000, 4000, 5000, 3500, 4500, 4000, 5000, 6000],
        ["Seuil de sécurité", *([45000] * 13)],
    ]
    forecast: list[list[object]] = [
        ["Budget de trésorerie glissant sur 13 semaines"],
        ["Devise", "MAD"],
        ["Rubrique", *weeks],
        ["Solde initial", None, *[f"={col_name(index)}16" for index in range(1, 13)]],
        ["Encaissements clients", *([None] * 13)],
        ["Autres encaissements", *([None] * 13)],
        ["Total encaissements", *[f"=SUM({col_name(index)}5:{col_name(index)}6)" for index in range(1, 14)]],
        ["Fournisseurs", *([None] * 13)],
        ["Salaires", *([None] * 13)],
        ["Charges fixes", *([None] * 13)],
        ["Impôts et taxes", *([None] * 13)],
        ["Remboursements", *([None] * 13)],
        ["Autres décaissements", *([None] * 13)],
        ["Total décaissements", *[f"=SUM({col_name(index)}8:{col_name(index)}13)" for index in range(1, 14)]],
        ["Flux net", *[f"={col_name(index)}7-{col_name(index)}14" for index in range(1, 14)]],
        ["Solde final", *[f"={col_name(index)}4+{col_name(index)}15" for index in range(1, 14)]],
        ["Seuil de sécurité", *([None] * 13)],
        ["Marge sur seuil", *[f"={col_name(index)}16-{col_name(index)}17" for index in range(1, 14)]],
    ]
    scenarios = [
        ["Scénario retenu", "Décrivez ici une hypothèse testée"],
        ["Décision envisagée", "Indiquez l'action déclenchée si le seuil est franchi"],
        ["Justification", "Reliez la décision au point bas calculé"],
    ]
    metadata = [["profile", PROFILE], ["version", "1"], ["currency", "MAD"], ["weeks", 13]]
    sheets = [
        {"name": "Mode d'emploi", "rows": instructions},
        {"name": "Cas pratique", "rows": case_rows},
        {"name": "Trésorerie 13 semaines", "rows": forecast},
        {"name": "Scénarios", "rows": scenarios},
        {"name": "_Qalem", "rows": metadata, "hidden": True},
    ]
    style_maps: dict[str, dict[str, int]] = {}
    for sheet in sheets:
        name = str(sheet["name"])
        rows = sheet["rows"]
        styles: dict[str, int] = {}
        for col in range(max((len(row) for row in rows), default=1)):
            styles[f"{col_name(col)}1"] = 1 if name in {"Mode d'emploi", "Trésorerie 13 semaines"} else 2
        if name == "Trésorerie 13 semaines":
            for col in range(14):
                styles[f"{col_name(col)}3"] = 2
            for row in (4, 5, 6, 8, 9, 10, 11, 12, 13, 17):
                for col in range(1, 14):
                    styles[f"{col_name(col)}{row}"] = 3
            for row in (7, 14, 15, 16, 18):
                for col in range(1, 14):
                    styles[f"{col_name(col)}{row}"] = 4
        style_maps[name] = styles
    return sheets, style_maps


def build_workbook(spec: dict[str, object], profile: str | None) -> bytes:
    if profile == PROFILE:
        sheets, style_maps = cash_flow_workbook()
    else:
        raw_sheets = spec.get("sheets")
        if not isinstance(raw_sheets, list) or not raw_sheets:
            raise ValueError("Workbook requires at least one sheet")
        sheets = []
        for index, raw in enumerate(raw_sheets[:5], 1):
            if not isinstance(raw, dict) or not isinstance(raw.get("rows"), list) or not raw["rows"]:
                raise ValueError(f"Sheet {index} has no rows")
            sheets.append({"name": safe_sheet_name(raw.get("name"), f"Feuille {index}"), "rows": raw["rows"][:500]})
        style_maps = {str(sheet["name"]): {} for sheet in sheets}

    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        archive.writestr("[Content_Types].xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>{overrides}</Types>')
        archive.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        sheet_entries = "".join(
            f'<sheet name={quoteattr(str(sheet["name"]))} sheetId="{index}" r:id="rId{index}"{(" state=\"hidden\"" if sheet.get("hidden") else "")}/>'
            for index, sheet in enumerate(sheets, 1)
        )
        archive.writestr("xl/workbook.xml", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="{NS}" xmlns:r="{REL_NS}"><sheets>{sheet_entries}</sheets><calcPr calcId="0" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>')
        relationships = "".join(
            f'<Relationship Id="rId{index}" Type="{REL_NS}/worksheet" Target="worksheets/sheet{index}.xml"/>'
            for index in range(1, len(sheets) + 1)
        ) + f'<Relationship Id="rId{len(sheets) + 1}" Type="{REL_NS}/styles" Target="styles.xml"/>'
        archive.writestr("xl/_rels/workbook.xml.rels", f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{PKG_REL_NS}">{relationships}</Relationships>')
        archive.writestr("xl/styles.xml", styles_xml())
        for index, sheet in enumerate(sheets, 1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", worksheet_xml(sheet["rows"], style_maps.get(str(sheet["name"]))))
    return output.getvalue()


def workbook_cells(path: Path) -> dict[str, dict[str, dict[str, object]]]:
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 200 or sum(entry.file_size for entry in entries) > 20 * 1024 * 1024:
            raise ValueError("Workbook archive exceeds the safety limit")
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in relationships}
        result: dict[str, dict[str, dict[str, object]]] = {}
        sheets = workbook.find(f"{{{NS}}}sheets")
        for sheet in () if sheets is None else sheets:
            name = sheet.attrib["name"]
            rel_id = sheet.attrib[f"{{{REL_NS}}}id"]
            target = targets[rel_id]
            if not re.fullmatch(r"(?:xl/)?worksheets/sheet[0-9]+\.xml", target):
                raise ValueError("Workbook contains an unsafe worksheet target")
            xml_path = target if target.startswith("xl/") else f"xl/{target}"
            root = ET.fromstring(archive.read(xml_path))
            cells: dict[str, dict[str, object]] = {}
            for cell in root.findall(f".//{{{NS}}}c"):
                ref = cell.attrib.get("r", "")
                formula = cell.findtext(f"{{{NS}}}f")
                inline = cell.find(f"{{{NS}}}is/{{{NS}}}t")
                raw = cell.findtext(f"{{{NS}}}v")
                value: object = inline.text if inline is not None else raw
                if raw is not None and cell.attrib.get("t") not in {"inlineStr", "s", "str"}:
                    try:
                        value = float(raw)
                    except ValueError:
                        value = raw
                cells[ref] = {"value": value, "formula": formula}
            result[name] = cells
        return result


def number(cells: dict[str, dict[str, object]], ref: str) -> float | None:
    value = cells.get(ref, {}).get("value")
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value.replace(" ", "").replace(",", "."))
            return parsed if math.isfinite(parsed) else None
        except ValueError:
            return None
    return None


def assess(path: Path) -> dict[str, object]:
    try:
        sheets = workbook_cells(path)
    except (OSError, KeyError, ValueError, zipfile.BadZipFile, ET.ParseError) as exc:
        return {"profile": None, "score": 0, "verdict": "Fichier Excel illisible", "checks": [], "metrics": {}, "findings": [f"Le fichier ne peut pas être analysé : {type(exc).__name__}."]}
    meta = sheets.get("_Qalem", {})
    profile = meta.get("B1", {}).get("value")
    if profile != PROFILE:
        return {"profile": profile, "score": 0, "verdict": "Classeur non reconnu", "checks": [], "metrics": {}, "findings": ["Utilisez le classeur fourni par cette formation afin de conserver le contrat d'évaluation."]}
    cash = sheets.get("Trésorerie 13 semaines", {})
    if not cash:
        return {"profile": PROFILE, "score": 0, "verdict": "Structure incomplète", "checks": [], "metrics": {}, "findings": ["La feuille « Trésorerie 13 semaines » est absente."]}

    input_refs = ["B4"]
    input_refs += [f"{col_name(col)}{row}" for row in (5, 6, 8, 9, 10, 11, 12, 13, 17) for col in range(1, 14)]
    completed = sum(number(cash, ref) is not None for ref in input_refs)
    completeness = completed / len(input_refs)
    negatives = [ref for ref in input_refs if (number(cash, ref) or 0) < 0]

    expected: dict[str, str] = {}
    for col in range(1, 14):
        letter = col_name(col)
        expected[f"{letter}7"] = f"SUM({letter}5:{letter}6)"
        expected[f"{letter}14"] = f"SUM({letter}8:{letter}13)"
        expected[f"{letter}15"] = f"{letter}7-{letter}14"
        expected[f"{letter}16"] = f"{letter}4+{letter}15"
        expected[f"{letter}18"] = f"{letter}16-{letter}17"
        if col > 1:
            expected[f"{letter}4"] = f"{col_name(col - 1)}16"
    formulas_ok = sum((cash.get(ref, {}).get("formula") or "").replace("$", "").upper() == formula.upper() for ref, formula in expected.items())
    formula_ratio = formulas_ok / len(expected)

    balances: list[float] = []
    opening = number(cash, "B4")
    calculable = opening is not None
    current = opening or 0.0
    for col in range(1, 14):
        letter = col_name(col)
        inputs = [number(cash, f"{letter}{row}") for row in (5, 6, 8, 9, 10, 11, 12, 13)]
        if any(value is None for value in inputs):
            calculable = False
            balances.append(current)
            continue
        receipts = sum(value or 0 for value in inputs[:2])
        outflows = sum(value or 0 for value in inputs[2:])
        current += receipts - outflows
        balances.append(current)

    thresholds = [number(cash, f"{col_name(col)}17") for col in range(1, 14)]
    scenario = sheets.get("Scénarios", {})
    scenario_text = " ".join(str(scenario.get(ref, {}).get("value") or "").strip() for ref in ("B1", "B2", "B3"))
    scenario_done = len(scenario_text.replace("Décrivez ici une hypothèse testée", "").replace("Indiquez l'action déclenchée si le seuil est franchi", "").replace("Reliez la décision au point bas calculé", "").strip()) >= 30

    score = round(20 + 20 * completeness + 25 * formula_ratio + (10 if not negatives else 0) + (15 if calculable else 0) + (10 if scenario_done else 0))
    score = max(0, min(100, score))
    findings: list[str] = []
    if completeness < 1:
        findings.append(f"{len(input_refs) - completed} cellule(s) de saisie restent à compléter.")
    if formula_ratio < 1:
        findings.append(f"{len(expected) - formulas_ok} formule(s) structurante(s) ont été supprimées ou modifiées.")
    if negatives:
        findings.append("Les décaissements doivent être saisis en valeurs positives dans ce modèle.")
    if not scenario_done:
        findings.append("Le scénario et la décision associée ne sont pas encore suffisamment explicités.")
    if calculable and balances:
        minimum = min(balances)
        minimum_week = balances.index(minimum) + 1
        first_alert = next((index + 1 for index, (balance, threshold) in enumerate(zip(balances, thresholds)) if threshold is not None and balance < threshold), None)
        if first_alert:
            findings.append(f"Le seuil de sécurité est franchi pour la première fois en semaine {first_alert}.")
        else:
            findings.append("Le solde calculé reste au-dessus du seuil de sécurité sur les 13 semaines.")
    else:
        minimum = None
        minimum_week = None
        first_alert = None

    checks = [
        {"id": "structure", "label": "Structure Qalem reconnue", "passed": True, "weight": 20},
        {"id": "completeness", "label": "Données complètes", "passed": completeness == 1, "ratio": round(completeness, 3), "weight": 20},
        {"id": "formulas", "label": "Formules intactes", "passed": formula_ratio == 1, "ratio": round(formula_ratio, 3), "weight": 25},
        {"id": "signs", "label": "Convention de signe respectée", "passed": not negatives, "weight": 10},
        {"id": "calculation", "label": "Prévision calculable", "passed": calculable, "weight": 15},
        {"id": "scenario", "label": "Scénario et décision explicités", "passed": scenario_done, "weight": 10},
    ]
    verdict = "Maîtrise démontrée" if score >= 85 else "Base solide à améliorer" if score >= 65 else "Révision nécessaire"
    return {
        "profile": PROFILE,
        "score": score,
        "verdict": verdict,
        "checks": checks,
        "metrics": {"currency": "MAD", "minimumCash": minimum, "minimumCashWeek": minimum_week, "endingCash": balances[-1] if calculable and balances else None, "firstSafetyAlertWeek": first_alert},
        "findings": findings,
        "authority": "python-deterministic",
    }


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit("usage: qalem_workbook.py generate|evaluate [file]")
    if sys.argv[1] == "generate":
        payload = json.load(sys.stdin)
        sys.stdout.buffer.write(build_workbook(payload.get("spec") or {}, payload.get("profile")))
        return 0
    if sys.argv[1] == "evaluate" and len(sys.argv) == 3:
        print(json.dumps(assess(Path(sys.argv[2])), ensure_ascii=False, separators=(",", ":")))
        return 0
    raise SystemExit("invalid command")


if __name__ == "__main__":
    raise SystemExit(main())
