/*
 * 表示専用のスクリプト。保存処理はPages CMSが担当します。
 * GitHub Pagesのサブディレクトリ（/repo/）でも動作するよう、リンクはハッシュURLに統一。
 */
(() => {
  "use strict";
  const content = document.querySelector("#content");
  const dialog = document.querySelector("#create-dialog");
  const navigation = document.querySelectorAll("[data-nav]");
  let data = null;

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

  function renderCollection(section) {
    const sectionTitle = section === "notes" ? "学習ノート" : "台帳";
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
        list.append(item);
      }
      content.append(list);
    }
    updateNavigation(section);
    document.title = `${sectionTitle} | 知識台帳`;
  }

  function renderMarkdown(body) {
    const wrapper = element("div", "article-body");
    // CDNが使えない場合はプレーンテキストで表示し、外部ライブラリ不達でも内容を失わない。
    if (!window.marked?.parse || !window.DOMPurify?.sanitize) {
      wrapper.append(element("div", "plain-body", body));
      return wrapper;
    }
    const untrustedHtml = window.marked.parse(body, { gfm: true, breaks: true });
    wrapper.innerHTML = window.DOMPurify.sanitize(untrustedHtml);
    wrapper.querySelectorAll("a").forEach(a => {
      if (a.href.startsWith("http:" ) || a.href.startsWith("https:")) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });
    return wrapper;
  }

  function renderArticle(section, id) {
    if (!(["notes", "ledger"].includes(section))) return renderNotFound();
    const entries = data[section] || [];
    const entry = entries.find(entry => entry.id === id);
    if (!entry) return renderNotFound();
    const back = element("a", "back-link", `← ${section === "notes" ? "学習ノート" : "台帳"}に戻る`);
    back.href = `#/${section}`;
    const head = element("header", "article-head");
    head.append(element("h1", "", entry.title));
    content.replaceChildren(back, head, renderMarkdown(entry.body));
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
    else if (page === "notes" || page === "ledger") renderCollection(page);
    else if (page === "article" && section && id) renderArticle(section, id);
    else renderNotFound();
  }

  function initDialog() {
    document.querySelectorAll("[data-open-create]").forEach(button => {
      button.addEventListener("click", () => dialog.showModal());
    });
    document.querySelector("[data-close-dialog]").addEventListener("click", () => dialog.close());
    document.querySelectorAll("[data-close-on-open]").forEach(a => {
      a.addEventListener("click", () => dialog.close());
    });
    dialog.addEventListener("click", e => {
      if (e.target === dialog) dialog.close();
    });
  }

  async function init() {
    initDialog();
    try {
      const response = await fetch("./data/index.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      render();
    } catch (error) {
      console.error("Failed to load content", error);
      content.replaceChildren(heading("データを読み込めませんでした"));
      content.append(element("p", "error-message", "GitHub Pagesの公開設定、またはデータ生成処理を確認してください。ローカルでは scripts/build.py を実行後、dist/ をHTTPサーバーで表示してください。"));
    }
  }

  window.addEventListener("hashchange", render);
  init();
})();
