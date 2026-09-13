/* =============================================
   BRIDFORE – Main JS v2
   Bright Dream Forest
============================================= */
'use strict';

/* --------- Supabase --------- */
const SUPABASE_PROJECT_URL = 'https://usmzpjkfgxuiogbkvojc.supabase.co';
const SUPABASE_REST_URL = `${SUPABASE_PROJECT_URL}/rest/v1`;
const SUPABASE_AUTH_URL = `${SUPABASE_PROJECT_URL}/auth/v1`;
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yXohjV17Vjf3v9n1avOUYg_UV9ZHci5';
const ADMIN_SESSION_KEY = 'bridfore_supabase_admin_session';

/*
 * Publishable key는 브라우저에 노출되어도 되는 공개 키입니다.
 * secret/service_role 키는 절대 이 파일에 넣지 마세요.
 */
function getAdminSession() {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveAdminSession(session) {
  const expiresIn = Number(session.expires_in || 3600);
  const stored = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    user: session.user || null
  };
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(stored));
  return stored;
}

function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

async function refreshAdminSession() {
  const current = getAdminSession();
  if (!current?.refresh_token) return null;

  try {
    const res = await fetch(`${SUPABASE_AUTH_URL}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: current.refresh_token })
    });

    if (!res.ok) {
      clearAdminSession();
      return null;
    }

    return saveAdminSession(await res.json());
  } catch (e) {
    console.error('관리자 세션 갱신 실패:', e);
    return null;
  }
}

async function getAdminAccessToken() {
  let session = getAdminSession();
  if (!session?.access_token) return null;

  // 만료 60초 전부터 갱신
  if (!session.expires_at || session.expires_at <= Date.now() + 60_000) {
    session = await refreshAdminSession();
  }
  return session?.access_token || null;
}

function publicHeaders(extra = {}) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...extra
  };
}

async function adminHeaders(extra = {}) {
  const token = await getAdminAccessToken();
  if (!token) throw new Error('ADMIN_AUTH_REQUIRED');
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    ...extra
  };
}

async function adminFetch(url, options = {}) {
  const headers = await adminHeaders(options.headers || {});
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearAdminSession();
  }
  return res;
}

async function requireAdminSession() {
  const token = await getAdminAccessToken();
  if (token) return true;
  clearAdminSession();
  return false;
}

/* --------- State --------- */
let currentPage = 'main';
let allInquiries = [], filteredInquiries = [];
let allPrograms = [], allNews = [], allResources = [], allPress = [];
let newsPage = 1, resourcesPage = 1, pressPage = 1;
const NEWS_LIMIT = 5, RES_LIMIT = 6, PRESS_LIMIT = 4;
let currentAdminTab = 'dashboard';
let editingItem = null; // { table, id }

/* chart instances */
let chartTypeInst = null, chartStatusInst = null;
let chartAgeInst = null, chartTypeStatsInst = null, chartMonthInst = null, chartStatusStatsInst = null;

/* =============================================
   INIT
============================================= */
document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initScrollAnimations();
  initContactForm();
  initAdminLogin();
  loadPublicData();
});

/* =============================================
   NAVBAR
============================================= */
function initNavbarScroll() {
  const nb = document.getElementById('navbar');
  if (!nb) return;
  window.addEventListener('scroll', () => {
    nb.classList.toggle('scrolled', window.scrollY > 20);
  });
}

function toggleMenu() {
  const m = document.getElementById('navMenu');
  const h = document.getElementById('hamburger');
  if (!m) return;
  const open = m.classList.toggle('open');
  const spans = h ? h.querySelectorAll('span') : [];
  if (open) {
    spans[0] && (spans[0].style.transform = 'rotate(45deg) translate(5px,5px)');
    spans[1] && (spans[1].style.opacity = '0');
    spans[2] && (spans[2].style.transform = 'rotate(-45deg) translate(5px,-5px)');
  } else {
    spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  }
}
function closeMenu() {
  const m = document.getElementById('navMenu');
  const h = document.getElementById('hamburger');
  if (m) m.classList.remove('open');
  if (h) h.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
}

/* =============================================
   NAVIGATION HELPERS
============================================= */
function goHome(e) {
  e && e.preventDefault();
  showMainSite();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showMainSite() {
  currentPage = 'main';
  document.getElementById('mainSite').style.display = '';
  document.getElementById('footer').style.display = '';
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'none';
}

async function showAdminLogin() {
  if (await requireAdminSession()) {
    await showAdminDashboard();
    return;
  }

  currentPage = 'admin-login';
  document.getElementById('mainSite').style.display = 'none';
  document.getElementById('footer').style.display = 'none';
  document.getElementById('admin-section').style.display = '';
  document.getElementById('adminDashboard').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function showAdminDashboard() {
  if (!(await requireAdminSession())) {
    currentPage = 'admin-login';
    document.getElementById('mainSite').style.display = 'none';
    document.getElementById('footer').style.display = 'none';
    document.getElementById('admin-section').style.display = '';
    document.getElementById('adminDashboard').style.display = 'none';
    return;
  }

  currentPage = 'admin-dashboard';
  document.getElementById('mainSite').style.display = 'none';
  document.getElementById('footer').style.display = 'none';
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('adminDashboard').style.display = '';
  window.scrollTo({ top: 0, behavior: 'instant' });
  await initAdminDashboard();
}

async function adminLogout() {
  const session = getAdminSession();
  try {
    if (session?.access_token) {
      await fetch(`${SUPABASE_AUTH_URL}/logout`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`
        }
      });
    }
  } catch (e) {
    console.warn('Supabase logout 요청 실패:', e);
  } finally {
    clearAdminSession();
    showMainSite();
  }
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  setTimeout(() => {
    const top = el.getBoundingClientRect().top + window.scrollY - 78;
    window.scrollTo({ top, behavior: 'smooth' });
  }, 80);
}

function scrollToContact(type) {
  showMainSite();
  scrollToSection('contact');
  if (type) {
    setTimeout(() => {
      const sel = document.getElementById('inquiryType');
      if (!sel) return;
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === type) { sel.value = type; break; }
      }
    }, 700);
  }
}

/* =============================================
   SCROLL ANIMATIONS
============================================= */
function initScrollAnimations() {
  const targets = document.querySelectorAll('.service-card,.audience-card,.value-card,.trust-item,.news-item,.content-card,.press-card');
  targets.forEach(el => el.classList.add('section-anim'));
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 70);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  targets.forEach(el => obs.observe(el));
}

/* =============================================
   PUBLIC DATA LOAD
============================================= */
async function loadPublicData() {
  try {
    const [pRes, nRes, rRes, prRes] = await Promise.all([
      fetch(`${SUPABASE_REST_URL}/programs?select=*&order=sort_order.asc.nullslast&limit=100`, { headers: publicHeaders() }),
      fetch(`${SUPABASE_REST_URL}/news?select=*&order=publish_date.desc&limit=100`, { headers: publicHeaders() }),
      fetch(`${SUPABASE_REST_URL}/resources?select=*&order=publish_date.desc&limit=100`, { headers: publicHeaders() }),
      fetch(`${SUPABASE_REST_URL}/press?select=*&order=press_date.desc&limit=100`, { headers: publicHeaders() })
    ]);

    const responses = [pRes, nRes, rRes, prRes];
    if (!responses.every(r => r.ok)) {
      const details = await Promise.all(responses.map(async r => `${r.status}: ${await r.text()}`));
      throw new Error(details.join(' | '));
    }

    const [pJson, nJson, rJson, prJson] = await Promise.all(responses.map(r => r.json()));

    // 공개 여부는 RLS 정책에서 서버 측으로 제한합니다.
    allPrograms = Array.isArray(pJson) ? pJson : [];
    allNews = Array.isArray(nJson) ? nJson : [];
    allResources = Array.isArray(rJson) ? rJson : [];
    allPress = Array.isArray(prJson) ? prJson : [];

    renderPrograms('');
    renderNewsList('', 1);
    renderNewsPreview();
    renderResourcesList('', 1);
    renderPressList(1);
  } catch(e) {
    console.error('공개 데이터 로드 오류:', e);
  }
}

/* =============================================
   NEWS PREVIEW (메인 최신 소식 3개)
============================================= */
function renderNewsPreview() {
  const grid = document.getElementById('newsPreviewGrid');
  if (!grid) return;
  const preview = allNews.slice(0, 3);
  if (!preview.length) {
    grid.innerHTML = `<div class="news-preview-empty">
      <i class="fas fa-seedling"></i>
      <p>곧 새로운 소식을 전하겠습니다.</p>
    </div>`;
    return;
  }
  const catCls = { '공지사항':'notice', '교육 일정':'schedule', '프로그램 모집':'recruit', '행사 및 강의 안내':'event' };
  grid.innerHTML = preview.map(n => `
    <div class="news-preview-card section-anim" onclick="scrollToSection('news-section');setTimeout(()=>openContentModal('news','${n.id}'),400)">
      <span class="npc-cat ${catCls[n.category]||''}">${escHtml(n.category||'')}</span>
      <div class="npc-title">${escHtml(n.title||'')}</div>
      <div class="npc-summary">${escHtml(n.summary||'')}</div>
      <div class="npc-date"><i class="fas fa-calendar-alt" style="margin-right:5px"></i>${escHtml(n.publish_date||'')}</div>
    </div>`).join('');
  document.querySelectorAll('#newsPreviewGrid .section-anim').forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), i * 90);
  });
}

/* =============================================
   PROGRAMS
============================================= */
function filterPrograms(cat) {
  setActiveTab('programTabBar', cat);
  renderPrograms(cat);
}

function renderPrograms(cat) {
  const grid = document.getElementById('programsGrid');
  if (!grid) return;
  const list = cat ? allPrograms.filter(p => p.category === cat) : allPrograms;
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-seedling"></i><p>등록된 프로그램이 없습니다.<br>곧 업데이트될 예정입니다.</p></div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const statusCls = { '운영 예정':'status-plan','모집 중':'status-recruit','진행 중':'status-running','완료':'status-done' }[p.status] || 'status-plan';
    return `<div class="content-card section-anim" onclick="openContentModal('programs','${p.id}')">
      ${p.image_url
        ? `<img src="${escHtml(p.image_url)}" alt="${escHtml(p.title)}" class="card-img" onerror="this.style.display='none'">`
        : `<div class="card-img-placeholder"><i class="fas fa-book-open"></i></div>`}
      <div class="card-body">
        <span class="card-cat">${escHtml(p.category||'')}</span>
        <div class="card-title">${escHtml(p.title||'')}</div>
        <div class="card-summary">${escHtml(p.summary||'')}</div>
        <div class="card-meta">
          <span>${escHtml(p.target||'')}</span>
          <span class="card-status ${statusCls}">${escHtml(p.status||'')}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('#programsGrid .section-anim').forEach((el,i) => {
    setTimeout(() => el.classList.add('visible'), i*80);
  });
}

/* =============================================
   NEWS
============================================= */
function filterNews(cat) {
  setActiveTab('newsTabBar', cat);
  newsPage = 1;
  renderNewsList(cat, 1);
}

function renderNewsList(cat, page) {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;
  const list = cat ? allNews.filter(n => n.category === cat) : allNews;
  const slice = list.slice(0, page * NEWS_LIMIT);
  const more = document.getElementById('newsMore');
  if (!slice.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-newspaper"></i><p>등록된 소식이 없습니다.</p></div>';
    if (more) more.style.display = 'none';
    return;
  }
  const catBadgeClass = { '공지사항':'notice','교육 일정':'schedule','프로그램 모집':'recruit','행사 및 강의 안내':'event' };
  grid.innerHTML = slice.map(n => `
    <div class="news-item section-anim" onclick="openContentModal('news','${n.id}')">
      <span class="news-cat-badge ${catBadgeClass[n.category]||''}">${escHtml(n.category||'')}</span>
      <div class="news-text">
        <div class="news-title">${escHtml(n.title||'')}</div>
        <div class="news-summary">${escHtml(n.summary||'')}</div>
        <div class="news-date">${escHtml(n.publish_date||'')}</div>
      </div>
      <i class="fas fa-chevron-right news-arrow"></i>
    </div>`).join('');
  document.querySelectorAll('#newsGrid .section-anim').forEach((el,i) => {
    setTimeout(() => el.classList.add('visible'), i*60);
  });
  if (more) more.style.display = slice.length < list.length ? 'block' : 'none';
}

function loadMoreNews() {
  newsPage++;
  const cat = getActiveTabCat('newsTabBar');
  renderNewsList(cat, newsPage);
}

/* =============================================
   RESOURCES
============================================= */
function filterResources(cat) {
  setActiveTab('resourceTabBar', cat);
  resourcesPage = 1;
  renderResourcesList(cat, 1);
}

function renderResourcesList(cat, page) {
  const grid = document.getElementById('resourcesGrid');
  if (!grid) return;
  const list = cat ? allResources.filter(r => r.category === cat) : allResources;
  const slice = list.slice(0, page * RES_LIMIT);
  const more = document.getElementById('resourcesMore');
  if (!slice.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>등록된 자료가 없습니다.</p></div>';
    if (more) more.style.display = 'none';
    return;
  }
  grid.innerHTML = slice.map(r => `
    <div class="content-card section-anim" onclick="openContentModal('resources','${r.id}')">
      ${r.image_url
        ? `<img src="${escHtml(r.image_url)}" alt="${escHtml(r.title)}" class="card-img" onerror="this.style.display='none'">`
        : `<div class="card-img-placeholder"><i class="fas fa-file-alt"></i></div>`}
      <div class="card-body">
        <span class="card-cat">${escHtml(r.category||'')}</span>
        <div class="card-title">${escHtml(r.title||'')}</div>
        <div class="card-summary">${escHtml(r.summary||'')}</div>
        <div class="card-meta">
          <span>${escHtml(r.publish_date||'')}</span>
          ${r.file_url ? '<span style="color:var(--green-main);font-weight:600"><i class="fas fa-download"></i> 자료있음</span>' : ''}
        </div>
      </div>
    </div>`).join('');
  document.querySelectorAll('#resourcesGrid .section-anim').forEach((el,i) => {
    setTimeout(() => el.classList.add('visible'), i*80);
  });
  if (more) more.style.display = slice.length < list.length ? 'block' : 'none';
}

function loadMoreResources() {
  resourcesPage++;
  const cat = getActiveTabCat('resourceTabBar');
  renderResourcesList(cat, resourcesPage);
}

/* =============================================
   PRESS
============================================= */
function renderPressList(page) {
  const grid = document.getElementById('pressGrid');
  if (!grid) return;
  const slice = allPress.slice(0, page * PRESS_LIMIT);
  const more = document.getElementById('pressMore');
  if (!slice.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-newspaper"></i><p>등록된 언론·활동 내역이 없습니다.</p></div>';
    if (more) more.style.display = 'none';
    return;
  }
  grid.innerHTML = slice.map(p => `
    <div class="press-card section-anim" onclick="openContentModal('press','${p.id}')">
      ${p.image_url
        ? `<img src="${escHtml(p.image_url)}" alt="${escHtml(p.title)}" class="press-img" onerror="this.style.display='none'">`
        : `<div class="press-img-placeholder"><i class="fas fa-award"></i></div>`}
      <div class="press-source">
        <i class="fas fa-building"></i>
        <strong>${escHtml(p.source||'출처 미상')}</strong>
        ${p.actor ? ` · ${escHtml(p.actor)}` : ''}
      </div>
      <div class="press-title">${escHtml(p.title||'')}</div>
      <div class="press-summary">${escHtml(p.summary||'')}</div>
      <div class="press-bottom">
        <span class="press-date">${escHtml(p.press_date||'')}</span>
        ${p.origin_url ? `<a href="${escHtml(p.origin_url)}" target="_blank" onclick="event.stopPropagation()" style="font-size:.75rem;color:var(--green-main)"><i class="fas fa-external-link-alt"></i> 원문</a>` : ''}
      </div>
    </div>`).join('');
  document.querySelectorAll('#pressGrid .section-anim').forEach((el,i) => {
    setTimeout(() => el.classList.add('visible'), i*80);
  });
  if (more) more.style.display = slice.length < allPress.length ? 'block' : 'none';
}

function loadMorePress() {
  pressPage++;
  renderPressList(pressPage);
}

/* =============================================
   CONTENT DETAIL MODAL
============================================= */
function openContentModal(table, id) {
  let item;
  if (table === 'programs') item = allPrograms.find(r => r.id === id);
  else if (table === 'news') item = allNews.find(r => r.id === id);
  else if (table === 'resources') item = allResources.find(r => r.id === id);
  else if (table === 'press') item = allPress.find(r => r.id === id);
  if (!item) return;

  document.getElementById('modalTitle').textContent = item.title || '상세 보기';
  let body = '';

  if (table === 'programs') {
    body = `<dl>
      ${dRow('분류', item.category)} ${dRow('대상', item.target)}
      ${dRow('교육시간/기간', item.duration)} ${dRow('진행상태', item.status)}
    </dl>
    <div class="modal-content-body"><p>${escHtml(item.content || item.summary || '')}</p></div>`;
  } else if (table === 'news') {
    body = `<dl>${dRow('분류', item.category)} ${dRow('날짜', item.publish_date)}</dl>
    <div class="modal-content-body"><p>${escHtml(item.content || item.summary || '')}</p></div>`;
  } else if (table === 'resources') {
    body = `<dl>${dRow('분류', item.category)} ${dRow('날짜', item.publish_date)}</dl>
    <div class="modal-content-body"><p>${escHtml(item.content || item.summary || '')}</p></div>
    ${item.file_url ? `<div style="margin-top:16px"><a href="${escHtml(item.file_url)}" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-download"></i> 자료 다운로드 / 바로가기</a></div>` : ''}`;
  } else if (table === 'press') {
    body = `<dl>
      ${dRow('날짜', item.press_date)} ${dRow('출처', item.source)}
      ${dRow('활동 주체', item.actor)}
    </dl>
    <div class="modal-content-body"><p>${escHtml(item.content || item.summary || '')}</p></div>
    ${item.origin_url ? `<div style="margin-top:16px"><a href="${escHtml(item.origin_url)}" target="_blank" class="btn btn-outline btn-sm"><i class="fas fa-external-link-alt"></i> 원문 보기</a></div>` : ''}`;
  }

  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalOverlay').style.display = 'block';
  document.getElementById('contentModal').style.display = 'block';
}

function dRow(label, val) {
  if (!val) return '';
  return `<div class="modal-detail-row"><dt>${label}</dt><dd>${escHtml(val)}</dd></div>`;
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('contentModal').style.display = 'none';
}

/* =============================================
   TAB HELPERS
============================================= */
function setActiveTab(barId, cat) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  bar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
}
function getActiveTabCat(barId) {
  const bar = document.getElementById(barId);
  if (!bar) return '';
  const a = bar.querySelector('.tab-btn.active');
  return a ? (a.dataset.cat || '') : '';
}

/* =============================================
   CONTACT FORM
============================================= */
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 접수 중...';

    // status/age_group/region/id/created_at은 DB 기본값을 사용합니다.
    const data = {
      name: v('name'),
      phone: v('phone'),
      email: v('email'),
      inquiry_type: v('inquiryType'),
      message: v('message')
    };

    try {
      const res = await fetch(`${SUPABASE_REST_URL}/inquiries`, {
        method: 'POST',
        headers: publicHeaders({
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        }),
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }

      showSuccess();
    } catch(err) {
      console.error('문의 등록 실패:', err);
      alert('문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> 문의 남기기';
    }
  });
}
function v(id) { return (document.getElementById(id)?.value || '').trim(); }
function showSuccess() {
  document.getElementById('contactForm').style.display = 'none';
  document.getElementById('formSuccess').style.display = 'block';
}
function validateForm() {
  let ok = true;
  clearErrors();
  const name = v('name'), phone = v('phone'), email = v('email'), type = v('inquiryType'), msg = v('message');
  const priv = document.getElementById('privacyAgree')?.checked;
  if (!name) { setErr('nameError','이름을 입력해주세요'); markErr('name'); ok=false; }
  if (!phone) { setErr('phoneError','연락처를 입력해주세요'); markErr('phone'); ok=false; }
  else if (!/^[\d\-+\s()]+$/.test(phone)) { setErr('phoneError','올바른 연락처를 입력해주세요'); markErr('phone'); ok=false; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr('emailError','올바른 이메일을 입력해주세요'); markErr('email'); ok=false; }
  if (!type) { setErr('typeError','문의 유형을 선택해주세요'); markErr('inquiryType'); ok=false; }
  if (!msg || msg.length < 5) { setErr('msgError','문의 내용을 5자 이상 입력해주세요'); markErr('message'); ok=false; }
  if (!priv) { setErr('privacyError','개인정보처리방침에 동의해주세요'); ok=false; }
  return ok;
}
function setErr(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }
function markErr(id) { const el = document.getElementById(id); if (el) el.classList.add('error'); }
function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
}
function resetForm() {
  document.getElementById('contactForm').reset();
  document.getElementById('contactForm').style.display = 'block';
  document.getElementById('formSuccess').style.display = 'none';
  const btn = document.getElementById('submitBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> 문의 남기기'; }
  clearErrors();
}

/* =============================================
   ADMIN LOGIN
============================================= */
function initAdminLogin() {
  const form = document.getElementById('adminLoginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 기존 adminId 입력란을 관리자 이메일 입력란으로 사용합니다.
    const email = document.getElementById('adminId')?.value.trim();
    const password = document.getElementById('adminPw')?.value;
    const err = document.getElementById('adminLoginError');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      if (err) {
        err.style.display = 'flex';
        setTimeout(() => err.style.display = 'none', 3500);
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(`${SUPABASE_AUTH_URL}/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        throw new Error(`LOGIN_FAILED_${res.status}`);
      }

      saveAdminSession(await res.json());
      if (err) err.style.display = 'none';
      document.getElementById('adminPw').value = '';
      await showAdminDashboard();
    } catch (e) {
      console.error('관리자 로그인 실패:', e);
      clearAdminSession();
      if (err) {
        err.style.display = 'flex';
        setTimeout(() => err.style.display = 'none', 3500);
      }
      if (document.getElementById('adminPw')) document.getElementById('adminPw').value = '';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
function togglePw() {
  const inp = document.getElementById('adminPw');
  const icon = document.getElementById('pwEyeIcon');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (icon) icon.classList.toggle('fa-eye'); icon && icon.classList.toggle('fa-eye-slash');
}

/* =============================================
   ADMIN DASHBOARD
============================================= */
async function initAdminDashboard() {
  await loadAdminInquiries();
  showAdminTab(currentAdminTab || 'dashboard');
}

async function loadAdminInquiries() {
  try {
    const all = [];
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const res = await adminFetch(
        `${SUPABASE_REST_URL}/inquiries?select=*&order=created_at.desc&limit=${pageSize}&offset=${offset}`
      );

      if (!res.ok) throw new Error(`문의 조회 실패: ${res.status} ${await res.text()}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error('문의 조회 응답 형식 오류');

      all.push(...rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    allInquiries = all;
    filteredInquiries = [...allInquiries];
  } catch(e) {
    console.error(e);
    allInquiries = [];
    filteredInquiries = [];
    if (String(e?.message || '').includes('ADMIN_AUTH_REQUIRED')) await showAdminLogin();
  }
}

async function loadAdminTable(table) {
  const allowed = new Set(['programs', 'news', 'resources', 'press']);
  if (!allowed.has(table)) return [];

  try {
    const all = [];
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const res = await adminFetch(
        `${SUPABASE_REST_URL}/${table}?select=*&order=created_at.desc&limit=${pageSize}&offset=${offset}`
      );

      if (!res.ok) throw new Error(`${table} 조회 실패: ${res.status} ${await res.text()}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error(`${table} 조회 응답 형식 오류`);

      all.push(...rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    return all;
  } catch(e) {
    console.error(e);
    return [];
  }
}

function showAdminTab(tab) {
  currentAdminTab = tab;
  ['dashboard','inquiries','programs','news','resources','press','stats'].forEach(t => {
    const panel = document.getElementById(`panel-${t}`);
    const nav = document.getElementById(`tab-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (nav) nav.classList.toggle('active', t === tab);
  });
  if (tab === 'dashboard') renderAdminDashboard();
  else if (tab === 'inquiries') renderInquiryTable();
  else if (tab === 'programs') loadAndRenderAdminList('programs');
  else if (tab === 'news') loadAndRenderAdminList('news');
  else if (tab === 'resources') loadAndRenderAdminList('resources');
  else if (tab === 'press') loadAndRenderAdminList('press');
  else if (tab === 'stats') renderStats();
}

/* --------- Dashboard --------- */
function renderAdminDashboard() {
  const total = allInquiries.length;
  const pending = allInquiries.filter(i => i.status === '접수 대기').length;
  const review = allInquiries.filter(i => i.status === '검토 중').length;
  const done = allInquiries.filter(i => i.status === '완료').length;
  document.getElementById('statCards').innerHTML = `
    <div class="scard"><div class="scard-icon green"><i class="fas fa-inbox"></i></div><div class="scard-info"><h3>전체 문의</h3><div class="scard-num">${total}</div></div></div>
    <div class="scard"><div class="scard-icon gold"><i class="fas fa-clock"></i></div><div class="scard-info"><h3>접수 대기</h3><div class="scard-num">${pending}</div></div></div>
    <div class="scard"><div class="scard-icon blue"><i class="fas fa-search"></i></div><div class="scard-info"><h3>검토 중</h3><div class="scard-num">${review}</div></div></div>
    <div class="scard"><div class="scard-icon purple"><i class="fas fa-check-circle"></i></div><div class="scard-info"><h3>완료</h3><div class="scard-num">${done}</div></div></div>`;

  // Charts
  const tCtx = document.getElementById('typeChart');
  if (tCtx) {
    if (chartTypeInst) chartTypeInst.destroy();
    const types = countMap(allInquiries, 'inquiry_type');
    chartTypeInst = new Chart(tCtx, { type:'doughnut', data:{
      labels:Object.keys(types), datasets:[{data:Object.values(types),backgroundColor:['#4CAF50','#FFC107','#2196F3','#9C27B0','#FF5722'],borderWidth:0}]
    }, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}} });
  }
  const sCtx = document.getElementById('statusChart');
  if (sCtx) {
    if (chartStatusInst) chartStatusInst.destroy();
    const labels = ['접수 대기','검토 중','완료'];
    chartStatusInst = new Chart(sCtx, { type:'bar', data:{
      labels, datasets:[{label:'건수',data:labels.map(s=>allInquiries.filter(i=>i.status===s).length),backgroundColor:['#FFC107','#2196F3','#4CAF50'],borderRadius:7}]
    }, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}}}} });
  }
  // Recent
  const recent = allInquiries.slice(0,6);
  const wrap = document.getElementById('recentInquiries');
  if (wrap) {
    if (!recent.length) { wrap.innerHTML = '<p style="text-align:center;color:#9CA3AF;padding:20px">문의가 없습니다.</p>'; return; }
    wrap.innerHTML = `<table class="admin-table"><thead><tr><th>이름</th><th>연락처</th><th>유형</th><th>상태</th><th>날짜</th><th></th></tr></thead><tbody>
      ${recent.map(r => `<tr>
        <td><strong>${escHtml(r.name||'')}</strong></td>
        <td>${escHtml(r.phone||'')}</td>
        <td>${escHtml(r.inquiry_type||'')}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${fmtDate(r.created_at)}</td>
        <td><button class="ali-edit-btn" onclick="openInquiryDetail('${r.id}')">보기</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  }
}

/* --------- Inquiries --------- */
let inqPage = 1;
const INQ_PAGE_SIZE = 10;

function renderInquiryTable() {
  inqPage = 1;
  filteredInquiries = [...allInquiries];
  if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
  if (document.getElementById('typeFilter')) document.getElementById('typeFilter').value = '';
  if (document.getElementById('statusFilter')) document.getElementById('statusFilter').value = '';
  renderInqPage();
  renderInqPagination();
}
function filterInquiries() {
  const search = (document.getElementById('searchInput')?.value||'').toLowerCase();
  const typeF = document.getElementById('typeFilter')?.value||'';
  const statusF = document.getElementById('statusFilter')?.value||'';
  filteredInquiries = allInquiries.filter(r =>
    (!search || (r.name||'').toLowerCase().includes(search)||(r.phone||'').toLowerCase().includes(search)||(r.message||'').toLowerCase().includes(search)) &&
    (!typeF || r.inquiry_type === typeF) &&
    (!statusF || r.status === statusF)
  );
  inqPage = 1;
  renderInqPage();
  renderInqPagination();
}
function renderInqPage() {
  const wrap = document.getElementById('inquiryTableWrap');
  if (!wrap) return;
  const start = (inqPage-1)*INQ_PAGE_SIZE;
  const data = filteredInquiries.slice(start, start+INQ_PAGE_SIZE);
  if (!data.length) { wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:10px;display:block"></i>문의가 없습니다.</div>'; return; }
  wrap.innerHTML = `<table class="admin-table"><thead><tr><th>#</th><th>이름</th><th>연락처</th><th>이메일</th><th>유형</th><th>상태</th><th>날짜</th><th>관리</th></tr></thead><tbody>
    ${data.map((r,i) => `<tr>
      <td>${start+i+1}</td>
      <td><strong>${escHtml(r.name||'')}</strong></td>
      <td>${escHtml(r.phone||'')}</td>
      <td>${escHtml(r.email||'-')}</td>
      <td>${escHtml(r.inquiry_type||'')}</td>
      <td><select class="status-select" onchange="updateInqStatus('${r.id}',this.value)">
        ${['접수 대기','검토 중','완료'].map(s=>`<option ${r.status===s?'selected':''}>${s}</option>`).join('')}
      </select></td>
      <td>${fmtDate(r.created_at)}</td>
      <td style="display:flex;gap:5px">
        <button class="ali-edit-btn" onclick="openInquiryDetail('${r.id}')"><i class="fas fa-eye"></i></button>
        <button class="ali-del-btn" onclick="deleteInquiry('${r.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
}
function renderInqPagination() {
  const pag = document.getElementById('pagination');
  if (!pag) return;
  const pages = Math.ceil(filteredInquiries.length/INQ_PAGE_SIZE);
  pag.innerHTML = pages <= 1 ? '' : Array.from({length:pages},(_,i)=>`<button class="page-btn${i+1===inqPage?' active':''}" onclick="goInqPage(${i+1})">${i+1}</button>`).join('');
}
function goInqPage(p) { inqPage=p; renderInqPage(); renderInqPagination(); }

function openInquiryDetail(id) {
  const r = allInquiries.find(x => x.id === id);
  if (!r) return;
  document.getElementById('modalTitle').textContent = '문의 상세';
  document.getElementById('modalBody').innerHTML = `<dl>
    ${dRow('이름',r.name)} ${dRow('연락처',r.phone)} ${dRow('이메일',r.email||'-')}
    ${dRow('문의 유형',r.inquiry_type)} ${dRow('상태',r.status)} ${dRow('접수일',fmtDate(r.created_at))}
    <div class="modal-detail-row" style="grid-column:1/-1"><dt>내용</dt><dd style="white-space:pre-wrap">${escHtml(r.message||'')}</dd></div>
  </dl>`;
  document.getElementById('modalOverlay').style.display = 'block';
  document.getElementById('contentModal').style.display = 'block';
}

async function updateInqStatus(id, status) {
  try {
    const res = await adminFetch(
      `${SUPABASE_REST_URL}/inquiries?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ status })
      }
    );

    if (!res.ok) throw new Error(`상태 변경 실패: ${res.status} ${await res.text()}`);

    const idx = allInquiries.findIndex(r => r.id === id);
    if (idx > -1) allInquiries[idx].status = status;
    const fi = filteredInquiries.findIndex(r => r.id === id);
    if (fi > -1) filteredInquiries[fi].status = status;
  } catch(e) {
    console.error(e);
    alert('문의 상태 변경에 실패했습니다.');
    await loadAdminInquiries();
    renderInqPage();
  }
}
async function deleteInquiry(id) {
  if (!confirm('이 문의를 삭제하시겠습니까?')) return;
  try {
    const res = await adminFetch(
      `${SUPABASE_REST_URL}/inquiries?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
    );

    if (!res.ok) throw new Error(`문의 삭제 실패: ${res.status} ${await res.text()}`);

    allInquiries = allInquiries.filter(r => r.id !== id);
    filteredInquiries = filteredInquiries.filter(r => r.id !== id);
    renderInqPage();
    renderInqPagination();
  } catch(e) {
    console.error(e);
    alert('문의 삭제에 실패했습니다.');
  }
}
function exportCSV() {
  if (!filteredInquiries.length) { alert('내보낼 데이터가 없습니다.'); return; }
  const headers = ['이름','연락처','이메일','문의 유형','상태','접수일','문의 내용'];
  const rows = filteredInquiries.map(r=>[r.name,r.phone,r.email||'',r.inquiry_type,r.status,fmtDate(r.created_at),(r.message||'').replace(/\n/g,' ')]);
  const csv = [headers,...rows].map(row=>row.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`BRIDFORE_문의_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* --------- Admin Content Lists --------- */
async function loadAndRenderAdminList(table) {
  const data = await loadAdminTable(table);
  const listId = { programs:'adminProgramsList', news:'adminNewsList', resources:'adminResourcesList', press:'adminPressList' }[table];
  const el = document.getElementById(listId);
  if (!el) return;
  if (!data.length) { el.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF">등록된 항목이 없습니다.</div>'; return; }
  el.innerHTML = data.map(item => `
    <div class="admin-list-item">
      <div class="ali-info">
        <div class="ali-title">${escHtml(item.title||'')}</div>
        <div class="ali-meta">${escHtml(item.category||item.press_date||item.publish_date||'')} ${item.status ? '· '+escHtml(item.status) : ''}</div>
      </div>
      <div class="ali-actions">
        <button class="ali-edit-btn" onclick="openItemForm('${table}','${item.id}')"><i class="fas fa-edit"></i> 수정</button>
        <button class="ali-del-btn" onclick="deleteAdminItem('${table}','${item.id}')"><i class="fas fa-trash"></i> 삭제</button>
      </div>
    </div>`).join('');
}

/* --------- Item Form (Create / Edit) --------- */
const tableFormConfig = {
  programs: {
    title: '사업·프로그램',
    fields: [
      { id:'title', label:'프로그램명', type:'text', required:true },
      { id:'category', label:'분류', type:'select', options:['평생교육','진로·생애경력 설계','디지털·AI 역량 교육','기관·지역 맞춤형 교육'] },
      { id:'target', label:'대상', type:'text' },
      { id:'duration', label:'교육시간/기간', type:'text' },
      { id:'status', label:'진행상태', type:'select', options:['운영 예정','모집 중','진행 중','완료'] },
      { id:'summary', label:'간단한 소개', type:'text', full:true },
      { id:'image_url', label:'대표 이미지 URL', type:'text', full:true },
      { id:'content', label:'상세 내용', type:'textarea', full:true },
      { id:'is_published', label:'공개', type:'checkbox' }
    ]
  },
  news: {
    title: '소식',
    fields: [
      { id:'title', label:'제목', type:'text', required:true },
      { id:'category', label:'분류', type:'select', options:['공지사항','교육 일정','프로그램 모집','행사 및 강의 안내'] },
      { id:'publish_date', label:'게시일 (예: 2026-01-15)', type:'text' },
      { id:'summary', label:'요약', type:'text', full:true },
      { id:'image_url', label:'대표 이미지 URL', type:'text', full:true },
      { id:'content', label:'상세 내용', type:'textarea', full:true },
      { id:'is_published', label:'공개', type:'checkbox' }
    ]
  },
  resources: {
    title: '자료·콘텐츠',
    fields: [
      { id:'title', label:'제목', type:'text', required:true },
      { id:'category', label:'분류', type:'select', options:['교육자료','강의자료','진로·직업 콘텐츠','평생교육 콘텐츠','디지털·AI 콘텐츠','칼럼'] },
      { id:'publish_date', label:'작성일 (예: 2026-01-15)', type:'text' },
      { id:'summary', label:'간단한 설명', type:'text', full:true },
      { id:'image_url', label:'대표 이미지 URL', type:'text', full:true },
      { id:'file_url', label:'파일 URL / 외부 링크', type:'text', full:true },
      { id:'content', label:'상세 내용', type:'textarea', full:true },
      { id:'is_published', label:'공개', type:'checkbox' }
    ]
  },
  press: {
    title: '언론·활동',
    fields: [
      { id:'title', label:'제목', type:'text', required:true },
      { id:'press_date', label:'날짜 (예: 2026-01-15)', type:'text' },
      { id:'source', label:'언론사/출처', type:'text' },
      { id:'actor', label:'활동 주체', type:'text' },
      { id:'summary', label:'한 줄 요약', type:'text', full:true },
      { id:'image_url', label:'대표 이미지 URL', type:'text', full:true },
      { id:'origin_url', label:'원문 링크', type:'text', full:true },
      { id:'content', label:'상세 내용', type:'textarea', full:true },
      { id:'is_published', label:'공개', type:'checkbox' }
    ]
  }
};

async function openItemForm(table, id) {
  const cfg = tableFormConfig[table];
  if (!cfg) return;
  let item = null;
  if (id) {
    try {
      const res = await adminFetch(`${SUPABASE_REST_URL}/${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      if (res.ok) {
        const rows = await res.json();
        item = Array.isArray(rows) ? (rows[0] || null) : null;
      }
    } catch(e) {}
  }
  editingItem = id ? { table, id } : { table, id: null };
  document.getElementById('formModalTitle').textContent = id ? `${cfg.title} 수정` : `${cfg.title} 등록`;
  document.getElementById('adminFormBody').innerHTML = `
    <div class="admin-form-grid">
      ${cfg.fields.map(f => {
        const cls = f.full ? 'admin-form-group full' : 'admin-form-group';
        const val = item ? (item[f.id] ?? '') : '';
        if (f.type === 'textarea') return `<div class="${cls}"><label>${f.label}</label><textarea id="af_${f.id}" rows="5">${escHtml(String(val))}</textarea></div>`;
        if (f.type === 'select') return `<div class="${cls}"><label>${f.label}</label><select id="af_${f.id}">${f.options.map(o=>`<option${val===o?' selected':''}>${o}</option>`).join('')}</select></div>`;
        if (f.type === 'checkbox') return `<div class="${cls} full"><label class="form-checkbox-row"><input type="checkbox" id="af_${f.id}" ${val||val===undefined?'checked':''}> ${f.label}</label></div>`;
        return `<div class="${cls}"><label>${f.label}${f.required?' <span style="color:var(--green-main)">*</span>':''}</label><input type="text" id="af_${f.id}" value="${escHtml(String(val))}"></div>`;
      }).join('')}
    </div>`;
  document.getElementById('formModalOverlay').style.display = 'block';
  document.getElementById('adminFormModal').style.display = 'block';
}

function closeFormModal() {
  document.getElementById('formModalOverlay').style.display = 'none';
  document.getElementById('adminFormModal').style.display = 'none';
  editingItem = null;
}

async function saveItem() {
  if (!editingItem) return;
  const { table, id } = editingItem;
  const cfg = tableFormConfig[table];
  if (!cfg) return;

  const allowed = new Set(['programs', 'news', 'resources', 'press']);
  if (!allowed.has(table)) return;

  const data = {};
  for (const f of cfg.fields) {
    const el = document.getElementById(`af_${f.id}`);
    if (!el) continue;
    if (f.type === 'checkbox') data[f.id] = el.checked;
    else data[f.id] = el.value.trim();
  }

  const requiredField = cfg.fields.find(f => f.required && !String(data[f.id] || '').trim());
  if (requiredField) {
    alert(`${requiredField.label}을(를) 입력해주세요.`);
    return;
  }

  const btn = document.getElementById('saveItemBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

  try {
    const url = id
      ? `${SUPABASE_REST_URL}/${table}?id=eq.${encodeURIComponent(id)}`
      : `${SUPABASE_REST_URL}/${table}`;

    const res = await adminFetch(url, {
      method: id ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      throw new Error(`저장 실패: ${res.status} ${await res.text()}`);
    }

    closeFormModal();
    await Promise.all([loadPublicData(), loadAndRenderAdminList(table)]);
    alert(id ? '수정되었습니다.' : '등록되었습니다.');
  } catch(e) {
    console.error(e);
    alert('저장 중 오류가 발생했습니다.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> 저장';
  }
}

async function deleteAdminItem(table, id) {
  if (!confirm('이 항목을 삭제하시겠습니까?')) return;

  const allowed = new Set(['programs', 'news', 'resources', 'press']);
  if (!allowed.has(table)) return;

  try {
    const res = await adminFetch(
      `${SUPABASE_REST_URL}/${table}?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
    );

    if (!res.ok) throw new Error(`삭제 실패: ${res.status} ${await res.text()}`);

    await Promise.all([loadPublicData(), loadAndRenderAdminList(table)]);
    alert('삭제되었습니다.');
  } catch(e) {
    console.error(e);
    alert('삭제 중 오류가 발생했습니다.');
  }
}

/* --------- Stats --------- */
function renderStats() {
  const charts = [
    { id:'ageChart', type:'bar', field:'age_group', label:'연령대', data:allInquiries, colors:['#4CAF50'] },
    { id:'typeChartStats', type:'pie', field:'inquiry_type', label:'유형', data:allInquiries },
    { id:'statusChartStats', type:'doughnut', field:'status', label:'상태', data:allInquiries },
  ];
  charts.forEach(c => {
    const ctx = document.getElementById(c.id);
    if (!ctx) return;
    const map = countMap(c.data, c.field);
    const inst = c.id === 'ageChart' ? chartAgeInst : c.id === 'typeChartStats' ? chartTypeStatsInst : chartStatusStatsInst;
    if (inst) inst.destroy();
    const newInst = new Chart(ctx, {
      type: c.type,
      data: {
        labels: Object.keys(map),
        datasets: [{ data: Object.values(map), backgroundColor: c.colors||['#4CAF50','#FFC107','#2196F3','#9C27B0','#FF5722'], borderRadius: c.type==='bar'?7:0, borderWidth: c.type==='bar'?0:2, borderColor:'#fff' }]
      },
      options: { responsive:true, maintainAspectRatio:false,
        plugins: { legend: { position: c.type==='bar'?'none':'bottom', labels:{font:{size:10}} }, title:{ display:false } },
        scales: c.type==='bar' ? { y:{beginAtZero:true,ticks:{stepSize:1}} } : undefined
      }
    });
    if (c.id==='ageChart') chartAgeInst = newInst;
    else if (c.id==='typeChartStats') chartTypeStatsInst = newInst;
    else chartStatusStatsInst = newInst;
  });

  // Monthly
  const mCtx = document.getElementById('monthChart');
  if (mCtx) {
    if (chartMonthInst) chartMonthInst.destroy();
    const { labels, data } = monthlyData(allInquiries);
    chartMonthInst = new Chart(mCtx, {
      type:'line',
      data: { labels, datasets:[{ label:'문의 수', data, borderColor:'#4CAF50', backgroundColor:'rgba(76,175,80,.1)', fill:true, tension:.4, pointBackgroundColor:'#4CAF50', pointRadius:4 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1}}} }
    });
  }
}

/* =============================================
   HELPERS
============================================= */
function countMap(data, field) {
  return data.reduce((m,r) => { const k = r[field]||'미입력'; m[k]=(m[k]||0)+1; return m; }, {});
}
function monthlyData(data) {
  const now = new Date();
  return Array.from({length:6},(_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    return { label:`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}`,
      count: data.filter(r=>{ if(!r.created_at)return false; const rd=new Date(r.created_at); return rd.getFullYear()===d.getFullYear()&&rd.getMonth()===d.getMonth(); }).length };
  }).reduce((acc,v)=>{ acc.labels.push(v.label); acc.data.push(v.count); return acc; }, {labels:[],data:[]});
}
function statusBadge(s) {
  const map = {'접수 대기':'badge-pending','검토 중':'badge-review','완료':'badge-done'};
  return `<span class="badge ${map[s]||'badge-pending'}">${s||'접수 대기'}</span>`;
}
function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(typeof ts==='number'?ts:Date.parse(ts));
  if (isNaN(d)) return '-';
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
