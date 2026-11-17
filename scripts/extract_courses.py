"""Читает из учебного плана страницы «КУРС 1–4» (по семестрам) и «СВОДНЫЕ ДАННЫЕ».

    python3 -E scripts/extract_courses.py source/pdf/isit_09.03.02.pdf source/courses_isit.json

На этих страницах названия дисциплин записаны целиком, а по каждому семестру есть
часы (всего, контактная работа, лекции, лабораторные, практические, ИЗ, КРП, СР, контроль),
з.е., формы контроля, недели теоретического обучения/сессии, каникулы и код кафедры.
"""
import json
import re
import sys

import fitz

COLS = ["control", "total", "contact", "lec", "lab", "pr", "iz", "krp", "self", "exam", "ze", "weeks"]


def num(s):
    s = (s or "").strip().replace(",", ".")
    if not s:
        return None
    try:
        v = float(s)
        return int(v) if v.is_integer() else v
    except ValueError:
        return s


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("-\n", "-").replace("\n", " ")).strip()


def course_page(page):
    rows = page.find_tables().tables[0].extract()
    head = rows[0]
    sem_cols = {}
    for i, h in enumerate(head):
        m = re.match(r"Семестр (\d+)", h or "")
        if m:
            sem_cols[int(m.group(1))] = i
    out, weeks, holidays = [], {}, {}
    for r in rows[3:]:
        first = clean(r[0])
        if first.startswith("ДИСЦИПЛИНЫ"):
            for s, c in sem_cols.items():
                weeks[s] = clean(r[c + 11])
            continue
        if first.startswith("КАНИКУЛЫ"):
            vals = [clean(x) for x in r if clean(x)]
            for s, v in zip(sorted(sem_cols), vals[1:]):
                holidays[s] = v
            continue
        code = clean(r[1])
        if not code or not re.match(r"^(Б[123]|К\.М|ФТД)", code):
            continue
        rec = {"code": code, "name": clean(r[2]) or clean(r[3]), "part": clean(r[4]), "sems": {}}
        for s, c in sem_cols.items():
            vals = {k: num(r[c + j]) for j, k in enumerate(COLS)}
            vals["control"] = clean(r[c])
            if any(v not in (None, "") for k, v in vals.items() if k != "weeks"):
                rec["sems"][s] = {k: v for k, v in vals.items() if v not in (None, "")}
        rec["dept"] = clean(r[-2])
        rec["semList"] = clean(r[-1])
        out.append(rec)
    return out, weeks, holidays


def summary_page(page):
    """«Сводные данные»: з.е. по блокам плана, всего и по семестрам."""
    rows = page.find_tables().tables[0].extract()
    sems = {}
    for i, h in enumerate(rows[1]):
        m = re.match(r"Сем\. (\d+)", h or "")
        if m:
            sems[int(m.group(1))] = i
    out = []
    for r in rows[3:]:
        name = clean(r[1])
        if not name or not (clean(r[0]) or name.startswith("Итого")):
            continue
        out.append({"code": clean(r[0]), "name": name, "ze": num(r[6]),
                    "perSem": {s: num(r[c]) for s, c in sems.items() if num(r[c]) is not None}})
        if clean(r[0]) == "ФТД.В":
            break
    return out


def main(pdf, dst):
    d = fitz.open(pdf)
    rows, weeks, holidays, summary = {}, {}, {}, []
    for page in d:
        text = page.get_text()
        if re.match(r"\s*СВОДНЫЕ ДАННЫЕ", text):
            summary = summary_page(page)
            continue
        if not re.match(r"\s*КУРС \d", text):
            continue
        recs, w, h = course_page(page)
        weeks.update(w)
        holidays.update(h)
        for rec in recs:
            if rec["code"] in rows:
                rows[rec["code"]]["sems"].update(rec["sems"])
                for k in ("name", "dept", "semList"):
                    rows[rec["code"]][k] = rows[rec["code"]][k] or rec[k]
            else:
                rows[rec["code"]] = rec
    json.dump({"rows": list(rows.values()), "weeks": weeks, "holidays": holidays, "summary": summary},
              open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"дисциплин и модулей: {len(rows)}; строк сводных данных: {len(summary)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
