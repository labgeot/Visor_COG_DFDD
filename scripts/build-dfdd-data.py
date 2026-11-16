#!/usr/bin/env python3
"""
Convierte el libro Excel `04a_DFDD BL 2013-1.00.xlsx` (DGIWG Feature Data Dictionary,
Baseline 2013-1.00) en los archivos JSON consumidos por el visualizador Next.js:
  - data/dfdd-catalogo.json  (Grupos -> Subgrupos -> FeatureConcepts y códigos de atributos por subgrupo)
  - public/dfdd-atributos.json (AttributeConcepts enriquecidos con Datatypes, Dominios, PhysicalQuantities y UnitsOfMeasure)
"""

import json
from pathlib import Path
import openpyxl


ROOT = Path(__file__).resolve().parent.parent
EXCEL_PATH = ROOT / "04a_DFDD BL 2013-1.00.xlsx"
CATALOG_OUT = ROOT / "data" / "dfdd-catalogo.json"
ATTRS_OUT = ROOT / "public" / "dfdd-atributos.json"


def clean_str(val) -> str:
    if val is None:
        return ""
    return str(val).strip()


def clean_int(val):
    if val is None or str(val).strip() == "":
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return int(val) if float(val).is_integer() else val
    s = str(val).strip()
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return s


def clean_bool(val):
    if isinstance(val, bool):
        return val
    if val is None:
        return None
    s = str(val).strip().lower()
    if s == "true":
        return True
    if s == "false":
        return False
    return None


def main():
    if not EXCEL_PATH.exists():
        raise FileNotFoundError(f"No se encontró el archivo Excel: {EXCEL_PATH}")

    print(f"Leyendo {EXCEL_PATH.name}...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

    # 1. Groups
    groups = []
    group_map = {}
    for row in list(wb["Groups"].iter_rows(values_only=True))[1:]:
        codigo = clean_str(row[0])
        if not codigo:
            continue
        group_obj = {
            "codigo": codigo,
            "alphaCode": clean_str(row[1]),
            "nombre": clean_str(row[2]),
            "contenido": clean_str(row[3]),
            "descripcion": clean_str(row[4]),
            "subcategorias": [],
        }
        groups.append(group_obj)
        group_map[codigo] = group_obj

    # 2. Subgroups (82 en orden exacto correspondiente a columnas 26..107)
    subgroups = []
    subgroup_map = {}
    cur_group = ""
    for row in list(wb["Subgroups"].iter_rows(values_only=True))[1:]:
        if row[0] is not None and clean_str(row[0]):
            cur_group = clean_str(row[0])
        codigo = clean_str(row[1])
        if not codigo:
            continue
        sub_obj = {
            "codigo": codigo,
            "groupCodigo": cur_group,
            "alphaCode": clean_str(row[2]),
            "nombre": clean_str(row[3]),
            "contenido": clean_str(row[4]),
            "descripcion": clean_str(row[5]),
            "objetos": [],
            "atributosCodigos": [],
        }
        subgroups.append(sub_obj)
        subgroup_map[codigo] = sub_obj
        if cur_group in group_map:
            group_map[cur_group]["subcategorias"].append(sub_obj)

    if len(subgroups) != 82:
        raise RuntimeError(f"Se esperaban 82 subgrupos, se encontraron {len(subgroups)}")

    # 3. PhysicalQuantities
    pq_by_name = {}
    for row in list(wb["PhysicalQuantities"].iter_rows(values_only=True))[1:]:
        name = clean_str(row[3])
        if not name:
            continue
        pq_by_name[name] = {
            "shortName": clean_str(row[1]),
            "nombre": name,
            "definicion": clean_str(row[4]),
            "descripcion": clean_str(row[5]),
            "aliases": clean_str(row[6]),
            "itemIdentifier": clean_int(row[8]),
            "url": clean_str(row[9]),
        }

    # 4. UnitsOfMeasure
    uom_by_name = {}
    cur_pq_short = ""
    cur_pq_name = ""
    for row in list(wb["UnitsOfMeasure"].iter_rows(values_only=True))[1:]:
        if row[1] is not None and clean_str(row[1]):
            cur_pq_short = clean_str(row[1])
        if row[2] is not None and clean_str(row[2]):
            cur_pq_name = clean_str(row[2])
        name = clean_str(row[5])
        if not name:
            continue
        uom_by_name[name] = {
            "shortName": clean_str(row[3]),
            "codigo": clean_int(row[4]),
            "nombre": name,
            "definicion": clean_str(row[6]),
            "descripcion": clean_str(row[7]),
            "aliases": clean_str(row[8]),
            "physicalQuantity": cur_pq_name,
            "physicalQuantityShort": cur_pq_short,
            "itemIdentifier": clean_int(row[9]),
            "url": clean_str(row[10]),
            "additionalCodes": clean_str(row[14]),
        }

    # 5. Datatypes(Tcaract del OG)
    datatypes = {}
    cur_dt = None
    for row in list(wb["Datatypes(Tcaract del OG)"].iter_rows(values_only=True))[1:]:
        dt_short = clean_str(row[1])
        if dt_short:
            cur_dt = {
                "shortName": dt_short,
                "nombre": clean_str(row[2]),
                "definicion": clean_str(row[5]),
                "descripcion": clean_str(row[6]),
                "nota": clean_str(row[7]),
                "especificacion": clean_str(row[11]),
                "completa": clean_bool(row[13]),
                "longitud": clean_int(row[14]),
                "lexical": clean_bool(row[15]),
                "estructura": clean_str(row[16]),
                "resourceUri": clean_str(row[17]),
                "rangoMin": clean_str(row[18]),
                "rangoMax": clean_str(row[19]),
                "itemIdentifier": clean_int(row[20]),
                "url": clean_str(row[21]),
                "campos": [],
            }
            datatypes[dt_short] = cur_dt
        elif cur_dt is not None and clean_str(row[3]):
            # Sub-campo de un tipo de dato complejo
            cur_dt["campos"].append({
                "shortName": clean_str(row[3]),
                "nombre": clean_str(row[4]),
                "definicion": clean_str(row[5]),
                "multiplicidad": clean_str(row[8]),
                "coleccion": clean_str(row[9]),
                "codigo": clean_str(row[10]),
                "especificacion": clean_str(row[11]),
            })

    # 6. DatatypeListedValues(DOMINIOS)
    listed_values_by_dt = {}
    cur_dlv_dt = ""
    for row in list(wb["DatatypeListedValues(DOMINIOS)"].iter_rows(values_only=True))[1:]:
        if row[1] is not None and clean_str(row[1]):
            cur_dlv_dt = clean_str(row[1])
        name = clean_str(row[5])
        if not cur_dlv_dt or not name:
            continue
        code_val = clean_int(row[4])
        listed_values_by_dt.setdefault(cur_dlv_dt, []).append({
            "codigo": str(code_val) if code_val is not None else "",
            "shortName": clean_str(row[3]),
            "etiqueta": name,
            "definicion": clean_str(row[6]),
            "observaciones": clean_str(row[7]),
            "aliases": clean_str(row[8]),
            "itemIdentifier": clean_int(row[9]),
            "url": clean_str(row[10]),
        })

    for dt_key, vals in listed_values_by_dt.items():
        vals.sort(key=lambda v: (int(v["codigo"]) if v["codigo"].lstrip("-").isdigit() else 999999, v["etiqueta"]))

    # 7. FeatureConcepts (OG)
    fc_count = 0
    for row in list(wb["FeatureConcepts (OG)"].iter_rows(values_only=True))[2:]:
        short_name = clean_str(row[0])
        codigo = clean_str(row[1])
        if not short_name and not codigo:
            continue
        fc_count += 1
        member_subgroups = []
        for idx, sub in enumerate(subgroups):
            col_idx = 26 + idx
            if len(row) > col_idx and clean_str(row[col_idx]).upper() == "X":
                member_subgroups.append(sub["codigo"])

        fc_base = {
            "codigo": codigo,
            "shortName": short_name,
            "nombre": clean_str(row[3]),
            "definicion": clean_str(row[4]),
            "descripcion": clean_str(row[5]),
            "aliases": clean_str(row[6]),
            "itemIdentifier": clean_int(row[7]),
            "url": clean_str(row[8]),
            "subgrupos": member_subgroups,
        }

        for sub_code in member_subgroups:
            subgroup_map[sub_code]["objetos"].append(fc_base)

    # Ordenar objetos alfabéticamente por nombre dentro de cada subgrupo
    for sub in subgroups:
        sub["objetos"].sort(key=lambda o: (o["nombre"].lower(), o["codigo"]))

    # 8. AttributeConcepts
    atributos_list = []
    for row in list(wb["AttributeConcepts"].iter_rows(values_only=True))[2:]:
        short_name = clean_str(row[0])
        codigo = clean_str(row[1])
        if not short_name and not codigo:
            continue

        member_subgroups = []
        for idx, sub in enumerate(subgroups):
            col_idx = 26 + idx
            if len(row) > col_idx and clean_str(row[col_idx]).upper() == "X":
                member_subgroups.append(sub["codigo"])
                sub["atributosCodigos"].append(codigo)

        dt_key = clean_str(row[9])
        dt_info = datatypes.get(dt_key)
        pq_name = clean_str(row[10])
        uom_name = clean_str(row[11])
        nc_uom_name = clean_str(row[12])
        dominio = listed_values_by_dt.get(dt_key)

        attr_obj = {
            "codigo": codigo,
            "shortName": short_name,
            "nombre": clean_str(row[3]),
            "definicion": clean_str(row[4]),
            "descripcion": clean_str(row[5]),
            "aliases": clean_str(row[6]),
            "multiplicidad": clean_str(row[7]),
            "coleccion": clean_str(row[8]),
            "tipo": dt_key,
            "tipoEspecificacion": dt_info["especificacion"] if dt_info else "",
            "datatype": dt_info,
            "cantidadFisica": pq_by_name.get(pq_name),
            "unidadRecomendada": uom_by_name.get(uom_name),
            "unidadNoComparable": nc_uom_name,
            "completa": clean_bool(row[14]),
            "itemIdentifier": clean_int(row[15]),
            "url": clean_str(row[16]),
            "additionalCodes": clean_str(row[19]),
            "subgrupos": member_subgroups,
            "dominio": dominio if dominio else None,
        }
        atributos_list.append(attr_obj)

    atributos_list.sort(key=lambda a: (a["nombre"].lower(), a["codigo"]))

    # Guardar archivos JSON (compacto en public/ para optimizar descarga en navegador)
    CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)
    ATTRS_OUT.parent.mkdir(parents=True, exist_ok=True)

    with open(CATALOG_OUT, "w", encoding="utf-8") as f:
        json.dump(groups, f, ensure_ascii=False, separators=(",", ":"))

    with open(ATTRS_OUT, "w", encoding="utf-8") as f:
        json.dump(atributos_list, f, ensure_ascii=False, separators=(",", ":"))

    print(
        f"Listo!\n"
        f"  - Grupos: {len(groups)}\n"
        f"  - Subgrupos: {len(subgroups)}\n"
        f"  - FeatureConcepts únicos: {fc_count}\n"
        f"  - AttributeConcepts: {len(atributos_list)}\n"
        f"  - {CATALOG_OUT.relative_to(ROOT)} ({CATALOG_OUT.stat().st_size / 1024:.1f} KB)\n"
        f"  - {ATTRS_OUT.relative_to(ROOT)} ({ATTRS_OUT.stat().st_size / 1024:.1f} KB)"
    )


if __name__ == "__main__":
    main()
