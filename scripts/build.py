#!/usr/bin/env python3
"""CMSが更新したファイルを、公開サイトが使うJSONに変換する。"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "dist"
CONTENT = ROOT / "content"
FRONTMATTER = re.compile(r"\A---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)\Z", re.S)


def excerpt(body: str, limit: int = 100) -> str:
    """Markdownを一覧向けの短い文章にする（完全なMarkdown解析は不要）。"""
    text = re.sub(r"!\[([^]]*)\]\([^)]*\)", r"\1", body)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"[`*_>#~|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def read_collection(section: str) -> list[dict]:
    directory = CONTENT / section
    results = []
    for path in sorted(directory.glob("*.md"), reverse=True):
        value = path.read_text(encoding="utf-8-sig")
        match = FRONTMATTER.fullmatch(value)
        if not match:
            raise ValueError(f"Frontmatterがありません: {path.relative_to(ROOT)}")
        metadata = yaml.safe_load(match.group(1))
        if not isinstance(metadata, dict) or not str(metadata.get("title", "")).strip():
            raise ValueError(f"titleがありません: {path.relative_to(ROOT)}")
        body = match.group(2).strip()
        results.append({
            "id": path.stem,
            "title": str(metadata["title"]).strip(),
            "excerpt": excerpt(body),
            "body": body,
        })
    return results


def build() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "data").mkdir(exist_ok=True)
    for filename in ["index.html", "style.css", "app.js"]:
        shutil.copy2(ROOT / filename, DEST / filename)
    memo_path = CONTENT / "memo.txt"
    payload = {
        "memo": memo_path.read_text(encoding="utf-8-sig") if memo_path.exists() else "",
        "notes": read_collection("notes"),
        "ledger": read_collection("ledger"),
    }
    (DEST / "data" / "index.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (DEST / ".nojekyll").touch()
    print(f"Build OK: メモ / 学習ノート {len(payload['notes'])} 件 / 台帳 {len(payload['ledger'])} 件")


if __name__ == "__main__":
    build()
