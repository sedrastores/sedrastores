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
    catalogVersion: 3,   // admin applies data updates up to this version
    minLiveVersion: 2    // storefront trusts Firestore from this version
  };

  /* ---------------- Default catalog ---------------- */
  var SEED_CATEGORIES = [
    {
      id: 'sponge', order: 0, visible: true, icon: '🕌',
      name: 'مصليات مبطنة إسفنج',
      shortName: 'مبطنة إسفنج',
      tagline: 'خفيفة وسهلة الحمل للاستخدام اليومي',
      description: 'مصلية مبطنة بإسفنج عالي الكثافة سمكه 2 سم، خفيفة وسهلة الحمل ومناسبة للاستخدام اليومي، بتصاميم إسلامية فاخرة وتشطيب بالشراشيب.',
      bestFor: 'الاستخدام اليومي',
      chooser: 'عايز مصلية خفيفة للاستخدام اليومي',
      price: 450, oldPrice: 600, badge: 'إسفنج',
      cardRatio: '1/1', imageFit: 'cover',
      coverImg: 'images/categories/sponge.jpg',
      specs: [
        { label: 'المقاس', value: '120 × 68 سم' },
        { label: 'السماكة', value: '2 سم' },
        { label: 'الخامة', value: 'إسفنج عالي الكثافة' },
        { label: 'التشطيب', value: 'شراشيب' }
      ]
    },
    {
      id: 'masnad', order: 1, visible: true, icon: '🪑',
      name: 'مصليات بمسند للظهر',
      shortName: 'بمسند',
      tagline: 'مسند ظهر خشب يتحمل لحد 250 كيلو',
      description: 'مصلية إسفنج بالكامل بسمك 3 سم مع ظهر خشب يتحمل لحد 250 كيلو، بتسند ظهرك وانت قاعد في التشهد والأذكار وقراءة القرآن، وقابلة للطي وسهلة الحمل.',
      bestFor: 'اللي ظهره بيتعب في الجلوس الطويل',
      chooser: 'ظهري بيتعب وأنا قاعد',
      price: 750, oldPrice: null, badge: 'بمسند',
      cardRatio: '4/3', imageFit: 'contain',
      coverImg: 'images/categories/masnad.jpg',
      specs: [
        { label: 'المقاس', value: '150 × 70 سم' },
        { label: 'السماكة', value: '3 سم (من غير الخشب)' },
        { label: 'الخامة', value: 'إسفنج بالكامل' },
        { label: 'الظهر', value: 'خشب يتحمل لحد 250 كيلو' },
        { label: 'الطي', value: 'قابلة للطي وسهلة الحمل' },
        { label: 'التشطيب', value: 'شراشيب' }
      ]
    },
    {
      id: 'memory', order: 2, visible: true, icon: '🦵',
      name: 'مصليات ميموري فوم للركبة',
      shortName: 'ميموري فوم',
      tagline: 'ميموري فوم 5 سم يريّح ركبتك',
      description: 'مصلية إسفنج فيها طبقة ميموري فوم سمكها 5 سم في منطقة الركبة بالتحديد، بتخفف الضغط على ركبتك في السجود والجلوس، وخفيفة وسهلة الحمل.',
      bestFor: 'اللي عنده ألم في الركبة أو بيطوّل في السجود',
      chooser: 'ركبتي بتوجعني في السجود',
      price: 950, oldPrice: null, badge: 'ميموري فوم',
      cardRatio: '2/3', imageFit: 'contain',
      coverImg: 'images/categories/memory.jpg',
      specs: [
        { label: 'المقاس', value: '120 × 70 سم' },
        { label: 'السماكة', value: 'ميموري فوم 5 سم في منطقة الركبة' },
        { label: 'الخامة', value: 'إسفنج + ميموري فوم في منطقة الركبة' },
        { label: 'التشطيب', value: 'شراشيب' }
      ]
    }
  ];

  /* ---------------- Shipping zones ---------------- */
  var GOVERNORATES = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'المنوفية', 'الغربية', 'كفر الشيخ', 'البحيرة',
    'الإسماعيلية', 'السويس', 'بورسعيد', 'دمياط', 'بني سويف', 'الفيوم', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
    'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء'];
  var SEED_SHIPPING = {
    zones: [
      { id: 'cairo', name: 'القاهرة والجيزة', price: 75 },
      { id: 'delta', name: 'الدلتا ومدن القناة', price: 95 },
      { id: 'upper', name: 'الصعيد وشمال سيناء', price: 110 },
      { id: 'redsea', name: 'البحر الأحمر ومطروح (الغردقة والساحل)', price: 125 },
      { id: 'far', name: 'جنوب سيناء والوادي الجديد', price: 150 }
    ],
    govZones: {
      'القاهرة': 'cairo', 'الجيزة': 'cairo',
      'الإسكندرية': 'delta', 'القليوبية': 'delta', 'الشرقية': 'delta', 'الدقهلية': 'delta', 'المنوفية': 'delta', 'الغربية': 'delta',
      'كفر الشيخ': 'delta', 'البحيرة': 'delta', 'دمياط': 'delta', 'الإسماعيلية': 'delta', 'السويس': 'delta', 'بورسعيد': 'delta',
      'بني سويف': 'upper', 'الفيوم': 'upper', 'المنيا': 'upper', 'أسيوط': 'upper', 'سوهاج': 'upper', 'قنا': 'upper', 'الأقصر': 'upper',
      'أسوان': 'upper', 'شمال سيناء': 'upper',
      'البحر الأحمر': 'redsea', 'مطروح': 'redsea',
      'جنوب سيناء': 'far', 'الوادي الجديد': 'far'
    },
    deliveryText: 'القاهرة والجيزة: من 1 إلى 3 أيام عمل\nباقي المحافظات: من 3 إلى 5 أيام عمل\nيوم الجمعة إجازة، وأوردرات المحافظات بتطلع يومي السبت والتلات.'
  };
  var DEFAULT_COVER_RE = /^images\/(product\d+_thumb|masnad\/\d+\/main|memory\/\d+)\.jpg$/;
  // v3 details for the 3 main categories. Never touches name, price, order or visibility.
  function seedCategoryPatch(id, cur) {
    var sc = SEED_CATEGORIES.filter(function (c) { return c.id === id; })[0];
    if (!sc) return null;
    cur = cur || {};
    var patch = { shortName: sc.shortName, tagline: sc.tagline, description: sc.description, bestFor: sc.bestFor, chooser: sc.chooser, badge: sc.badge, specs: sc.specs };
    if (!cur.coverImg || DEFAULT_COVER_RE.test(cur.coverImg)) patch.coverImg = sc.coverImg;
    return patch;
  }
  function normalizeShipping(d) {
    d = d || {};
    var zones = (Array.isArray(d.zones) ? d.zones : []).map(function (z, i) {
      return { id: String((z && z.id) || ('z' + i)), name: String((z && z.name) || ''), price: Math.max(0, Math.round(num(z && z.price, 0))) };
    }).filter(function (z) { return z.name; });
    if (!zones.length) return JSON.parse(JSON.stringify(SEED_SHIPPING));
    var ids = zones.map(function (z) { return z.id; });
    var govZones = {};
    GOVERNORATES.forEach(function (g) {
      var zid = d.govZones && d.govZones[g];
      govZones[g] = ids.indexOf(zid) > -1 ? zid : null;
    });
    return { zones: zones, govZones: govZones, deliveryText: (typeof d.deliveryText === 'string' && d.deliveryText.trim()) ? d.deliveryText : SEED_SHIPPING.deliveryText };
  }

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
    ['ميموري فوم — رمادي', 'رمادي'],
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
      bestFor: d.bestFor || '',
      chooser: d.chooser || '',
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
    return withTimeout(page(null), timeoutMs || 6000);
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

  // images whose stored data could not be found: flag the card so it never looks empty
  var MISSING_BOXES = '.p-img, .cat-card-media, .line-img, .s-img, .g-main, .g-thumb, .cat-banner, .pa-img, .img-thumb, .single-img-thumb, .design-rank-img, .order-thumb';
  function markUnresolved(imgs) {
    imgs.forEach(function (img) {
      if (!img.getAttribute('data-media')) return;
      var box = (img.closest && img.closest(MISSING_BOXES)) || img.parentElement;
      if (box) box.classList.add('img-missing');
    });
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
      if (!fullKeys.length) return markUnresolved(imgs);
      return fetchMedia(fullKeys).then(function () {
        imgs.forEach(function (img) {
          var ref = img.getAttribute('data-media');
          if (ref && mediaCache[mediaDocId(ref, 'f')]) { img.src = mediaCache[mediaDocId(ref, 'f')]; img.removeAttribute('data-media'); }
        });
        markUnresolved(imgs);
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
        shippingCompany: s.shippingCompany || '',
        allowTransfer: s.allowTransfer === true
      },
      shipping: normalizeShipping(s.__shipping),
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
  var CACHE_TTL = 10 * 60 * 1000; // one refresh per visitor per 10 minutes, at most
  function readCacheEntry() {
    try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return (c && c.data) ? c : null; } catch (e) { return null; }
  }
  function readCache() { var c = readCacheEntry(); return c ? c.data : null; }
  function writeCache(cat) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: cat })); } catch (e) {}
  }

  // One document holding the whole catalog, published by the admin on every change.
  // Costs a single Firestore read per visitor instead of one per product and image.
  function fetchSnapshot() {
    return fsGet('meta/snapshot', 6000).then(function (snap) {
      if (!snap || !Array.isArray(snap.categories) || !Array.isArray(snap.products) || !snap.products.length) return null;
      var store = snap.settings || {};
      store.__theme = snap.theme || {};
      store.__shipping = snap.shipping || null;
      return buildCatalog(
        snap.categories.map(function (c) { return { id: c.id, data: c }; }),
        snap.products.map(function (p) { return { id: p.id, data: p }; }),
        store, 'live');
    });
  }
  function fetchCollections() {
    return Promise.all([
      fsGet('meta/catalog'),
      fsList('categories'),
      fsList('products'),
      fsList('settings')
    ]).then(function (res) {
      var meta = res[0] || {};
      var settingsDocs = res[3] || [];
      var store = {}, theme = {};
      var shippingDoc = null;
      settingsDocs.forEach(function (d) { if (d.id === 'store') store = d.data; if (d.id === 'theme') theme = d.data; if (d.id === 'shipping') shippingDoc = d.data; });
      store.__theme = theme;
      store.__shipping = shippingDoc;
      // Always trust Firestore when it actually holds a catalog: anything the owner adds
      // in the admin must reach customers, whatever version number is stored.
      var hasLive = (res[1] || []).length > 0 && (res[2] || []).length > 0;
      if (!hasLive) {
        return buildCatalog(
          SEED_CATEGORIES.map(function (c) { return { id: c.id, data: c }; }),
          SEED_PRODUCTS.map(function (p) { return { id: p.id, data: p }; }),
          store, 'seed-live');
      }
      // Very old database (before the 3-category rollout): show its data *plus* the
      // defaults it is missing, so nothing ever disappears from the storefront.
      if (num(meta.version, 0) < 2) {
        var haveCat = {}, haveProd = {};
        res[1].forEach(function (c) { haveCat[c.id] = 1; });
        res[2].forEach(function (p) { haveProd[p.id] = 1; });
        var sameKind = { sponge: /[اإ]سفنج/, masnad: /مسند/, memory: /ميموري/ };
        SEED_CATEGORIES.forEach(function (c) {
          if (haveCat[c.id]) return;
          // the old database may hold the same kind under its own id: don't duplicate it
          var exists = res[1].some(function (x) {
            var n = (x.data && x.data.name) || '';
            return sameKind[c.id] && sameKind[c.id].test(n) && !(c.id === 'sponge' && /مسند|ميموري/.test(n));
          });
          if (!exists) res[1].push({ id: c.id, data: c });
        });
        SEED_PRODUCTS.forEach(function (p) { if (!haveProd[p.id] && !haveCat[p.categoryId]) res[2].push({ id: p.id, data: p }); });
      }
      var cats = res[1], prods = res[2];
      if (num(meta.version, 0) < CONFIG.catalogVersion) {
        // admin hasn't applied v3 yet: show the new details right away (in memory only)
        cats = cats.map(function (c) {
          var patch = seedCategoryPatch(c.id, c.data);
          return patch ? { id: c.id, data: Object.assign({}, c.data, patch) } : c;
        });
        prods = prods.map(function (p) {
          return (p.id === 'memory-2' && p.data.name === 'ميموري فوم — أسود فحمي') ? { id: p.id, data: Object.assign({}, p.data, { name: 'ميموري فوم — رمادي', color: 'رمادي' }) } : p;
        });
      }
      return buildCatalog(cats, prods, store, 'live');
    });
  }
  function fetchLiveCatalog() {
    return fetchSnapshot().then(function (fromSnap) {
      return fromSnap || fetchCollections();
    }, function (e) {
      console.warn('Snapshot read failed:', e && e.message);
      return fetchCollections();
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
    var entry = readCacheEntry();
    if (entry && entry.ts && (Date.now() - entry.ts) < CACHE_TTL && entry.data && entry.data.source === 'live') {
      // recent copy already on the device: serve it and make no network request at all
      if (onUpdate) { try { onUpdate(entry.data, true); } catch (e) { console.error(e); } }
      return Promise.resolve(entry.data);
    }
    var cached = readCache();
    var cachedJson = cached ? JSON.stringify(cached) : '';
    if (cached && onUpdate) { try { onUpdate(cached, true); } catch (e) { console.error(e); } }
    // First-time visitor on a slow connection: never leave the page empty while waiting.
    // Show the built-in catalog after a moment, then swap in the live data when it lands.
    var settled = false, waitTimer = null;
    if (!cached && onUpdate) {
      waitTimer = setTimeout(function () {
        if (settled) return;
        try { onUpdate(seedCatalog('seed-wait'), true); } catch (e) { console.error(e); }
      }, 1500);
    }
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
      settled = true;
      if (waitTimer) clearTimeout(waitTimer);
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
  function shippingZoneFor(cat, gov) {
    var sh = (cat && cat.shipping) || normalizeShipping(null);
    var zid = sh.govZones[gov];
    var z = sh.zones.filter(function (x) { return x.id === zid; })[0];
    if (z) return z;
    // unmapped governorate: charge the highest zone so we never under-charge
    return sh.zones.slice().sort(function (a, b) { return b.price - a.price; })[0] || { id: '', name: '', price: CONFIG.defaults.shipping };
  }
  function minShipping(cat) {
    var sh = (cat && cat.shipping) || normalizeShipping(null);
    return sh.zones.reduce(function (m, z) { return Math.min(m, z.price); }, Infinity);
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
    seedCategoryPatch: seedCategoryPatch,
    GOVERNORATES: GOVERNORATES, SEED_SHIPPING: SEED_SHIPPING, normalizeShipping: normalizeShipping, shippingZoneFor: shippingZoneFor, minShipping: minShipping,
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
