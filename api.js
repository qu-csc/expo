/* الاتصال بقاعدة البيانات (Supabase) — مشترك بين كل الصفحات
 * كل الطلبات تذهب إلى دالة واحدة محمية: /rest/v1/rpc/api
 * expoApi(action, data, { tries, timeout }) → يعيد الرد أو يرمي خطأً برسالة عربية واضحة
 */
(function () {
  var C = window.EXPO_CONFIG || {};
  var BASE = String(C.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  var KEY = String(C.SUPABASE_KEY || '').trim();
  var ENDPOINT = BASE + '/rest/v1/rpc/api';

  window.expoReady = /^https:\/\/.+/.test(BASE) && KEY.length > 20 && KEY.indexOf('PASTE') < 0;

  function headers() {
    var h = { 'Content-Type': 'application/json', 'apikey': KEY };
    if (/^eyJ/.test(KEY)) h.Authorization = 'Bearer ' + KEY; // المفتاح القديم (anon) يحتاج هذا السطر أيضًا
    return h;
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function fail(msg, retry) { var e = new Error(msg); e.network = !!retry; return e; }

  async function once(action, data, timeout) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeout) : 0;
    var res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: action, p: data || {} }),
        signal: ctl ? ctl.signal : undefined,
        cache: 'no-store'
      });
    } catch (e) {
      throw fail(e && e.name === 'AbortError' ? 'الاتصال بطيء، حاول مرة أخرى' : 'تعذر الاتصال، تحقق من الإنترنت', true);
    } finally { clearTimeout(timer); }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw fail('مفتاح Supabase غير صحيح في config.js');
      if (res.status === 404) throw fail('لم يتم تشغيل ملف قاعدة البيانات (schema.sql) في Supabase');
      if (res.status === 540 || res.status === 503) throw fail('مشروع Supabase متوقف مؤقتًا — افتحه من لوحة Supabase واضغط Restore', res.status === 503);
      throw fail('خطأ من الخادم (' + res.status + ')', res.status >= 500);
    }
    try { return await res.json(); }
    catch (e) { throw fail('رد غير صالح من الخادم', true); }
  }

  window.expoApi = async function (action, data, opt) {
    opt = opt || {};
    if (!window.expoReady) throw fail('ضع رابط المشروع والمفتاح العام في ملف config.js');
    var tries = opt.tries || 3, timeout = opt.timeout || 12000, j = null, err = null;
    for (var i = 0; i < tries; i++) {
      try { j = await once(action, data, timeout); j._retried = i > 0; break; }
      catch (e) {
        err = e;
        if (!e.network || i === tries - 1) break;   // أخطاء الإعداد لا تُعاد
        await wait(400 + i * 800);
      }
    }
    if (!j) throw err;
    if (!j.ok) throw new Error(j.error || 'حدث خطأ');
    return j;
  };
})();
