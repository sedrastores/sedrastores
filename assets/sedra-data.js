/* =====================================================================
   Sedra Store — shared data layer
   - Firebase config + Telegram config
   - Default catalog (used until the admin publishes the catalog, or if offline)
   - Lightweight Firestore REST client (no heavy SDK on customer pages)
   - Catalog loading with cache (instant page render)
   - Images stored in Firestore ("media:ID") resolution
   ===================================================================== */
(function (global) {
  'use strict';

  var CONFIG = {
    firebase: {
      apiKey: "AIzaSyB3WGGZhM1_rYVEENVw_CIa8fLcoWpkgu0",
      authDomain: "new-sedra.firebaseapp.com",
      projectId: "new-sedra",
      storageBucket: "new-sedra.firebasestorage.app",
      messagingSenderId: "582683278164",
      appId: "1:582683278164:web:e630144e0a0f9b8c0866c1"
    },
    telegram: {
      botToken: "8607316328:AAGK9h27liYMqwFzj5oiWgrYNPT4ktxT4_8",
      chatId: "8288843086"
    },
    defaults: {
      storeName: 'سيدرا ستور',
      whatsapp: '201033035681',
      shipping: 75,
      shippingCompany: ''
    },
    catalogVersion: 2
  };

  /* ---------------- Default catalog ---------------- */
  var SPONGE_SPECS = [
    { label: 'المقاس', value: '120 × 68 سم' },
    { label: 'السماكة', value: '2 سم' },
    { label: 'الخامة', value: 'إسفنج عالي الجودة' },
    { label: 'التشطيب', value: 'شراشيب أنيقة' }
  ];

  var SEED_CATEGORIES = [
    {
      id: 'sponge', order: 0, visible: true, icon: '🕌',
      name: 'مصليات مبطنة إسفنج',
      shortName: 'مبطنة إسفنج',
      tagline: 'خفيفة وناعمة للاستخدام اليومي',
      description: 'مصلى مبطن بطبقة إسفنج 2 سم تحت ركبتك وجبهتك، سهل تلفه وتشيله معاك، بتصاميم إسلامية وشراشيب.',
      price: 450, oldPrice: 600, badge: 'إسفنج',
      cardRatio: '1/1', imageFit: 'cover',
      coverImg: 'images/product1_thumb.jpg',
      specs: SPONGE_SPECS
    },
    {
      id: 'masnad', order: 1, visible: true, icon: '🪑',
      name: 'مصليات بمسند للظهر',
      shortName: 'بمسند',
      tagline: 'مسند يريح ظهرك في الجلوس والأذكار',
      description: 'مصلى بمسند ظهر مدمج، تقعد عليه براحة في التشهد والأذكار وقراءة القرآن. كل تصميم متصور من كل الزوايا عشان تشوفه كويس قبل ما تطلب.',
      price: 750, oldPrice: null, badge: 'بمسند',
      cardRatio: '4/3', imageFit: 'contain',
      coverImg: 'images/masnad/4/main.jpg',
      specs: [
        { label: 'المسند', value: 'مسند ظهر مدمج' },
        { label: 'الاستخدام', value: 'الصلاة والجلوس والأذكار' }
      ]
    },
    {
      id: 'memory', order: 2, visible: true, icon: '🦵',
      name: 'مصليات ميموري فوم للركبة',
      shortName: 'ميموري فوم',
      tagline: 'ميموري فوم 5 سم في منطقة الركبة',
      description: 'مصلى إسفنج مع طبقة ميموري فوم سمكها 5 سم في منطقة الركبة بالتحديد، بتخفف الضغط على الركبة في السجود والجلوس الطويل.',
      price: 950, oldPrice: null, badge: 'ميموري فوم',
      cardRatio: '2/3', imageFit: 'contain',
      coverImg: 'images/memory/1.jpg',
      specs: [
        { label: 'منطقة الركبة', value: 'ميموري فوم 5 سم' },
        { label: 'باقي المصلى', value: 'إسفنج' },
        { label: 'مناسبة لـ', value: 'آلام الركبة والجلوس الطويل' }
      ]
    }
  ];

  var SPONGE_NAMES = [
    ['تصميم الزهور الكلاسيكي', 'أزرق ملكي'],
    ['تصميم البوستان الزاهر', 'كريمي وأخضر'],
    ['تصميم الأعمدة الإسلامية', 'ذهبي وبيج'],
    ['تصميم النقش المغربي', 'بيج وذهبي'],
    ['تصميم زهور الربيع', 'ألوان متعددة'],
    ['تصميم المسجد الأزرق', 'أزرق وذهبي'],
    ['تصميم قبة الأقصى', 'نيلي وذهبي'],
    ['تصميم الخط العربي', 'أسود وذهبي']
  ];
  var MASNAD = [
    ['مسند الزخرفة الذهبية', 'أسود بزخارف ذهبية', 5],
    ['مسند المسجد النبوي', 'أسود وأبيض بقبة خضراء', 4],
    ['مسند باب الكعبة', 'أسود وذهبي', 6],
    ['مسند الكسوة', 'أسود ونقوش ذهبية', 6]
  ];
  var MEMORY = [
    ['ميموري فوم — أزرق ملكي', 'أزرق ملكي'],
    ['ميموري فوم — أسود فحمي', 'أسود فحمي'],
    ['ميموري فوم — أبيض لؤلؤي', 'أبيض لؤلؤي'],
    ['ميموري فوم — أحمر عنابي', 'أحمر عنابي'],
    ['ميموري فوم — وردي', 'وردي'],
    ['ميموري فوم — كحلي', 'كحلي'],
    ['ميموري فوم — بني جملي', 'بني جملي'],
    ['ميموري فوم — أخضر زمردي', 'أخضر زمردي']
  ];

  var SEED_PRODUCTS = [];
  SPONGE_NAMES.forEach(function (p, i) {
    SEED_PRODUCTS.push({ id: 'sponge-' + (i + 1), categoryId: 'sponge', order: i, visible: true,
      name: p[0], color: p[1], price: null, oldPrice: null,
      mainImg: 'images/product' + (i + 1) + '_thumb.jpg', gallery: [] });
  });
  MASNAD.forEach(function (p, i) {
    var n = i + 1, gallery = [];
    for (var a = 1; a <= p[2]; a++) gallery.push('images/masnad/' + n + '/angle-' + a + '.jpg');
    SEED_PRODUCTS.push({ id: 'masnad-' + n, categoryId: 'masnad', order: i, visible: true,
      name: p[0], color: p[1], price: null, oldPrice: null,
      mainImg: 'images/masnad/' + n + '/main.jpg', gallery: gallery });
  });
  MEMORY.forEach(function (p, i) {
    SEED_PRODUCTS.push({ id: 'memory-' + (i + 1), categoryId: 'memory', order: i, visible: true,
      name: p[0], color: p[1], price: null, oldPrice: null,
      mainImg: 'images/memory/' + (i + 1) + '.jpg', gallery: [] });
  });

  /* ---------------- Utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
    return isFinite(n) ? n : fallback;
  }
  function toLatinDigits(s) {
    return String(s || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
      .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); });
  }
  function money(n) { return Math.round(num(n, 0)).toLocaleString('en-US') + ' ج'; }
  function randomId(len) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '';
    var arr = (global.crypto && global.crypto.getRandomValues) ? global.crypto.getRandomValues(new Uint8Array(len || 20)) : null;
    for (var i = 0; i < (len || 20); i++) out += chars[arr ? arr[i] % chars.length : Math.floor(Math.random() * chars.length)];
    return out;
  }
  function validRatio(r) { return /^\d+(\.\d+)?\/\d+(\.\d+)?$/.test(String(r || '')) ? r : '1/1'; }

  /* ---------------- Normalizers ---------------- */
  function normalizeCategory(id, d) {
    d = d || {};
    return {
      id: id,
      name: d.name || 'صنف بدون اسم',
      shortName: d.shortName || '',
      icon: d.icon || '🕌',
      tagline: d.tagline || '',
      description: d.description || '',
      price: num(d.price, 0),
      oldPrice: num(d.oldPrice, 0) || null,
      badge: d.badge || '',
      cardRatio: validRatio(d.cardRatio),
      imageFit: d.imageFit === 'cover' ? 'cover' : 'contain',
      coverImg: d.coverImg || '',
      specs: Array.isArray(d.specs) ? d.specs.filter(function (s) { return s && (s.label || s.value); }) : [],
      order: num(d.order, 999),
      visible: d.visible !== false
    };
  }
  function normalizeProduct(id, d) {
    d = d || {};
    var main = d.mainImg || d.imageUrl || d.img || '';
    var gallery = Array.isArray(d.gallery) ? d.gallery.filter(Boolean) : [];
    return {
      id: id,
      categoryId: d.categoryId || '',
      name: d.name || 'منتج بدون اسم',
      color: d.color || '',
      description: d.description || '',
      price: num(d.price, 0) || null,
      oldPrice: num(d.oldPrice, 0) || null,
      mainImg: main,
      gallery: gallery,
      order: num(d.order, 999),
      visible: d.visible !== false
    };
  }
  function byOrder(a, b) { return (a.order - b.order) || String(a.name).localeCompare(String(b.name), 'ar'); }

  /* ---------------- Firestore REST ---------------- */
  var FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.firebase.projectId + '/databases/(default)/documents';
  var FS_DOC_PREFIX = 'projects/' + CONFIG.firebase.projectId + '/databases/(default)/documents/';

  function decodeValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    if ('referenceValue' in v) return v.referenceValue;
    if ('geoPointValue' in v) return v.geoPointValue;
    return null;
  }
  function decodeFields(fields) {
    var o = {};
    Object.keys(fields || {}).forEach(function (k) { o[k] = decodeValue(fields[k]); });
    return o;
  }
  function encodeValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
    return { mapValue: { fields: encodeFields(v) } };
  }
  function encodeFields(obj) {
    var f = {};
    Object.keys(obj || {}).forEach(function (k) { if (obj[k] !== undefined) f[k] = encodeValue(obj[k]); });
    return f;
  }
  function docId(name) { return String(name).split('/').pop(); }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function fsList(collection, timeoutMs) {
    var docs = [];
    function page(token) {
      var url = FS_BASE + '/' + collection + '?pageSize=300&key=' + CONFIG.firebase.apiKey + (token ? '&pageToken=' + encodeURIComponent(token) : '');
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        (j.documents || []).forEach(function (d) { docs.push({ id: docId(d.name), data: decodeFields(d.fields) }); });
        return j.nextPageToken ? page(j.nextPageToken) : docs;
      });
    }
    return withTimeout(page(null), timeoutMs || 8000);
  }
  function fsGet(path, timeoutMs) {
    var url = FS_BASE + '/' + path + '?key=' + CONFIG.firebase.apiKey;
    return withTimeout(fetch(url, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().then(function (d) { return decodeFields(d.fields); });
    }), timeoutMs || 8000);
  }
  function fsCommit(writes, opts) {
    opts = opts || {};
    return fetch(FS_BASE + ':commit?key=' + CONFIG.firebase.apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: writes }),
      keepalive: !!opts.keepalive
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function writeCreate(path, data, serverTimeFields) {
    return {
      update: { name: FS_DOC_PREFIX + path, fields: encodeFields(data) },
      currentDocument: { exists: false },
      updateTransforms: (serverTimeFields || []).map(function (f) { return { fieldPath: f, setToServerValue: 'REQUEST_TIME' }; })
    };
  }
  function writeIncrement(path, increments, serverTimeFields) {
    var transforms = Object.keys(increments).map(function (k) {
      return { fieldPath: k, increment: encodeValue(Math.round(increments[k])) };
    });
    (serverTimeFields || []).forEach(function (f) { transforms.push({ fieldPath: f, setToServerValue: 'REQUEST_TIME' }); });
    return { update: { name: FS_DOC_PREFIX + path, fields: {} }, updateMask: { fieldPaths: [] }, updateTransforms: transforms };
  }
  function writeMerge(path, data, serverTimeFields) {
    return {
      update: { name: FS_DOC_PREFIX + path, fields: encodeFields(data) },
      updateMask: { fieldPaths: Object.keys(data) },
      updateTransforms: (serverTimeFields || []).map(function (f) { return { fieldPath: f, setToServerValue: 'REQUEST_TIME' }; })
    };
  }

  /* ---------------- Media (images saved inside Firestore) ---------------- */
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  var mediaCache = {};
  var mediaPending = {};

  function isMedia(ref) { return typeof ref === 'string' && ref.indexOf('media:') === 0; }
  function mediaDocId(ref, variant) { var id = ref.slice(6); return variant === 't' ? id + '_t' : id; }

  function imgTag(ref, o) {
    o = o || {};
    var attrs = ' alt="' + esc(o.alt || '') + '"' + (o.cls ? ' class="' + esc(o.cls) + '"' : '') +
      (o.loading === 'eager' ? '' : ' loading="lazy"') + ' decoding="async"' + (o.extra || '');
    if (!ref) return '<img src="' + BLANK + '"' + attrs + '>';
    if (isMedia(ref)) {
      var key = mediaDocId(ref, o.variant);
      if (mediaCache[key]) return '<img src="' + mediaCache[key] + '"' + attrs + '>';
      return '<img src="' + BLANK + '" data-media="' + esc(ref) + '" data-variant="' + (o.variant || 'f') + '"' + attrs + '>';
    }
    return '<img src="' + esc(ref) + '"' + attrs + '>';
  }

  function fetchMedia(keys) {
    var need = keys.filter(function (k) { return !mediaCache[k] && !mediaPending[k]; });
    if (!need.length) {
      return Promise.all(keys.map(function (k) { return mediaPending[k] || Promise.resolve(); }));
    }
    var p = fetch(FS_BASE + ':batchGet?key=' + CONFIG.firebase.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: need.map(function (k) { return FS_DOC_PREFIX + 'media/' + k; }) })
    }).then(function (r) { return r.json(); }).then(function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (item) {
        if (item.found) {
          var d = decodeFields(item.found.fields);
          if (d.data) mediaCache[docId(item.found.name)] = d.data;
        }
      });
    }).catch(function () {}).then(function () { need.forEach(function (k) { delete mediaPending[k]; }); });
    need.forEach(function (k) { mediaPending[k] = p; });
    return Promise.all(keys.map(function (k) { return mediaPending[k] || Promise.resolve(); }));
  }

  // Replace placeholder <img data-media> in a container. Thumbs fall back to full image.
  function hydrateMedia(root) {
    root = root || document;
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img[data-media]'));
    if (!imgs.length) return Promise.resolve();
    var keys = {};
    imgs.forEach(function (img) { keys[mediaDocId(img.getAttribute('data-media'), img.getAttribute('data-variant'))] = 1; });
    return fetchMedia(Object.keys(keys)).then(function () {
      var missing = {};
      imgs.forEach(function (img) {
        var ref = img.getAttribute('data-media'), v = img.getAttribute('data-variant');
        var k = mediaDocId(ref, v);
        if (mediaCache[k]) { img.src = mediaCache[k]; img.removeAttribute('data-media'); }
        else if (v === 't') missing[mediaDocId(ref, 'f')] = 1;
      });
      var fullKeys = Object.keys(missing);
      if (!fullKeys.length) return;
      return fetchMedia(fullKeys).then(function () {
        imgs.forEach(function (img) {
          var ref = img.getAttribute('data-media');
          if (ref && mediaCache[mediaDocId(ref, 'f')]) { img.src = mediaCache[mediaDocId(ref, 'f')]; img.removeAttribute('data-media'); }
        });
      });
    });
  }

  // Public URL usable outside the site (Telegram); null for Firestore-stored images
  function absoluteUrl(ref) {
    if (!ref || isMedia(ref) || /^data:/.test(ref)) return null;
    if (/^https?:\/\//i.test(ref)) return ref;
    if (location.protocol === 'file:') return null;
    return new URL(ref, location.href).href;
  }

  /* ---------------- Catalog ---------------- */
  var CACHE_KEY = 'sedra_catalog_v2';

  function buildCatalog(rawCats, rawProds, settings, source) {
    var categories = rawCats.map(function (c) { return normalizeCategory(c.id, c.data); }).sort(byOrder);
    var products = rawProds.map(function (p) { return normalizeProduct(p.id, p.data); }).sort(byOrder);
    var s = settings || {};
    return {
      source: source,
      categories: categories,
      products: products,
      settings: {
        storeName: s.name || CONFIG.defaults.storeName,
        whatsapp: normalizeWhatsapp(s.whatsapp) || CONFIG.defaults.whatsapp,
        shipping: num(s.shipping, CONFIG.defaults.shipping),
        shippingCompany: s.shippingCompany || ''
      },
      theme: (settings && settings.__theme) || {}
    };
  }
  function normalizeWhatsapp(v) {
    var d = toLatinDigits(v).replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('0') === 0) d = '2' + d;           // 010... -> 2010...
    if (d.indexOf('20') !== 0 && d.length === 10) d = '20' + d;
    return d;
  }
  function seedCatalog(source) {
    return buildCatalog(
      SEED_CATEGORIES.map(function (c) { return { id: c.id, data: c }; }),
      SEED_PRODUCTS.map(function (p) { return { id: p.id, data: p }; }),
      null, source || 'seed');
  }
  function readCache() {
    try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.data ? c.data : null; } catch (e) { return null; }
  }
  function writeCache(cat) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: cat })); } catch (e) {}
  }

  function fetchLiveCatalog() {
    return Promise.all([
      fsGet('meta/catalog'),
      fsList('categories'),
      fsList('products'),
      fsList('settings')
    ]).then(function (res) {
      var meta = res[0] || {};
      var settingsDocs = res[3] || [];
      var store = {}, theme = {};
      settingsDocs.forEach(function (d) { if (d.id === 'store') store = d.data; if (d.id === 'theme') theme = d.data; });
      store.__theme = theme;
      if (!(num(meta.version, 0) >= CONFIG.catalogVersion)) {
        // Admin hasn't published the new catalog yet: show default catalog, but live settings
        return buildCatalog(
          SEED_CATEGORIES.map(function (c) { return { id: c.id, data: c }; }),
          SEED_PRODUCTS.map(function (p) { return { id: p.id, data: p }; }),
          store, 'seed-live');
      }
      return buildCatalog(res[1], res[2], store, 'live');
    });
  }

  var catalogPromise = null;
  /**
   * loadCatalog(onUpdate)
   * - Calls onUpdate immediately with cached catalog (if any)
   * - Calls onUpdate again when live data arrives and differs
   * Returns a promise resolving to the freshest catalog.
   */
  function loadCatalog(onUpdate) {
    var cached = readCache();
    var cachedJson = cached ? JSON.stringify(cached) : '';
    if (cached && onUpdate) { try { onUpdate(cached, true); } catch (e) { console.error(e); } }
    if (!catalogPromise) {
      catalogPromise = fetchLiveCatalog().then(function (live) {
        writeCache(live);
        return live;
      }).catch(function (err) {
        console.warn('Catalog live fetch failed, using fallback:', err && err.message);
        return cached || seedCatalog('seed-offline');
      });
    }
    return catalogPromise.then(function (cat) {
      if (onUpdate && JSON.stringify(cat) !== cachedJson) { try { onUpdate(cat, false); } catch (e) { console.error(e); } }
      return cat;
    });
  }

  /* ---------------- Catalog helpers ---------------- */
  function visibleCategories(cat) { return cat.categories.filter(function (c) { return c.visible; }); }
  function categoryById(cat, id) { return cat.categories.filter(function (c) { return c.id === id; })[0] || null; }
  function productById(cat, id) {
    id = String(id || '');
    if (/^\d+$/.test(id)) id = 'sponge-' + id;          // old links: product.html?id=3
    return cat.products.filter(function (p) { return p.id === id; })[0] || null;
  }
  function productsOf(cat, categoryId, includeHidden) {
    return cat.products.filter(function (p) { return p.categoryId === categoryId && (includeHidden || p.visible); });
  }
  function isProductAvailable(cat, p) {
    if (!p || !p.visible) return false;
    var c = categoryById(cat, p.categoryId);
    return !!(c && c.visible);
  }
  function effectivePrice(cat, p) {
    if (p && p.price) return p.price;
    var c = p ? categoryById(cat, p.categoryId) : null;
    return c ? c.price : 0;
  }
  function effectiveOldPrice(cat, p) {
    var price = effectivePrice(cat, p);
    var old = (p && p.oldPrice) || (p && !p.price ? (categoryById(cat, p.categoryId) || {}).oldPrice : null);
    return old && old > price ? old : null;
  }
  function productImages(p) {
    var list = [];
    [p.mainImg].concat(p.gallery || []).forEach(function (src) { if (src && list.indexOf(src) === -1) list.push(src); });
    return list;
  }

  global.SedraData = {
    CONFIG: CONFIG,
    SEED_CATEGORIES: SEED_CATEGORIES,
    SEED_PRODUCTS: SEED_PRODUCTS,
    esc: esc, num: num, money: money, toLatinDigits: toLatinDigits, randomId: randomId, validRatio: validRatio,
    normalizeCategory: normalizeCategory, normalizeProduct: normalizeProduct, normalizeWhatsapp: normalizeWhatsapp, byOrder: byOrder,
    fs: { list: fsList, get: fsGet, commit: fsCommit, writeCreate: writeCreate, writeIncrement: writeIncrement, writeMerge: writeMerge, encodeFields: encodeFields, decodeFields: decodeFields },
    isMedia: isMedia, imgTag: imgTag, hydrateMedia: hydrateMedia,
    primeMedia: function (key, dataUrl) { mediaCache[key] = dataUrl; }, mediaDocId: mediaDocId, absoluteUrl: absoluteUrl, BLANK: BLANK,
    loadCatalog: loadCatalog, seedCatalog: seedCatalog,
    visibleCategories: visibleCategories, categoryById: categoryById, productById: productById, productsOf: productsOf,
    isProductAvailable: isProductAvailable, effectivePrice: effectivePrice, effectiveOldPrice: effectiveOldPrice, productImages: productImages
  };
})(window);
