/* =====================================================================
   Sedra Store — Meta (Facebook) Pixel
   Mirrors Shopify's event logic:
   PageView · ViewContent · ViewCategory · AddToCart · InitiateCheckout · Purchase · Contact
   - content_ids always use the same product IDs as the catalog feed (sponge-1 ...)
   - every event carries an eventID so a future Conversions API can deduplicate
   - advanced matching (email/phone/name/city) is sent on checkout, hashed by the pixel
   ===================================================================== */
(function (global) {
  'use strict';

  var CURRENCY = 'EGP';
  var FIRED = {};   // guards against double-firing (e.g. Purchase)

  function pixelId() {
    // admin setting wins; falls back to the default baked into the page
    try {
      var c = JSON.parse(localStorage.getItem('sedra_catalog_v2') || 'null');
      var p = c && c.data && c.data.settings && c.data.settings.pixelId;
      if (p === '') return '';            // explicitly disabled in the admin
      if (p) return String(p).trim();
    } catch (e) {}
    return global.SEDRA_PIXEL_DEFAULT || '';
  }

  function newEventId(prefix) {
    return (prefix || 'ev') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function ready() { return typeof global.fbq === 'function' && !!pixelId(); }

  function track(name, params, opts) {
    if (!ready()) return null;
    opts = opts || {};
    var eventId = opts.eventID || newEventId(name.toLowerCase());
    try {
      global.fbq(opts.custom ? 'trackCustom' : 'track', name, params || {}, { eventID: eventId });
      if (global.SEDRA_PIXEL_DEBUG) console.log('[pixel]', name, params, eventId);
    } catch (e) { console.warn('pixel error', e); }
    return eventId;
  }

  // ---- payload builders (same shape Shopify sends) ----
  function itemOf(D, cat, product, qty, price) {
    return {
      id: product.id,
      quantity: qty || 1,
      item_price: price != null ? price : D.effectivePrice(cat, product)
    };
  }
  function contentsPayload(items) {
    return {
      content_type: 'product',
      content_ids: items.map(function (i) { return i.id; }),
      contents: items,
      num_items: items.reduce(function (s, i) { return s + i.quantity; }, 0),
      value: Number(items.reduce(function (s, i) { return s + i.item_price * i.quantity; }, 0).toFixed(2)),
      currency: CURRENCY
    };
  }

  var Pixel = {
    newEventId: newEventId,
    enabled: ready,

    viewContent: function (D, cat, product) {
      var c = D.categoryById(cat, product.categoryId) || {};
      var price = D.effectivePrice(cat, product);
      return track('ViewContent', {
        content_type: 'product',
        content_ids: [product.id],
        contents: [{ id: product.id, quantity: 1, item_price: price }],
        content_name: product.name,
        content_category: c.name || '',
        value: price,
        currency: CURRENCY
      });
    },

    viewCategory: function (D, cat, category) {
      var ids = D.productsOf(cat, category.id).map(function (p) { return p.id; }).slice(0, 10);
      return track('ViewCategory', {
        content_type: 'product_group',
        content_ids: ids,
        content_category: category.name,
        content_name: category.name,
        value: category.price,
        currency: CURRENCY
      }, { custom: false });
    },

    addToCart: function (D, cat, product, qty) {
      var c = D.categoryById(cat, product.categoryId) || {};
      var price = D.effectivePrice(cat, product);
      return track('AddToCart', {
        content_type: 'product',
        content_ids: [product.id],
        contents: [{ id: product.id, quantity: qty, item_price: price }],
        content_name: product.name,
        content_category: c.name || '',
        value: Number((price * qty).toFixed(2)),
        currency: CURRENCY
      });
    },

    initiateCheckout: function (items) {
      return track('InitiateCheckout', contentsPayload(items));
    },

    // Advanced matching before Purchase — raw values, the pixel hashes them itself
    identify: function (user) {
      if (!ready()) return;
      var data = {};
      if (user.email) data.em = String(user.email).trim().toLowerCase();
      if (user.phone) data.ph = String(user.phone).replace(/\D/g, '').replace(/^0/, '20'); // 010... -> 2010...
      if (user.firstName) data.fn = user.firstName;
      if (user.lastName) data.ln = user.lastName;
      if (user.city) data.ct = String(user.city).replace(/\s/g, '').toLowerCase();
      if (user.state) data.st = String(user.state).replace(/\s/g, '').toLowerCase();
      data.country = 'eg';
      try { global.fbq('init', pixelId(), data); } catch (e) {}
    },

    purchase: function (order) {
      if (FIRED['purchase:' + order.orderCode]) return null;   // never count an order twice
      FIRED['purchase:' + order.orderCode] = true;
      var items = order.items.map(function (i) { return { id: i.productId, quantity: i.qty, item_price: i.price }; });
      return track('Purchase', {
        content_type: 'product',
        content_ids: items.map(function (i) { return i.id; }),
        contents: items,
        num_items: order.itemsCount,
        value: Number(Number(order.total).toFixed(2)),   // includes shipping, like Shopify
        currency: CURRENCY,
        order_id: order.orderCode
      }, { eventID: order.orderCode });                  // order code = dedup key for the Conversions API
    },

    contact: function (where) {
      return track('Contact', { content_name: where || 'whatsapp' });
    }
  };

  global.SedraPixel = Pixel;
})(window);
