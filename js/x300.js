'use strict';

(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkPreference = window.matchMedia('(prefers-color-scheme: dark)');

  const effectiveTheme = () => root.dataset.theme || (darkPreference.matches ? 'dark' : 'light');

  function syncThemeControl() {
    const mode = effectiveTheme();
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.dataset.currentTheme = mode;
      button.setAttribute('aria-label', mode === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    });
  }

  function setTheme(mode) {
    root.dataset.theme = mode;
    try {
      localStorage.setItem('x300-theme', mode);
    } catch (_) {}
    syncThemeControl();
    const giscusFrame = document.querySelector('iframe.giscus-frame');
    if (giscusFrame) {
      giscusFrame.contentWindow.postMessage({
        giscus: {
          setConfig: {
            theme: mode === 'dark' ? 'dark_dimmed' : 'light'
          }
        }
      }, 'https://giscus.app');
    }
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
    });
  });
  darkPreference.addEventListener?.('change', syncThemeControl);
  syncThemeControl();

  const navToggle = document.querySelector('[data-nav-toggle]');
  const mobileNav = document.querySelector('[data-mobile-nav]');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      mobileNav.hidden = expanded;
      navToggle.querySelector('[data-nav-icon-open]').hidden = !expanded;
      navToggle.querySelector('[data-nav-icon-close]').hidden = expanded;
    });
  }

  const searchDialog = document.querySelector('[data-search-dialog]');
  const searchInput = document.querySelector('[data-search-input]');
  const searchResults = document.querySelector('[data-search-results]');
  const searchStatus = document.querySelector('[data-search-status]');
  let searchIndex = null;
  let activeSearchResult = -1;

  async function loadSearchIndex() {
    if (searchIndex) return searchIndex;
    const response = await fetch(searchDialog.dataset.searchEndpoint, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('搜索索引加载失败');
    searchIndex = await response.json();
    return searchIndex;
  }

  function normalize(value) {
    return String(value || '').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
  }

  function createSearchResult(item) {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = item.path;

    const meta = document.createElement('span');
    meta.className = 'search-result__meta';
    meta.textContent = [item.date, item.categories?.[0]].filter(Boolean).join(' · ');

    const title = document.createElement('strong');
    title.textContent = item.title;

    const description = document.createElement('span');
    description.className = 'search-result__description';
    description.textContent = item.description;

    link.append(meta, title, description);
    return link;
  }

  async function runSearch(query) {
    const term = normalize(query);
    searchResults.replaceChildren();
    activeSearchResult = -1;

    if (!term) {
      searchStatus.textContent = '输入关键词开始搜索';
      return;
    }

    searchStatus.textContent = '正在搜索…';
    try {
      const index = await loadSearchIndex();
      const terms = term.split(' ').filter(Boolean);
      const matches = index
        .map(item => {
          const title = normalize(item.title);
          const description = normalize(item.description);
          const categories = normalize(item.categories?.join(' '));
          const tags = normalize(item.tags?.join(' '));
          const content = normalize(item.content);
          const haystack = `${title} ${description} ${categories} ${tags} ${content}`;
          if (!terms.every(word => haystack.includes(word))) return null;
          const score = terms.reduce((total, word) => {
            if (title.includes(word)) return total + 8;
            if (categories.includes(word) || tags.includes(word)) return total + 4;
            if (description.includes(word)) return total + 2;
            return total + 1;
          }, 0);
          return { item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, Number(searchDialog.dataset.searchMaxResults || 8));

      searchStatus.textContent = matches.length > 0
        ? `找到 ${matches.length} 条结果`
        : '没有找到匹配内容';
      matches.forEach(({ item }) => searchResults.append(createSearchResult(item)));
    } catch (error) {
      searchStatus.textContent = '搜索暂时不可用，请稍后重试';
    }
  }

  function openSearch() {
    if (!searchDialog) return;
    searchDialog.showModal();
    document.body.classList.add('dialog-open');
    window.setTimeout(() => searchInput?.focus(), 30);
  }

  function closeSearch() {
    if (!searchDialog?.open) return;
    searchDialog.close();
    document.body.classList.remove('dialog-open');
  }

  document.querySelectorAll('[data-search-open]').forEach(button => button.addEventListener('click', openSearch));
  document.querySelectorAll('[data-search-close]').forEach(button => button.addEventListener('click', closeSearch));
  searchDialog?.addEventListener('click', event => {
    if (event.target === searchDialog) closeSearch();
  });
  searchDialog?.addEventListener('close', () => document.body.classList.remove('dialog-open'));

  let searchTimer = null;
  searchInput?.addEventListener('input', event => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => runSearch(event.target.value), 120);
  });

  searchInput?.addEventListener('keydown', event => {
    const results = [...searchResults.querySelectorAll('a')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      activeSearchResult += event.key === 'ArrowDown' ? 1 : -1;
      activeSearchResult = (activeSearchResult + results.length) % results.length;
      results[activeSearchResult].focus();
    }
  });

  document.addEventListener('keydown', event => {
    const modifier = navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;
    if (modifier && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
  });

  const tocDialog = document.querySelector('[data-toc-dialog]');
  document.querySelectorAll('[data-toc-open]').forEach(button => {
    button.addEventListener('click', () => tocDialog?.showModal());
  });
  document.querySelectorAll('[data-toc-close]').forEach(button => {
    button.addEventListener('click', () => tocDialog?.close());
  });
  tocDialog?.addEventListener('click', event => {
    if (event.target === tocDialog) tocDialog.close();
  });
  tocDialog?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => tocDialog.close());
  });

  const tocLinks = [...document.querySelectorAll('.desktop-toc .toc-link, [data-mobile-toc] .toc-link')];
  const articleHeadings = [...document.querySelectorAll('.article-content h2[id], .article-content h3[id], .article-content h4[id]')];
  if (tocLinks.length > 0 && articleHeadings.length > 0) {
    let currentHeading = null;
    const syncToc = () => {
      const threshold = 140;
      articleHeadings.forEach(heading => {
        if (heading.getBoundingClientRect().top <= threshold) currentHeading = heading;
      });
      if (!currentHeading) currentHeading = articleHeadings[0];
      tocLinks.forEach(link => {
        let target = '';
        try {
          target = decodeURIComponent(link.hash.slice(1));
        } catch (_) {
          target = link.hash.slice(1);
        }
        link.classList.toggle('is-active', target === currentHeading.id);
      });
    };
    window.addEventListener('scroll', syncToc, { passive: true });
    syncToc();
  }

  const progress = document.querySelector('[data-reading-progress]');
  const backToTop = document.querySelector('[data-back-to-top]');
  let scrollFrame = null;
  function updateScrollUi() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    if (progress) progress.style.transform = `scaleX(${ratio})`;
    backToTop?.classList.toggle('is-visible', window.scrollY > 700);
    scrollFrame = null;
  }
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollUi);
  }, { passive: true });
  updateScrollUi();

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  });

  document.querySelectorAll('.article-content table').forEach(table => {
    if (table.closest('figure.highlight')) return;
    if (table.parentElement?.classList.contains('table-scroll')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.append(table);
  });

  document.querySelectorAll('.article-content figure.highlight, .article-content pre').forEach(block => {
    if (block.tagName === 'PRE' && block.closest('figure.highlight')) return;
    if (block.closest('.code-block')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    block.parentNode.insertBefore(wrapper, block);
    wrapper.append(block);

    const toolbar = document.createElement('div');
    toolbar.className = 'code-block__toolbar';
    const language = [...block.classList].find(name => name !== 'highlight') || 'code';
    const label = document.createElement('span');
    label.textContent = language;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '复制';
    copy.addEventListener('click', async () => {
      const code = block.querySelector('.code') || block.querySelector('code') || block;
      try {
        await navigator.clipboard.writeText(code.innerText);
        copy.textContent = '已复制';
        window.setTimeout(() => { copy.textContent = '复制'; }, 1600);
      } catch (_) {
        copy.textContent = '复制失败';
      }
    });
    toolbar.append(label, copy);
    wrapper.prepend(toolbar);
  });

  const giscusContainer = document.querySelector('[data-giscus-container]');
  if (giscusContainer) {
    let loaded = false;
    const loadGiscus = () => {
      if (loaded) return;
      loaded = true;
      const status = giscusContainer.querySelector('[data-giscus-status]');
      if (status) status.textContent = '正在加载评论…';
      const script = document.createElement('script');
      script.src = giscusContainer.dataset.giscusSrc;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.setAttribute('data-repo', giscusContainer.dataset.giscusRepo);
      script.setAttribute('data-repo-id', giscusContainer.dataset.giscusRepoId);
      script.setAttribute('data-category', giscusContainer.dataset.giscusCategory);
      script.setAttribute('data-category-id', giscusContainer.dataset.giscusCategoryId);
      script.setAttribute('data-mapping', giscusContainer.dataset.giscusMapping);
      script.setAttribute('data-strict', '0');
      script.setAttribute('data-reactions-enabled', giscusContainer.dataset.giscusReactionsEnabled);
      script.setAttribute('data-emit-metadata', '0');
      script.setAttribute('data-input-position', giscusContainer.dataset.giscusInputPosition);
      script.setAttribute('data-theme', effectiveTheme() === 'dark' ? 'dark_dimmed' : 'light');
      script.setAttribute('data-lang', giscusContainer.dataset.giscusLang);
      script.setAttribute('data-loading', giscusContainer.dataset.giscusLoading);
      script.addEventListener('load', () => status?.remove());
      giscusContainer.append(script);
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          loadGiscus();
        }
      }, { rootMargin: '800px 0px' });
      observer.observe(giscusContainer);
    } else {
      loadGiscus();
    }
  }
})();
