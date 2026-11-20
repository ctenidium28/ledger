#!/usr/bin/env python3
"""CMSが更新したファイルを、公開サイトが使うJSONに変換する。"""
from __future__ import annotations

import json
from datetime import datetime, timezone
import re
import shutil
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "dist"
CONTENT = ROOT / "content"
FRONTMATTER = re.compile(r"\A---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)\Z", re.S)

# 執筆と加筆の出自は、許可された4パターンだけを採用する。
ATTRIBUTION_TAGS = {
    "human": ["ユーザー執筆"],
    "llm": ["LLM生成"],
    "human_llm": ["ユーザー執筆", "LLM加筆"],
    "llm_human": ["LLM生成", "ユーザー加筆"],
}


def excerpt(body: str, limit: int = 100) -> str:
    """Markdownを一覧向けの短い文章にする（完全なMarkdown解析は不要）。"""
    text = re.sub(r"!\[([^]]*)\]\([^)]*\)", r"\1", body)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"[`*_>#~|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def media_fields(metadata: dict, name: str) -> list[str]:
    """CMSで指定した画像・添付ファイルのパスを配列に統一する。"""
    value = metadata.get(name) or []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


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
        attribution = metadata.get("attribution")
        if "attribution" not in metadata:
            # 導入前の既存記事は、執筆主体を勝手に推定しない。
            tags = []
        elif isinstance(attribution, str) and attribution in ATTRIBUTION_TAGS:
            tags = ATTRIBUTION_TAGS[attribution]
        else:
            raise ValueError(f"不正な執筆・加筆タグ: {path.relative_to(ROOT)}: {attribution!r}")
        results.append({
            "tags": tags,
            "id": path.stem,
            "title": str(metadata["title"]).strip(),
            "excerpt": excerpt(body),
            "body": body,
            "images": media_fields(metadata, "images"),
            "attachments": media_fields(metadata, "attachments"),
        })
    return results


def build() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "data").mkdir(exist_ok=True)
    for filename in ["index.html", "style.css", "app.js", "graph.html", "graph.css", "graph.js"]:
        shutil.copy2(ROOT / filename, DEST / filename)
    # 独自フォントを後から追加してもPagesの公開成果物へ含める。
    font_dir = ROOT / "font"
    if font_dir.is_dir():
        shutil.copytree(font_dir, DEST / "font", dirs_exist_ok=True)
    # CMSでアップロードされた画像・ファイルもGitHub Pagesへ配置する。
    media_dir = ROOT / "media"
    if media_dir.is_dir():
        shutil.copytree(media_dir, DEST / "media", dirs_exist_ok=True)
    memo_path = CONTENT / "memo.txt"
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "memo": memo_path.read_text(encoding="utf-8-sig") if memo_path.exists() else "",
        "notes": read_collection("notes"),
        "ledger": read_collection("ledger"),
    }
    (DEST / "data" / "index.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    # グラフは記事と独立した原本。公開JSONとしてそのまま配信する。
    graph_source = CONTENT / "graph.json"
    graph_data = json.loads(graph_source.read_text(encoding="utf-8"))
    if not isinstance(graph_data, dict) or not all(isinstance(graph_data.get(k), list) for k in ("nodes", "edges", "groups")):
        raise ValueError("content/graph.json の構造が不正です")
    (DEST / "data" / "graph.json").write_text(
        json.dumps(graph_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (DEST / ".nojekyll").touch()
    print(f"Build OK: メモ / 学習ノート {len(payload['notes'])} 件 / 台帳 {len(payload['ledger'])} 件")


if __name__ == "__main__":
    build()
