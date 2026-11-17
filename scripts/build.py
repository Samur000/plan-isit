"""Собирает дорожную карту только по учебному плану -> docs/.

Запуск (из корня проекта):
    python3 -E scripts/extract_plan.py source/pdf/isit_09.03.02.pdf source/plan_isit.json
    python3 -E scripts/extract_courses.py source/pdf/isit_09.03.02.pdf source/courses_isit.json
    python3 -E scripts/build.py

Источник — PDF учебного плана:
    стр. 4–5   план (структура, группы по выбору)      -> source/plan_isit.json
    стр. 6–9   «КУРС 1–4»: полные названия, часы и формы контроля по семестрам,
    стр. 10    «Сводные данные»: з.е. по блокам плана   -> source/courses_isit.json

Результат (папка docs/ публикуется через GitHub Pages):
    docs/index.html         — самостоятельная страница
    docs/embed.html         — фрагмент для вставки в страницу сайта dgu.ru (Bitrix, режим HTML)
    docs/roadmap-data.json  — собранные данные (для проверки)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEAF = re.compile(r"^(Б[123]|К\.М|ФТД)(\.[А-ЯA-Z]{1,2})*(\.\d{2})+(\([А-Я]\))?$")
FORM_LABEL = {"exam": "Экзамен", "credit": "Зачёт", "gradedCredit": "Зачёт с оценкой",
              "courseWork": "Курсовая работа", "courseProject": "Курсовой проект"}
FORM_SHORT = {"Эк": "Экзамен", "За": "Зачёт", "ЗаО": "Зачёт с оценкой", "КР": "Курсовая работа", "КП": "Курсовой проект"}
HOURS = ["lec", "lab", "pr", "iz", "krp", "self", "exam"]
PROGRAMS = ["source/curation_isit.json"]
warnings = []


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def part_of(code):
    if code.startswith("Б1.В.ДВ"):
        return "choice", "Часть, формируемая участниками образовательных отношений"
    if code.startswith("Б1.О"):
        return "core", "Обязательная часть"
    if code.startswith("Б1.В"):
        return "variable", "Часть, формируемая участниками образовательных отношений"
    if code.startswith("Б2"):
        return "practice", "Блок 2. Практика"
    if code.startswith("Б3"):
        return "gia", "Блок 3. Государственная итоговая аттестация"
    if code.startswith("ФТД"):
        return "optional", "Факультативы"
    if code.startswith("К.М"):
        return "sport", "Комплексный модуль"
    return "other", ""


def discipline(row, course):
    """row — строка плана (стр. 4–5), course — та же дисциплина со страниц «КУРС» (стр. 6–9)."""
    code = row["code"]
    kind, part_label = part_of(code)
    per_sem, totals = [], {k: 0 for k in HOURS}
    if course and course["sems"]:
        for s in sorted(course["sems"], key=int):
            d = course["sems"][s]
            forms = [FORM_SHORT[t] for t in d.get("control", "").split() if t in FORM_SHORT]
            item = {"sem": int(s), "ze": d.get("ze"), "total": d.get("total"), "contact": d.get("contact"),
                    "weeks": d.get("weeks"), "forms": forms, **{k: d.get(k) for k in HOURS}}
            per_sem.append(item)
            for k in HOURS:
                totals[k] += d.get(k) or 0
    else:  # практики и ГИА: на страницах «КУРС» часов по видам нет — берём из плана
        for s in sorted(int(k) for k in row["semesters"]):
            d = row["semesters"][str(s)]
            forms = [FORM_LABEL[k] for k, v in row["forms"].items() if s in v]
            per_sem.append({"sem": s, "ze": d.get("ze"), "forms": forms})
    name = clean(course["name"]) if course and course.get("name") else clean(row.get("lineName") or row["planName"])
    return {
        "code": code, "name": name, "kind": kind, "part": part_label, "counted": row["counted"],
        "sems": [p["sem"] for p in per_sem], "ze": row["totals"].get("ze"), "hours": row["totals"].get("hours"),
        "contact": row["totals"].get("contact"), "hoursBy": totals, "perSem": per_sem,
        "forms": sorted({f for p in per_sem for f in p["forms"]}, key=list(FORM_LABEL.values()).index),
    }


def build_program(cur_path):
    cur = json.load(open(ROOT / cur_path, encoding="utf-8"))
    plan = json.load(open(ROOT / cur["plan"], encoding="utf-8"))
    courses = json.load(open(ROOT / cur["courses"], encoding="utf-8"))
    crow = {r["code"]: r for r in courses["rows"]}
    rows = {r["code"]: r for r in plan if LEAF.match(r["code"])}
    modules = {c: clean(r["name"]) for c, r in crow.items() if any(o.startswith(c + ".") for o in crow)}

    def track_of(code):
        for t in cur["tracks"]:
            if any(code.startswith(p) for p in t["prefixes"]):
                return t["id"]
        warnings.append(f"{code}: не попал ни в одну колонку")
        return None

    nodes = []
    for code, r in rows.items():
        if r["isGroup"] and not code.startswith("Б1.В.ДВ"):
            continue
        parent = re.sub(r"\.\d{2}(\([А-Я]\))?$", "", code)
        if not r["isGroup"] and parent in rows and rows[parent]["isGroup"] and parent.startswith("Б1.В.ДВ"):
            continue  # вариант выбора — войдёт в карточку группы
        if r["isGroup"]:  # группа «по выбору»
            opts = [discipline(rows[c], crow.get(c)) for c in rows if c.startswith(code + ".") and not rows[c]["isGroup"]]
            for o in opts:
                if not crow.get(o["code"]):
                    warnings.append(f"{o['code']}: нет на страницах «КУРС»")
            base = discipline(r, None)
            title = clean(r.get("lineName") or r["planName"])
            node = {**base, "name": title, "kind": "choice", "options": opts, "module": title,
                    "mobility": "мобильност" in title.lower()}
        else:
            if not crow.get(code):
                warnings.append(f"{code}: нет на страницах «КУРС»")
            node = discipline(r, crow.get(code))
            mod = next((modules[m] for m in sorted(modules, key=len, reverse=True) if code.startswith(m + ".")), None)
            node["module"] = mod
            if node["kind"] == "gia":
                node["forms"] = ["Защита ВКР"]
        node["track"] = track_of(code)
        node["start"] = 9 if node["kind"] == "gia" else (node["sems"][0] if node["sems"] else 1)
        nodes.append(node)

    # связи между дисциплинами (стрелки): в плане их нет, заданы вручную в curation (edges)
    ids = {n["code"]: n for n in nodes}
    edges = []
    for a, b in cur.get("edges", []):
        if a not in ids or b not in ids:
            warnings.append(f"{cur['id']}: связь {a} -> {b}: нет такого блока")
            continue
        if ids[a]["start"] >= ids[b]["start"]:
            warnings.append(f"{cur['id']}: связь {a} -> {b} не идёт вперёд по семестрам")
        edges.append([a, b])

    outcomes = cur.get("outcomes")
    if outcomes:
        all_codes = set(ids) | {o["code"] for n in nodes for o in n.get("options", [])}
        for sk in outcomes.get("skills", []):
            for c in sk.get("codes", []):
                if c not in all_codes:
                    warnings.append(f"{cur['id']}: в блоке «После выпуска» указан несуществующий код {c}")

    # сверка с «Сводными данными» (стр. 10): з.е. по семестрам
    summary = courses.get("summary", [])
    total_row = next((x for x in summary if x["name"].startswith("Итого по ОП")), None)
    if total_row:
        for s, ze in total_row["perSem"].items():
            got = sum((p.get("ze") or 0) for n in nodes if n["kind"] != "optional"
                      for p in n["perSem"] if str(p["sem"]) == str(s))
            if got != ze:
                warnings.append(f"{cur['id']}: семестр {s}: на странице {got} з.е., в сводных данных {ze}")
    return {"id": cur["id"], "meta": cur["meta"], "tracks": cur["tracks"], "nodes": nodes, "edges": edges,
            "outcomes": outcomes, "summary": summary, "weeks": courses.get("weeks"), "holidays": courses.get("holidays")}


FONT_LOADER = """<script>
/* Geometria подключаем только на домене dgu.ru: шрифт отдаётся без CORS, на других сайтах — системный шрифт */
if (/(^|\\.)dgu\\.ru$/.test(location.hostname)) {
  var b = '/bitrix/templates/dgu/fonts/Geometria/Geometria-', f = function (n, w) {
    return "@font-face{font-family:'Geometria';src:url(" + b + n + ".woff2) format('woff2');font-weight:" + w + ";font-display:swap}";
  };
  document.write('<style>' + f('Regular', '300') + f('Medium', '400 500') + f('Bold', '600 700') + '</style>');
}
</script>
"""


def main():
    data = {"programs": [build_program(p) for p in PROGRAMS]}
    out = ROOT / "docs"
    out.mkdir(exist_ok=True)
    json.dump(data, open(out / "roadmap-data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    (out / ".nojekyll").write_text("", encoding="utf-8")

    css = (ROOT / "src/roadmap.css").read_text(encoding="utf-8")
    js = (ROOT / "src/roadmap.js").read_text(encoding="utf-8")
    body = (ROOT / "src/roadmap.html").read_text(encoding="utf-8")
    data_js = "window.DGU_ROADMAP_DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"
    fragment = (f"<style>\n{css}\n</style>\n{body}\n"
                f"<script>\n{data_js}\n</script>\n<script>\n{js}\n</script>\n")
    (out / "embed.html").write_text(fragment, encoding="utf-8")
    meta = data["programs"][0]["meta"]
    title = f"Дорожная карта: {meta['code']} {meta['title']} — ДГУ"
    desc = f"Интерактивная дорожная карта обучения: {meta['code']} {meta['title']}, профиль «{meta['profile']}»."
    page = ("<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            f"<title>{title}</title>\n<meta name=\"description\" content=\"{desc}\">\n"
            f"{FONT_LOADER}<style>html,body{{margin:0;background:#F5F8FD}}</style>\n</head>\n<body>\n"
            f"{fragment}</body>\n</html>\n")
    (out / "index.html").write_text(page, encoding="utf-8")

    for p in data["programs"]:
        print(f"{p['meta']['code']} {p['meta']['short']}: блоков {len(p['nodes'])}, связей {len(p['edges'])}")
    if warnings:
        print("\nПредупреждения:")
        for w in warnings:
            print(" -", w)


if __name__ == "__main__":
    sys.exit(main())
