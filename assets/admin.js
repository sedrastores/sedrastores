/* =====================================================================
   Sedra Store — Admin panel
   ===================================================================== */
(function () {
  'use strict';
  var D = window.SedraData;
  var esc = D.esc, money = D.money, num = D.num;

  var ADMIN_USERNAME = 'admin';
  var ADMIN_PASSWORD = 'harby';
  var FIREBASE_ADMIN_EMAIL = 'admin@sedra.com';
  var STATUSES = ['جديد', 'قيد التجهيز', 'تم الشحن', 'تم التسليم', 'مرتجع', 'ملغي'];
  var STATUS_CLASS = { 'جديد': 'status-new', 'قيد التجهيز': 'status-prep', 'تم الشحن': 'status-shipped', 'تم التسليم': 'status-delivered', 'مرتجع': 'status-returned', 'ملغي': 'status-cancelled' };
  var RATIOS = [
    { v: '1/1', label: 'مربع' }, { v: '4/3', label: 'عريض' }, { v: '3/2', label: 'عريض جداً' },
    { v: '3/4', label: 'طولي' }, { v: '2/3', label: 'طولي جداً' }
  ];
  var TAB_TITLES = { overview: 'نظرة عامة', orders: 'الأوردرات', categories: 'الأصناف', products: 'المنتجات', analytics: 'الإحصائيات', settings: 'إعدادات الموقع' };

  /* ---------------- Firebase ---------------- */
  var db = null, auth = null, storage = null;
  try {
    if (!firebase.apps.length) firebase.initializeApp(D.CONFIG.firebase);
    db = firebase.firestore();
    try { auth = firebase.auth ? firebase.auth() : null; } catch (e) { auth = null; }
    try { storage = firebase.storage ? firebase.storage() : null; if (storage && storage.setMaxUploadRetryTime) storage.setMaxUploadRetryTime(20000); } catch (e) { storage = null; }
  } catch (e) { console.error('Firebase init error', e); }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }

  /* ---------------- State ---------------- */
  var S = {
    started: false,
    orders: [], ordersLoaded: false,
    categories: [], products: [], catsLoaded: false, prodsLoaded: false,
    presence: [], analytics: {}, legacyPageTime: {},
    store: {}, theme: {},
    tab: 'overview',
    prodFilter: { cat: 'all', q: '', vis: 'all' },
    lastSeenOrders: 0
  };

  /* ---------------- Helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function tsMillis(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var t = Date.parse(v); return isFinite(t) ? t : 0; }
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return 0;
  }
  function fmtDate(ms, withTime) {
    if (!ms) return '—';
    var d = new Date(ms);
    var o = { day: 'numeric', month: 'short' };
    if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleString('ar-EG', o);
  }
  function fmtSecs(s) {
    s = Math.round(s || 0);
    if (!s) return '—';
    if (s < 60) return s + ' ثانية';
    var m = Math.floor(s / 60), r = s % 60;
    return m + ' د' + (r ? ' ' + r + ' ث' : '');
  }
  function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
  function commitOps(ops) {
    // ops: [{type:'set'|'update'|'delete', col, id, data, merge}]
    return chunk(ops, 400).reduce(function (p, part) {
      return p.then(function () {
        var b = db.batch();
        part.forEach(function (o) {
          var ref = db.collection(o.col).doc(o.id);
          if (o.type === 'delete') b.delete(ref);
          else if (o.type === 'update') b.update(ref, o.data);
          else b.set(ref, o.data, o.merge ? { merge: true } : undefined);
        });
        return b.commit();
      });
    }, Promise.resolve());
  }
  function errMsg(e) {
    var code = (e && e.code) || '';
    if (/permission/i.test(code) || /permission/i.test(e && e.message)) return 'مفيش صلاحية للكتابة في قاعدة البيانات (راجع Firestore Rules).';
    if (/unavailable|network|offline/i.test(code + (e && e.message))) return 'مفيش اتصال بالإنترنت أو Firebase مش متاح دلوقتي.';
    return (e && e.message) || 'خطأ غير معروف';
  }
  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    $('#toastWrap').appendChild(t);
    setTimeout(function () { t.remove(); }, type === 'error' ? 6000 : 3200);
  }
  function catById(id) { return S.categories.filter(function (c) { return c.id === id; })[0] || null; }
  function prodById(id) { return S.products.filter(function (p) { return p.id === id; })[0] || null; }
  function catPrice(id) { var c = catById(id); return c ? c.price : 0; }
  function effPrice(p) { return p.price || catPrice(p.categoryId); }
  function productsIn(catId) { return S.products.filter(function (p) { return p.categoryId === catId; }).sort(D.byOrder); }
  function img(ref, o) { return D.imgTag(ref, o); }
  function hydrate(root) { return D.hydrateMedia(root || document); }
  function orderTotal(o) {
    if (typeof o.total === 'number') return o.total;
    var sub = (o.items || []).reduce(function (s, i) { return s + num(i.price, 0) * num(i.qty, 1); }, 0);
    return sub + num(o.shipping, 0);
  }
  function orderItems(o) {
    if (Array.isArray(o.items) && o.items.length) return o.items;
    return o.product ? [{ name: o.product, qty: o.qty || 1, price: o.price || 0, img: o.img || '' }] : [];
  }
  function waCustomer(phone, text) {
    var d = D.toLatinDigits(phone || '').replace(/\D/g, '');
    if (d.indexOf('0') === 0) d = '2' + d;
    return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  /* ---------------- Modals / confirm ---------------- */
  var openModals = [];
  function openModal(id) { var m = $('#' + id); m.classList.add('open'); if (openModals.indexOf(id) === -1) openModals.push(id); document.body.style.overflow = 'hidden'; }
  function closeModal(id) {
    var m = $('#' + id); if (!m) return;
    m.classList.remove('open');
    openModals = openModals.filter(function (x) { return x !== id; });
    if (!openModals.length) document.body.style.overflow = '';
  }
  var confirmResolver = null;
  function askConfirm(o) {
    return new Promise(function (resolve) {
      $('#confirmTitle').textContent = o.title || 'تأكيد';
      $('#confirmText').textContent = o.text || '';
      var ok = $('#confirmOk');
      ok.textContent = o.okText || 'تأكيد';
      ok.classList.toggle('danger', !!o.danger);
      var wrap = $('#confirmTypeWrap'), input = $('#confirmTypeInput');
      wrap.hidden = !o.typeText;
      input.value = '';
      if (o.typeText) $('#confirmTypeLabel').textContent = 'اكتب "' + o.typeText + '" للتأكيد';
      confirmResolver = function (v) {
        if (v && o.typeText && input.value.trim() !== o.typeText) { input.classList.add('invalid'); input.focus(); return; }
        input.classList.remove('invalid');
        confirmResolver = null; closeModal('confirmModal'); resolve(v);
      };
      openModal('confirmModal');
      setTimeout(function () { (o.typeText ? input : ok).focus(); }, 50);
    });
  }

  /* ================= LOGIN ================= */
  function showDashboard(label) {
    $('#loginPage').style.display = 'none';
    $('#dashboard').classList.add('visible');
    $('#adminEmail').textContent = label || 'أدمن';
    startApp();
  }
  function doLogin(e) {
    if (e) e.preventDefault();
    var u = $('#loginEmail').value.trim(), p = $('#loginPass').value;
    var errEl = $('#loginError'), btn = $('#loginBtn');
    errEl.classList.remove('show');
    if (u === ADMIN_USERNAME && p === ADMIN_PASSWORD) {
      try { sessionStorage.setItem('sedra_admin_logged', '1'); } catch (x) {}
      if (auth) auth.signInWithEmailAndPassword(FIREBASE_ADMIN_EMAIL, ADMIN_PASSWORD).catch(function () {});
      return showDashboard('أدمن');
    }
    if (auth && u.indexOf('@') > -1) {
      btn.disabled = true; btn.textContent = 'جاري الدخول...';
      auth.signInWithEmailAndPassword(u, p).then(function (cred) {
        try { sessionStorage.setItem('sedra_admin_logged', '1'); } catch (x) {}
        showDashboard(cred.user.email);
      }).catch(function () { errEl.classList.add('show'); }).then(function () { btn.disabled = false; btn.textContent = 'دخول'; });
      return;
    }
    errEl.classList.add('show');
  }
  function logout() {
    try { sessionStorage.removeItem('sedra_admin_logged'); } catch (x) {}
    if (auth) auth.signOut().catch(function () {});
    location.reload();
  }

  /* ================= NAV ================= */
  function showTab(tab) {
    if (!TAB_TITLES[tab]) tab = 'overview';
    S.tab = tab;
    $$('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + tab); });
    $$('.nav-item[data-tab]').forEach(function (n) { n.classList.toggle('active', n.getAttribute('data-tab') === tab); });
    $('#pageTitle').textContent = TAB_TITLES[tab];
    if (history.replaceState) history.replaceState(null, '', '#' + tab);
    setSidebar(false);
    if (tab === 'orders') { S.lastSeenOrders = Date.now(); try { localStorage.setItem('sedra_admin_seen', String(S.lastSeenOrders)); } catch (e) {} updateNewBadge(); }
    if (tab === 'analytics') loadAnalytics();
    window.scrollTo(0, 0);
  }
  function setSidebar(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#sideOverlay').classList.toggle('open', open);
  }

  /* ================= START ================= */
  function startApp() {
    if (S.started) return;
    S.started = true;
    try { S.lastSeenOrders = parseInt(localStorage.getItem('sedra_admin_seen') || '0', 10) || 0; } catch (e) {}
    showTab((location.hash || '').replace('#', '') || 'overview');
    if (!db) {
      banner('تعذر الاتصال بـ Firebase. اتأكد من الإنترنت وحدّث الصفحة.');
      return;
    }
    ensureCatalog().then(function (migrated) {
      if (migrated) toast('✅ تم تجهيز الأصناف والمنتجات للنظام الجديد');
    }).catch(function (e) {
      console.error(e);
      toast('تعذر تجهيز الكتالوج: ' + errMsg(e), 'error');
    }).then(listenCatalog);
    listenOrders();
    listenPresence();
    loadSettings();
    loadAnalytics();
    renderImgModeStatus();
  }
  function banner(text) { var b = $('#connBanner'); b.textContent = text || ''; b.hidden = !text; }

  /* ================= CATALOG MIGRATION ================= */
  function ensureCatalog() {
    var metaRef = db.collection('meta').doc('catalog');
    return metaRef.get().then(function (meta) {
      var ver = meta.exists ? num((meta.data() || {}).version, 0) : 0;
      if (ver >= D.CONFIG.catalogVersion) return false;
      return (ver >= 2 ? Promise.resolve() : migrateV2()).then(migrateV3).then(function () { return true; });
    });
  }
  // v3: fill category details, banners and shipping zones (prices are never touched)
  function migrateV3() {
    return Promise.all([db.collection('categories').get(), db.collection('products').get(), db.collection('settings').doc('shipping').get()]).then(function (r) {
      var ops = [], cats = {};
      r[0].docs.forEach(function (d) { cats[d.id] = d.data() || {}; });
      D.SEED_CATEGORIES.forEach(function (sc) {
        var cur = cats[sc.id];
        if (!cur) return; // deleted on purpose: respect it
        var data = { shortName: sc.shortName, tagline: sc.tagline, description: sc.description, bestFor: sc.bestFor, chooser: sc.chooser, badge: sc.badge, specs: sc.specs };
        if (!cur.coverImg || /^images\/(product\d+_thumb|masnad\/\d+\/main|memory\/\d+)\.jpg$/.test(cur.coverImg)) data.coverImg = sc.coverImg;
        ops.push({ type: 'set', col: 'categories', id: sc.id, merge: true, data: data });
      });
      var m2 = r[1].docs.filter(function (d) { return d.id === 'memory-2'; })[0];
      if (m2 && (m2.data() || {}).name === 'ميموري فوم — أسود فحمي') ops.push({ type: 'update', col: 'products', id: 'memory-2', data: { name: 'ميموري فوم — رمادي', color: 'رمادي' } });
      if (!r[2].exists) {
        var sh = JSON.parse(JSON.stringify(D.SEED_SHIPPING)); sh.updatedAt = serverTs();
        ops.push({ type: 'set', col: 'settings', id: 'shipping', data: sh });
      }
      ops.push({ type: 'set', col: 'meta', id: 'catalog', merge: true, data: { version: 3, migratedAt: serverTs() } });
      return commitOps(ops);
    });
  }
  function migrateV2() {
    {
      return Promise.all([db.collection('categories').get(), db.collection('products').get()]).then(function (res) {
        var cats = res[0].docs.map(function (d) { return { id: d.id, data: d.data() || {} }; });
        var prods = res[1].docs.map(function (d) { return { id: d.id, data: d.data() || {} }; });
        var ops = [];
        var seedCatIds = D.SEED_CATEGORIES.map(function (c) { return c.id; });
        var seedProdIds = D.SEED_PRODUCTS.map(function (p) { return p.id; });
        var existingCatIds = cats.map(function (c) { return c.id; });
        var existingProdIds = prods.map(function (p) { return p.id; });
        var catMap = {}, legacyCatData = {};

        // 1) map legacy categories onto the 3 main categories by name
        cats.forEach(function (c) {
          if (seedCatIds.indexOf(c.id) > -1) return;
          var n = String(c.data.name || '');
          var target = /ميموري/.test(n) ? 'memory' : /مسند/.test(n) ? 'masnad' : /[اإ]سفنج|مبطن/.test(n) ? 'sponge' : null;
          var taken = target && (existingCatIds.indexOf(target) > -1 || Object.keys(catMap).some(function (k) { return catMap[k] === target; }));
          if (target && !taken) {
            catMap[c.id] = target; legacyCatData[target] = c.data;
            ops.push({ type: 'delete', col: 'categories', id: c.id });
          } else {
            var norm = D.normalizeCategory(c.id, c.data);
            ops.push({ type: 'set', col: 'categories', id: c.id, merge: true, data: {
              name: norm.name, icon: norm.icon, price: norm.price, cardRatio: norm.cardRatio, imageFit: norm.imageFit,
              specs: norm.specs, visible: norm.visible, order: isFinite(num(c.data.order, NaN)) ? num(c.data.order, 10) : 10 } });
          }
        });
        // 2) create missing main categories
        D.SEED_CATEGORIES.forEach(function (sc) {
          if (existingCatIds.indexOf(sc.id) > -1) return;
          var data = JSON.parse(JSON.stringify(sc)); delete data.id;
          var legacy = legacyCatData[sc.id];
          if (legacy) { if (legacy.visible === false) data.visible = false; }
          data.createdAt = serverTs();
          ops.push({ type: 'set', col: 'categories', id: sc.id, data: data });
        });
        // 3) products
        var usedSeed = {}, legacyCount = {};
        var seedPriceOf = function (catId) {
          var sc = D.SEED_CATEGORIES.filter(function (c) { return c.id === catId; })[0];
          if (sc) return sc.price;
          var ec = cats.filter(function (c) { return c.id === catId; })[0];
          return ec ? num(ec.data.price, 0) : 0;
        };
        prods.forEach(function (p) {
          if (seedProdIds.indexOf(p.id) > -1) { legacyCount[p.data.categoryId] = (legacyCount[p.data.categoryId] || 0) + 1; return; }
          var d = p.data;
          var newCat = catMap[d.categoryId] || d.categoryId || 'sponge';
          if (existingCatIds.indexOf(newCat) === -1 && seedCatIds.indexOf(newCat) === -1 && !catMap[d.categoryId]) newCat = 'sponge';
          var main = d.mainImg || d.imageUrl || d.img || '';
          var price = num(d.price, 0);
          var data = {
            categoryId: newCat, name: d.name || 'منتج', color: d.color || '', description: d.description || '',
            price: price && price !== seedPriceOf(newCat) ? price : null,
            oldPrice: num(d.oldPrice, 0) || null,
            mainImg: main, gallery: Array.isArray(d.gallery) ? d.gallery : [],
            order: isFinite(num(d.order, NaN)) ? num(d.order, 0) : 999, visible: d.visible !== false
          };
          legacyCount[newCat] = (legacyCount[newCat] || 0) + 1;
          var m = String(main).match(/images\/product(\d+)_thumb\.jpg$/);
          var seedId = m ? 'sponge-' + m[1] : null;
          if (newCat === 'sponge' && seedId && seedProdIds.indexOf(seedId) > -1 && existingProdIds.indexOf(seedId) === -1 && !usedSeed[seedId]) {
            usedSeed[seedId] = true;
            data.mainImg = 'images/product' + m[1] + '_thumb.jpg';
            data.createdAt = serverTs();
            ops.push({ type: 'set', col: 'products', id: seedId, data: data });
            ops.push({ type: 'delete', col: 'products', id: p.id });
          } else {
            ops.push({ type: 'set', col: 'products', id: p.id, merge: true, data: data });
          }
        });
        // 4) seed products only into categories that had no products
        D.SEED_PRODUCTS.forEach(function (sp) {
          if (existingProdIds.indexOf(sp.id) > -1 || usedSeed[sp.id] || legacyCount[sp.categoryId]) return;
          var data = JSON.parse(JSON.stringify(sp)); delete data.id;
          data.createdAt = serverTs();
          ops.push({ type: 'set', col: 'products', id: sp.id, data: data });
        });
        ops.push({ type: 'set', col: 'meta', id: 'catalog', data: { version: 2, migratedAt: serverTs() } });
        return commitOps(ops);
      });
    }
  }

  function restoreDefaults() {
    var missingCats = D.SEED_CATEGORIES.filter(function (c) { return !catById(c.id); });
    var missingProds = D.SEED_PRODUCTS.filter(function (p) { return !prodById(p.id); });
    if (!missingCats.length && !missingProds.length) return toast('كل الأصناف والمنتجات الأساسية موجودة بالفعل ✅');
    askConfirm({ title: 'رجوع الناقص', text: 'هيتضاف ' + missingCats.length + ' صنف و' + missingProds.length + ' منتج. مش هيتغير أي حاجة موجودة.', okText: 'رجّعهم' }).then(function (ok) {
      if (!ok) return;
      var ops = [];
      missingCats.forEach(function (c) { var d = JSON.parse(JSON.stringify(c)); delete d.id; d.order = S.categories.length + c.order; d.createdAt = serverTs(); ops.push({ type: 'set', col: 'categories', id: c.id, data: d }); });
      missingProds.forEach(function (p) { var d = JSON.parse(JSON.stringify(p)); delete d.id; d.createdAt = serverTs(); ops.push({ type: 'set', col: 'products', id: p.id, data: d }); });
      ops.push({ type: 'set', col: 'meta', id: 'catalog', merge: true, data: { version: D.CONFIG.catalogVersion } });
      commitOps(ops).then(function () { toast('✅ تم رجوع الناقص'); }).catch(function (e) { toast(errMsg(e), 'error'); });
    });
  }

  /* ================= LISTENERS ================= */
  function listenCatalog() {
    db.collection('categories').onSnapshot(function (snap) {
      S.categories = snap.docs.map(function (d) { return D.normalizeCategory(d.id, d.data()); }).sort(D.byOrder);
      S.catsLoaded = true; banner('');
      renderCatalogViews();
    }, function (e) { banner('تعذر تحميل الأصناف: ' + errMsg(e)); });
    db.collection('products').onSnapshot(function (snap) {
      S.products = snap.docs.map(function (d) { return D.normalizeProduct(d.id, d.data()); }).sort(D.byOrder);
      S.prodsLoaded = true;
      renderCatalogViews();
    }, function (e) { banner('تعذر تحميل المنتجات: ' + errMsg(e)); });
  }
  function listenOrders() {
    db.collection('orders').onSnapshot(function (snap) {
      S.orders = snap.docs.map(function (d) { var o = d.data() || {}; o.id = d.id; o._ts = tsMillis(o.createdAt); return o; })
        .sort(function (a, b) { return b._ts - a._ts; });
      S.ordersLoaded = true;
      renderOrders(); renderOverview(); updateNewBadge(); fillOrderFilters();
      if (S.tab === 'analytics') renderAnalytics();
    }, function (e) {
      banner('تعذر تحميل الأوردرات: ' + errMsg(e));
      $('#ordersTableBody').innerHTML = '<tr><td colspan="9"><div class="empty-state"><p>❌ ' + esc(errMsg(e)) + '</p></div></td></tr>';
    });
  }
  function listenPresence() {
    var cleaned = false;
    db.collection('presence').onSnapshot(function (snap) {
      S.presence = snap.docs.map(function (d) { var x = d.data() || {}; return { id: d.id, t: tsMillis(x.lastSeen) }; });
      renderOnline();
      if (!cleaned) {
        cleaned = true;
        var old = S.presence.filter(function (p) { return p.t && p.t < Date.now() - 86400000; }).slice(0, 400);
        if (old.length) commitOps(old.map(function (p) { return { type: 'delete', col: 'presence', id: p.id }; })).catch(function () {});
      }
    }, function () {});
    setInterval(renderOnline, 30000);
  }
  function renderOnline() {
    var n = S.presence.filter(function (p) { return p.t > Date.now() - 3 * 60000; }).length;
    $('#onlineCount').textContent = n;
  }
  function updateNewBadge() {
    var n = S.orders.filter(function (o) { return (o.status || 'جديد') === 'جديد' && o._ts > S.lastSeenOrders; }).length;
    var b = $('#navNewOrders');
    b.textContent = n; b.hidden = !n || S.tab === 'orders';
  }

  function renderCatalogViews() {
    if (!S.catsLoaded || !S.prodsLoaded) return;
    renderCategories(); renderProducts(); renderOverview(); fillOrderFilters();
    if (S.tab === 'analytics') renderAnalytics();
    if ($('#prodModal').classList.contains('open')) fillProdCategorySelect($('#pCategory').value);
  }

  /* ================= OVERVIEW ================= */
  function statusCount(st) { return S.orders.filter(function (o) { return (o.status || 'جديد') === st; }).length; }
  function renderOverview() {
    if (!S.ordersLoaded) return;
    var total = S.orders.length;
    var delivered = S.orders.filter(function (o) { return o.status === 'تم التسليم'; });
    var startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    var today = S.orders.filter(function (o) { return o._ts >= startToday.getTime(); });
    $('#statTotal').textContent = total;
    $('#statRevenue').textContent = money(delivered.reduce(function (s, o) { return s + orderTotal(o); }, 0));
    $('#statToday').textContent = today.length;
    $('#statTodayValue').textContent = money(today.reduce(function (s, o) { return s + orderTotal(o); }, 0));
    $('#statPending').textContent = statusCount('جديد') + statusCount('قيد التجهيز');
    $('#statShipped').textContent = statusCount('تم الشحن');
    $('#statDelivered').textContent = delivered.length;
    $('#statReturned').textContent = statusCount('مرتجع') + statusCount('ملغي');
    $('#statRate').textContent = total ? Math.round(delivered.length / total * 100) + '%' : '0%';

    $('#statusBars').innerHTML = STATUSES.map(function (st) {
      var n = statusCount(st), pct = total ? Math.round(n / total * 100) : 0;
      return '<div class="status-bar-row"><span class="status-bar-label">' + esc(st) + '</span><div class="status-bar-track"><div class="status-bar-fill" style="width:' + pct + '%"></div></div><span class="status-bar-count">' + n + '</span></div>';
    }).join('');

    $('#catSales').innerHTML = categorySalesHTML();
    $('#topDesignsOverview').innerHTML = topDesignsHTML(5);

    var att = [];
    var newOld = S.orders.filter(function (o) { return (o.status || 'جديد') === 'جديد' && o._ts && o._ts < Date.now() - 86400000; }).length;
    if (newOld) att.push(['⏰', newOld + ' أوردر "جديد" عدى عليهم أكتر من يوم', 'orders']);
    if (S.catsLoaded && S.prodsLoaded) {
      S.categories.forEach(function (c) {
        if (!c.price) att.push(['💰', 'الصنف "' + c.name + '" مالوش سعر', 'categories']);
        if (c.visible && !productsIn(c.id).some(function (p) { return p.visible; })) att.push(['📂', 'الصنف "' + c.name + '" ظاهر بس مفيهوش منتجات ظاهرة', 'products']);
      });
      var noImg = S.products.filter(function (p) { return !p.mainImg; }).length;
      if (noImg) att.push(['🖼️', noImg + ' منتج من غير صورة', 'products']);
      var orphan = S.products.filter(function (p) { return !catById(p.categoryId); }).length;
      if (orphan) att.push(['⚠️', orphan + ' منتج مش تابع لأي صنف موجود (مش هيظهر للعملاء)', 'products']);
    }
    $('#attentionList').innerHTML = att.length ? att.map(function (a) {
      return '<div class="attn-item"><span>' + a[0] + '</span><span>' + esc(a[1]) + '</span><button class="btn-ghost" type="button" data-goto="' + a[2] + '">افتح</button></div>';
    }).join('') : '<div class="empty-state"><p>✅ كله تمام</p></div>';

    var recent = S.orders.slice(0, 6);
    $('#recentOrdersBody').innerHTML = recent.length ? recent.map(function (o) {
      var st = o.status || 'جديد';
      return '<tr data-order-row="' + esc(o.id) + '" style="cursor:pointer"><td><span class="o-code">' + esc(o.orderCode || '—') + '</span></td>' +
        '<td><div class="o-name">' + esc(o.name) + '</div><span class="o-phone">' + esc(o.phone) + '</span></td>' +
        '<td>' + orderItemsHTML(o, true) + '</td><td>' + esc(o.governorate || '—') + '</td>' +
        '<td class="o-total">' + money(orderTotal(o)) + '</td>' +
        '<td><span class="status-badge ' + (STATUS_CLASS[st] || '') + '">' + esc(st) + '</span></td><td class="o-date">' + fmtDate(o._ts, true) + '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty-state"><p>لسه مفيش أوردرات</p></div></td></tr>';
    hydrate($('#recentOrdersBody'));
    hydrate($('#topDesignsOverview'));
  }

  function aggregateDesigns(orders) {
    var map = {};
    (orders || S.orders).forEach(function (o) {
      if (o.status === 'ملغي') return;
      orderItems(o).forEach(function (i) {
        var key = i.productId || i.name;
        if (!map[key]) map[key] = { name: i.name, cat: i.categoryName || '', img: i.img, qty: 0, revenue: 0, productId: i.productId };
        map[key].qty += num(i.qty, 1);
        map[key].revenue += num(i.price, 0) * num(i.qty, 1);
      });
    });
    return Object.keys(map).map(function (k) {
      var x = map[k], p = x.productId ? prodById(x.productId) : null;
      if (p) { x.img = p.mainImg || x.img; x.name = p.name; }
      return x;
    }).sort(function (a, b) { return b.qty - a.qty; });
  }
  function topDesignsHTML(limit) {
    var list = aggregateDesigns().slice(0, limit);
    if (!list.length) return '<div class="empty-state"><p>مفيش بيانات لسه</p></div>';
    return list.map(function (d, i) {
      return '<div class="design-rank-row"><span class="design-rank-num">' + (i + 1) + '</span>' +
        '<div class="design-rank-img" data-zoom="' + esc(d.img || '') + '">' + img(d.img, { alt: d.name, variant: 't' }) + '</div>' +
        '<span class="design-rank-name">' + esc(d.name) + (d.cat ? '<br><small style="color:var(--gold-dark)">' + esc(d.cat) + '</small>' : '') + '</span>' +
        '<span class="design-rank-count">' + d.qty + ' قطعة</span></div>';
    }).join('');
  }
  function categorySalesHTML() {
    var map = {};
    S.orders.forEach(function (o) {
      if (o.status === 'ملغي' || o.status === 'مرتجع') return;
      orderItems(o).forEach(function (i) {
        var p = i.productId ? prodById(i.productId) : null;
        var cid = i.categoryId || (p && p.categoryId) || '_';
        var c = catById(cid);
        var name = (c && c.name) || i.categoryName || 'غير محدد';
        if (!map[cid]) map[cid] = { name: name, qty: 0, revenue: 0 };
        map[cid].qty += num(i.qty, 1); map[cid].revenue += num(i.price, 0) * num(i.qty, 1);
      });
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.revenue - a.revenue; });
    if (!rows.length) return '<div class="empty-state"><p>مفيش مبيعات لسه</p></div>';
    var max = rows[0].revenue || 1;
    return rows.map(function (r) {
      return '<div class="sales-row"><b>' + esc(r.name) + '</b><span>' + r.qty + ' قطعة · ' + money(r.revenue) + '</span><div class="sales-bar"><i style="width:' + Math.round(r.revenue / max * 100) + '%"></i></div></div>';
    }).join('');
  }

  /* ================= ORDERS ================= */
  function orderItemsHTML(o, compact) {
    var items = orderItems(o);
    var shown = compact ? items.slice(0, 2) : items;
    return '<div class="o-items">' + shown.map(function (i) {
      return '<div class="o-item"><div class="thumb" data-zoom="' + esc(i.img || '') + '">' + img(i.img, { alt: '', variant: 't' }) + '</div>' +
        '<div>' + (i.categoryName ? '<small>' + esc(i.categoryName) + '</small>' : '') + esc(i.name) + ' <b>×' + esc(i.qty || 1) + '</b></div></div>';
    }).join('') + (compact && items.length > 2 ? '<small class="muted">+ ' + (items.length - 2) + ' كمان</small>' : '') + '</div>';
  }
  function fillOrderFilters() {
    var sf = $('#statusFilter'), cur = sf.value;
    if (sf.options.length <= 1) {
      STATUSES.forEach(function (s) { var o = document.createElement('option'); o.value = s; o.textContent = s; sf.appendChild(o); });
      sf.value = cur;
    }
    var cf = $('#orderCatFilter'), cc = cf.value;
    cf.innerHTML = '<option value="">كل الأصناف</option>' + S.categories.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    cf.value = cc;
  }
  function filteredOrders() {
    var q = D.toLatinDigits($('#orderSearch').value.trim().toLowerCase());
    var st = $('#statusFilter').value, cf = $('#orderCatFilter').value;
    return S.orders.filter(function (o) {
      if (st && (o.status || 'جديد') !== st) return false;
      if (cf && !orderItems(o).some(function (i) { var p = i.productId ? prodById(i.productId) : null; return (i.categoryId || (p && p.categoryId)) === cf; })) return false;
      if (!q) return true;
      return [o.name, o.phone, o.phone2, o.orderCode, o.governorate, o.city].some(function (v) { return String(v || '').toLowerCase().indexOf(q) > -1; });
    });
  }
  function renderOrders() {
    if (!S.ordersLoaded) return;
    var list = filteredOrders();
    $('#ordersCount').textContent = '(' + list.length + (list.length !== S.orders.length ? ' من ' + S.orders.length : '') + ')';
    var body = $('#ordersTableBody');
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="9"><div class="empty-state"><p>' + (S.orders.length ? 'مفيش نتائج للبحث ده' : 'لسه مفيش أوردرات') + '</p></div></td></tr>';
      return;
    }
    body.innerHTML = list.map(function (o) {
      var st = o.status || 'جديد';
      return '<tr>' +
        '<td><span class="o-code">' + esc(o.orderCode || '—') + '</span></td>' +
        '<td><div class="o-name">' + esc(o.name) + '</div><span class="o-phone">' + esc(o.phone) + '</span></td>' +
        '<td>' + orderItemsHTML(o, false) + '</td>' +
        '<td style="min-width:150px;font-size:12px;line-height:1.6"><b>' + esc(o.governorate || '') + '</b>' + (o.city ? ' — ' + esc(o.city) : '') + '<br>' + esc(o.address || '') + '</td>' +
        '<td class="o-total">' + money(orderTotal(o)) + '</td>' +
        '<td style="font-size:12px">' + esc(o.paymentMethod || '—') + '</td>' +
        '<td><select class="status-select" data-status="' + esc(o.id) + '">' + STATUSES.map(function (s) { return '<option' + (s === st ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></td>' +
        '<td class="o-date">' + fmtDate(o._ts, true) + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-action" type="button" data-act="order-detail" data-id="' + esc(o.id) + '">📋 تفاصيل</button>' +
          '<a class="icon-action" target="_blank" rel="noopener" href="' + esc(waCustomer(o.phone, 'أهلاً ' + (o.name || '') + '، معاك سيدرا ستور بخصوص طلبك رقم ' + (o.orderCode || ''))) + '">💬</a>' +
          '<button class="icon-action danger" type="button" data-act="order-delete" data-id="' + esc(o.id) + '" title="حذف">🗑️</button>' +
        '</div></td></tr>';
    }).join('');
    hydrate(body);
  }
  function changeStatus(id, status) {
    db.collection('orders').doc(id).update({ status: status, statusUpdatedAt: serverTs() })
      .then(function () { toast('✅ الحالة بقت: ' + status); })
      .catch(function (e) { toast('تعذر تغيير الحالة: ' + errMsg(e), 'error'); renderOrders(); });
  }
  function deleteOrder(id) {
    var o = S.orders.filter(function (x) { return x.id === id; })[0];
    askConfirm({ title: 'حذف أوردر', text: 'هتحذف أوردر ' + (o ? (o.orderCode || '') + ' — ' + (o.name || '') : '') + ' نهائياً؟', okText: '🗑️ حذف', danger: true }).then(function (ok) {
      if (!ok) return;
      db.collection('orders').doc(id).delete().then(function () { toast('تم حذف الأوردر'); closeModal('detailModal'); }).catch(function (e) { toast(errMsg(e), 'error'); });
    });
  }
  function showOrderDetail(id) {
    var o = S.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var st = o.status || 'جديد';
    $('#detailTitle').textContent = 'أوردر ' + (o.orderCode || '');
    var field = function (label, val, ltr) { return val ? '<div class="detail-item"><label>' + esc(label) + '</label><span' + (ltr ? ' dir="ltr"' : '') + '>' + esc(val) + '</span></div>' : ''; };
    $('#detailGrid').innerHTML =
      field('العميل', o.name) + field('الموبايل', o.phone, true) + field('موبايل تاني', o.phone2, true) +
      field('المحافظة', o.governorate) + field('المدينة', o.city) + field('العنوان', o.address) +
      field('ملاحظات', o.notes) + field('الدفع', o.paymentMethod) + field('منطقة الشحن', o.shippingZone) + field('الجهاز', o.deviceType) +
      field('التاريخ', fmtDate(o._ts, true)) + field('الحالة', st) +
      (o.gps ? '<div class="detail-item"><label>الموقع</label><span><a href="' + esc(/^https:\/\//.test(o.gps) ? o.gps : '#') + '" target="_blank" rel="noopener">📍 فتح الخريطة</a></span></div>' : '');
    $('#detailProductsList').innerHTML = orderItems(o).map(function (i) {
      return '<div class="detail-product-row"><div class="design-rank-img" data-zoom="' + esc(i.img || '') + '" style="width:56px;height:56px">' + img(i.img, { variant: 't' }) + '</div>' +
        '<div class="detail-product-info"><div class="detail-product-name">' + (i.categoryName ? '<small style="color:var(--gold-dark);display:block">' + esc(i.categoryName) + '</small>' : '') + esc(i.name) + '</div>' +
        '<div class="detail-product-qty">الكمية: ' + esc(i.qty || 1) + ' × ' + money(i.price) + '</div></div>' +
        '<div class="detail-product-price">' + money(num(i.price, 0) * num(i.qty, 1)) + '</div></div>';
    }).join('');
    var sub = typeof o.subtotal === 'number' ? o.subtotal : orderTotal(o) - num(o.shipping, 0);
    $('#detailTotals').innerHTML = '<div class="detail-totals"><div><span>المنتجات</span><span>' + money(sub) + '</span></div><div><span>الشحن</span><span>' + money(o.shipping || 0) + '</span></div><div class="grand"><span>الإجمالي</span><span>' + money(orderTotal(o)) + '</span></div></div>';
    $('#detailActions').innerHTML =
      '<a class="btn-ghost" target="_blank" rel="noopener" href="' + esc(waCustomer(o.phone, 'أهلاً ' + (o.name || '') + '، معاك سيدرا ستور بخصوص طلبك رقم ' + (o.orderCode || ''))) + '">💬 واتساب العميل</a>' +
      '<a class="btn-ghost" href="tel:' + esc(o.phone) + '">📞 اتصال</a>' +
      '<button class="btn-ghost" type="button" data-act="copy-order" data-id="' + esc(o.id) + '">📄 نسخ بيانات الشحن</button>' +
      '<button class="icon-action danger" type="button" data-act="order-delete" data-id="' + esc(o.id) + '">🗑️ حذف</button>';
    openModal('detailModal');
    hydrate($('#detailModal'));
  }
  function copyOrder(id) {
    var o = S.orders.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    var text = [o.orderCode, o.name, o.phone, o.phone2, (o.governorate || '') + ' — ' + (o.city || ''), o.address,
      orderItems(o).map(function (i) { return (i.categoryName ? i.categoryName + ' — ' : '') + i.name + ' × ' + (i.qty || 1); }).join('\n'),
      'الإجمالي: ' + orderTotal(o) + ' ج', o.notes ? 'ملاحظات: ' + o.notes : ''].filter(Boolean).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('✅ اتنسخ'); }).catch(function () { window.prompt('انسخ البيانات:', text); });
  }
  function exportCsv() {
    var list = filteredOrders();
    if (!list.length) return toast('مفيش أوردرات للتصدير', 'warn');
    var cols = ['الكود', 'التاريخ', 'الاسم', 'الموبايل', 'موبايل تاني', 'المحافظة', 'المدينة', 'العنوان', 'المنتجات', 'عدد القطع', 'المنتجات (ج)', 'الشحن', 'منطقة الشحن', 'الإجمالي', 'الدفع', 'الحالة', 'ملاحظات', 'الموقع'];
    var cell = function (v) { v = String(v == null ? '' : v); return '"' + v.replace(/"/g, '""') + '"'; };
    var rows = list.map(function (o) {
      var items = orderItems(o);
      return [o.orderCode, new Date(o._ts || Date.now()).toLocaleString('ar-EG'), o.name, o.phone, o.phone2, o.governorate, o.city, o.address,
        items.map(function (i) { return (i.categoryName ? i.categoryName + ' - ' : '') + i.name + ' x' + (i.qty || 1); }).join(' | '),
        items.reduce(function (s, i) { return s + num(i.qty, 1); }, 0),
        typeof o.subtotal === 'number' ? o.subtotal : orderTotal(o) - num(o.shipping, 0), o.shipping || 0, o.shippingZone || '', orderTotal(o),
        o.paymentMethod, o.status || 'جديد', o.notes, o.gps].map(cell).join(',');
    });
    var blob = new Blob(['\ufeff' + cols.map(cell).join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sedra-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ================= CATEGORIES ================= */
  function renderCategories() {
    var list = $('#catsList');
    $('#catsCount').textContent = '(' + S.categories.length + ')';
    if (!S.categories.length) { list.innerHTML = '<div class="empty-state"><p>مفيش أصناف. دوس "إضافة صنف".</p></div>'; return; }
    list.innerHTML = S.categories.map(function (c, idx) {
      var prods = productsIn(c.id), vis = prods.filter(function (p) { return p.visible; }).length;
      var cover = c.coverImg || (prods[0] && prods[0].mainImg) || '';
      var ratioLabel = (RATIOS.filter(function (r) { return r.v === c.cardRatio; })[0] || { label: c.cardRatio }).label;
      return '<div class="cat-row' + (c.visible ? '' : ' is-hidden') + '">' +
        '<div class="cat-thumb">' + img(cover, { alt: c.name, variant: 't' }) + '</div>' +
        '<div><div class="cat-title">' + esc(c.icon) + ' ' + esc(c.name) + (c.visible ? '' : ' <span class="tag red">مخفي</span>') + '</div>' +
          '<div class="cat-meta"><span class="tag gold">' + (c.price ? money(c.price) : '⚠️ مالوش سعر') + '</span>' +
          (c.oldPrice ? '<span class="tag">قبل الخصم ' + money(c.oldPrice) + '</span>' : '') +
          '<span class="tag">' + prods.length + ' منتج' + (vis !== prods.length ? ' (' + vis + ' ظاهر)' : '') + '</span>' +
          '<span class="tag">كارت ' + esc(ratioLabel) + '</span><span class="tag">الرابط: <bdi dir="ltr">' + esc(c.id) + '</bdi></span></div></div>' +
        '<div class="cat-actions">' +
          '<button class="icon-action" type="button" data-act="edit-cat" data-id="' + esc(c.id) + '">✏️ تعديل</button>' +
          '<button class="icon-action" type="button" data-act="cat-products" data-id="' + esc(c.id) + '">🖼️ المنتجات</button>' +
          '<button class="icon-action" type="button" data-act="toggle-cat" data-id="' + esc(c.id) + '">' + (c.visible ? '🙈 إخفاء' : '👁️ إظهار') + '</button>' +
          '<button class="icon-action" type="button" data-act="move-cat" data-dir="-1" data-id="' + esc(c.id) + '" title="تقديم"' + (idx === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="icon-action" type="button" data-act="move-cat" data-dir="1" data-id="' + esc(c.id) + '" title="تأخير"' + (idx === S.categories.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<a class="icon-action" target="_blank" rel="noopener" href="category.html?c=' + encodeURIComponent(c.id) + '">🔗 فتح</a>' +
          '<button class="icon-action danger" type="button" data-act="del-cat" data-id="' + esc(c.id) + '">🗑️</button>' +
        '</div></div>';
    }).join('');
    hydrate(list);
  }

  function reorder(list, id, dir, col) {
    var i = list.map(function (x) { return x.id; }).indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var arr = list.slice(); var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    var ops = arr.map(function (x, k) { return { type: 'update', col: col, id: x.id, data: { order: k } }; }).filter(function (op, k) { return arr[k].order !== k; });
    return commitOps(ops).catch(function (e) { toast('تعذر تغيير الترتيب: ' + errMsg(e), 'error'); });
  }
  function toggleVisible(col, id, cur) {
    return db.collection(col).doc(id).update({ visible: !cur, updatedAt: serverTs() })
      .then(function () { toast(!cur ? '👁️ بقى ظاهر للعملاء' : '🙈 اتخفى من الموقع'); })
      .catch(function (e) { toast(errMsg(e), 'error'); });
  }

  /* ---- Category editor ---- */
  var CM = { id: null, cover: '', uploads: [], originalCover: '', busy: false };
  function renderRatioOptions(sel) {
    $('#cRatioOptions').innerHTML = RATIOS.map(function (r) {
      var p = r.v.split('/'), w = Math.round(30 * p[0] / p[1]);
      return '<button type="button" class="ratio-opt' + (r.v === sel ? ' active' : '') + '" data-ratio="' + r.v + '"><i style="width:' + w + 'px"></i>' + r.label + '<small dir="ltr">' + r.v.replace('/', ':') + '</small></button>';
    }).join('');
  }
  function selectedRatio() { var a = $('#cRatioOptions .ratio-opt.active'); return a ? a.getAttribute('data-ratio') : '1/1'; }
  function updateCatPreview() {
    var box = $('#cPreviewImg');
    box.style.setProperty('--ratio', selectedRatio());
    box.style.setProperty('--fit', $('#cFit').value);
    var prods = CM.id ? productsIn(CM.id) : [];
    var ref = (prods[0] && prods[0].mainImg) || CM.cover;
    box.innerHTML = ref ? img(ref, { variant: 't' }) : '';
    $('#cPreviewPrice').textContent = money(num($('#cPrice').value, 0));
    hydrate(box);
  }
  function renderCover() {
    $('#cCoverThumb').innerHTML = CM.cover ? img(CM.cover, { variant: 't' }) : 'مفيش صورة<br>(هيستخدم أول منتج)';
    $('#cCoverClear').style.display = CM.cover ? '' : 'none';
    hydrate($('#cCoverThumb'));
    updateCatPreview();
  }
  function specRowHTML(sp) {
    return '<div class="spec-edit-row"><input type="text" class="spec-label-in" maxlength="40" placeholder="مثال: السماكة" value="' + esc(sp.label || '') + '">' +
      '<input type="text" class="spec-value-in" maxlength="80" placeholder="مثال: 2 سم" value="' + esc(sp.value || '') + '">' +
      '<div class="row-tools"><button type="button" data-spec="up" title="تقديم">↑</button><button type="button" data-spec="down" title="تأخير">↓</button><button type="button" data-spec="del" title="حذف">✕</button></div></div>';
  }
  function readSpecs() {
    return $$('#cSpecs .spec-edit-row').map(function (r) {
      return { label: r.querySelector('.spec-label-in').value.trim(), value: r.querySelector('.spec-value-in').value.trim() };
    }).filter(function (s) { return s.label || s.value; });
  }
  function openCatEditor(id) {
    var c = id ? catById(id) : null;
    if (id && !c) return toast('الصنف مش موجود', 'error');
    CM = { id: id || null, cover: c ? c.coverImg : '', originalCover: c ? c.coverImg : '', uploads: [], busy: false };
    $('#catModalTitle').textContent = c ? 'تعديل صنف: ' + c.name : 'إضافة صنف جديد';
    $('#cName').value = c ? c.name : '';
    $('#cShort').value = c ? c.shortName : '';
    $('#cIcon').value = c ? c.icon : '🕌';
    $('#cTagline').value = c ? c.tagline : '';
    $('#cDesc').value = c ? c.description : '';
    $('#cBestFor').value = c ? c.bestFor : '';
    $('#cChooser').value = c ? c.chooser : '';
    $('#cPrice').value = c && c.price ? c.price : '';
    $('#cOldPrice').value = c && c.oldPrice ? c.oldPrice : '';
    $('#cBadge').value = c ? c.badge : '';
    $('#cFit').value = c ? c.imageFit : 'contain';
    $('#cVisible').checked = c ? c.visible : true;
    $('#cId').value = c ? c.id : '';
    $('#cId').disabled = !!c;
    $('#cIdHint').textContent = c ? 'رابط الصنف ثابت: category.html?c=' + c.id : 'لو سبته فاضي هيتعمل تلقائي.';
    $('#cCoverUrl').value = ''; $('#cCoverStatus').textContent = ''; $('#cDetectHint').textContent = '';
    $('#cDetectRatio').style.display = c && productsIn(c.id).length ? '' : 'none';
    renderRatioOptions(c ? c.cardRatio : '1/1');
    $('#cSpecs').innerHTML = (c && c.specs.length ? c.specs : [{ label: '', value: '' }]).map(specRowHTML).join('');
    setFormError('catFormError', '');
    $$('#catForm .invalid').forEach(function (x) { x.classList.remove('invalid'); });
    renderCover();
    openModal('catModal');
    setTimeout(function () { $('#cName').focus(); }, 60);
  }
  function setFormError(id, msg) { var el = $('#' + id); el.textContent = msg; el.classList.toggle('show', !!msg); }
  function saveCategory(e) {
    e.preventDefault();
    if (CM.busy) return;
    $$('#catForm .invalid').forEach(function (x) { x.classList.remove('invalid'); });
    var name = $('#cName').value.trim(), price = num($('#cPrice').value, 0), old = num($('#cOldPrice').value, 0);
    var errs = [];
    if (name.length < 2) { errs.push('اكتب اسم الصنف'); $('#cName').classList.add('invalid'); }
    if (!(price > 0)) { errs.push('اكتب سعر الصنف'); $('#cPrice').classList.add('invalid'); }
    if (old && old <= price) { errs.push('السعر قبل الخصم لازم يكون أكبر من السعر'); $('#cOldPrice').classList.add('invalid'); }
    var id = CM.id;
    if (!id) {
      id = $('#cId').value.trim().toLowerCase();
      if (id && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) { errs.push('رابط الصنف: حروف إنجليزي صغيرة وأرقام و - بس'); $('#cId').classList.add('invalid'); }
      if (!id) id = 'cat-' + D.randomId(6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
      if (catById(id)) { errs.push('فيه صنف تاني بنفس الرابط'); $('#cId').classList.add('invalid'); }
    }
    if (errs.length) return setFormError('catFormError', errs.join(' — '));
    setFormError('catFormError', '');
    var data = {
      name: name, shortName: $('#cShort').value.trim(), icon: $('#cIcon').value.trim() || '🕌',
      tagline: $('#cTagline').value.trim(), description: $('#cDesc').value.trim(),
      bestFor: $('#cBestFor').value.trim(), chooser: $('#cChooser').value.trim(),
      price: Math.round(price), oldPrice: old ? Math.round(old) : null, badge: $('#cBadge').value.trim(),
      cardRatio: selectedRatio(), imageFit: $('#cFit').value === 'cover' ? 'cover' : 'contain',
      coverImg: CM.cover || '', specs: readSpecs(), visible: $('#cVisible').checked, updatedAt: serverTs()
    };
    if (!CM.id) { data.order = S.categories.reduce(function (m, c) { return Math.max(m, c.order); }, -1) + 1; data.createdAt = serverTs(); }
    CM.busy = true;
    var btn = $('#catSaveBtn'); btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
    db.collection('categories').doc(id).set(data, { merge: true }).then(function () {
      var removed = CM.originalCover && CM.originalCover !== CM.cover ? [CM.originalCover] : [];
      var unusedUploads = CM.uploads.filter(function (r) { return r !== CM.cover; });
      cleanupMedia(removed.concat(unusedUploads), { skipCategory: id });
      CM.uploads = [];
      closeModal('catModal');
      toast(CM.id ? '✅ تم حفظ التعديلات' : '✅ تم إضافة الصنف');
    }).catch(function (err) { setFormError('catFormError', 'تعذر الحفظ: ' + errMsg(err)); })
      .then(function () { CM.busy = false; btn.disabled = false; btn.textContent = '💾 حفظ الصنف'; });
  }
  function cancelCatEditor() {
    if (CM.uploads.length) cleanupMedia(CM.uploads.filter(function (r) { return r !== CM.originalCover; }));
    CM.uploads = [];
    closeModal('catModal');
  }
  function detectRatio() {
    var prods = CM.id ? productsIn(CM.id).filter(function (p) { return p.mainImg; }).slice(0, 12) : [];
    if (!prods.length) return;
    $('#cDetectHint').textContent = '⏳ بقيس الصور...';
    Promise.all(prods.map(function (p) { return imageSize(p.mainImg); })).then(function (sizes) {
      var rs = sizes.filter(Boolean).map(function (s) { return s.w / s.h; }).sort(function (a, b) { return a - b; });
      if (!rs.length) { $('#cDetectHint').textContent = 'تعذر قراءة الصور'; return; }
      var median = rs[Math.floor(rs.length / 2)];
      var best = RATIOS.slice().sort(function (a, b) {
        var pa = a.v.split('/'), pb = b.v.split('/');
        return Math.abs(Math.log(pa[0] / pa[1] / median)) - Math.abs(Math.log(pb[0] / pb[1] / median));
      })[0];
      renderRatioOptions(best.v);
      updateCatPreview();
      $('#cDetectHint').textContent = '✅ اتظبط على "' + best.label + '" (متوسط مقاس الصور ' + median.toFixed(2) + ')';
    });
  }
  function imageSize(ref) {
    return new Promise(function (resolve) {
      var box = document.createElement('div');
      box.innerHTML = img(ref, { variant: 'f' });
      hydrate(box).then(function () {
        var im = new Image();
        im.onload = function () { resolve({ w: im.naturalWidth, h: im.naturalHeight }); };
        im.onerror = function () { resolve(null); };
        im.src = box.querySelector('img').src;
        if (im.src === D.BLANK) resolve(null);
      });
    });
  }

  /* ---- Delete category ---- */
  var delCatId = null;
  function openDeleteCat(id) {
    var c = catById(id); if (!c) return;
    delCatId = id;
    var prods = productsIn(id);
    var others = S.categories.filter(function (x) { return x.id !== id; });
    $('#catDeleteText').textContent = prods.length
      ? 'الصنف "' + c.name + '" فيه ' + prods.length + ' منتج. تحب تعمل إيه في المنتجات؟'
      : 'هتحذف الصنف "' + c.name + '" نهائياً؟ (مفيهوش منتجات)';
    $('#catDeleteOptions').style.display = prods.length ? '' : 'none';
    $('#catDeleteMoveTo').innerHTML = others.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('');
    var move = $('input[name="catDelMode"][value="move"]');
    move.disabled = !others.length;
    move.checked = !!others.length;
    $('input[name="catDelMode"][value="delete"]').checked = !others.length;
    $('#catDeleteMoveTo').disabled = !others.length;
    setFormError('catDeleteError', '');
    openModal('catDeleteModal');
  }
  function confirmDeleteCat() {
    var id = delCatId, c = catById(id); if (!c) return closeModal('catDeleteModal');
    var prods = productsIn(id);
    var mode = ($('input[name="catDelMode"]:checked') || {}).value || 'delete';
    var ops = [{ type: 'delete', col: 'categories', id: id }];
    var mediaToClean = c.coverImg ? [c.coverImg] : [];
    if (prods.length && mode === 'move') {
      var to = $('#catDeleteMoveTo').value;
      if (!catById(to)) return setFormError('catDeleteError', 'اختار الصنف اللي هتنقل له');
      var base = productsIn(to).reduce(function (m, p) { return Math.max(m, p.order); }, -1) + 1;
      prods.forEach(function (p, i) { ops.push({ type: 'update', col: 'products', id: p.id, data: { categoryId: to, order: base + i } }); });
    } else {
      prods.forEach(function (p) { ops.push({ type: 'delete', col: 'products', id: p.id }); mediaToClean = mediaToClean.concat(D.productImages(p)); });
    }
    var btn = $('#catDeleteConfirm'); btn.disabled = true;
    commitOps(ops).then(function () {
      cleanupMedia(mediaToClean, { skipCategory: id, skipProducts: mode === 'move' ? [] : prods.map(function (p) { return p.id; }) });
      closeModal('catDeleteModal');
      toast('🗑️ تم حذف الصنف' + (prods.length ? (mode === 'move' ? ' ونقل منتجاته' : ' ومنتجاته') : ''));
      if (S.prodFilter.cat === id) S.prodFilter.cat = 'all';
    }).catch(function (e) { setFormError('catDeleteError', errMsg(e)); }).then(function () { btn.disabled = false; });
  }

  /* ================= PRODUCTS ================= */
  function renderProducts() {
    var grid = $('#productsAdminGrid');
    var f = S.prodFilter;
    if (f.cat !== 'all' && f.cat !== '_orphan' && !catById(f.cat)) f.cat = 'all';
    var orphans = S.products.filter(function (p) { return !catById(p.categoryId); });
    $('#prodCatChips').innerHTML =
      '<button type="button" class="chip' + (f.cat === 'all' ? ' active' : '') + '" data-chip="all">الكل<b>' + S.products.length + '</b></button>' +
      S.categories.map(function (c) {
        return '<button type="button" class="chip' + (f.cat === c.id ? ' active' : '') + '" data-chip="' + esc(c.id) + '">' + esc(c.icon) + ' ' + esc(c.name) + '<b>' + productsIn(c.id).length + '</b></button>';
      }).join('') +
      (orphans.length ? '<button type="button" class="chip' + (f.cat === '_orphan' ? ' active' : '') + '" data-chip="_orphan">⚠️ بدون صنف<b>' + orphans.length + '</b></button>' : '');

    var q = f.q.trim().toLowerCase();
    var list = S.products.filter(function (p) {
      if (f.cat === '_orphan') { if (catById(p.categoryId)) return false; }
      else if (f.cat !== 'all' && p.categoryId !== f.cat) return false;
      if (f.vis === 'visible' && !p.visible) return false;
      if (f.vis === 'hidden' && p.visible) return false;
      if (q && (p.name + ' ' + p.color).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (f.cat === 'all') {
      var catOrder = {}; S.categories.forEach(function (c, i) { catOrder[c.id] = i; });
      list.sort(function (a, b) { return ((catOrder[a.categoryId] == null ? 999 : catOrder[a.categoryId]) - (catOrder[b.categoryId] == null ? 999 : catOrder[b.categoryId])) || D.byOrder(a, b); });
    }
    var canReorder = f.cat !== 'all' && f.cat !== '_orphan' && !q && f.vis === 'all';
    $('#reorderHint').hidden = canReorder || S.products.length < 2;
    $('#prodsCount').textContent = '(' + list.length + (list.length !== S.products.length ? ' من ' + S.products.length : '') + ')';

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>' + (S.products.length ? 'مفيش منتجات بالفلتر ده' : 'مفيش منتجات لسه') + '</p></div>';
      return;
    }
    grid.innerHTML = list.map(function (p, idx) {
      var c = catById(p.categoryId);
      var n = D.productImages(p).length;
      return '<div class="pa-card' + (p.visible ? '' : ' is-hidden') + '">' +
        '<div class="pa-img" data-zoom="' + esc(p.mainImg) + '" style="--ratio:' + (c ? c.cardRatio : '1/1') + ';--fit:' + (c ? c.imageFit : 'contain') + '">' + img(p.mainImg, { alt: p.name, variant: 't' }) +
          '<div class="pa-flag">' + (p.visible ? '' : '<span class="tag red">مخفي</span>') + (c && !c.visible ? '<span class="tag red">الصنف مخفي</span>' : '') + (!c ? '<span class="tag red">بدون صنف</span>' : '') + (p.mainImg ? '' : '<span class="tag red">بدون صورة</span>') + '</div>' +
          (n > 1 ? '<span class="pa-count">📷 ' + n + '</span>' : '') + '</div>' +
        '<div class="pa-body">' +
          '<div class="pa-cat">' + (c ? esc(c.icon) + ' ' + esc(c.name) : '⚠️ صنف غير موجود') + '</div>' +
          '<div class="pa-name">' + esc(p.name) + '</div>' +
          (p.color ? '<div class="pa-meta">' + esc(p.color) + '</div>' : '') +
          '<div class="pa-price">' + money(effPrice(p)) + '<small>' + (p.price ? 'سعر خاص' : 'سعر الصنف') + '</small></div>' +
          '<div class="pa-actions">' +
            '<button class="icon-action" type="button" data-act="edit-prod" data-id="' + esc(p.id) + '">✏️ تعديل</button>' +
            '<button class="icon-action" type="button" data-act="toggle-prod" data-id="' + esc(p.id) + '" title="' + (p.visible ? 'إخفاء' : 'إظهار') + '">' + (p.visible ? '🙈' : '👁️') + '</button>' +
            (canReorder ? '<button class="icon-action" type="button" data-act="move-prod" data-dir="-1" data-id="' + esc(p.id) + '" title="تقديم"' + (idx === 0 ? ' disabled' : '') + '>↑</button>' +
              '<button class="icon-action" type="button" data-act="move-prod" data-dir="1" data-id="' + esc(p.id) + '" title="تأخير"' + (idx === list.length - 1 ? ' disabled' : '') + '>↓</button>' : '') +
            '<button class="icon-action" type="button" data-act="dup-prod" data-id="' + esc(p.id) + '" title="نسخة">⧉</button>' +
            '<a class="icon-action" target="_blank" rel="noopener" href="product.html?id=' + encodeURIComponent(p.id) + '" title="معاينة">🔗</a>' +
            '<button class="icon-action danger" type="button" data-act="del-prod" data-id="' + esc(p.id) + '" title="حذف">🗑️</button>' +
          '</div></div></div>';
    }).join('');
    hydrate(grid);
  }

  /* ---- Product editor ---- */
  var PM = { id: null, images: [], original: [], uploads: [], uploading: 0, busy: false };
  function fillProdCategorySelect(selected) {
    var sel = $('#pCategory');
    sel.innerHTML = S.categories.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + ' — ' + money(c.price) + (c.visible ? '' : ' (مخفي)') + '</option>'; }).join('') +
      (selected && !catById(selected) ? '<option value="' + esc(selected) + '">⚠️ صنف غير موجود</option>' : '');
    if (selected) sel.value = selected;
    updatePriceLabel();
  }
  function updatePriceLabel() {
    var c = catById($('#pCategory').value);
    $('#pUseCatPriceLabel').textContent = 'استخدم سعر الصنف' + (c ? ' (' + money(c.price) + ')' : '');
    $('#pPriceFields').style.display = $('#pUseCatPrice').checked ? 'none' : '';
    updateRatioHint();
  }
  function renderProdImages() {
    var box = $('#pImages');
    if (!PM.images.length) {
      box.innerHTML = '<div class="img-empty">مفيش صور لسه. ارفع صورة أو اكتب مسارها. أول صورة هتبقى الأساسية.</div>';
    } else {
      box.innerHTML = PM.images.map(function (ref, i) {
        return '<div class="img-item' + (i === 0 ? ' main' : '') + '">' +
          '<div class="img-thumb" data-zoom="' + esc(ref) + '">' + img(ref, { variant: 't' }) + '</div>' +
          (i === 0 ? '<span class="main-badge">⭐ الأساسية</span>' : '<span class="img-num">' + (i + 1) + '</span>') +
          '<div class="img-tools">' +
            '<button type="button" data-img="main" data-i="' + i + '" title="اجعلها الأساسية"' + (i === 0 ? ' disabled' : '') + '>⭐</button>' +
            '<button type="button" data-img="prev" data-i="' + i + '" title="تقديم"' + (i === 0 ? ' disabled' : '') + '>→</button>' +
            '<button type="button" data-img="next" data-i="' + i + '" title="تأخير"' + (i === PM.images.length - 1 ? ' disabled' : '') + '>←</button>' +
            '<button type="button" class="del" data-img="del" data-i="' + i + '" title="حذف الصورة">✕</button>' +
          '</div></div>';
      }).join('');
    }
    hydrate(box);
    updateRatioHint();
  }
  function updateRatioHint() {
    var hint = $('#pRatioHint'); if (!hint) return;
    var c = catById($('#pCategory').value);
    if (!c || !PM.images[0]) { hint.textContent = ''; return; }
    var ref = PM.images[0];
    imageSize(ref).then(function (s) {
      if (PM.images[0] !== ref || !s) return;
      var p = c.cardRatio.split('/'), target = p[0] / p[1], r = s.w / s.h;
      var diff = Math.abs(Math.log(r / target));
      hint.textContent = diff > 0.25
        ? '⚠️ مقاس الصورة الأساسية (' + s.w + '×' + s.h + ') مختلف عن شكل كروت الصنف. ' + (c.imageFit === 'contain' ? 'هتظهر كاملة بس بمسافات فاضية حواليها.' : 'ممكن يتقص جزء منها.')
        : '✅ مقاس الصورة الأساسية مناسب لشكل كروت الصنف (' + s.w + '×' + s.h + ')';
    });
  }
  function openProdEditor(id, presetCat) {
    if (!S.categories.length) { toast('أضف صنف الأول', 'warn'); return showTab('categories'); }
    var p = id ? prodById(id) : null;
    if (id && !p) return toast('المنتج مش موجود', 'error');
    var imgs = p ? D.productImages(p) : [];
    PM = { id: id || null, images: imgs.slice(), original: imgs.slice(), uploads: [], uploading: 0, busy: false };
    $('#prodModalTitle').textContent = p ? 'تعديل: ' + p.name : 'إضافة منتج جديد';
    var cat = p ? p.categoryId : (presetCat || (S.prodFilter.cat !== 'all' && catById(S.prodFilter.cat) ? S.prodFilter.cat : S.categories[0].id));
    fillProdCategorySelect(cat);
    $('#pName').value = p ? p.name : '';
    $('#pColor').value = p ? p.color : '';
    $('#pDesc').value = p ? p.description : '';
    $('#pVisible').checked = p ? p.visible : true;
    $('#pUseCatPrice').checked = !(p && p.price);
    $('#pPrice').value = p && p.price ? p.price : '';
    $('#pOldPrice').value = p && p.oldPrice ? p.oldPrice : '';
    $('#pUrl').value = ''; $('#pFiles').value = '';
    setUploadStatus('pUploadStatus', '');
    setFormError('prodFormError', '');
    $$('#prodForm .invalid').forEach(function (x) { x.classList.remove('invalid'); });
    updatePriceLabel();
    renderProdImages();
    openModal('prodModal');
    setTimeout(function () { $('#pName').focus(); }, 60);
  }
  function setUploadStatus(id, msg, isErr) { var el = $('#' + id); el.textContent = msg; el.classList.toggle('error', !!isErr); }
  function addProdFiles(files) {
    files = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    var total = files.length, done = 0, failed = 0;
    PM.uploading += total;
    $('#prodSaveBtn').disabled = true;
    var run = files.reduce(function (p, file) {
      return p.then(function () {
        setUploadStatus('pUploadStatus', '⏳ جاري رفع صورة ' + (done + failed + 1) + ' من ' + total + '...');
        return uploadImage(file).then(function (ref) {
          done++; PM.images.push(ref); PM.uploads.push(ref); renderProdImages();
        }).catch(function (e) { failed++; console.error(e); toast('تعذر رفع "' + file.name + '": ' + errMsg(e), 'error'); });
      });
    }, Promise.resolve());
    run.then(function () {
      PM.uploading -= total;
      $('#prodSaveBtn').disabled = PM.uploading > 0;
      setUploadStatus('pUploadStatus', failed ? '⚠️ اترفع ' + done + ' وفشل ' + failed : '✅ اترفع ' + done + ' صورة', !!failed);
      $('#pFiles').value = '';
    });
  }
  function addUrl(inputId, cb) {
    var v = $('#' + inputId).value.trim();
    if (!v) return;
    if (/^javascript:/i.test(v) || /\s/.test(v.replace(/ /g, '%20').trim()) ) return toast('الرابط مش صحيح', 'error');
    v = v.replace(/^\/+/, '').replace(/ /g, '%20');
    if (!/^https?:\/\//i.test(v) && !/^[\w\-./%()]+\.(jpe?g|png|webp|gif|avif)$/i.test(v)) return toast('اكتب مسار صورة صحيح ينتهي بـ .jpg أو .png أو .webp', 'error');
    var probe = new Image();
    probe.onload = function () { cb(v); $('#' + inputId).value = ''; };
    probe.onerror = function () {
      askConfirm({ title: 'الصورة مش بتفتح', text: 'مقدرتش أفتح الصورة دي:\n' + v + '\n\nلو لسه هترفعها على الاستضافة تقدر تضيفها برضو.', okText: 'أضفها برضو' })
        .then(function (ok) { if (ok) { cb(v); $('#' + inputId).value = ''; } });
    };
    probe.src = v;
  }
  function imgAction(act, i) {
    var arr = PM.images;
    if (act === 'main' && i > 0) { var m = arr.splice(i, 1)[0]; arr.unshift(m); }
    if (act === 'prev' && i > 0) { var t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; }
    if (act === 'next' && i < arr.length - 1) { var t2 = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t2; }
    if (act === 'del') arr.splice(i, 1);
    renderProdImages();
  }
  function saveProduct(e) {
    e.preventDefault();
    if (PM.busy) return;
    if (PM.uploading > 0) return setFormError('prodFormError', 'استنى لحد ما الصور تخلص رفع');
    $$('#prodForm .invalid').forEach(function (x) { x.classList.remove('invalid'); });
    var catId = $('#pCategory').value, name = $('#pName').value.trim();
    var useCat = $('#pUseCatPrice').checked;
    var price = num($('#pPrice').value, 0), old = num($('#pOldPrice').value, 0);
    var errs = [];
    if (!catById(catId)) { errs.push('اختار صنف موجود'); $('#pCategory').classList.add('invalid'); }
    if (name.length < 2) { errs.push('اكتب اسم التصميم'); $('#pName').classList.add('invalid'); }
    if (!useCat && !(price > 0)) { errs.push('اكتب السعر الخاص أو علّم "استخدم سعر الصنف"'); $('#pPrice').classList.add('invalid'); }
    if (!useCat && old && old <= price) { errs.push('السعر قبل الخصم لازم يكون أكبر من السعر'); $('#pOldPrice').classList.add('invalid'); }
    if (!PM.images.length) errs.push('أضف صورة واحدة على الأقل');
    if (errs.length) return setFormError('prodFormError', errs.join(' — '));
    setFormError('prodFormError', '');

    var existing = PM.id ? prodById(PM.id) : null;
    var data = {
      categoryId: catId, name: name, color: $('#pColor').value.trim(), description: $('#pDesc').value.trim(),
      price: useCat ? null : Math.round(price), oldPrice: useCat ? null : (old ? Math.round(old) : null),
      mainImg: PM.images[0], gallery: PM.images.slice(1), visible: $('#pVisible').checked, updatedAt: serverTs()
    };
    if (!existing || existing.categoryId !== catId) {
      data.order = productsIn(catId).filter(function (p) { return p.id !== PM.id; }).reduce(function (m, p) { return Math.max(m, p.order); }, -1) + 1;
    }
    var ref = PM.id ? db.collection('products').doc(PM.id) : db.collection('products').doc();
    if (!PM.id) data.createdAt = serverTs();
    PM.busy = true;
    var btn = $('#prodSaveBtn'); btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
    var wasNew = !PM.id;
    ref.set(data, { merge: true }).then(function () {
      var removed = PM.original.concat(PM.uploads).filter(function (r) { return PM.images.indexOf(r) === -1; });
      cleanupMedia(removed, { skipProducts: [ref.id], keep: PM.images });
      PM.uploads = [];
      closeModal('prodModal');
      toast(wasNew ? '✅ تم إضافة المنتج' : '✅ تم حفظ التعديلات');
    }).catch(function (err) { setFormError('prodFormError', 'تعذر الحفظ: ' + errMsg(err)); })
      .then(function () { PM.busy = false; btn.disabled = false; btn.textContent = '💾 حفظ المنتج'; });
  }
  function cancelProdEditor() {
    if (PM.uploading > 0) return toast('استنى لحد ما الصور تخلص رفع', 'warn');
    var unsaved = PM.uploads.filter(function (r) { return PM.original.indexOf(r) === -1; });
    if (unsaved.length) cleanupMedia(unsaved);
    PM.uploads = [];
    closeModal('prodModal');
  }
  function duplicateProduct(id) {
    var p = prodById(id); if (!p) return;
    var ref = db.collection('products').doc();
    var list = productsIn(p.categoryId);
    var ops = [];
    var idx = list.map(function (x) { return x.id; }).indexOf(id);
    list.forEach(function (x, k) { var want = k <= idx ? k : k + 1; if (x.order !== want) ops.push({ type: 'update', col: 'products', id: x.id, data: { order: want } }); });
    ops.push({ type: 'set', col: 'products', id: ref.id, data: {
      categoryId: p.categoryId, name: p.name + ' (نسخة)', color: p.color, description: p.description, price: p.price, oldPrice: p.oldPrice,
      mainImg: p.mainImg, gallery: p.gallery.slice(), visible: false, order: idx + 1, createdAt: serverTs(), updatedAt: serverTs() } });
    commitOps(ops).then(function () {
      toast('⧉ اتعملت نسخة (مخفية) — عدّلها وأظهرها');
      var tries = 0;
      (function waitCopy() {
        if (prodById(ref.id)) return openProdEditor(ref.id);
        if (++tries < 40) setTimeout(waitCopy, 150);
      })();
    }).catch(function (e) { toast(errMsg(e), 'error'); });
  }
  function deleteProduct(id) {
    var p = prodById(id); if (!p) return;
    askConfirm({ title: 'حذف منتج', text: 'هتحذف "' + p.name + '" نهائياً؟\nلو عايز توقفه مؤقتاً استخدم "إخفاء" بدل الحذف.', okText: '🗑️ حذف', danger: true }).then(function (ok) {
      if (!ok) return;
      db.collection('products').doc(id).delete().then(function () {
        cleanupMedia(D.productImages(p), { skipProducts: [id] });
        toast('🗑️ تم حذف المنتج');
      }).catch(function (e) { toast(errMsg(e), 'error'); });
    });
  }

  /* ================= IMAGES ================= */
  function getImgMode() { try { return localStorage.getItem('sedra_img_mode') || 'auto'; } catch (e) { return 'auto'; } }
  function renderImgModeStatus() {
    $('#imgModeSelect').value = getImgMode();
    var failed = false; try { failed = localStorage.getItem('sedra_storage_failed') === '1'; } catch (e) {}
    $('#imgModeStatus').textContent = !storage ? 'Firebase Storage مش متاح — الصور هتتحفظ في قاعدة البيانات.'
      : failed ? 'آخر تجربة لـ Firebase Storage فشلت، فالصور بتتحفظ في قاعدة البيانات.' : '';
  }
  function loadImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { resolve({ img: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('الملف مش صورة صالحة')); };
      im.src = url;
    });
  }
  function drawScaled(im, maxSide) {
    var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, maxSide / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c;
  }
  function dataUrlUnder(im, maxSide, maxChars) {
    var sides = [maxSide, 1200, 1000, 800], qs = [0.85, 0.78, 0.7, 0.6];
    for (var a = 0; a < sides.length; a++) {
      if (sides[a] > maxSide) continue;
      var c = drawScaled(im, sides[a]);
      for (var b = 0; b < qs.length; b++) {
        var d = c.toDataURL('image/jpeg', qs[b]);
        if (d.length <= maxChars) return { data: d, w: c.width, h: c.height };
      }
    }
    var last = drawScaled(im, 700);
    return { data: last.toDataURL('image/jpeg', 0.55), w: last.width, h: last.height };
  }
  function withTimeout(p, ms, msg) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error(msg || 'timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function uploadToStorage(im) {
    var canvas = drawScaled(im, 1600);
    return new Promise(function (resolve, reject) { canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('compress failed')); }, 'image/jpeg', 0.86); })
      .then(function (blob) {
        var ref = storage.ref('products/' + Date.now() + '_' + D.randomId(6) + '.jpg');
        return withTimeout(Promise.resolve(ref.put(blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' })), 30000, 'storage timeout')
          .then(function () { return ref.getDownloadURL(); });
      });
  }
  function uploadToFirestore(im) {
    var full = dataUrlUnder(im, 1400, 880000);
    var thumb = dataUrlUnder(im, 600, 150000);
    var id = 'img_' + Date.now().toString(36) + D.randomId(8);
    return commitOps([
      { type: 'set', col: 'media', id: id, data: { data: full.data, w: full.w, h: full.h, createdAt: serverTs() } },
      { type: 'set', col: 'media', id: id + '_t', data: { data: thumb.data, w: thumb.w, h: thumb.h, createdAt: serverTs() } }
    ]).then(function () {
      D.primeMedia(id, full.data); D.primeMedia(id + '_t', thumb.data);
      return 'media:' + id;
    });
  }
  function uploadImage(file) {
    if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error('الصورة أكبر من 25 ميجا'));
    return loadImageFile(file).then(function (loaded) {
      var mode = getImgMode(), failedBefore = false;
      try { failedBefore = localStorage.getItem('sedra_storage_failed') === '1'; } catch (e) {}
      var tryStorage = storage && (mode === 'storage' || (mode === 'auto' && !failedBefore));
      var p = tryStorage
        ? uploadToStorage(loaded.img).then(function (url) {
            try { localStorage.removeItem('sedra_storage_failed'); } catch (e) {}
            return url;
          }).catch(function (e) {
            console.warn('Storage upload failed', e);
            if (mode === 'storage') throw e;
            try { localStorage.setItem('sedra_storage_failed', '1'); } catch (x) {}
            renderImgModeStatus();
            return uploadToFirestore(loaded.img);
          })
        : uploadToFirestore(loaded.img);
      return p.then(function (ref) { URL.revokeObjectURL(loaded.url); return ref; }, function (e) { URL.revokeObjectURL(loaded.url); throw e; });
    });
  }
  // delete Firestore-stored images that nothing references anymore
  function cleanupMedia(refs, opt) {
    opt = opt || {};
    var uniq = (refs || []).filter(function (r, i, a) { return D.isMedia(r) && a.indexOf(r) === i && (!opt.keep || opt.keep.indexOf(r) === -1); });
    if (!uniq.length) return;
    var skipP = opt.skipProducts || [];
    var used = {};
    S.products.forEach(function (p) { if (skipP.indexOf(p.id) > -1) return; D.productImages(p).forEach(function (r) { used[r] = 1; }); });
    S.categories.forEach(function (c) { if (c.id !== opt.skipCategory && c.coverImg) used[c.coverImg] = 1; });
    if (CM.cover) used[CM.cover] = 1;
    var ops = [];
    uniq.forEach(function (r) {
      if (used[r]) return;
      var id = r.slice(6);
      ops.push({ type: 'delete', col: 'media', id: id }, { type: 'delete', col: 'media', id: id + '_t' });
    });
    if (ops.length) commitOps(ops).catch(function (e) { console.warn('media cleanup failed', e); });
  }

  /* ================= ANALYTICS ================= */
  function loadAnalytics() {
    if (!db) return;
    Promise.all([db.collection('analytics').doc('summary').get(), db.collection('analytics').doc('pageTime').get()]).then(function (r) {
      S.analytics = r[0].exists ? (r[0].data() || {}) : {};
      S.legacyPageTime = r[1].exists ? (r[1].data() || {}) : {};
      renderAnalytics();
    }).catch(function (e) { console.warn('analytics', e); renderAnalytics(); });
  }
  function avg(total, samples) { return samples ? total / samples : 0; }
  function renderAnalytics() {
    var a = S.analytics || {}, lp = S.legacyPageTime || {};
    var visitors = num(a.visitors, 0), pv = num(a.productViews, 0), mo = num(a.modalOpens, 0);
    var orders = S.orders.length;
    var rows = [
      ['👥', 'زوار (جلسات)', visitors], ['🏠', 'مشاهدات الرئيسية', num(a.homeViews, 0) + num(lp.homeVisits, 0)],
      ['📂', 'مشاهدات صفحات الأصناف', num(a.categoryViews, 0)], ['🖼️', 'مشاهدات صفحات المنتجات', pv],
      ['📝', 'فتحوا فورم الطلب', mo], ['✅', 'أوردرات', orders]
    ];
    $('#funnel').innerHTML = rows.map(function (r) {
      return '<div class="funnel-row"><span class="funnel-icon">' + r[0] + '</span><span class="funnel-label">' + r[1] + '</span><span class="funnel-val">' + r[2].toLocaleString('en-US') + '</span></div>';
    }).join('') + '<div class="funnel-row"><span class="funnel-icon">🎯</span><span class="funnel-label">نسبة التحويل (أوردر ÷ زوار)</span><span class="funnel-val">' + (visitors ? (orders / visitors * 100).toFixed(1) + '%' : '—') + '</span></div>' +
      '<div class="funnel-row"><span class="funnel-icon">📝</span><span class="funnel-label">كمّلوا الطلب من اللي فتحوا الفورم</span><span class="funnel-val">' + (mo ? Math.min(100, Math.round(num(a.orders, 0) / mo * 100)) + '%' : '—') + '</span></div>';
    var times = [
      ['الصفحة الرئيسية', avg(num(a.homeTime, 0), num(a.homeTimeSamples, 0)) || avg(num(lp.home, 0), num(lp.homeVisits, 0))],
      ['صفحات الأصناف', avg(num(a.categoryTime, 0), num(a.categoryTimeSamples, 0))],
      ['صفحة المنتج', avg(num(a.productTime, 0), num(a.productTimeSamples, 0))],
      ['فورم الطلب', avg(num(a.modalTime, 0), num(a.modalTimeSamples, 0))]
    ];
    $('#timeBlocks').innerHTML = times.map(function (t) {
      return '<div class="time-block-row"><span class="time-block-label">' + t[0] + '</span><span class="time-block-val">' + fmtSecs(t[1]) + '</span></div>';
    }).join('');

    var govs = {};
    S.orders.forEach(function (o) { if (o.governorate) govs[o.governorate] = (govs[o.governorate] || 0) + 1; });
    var gl = Object.keys(govs).map(function (k) { return [k, govs[k]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 8);
    var gmax = gl.length ? gl[0][1] : 1;
    $('#analyticsTopGovs').innerHTML = gl.length ? gl.map(function (g) {
      return '<div class="mini-bar-row"><span class="mini-bar-label">' + esc(g[0]) + '</span><div class="mini-bar-wrap"><div class="mini-bar-fill" style="width:' + Math.round(g[1] / gmax * 100) + '%"></div></div><span class="status-bar-count">' + g[1] + '</span></div>';
    }).join('') : '<div class="empty-state"><p>مفيش بيانات</p></div>';

    $('#analyticsTopDesigns').innerHTML = topDesignsHTML(10);
    $('#analyticsCats').innerHTML = categorySalesHTML();
    var total = S.orders.length;
    $('#analyticsStatusTable').innerHTML = STATUSES.map(function (st) {
      var list = S.orders.filter(function (o) { return (o.status || 'جديد') === st; });
      return '<tr><td><span class="status-badge ' + STATUS_CLASS[st] + '">' + esc(st) + '</span></td><td>' + list.length + '</td><td>' + (total ? Math.round(list.length / total * 100) : 0) + '%</td><td>' + money(list.reduce(function (s, o) { return s + orderTotal(o); }, 0)) + '</td></tr>';
    }).join('');
    hydrate($('#analyticsTopDesigns'));
  }

  /* ================= SETTINGS ================= */
  var DEFAULT_THEME = { gold: '#C9A84C', bg: '#F5F0E8', header: '#0A0A0A' };
  function loadSettings() {
    Promise.all([db.collection('settings').doc('store').get(), db.collection('settings').doc('theme').get(), db.collection('settings').doc('shipping').get()]).then(function (r) {
      S.store = r[0].exists ? (r[0].data() || {}) : {};
      S.theme = r[1].exists ? (r[1].data() || {}) : {};
      S.shipping = D.normalizeShipping(r[2].exists ? r[2].data() : null);
      fillSettings();
    }).catch(function (e) { toast('تعذر تحميل الإعدادات: ' + errMsg(e), 'error'); S.shipping = S.shipping || D.normalizeShipping(null); fillSettings(); });
  }
  function fillSettings() {
    var s = S.store, t = S.theme, d = D.CONFIG.defaults;
    $('#settingName').value = s.name || d.storeName;
    $('#settingWA').value = s.whatsapp || ('0' + d.whatsapp.replace(/^20/, ''));
    $('#settingTransfer').checked = s.allowTransfer === true;
    if (S.shipping) renderShippingEditor();
    $('#settingShipCo').value = s.shippingCompany || '';
    setColor('Gold', t.gold || DEFAULT_THEME.gold);
    setColor('Bg', t.bg || DEFAULT_THEME.bg);
    setColor('Header', t.header || DEFAULT_THEME.header);
    $('#settingHeroText').value = t.heroText || '';
  }
  function setColor(key, v) { $('#color' + key).value = v; $('#color' + key + 'Text').value = v; }
  /* ---------- shipping zones editor ---------- */
  function shippingDraft() {
    // read current editor state (zones + governorate assignment)
    var zones = $$('#zonesEditor .zone-edit-row').map(function (row) {
      return { id: row.getAttribute('data-zone'), name: row.querySelector('.zone-name').value.trim(), price: row.querySelector('.zone-price').value.trim() };
    });
    var govZones = {};
    $$('#govGrid select').forEach(function (sel) { govZones[sel.getAttribute('data-gov')] = sel.value; });
    return { zones: zones, govZones: govZones, deliveryText: $('#deliveryText').value };
  }
  function renderShippingEditor(draft) {
    var sh = draft || S.shipping;
    $('#zonesEditor').innerHTML = sh.zones.map(function (z) {
      var count = D.GOVERNORATES.filter(function (g) { return sh.govZones[g] === z.id; }).length;
      return '<div class="zone-edit-row" data-zone="' + esc(z.id) + '">' +
        '<input type="text" class="setting-input zone-name" maxlength="60" value="' + esc(z.name) + '" aria-label="اسم المنطقة">' +
        '<input type="number" class="setting-input zone-price" min="0" step="1" inputmode="numeric" value="' + esc(z.price) + '" aria-label="سعر الشحن">' +
        '<span class="zone-count">' + count + ' محافظة</span>' +
        '<button type="button" class="icon-action danger" data-del-zone="' + esc(z.id) + '" title="حذف المنطقة"' + (sh.zones.length < 2 ? ' disabled' : '') + '>🗑️</button></div>';
    }).join('');
    var options = function (sel) {
      return sh.zones.map(function (z) { return '<option value="' + esc(z.id) + '"' + (z.id === sel ? ' selected' : '') + '>' + esc(z.name || 'بدون اسم') + ' — ' + esc(z.price) + ' ج</option>'; }).join('');
    };
    $('#govGrid').innerHTML = D.GOVERNORATES.map(function (g) {
      var zid = sh.govZones[g];
      return '<label class="gov-item' + (zid ? '' : ' changed') + '"><span>' + esc(g) + '</span><select data-gov="' + esc(g) + '">' +
        (zid ? '' : '<option value="" selected>— اختار —</option>') + options(zid) + '</select></label>';
    }).join('');
    if (!draft) $('#deliveryText').value = sh.deliveryText || '';
    setFormError('shippingFormError', '');
  }
  function refreshShippingLabels() {
    // update option labels and counts in place (keeps focus while typing)
    var d = shippingDraft();
    d.zones.forEach(function (z) {
      var count = D.GOVERNORATES.filter(function (g) { return d.govZones[g] === z.id; }).length;
      var row = $('#zonesEditor .zone-edit-row[data-zone="' + z.id + '"] .zone-count'); if (row) row.textContent = count + ' محافظة';
      $$('#govGrid option[value="' + z.id + '"]').forEach(function (o) { o.textContent = (z.name || 'بدون اسم') + ' — ' + (z.price === '' ? '?' : z.price) + ' ج'; });
    });
  }
  function saveShipping(e) {
    e.preventDefault();
    var d = shippingDraft(), errs = [];
    $$('#shippingForm .invalid').forEach(function (x) { x.classList.remove('invalid'); });
    var names = {};
    d.zones.forEach(function (z, i) {
      var row = $$('#zonesEditor .zone-edit-row')[i];
      if (!z.name) { errs.push('فيه منطقة من غير اسم'); row.querySelector('.zone-name').classList.add('invalid'); }
      else if (names[z.name]) { errs.push('فيه منطقتين بنفس الاسم: ' + z.name); row.querySelector('.zone-name').classList.add('invalid'); }
      names[z.name] = 1;
      if (z.price === '' || !(num(z.price, -1) >= 0)) { errs.push('سعر ' + (z.name || 'منطقة') + ' مش صحيح'); row.querySelector('.zone-price').classList.add('invalid'); }
    });
    if (!d.zones.length) errs.push('لازم منطقة واحدة على الأقل');
    var unassigned = D.GOVERNORATES.filter(function (g) { return !d.govZones[g]; });
    if (unassigned.length) errs.push('حدد منطقة لـ: ' + unassigned.join('، '));
    if (errs.length) return setFormError('shippingFormError', errs.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' — '));
    var data = {
      zones: d.zones.map(function (z) { return { id: z.id, name: z.name, price: Math.round(num(z.price, 0)) }; }),
      govZones: d.govZones,
      deliveryText: d.deliveryText.trim() || D.SEED_SHIPPING.deliveryText,
      updatedAt: serverTs()
    };
    var btn = $('#saveShippingBtn'); btn.disabled = true; btn.textContent = '⏳ جاري الحفظ...';
    db.collection('settings').doc('shipping').set(data).then(function () {
      S.shipping = D.normalizeShipping(data); renderShippingEditor();
      toast('✅ تم حفظ أسعار الشحن — هتتطبق على الأوردرات الجديدة');
    }).catch(function (err) { setFormError('shippingFormError', 'تعذر الحفظ: ' + errMsg(err)); })
      .then(function () { btn.disabled = false; btn.textContent = '💾 حفظ أسعار الشحن'; });
  }

  function saveStore(e) {
    e.preventDefault();
    var wa = D.normalizeWhatsapp($('#settingWA').value);
    if (!/^20?1[0125]\d{8}$/.test(wa) && !/^\d{10,15}$/.test(wa)) { $('#settingWA').classList.add('invalid'); return toast('رقم الواتساب مش صحيح', 'error'); }
    $('#settingWA').classList.remove('invalid');
    var data = { name: $('#settingName').value.trim(), whatsapp: $('#settingWA').value.trim(), allowTransfer: $('#settingTransfer').checked, shippingCompany: $('#settingShipCo').value.trim(), updatedAt: serverTs() };
    db.collection('settings').doc('store').set(data, { merge: true }).then(function () { S.store = data; toast('✅ تم حفظ بيانات المتجر'); })
      .catch(function (err) { toast('تعذر الحفظ: ' + errMsg(err), 'error'); });
  }
  function saveTheme(e) {
    e.preventDefault();
    var hex = /^#[0-9a-f]{6}$/i;
    var data = { gold: $('#colorGoldText').value.trim(), bg: $('#colorBgText').value.trim(), header: $('#colorHeaderText').value.trim(), heroText: $('#settingHeroText').value.trim() };
    if (!hex.test(data.gold) || !hex.test(data.bg) || !hex.test(data.header)) return toast('الألوان لازم تكون بالشكل #C9A84C', 'error');
    data.updatedAt = serverTs();
    db.collection('settings').doc('theme').set(data).then(function () { S.theme = data; toast('✅ تم حفظ الألوان — هتظهر للعملاء خلال ثواني'); })
      .catch(function (err) { toast('تعذر الحفظ: ' + errMsg(err), 'error'); });
  }
  function resetTheme() {
    askConfirm({ title: 'الألوان الافتراضية', text: 'ترجع الألوان وعنوان الصفحة الرئيسية للأصل؟', okText: 'رجّعها' }).then(function (ok) {
      if (!ok) return;
      db.collection('settings').doc('theme').delete().then(function () { S.theme = {}; fillSettings(); toast('✅ رجعت الألوان الافتراضية'); })
        .catch(function (err) { toast(errMsg(err), 'error'); });
    });
  }
  function resetAnalytics() {
    askConfirm({ title: 'مسح الإحصائيات', text: 'هتتمسح أرقام الزيارات والأوقات. الأوردرات مش هتتأثر.', okText: '🗑️ مسح', danger: true }).then(function (ok) {
      if (!ok) return;
      commitOps([{ type: 'delete', col: 'analytics', id: 'summary' }, { type: 'delete', col: 'analytics', id: 'pageTime' }])
        .then(function () { S.analytics = {}; S.legacyPageTime = {}; renderAnalytics(); toast('✅ اتمسحت الإحصائيات'); })
        .catch(function (e) { toast(errMsg(e), 'error'); });
    });
  }
  function resetOrders() {
    askConfirm({ title: 'مسح كل الأوردرات', text: 'هيتمسح ' + S.orders.length + ' أوردر نهائياً والكود هيرجع يبدأ من SED-0001.\nيُفضل تعمل "تصدير Excel" الأول.', okText: '🗑️ امسح الكل', danger: true, typeText: 'امسح' }).then(function (ok) {
      if (!ok) return;
      var ops = S.orders.map(function (o) { return { type: 'delete', col: 'orders', id: o.id }; });
      ops.push({ type: 'set', col: 'meta', id: 'orderCounter', data: { count: 0 } });
      commitOps(ops).then(function () { toast('✅ اتمسحت كل الأوردرات'); }).catch(function (e) { toast(errMsg(e), 'error'); });
    });
  }

  /* ================= IMAGE POPUP ================= */
  function zoom(ref) {
    if (!ref) return;
    var box = document.createElement('div');
    box.innerHTML = img(ref, { variant: 'f' });
    hydrate(box).then(function () { $('#imgPopupImg').src = box.querySelector('img').src; openModal('imgPopupOverlay'); });
    $('#imgPopupImg').src = D.BLANK;
    $('#imgPopupOverlay').classList.add('open');
  }

  /* ================= EVENTS ================= */
  function bind() {
    $('#loginForm').addEventListener('submit', doLogin);
    $('#logoutBtn').addEventListener('click', logout);
    $('#menuToggle').addEventListener('click', function () { setSidebar(!$('#sidebar').classList.contains('open')); });
    $('#sideOverlay').addEventListener('click', function () { setSidebar(false); });

    document.addEventListener('click', function (e) {
      var t = e.target; if (!t.closest) return;
      var el;
      if ((el = t.closest('.nav-item[data-tab]'))) return showTab(el.getAttribute('data-tab'));
      if ((el = t.closest('[data-goto]'))) return showTab(el.getAttribute('data-goto'));
      if (t.closest('#imgPopupOverlay')) { closeModal('imgPopupOverlay'); return; }
      if ((el = t.closest('[data-zoom]'))) { e.preventDefault(); return zoom(el.getAttribute('data-zoom')); }
      if ((el = t.closest('[data-close-modal]'))) {
        var m = el.closest('.add-modal-overlay');
        if (m.id === 'prodModal') return cancelProdEditor();
        if (m.id === 'catModal') return cancelCatEditor();
        return closeModal(m.id);
      }
      if ((el = t.closest('tr[data-order-row]'))) return showOrderDetail(el.getAttribute('data-order-row'));
      if ((el = t.closest('[data-chip]'))) { S.prodFilter.cat = el.getAttribute('data-chip'); return renderProducts(); }
      if ((el = t.closest('[data-ratio]'))) {
        $$('#cRatioOptions .ratio-opt').forEach(function (x) { x.classList.toggle('active', x === el); });
        return updateCatPreview();
      }
      if ((el = t.closest('[data-spec]'))) {
        var row = el.closest('.spec-edit-row'), act = el.getAttribute('data-spec');
        if (act === 'del') { row.remove(); if (!$('#cSpecs .spec-edit-row')) $('#cSpecs').insertAdjacentHTML('beforeend', specRowHTML({})); }
        if (act === 'up' && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
        if (act === 'down' && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
        return;
      }
      if ((el = t.closest('[data-img]'))) return imgAction(el.getAttribute('data-img'), parseInt(el.getAttribute('data-i'), 10));
      if ((el = t.closest('[data-act]'))) {
        var act2 = el.getAttribute('data-act'), id = el.getAttribute('data-id');
        switch (act2) {
          case 'new-cat': return openCatEditor(null);
          case 'edit-cat': return openCatEditor(id);
          case 'toggle-cat': { var c = catById(id); return c && toggleVisible('categories', id, c.visible); }
          case 'move-cat': return reorder(S.categories, id, parseInt(el.getAttribute('data-dir'), 10), 'categories');
          case 'del-cat': return openDeleteCat(id);
          case 'cat-products': S.prodFilter = { cat: id, q: '', vis: 'all' }; $('#prodSearch').value = ''; $('#prodVisFilter').value = 'all'; renderProducts(); return showTab('products');
          case 'new-prod': return openProdEditor(null);
          case 'edit-prod': return openProdEditor(id);
          case 'toggle-prod': { var p = prodById(id); return p && toggleVisible('products', id, p.visible); }
          case 'move-prod': { var pr = prodById(id); return pr && reorder(productsIn(pr.categoryId), id, parseInt(el.getAttribute('data-dir'), 10), 'products'); }
          case 'dup-prod': return duplicateProduct(id);
          case 'del-prod': return deleteProduct(id);
          case 'order-detail': return showOrderDetail(id);
          case 'order-delete': return deleteOrder(id);
          case 'copy-order': return copyOrder(id);
        }
      }
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.matches && el.matches('select[data-status]')) changeStatus(el.getAttribute('data-status'), el.value);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('#imgPopupOverlay').classList.contains('open')) return closeModal('imgPopupOverlay');
      if ($('#confirmModal').classList.contains('open')) return confirmResolver && confirmResolver(false);
      var top = openModals[openModals.length - 1];
      if (top === 'prodModal') return cancelProdEditor();
      if (top === 'catModal') return cancelCatEditor();
      if (top) closeModal(top);
    });

    $('#confirmOk').addEventListener('click', function () { if (confirmResolver) confirmResolver(true); });
    $('#confirmCancel').addEventListener('click', function () { if (confirmResolver) confirmResolver(false); });
    $('#confirmTypeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter' && confirmResolver) confirmResolver(true); });

    // orders
    ['orderSearch', 'statusFilter', 'orderCatFilter'].forEach(function (id) { $('#' + id).addEventListener(id === 'orderSearch' ? 'input' : 'change', renderOrders); });
    $('#exportCsvBtn').addEventListener('click', exportCsv);
    // products
    $('#prodSearch').addEventListener('input', function () { S.prodFilter.q = this.value; renderProducts(); });
    $('#prodVisFilter').addEventListener('change', function () { S.prodFilter.vis = this.value; renderProducts(); });
    $('#prodForm').addEventListener('submit', saveProduct);
    $('#pCategory').addEventListener('change', updatePriceLabel);
    $('#pUseCatPrice').addEventListener('change', updatePriceLabel);
    $('#pFiles').addEventListener('change', function () { addProdFiles(this.files); });
    $('#pUrlBtn').addEventListener('click', function () { addUrl('pUrl', function (v) { if (PM.images.indexOf(v) === -1) PM.images.push(v); renderProdImages(); }); });
    $('#pUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#pUrlBtn').click(); } });
    // categories
    $('#catForm').addEventListener('submit', saveCategory);
    $('#cAddSpec').addEventListener('click', function () { $('#cSpecs').insertAdjacentHTML('beforeend', specRowHTML({})); var rows = $$('#cSpecs .spec-label-in'); rows[rows.length - 1].focus(); });
    $('#cFit').addEventListener('change', updateCatPreview);
    $('#cPrice').addEventListener('input', updateCatPreview);
    $('#cDetectRatio').addEventListener('click', detectRatio);
    $('#cCoverFile').addEventListener('change', function () {
      var file = this.files[0]; if (!file) return;
      CM.busy = true; $('#catSaveBtn').disabled = true;
      setUploadStatus('cCoverStatus', '⏳ جاري رفع الصورة...');
      uploadImage(file).then(function (ref) { CM.cover = ref; CM.uploads.push(ref); renderCover(); setUploadStatus('cCoverStatus', '✅ اترفعت'); })
        .catch(function (e2) { setUploadStatus('cCoverStatus', 'تعذر الرفع: ' + errMsg(e2), true); })
        .then(function () { CM.busy = false; $('#catSaveBtn').disabled = false; $('#cCoverFile').value = ''; });
    });
    $('#cCoverUrlBtn').addEventListener('click', function () { addUrl('cCoverUrl', function (v) { CM.cover = v; renderCover(); }); });
    $('#cCoverClear').addEventListener('click', function () { CM.cover = ''; renderCover(); });
    $('#catDeleteConfirm').addEventListener('click', confirmDeleteCat);
    $$('input[name="catDelMode"]').forEach(function (r) { r.addEventListener('change', function () { $('#catDeleteMoveTo').disabled = $('input[name="catDelMode"]:checked').value !== 'move'; }); });
    // settings
    $('#storeSettingsForm').addEventListener('submit', saveStore);
    $('#shippingForm').addEventListener('submit', saveShipping);
    $('#addZoneBtn').addEventListener('click', function () {
      if (!S.shipping) return;
      var d = shippingDraft();
      d.zones.push({ id: 'z' + D.randomId(6).toLowerCase(), name: '', price: '' });
      renderShippingEditor(d);
      var rows = $$('#zonesEditor .zone-name'); rows[rows.length - 1].focus();
    });
    $('#zonesEditor').addEventListener('click', function (e) {
      var b = e.target.closest('[data-del-zone]'); if (!b) return;
      var id = b.getAttribute('data-del-zone'), d = shippingDraft();
      if (d.zones.length < 2) return;
      var moved = D.GOVERNORATES.filter(function (g) { return d.govZones[g] === id; });
      d.zones = d.zones.filter(function (z) { return z.id !== id; });
      moved.forEach(function (g) { d.govZones[g] = ''; });
      renderShippingEditor(d);
      if (moved.length) setFormError('shippingFormError', 'اختار منطقة جديدة للمحافظات المعلّمة باللون البرتقالي: ' + moved.join('، '));
    });
    $('#zonesEditor').addEventListener('input', refreshShippingLabels);
    $('#govGrid').addEventListener('change', function (e) {
      var sel = e.target.closest('select'); if (!sel) return;
      var emptyOpt = sel.querySelector('option[value=""]'); if (sel.value && emptyOpt) emptyOpt.remove();
      sel.parentElement.classList.toggle('changed', !sel.value);
      refreshShippingLabels();
    });
    $('#themeForm').addEventListener('submit', saveTheme);
    $('#resetThemeBtn').addEventListener('click', resetTheme);
    ['Gold', 'Bg', 'Header'].forEach(function (k) {
      $('#color' + k).addEventListener('input', function () { $('#color' + k + 'Text').value = this.value; });
      $('#color' + k + 'Text').addEventListener('input', function () { if (/^#[0-9a-f]{6}$/i.test(this.value)) $('#color' + k).value = this.value; });
    });
    $('#imgModeSelect').addEventListener('change', function () {
      try { localStorage.setItem('sedra_img_mode', this.value); if (this.value !== 'firestore') localStorage.removeItem('sedra_storage_failed'); } catch (e) {}
      renderImgModeStatus(); toast('✅ اتحفظ');
    });
    $('#restoreDefaultsBtn').addEventListener('click', restoreDefaults);
    $('#resetAnalyticsBtn').addEventListener('click', resetAnalytics);
    $('#resetOrdersBtn').addEventListener('click', resetOrders);
    $('#refreshAnalyticsBtn').addEventListener('click', loadAnalytics);
    window.addEventListener('beforeunload', function (e) {
      if (PM.uploading > 0 || ($('#prodModal').classList.contains('open') && PM.uploads.length)) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ================= BOOT ================= */
  bind();
  var logged = false;
  try { logged = sessionStorage.getItem('sedra_admin_logged') === '1'; } catch (e) {}
  if (logged) showDashboard('أدمن');
  else if (auth) auth.onAuthStateChanged(function (u) { if (u && !S.started) { try { sessionStorage.setItem('sedra_admin_logged', '1'); } catch (e) {} showDashboard(u.email); } });
})();
