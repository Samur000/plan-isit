"""Собирает дорожную карту: данные учебных планов + ЭОР + треки/связи -> docs/.

Запуск (из корня проекта):
    python3 -E scripts/extract_plan.py source/pdf/isit_09.03.02.pdf source/plan_isit.json
    python3 -E scripts/build.py

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
# Пока публикуем только ИСИТ. Чтобы добавить ИБ: допишите "source/curation_ib.json" —
# на странице автоматически появится переключатель направлений.
PROGRAMS = ["source/curation_isit.json"]
warnings = []


def clean(s):
    s = re.sub(r"\s+", " ", s or "").strip()
    s = re.sub(r"\s+-\s*", "-", s) if "Он- лайн" in s else s
    return s.replace("Инженерно- техническая", "Инженерно-техническая")


def doc_url(files):
    if not files:
        return None
    f = files[0]  # как на странице ЭОР: берётся первый файл
    if f.get("linkToFile"):
        return f["linkToFile"].replace(" ", "%20")
    return "https://oop.dgu.ru/sved/files-oop/" + f["name"].replace(" ", "%20")


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
        return "optional", "Факультатив (по желанию, не входит в 240 з.е.)"
    if code.startswith("К.М"):
        return "sport", "Комплексный модуль: физическая культура и спорт"
    return "other", ""


def discipline(row, names, short, eor, check_eor=True):
    code = row["code"]
    sems = sorted(int(k) for k in row["semesters"])
    per_sem = []
    totals = {"lec": 0, "lab": 0, "pr": 0, "self": 0, "control": 0}
    for s in sems:
        d = row["semesters"][str(s)]
        forms = [FORM_LABEL[k] for k, v in row["forms"].items() if s in v]
        per_sem.append({"sem": s, "ze": d.get("ze"), "forms": forms,
                        **{k: d.get(k) for k in totals}})
        for k in totals:
            totals[k] += d.get(k) or 0
    kind, part_label = part_of(code)
    e = eor.get(code, {})
    name = clean(names.get(code) or e.get("disciplineName") or row["planName"])
    if not e and check_eor:
        warnings.append(f"{code}: нет в ЭОР (нет ссылок на РПД/ФОС)")
    return {
        "code": code, "name": name, "short": short.get(code, name), "kind": kind,
        "part": part_label, "counted": row["counted"], "sems": sems,
        "ze": row["totals"].get("ze"), "hours": row["totals"].get("hours"),
        "hoursBy": totals, "perSem": per_sem,
        "forms": sorted({f for p in per_sem for f in p["forms"]}, key=list(FORM_LABEL.values()).index),
        "rpd": doc_url(e.get("fileRPD")), "fos": doc_url(e.get("fileFOS")),
    }


def build_program(cur_path):
    cur = json.load(open(ROOT / cur_path, encoding="utf-8"))
    plan = json.load(open(ROOT / cur["plan"], encoding="utf-8"))
    eor_raw = json.load(open(ROOT / cur["eor"], encoding="utf-8"))
    eor = {d["code"]: d for d in eor_raw["profile"]["disciplines"]}
    rows = {r["code"]: r for r in plan if LEAF.match(r["code"])}
    modules = {r["code"]: clean(r.get("lineName") or r["planName"]) for r in plan if r["isGroup"] and not r["code"].startswith("Б1.В.ДВ")}
    track_of = {c: t for t, codes in cur["assign"].items() for c in codes}

    nodes, used = [], set()
    for code, r in rows.items():
        if r["isGroup"] and not code.startswith("Б1.В.ДВ"):
            continue
        parent = re.sub(r"\.\d{2}(\([А-Я]\))?$", "", code)
        if not r["isGroup"] and parent in rows and rows[parent]["isGroup"] and parent.startswith("Б1.В.ДВ"):
            continue  # вариант выбора — войдёт в карточку группы
        if r["isGroup"]:  # группа «по выбору»
            opts = [discipline(rows[c], cur["names"], cur["short"], eor)
                    for c in rows if c.startswith(code + ".") and not rows[c]["isGroup"]]
            base = discipline(r, {}, {}, {}, check_eor=False)
            title = "Модуль мобильности" if "мобильност" in r["planName"] else "Дисциплина по выбору"
            node = {**base, "name": title, "short": title, "kind": "choice", "options": opts,
                    "rpd": None, "fos": None, "module": title}
            used.update(o["code"] for o in opts)
        else:
            node = discipline(r, cur["names"], cur["short"], eor)
            mod = next((modules[m] for m in sorted(modules, key=len, reverse=True) if code.startswith(m + ".")), None)
            node["module"] = "Комплексный модуль: физическая культура и спорт" if code.startswith("К.М") else mod
            if node["kind"] == "gia":
                node["forms"] = ["Защита ВКР"]
        node["track"] = track_of.get(code)
        if not node["track"]:
            warnings.append(f"{code} ({node['name']}): не назначен трек")
        node["start"] = 9 if node["kind"] == "gia" else (node["sems"][0] if node["sems"] else 1)
        nodes.append(node)
        used.add(code)

    ids = {n["code"]: n for n in nodes}
    for c in track_of:
        if c not in ids:
            warnings.append(f"{cur['id']}: трек назначен несуществующему коду {c}")
    edges = []
    for a, b in cur["edges"]:
        if a not in ids or b not in ids:
            warnings.append(f"{cur['id']}: связь {a} -> {b}: нет такого узла")
            continue
        if ids[a]["start"] >= ids[b]["start"]:
            warnings.append(f"{cur['id']}: связь {a} -> {b} не идёт вперёд по семестрам")
        edges.append([a, b])
    for e in eor:
        if e not in used:
            warnings.append(f"{cur['id']}: {e} есть в ЭОР, но не найден в плане")
    return {"id": cur["id"], "meta": cur["meta"], "tracks": cur["tracks"], "nodes": nodes, "edges": edges}


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
        print(f"{p['meta']['code']} {p['meta']['short']}: узлов {len(p['nodes'])}, связей {len(p['edges'])}")
    if warnings:
        print("\nПредупреждения:")
        for w in warnings:
            print(" -", w)


if __name__ == "__main__":
    sys.exit(main())
