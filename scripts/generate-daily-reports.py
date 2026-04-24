#!/usr/bin/env python3

from __future__ import annotations

from argparse import ArgumentParser
from datetime import date, datetime
from pathlib import Path
import re


ROOT_DIR = Path(__file__).resolve().parents[1]
DAILY_DIR = ROOT_DIR / "daily-reports"
PERSONAL_TEMPLATE = DAILY_DIR / "personal-daily-report-template.md"
PERSONAL_REPORTS_DIR = DAILY_DIR / "personal-reports"
TEAMMATE_REPORTS_DIR = DAILY_DIR / "teammate-reports"
FINAL_TEAM_REPORTS_DIR = TEAMMATE_REPORTS_DIR / "final-team-reports"


def normalize(text: str) -> str:
    cleaned = re.sub(r"[#`>*_\-\[\]\(\)📅👤🎯🗓🛠⚠️⏱📆💭]", "", text)
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned.strip().lower()


def clean_entry(line: str) -> str:
    line = re.sub(r"^\s*[-*]\s*", "", line)
    line = re.sub(r"^\s*\d+[.)]\s*", "", line)
    line = line.strip()
    return re.sub(r"\s+", " ", line)


def line_category(line: str) -> str | None:
    normalized = normalize(line)

    if any(key in normalized for key in ["실제수행한작업", "완료한작업", "진행한내용"]):
        return "progress"
    if "발생한이슈" in normalized:
        return "issues"
    if any(key in normalized for key in ["이슈상황및해결방법", "이슈상황및해결"]):
        return "issues"
    if any(key in normalized for key in ["이슈해결방법", "해결방법"]):
        return "solutions"
    if any(key in normalized for key in ["내일의계획", "우선순위별작업", "팀협업계획"]):
        return "tomorrow"
    if re.match(r"^이슈\d+:", normalized):
        return "issues"
    return None


def collect_sections(path: Path) -> dict[str, list[str]]:
    sections = {
        "progress": [],
        "issues": [],
        "solutions": [],
        "tomorrow": [],
    }

    current: str | None = None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue

        category = line_category(line)
        if category is not None:
            current = category
            if current == "issues" and clean_entry(line) != line:
                continue
            if current in {"progress", "tomorrow"} and clean_entry(line) != line:
                continue

        if current is None:
            continue

        entry = clean_entry(line)
        normalized = normalize(entry)
        if not entry:
            continue
        if category is not None and normalized in {
            "실제수행한작업",
            "완료한작업",
            "진행한내용",
            "발생한이슈",
            "이슈상황및해결방법",
            "이슈상황및해결",
            "이슈해결방법",
            "내일의계획",
            "우선순위별작업",
            "팀협업계획",
        }:
            continue

        if current == "issues" and any(key in normalized for key in ["해결방법", "결정:", "영향:", "대응책"]):
            sections["solutions"].append(entry)
        else:
            sections[current].append(entry)

    return sections


def dedupe_keep_order(lines: list[str], limit: int) -> list[str]:
    seen: set[str] = set()
    results: list[str] = []
    for line in lines:
        normalized = normalize(line)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        results.append(line)
        if len(results) >= limit:
            break
    return results


def ensure_personal_report(target_date: date) -> Path:
    PERSONAL_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    target = PERSONAL_REPORTS_DIR / f"{target_date.isoformat()}-personal-daily-report.md"
    if target.exists():
        return target

    template = PERSONAL_TEMPLATE.read_text(encoding="utf-8").rstrip()
    content = template.replace(
        "# 개인용 데일리 리포트",
        "# 개인용 데일리 리포트\n\n## 날짜\n- " + target_date.isoformat(),
        1,
    )
    target.write_text(content + "\n", encoding="utf-8")
    return target


def generate_team_standup(target_date: date, team_label: str, task_label: str) -> Path:
    FINAL_TEAM_REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    personal_report = ensure_personal_report(target_date)
    teammate_dir = TEAMMATE_REPORTS_DIR / target_date.strftime("%m-%d")
    teammate_files = sorted(teammate_dir.glob("*.md")) if teammate_dir.exists() else []

    progress: list[str] = []
    issues: list[str] = []
    solutions: list[str] = []
    tomorrow: list[str] = []

    for source in [personal_report, *teammate_files]:
        sections = collect_sections(source)
        progress.extend(sections["progress"])
        issues.extend(sections["issues"])
        solutions.extend(sections["solutions"])
        tomorrow.extend(sections["tomorrow"])

    progress = dedupe_keep_order(progress, 8)
    issues = dedupe_keep_order(issues, 6)
    solutions = dedupe_keep_order(solutions, 6)
    tomorrow = dedupe_keep_order(tomorrow, 6)

    progress_lines = [f"- {line}" for line in progress] or ["- "]
    issue_lines = [f"- {line}" for line in issues] or ["- "]
    solution_lines = [f"- {line}" for line in solutions] or ["- "]
    tomorrow_lines = [f"- {line}" for line in tomorrow] or ["- "]

    title = f"{target_date.isoformat()}-{team_label}-{task_label}"
    output = FINAL_TEAM_REPORTS_DIR / f"{title}.md"
    lines = [
        f"# {title}",
        "",
        "## 진행한 내용",
        *progress_lines,
        "",
        "## 발생한 이슈",
        *issue_lines,
        "",
        "## 이슈 해결 방법",
        *solution_lines,
        "",
        "## 내일의 계획",
        *tomorrow_lines,
        "",
    ]
    output.write_text("\n".join(lines), encoding="utf-8")
    return output


def main() -> None:
    parser = ArgumentParser(description="Generate personal/team daily report files.")
    parser.add_argument("--date", dest="target_date", help="Target date (YYYY-MM-DD)")
    parser.add_argument("--team", default="3팀", help="Team label for final standup title")
    parser.add_argument("--task", default="T1", help="Task label for final standup title")
    args = parser.parse_args()

    target_date = (
        datetime.strptime(args.target_date, "%Y-%m-%d").date()
        if args.target_date
        else date.today()
    )

    personal = ensure_personal_report(target_date)
    final_report = generate_team_standup(target_date, args.team, args.task)

    print(f"personal_report={personal.relative_to(ROOT_DIR)}")
    print(f"final_team_report={final_report.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    main()
