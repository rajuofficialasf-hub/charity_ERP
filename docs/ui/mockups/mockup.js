/*
 * Shared behaviour for the Phase 0 mockups (task T0.19b). Vanilla JavaScript, no network.
 * Clickable, not functional: nothing is saved anywhere except the offline toggle in localStorage.
 * Builds the app shell (DESIGN_SYSTEM section 4.1) around <main id="main"> from the body's data attributes:
 *   data-shell="volunteer|official|none"  data-active="<nav key>"  data-tabbar="none" (optional)
 */
(function () {
  'use strict';

  var SHELLS = {
    volunteer: {
      home: '02-volunteer-home.html',
      user: { initials: 'সা', name: 'সাকিব হাসান (নমুনা)', role: 'স্বেচ্ছাসেবক · সাভার' },
      nav: [
        { key: 'home', label: 'হোম', icon: 'house', href: '02-volunteer-home.html', tab: true },
        { key: 'apps', label: 'আবেদন', icon: 'file-text', href: '04-my-applications.html', tab: true },
        { key: 'today', label: 'আজকের কাজ', icon: 'package', href: '05-today-distribution.html', tab: true },
        { key: 'notif', label: 'নোটিফিকেশন', icon: 'bell', href: '06-notifications.html', tab: true, count: 3 },
        { key: 'new', label: 'নতুন আবেদন', icon: 'file-plus', href: '03-new-application.html' },
        { key: 'sync', label: 'সিঙ্ক অবস্থা', icon: 'refresh-cw', href: '06-notifications.html#sync' }
      ]
    },
    official: {
      home: '11-management-home.html',
      user: { initials: 'ফা', name: 'ফারহানা ইসলাম (নমুনা)', role: 'মনিটরিং টিম' },
      groups: [
        { label: 'কাজ', items: [
          { key: 'home', label: 'আমার কাজ', icon: 'house', href: '11-management-home.html', tab: true },
          { key: 'review', label: 'আবেদন রিভিউ', icon: 'clipboard-check', href: '07-review.html', tab: true, count: 37 },
          { key: 'people', label: 'স্বেচ্ছাসেবক', icon: 'users', href: '08-volunteers.html', tab: true },
          { key: 'beneficiary', label: 'উপকারভোগী', icon: 'user-round', href: '09-beneficiary-360.html' },
          { key: 'dashboard', label: 'প্রকল্প ড্যাশবোর্ড', icon: 'layout-dashboard', href: '10-project-dashboard.html', tab: true, tabLabel: 'প্রকল্প' }
        ] },
        { label: 'সেটআপ', items: [
          { key: 'setup', label: 'প্রকল্প সেটআপ', icon: 'settings', href: '12-project-setup.html' },
          { key: 'forms', label: 'ফর্ম বিল্ডার', icon: 'list-checks', href: '13-form-builder.html' },
          { key: 'permissions', label: 'পারমিশন প্যানেল', icon: 'shield', href: '14-permission-panel.html' }
        ] }
      ]
    }
  };

  function icon(name, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
  }
  window.mockIcon = icon;

  function storeGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } }

  /* ---------- toast ---------- */
  function toast(msg) {
    var region = document.querySelector('.toast-region');
    if (!region) { region = document.createElement('div'); region.className = 'toast-region'; region.setAttribute('role', 'status'); region.setAttribute('aria-live', 'polite'); document.body.appendChild(region); }
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = icon('circle-check') + '<span></span>';
    t.querySelector('span').textContent = msg;
    region.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }
  window.mockToast = toast;

  /* ---------- shell ---------- */
  function navItems(cfg) {
    if (cfg.nav) return cfg.nav;
    var all = [];
    cfg.groups.forEach(function (g) { all = all.concat(g.items); });
    return all;
  }

  function buildShell() {
    var body = document.body;
    var kind = body.getAttribute('data-shell') || 'none';
    var main = document.getElementById('main');
    if (!main) return;
    body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#main">মূল অংশে যান</a>');
    if (kind === 'none') return;
    var cfg = SHELLS[kind];
    if (body.getAttribute('data-user-name')) cfg.user = { initials: body.getAttribute('data-user-initials') || cfg.user.initials, name: body.getAttribute('data-user-name'), role: body.getAttribute('data-user-role') || cfg.user.role };
    var active = body.getAttribute('data-active') || '';
    var items = navItems(cfg);
    var notif = kind === 'volunteer' ? '06-notifications.html' : '06-notifications.html';

    var header = document.createElement('header');
    header.className = 'appbar';
    header.innerHTML =
      '<a class="brand" href="' + cfg.home + '"><img src="assets/logo.svg" alt="আস-সুন্নাহ ফাউন্ডেশন" width="50" height="32"><span class="brand-name">চ্যারিটি ও সোশ্যাল সার্ভিস</span></a>' +
      '<div class="appbar-actions">' +
        '<a class="sync-pill" href="06-notifications.html#sync" data-sync-pill>' + icon('cloud') + '<span class="hide-phone">সিঙ্ক হয়েছে</span><span class="sr-only only-phone">সিঙ্ক অবস্থা</span></a>' +
        '<button class="icon-btn" type="button" data-offline-toggle aria-pressed="false" title="অফলাইন অবস্থা দেখুন (মকআপ)">' + icon('wifi') + '<span class="sr-only">অফলাইন অবস্থা দেখুন (মকআপ)</span></button>' +
        '<a class="icon-btn" href="' + notif + '" title="নোটিফিকেশন">' + icon('bell') + '<span class="count tnum">3</span><span class="sr-only">নোটিফিকেশন, 3টি নতুন</span></a>' +
        '<button class="icon-btn hide-phone" type="button" data-lang title="ভাষা: বাংলা / English"><span class="label">EN</span><span class="sr-only">ইংরেজিতে দেখুন</span></button>' +
        '<button class="icon-btn" type="button" data-open="profile-sheet" title="প্রোফাইল"><span class="avatar avatar-sm">' + cfg.user.initials + '</span><span class="sr-only">প্রোফাইল মেনু</span></button>' +
      '</div>';

    var banner = document.createElement('div');
    banner.className = 'banner banner-offline';
    banner.setAttribute('role', 'status');
    banner.innerHTML = icon('cloud-off') + '<span><strong>আপনি অফলাইনে আছেন।</strong> আপনার কাজ এই ফোনে সংরক্ষিত থাকছে; নেটওয়ার্ক ফিরলে সিঙ্ক হবে। <span class="tnum" data-pending-text>অপেক্ষমাণ: 4টি</span></span>';

    var layout = document.createElement('div');
    layout.className = 'layout';
    var side = document.createElement('nav');
    side.className = 'sidebar';
    side.setAttribute('aria-label', 'প্রধান মেনু');
    var sideHtml = '';
    function item(it) {
      return '<a class="nav-item" href="' + it.href + '"' + (it.key === active ? ' aria-current="page"' : '') + '>' + icon(it.icon) + '<span>' + it.label + '</span>' + (it.count ? '<span class="nav-badge tnum">' + it.count + '</span>' : '') + '</a>';
    }
    if (cfg.groups) {
      cfg.groups.forEach(function (g) { sideHtml += '<div class="nav-group">' + g.label + '</div>' + g.items.map(item).join(''); });
    } else {
      sideHtml += cfg.nav.map(item).join('');
    }
    sideHtml += '<div class="nav-foot"><a class="nav-item" href="index.html">' + icon('layout-grid') + '<span>সব পর্দা (মকআপ)</span></a></div>';
    side.innerHTML = sideHtml;

    main.parentNode.insertBefore(layout, main);
    layout.appendChild(side);
    layout.appendChild(main);
    main.classList.add('content');
    body.insertBefore(banner, layout);
    body.insertBefore(header, banner);

    var tabs = items.filter(function (i) { return i.tab; });
    var tabbar = document.createElement('nav');
    tabbar.className = 'tabbar';
    tabbar.setAttribute('aria-label', 'প্রধান মেনু');
    tabbar.innerHTML = tabs.map(function (t) {
      return '<a class="tab-link" href="' + t.href + '"' + (t.key === active ? ' aria-current="page"' : '') + '>' + icon(t.icon) + '<span>' + (t.tabLabel || t.label) + '</span>' + (t.count && kind === 'volunteer' ? '<span class="count tnum">' + t.count + '</span>' : '') + '</a>';
    }).join('') + '<button class="tab-link" type="button" data-open="more-sheet">' + icon('menu') + '<span>আরও</span></button>';
    body.appendChild(tabbar);

    var rest = items.filter(function (i) { return !i.tab; });
    body.insertAdjacentHTML('beforeend',
      '<dialog class="modal" id="more-sheet" aria-labelledby="more-title"><div class="sheet-handle"></div><div class="modal-head"><h2 id="more-title">আরও</h2><button class="icon-btn" type="button" data-close>' + icon('x') + '<span class="sr-only">বন্ধ করুন</span></button></div><div class="modal-body"><ul class="sheet-list">' +
      rest.map(function (r) { return '<li><a href="' + r.href + '">' + icon(r.icon) + r.label + '</a></li>'; }).join('') +
      '<li><button type="button" data-offline-toggle aria-pressed="false">' + icon('wifi-off') + 'অফলাইন অবস্থা দেখুন (মকআপ)</button></li>' +
      '<li><button type="button" data-lang>' + icon('languages') + 'ভাষা: বাংলা / English</button></li>' +
      '<li><a href="index.html">' + icon('layout-grid') + 'সব পর্দা (মকআপ তালিকা)</a></li></ul></div></dialog>' +
      '<dialog class="modal modal-sm" id="profile-sheet" aria-labelledby="profile-title"><div class="sheet-handle"></div><div class="modal-head"><h2 id="profile-title">প্রোফাইল</h2><button class="icon-btn" type="button" data-close>' + icon('x') + '<span class="sr-only">বন্ধ করুন</span></button></div><div class="modal-body"><div class="cluster" style="margin-bottom:12px"><span class="avatar">' + cfg.user.initials + '</span><div><div class="strong">' + cfg.user.name + '</div><div class="caption muted">' + cfg.user.role + '</div></div></div><ul class="sheet-list">' +
      '<li><button type="button" data-toast="প্রোফাইল পর্দা এই মকআপ সেটে নেই">' + icon('user') + 'আমার প্রোফাইল</button></li>' +
      '<li><button type="button" data-toast="ডিভাইস সেশন পর্দা এই মকআপ সেটে নেই">' + icon('smartphone') + 'ডিভাইস সেশন</button></li>' +
      '<li><button type="button" data-lang>' + icon('languages') + 'ভাষা: বাংলা / English</button></li>' +
      '<li><a href="01-login.html">' + icon('log-out') + 'লগআউট</a></li></ul></div></dialog>');
  }

  /* ---------- offline toggle ---------- */
  function setOffline(on) {
    document.body.classList.toggle('is-offline', on);
    document.querySelectorAll('[data-offline-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    var tb = document.querySelector('.appbar [data-offline-toggle]');
    if (tb) { var u = tb.querySelector('use'); if (u) u.setAttribute('href', on ? '#i-wifi-off' : '#i-wifi'); }
    var pill = document.querySelector('[data-sync-pill]');
    if (pill) {
      pill.classList.toggle('is-pending', on);
      pill.innerHTML = on ? icon('cloud-off') + '<span class="hide-phone tnum">অপেক্ষমাণ 4</span><span class="sr-only only-phone">অফলাইন, 4টি অপেক্ষমাণ</span>' : icon('cloud') + '<span class="hide-phone">সিঙ্ক হয়েছে</span><span class="sr-only only-phone">সিঙ্ক অবস্থা</span>';
    }
    document.dispatchEvent(new CustomEvent('mock:offline', { detail: on }));
  }

  /* ---------- tabs (APG tabs pattern) ---------- */
  function initTabs(root) {
    root.querySelectorAll('[role="tablist"]').forEach(function (list) {
      var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
      function select(tab, focus) {
        var activePanel = tab.getAttribute('aria-controls');
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
          var pid = t.getAttribute('aria-controls');
          var panel = document.getElementById(pid);
          if (panel) panel.hidden = pid !== activePanel;
        });
        if (focus) tab.focus();
        list.dispatchEvent(new CustomEvent('mock:tab', { detail: tab.id, bubbles: true }));
      }
      tabs.forEach(function (t, i) {
        t.addEventListener('click', function () { select(t); });
        t.addEventListener('keydown', function (e) {
          var n = null;
          if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
          if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
          if (e.key === 'Home') n = tabs[0];
          if (e.key === 'End') n = tabs[tabs.length - 1];
          if (n) { e.preventDefault(); select(n, true); }
        });
      });
      var initial = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      if (initial) select(initial);
    });
  }
  window.mockSelectTab = function (id) { var t = document.getElementById(id); if (t) t.click(); };

  /* ---------- dialogs, reason dialogs, chips ---------- */
  function openDialog(id) {
    var d = document.getElementById(id);
    if (!d) return null;
    if (d.hasAttribute('data-reason')) {
      d.querySelectorAll('textarea').forEach(function (t) { t.value = ''; });
      var needs = d.querySelectorAll('textarea[required]').length > 0;
      d.querySelectorAll('[data-confirm]').forEach(function (b) { b.disabled = needs; });
    }
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    return d;
  }
  window.mockOpen = openDialog;

  function initEvents() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      var open = t.closest('[data-open]');
      if (open) { e.preventDefault(); openDialog(open.getAttribute('data-open')); return; }
      var close = t.closest('[data-close]');
      if (close) { var d = close.closest('dialog'); if (d) d.close(); if (close.hasAttribute('data-toast')) toast(close.getAttribute('data-toast')); return; }
      if (t.tagName === 'DIALOG' && !t.hasAttribute('data-static')) {
        var r = t.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) t.close();
        return;
      }
      var off = t.closest('[data-offline-toggle]');
      if (off) { var on = !document.body.classList.contains('is-offline'); setOffline(on); storeSet('mock-offline', on ? '1' : '0'); toast(on ? 'অফলাইন অবস্থা দেখানো হচ্ছে (মকআপ)' : 'আবার অনলাইন; সিঙ্ক হচ্ছে'); return; }
      var lang = t.closest('[data-lang]');
      if (lang) { toast('মকআপ শুধু বাংলায়; ইংরেজি সংস্করণ বাস্তবায়নে আসবে (I18N)'); return; }
      var tst = t.closest('[data-toast]');
      if (tst) { if (tst.tagName === 'A') e.preventDefault(); toast(tst.getAttribute('data-toast')); return; }
      var chip = t.closest('.chip[aria-pressed]');
      if (chip && chip.closest('[data-chip-group]')) {
        chip.closest('[data-chip-group]').querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        chip.dispatchEvent(new CustomEvent('mock:chip', { detail: chip.getAttribute('data-value'), bubbles: true }));
        return;
      }
      var seg = t.closest('.segmented button');
      if (seg) {
        seg.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === seg ? 'true' : 'false'); });
        seg.dispatchEvent(new CustomEvent('mock:segment', { detail: seg.getAttribute('data-value'), bubbles: true }));
      }
      var detailClose = t.closest('[data-detail-close]');
      if (detailClose) { document.body.classList.remove('detail-open'); }
    });
    document.addEventListener('input', function (e) {
      var d = e.target.closest('dialog[data-reason]');
      if (!d) return;
      var ok = Array.prototype.every.call(d.querySelectorAll('textarea[required]'), function (t) { return t.value.trim().length > 0; });
      d.querySelectorAll('[data-confirm]').forEach(function (b) { b.disabled = !ok; });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('detail-open') && !document.querySelector('dialog[open]')) document.body.classList.remove('detail-open');
    });
  }

  /* ---------- live capture stamp for the camera frame ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stampNow() {
    var d = new Date();
    var h = d.getHours(), p = h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 16 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
    /* 12-hour time with the Bengali day period first (O-43, I18N.md section 6.3) */
    return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p + ' ' + (h % 12 === 0 ? 12 : h % 12) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  window.mockStampNow = stampNow;

  /* Taka display (O-42): lakh grouping below 10 lakh, million from 10 lakh (1,000,000) up, at most 2 decimals; English digits (UX-05). */
  function taka(n) {
    if (Math.abs(n) < 1000000) return '৳ ' + Math.round(n).toLocaleString('en-IN');
    return '৳ ' + String(Number((n / 1000000).toFixed(2))) + ' মিলিয়ন';
  }
  window.mockTaka = taka;
  setInterval(function () {
    document.querySelectorAll('[data-live-time]').forEach(function (el) { el.textContent = stampNow(); });
  }, 1000);

  /* ---------- icons placeholders: <i data-icon="name"></i> ---------- */
  function initIcons(root) {
    root.querySelectorAll('i[data-icon]').forEach(function (i) {
      i.insertAdjacentHTML('afterend', icon(i.getAttribute('data-icon'), i.getAttribute('data-class')));
      i.remove();
    });
  }
  /* progress bars get an accessible name from their visible label */
  function initProgress(root) {
    root.querySelectorAll('[role="progressbar"]:not([aria-label]):not([aria-labelledby])').forEach(function (p) {
      var lab = p.previousElementSibling && p.previousElementSibling.classList.contains('progress-label') ? p.previousElementSibling.textContent : null;
      if (!lab) { var card = p.closest('.card, td, tr'); var s = card && card.querySelector('.stat-label, .cell-title, .strong'); lab = s ? s.textContent : 'অগ্রগতি'; }
      p.setAttribute('aria-label', lab.replace(/s+/g, ' ').trim());
    });
  }
  window.mockInit = function (root) { initIcons(root); initTabs(root); initProgress(root); };

  document.addEventListener('DOMContentLoaded', function () {
    buildShell();
    initIcons(document);
    initTabs(document);
    initProgress(document);
    initEvents();
    if (storeGet('mock-offline') === '1') setOffline(true);
    document.querySelectorAll('[data-live-time]').forEach(function (el) { el.textContent = stampNow(); });
    document.dispatchEvent(new CustomEvent('mock:ready'));
  });
})();
