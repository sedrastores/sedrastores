/* =====================================================================
   Sedra Store — storefront UI shared by index / category / product pages
   ===================================================================== */
(function (global) {
  'use strict';
  var D = global.SedraData;
  var esc = D.esc, money = D.money;

  var state = { catalog: null, page: 'home', activeCategory: null, listeners: [] };

  /* ---------------- Tiny helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function waNumber() { return (state.catalog && state.catalog.settings.whatsapp) || D.CONFIG.defaults.whatsapp; }
  function shipping() { return state.catalog ? state.catalog.settings.shipping : D.CONFIG.defaults.shipping; }
  function waLink(text) { return 'https://wa.me/' + waNumber() + (text ? '?text=' + encodeURIComponent(text) : ''); }

  var WA_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
  var CART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 016 0"/></svg>';

  /* ---------------- Toast ---------------- */
  function toast(msg, action) {
    var wrap = $('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    if (action) on(t.querySelector('button'), 'click', function () { t.remove(); action.fn(); });
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, action ? 4500 : 2600);
  }

  /* ---------------- Overlays ---------------- */
  var openLayers = [];
  function lockScroll() { document.body.classList.toggle('no-scroll', openLayers.length > 0); }
  function openLayer(name) { if (openLayers.indexOf(name) === -1) openLayers.push(name); lockScroll(); }
  function closeLayer(name) { openLayers = openLayers.filter(function (n) { return n !== name; }); lockScroll(); }

  /* ================= HEADER + MENU ================= */
  function injectChrome() {
    if ($('#siteMenu')) return;
    var html =
      '<div class="overlay" id="menuOverlay"></div>' +
      '<nav class="menu-panel" id="siteMenu" aria-label="القائمة الرئيسية" aria-hidden="true">' +
        '<div class="menu-head"><span class="menu-head-title">✦ سيدرا ستور</span>' +
        '<button class="menu-close" type="button" data-close-menu aria-label="إغلاق القائمة">✕</button></div>' +
        '<div class="menu-body" id="menuBody"></div>' +
        '<div class="menu-foot"><a class="menu-wa" data-wa-link target="_blank" rel="noopener">' + WA_SVG + ' استفسر على واتساب</a></div>' +
      '</nav>' +
      '<div class="overlay" id="cartOverlay"></div>' +
      '<aside class="cart-drawer" id="cartDrawer" aria-label="سلة الطلب" aria-hidden="true">' +
        '<div class="drawer-head"><h3>🛒 طلبك</h3><button class="drawer-close" type="button" data-close-cart aria-label="إغلاق السلة">✕</button></div>' +
        '<div class="drawer-body" id="cartBody"></div>' +
        '<div class="drawer-foot" id="cartFoot"></div>' +
      '</aside>' +
      '<div class="sheet-overlay" id="pickerOverlay"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pickerTitle">' +
        '<div class="sheet-head"><h3 id="pickerTitle">أضف تصميم للطلب</h3><button class="round-close" type="button" data-close-picker aria-label="إغلاق">✕</button></div>' +
        '<div class="tabs" id="pickerTabs"></div>' +
        '<div class="sheet-body"><div class="pick-grid" id="pickerGrid"></div></div>' +
        '<div class="sheet-foot"><button class="btn btn-gold btn-block" type="button" data-close-picker>تم</button></div>' +
      '</div></div>';
    var holder = document.createElement('div');
    holder.innerHTML = html;
    while (holder.firstChild) document.body.appendChild(holder.firstChild);
    injectCheckout();
  }

  function renderMenu() {
    var body = $('#menuBody');
    if (!body) return;
    var cat = state.catalog;
    var items = '<a class="menu-item' + (state.page === 'home' ? ' active' : '') + '" href="index.html">' +
      '<span class="menu-item-icon">🏠</span><span class="menu-item-text">الرئيسية</span></a>';
    items += '<div class="menu-label">الأصناف</div>';
    if (!cat) {
      items += '<div class="menu-item" style="opacity:.5">⏳ جاري التحميل...</div>';
    } else {
      D.visibleCategories(cat).forEach(function (c) {
        var count = D.productsOf(cat, c.id).length;
        items += '<a class="menu-item' + (state.activeCategory === c.id ? ' active' : '') + '" href="category.html?c=' + encodeURIComponent(c.id) + '">' +
          '<span class="menu-item-icon">' + esc(c.icon) + '</span>' +
          '<span class="menu-item-text">' + esc(c.name) + '<span class="menu-item-sub">' + count + ' تصميم' + (c.tagline ? ' — ' + esc(c.tagline) : '') + '</span></span>' +
          (c.price ? '<span class="menu-item-price">' + money(c.price) + '</span>' : '') + '</a>';
      });
    }
    body.innerHTML = items;
  }

  function setMenu(open) {
    var panel = $('#siteMenu'), overlay = $('#menuOverlay'), btn = $('#hamburgerBtn');
    if (!panel) return;
    panel.classList.toggle('open', open); overlay.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (btn) { btn.classList.toggle('open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    if (open) { openLayer('menu'); var first = panel.querySelector('.menu-item'); if (first) first.focus({ preventScroll: true }); }
    else closeLayer('menu');
  }

  /* ================= CART ================= */
  var CART_KEY = 'sedra_cart_v2';
  var cart = [];
  function loadCart() {
    try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { cart = []; }
    if (!Array.isArray(cart)) cart = [];
    cart = cart.filter(function (i) { return i && i.productId && i.qty > 0; });
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
    renderCartUI();
    emit('cart');
  }
  function cartCount() { return cart.reduce(function (s, i) { return s + i.qty; }, 0); }
  function cartSubtotal() { return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0); }
  function snapshotItem(p, qty) {
    var cat = state.catalog, c = D.categoryById(cat, p.categoryId) || {};
    return { productId: p.id, categoryId: p.categoryId, categoryName: c.name || '', name: p.name, color: p.color || '',
      img: p.mainImg, price: D.effectivePrice(cat, p), qty: qty };
  }
  function addToCart(productId, qty, silent) {
    var cat = state.catalog; if (!cat) return false;
    var p = D.productById(cat, productId);
    if (!D.isProductAvailable(cat, p)) { toast('المنتج ده مش متاح حالياً'); return false; }
    qty = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
    var existing = cart.filter(function (i) { return i.productId === p.id; })[0];
    if (existing) existing.qty = Math.min(99, existing.qty + qty);
    else cart.push(snapshotItem(p, qty));
    saveCart();
    var badge = $('#cartCount');
    if (badge) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    if (!silent) toast('اتضاف "' + p.name + '" للطلب', { label: 'عرض الطلب', fn: openCart });
    return true;
  }
  function setQty(productId, qty) {
    cart.forEach(function (i) { if (i.productId === productId) i.qty = Math.max(1, Math.min(99, qty)); });
    saveCart();
  }
  function removeItem(productId) { cart = cart.filter(function (i) { return i.productId !== productId; }); saveCart(); }
  function inCartQty(productId) { var i = cart.filter(function (x) { return x.productId === productId; })[0]; return i ? i.qty : 0; }

  function reconcileCart() {
    var cat = state.catalog; if (!cat) return;
    var removed = [];
    cart = cart.filter(function (item) {
      var p = D.productById(cat, item.productId);
      if (!p) { if (cat.source === 'live') { removed.push(item.name); return false; } return true; }
      if (!D.isProductAvailable(cat, p)) { removed.push(item.name); return false; }
      var fresh = snapshotItem(p, item.qty);
      Object.keys(fresh).forEach(function (k) { item[k] = fresh[k]; });
      return true;
    });
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
    if (removed.length) toast('اتشال من طلبك لأنه مش متاح حالياً: ' + removed.join('، '));
  }

  function lineItemHTML(i) {
    return '<div class="line-item">' +
      '<div class="line-img">' + D.imgTag(i.img, { alt: i.name, variant: 't' }) + '</div>' +
      '<div><div class="line-cat">' + esc(i.categoryName) + '</div><div class="line-name">' + esc(i.name) + '</div>' +
      '<div class="line-price">' + money(i.price) + ' للقطعة</div>' +
      '<button class="line-remove" type="button" data-remove="' + esc(i.productId) + '">إزالة</button></div>' +
      '<div class="line-side"><div class="qty" role="group" aria-label="الكمية">' +
        '<button type="button" data-qty="' + esc(i.productId) + '" data-delta="1" aria-label="زيادة">+</button>' +
        '<span>' + i.qty + '</span>' +
        '<button type="button" data-qty="' + esc(i.productId) + '" data-delta="-1" aria-label="تقليل">−</button></div>' +
      '<div class="line-total">' + money(i.price * i.qty) + '</div></div>' +
    '</div>';
  }

  function renderCartUI() {
    var n = cartCount();
    var badge = $('#cartCount');
    if (badge) { badge.textContent = n; badge.hidden = n === 0; }
    var body = $('#cartBody'), foot = $('#cartFoot');
    if (!body) return;
    if (!cart.length) {
      body.innerHTML = '<div class="drawer-empty"><div>🛒</div><p>طلبك فاضي لسه</p>' +
        '<button class="add-more-btn" type="button" data-open-picker>+ اختار تصميم</button></div>';
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = cart.map(lineItemHTML).join('') +
      '<button class="add-more-btn" type="button" data-open-picker>+ أضف تصميم تاني من أي صنف</button>';
    var sub = cartSubtotal();
    foot.innerHTML =
      '<div class="totals-row"><span>المنتجات (' + n + ' قطعة)</span><span>' + money(sub) + '</span></div>' +
      '<div class="totals-row"><span>الشحن</span><span>' + money(shipping()) + '</span></div>' +
      '<div class="totals-row grand"><span>الإجمالي</span><span>' + money(sub + shipping()) + '</span></div>' +
      '<div class="drawer-actions"><button class="btn btn-gold btn-block" type="button" data-checkout>✅ إتمام الطلب</button>' +
      '<button class="btn btn-outline btn-block btn-sm" type="button" data-close-cart>كمّل تسوق</button></div>';
    D.hydrateMedia(body);
  }

  function setCart(open) {
    var d = $('#cartDrawer'), o = $('#cartOverlay');
    if (!d) return;
    d.classList.toggle('open', open); o.classList.toggle('open', open);
    d.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) { renderCartUI(); openLayer('cart'); } else closeLayer('cart');
  }
  function openCart() { setMenu(false); setCart(true); }

  /* ================= PICKER ================= */
  var pickerCat = null;
  function openPicker(categoryId) {
    var cat = state.catalog; if (!cat) return;
    var cats = D.visibleCategories(cat);
    pickerCat = categoryId || state.activeCategory || (cats[0] && cats[0].id);
    renderPicker();
    $('#pickerOverlay').classList.add('open');
    openLayer('picker');
  }
  function closePicker() { $('#pickerOverlay').classList.remove('open'); closeLayer('picker'); }
  function renderPicker() {
    var cat = state.catalog;
    var cats = D.visibleCategories(cat);
    if (!D.categoryById(cat, pickerCat) && cats[0]) pickerCat = cats[0].id;
    $('#pickerTabs').innerHTML = cats.map(function (c) {
      return '<button type="button" class="tab' + (c.id === pickerCat ? ' active' : '') + '" data-picker-tab="' + esc(c.id) + '">' +
        esc(c.icon) + ' ' + esc(c.shortName || c.name) + '<small>' + money(c.price) + '</small></button>';
    }).join('');
    var c = D.categoryById(cat, pickerCat);
    var list = c ? D.productsOf(cat, c.id) : [];
    $('#pickerGrid').innerHTML = list.length ? list.map(function (p) {
      var q = inCartQty(p.id);
      return '<button type="button" class="pick-item' + (q ? ' in-cart' : '') + '" data-pick="' + esc(p.id) + '">' +
        '<div class="p-img' + (c.imageFit === 'contain' ? ' fit-contain' : '') + '" style="--ratio:' + c.cardRatio + ';--fit:' + c.imageFit + '">' +
        D.imgTag(p.mainImg, { alt: p.name, variant: 't' }) + '</div>' +
        '<div class="pick-info"><div class="pick-name">' + esc(p.name) + '</div>' +
        '<div class="pick-state">' + (q ? '✓ في الطلب (' + q + ')' : money(D.effectivePrice(cat, p))) + '</div></div></button>';
    }).join('') : '<div class="empty-note" style="grid-column:1/-1">مفيش تصاميم في الصنف ده حالياً</div>';
    D.hydrateMedia($('#pickerGrid'));
  }

  /* ================= CHECKOUT ================= */
  var EGYPT = {
    "القاهرة": ["مدينة نصر","النزهة","المطرية","حلوان","المعادي","مصر الجديدة","عين شمس","شبرا","الزيتون","السلام","الأميرية","المرج","المقطم","دار السلام","الوايلي","الخليفة","الموسكي","الجمالية","عابدين","بولاق","الساحل","روض الفرج","الزاوية الحمراء","الظاهر","باب الشعرية","الأزبكية","وسط القاهرة","التجمع الخامس","الشروق","مدينتي","بدر","القاهرة الجديدة"],
    "الجيزة": ["الجيزة","إمبابة","بولاق الدكرور","الدقي","الهرم","فيصل","العجوزة","الزمالك","أكتوبر","الشيخ زايد","الواحات البحرية","أبو النمرس","العياط","أوسيم","كرداسة","منشأة القناطر","الصف","أطفيح","الحوامدية"],
    "الإسكندرية": ["الإسكندرية","المنتزه","سيدي جابر","باب شرق","اللبان","الجمرك","الأنفوشي","المنشية","كرموز","العامرية","برج العرب","أبو قير","الدخيلة","العجمي","البيطاش","المكس","سيدي كرير"],
    "القليوبية": ["بنها","شبرا الخيمة","القناطر الخيرية","كفر شكر","طوخ","قليوب","الخانكة","الخصوص","أبو زعبل","بسوس","مسطرد","العبور"],
    "الشرقية": ["الزقازيق","أبو حماد","أبو كبير","بلبيس","الصالحية الجديدة","القنايات","الحسينية","فاقوس","مشتول السوق","كفر صقر","السنبلاوين","العاشر من رمضان","هيهيا","منيا القمح","أولاد صقر","الإبراهيمية"],
    "الدقهلية": ["المنصورة","ميت غمر","أجا","بلقاس","دكرنس","شربين","طلخا","المطرية","منية النصر","نبروه","ميت سلسيل","الجمالية","بني عبيد"],
    "المنوفية": ["شبين الكوم","أشمون","الباجور","بركة السبع","تلا","الشهداء","قويسنا","منوف","السادات"],
    "الغربية": ["طنطا","المحلة الكبرى","سمنود","بسيون","زفتى","كفر الزيات","السنطة","قطور"],
    "كفر الشيخ": ["كفر الشيخ","بلطيم","برج البرلس","دسوق","الرياض","سيدي سالم","فوه","قلين","مطوبس","بيلا","الحامول"],
    "البحيرة": ["دمنهور","أبو حمص","أبو المطامير","حوش عيسى","الدلنجات","الرحمانية","رشيد","شبراخيت","إيتاي البارود","كفر الدوار","كوم حمادة","المحمودية","وادي النطرون","النوبارية","إدكو"],
    "الإسماعيلية": ["الإسماعيلية","أبو صوير","التل الكبير","فايد","القصاصين","القنطرة"],
    "السويس": ["السويس","عتاقة","الجناين"],
    "بورسعيد": ["بورسعيد","بورفؤاد","الزهور","الضواحي"],
    "دمياط": ["دمياط","الزرقا","فارسكور","كفر سعد","رأس البر","عزبة البرج","كفر البطيخ","السرو","دمياط الجديدة"],
    "بني سويف": ["بني سويف","ببا","الفشن","إهناسيا","الواسطى","سمسطا","بني سويف الجديدة"],
    "الفيوم": ["الفيوم","أبشواي","إطسا","سنورس","طامية","يوسف الصديق"],
    "المنيا": ["المنيا","أبو قرقاص","بني مزار","دير مواس","سمالوط","مطاي","ملوي","العدوة","مغاغة"],
    "أسيوط": ["أسيوط","أبنوب","أبو تيج","البداري","الفتح","ديروط","القوصية","منفلوط","ساحل سليم"],
    "سوهاج": ["سوهاج","أخميم","البلينا","جرجا","دار السلام","الكوثر","المنشأة","ساقلتة","طما","طهطا"],
    "قنا": ["قنا","أبو تشت","الوقف","دشنا","فرشوط","نقادة","نجع حمادي","قفط","قوص"],
    "الأقصر": ["الأقصر","إسنا","أرمنت","البياضية","القرنة","الطود"],
    "أسوان": ["أسوان","إدفو","دراو","كوم أمبو","نصر النوبة"],
    "البحر الأحمر": ["الغردقة","الجونة","سفاجا","القصير","مرسى علم","رأس غارب"],
    "الوادي الجديد": ["الخارجة","الداخلة","الفرافرة","موط"],
    "مطروح": ["مطروح","الحمام","سيوة","الضبعة","العلمين"],
    "شمال سيناء": ["العريش","الشيخ زويد","بئر العبد","رفح","نخل"],
    "جنوب سيناء": ["الطور","أبو رديس","سانت كاترين","شرم الشيخ","دهب","نويبع","طابا"]
  };

  function injectCheckout() {
    var html =
    '<div class="modal-overlay" id="checkoutModal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle">' +
      '<div id="checkoutForm">' +
        '<div class="modal-header"><h2 id="checkoutTitle">تفاصيل طلبك</h2><button class="round-close" type="button" data-close-checkout aria-label="إغلاق">✕</button></div>' +
        '<div class="order-summary-box" id="checkoutSummary"></div>' +
        '<div class="payment-choice"><h4>💳 طريقة الدفع</h4><div class="payment-options">' +
          '<button type="button" class="payment-opt selected" data-pay="عند الاستلام"><div class="payment-opt-icon">💵</div><div class="payment-opt-label">الدفع عند الاستلام</div><div class="payment-opt-sub">كاش مع المندوب</div><div class="recommended-badge">الأكثر شيوعاً</div></button>' +
          '<button type="button" class="payment-opt" data-pay="تحويل إلكتروني"><div class="payment-opt-icon">📱</div><div class="payment-opt-label">تحويل إلكتروني</div><div class="payment-opt-sub">فودافون كاش / إنستاباي</div></button>' +
        '</div></div>' +
        '<div class="form-group" data-field="fName"><label class="form-label" for="fName">الاسم الكامل <span class="req">*</span></label><input type="text" class="form-input" id="fName" autocomplete="name" placeholder="اكتب اسمك بالكامل"><div class="field-error">اكتب اسمك</div></div>' +
        '<div class="form-group" data-field="fPhone"><label class="form-label" for="fPhone">رقم الموبايل <span class="req">*</span></label><input type="tel" class="form-input" id="fPhone" autocomplete="tel" inputmode="numeric" placeholder="01XXXXXXXXX" maxlength="14" dir="ltr" style="text-align:right"><div class="field-error">اكتب رقم موبايل مصري صحيح من 11 رقم يبدأ بـ 01</div></div>' +
        '<div class="form-group"><label class="form-label" for="fPhone2">رقم موبايل تاني <span class="opt">(اختياري)</span></label><input type="tel" class="form-input" id="fPhone2" inputmode="numeric" placeholder="01XXXXXXXXX" maxlength="14" dir="ltr" style="text-align:right"></div>' +
        '<div class="form-group" data-field="fGov"><label class="form-label" for="fGov">المحافظة <span class="req">*</span></label><select class="form-select" id="fGov"><option value="">— اختر المحافظة —</option></select><div class="field-error">اختار المحافظة</div></div>' +
        '<div class="form-group" data-field="fCity"><label class="form-label" for="fCity">المدينة / المركز <span class="req">*</span></label><select class="form-select" id="fCity" disabled><option value="">— اختر المحافظة الأول —</option></select><div class="field-error">اختار المدينة</div></div>' +
        '<div class="form-group" data-field="fAddress"><label class="form-label" for="fAddress">العنوان بالتفصيل <span class="req">*</span></label><input type="text" class="form-input" id="fAddress" autocomplete="street-address" placeholder="الشارع، علامة مميزة، رقم العمارة والدور"><div class="field-error">اكتب العنوان بالتفصيل</div></div>' +
        '<div class="form-group"><label class="form-label" for="fNotes">ملاحظات <span class="opt">(اختياري)</span></label><input type="text" class="form-input" id="fNotes" placeholder="مثلاً: ميعاد مناسب للتوصيل"></div>' +
        '<div class="form-group"><label class="form-label">موقعك على الخريطة <span class="opt">(اختياري)</span></label>' +
          '<button class="gps-btn" type="button" id="gpsBtn">📍 حدد موقعي تلقائياً</button><input type="hidden" id="fGPS">' +
        '</div>' +
        '<div class="policy-box"><strong>⚠️ سياسة الاسترجاع:</strong> الإرجاع في حالة العيب الصناعي فقط، ولا يُقبل بعد الاستخدام.</div>' +
        '<div class="form-alert" id="checkoutAlert"></div>' +
        '<button class="btn btn-gold btn-block" type="button" id="submitOrderBtn">✅ تأكيد الطلب</button>' +
      '</div>' +
      '<div class="success-msg" id="checkoutSuccess">' +
        '<div class="success-icon">🎉</div><h3 id="successTitle">تم استلام طلبك!</h3>' +
        '<p>فريقنا هيتواصل معاك خلال 24 ساعة لتأكيد الطلب وميعاد التوصيل.</p>' +
        '<div class="order-code-box"><small>كود طلبك</small><strong id="orderCodeDisplay">—</strong><small>احتفظ بالكود ده لمتابعة طلبك</small></div>' +
        '<a class="success-wa" id="successWaBtn" href="#" target="_blank" rel="noopener">' + WA_SVG + ' أكد طلبك على واتساب</a>' +
        '<button class="btn btn-outline btn-block" type="button" data-close-checkout>العودة للمتجر</button>' +
      '</div>' +
    '</div></div>';
    var holder = document.createElement('div');
    holder.innerHTML = html;
    document.body.appendChild(holder.firstChild);
    var gov = $('#fGov');
    Object.keys(EGYPT).forEach(function (g) { var o = document.createElement('option'); o.value = g; o.textContent = g; gov.appendChild(o); });
    on(gov, 'change', function () { fillCities(gov.value); clearFieldError('fGov'); });
    on($('#fCity'), 'change', function () { clearFieldError('fCity'); });
    ['fName', 'fPhone', 'fAddress'].forEach(function (id) { on($('#' + id), 'input', function () { clearFieldError(id); }); });
    on($('#gpsBtn'), 'click', getLocation);
    on($('#submitOrderBtn'), 'click', submitOrder);
    on($('#checkoutModal'), 'click', function (e) { if (e.target.id === 'checkoutModal') closeCheckout(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pay]'), function (b) {
      on(b, 'click', function () {
        selectedPayment = b.getAttribute('data-pay');
        Array.prototype.forEach.call(document.querySelectorAll('[data-pay]'), function (x) { x.classList.toggle('selected', x === b); });
      });
    });
  }
  var selectedPayment = 'عند الاستلام';
  function fillCities(gov) {
    var city = $('#fCity');
    city.innerHTML = '<option value="">— اختر المدينة —</option>';
    city.disabled = !gov;
    (EGYPT[gov] || []).forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; city.appendChild(o); });
  }
  function setFieldError(id) { var g = document.querySelector('[data-field="' + id + '"]'); if (g) g.classList.add('has-error'); var el = $('#' + id); if (el) el.classList.add('error'); }
  function clearFieldError(id) { var g = document.querySelector('[data-field="' + id + '"]'); if (g) g.classList.remove('has-error'); var el = $('#' + id); if (el) el.classList.remove('error'); }

  var checkoutOpenedAt = 0;
  function renderCheckoutSummary() {
    var sub = cartSubtotal(), n = cartCount();
    $('#checkoutSummary').innerHTML = cart.map(function (i) {
      return '<div class="summary-item"><div class="s-img">' + D.imgTag(i.img, { alt: i.name, variant: 't' }) + '</div>' +
        '<span class="summary-item-name"><small>' + esc(i.categoryName) + '</small>' + esc(i.name) + '</span>' +
        '<span class="summary-item-qty">×' + i.qty + '</span><span class="summary-item-price">' + money(i.price * i.qty) + '</span></div>';
    }).join('') +
    '<button class="summary-edit" type="button" data-edit-cart>تعديل الطلب أو إضافة تصميم</button>' +
    '<div class="totals-row"><span>المنتجات (' + n + ' قطعة)</span><span>' + money(sub) + '</span></div>' +
    '<div class="totals-row"><span>الشحن</span><span>' + money(shipping()) + '</span></div>' +
    '<div class="totals-row grand"><span>الإجمالي</span><span>' + money(sub + shipping()) + '</span></div>';
    D.hydrateMedia($('#checkoutSummary'));
  }
  function openCheckout() {
    if (!cart.length) { openPicker(); toast('اختار تصميم الأول'); return; }
    setCart(false); setMenu(false);
    $('#checkoutForm').style.display = '';
    $('#checkoutSuccess').classList.remove('show');
    $('#checkoutAlert').classList.remove('show');
    renderCheckoutSummary();
    $('#checkoutModal').classList.add('open');
    openLayer('checkout');
    checkoutOpenedAt = Date.now();
    track({ modalOpens: 1 });
  }
  function closeCheckout() {
    var m = $('#checkoutModal'); if (!m || !m.classList.contains('open')) return;
    m.classList.remove('open'); closeLayer('checkout');
    if (checkoutOpenedAt) {
      var secs = Math.round((Date.now() - checkoutOpenedAt) / 1000);
      if (secs > 0 && secs < 3600) track({ modalTime: secs, modalTimeSamples: 1 });
      checkoutOpenedAt = 0;
    }
  }

  function getLocation() {
    var btn = $('#gpsBtn');
    if (!navigator.geolocation) { btn.textContent = '❌ المتصفح مش بيدعم تحديد الموقع'; return; }
    btn.textContent = '⏳ جاري تحديد موقعك...'; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      var link = 'https://maps.google.com/?q=' + lat + ',' + lng;
      $('#fGPS').value = link;
      btn.disabled = false;
      btn.textContent = '✅ تم تحديد موقعك';
      fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=ar')
        .then(function (r) { return r.json(); }).then(function (data) {
          var a = data.address || {};
          var norm = function (s) { return String(s || '').replace(/محافظة\s*/g, '').replace(/^(مدينة|مركز|قسم)\s*/g, '').replace(/\s+/g, ' ').trim(); };
          var g = norm(a.state);
          var match = Object.keys(EGYPT).filter(function (k) { return norm(k) === g || g.indexOf(norm(k)) > -1 || norm(k).indexOf(g) > -1; })[0];
          if (!g || !match) return;
          $('#fGov').value = match; fillCities(match); clearFieldError('fGov');
          var c = norm(a.city || a.town || a.village || a.suburb || a.district || '');
          var cm = (EGYPT[match] || []).filter(function (x) { return c && (norm(x) === c || c.indexOf(norm(x)) > -1 || norm(x).indexOf(c) > -1); })[0];
          if (cm) { $('#fCity').value = cm; clearFieldError('fCity'); }
          btn.textContent = '✅ تم تحديد موقعك (' + match + (cm ? ' — ' + cm : '') + ')';
        }).catch(function () {});
    }, function (err) {
      btn.disabled = false;
      btn.textContent = err.code === 1 ? '❌ رفضت إذن الموقع — تقدر تكمل من غيره' : '❌ تعذر تحديد الموقع — تقدر تكمل من غيره';
    }, { timeout: 10000, enableHighAccuracy: true });
  }

  function detectDevice() {
    var ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return '📱 iPhone';
    if (/Android/i.test(ua)) return '🤖 Android';
    if (/Windows/i.test(ua)) return '💻 Windows';
    if (/Mac/i.test(ua)) return '🖥️ Mac';
    return '🌐 غير معروف';
  }

  function htmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function nextOrderCode() {
    var write = D.fs.writeIncrement('meta/orderCounter', { count: 1 });
    var p = D.fs.commit([write]).then(function (r) {
      var tr = r.writeResults && r.writeResults[0] && r.writeResults[0].transformResults;
      var n = tr && tr[0] ? Number(tr[0].integerValue || tr[0].doubleValue) : NaN;
      if (!isFinite(n) || n <= 0) throw new Error('bad counter');
      return 'SED-' + String(n).padStart(4, '0');
    });
    return timeout(p, 6000).catch(function () { return 'SED-' + String(Math.floor(100000 + Math.random() * 900000)); });
  }
  function timeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  function sendTelegram(order) {
    var T = D.CONFIG.telegram;
    if (!T.botToken || !T.chatId) return Promise.reject(new Error('no telegram'));
    var api = 'https://api.telegram.org/bot' + T.botToken + '/';
    var lines = [
      '🛍️ <b>طلب جديد — سيدرا ستور</b>', '',
      '🆔 رقم الطلب: <b>' + htmlEsc(order.orderCode) + '</b>', '',
      '👤 الاسم: ' + htmlEsc(order.name),
      '📱 الموبايل: <code>' + htmlEsc(order.phone) + '</code>',
      order.phone2 ? '📱 موبايل تاني: <code>' + htmlEsc(order.phone2) + '</code>' : null, '',
      '🎁 <b>المنتجات:</b>'
    ];
    order.items.forEach(function (i) {
      lines.push('• [' + htmlEsc(i.categoryName) + '] ' + htmlEsc(i.name) + ' × ' + i.qty + ' = ' + (i.price * i.qty) + ' ج');
    });
    lines.push('', '📦 عدد القطع: ' + order.itemsCount,
      '💰 المنتجات: ' + order.subtotal + ' ج',
      '🚚 الشحن: ' + order.shipping + ' ج',
      '💵 <b>الإجمالي: ' + order.total + ' ج</b>', '',
      '📍 <b>العنوان</b>',
      '🏙️ ' + htmlEsc(order.governorate) + ' — ' + htmlEsc(order.city),
      '🏠 ' + htmlEsc(order.address),
      order.gps ? '🗺️ ' + htmlEsc(order.gps) : null,
      order.notes ? '📝 ملاحظات: ' + htmlEsc(order.notes) : null, '',
      '💳 الدفع: ' + htmlEsc(order.paymentMethod),
      '📱 الجهاز: ' + htmlEsc(order.deviceType),
      '📅 ' + htmlEsc(new Date().toLocaleString('ar-EG')));
    var text = lines.filter(function (l) { return l !== null; }).join('\n');

    function post(method, body) {
      return fetch(api + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j.ok) throw new Error(j.description || 'telegram error'); return j; });
    }
    var photos = order.items.map(function (i) {
      return { url: D.absoluteUrl(i.img), caption: i.name + ' × ' + i.qty };
    }).filter(function (x) { return x.url && !/^https?:\/\/(localhost|127\.)/.test(x.url); });

    var photoStep = Promise.resolve();
    if (photos.length === 1) {
      photoStep = post('sendPhoto', { chat_id: T.chatId, photo: photos[0].url, caption: photos[0].caption }).catch(function () {});
    } else if (photos.length > 1) {
      var chunks = [];
      for (var i = 0; i < photos.length; i += 10) chunks.push(photos.slice(i, i + 10));
      photoStep = chunks.reduce(function (p, ch) {
        return p.then(function () {
          return post('sendMediaGroup', { chat_id: T.chatId, media: ch.map(function (x) { return { type: 'photo', media: x.url, caption: x.caption }; }) }).catch(function () {});
        });
      }, Promise.resolve());
    }
    return photoStep.then(function () {
      return post('sendMessage', { chat_id: T.chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
        .catch(function () { return post('sendMessage', { chat_id: T.chatId, text: text.replace(/<[^>]+>/g, '') }); });
    });
  }

  function saveOrderToFirestore(order) {
    var id = D.randomId(20);
    var data = JSON.parse(JSON.stringify(order));
    return D.fs.commit([D.fs.writeCreate('orders/' + id, data, ['createdAt'])]).then(function () { return id; });
  }

  var submitting = false;
  function submitOrder() {
    if (submitting) return;
    var val = function (id) { var el = $('#' + id); return el ? el.value.trim() : ''; };
    var name = val('fName'), address = val('fAddress'), gov = val('fGov'), city = val('fCity');
    var phone = D.toLatinDigits(val('fPhone')).replace(/[\s-]/g, '').replace(/^\+?20(?=1)/, '0');
    var phone2 = D.toLatinDigits(val('fPhone2')).replace(/[\s-]/g, '').replace(/^\+?20(?=1)/, '0');
    var ok = true, firstBad = null;
    function bad(id) { setFieldError(id); ok = false; if (!firstBad) firstBad = id; }
    if (name.length < 2) bad('fName');
    if (!/^01[0125]\d{8}$/.test(phone)) bad('fPhone');
    if (!gov) bad('fGov');
    if (!city) bad('fCity');
    if (address.length < 5) bad('fAddress');
    var alertBox = $('#checkoutAlert');
    if (!cart.length) { alertBox.textContent = 'طلبك فاضي — أضف تصميم الأول.'; alertBox.classList.add('show'); return; }
    if (!ok) {
      alertBox.textContent = 'راجع الخانات المعلّمة باللون الأحمر.'; alertBox.classList.add('show');
      var el = $('#' + firstBad); if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    alertBox.classList.remove('show');
    submitting = true;
    var btn = $('#submitOrderBtn');
    btn.disabled = true; btn.textContent = '⏳ جاري إرسال الطلب...';

    var items = cart.map(function (i) {
      return { productId: i.productId, categoryId: i.categoryId, categoryName: i.categoryName, name: i.name, color: i.color || '',
        img: D.isMedia(i.img) ? i.img : (D.absoluteUrl(i.img) || i.img), qty: i.qty, price: i.price };
    });
    var subtotal = cartSubtotal(), ship = shipping();

    nextOrderCode().then(function (code) {
      var order = {
        orderCode: code, name: name, phone: phone, phone2: /^01[0125]\d{8}$/.test(phone2) ? phone2 : null,
        address: address, governorate: gov, city: city, gps: val('fGPS') || null, notes: val('fNotes') || null,
        paymentMethod: selectedPayment, deviceType: detectDevice(), status: 'جديد',
        items: items, itemsCount: cartCount(), subtotal: subtotal, shipping: ship, total: subtotal + ship,
        product: items.map(function (i) { return i.name; }).join('، '), productId: items[0].productId,
        categories: items.map(function (i) { return i.categoryName; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),
        orderDuration: checkoutOpenedAt ? Math.round((Date.now() - checkoutOpenedAt) / 1000) : null,
        source: state.page
      };
      return Promise.all([
        timeout(saveOrderToFirestore(order), 12000).then(function () { return true; }, function (e) { console.warn('Order save failed', e); return false; }),
        timeout(sendTelegram(order), 15000).then(function () { return true; }, function (e) { console.warn('Telegram failed', e); return false; })
      ]).then(function (res) { return { order: order, saved: res[0], notified: res[1] }; });
    }).then(function (r) {
      var o = r.order;
      var summary = 'السلام عليكم، أنا ' + o.name + ' وعندي طلب رقم ' + o.orderCode + ':\n' +
        o.items.map(function (i) { return '• ' + i.categoryName + ' — ' + i.name + ' × ' + i.qty; }).join('\n') +
        '\nالإجمالي: ' + o.total + ' ج\nالعنوان: ' + o.governorate + ' — ' + o.city + ' — ' + o.address + '\nالموبايل: ' + o.phone;
      if (!r.saved && !r.notified) {
        alertBox.innerHTML = 'مقدرناش نبعت الطلب بسبب مشكلة في الاتصال. جرّب تاني، أو <a href="' + esc(waLink(summary)) + '" target="_blank" rel="noopener" style="color:#128C7E;font-weight:800">ابعت الطلب على واتساب مباشرة</a>.';
        alertBox.classList.add('show');
        return;
      }
      var openedAt = checkoutOpenedAt; checkoutOpenedAt = 0;
      track({ orders: 1, modalTime: openedAt ? Math.min(3600, Math.round((Date.now() - openedAt) / 1000)) : 0, modalTimeSamples: openedAt ? 1 : 0 });
      cart = []; saveCart();
      $('#successTitle').textContent = 'تم استلام طلبك يا ' + o.name + '! 🎉';
      $('#orderCodeDisplay').textContent = o.orderCode;
      $('#successWaBtn').href = waLink(summary);
      $('#checkoutForm').style.display = 'none';
      $('#checkoutSuccess').classList.add('show');
      $('#checkoutModal .modal').scrollTop = 0;
    }).catch(function (e) {
      console.error(e);
      alertBox.textContent = 'حصلت مشكلة غير متوقعة. جرّب تاني.'; alertBox.classList.add('show');
    }).then(function () {
      submitting = false; btn.disabled = false; btn.textContent = '✅ تأكيد الطلب';
    });
  }

  /* ================= ANALYTICS + PRESENCE ================= */
  var trackQueue = {}, trackTimer = null;
  function track(incs, keepalive) {
    Object.keys(incs).forEach(function (k) { if (incs[k]) trackQueue[k] = (trackQueue[k] || 0) + incs[k]; });
    if (keepalive) return flushTrack(true);
    clearTimeout(trackTimer);
    trackTimer = setTimeout(flushTrack, 1200);
  }
  function flushTrack(keepalive) {
    var q = trackQueue; trackQueue = {};
    if (!Object.keys(q).length || location.protocol === 'file:') return;
    D.fs.commit([D.fs.writeIncrement('analytics/summary', q)], { keepalive: !!keepalive }).catch(function () {});
  }
  function initAnalytics() {
    try {
      if (!sessionStorage.getItem('sedra_visit')) { sessionStorage.setItem('sedra_visit', '1'); track({ visitors: 1 }); }
    } catch (e) {}
    var viewKey = { home: 'homeViews', category: 'categoryViews', product: 'productViews' }[state.page];
    if (viewKey) track((function () { var o = {}; o[viewKey] = 1; return o; })());
    var start = Date.now(), sent = false;
    function leave() {
      if (sent) return; sent = true;
      var secs = Math.round((Date.now() - start) / 1000);
      var o = {};
      if (secs > 0 && secs < 1800) { o[state.page + 'Time'] = secs; o[state.page + 'TimeSamples'] = 1; }
      track(o, true);
    }
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); });

    // presence (real "online now" counter in admin)
    var sid;
    try { sid = sessionStorage.getItem('sedra_sid') || D.randomId(16); sessionStorage.setItem('sedra_sid', sid); } catch (e) { sid = D.randomId(16); }
    function beat() {
      if (document.visibilityState !== 'visible' || location.protocol === 'file:') return;
      D.fs.commit([D.fs.writeMerge('presence/' + sid, { page: state.page }, ['lastSeen'])]).catch(function () {});
    }
    beat();
    setInterval(beat, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') beat(); });
  }

  /* ================= THEME + SETTINGS DOM ================= */
  function applyTheme(theme) {
    theme = theme || {};
    var root = document.documentElement;
    if (/^#[0-9a-f]{6}$/i.test(theme.gold || '')) root.style.setProperty('--gold', theme.gold); else root.style.removeProperty('--gold');
    if (/^#[0-9a-f]{6}$/i.test(theme.bg || '')) root.style.setProperty('--cream', theme.bg); else root.style.removeProperty('--cream');
    if (/^#[0-9a-f]{6}$/i.test(theme.header || '')) root.style.setProperty('--black', theme.header); else root.style.removeProperty('--black');
  }
  function applySettingsDOM() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa-link]'), function (a) {
      a.href = waLink(a.getAttribute('data-wa-text') || '');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-shipping]'), function (el) { el.textContent = money(shipping()); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa-display]'), function (el) {
      el.textContent = '0' + waNumber().replace(/^20/, '');
    });
  }

  /* ================= CARDS (shared markup) ================= */
  function ratioValue(r) { var p = String(r).split('/'); return parseFloat(p[0]) / parseFloat(p[1]); }
  function gridAttrs(c) {
    var r = ratioValue(c.cardRatio);
    var minw = r > 1.1 ? 290 : (r < 0.9 ? 190 : 230);
    return { cls: 'p-grid' + (r > 1.1 ? ' wide' : ''), style: '--minw:' + minw + 'px' };
  }
  function productCardHTML(p, opts) {
    opts = opts || {};
    var cat = state.catalog, c = D.categoryById(cat, p.categoryId) || D.normalizeCategory('', {});
    var price = D.effectivePrice(cat, p), old = D.effectiveOldPrice(cat, p);
    var n = D.productImages(p).length;
    var href = 'product.html?id=' + encodeURIComponent(p.id);
    var q = inCartQty(p.id);
    return '<article class="p-card" style="--ratio:' + c.cardRatio + ';--fit:' + c.imageFit + '">' +
      '<a href="' + href + '" class="p-img' + (c.imageFit === 'contain' ? ' fit-contain' : '') + '" aria-label="' + esc(p.name) + '">' +
        D.imgTag(p.mainImg, { alt: p.name, variant: 't', loading: opts.eager ? 'eager' : 'lazy' }) +
        (c.badge ? '<span class="p-badge">✦ ' + esc(c.badge) + '</span>' : '') +
        (n > 1 ? '<span class="p-angles">📷 ' + n + ' صور</span>' : '') +
      '</a>' +
      '<div class="p-info">' +
        '<a href="' + href + '" style="text-decoration:none;color:inherit"><h3 class="p-name">' + esc(p.name) + '</h3></a>' +
        '<div class="p-meta">' + esc(p.color || c.tagline || '') + '</div>' +
        '<div class="p-foot"><div class="price-line"><span class="price-now">' + money(price) + '</span>' + (old ? '<span class="price-was">' + money(old) + '</span>' : '') + '</div>' +
        '<button type="button" class="p-add' + (q ? ' added' : '') + '" data-add="' + esc(p.id) + '">' + (q ? '✓ في الطلب' : '+ أضف للطلب') + '</button></div>' +
      '</div></article>';
  }
  function categoryCardHTML(c) {
    var cat = state.catalog;
    var list = D.productsOf(cat, c.id);
    var cover = c.coverImg || (list[0] && list[0].mainImg) || '';
    return '<a class="cat-card" href="category.html?c=' + encodeURIComponent(c.id) + '">' +
      '<div class="cat-card-media' + (c.imageFit === 'cover' ? ' cover' : '') + '">' + D.imgTag(cover, { alt: c.name, variant: 't' }) +
        '<span class="cat-card-count">' + list.length + ' تصميم</span></div>' +
      '<div class="cat-card-body"><div class="cat-card-name">' + esc(c.icon) + ' ' + esc(c.name) + '</div>' +
        '<div class="cat-card-tag">' + esc(c.tagline || c.description) + '</div>' +
        '<div class="cat-card-foot"><div class="price-line"><span class="price-now">' + money(c.price) + '</span>' +
          (c.oldPrice && c.oldPrice > c.price ? '<span class="price-was">' + money(c.oldPrice) + '</span>' : '') + '</div>' +
          '<span class="btn btn-dark">تسوّق الصنف</span></div>' +
      '</div></a>';
  }

  /* ================= EVENTS ================= */
  function emit(type) { state.listeners.forEach(function (l) { if (l.type === type) try { l.fn(state.catalog); } catch (e) { console.error(e); } }); }
  function onEvent(type, fn) { state.listeners.push({ type: type, fn: fn }); }

  function bindGlobal() {
    on($('#hamburgerBtn'), 'click', function () { setMenu(!$('#siteMenu').classList.contains('open')); });
    on($('#cartBtn'), 'click', openCart);
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : e.target.parentElement;
      if (!t || !t.closest) return;
      var el;
      if (t.closest('#menuOverlay') || t.closest('[data-close-menu]')) return setMenu(false);
      if (t.closest('#cartOverlay') || t.closest('[data-close-cart]')) return setCart(false);
      if ((el = t.closest('[data-add]'))) { e.preventDefault(); if (addToCart(el.getAttribute('data-add'), 1)) refreshAddButtons(); return; }
      if ((el = t.closest('[data-qty]'))) {
        var id = el.getAttribute('data-qty'), cur = inCartQty(id) + parseInt(el.getAttribute('data-delta'), 10);
        if (cur <= 0) removeItem(id); else setQty(id, cur);
        refreshAddButtons(); return;
      }
      if ((el = t.closest('[data-remove]'))) { removeItem(el.getAttribute('data-remove')); refreshAddButtons(); return; }
      if (t.closest('[data-open-picker]')) { e.preventDefault(); return openPicker(); }
      if ((el = t.closest('[data-picker-tab]'))) { pickerCat = el.getAttribute('data-picker-tab'); return renderPicker(); }
      if ((el = t.closest('[data-pick]'))) { addToCart(el.getAttribute('data-pick'), 1, true); renderPicker(); refreshAddButtons(); return; }
      if (t.closest('[data-close-picker]') || t.id === 'pickerOverlay') { closePicker(); if (cart.length && !$('#checkoutModal').classList.contains('open')) openCart(); else if ($('#checkoutModal').classList.contains('open')) renderCheckoutSummary(); return; }
      if (t.closest('[data-checkout]')) { e.preventDefault(); return openCheckout(); }
      if (t.closest('[data-close-checkout]')) return closeCheckout();
      if (t.closest('[data-edit-cart]')) { closeCheckout(); return openCart(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('#pickerOverlay').classList.contains('open')) return closePicker();
      if ($('#checkoutModal').classList.contains('open')) return closeCheckout();
      setCart(false); setMenu(false);
    });
    window.addEventListener('storage', function (e) { if (e.key === CART_KEY) { loadCart(); renderCartUI(); refreshAddButtons(); } });
  }
  function refreshAddButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.p-add[data-add]'), function (b) {
      var q = inCartQty(b.getAttribute('data-add'));
      b.classList.toggle('added', q > 0);
      b.textContent = q ? '✓ في الطلب' : '+ أضف للطلب';
    });
    emit('cart');
  }

  /* ================= INIT ================= */
  function init(opts) {
    opts = opts || {};
    state.page = opts.page || 'home';
    state.activeCategory = opts.activeCategory || null;
    injectChrome();
    loadCart();
    renderCartUI();
    renderMenu();
    bindGlobal();
    try { var th = JSON.parse(localStorage.getItem('sedra_catalog_v2') || 'null'); if (th && th.data) applyTheme(th.data.theme); } catch (e) {}

    D.loadCatalog(function (catalog, fromCache) {
      state.catalog = catalog;
      applyTheme(catalog.theme);
      applySettingsDOM();
      reconcileCart();
      renderCartUI();
      if (opts.onCatalog) opts.onCatalog(catalog, fromCache);
      renderMenu();
      if ($('#pickerOverlay').classList.contains('open')) renderPicker();
    });
    initAnalytics();
  }

  global.Sedra = {
    init: init,
    state: state,
    toast: toast,
    openCart: openCart,
    openPicker: openPicker,
    openCheckout: openCheckout,
    addToCart: addToCart,
    inCartQty: inCartQty,
    cartCount: cartCount,
    productCardHTML: productCardHTML,
    categoryCardHTML: categoryCardHTML,
    gridAttrs: gridAttrs,
    ratioValue: ratioValue,
    waLink: waLink,
    on: onEvent,
    refreshAddButtons: refreshAddButtons,
    track: track,
    CART_SVG: CART_SVG,
    WA_SVG: WA_SVG
  };
})(window);
