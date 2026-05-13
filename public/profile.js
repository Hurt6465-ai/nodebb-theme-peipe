'use strict';

(function () {
  if (window.__peipeProfileThemeV14) return;
  window.__peipeProfileThemeV14 = true;

  var TEXT = {
    loading: '加载个人主页...',
    comments: '评论',
    notes: '动态',
    about: '资料',
    noComments: '还没有评价，成为第一个评价 TA 的人',
    writePlaceholder: '写一句真实印象，最多 120 字',
    submit: '发布评价',
    update: '修改评价',
    login: '登录后评价',
    self: '这是你的主页，别人对你的评价会显示在这里',
    score: '评分',
    stars: '星',
    average: '平均评分',
    ratingRequired: '请选择 1-5 星或写一句评价',
    loadFail: '个人主页加载失败',
    commentFail: '评价失败',
    follow: '关注',
    chat: '聊天',
    greet: '👋 Hi',
    emptyBio: '这个人还没有写介绍',
  };

  var state = {
    root: null,
    user: null,
    comments: [],
    viewerComment: null,
    rating: 5,
    activeTab: 'comments',
    loading: false,
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function rel(path) {
    var base = (window.config && window.config.relative_path) || '';
    if (!path) return base || '';
    if (/^https?:\/\//i.test(path)) return path;
    if (base && path.indexOf(base + '/') === 0) return path;
    return base + path;
  }

  function csrfToken() {
    return (window.config && (window.config.csrf_token || window.config.csrfToken)) ||
      ($('meta[name="csrf-token"]') && $('meta[name="csrf-token"]').getAttribute('content')) || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function cleanText(value, max) {
    return String(value == null ? '' : value)
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || 200);
  }

  function currentUser() {
    return (window.app && window.app.user) || {};
  }

  function isLoggedIn() {
    return Number(currentUser().uid || 0) > 0;
  }

  function getPathParts() {
    var path = location.pathname;
    var base = (window.config && window.config.relative_path) || '';
    if (base && path.indexOf(base) === 0) path = path.slice(base.length) || '/';
    return path.split('/').map(decodeURIComponent).filter(Boolean);
  }

  function routeInfo() {
    var parts = getPathParts();
    var userIndex = parts.indexOf('user');
    if (userIndex === -1 || !parts[userIndex + 1]) return null;
    var section = String(parts[userIndex + 2] || 'comments').toLowerCase();
    return {
      slug: parts[userIndex + 1],
      section: section || 'comments',
    };
  }

  function alertError(message) {
    if (window.app && typeof app.alertError === 'function') app.alertError(message);
    else window.alert(message);
  }

  function alertSuccess(message) {
    if (window.app && typeof app.alertSuccess === 'function') app.alertSuccess(message);
  }

  function apiFetch(url, options) {
    options = options || {};
    options.credentials = options.credentials || 'same-origin';
    options.headers = Object.assign({
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    }, options.headers || {});

    return fetch(rel(url), options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var msg = json.error || json.message || (json.status && json.status.message) || ('HTTP ' + res.status);
          throw new Error(msg);
        }
        return json && (json.response || json);
      });
    });
  }

  function normalizeUser(payload) {
    var data = payload && (payload.user || payload.response || payload) || {};
    var ajax = (window.ajaxify && window.ajaxify.data) || {};
    var user = data.user || data;
    var profile = Object.assign({}, ajax.user || {}, ajax, user || {});
    var uid = Number(profile.uid || profile.userId || profile.userid || ajax.uid || 0);
    var username = cleanText(profile.displayname || profile.displayName || profile.username || profile.userslug || 'User', 40);
    var userslug = String(profile.userslug || profile.slug || '').replace(/^@/, '');
    var picture = profile.picture || profile.uploadedpicture || profile.avatar || '';
    var cover = profile.cover && (profile.cover.url || profile.cover) || profile['cover:url'] || profile.peipe_cover || '';
    var about = cleanText(profile.aboutme || profile.about || profile.bio || profile.signature || '', 240);
    return {
      uid: uid,
      username: username,
      userslug: userslug,
      picture: picture,
      cover: cover,
      about: about,
      reputation: Number(profile.reputation || 0),
      postcount: Number(profile.postcount || profile.posts || 0),
      followerCount: Number(profile.followerCount || profile.followers || 0),
      followingCount: Number(profile.followingCount || profile.following || 0),
      raw: profile,
    };
  }

  function starHtml(value, name) {
    value = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
    var html = '<div class="peipe-stars" data-name="' + escapeHtml(name || '') + '">';
    for (var i = 1; i <= 5; i += 1) {
      html += '<button type="button" class="peipe-star ' + (i <= value ? 'is-on' : '') + '" data-value="' + i + '" aria-label="' + i + ' stars">★</button>';
    }
    html += '</div>';
    return html;
  }

  function readonlyStars(value) {
    value = Math.max(0, Math.min(5, Number(value || 0)));
    var full = Math.round(value);
    var html = '<span class="peipe-stars-readonly" aria-label="' + value + ' stars">';
    for (var i = 1; i <= 5; i += 1) {
      html += '<i class="' + (i <= full ? 'is-on' : '') + '">★</i>';
    }
    html += '</span>';
    return html;
  }

  function profileUrl(path) {
    var slug = encodeURIComponent(state.user && state.user.userslug || routeInfo().slug || '');
    return rel('/user/' + slug + (path || ''));
  }

  function renderShell(summary) {
    var user = state.user || {};
    var me = currentUser();
    var isSelf = Number(me.uid || 0) === Number(user.uid || 0);
    var avatar = user.picture ? '<img src="' + escapeHtml(user.picture) + '" alt="avatar">' : '<span>' + escapeHtml((user.username || 'U').slice(0, 1).toUpperCase()) + '</span>';
    var coverStyle = user.cover ? ' style="background-image:url(' + escapeHtml(user.cover) + ')"' : '';
    var avg = summary && Number(summary.averageRating || 0) || 0;
    var count = summary && Number(summary.ratingCount || 0) || 0;

    return '' +
      '<div class="peipe-profile-shell">' +
        '<section class="peipe-profile-hero"' + coverStyle + '>' +
          '<div class="peipe-profile-hero-shade"></div>' +
          '<div class="peipe-profile-topbar">' +
            '<button type="button" class="peipe-profile-back" aria-label="back">‹</button>' +
            '<div class="peipe-profile-top-title">' + escapeHtml(user.username || 'User') + '</div>' +
            '<button type="button" class="peipe-profile-more" aria-label="more">•••</button>' +
          '</div>' +
          '<div class="peipe-profile-userline">' +
            '<div class="peipe-profile-avatar">' + avatar + '</div>' +
            '<div class="peipe-profile-namebox">' +
              '<h1>' + escapeHtml(user.username || 'User') + '</h1>' +
              '<p>@' + escapeHtml(user.userslug || '') + '</p>' +
              '<div class="peipe-profile-rating-head">' + readonlyStars(avg) + '<b>' + (avg ? avg.toFixed(1) : '—') + '</b><span>' + count + ' 条评价</span></div>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="peipe-profile-card">' +
          '<p class="peipe-profile-bio">' + escapeHtml(user.about || TEXT.emptyBio) + '</p>' +
          '<div class="peipe-profile-stats">' +
            '<div><b>' + user.postcount + '</b><span>动态</span></div>' +
            '<div><b>' + user.followerCount + '</b><span>粉丝</span></div>' +
            '<div><b>' + user.followingCount + '</b><span>关注</span></div>' +
          '</div>' +
          '<div class="peipe-profile-actions">' +
            (isSelf ? '<a class="peipe-profile-action primary" href="' + profileUrl('/edit') + '">编辑资料</a>' : '<button type="button" class="peipe-profile-action primary peipe-profile-greet">' + TEXT.greet + '</button>') +
            (!isSelf ? '<a class="peipe-profile-action" href="' + profileUrl('/chats') + '">' + TEXT.chat + '</a>' : '') +
          '</div>' +
        '</section>' +
        '<nav class="peipe-profile-tabs">' +
          '<button type="button" class="peipe-tab is-active" data-tab="comments">' + TEXT.comments + '</button>' +
          '<button type="button" class="peipe-tab" data-tab="notes">' + TEXT.notes + '</button>' +
          '<button type="button" class="peipe-tab" data-tab="about">' + TEXT.about + '</button>' +
        '</nav>' +
        '<main class="peipe-profile-main">' +
          '<section class="peipe-tab-panel is-active" data-panel="comments"></section>' +
          '<section class="peipe-tab-panel" data-panel="notes"></section>' +
          '<section class="peipe-tab-panel" data-panel="about"></section>' +
        '</main>' +
      '</div>';
  }

  function renderCommentsPanel(payload) {
    var panel = $('[data-panel="comments"]', state.root);
    if (!panel) return;
    var user = state.user || {};
    var isSelf = Number(currentUser().uid || 0) === Number(user.uid || 0);
    var comments = payload.comments || [];
    var avg = Number(payload.averageRating || 0);
    var count = Number(payload.ratingCount || 0);
    var viewer = payload.viewerComment || null;
    state.viewerComment = viewer;
    state.rating = viewer && viewer.rating ? Number(viewer.rating) : state.rating || 5;

    var html = '' +
      '<div class="peipe-comments-summary">' +
        '<div><span>' + TEXT.average + '</span><strong>' + (avg ? avg.toFixed(1) : '—') + '</strong></div>' +
        '<div>' + readonlyStars(avg) + '<em>' + count + ' 人评分</em></div>' +
      '</div>';

    if (isSelf) {
      html += '<div class="peipe-comment-hint">' + TEXT.self + '</div>';
    } else if (isLoggedIn()) {
      html += renderCommentComposer(viewer);
    } else {
      html += '<a class="peipe-login-card" href="' + rel('/login?returnTo=' + encodeURIComponent(location.pathname)) + '">' + TEXT.login + '</a>';
    }

    html += '<div class="peipe-comment-list">';
    if (!comments.length) {
      html += '<div class="peipe-empty-comments">' + TEXT.noComments + '</div>';
    } else {
      html += comments.map(renderComment).join('');
    }
    html += '</div>';
    panel.innerHTML = html;
    bindCommentPanel();
  }

  function renderCommentComposer(viewerComment) {
    var content = viewerComment && viewerComment.content || '';
    var rating = viewerComment && viewerComment.rating || state.rating || 5;
    return '' +
      '<form class="peipe-comment-compose">' +
        '<div class="peipe-comment-compose-head"><span>' + TEXT.score + '</span>' + starHtml(rating, 'compose') + '</div>' +
        '<textarea maxlength="120" placeholder="' + TEXT.writePlaceholder + '">' + escapeHtml(content) + '</textarea>' +
        '<button type="submit">' + (viewerComment ? TEXT.update : TEXT.submit) + '</button>' +
      '</form>';
  }

  function renderComment(item) {
    item = item || {};
    var avatar = item.authorAvatar ? '<img src="' + escapeHtml(item.authorAvatar) + '" alt="avatar">' : '<span>' + escapeHtml((item.authorName || 'U').slice(0, 1).toUpperCase()) + '</span>';
    return '' +
      '<article class="peipe-comment-item" data-id="' + escapeHtml(item.id || '') + '">' +
        '<div class="peipe-comment-avatar">' + avatar + '</div>' +
        '<div class="peipe-comment-body">' +
          '<div class="peipe-comment-line"><b>' + escapeHtml(item.authorName || 'User') + '</b>' + readonlyStars(item.rating || 0) + '</div>' +
          (item.content ? '<p>' + escapeHtml(item.content) + '</p>' : '') +
        '</div>' +
      '</article>';
  }

  function renderNotesPanel() {
    var panel = $('[data-panel="notes"]', state.root);
    if (!panel) return;
    panel.innerHTML = '<div class="peipe-notes-placeholder"><p>动态列表保留给主题层渲染。</p><a href="' + profileUrl('/topics') + '">查看 TA 的动态</a></div>';
  }

  function renderAboutPanel() {
    var panel = $('[data-panel="about"]', state.root);
    if (!panel) return;
    var user = state.user || {};
    panel.innerHTML = '' +
      '<div class="peipe-about-card">' +
        '<h3>个人资料</h3>' +
        '<p>' + escapeHtml(user.about || TEXT.emptyBio) + '</p>' +
        '<dl>' +
          '<dt>用户 ID</dt><dd>' + escapeHtml(user.uid || '') + '</dd>' +
          '<dt>用户名</dt><dd>' + escapeHtml(user.username || '') + '</dd>' +
          '<dt>主页</dt><dd>@' + escapeHtml(user.userslug || '') + '</dd>' +
        '</dl>' +
      '</div>';
  }

  function bindShell() {
    var back = $('.peipe-profile-back', state.root);
    if (back) back.addEventListener('click', function () {
      if (history.length > 1) history.back();
      else location.href = rel('/');
    });

    $$('.peipe-tab', state.root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        setActiveTab(btn.getAttribute('data-tab') || 'comments');
      });
    });

    var greet = $('.peipe-profile-greet', state.root);
    if (greet) {
      greet.addEventListener('click', function () {
        if (!isLoggedIn()) return alertError('请先登录');
        apiFetch('/api/peipe-partners/me/greet', {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8', 'x-csrf-token': csrfToken() },
          body: JSON.stringify({ targetUid: state.user.uid })
        }).then(function () {
          greet.textContent = '已打招呼';
          greet.disabled = true;
          alertSuccess('已打招呼');
        }).catch(function (err) {
          alertError(err.message || '打招呼失败');
        });
      });
    }
  }

  function bindCommentPanel() {
    var compose = $('.peipe-comment-compose', state.root);
    if (!compose) return;

    $$('.peipe-stars[data-name="compose"] .peipe-star', compose).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        state.rating = Number(btn.getAttribute('data-value') || 5);
        $$('.peipe-stars[data-name="compose"] .peipe-star', compose).forEach(function (star) {
          star.classList.toggle('is-on', Number(star.getAttribute('data-value') || 0) <= state.rating);
        });
      });
    });

    compose.addEventListener('submit', function (event) {
      event.preventDefault();
      submitComment(compose);
    });
  }

  function setActiveTab(tab) {
    state.activeTab = tab || 'comments';
    $$('.peipe-tab', state.root).forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === state.activeTab);
    });
    $$('.peipe-tab-panel', state.root).forEach(function (panel) {
      panel.classList.toggle('is-active', panel.getAttribute('data-panel') === state.activeTab);
    });
  }

  function submitComment(form) {
    var textarea = $('textarea', form);
    var content = cleanText(textarea && textarea.value, 120);
    var rating = Math.max(1, Math.min(5, Number(state.rating || 0)));
    if (!content && !rating) return alertError(TEXT.ratingRequired);

    var button = $('button[type="submit"]', form);
    if (button) {
      button.disabled = true;
      button.textContent = '提交中...';
    }

    apiFetch('/api/peipe-partners/profile/' + encodeURIComponent(state.user.uid) + '/comments', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-csrf-token': csrfToken(),
      },
      body: JSON.stringify({ content: content, rating: rating }),
    }).then(function () {
      alertSuccess('评价已保存');
      return loadComments();
    }).catch(function (err) {
      alertError(err.message || TEXT.commentFail);
    }).finally(function () {
      if (button) {
        button.disabled = false;
        button.textContent = state.viewerComment ? TEXT.update : TEXT.submit;
      }
    });
  }

  function loadProfile() {
    var info = routeInfo();
    if (!info) return Promise.reject(new Error('not user page'));
    return apiFetch('/api/user/' + encodeURIComponent(info.slug)).catch(function () {
      return (window.ajaxify && window.ajaxify.data) || {};
    }).then(function (payload) {
      state.user = normalizeUser(payload);
      if (!state.user.uid) throw new Error('missing uid');
      state.root.innerHTML = renderShell({ averageRating: 0, ratingCount: 0 });
      bindShell();
      renderNotesPanel();
      renderAboutPanel();
      return loadComments();
    });
  }

  function loadComments() {
    if (!state.user || !state.user.uid) return Promise.resolve();
    return apiFetch('/api/peipe-partners/profile/' + encodeURIComponent(state.user.uid) + '/comments?limit=50')
      .then(function (payload) {
        state.comments = payload.comments || [];
        state.root.innerHTML = renderShell(payload);
        bindShell();
        renderNotesPanel();
        renderAboutPanel();
        renderCommentsPanel(payload);
        setActiveTab('comments');
      })
      .catch(function (err) {
        console.warn('[peipe-profile] comments failed', err);
        renderCommentsPanel({ comments: [], averageRating: 0, ratingCount: 0 });
      });
  }

  function init() {
    var root = document.getElementById('peipe-profile-app');
    if (!root) return;
    state.root = root;
    root.innerHTML = '<div class="peipe-profile-loading"><div class="peipe-profile-loading-card"><div class="peipe-profile-loading-avatar"></div><div class="peipe-profile-loading-lines"><i></i><i></i><i></i></div></div></div>';
    loadProfile().catch(function (err) {
      console.warn('[peipe-profile] load failed', err);
      root.innerHTML = '<div class="peipe-profile-error">' + TEXT.loadFail + '</div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (window.jQuery) {
    window.jQuery(window).on('action:ajaxify.end', function () {
      window.setTimeout(init, 30);
    });
  }
})();
