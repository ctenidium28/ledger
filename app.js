/*
 * 表示専用のスクリプト。保存処理はPages CMSが担当します。
 * GitHub Pagesのサブディレクトリ（/repo/）でも動作するよう、リンクはハッシュURLに統一。
 */
(() => {
  "use strict";
  const content = document.querySelector("#content");
  const navigation = document.querySelectorAll("[data-nav]");
  let data = null;
  const sectionTitles = { resources: "資料", notes: "学習ノート", ledger: "台帳" };

  // MarkedにKaTeX拡張を一度だけ登録する。数式のコードブロックは解析しない。
  // 拡張が読み込めない場合も、記事本文は従来どおり表示する。
  if (window.marked?.use && typeof window.markedKatex === "function" && window.katex) {
    window.marked.use(window.markedKatex({ throwOnError: false }));
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function heading(title, description = "") {
    const wrapper = element("div", "section-heading");
    wrapper.append(element("h1", "", title));
    if (description) wrapper.append(element("p", "", description));
    return wrapper;
  }

  function getRoute() {
    let parts;
    try {
      parts = decodeURIComponent((location.hash || "#/ledger").replace(/^#\/?/, "")).split("/");
    } catch {
      return ["ledger"];
    }
    return parts.filter(Boolean);
  }

  function updateNavigation(section) {
    navigation.forEach(a => {
      if (a.dataset.nav === section) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function linkTo(section, id) {
    return `#/article/${section}/${encodeURIComponent(id)}`;
  }

  function cmsLink(label = "Pages CMSで編集する") {
    const a = element("a", "edit-link", label);
    a.href = "https://app.pagescms.org/";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function renderMemo() {
    content.replaceChildren(heading("メモ"));
    const memo = element("div", "memo-text", data.memo || "");
    content.append(memo);
    if (!data.memo.trim()) content.append(element("p", "empty", "メモはまだありません。"));
    content.append(cmsLink("メモを編集する（Pages CMS）"));
    updateNavigation("memo");
    document.title = "メモ | 知識台帳";
  }

  // 公開用JSONのタグを、一般的なハッシュタグ風のラベルとして表示する。
  function renderTags(entry) {
    if (!Array.isArray(entry.tags) || !entry.tags.length) return null;
    const tags = element("div", "article-tags");
    for (const tag of entry.tags) {
      if (typeof tag !== "string") continue;
      tags.append(element("span", "article-tag", `#${tag}`));
    }
    return tags.childElementCount ? tags : null;
  }

  function renderCollection(section) {
    const sectionTitle = sectionTitles[section];
    const entries = data[section] || [];
    content.replaceChildren(heading(sectionTitle));
    const list = element("ul", "article-list");
    if (entries.length === 0) {
      content.append(element("p", "empty", "記事はまだありません。「新規作成」から追加できます。"));
    } else {
      for (const entry of entries) {
        const item = element("li", "article-item");
        const title = element("h2");
        const anchor = element("a", "", entry.title);
        anchor.href = linkTo(section, entry.id);
        title.append(anchor);
        item.append(title, element("p", "", entry.excerpt || ""));
        const tags = renderTags(entry);
        if (tags) item.append(tags);
        list.append(item);
      }
      content.append(list);
    }
    updateNavigation(section);
    document.title = `${sectionTitle} | 知識台帳`;
  }

  // Pages CMS が $$ の行末に付けた空白を除去する。
  // フェンス付きコードブロック内は数式ではないため変更しない。
  function normalizeMathDelimiters(source) {
    let fence = null;
    return source.split(/\r?\n/).map(line => {
      const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (match) {
        const marker = match[1][0];
        if (fence === null) fence = { marker, count: match[1].length };
        else if (fence.marker === marker && match[1].length >= fence.count && !match[2].trim()) fence = null;
        return line;
      }
      return fence === null && /^ {0,3}\$\$[ \t]*$/.test(line) ? line.trimEnd() : line;
    }).join("\n");
  }

  // CMS の画像・添付ファイル欄に保存されたパスをURLにする。
  // javascript: 等は許さない。
  function mediaUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
      const url = new URL(raw, window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function renderAssets(entry) {
    const container = element("div", "article-assets");
    const images = Array.isArray(entry.images) ? entry.images : [];
    const attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
    const validImages = images.map(mediaUrl).filter(Boolean);
    const validFiles = attachments.map(mediaUrl).filter(Boolean);

    if (validImages.length) {
      const section = element("section", "article-asset-section");
      section.append(element("h2", "", "添付画像"));
      const gallery = element("div", "article-image-gallery");
      validImages.forEach((url, i) => {
        const a = element("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        const img = element("img");
        img.src = url;
        img.alt = `${entry.title} の添付画像 ${i + 1}`;
        img.loading = "lazy";
        a.append(img);
        gallery.append(a);
      });
      section.append(gallery);
      container.append(section);
    }
    if (validFiles.length) {
      const section = element("section", "article-asset-section");
      section.append(element("h2", "", "添付ファイル"));
      const list = element("ul", "article-attachment-list");
      validFiles.forEach(url => {
        const a = element("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        const name = new URL(url).pathname.split("/").pop() || "添付ファイル";
        try { a.textContent = decodeURIComponent(name); }
        catch { a.textContent = name; }
        const li = element("li");
        li.append(a);
        list.append(li);
      });
      section.append(list);
      container.append(section);
    }
    return container.childElementCount ? container : null;
  }

  // 明示的な同サイト記事リンクだけ展開する。その他のリンクは従来どおり。
  function resolveArticleReference(anchor) {
    let url;
    try { url = new URL(anchor.getAttribute("href"), window.location.href); }
    catch { return null; }
    let section, id, match;
    if (url.hostname === "github.com") {
      match = url.pathname.match(/^\/ctenidium28\/ledger\/blob\/[^/]+\/content\/(resources|notes|ledger)\/(.+)\.md$/);
      if (match) { section = match[1]; id = match[2]; }
    } else if (url.hostname === "raw.githubusercontent.com") {
      match = url.pathname.match(/^\/ctenidium28\/ledger\/[^/]+\/content\/(resources|notes|ledger)\/(.+)\.md$/);
      if (match) { section = match[1]; id = match[2]; }
    } else if (url.origin === window.location.origin && /\/(?:index\.html)?$/.test(url.pathname)) {
      match = url.hash.match(/^#\/article\/(resources|notes|ledger)\/([^/?#]+)/);
      if (match) { section = match[1]; id = match[2]; }
    }
    if (!section || !id) return null;
    try { id = decodeURIComponent(id); }
    catch { return null; }
    const entry = (data?.[section] || []).find(item => item.id === id);
    return entry ? {section, entry} : null;
  }

  function enableArticleReferences(wrapper) {
    for (const anchor of wrapper.querySelectorAll("a[href]")) {
      const reference = resolveArticleReference(anchor);
      if (!reference) continue;
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      anchor.addEventListener("click", event => {
        event.preventDefault();
        const host = element("span", "article-reference");
        const heading = element("span", "article-reference-heading");
        heading.append(element("span", "article-reference-title", reference.entry.title));
        const close = element("button", "article-reference-close", "閉じる");
        close.type = "button";
        close.setAttribute("aria-label", "参照記事を閉じる");
        heading.append(close);
        const panel = element("span", "article-reference-panel");
        const tags = renderTags(reference.entry);
        if (tags) panel.append(tags);
        // 再帰参照を自動では展開しない。クリック時のみ次の階層を生成する。
        panel.append(renderMarkdown(reference.entry.body));
        host.append(heading, panel);
        close.addEventListener("click", () => host.replaceWith(anchor));
        anchor.replaceWith(host);
      });
    }
  }

  function renderMarkdown(body) {
    const wrapper = element("div", "article-body");
    // CDNが使えない場合はプレーンテキストで表示し、外部ライブラリ不達でも内容を失わない。
    if (!window.marked?.parse || !window.DOMPurify?.sanitize) {
      wrapper.append(element("div", "plain-body", body));
      return wrapper;
    }
    const untrustedHtml = window.marked.parse(normalizeMathDelimiters(body), { gfm: true, breaks: true });
    wrapper.innerHTML = window.DOMPurify.sanitize(untrustedHtml);
    enableArticleReferences(wrapper);
    wrapper.querySelectorAll("a").forEach(a => {
      if (a.href.startsWith("http:" ) || a.href.startsWith("https:")) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });
    return wrapper;
  }

  function renderArticle(section, id) {
    if (!Object.hasOwn(sectionTitles, section)) return renderNotFound();
    const entries = data[section] || [];
    const entry = entries.find(entry => entry.id === id);
    if (!entry) return renderNotFound();
    const back = element("a", "back-link", `← ${sectionTitles[section]}に戻る`);
    back.href = `#/${section}`;
    const head = element("header", "article-head");
    head.append(element("h1", "", entry.title));
    const tags = renderTags(entry);
    if (tags) head.append(tags);
    content.replaceChildren(back, head, renderMarkdown(entry.body));
    const assets = renderAssets(entry);
    if (assets) content.append(assets);
    content.append(cmsLink("この記事を編集する（Pages CMS）"));
    updateNavigation(section);
    document.title = `${entry.title} | 知識台帳`;
  }

  function renderNotFound() {
    content.replaceChildren(heading("ページが見つかりません"));
    const link = element("a", "", "台帳へ戻る");
    link.href = "#/ledger";
    content.append(link);
    updateNavigation("");
    document.title = "ページが見つかりません | 知識台帳";
  }

  function render() {
    if (!data) return;
    const [page, section, id] = getRoute();
    if (page === "memo") renderMemo();
    else if (Object.hasOwn(sectionTitles, page)) renderCollection(page);
    else if (page === "article" && section && id) renderArticle(section, id);
    else renderNotFound();
  }

  async function init() {
    try {
      // CMS側の編集はGitHub Actionsによる再公開後に反映される。
      // 古いJSONがブラウザ/CDNに残る可能性を減らすためキャッシュせず取得する。
      const response = await fetch(`./data/index.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      render();
    } catch (error) {
      console.error("Failed to load content", error);
      content.replaceChildren(heading("データを読み込めませんでした"));
      content.append(element("p", "error-message", "data/index.json の取得に失敗しました。GitHubの Settings → Pages → Source を GitHub Actions に設定し、Actions の「Publish knowledge ledger」が成功しているか確認してください。"));
    }
  }

  window.addEventListener("hashchange", render);
  init();
})();
