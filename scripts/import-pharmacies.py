#!/usr/bin/env python3
"""
Import pharmacies from Excel (CNAE x CNPJ sheet) into PharmaMSA.
Also detects pharmacy chains from razão social patterns.

Usage:
  python3 scripts/import-pharmacies.py <excel_path> [--api-url URL] [--batch-size N] [--state UF]
"""

import sys
import json
import urllib.request
import openpyxl
from pathlib import Path

API_URL = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2].startswith("http") else "http://iherfq1tsfneqh0we5iypci1.157.180.67.154.sslip.io"
BATCH_SIZE = 200

# Known pharmacy chains (razão social patterns → chain name)
CHAINS = {
    "RAIA DROGASIL": "Raia Drogasil",
    "DROGASIL": "Raia Drogasil",
    "DROGA RAIA": "Raia Drogasil",
    "DROGARIA ARAUJO": "Drogaria Araújo",
    "PAGUE MENOS": "Pague Menos",
    "EMPREENDIMENTOS PAGUE MENOS": "Pague Menos",
    "DROGARIAS PACHECO": "DPSP (Pacheco/São Paulo)",
    "DROGARIA SAO PAULO": "DPSP (Pacheco/São Paulo)",
    "PANVEL": "Panvel",
    "DIMED S": "Panvel",
    "EXTRAFARMA": "Extrafarma",
    "NISSEI": "Nissei",
    "DROGARIA VENANCIO": "Venâncio",
    "FARMACIA INDIANA": "Indiana",
    "FARMACIAS GLOBO": "Globo",
    "DROGARIAS GLOBO": "Globo",
    "GRUPO DPSP": "DPSP (Pacheco/São Paulo)",
    "ULTRAFARMA": "Ultrafarma",
    "FARMACIAS ASSOCIADAS": "Farmacias Associadas",
    "DROGA CLARA": "Droga Clara",
    "FARMACIA PREÇO POPULAR": "Preço Popular",
    "FARMACIA POPULAR": None,  # government program, not a chain
    "DROGAL": "Drogal",
    "FARMACIA BIFARMA": "BiFarma",
    "DROGARIA CATARINENSE": "Catarinense",
    "DROGARIA SANTA MARTA": "Santa Marta",
    "AGAFARMA": "Agafarma",
    "FARMACIA SAO JOAO": "São João",
    "DROGARIA SAO BENTO": "São Bento",
    "FARMACIA PERMANENTE": "Permanente",
    "BIG BEN": "Big Ben",
    "FARMA PONTE": "FarmaPonte",
    "ONOFRE": "Onofre",
    "FARMACIA MINAS BRASIL": "Minas Brasil",
    "MULTIFARMA": "Multifarma",
    "DROGARIA ROSARIO": "Rosário",
    "DROGARIA MODERNA": "Moderna",
    "REDE DROGASMIL": "Drogasmil",
}

# Known associations
ASSOCIATIONS = {
    # Abrafarma members (large chains)
    "Raia Drogasil": "Abrafarma",
    "Pague Menos": "Abrafarma",
    "DPSP (Pacheco/São Paulo)": "Abrafarma",
    "Panvel": "Abrafarma",
    "Extrafarma": "Abrafarma",
    "Nissei": "Abrafarma",
    "Venâncio": "Abrafarma",
    "Drogaria Araújo": "Abrafarma",
    "Onofre": "Abrafarma",
    # Febrafar / Farmarcas cooperatives
    "Agafarma": "Febrafar",
    "Farmacias Associadas": "Febrafar",
    "FarmaPonte": "Febrafar",
}


def detect_chain(razao_social: str) -> str | None:
    upper = razao_social.upper()
    for pattern, chain in CHAINS.items():
        if pattern in upper:
            return chain
    return None


def clean(val):
    if val is None:
        return None
    s = str(val).strip()
    return None if s in ("-", "", "None") else s


def format_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = "".join(c for c in raw if c.isdigit())
    if len(digits) < 10:
        return None
    if not digits.startswith("55"):
        digits = "55" + digits
    return digits


def row_to_record(row):
    (cnpj, matriz, razao, fantasia, tel1, _rel1, tel2, email, _rel_email,
     data_sit, data_ativ, cnae_cod, cnae_desc, tipo_log, logradouro,
     numero, complemento, bairro, cep, uf, _estado_ext, cod_mun,
     municipio, porte, _cod_nat, desc_nat) = row

    razao_str = clean(razao) or ""
    fantasia_str = clean(fantasia)
    name = fantasia_str or razao_str
    phone = format_phone(clean(tel1))

    if not name or not phone:
        return None

    chain = detect_chain(razao_str)
    association = ASSOCIATIONS.get(chain) if chain else None

    return {
        "name": name,
        "phoneNumber": phone,
        "cnpj": clean(cnpj),
        "matrizFilial": clean(matriz),
        "razaoSocial": clean(razao),
        "nomeFantasia": fantasia_str,
        "phone2": format_phone(clean(tel2)),
        "email": clean(email),
        "cnaePrimario": clean(cnae_cod),
        "cnaeDescricao": clean(cnae_desc),
        "tipoLogradouro": clean(tipo_log),
        "logradouro": clean(logradouro),
        "numero": clean(numero),
        "complemento": clean(complemento),
        "bairro": clean(bairro),
        "cep": clean(cep),
        "state": clean(uf),
        "codigoMunicipio": int(cod_mun) if cod_mun else None,
        "city": clean(municipio),
        "porte": clean(porte),
        "naturezaJuridica": clean(desc_nat),
        "dataAtividade": clean(data_ativ),
        "dataSituacao": clean(data_sit),
        "chainName": chain,
        "associationName": association,
    }


def send_batch(records, batch_num, total_batches):
    data = json.dumps({"records": records}).encode()
    req = urllib.request.Request(
        f"{API_URL}/pharmacies/import",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            print(f"  Batch {batch_num}/{total_batches}: +{result.get('inserted',0)} inserted, "
                  f"~{result.get('updated',0)} updated, !{result.get('errors',0)} errors")
            return result
    except Exception as e:
        print(f"  Batch {batch_num}/{total_batches}: ERROR - {e}")
        return {"inserted": 0, "updated": 0, "errors": len(records)}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    excel_path = sys.argv[1]
    state_filter = None
    for i, arg in enumerate(sys.argv):
        if arg == "--state" and i + 1 < len(sys.argv):
            state_filter = sys.argv[i + 1].upper()
        if arg == "--batch-size" and i + 1 < len(sys.argv):
            global BATCH_SIZE
            BATCH_SIZE = int(sys.argv[i + 1])
        if arg == "--api-url" and i + 1 < len(sys.argv):
            global API_URL
            API_URL = sys.argv[i + 1]

    print(f"Reading {excel_path}...")
    wb = openpyxl.load_workbook(excel_path, read_only=True)
    ws = wb["CNAE x CNPJ"]

    records = []
    skipped = 0
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        if state_filter and clean(row[19]) != state_filter:
            continue
        rec = row_to_record(row)
        if rec:
            records.append(rec)
        else:
            skipped += 1
        if (i + 1) % 10000 == 0:
            print(f"  Read {i + 1} rows...")

    wb.close()
    print(f"Parsed {len(records)} pharmacies ({skipped} skipped, no name/phone)")
    if state_filter:
        print(f"  Filtered to state: {state_filter}")

    total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE
    totals = {"inserted": 0, "updated": 0, "errors": 0}

    print(f"Importing in {total_batches} batches of {BATCH_SIZE}...")
    for batch_num in range(total_batches):
        chunk = records[batch_num * BATCH_SIZE : (batch_num + 1) * BATCH_SIZE]
        result = send_batch(chunk, batch_num + 1, total_batches)
        for k in totals:
            totals[k] += result.get(k, 0)

    print(f"\nDone! {totals['inserted']} inserted, {totals['updated']} updated, {totals['errors']} errors")


if __name__ == "__main__":
    main()
