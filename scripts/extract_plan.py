"""Извлекает дисциплины из PDF учебного плана ДГУ (страницы «План», стр. 4–5).

Запуск:  python3 -E scripts/extract_plan.py source/pdf/<plan>.pdf source/<out>.json

Таблица в PDF текстовая, поэтому колонки определяются по x-координатам слов.
Сетка одинакова для планов ФИиИТ, выгруженных из «Планы» (plx) в 2026 г.
"""
import json
import re
import sys

import fitz  # PyMuPDF

CODE_RE = re.compile(r"^(Б[123]|К\.М|ФТД)\.[\wА-Яа-я.()]+$")

# Колонки «Формы пром. атт.» и итоговые часы (x-диапазоны в pt)
FORM_COLS = [("exam", 143, 156), ("credit", 156, 168), ("gradedCredit", 168, 180),
             ("courseProject", 180, 190), ("courseWork", 190, 200)]
TOTAL_COLS = [("ze", 200, 212), ("hours", 212, 225), ("contact", 225, 238),
              ("self", 238, 250), ("control", 250, 262), ("practical", 262, 275)]
SEM_BASE, SEM_W = 275.0, 66.62
SEM_SUB = [("ze", 0, 11), ("lec", 11, 22), ("lab", 22, 33), ("pr", 33, 44.5),
           ("self", 44.5, 55.5), ("control", 55.5, 66.62)]


def num(s):
    s = s.replace(",", ".")
    try:
        return float(s) if "." in s else int(s)
    except ValueError:
        return None


def parse_page(page):
    words = page.get_text("words")
    codes = sorted([w for w in words if w[0] < 60 and CODE_RE.match(w[4])], key=lambda w: w[1])
    rows = []
    for i, c in enumerate(codes):
        cy = (c[1] + c[3]) / 2
        next_y = codes[i + 1][1] if i + 1 < len(codes) else c[1] + 14
        line = sorted([w for w in words if abs((w[1] + w[3]) / 2 - cy) < 2.6], key=lambda w: w[0])
        name_words = sorted([w for w in words if 60 <= w[0] < 134 and c[1] - 1.5 <= w[1] < next_y - 1.5],
                            key=lambda w: (round(w[1]), w[0]))
        flag = next((w[4] for w in line if w[0] < 38 and w[4] in "+-"), None)
        part = next((w[4] for w in line if 133 <= w[0] < 143), None)
        row = {"code": c[4], "counted": flag != "-", "part": part,
               "planName": " ".join(w[4] for w in name_words),
               "lineName": " ".join(w[4] for w in line if 60 <= w[0] < 134),
               "forms": {}, "totals": {}, "semesters": {}, "dept": None}
        for w in line:
            x, t = w[0], w[4]
            for key, a, b in FORM_COLS:
                if a <= x < b:
                    row["forms"][key] = sorted({int(ch) for ch in t if ch.isdigit() and ch != "0"})
            for key, a, b in TOTAL_COLS:
                if a <= x < b:
                    row["totals"][key] = num(t)
            if SEM_BASE <= x < SEM_BASE + 8 * SEM_W:
                k = int((x - SEM_BASE) // SEM_W) + 1
                off = x - SEM_BASE - (k - 1) * SEM_W
                for key, a, b in SEM_SUB:
                    if a <= off < b:
                        row["semesters"].setdefault(str(k), {})[key] = num(t)
            if x >= 805:
                row["dept"] = t
        rows.append(row)
    return rows


def main(pdf_path, out_path):
    doc = fitz.open(pdf_path)
    rows = parse_page(doc[3]) + parse_page(doc[4])
    codes = [r["code"] for r in rows]
    # Лист — строка, у которой нет дочерних строк
    for r in rows:
        r["isGroup"] = any(o != r["code"] and o.startswith(r["code"] + ".") for o in codes)
    json.dump(rows, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{pdf_path}: {len(rows)} строк, листьев {sum(not r['isGroup'] for r in rows)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
