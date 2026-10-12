const $ = (selector) => document.querySelector(selector);
let me = null;
let mode = 'login';
let googlePromptRequested = false;
const USER_CACHE_KEY = 'hoost_display_user';

function cacheUser(user) {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ name: user.name || '', email: user.email || '' }));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch (_) {}
}

function readCachedUser() {
  try {
    const value = localStorage.getItem(USER_CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch (_) { return null; }
}

function updateAccountIcon(user) {
  const account = document.getElementById('accountOpen');
  const initial = document.getElementById('accountInitial');
  const loginButton = document.getElementById('loginOpen');
  if (!account || !loginButton) return;
  const signedIn = Boolean(user);
  account.classList.toggle('hidden', !signedIn);
  loginButton.classList.toggle('hidden', signedIn);
  if (initial && signedIn) {
    const label = user.name || user.email || 'حسابي';
    initial.textContent = String(label).trim().charAt(0).toUpperCase() || 'ح';
    account.title = user.email || 'حسابك';
    account.setAttribute('aria-label', 'فتح صفحة حساب ' + (user.email || 'المستخدم'));
  }
}

function openGoogleAccountChooser() {
  googlePromptRequested = true;
  if (window.google?.accounts?.id) {
    // Show Google's account picker/One Tap UI. The official button remains
    // available as a reliable fallback when browser settings block the prompt.
    google.accounts.id.prompt();
    googlePromptRequested = false;
  }
}

// Google Identity Services: Google returns a credential, then the backend must
// verify it and create the site's normal session at POST /api/google-login.
window.initGoogleSignIn = function initGoogleSignIn() {
  if (!window.google?.accounts?.id) return;
  google.accounts.id.initialize({
    client_id: window.HOOST_GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true
  });
  const target = document.getElementById('googleSignInButton');
  if (target) {
    target.innerHTML = '';
    google.accounts.id.renderButton(target, {
      type: 'standard', theme: 'filled_black', size: 'large',
      text: 'continue_with', shape: 'rectangular', width: 320,
      logo_alignment: 'left', locale: 'ar'
    });
  }
  if (googlePromptRequested) openGoogleAccountChooser();
};

async function handleGoogleCredential(response) {
  const message = document.getElementById('authMsg');
  if (!response?.credential) {
    message.textContent = 'لم يصل رمز تسجيل الدخول من Google. حاول مرة أخرى.';
    return;
  }
  message.textContent = 'جارٍ التحقق من حساب Google...';
  try {
    // Do not trust or decode the token as authentication in the browser.
    // The backend must validate it with Google and establish a secure session.
    const data = await api('/api/google-login', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential })
    });
    me = data.user;
    cacheUser(me);
    updateAccountIcon(me);
    hideModal();
    await refresh();
  } catch (error) {
    message.textContent = error.message.includes('Failed to fetch') || error.message.includes('404')
      ? 'زر Google جاهز، لكن الخادم لا يحتوي بعد على /api/google-login. GitHub Pages وحده لا يستطيع إنشاء جلسة آمنة؛ يلزم ربطه بخادم خلفي.'
      : error.message;
  }
}



async function api(url, opt = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
    ...opt
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('تعذّر قراءة رد الخادم. تأكد أن الخادم يعمل.'); }
  if (!response.ok) throw new Error(data.error || 'حدث خطأ، حاول مرة أخرى.');
  return data;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function showModal(nextMode = 'login') {
  mode = nextMode;
  $('#modal').classList.remove('hidden');
  $('#authTitle').textContent = mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد';
  $('#authSubmit').textContent = mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب';
  $('#passInput').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('selected', button.dataset.mode === mode));
  $('#authMsg').textContent = '';
  $('#emailInput').focus();
}
function hideModal() { $('#modal').classList.add('hidden'); }
$('#loginOpen').addEventListener('click', () => {
  showModal('login');
  openGoogleAccountChooser();
});
$('#dashOpen').addEventListener('click', () => {
  if (me || readCachedUser()) window.location.href = './account.html';
  else showModal('login');
});
$('#close').addEventListener('click', hideModal);
$('#modal').addEventListener('click', (event) => { if (event.target === $('#modal')) hideModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideModal(); });
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => showModal(button.dataset.mode)));

$('#auth').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('#authSubmit');
  submit.disabled = true;
  $('#authMsg').textContent = 'جارٍ التحقق...';
  try {
    const data = await api('/api/' + (mode === 'login' ? 'login' : 'register'), {
      method: 'POST', body: JSON.stringify({ email: $('#emailInput').value.trim(), password: $('#passInput').value })
    });
    me = data.user;
    cacheUser(me);
    updateAccountIcon(me);
    hideModal();
    await refresh();
  } catch (error) { $('#authMsg').textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  const button = $('#logout'); button.disabled = true;
  try { await api('/api/logout', { method: 'POST', body: '{}' }); me = null; cacheUser(null); updateAccountIcon(null); await refresh(); }
  catch (error) { $('#msg').textContent = error.message; }
  finally { button.disabled = false; }
});

async function loadStatus() {
  const button = $('#refreshStatus'); button.disabled = true;
  try {
    const data = await api('/api/status');
    const mta = data.mta;
    $('#mtaStatus').textContent = !mta.configured ? 'غير مربوط — اضبط المسار في start-local.bat' : mta.running ? 'يعمل على هذا الكمبيوتر' : 'مجهز لكنه متوقف';
    $('#mtaDot').classList.toggle('ok', Boolean(mta.running));
    $('#logs').textContent = mta.logs?.length ? mta.logs.join('\n') : 'لا توجد سجلات حتى الآن.';
  } catch (error) { $('#mtaStatus').textContent = error.message; }
  finally { button.disabled = false; }
}
async function init() {
  const cachedUser = readCachedUser();
  if (cachedUser) updateAccountIcon(cachedUser);
  let data;
  try { data = await api('/api/status'); }
  catch (error) {
    console.debug('تعذر تحميل حالة الخادم:', error.message);
    const plansGrid = document.getElementById('plansGrid');
    if (plansGrid) plansGrid.textContent = 'خدمات الخادم غير متاحة حاليًا. يلزم تشغيل الخادم الخلفي.';
    await refresh();
    return;
  }
  $('#plansGrid').innerHTML = (data.plans || []).map((plan) => `<article class="plan"><div class="plan-tag">${plan.id === 'free' ? 'FREE TRIAL' : plan.id === 'pro' ? 'POPULAR' : 'HOOST PLAN'}</div><h3>${esc(plan.name)}</h3><div class="price">${plan.price === 0 ? 'مجانًا' : esc(plan.price) + ' ج.م'} <small>${plan.price ? '/ شهر' : ''}</small></div><p>${esc(plan.desc)}</p><ul><li>${plan.id === 'free' ? '72 ساعة تجربة' : esc(plan.ram) + ' RAM*'}</li><li>${esc(plan.slots)} لاعبًا كقيمة عرضية*</li><li>${esc(plan.disk)} مساحة عرضية*</li><li>لوحة عربية</li></ul><button type="button" data-plan="${esc(plan.id)}" class="${plan.id === 'free' ? 'primary' : 'outline'}">${plan.id === 'free' ? 'ابدأ مجانًا' : 'اختيار الباقة'}</button></article>`).join('');
  document.querySelectorAll('[data-plan]').forEach((button) => button.addEventListener('click', () => {
    if (!me) { showModal('register'); return; }
    $('#plan').value = button.dataset.plan;
    $('#dashboard').scrollIntoView({ behavior: 'smooth' });
    $('#name').focus();
  }));
  await refresh();
  await loadStatus();
}
async function refresh() {
  try {
    const data = await api('/api/me');
    me = data.user;
    cacheUser(me);
    updateAccountIcon(me);
    $('#dashboard').classList.toggle('hidden', !me);
    if (!me) return;
    $('#email').textContent = me.email;
    $('#servers').innerHTML = data.servers?.length ? data.servers.map((server) => `<div class="server-row"><b>${esc(server.name)}</b><p>المنفذ المحجوز: ${esc(server.port)} · الباقة: ${esc(server.plan)} · الحالة: ${esc(server.status)}</p>${server.trialEndsAt ? `<p>نهاية التجربة: ${esc(new Date(server.trialEndsAt).toLocaleString('ar-EG'))}</p>` : ''}</div>`).join('') : '<p>لم تنشئ أي سجلات سيرفر بعد.</p>';
    $('#logs').textContent = data.mta?.logs?.length ? data.mta.logs.join('\n') : 'لا توجد سجلات حتى الآن.';
  } catch (error) {
    // A missing session is normal before login; avoid interrupting the page with an alert.
    console.debug('تعذر تحديث بيانات الحساب:', error.message);
  }
}
$('#create').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#create').querySelector('button[type="submit"],button:not([type])');
  if (button) button.disabled = true;
  $('#msg').textContent = 'جارٍ إنشاء السجل...';
  try {
    const data = await api('/api/servers', { method: 'POST', body: JSON.stringify({ name: $('#name').value.trim(), plan: $('#plan').value }) });
    $('#msg').textContent = data.notice || 'تم إنشاء السجل.';
    $('#name').value = '';
    await refresh();
  } catch (error) { $('#msg').textContent = error.message; }
  finally { if (button) button.disabled = false; }
});
async function mtaAction(action) {
  $('#mtaMsg').textContent = 'جارٍ تنفيذ الأمر...';
  $('#mtaStart').disabled = true; $('#mtaStop').disabled = true;
  try {
    const data = await api('/api/mta/' + action, { method: 'POST', body: '{}' });
    $('#mtaMsg').textContent = action === 'start' ? 'تم إرسال أمر التشغيل. راجع السجلات أدناه.' : 'تم إرسال طلب الإيقاف.';
    if (data.mta?.logs) $('#logs').textContent = data.mta.logs.join('\n');
    await loadStatus();
  } catch (error) { $('#mtaMsg').textContent = error.message; await loadStatus(); }
  finally { $('#mtaStart').disabled = false; $('#mtaStop').disabled = false; }
}
$('#mtaStart').addEventListener('click', () => mtaAction('start'));
$('#mtaStop').addEventListener('click', () => mtaAction('stop'));
$('#refreshStatus').addEventListener('click', loadStatus);
init().catch((error) => { $('#mtaStatus').textContent = error.message; $('#plansGrid').textContent = 'تعذّر تحميل الباقات. تأكد من تشغيل الخادم ثم حدّث الصفحة.'; });
