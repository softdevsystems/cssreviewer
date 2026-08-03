(() => {
  'use strict';
  const D = window.COURSE_DATA;
  const STORE_KEY = 'tesda-css-complete-reviewer-v3';
  const DB_NAME = 'tesda-css-complete-reviewer-storage';
  const DB_STORE = 'reviewer-state';
  const DB_RECORD_KEY = 'current';
  const defaultState = {name:'Learner',theme:'light',completedLessons:[],activityResults:{},checklists:{},quizHistory:[],bestScores:{},lastLesson:'m1-industry',lastPage:{},favorites:[],scrollPositions:{},lastRoute:null,updatedAt:0};
  let state;
  let currentLessonId;
  let currentLessonTab = 'overview';
  let currentPage = 1;
  let activeQuiz = null;
  let lastResults = null;
  let flashState = {index:0,flipped:false,module:'all',query:''};
  let zoomLevel = 1;
  let currentView = 'dashboard';
  let activeActivityId = null;
  let historyReady = false;
  let restoringHistory = false;
  let stateWriteTimer = null;
  let scrollSaveTimer = null;
  let scrollAnimationFrame = 0;
  let scrollRestoreToken = 0;
  let databasePromise = null;
  let offlineStatus = {cached:0,total:0,complete:false,failed:0};

  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const shuffle = a => {const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b;};
  const pct = (a,b)=>b?Math.round(a/b*100):0;
  const lessonById = id => D.lessons.find(l=>l.id===id);
  const moduleById = id => D.modules.find(m=>m.id===id);
  const activityById = id => D.activities.find(a=>a.id===id);

  state = loadState();
  currentLessonId = state.lastLesson;
  currentPage = state.lastPage[currentLessonId] || 1;

  function normalizeState(saved={}){
    const s={...defaultState,...(saved&&typeof saved==='object'?saved:{})};
    s.completedLessons=Array.isArray(s.completedLessons)?s.completedLessons.filter(id=>lessonById(id)):[];
    s.activityResults=s.activityResults&&typeof s.activityResults==='object'?s.activityResults:{};
    s.checklists=s.checklists&&typeof s.checklists==='object'?s.checklists:{};
    s.quizHistory=Array.isArray(s.quizHistory)?s.quizHistory:[];
    s.bestScores=s.bestScores&&typeof s.bestScores==='object'?s.bestScores:{};
    s.lastPage=s.lastPage&&typeof s.lastPage==='object'?s.lastPage:{};
    s.favorites=Array.isArray(s.favorites)?s.favorites:[];
    s.scrollPositions=s.scrollPositions&&typeof s.scrollPositions==='object'?s.scrollPositions:{};
    s.lastRoute=s.lastRoute&&typeof s.lastRoute==='object'?s.lastRoute:null;
    s.updatedAt=Number(s.updatedAt)||0;
    return s;
  }
  function loadState(){
    try{return normalizeState(JSON.parse(localStorage.getItem(STORE_KEY)||'{}'));}
    catch{return normalizeState();}
  }
  function openDatabase(){
    if(databasePromise)return databasePromise;
    if(!('indexedDB' in window))return Promise.reject(new Error('IndexedDB is unavailable.'));
    databasePromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Unable to open IndexedDB.'));
    });
    return databasePromise;
  }
  async function readDatabaseState(){
    try{
      const db=await openDatabase();
      return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get(DB_RECORD_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
    }catch{return null;}
  }
  async function writeDatabaseState(snapshot){
    try{
      const db=await openDatabase();
      await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(snapshot,DB_RECORD_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    }catch{}
  }
  async function restoreDatabaseState(){
    const backup=await readDatabaseState();
    if(backup&&Number(backup.updatedAt)>Number(state.updatedAt)){
      state=normalizeState(backup);
      try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch{}
    }else if(!backup||Number(state.updatedAt)>=Number(backup.updatedAt)){
      await writeDatabaseState(JSON.parse(JSON.stringify(state)));
    }
  }
  function saveState(){
    state.updatedAt=Date.now();
    try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch{}
    clearTimeout(stateWriteTimer);
    const snapshot=JSON.parse(JSON.stringify(state));
    stateWriteTimer=setTimeout(()=>writeDatabaseState(snapshot),120);
    updateChrome();
  }
  function flushState(){
    clearTimeout(stateWriteTimer);
    try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch{}
    writeDatabaseState(JSON.parse(JSON.stringify(state)));
  }
  function toast(message,type='success'){
    const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; $('#toastRegion').appendChild(el); setTimeout(()=>el.remove(),3000);
  }
  function updateChrome(){
    document.documentElement.dataset.theme=state.theme;
    $('#profileName').textContent=state.name||'Learner';
    $('#profileInitial').textContent=(state.name||'L').trim().charAt(0).toUpperCase();
    const p=pct(state.completedLessons.length,D.lessons.length);
    $('#sideProgressText').textContent=`${p}% complete`; $('#sideProgressMeta').textContent=`${state.completedLessons.length} of ${D.lessons.length} lessons`; $('#sideProgressBar').style.width=`${p}%`;
    $('#themeBtn').textContent=state.theme==='dark'?'☀':'◐';
  }
  function setPage(title,subtitle){$('#pageTitle').textContent=title;$('#pageSubtitle').textContent=subtitle;document.title=`${title} — CSS NC II Reviewer`;}
  function closeSidebar(){$('#sidebar').classList.remove('open');$('#sidebarBackdrop').classList.remove('show');}
  function currentRoute(){
    const route={appRoute:true,view:currentView,scrollY:Math.max(0,Math.round(window.scrollY||0))};
    if(currentView==='lesson')Object.assign(route,{lessonId:currentLessonId,tab:currentLessonTab,page:currentPage});
    if(currentView==='activity')route.activityId=activeActivityId;
    if(currentView==='flashcards')Object.assign(route,{flashIndex:flashState.index,flashModule:flashState.module,flashQuery:flashState.query});
    if(currentView==='quiz'&&activeQuiz)route.quizCurrent=activeQuiz.current;
    return route;
  }
  function routeHash(route){
    const enc=value=>encodeURIComponent(String(value||''));
    if(route.view==='lesson')return `#/lesson/${enc(route.lessonId)}/${enc(route.tab||'overview')}/${Number(route.page)||1}`;
    if(route.view==='activity')return `#/activity/${enc(route.activityId)}`;
    return `#/${enc(route.view||'dashboard')}`;
  }
  function routeKey(route){
    if(!route||!route.view)return 'dashboard';
    if(route.view==='lesson')return `lesson:${route.lessonId||currentLessonId}:${route.tab||'overview'}:${Math.max(1,Number(route.page)||1)}`;
    if(route.view==='activity')return `activity:${route.activityId||activeActivityId||''}`;
    if(route.view==='flashcards')return `flashcards:${route.flashModule||'all'}:${route.flashQuery||''}`;
    if(route.view==='quiz')return `quiz:${Math.max(0,Number(route.quizCurrent)||0)}`;
    return route.view;
  }
  function parseRoute(){
    const parts=(location.hash||'#/dashboard').replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);
    if(parts[0]==='lesson'&&lessonById(parts[1]))return {appRoute:true,view:'lesson',lessonId:parts[1],tab:['overview','pages','activities','checklist'].includes(parts[2])?parts[2]:'overview',page:Math.max(1,Number(parts[3])||1)};
    if(parts[0]==='activity'&&activityById(parts[1]))return {appRoute:true,view:'activity',activityId:parts[1]};
    const valid=['dashboard','modules','activities','flashcards','assessment','glossary','sources','settings','about'];
    return {appRoute:true,view:valid.includes(parts[0])?parts[0]:'dashboard'};
  }
  function routeScroll(route){
    if(route&&Object.prototype.hasOwnProperty.call(route,'scrollY')&&Number.isFinite(Number(route.scrollY)))return Math.max(0,Number(route.scrollY));
    return Math.max(0,Number(state.scrollPositions[routeKey(route)])||0);
  }
  function persistRouteSnapshot(route=currentRoute(),saveDatabaseLater=true){
    if(!route||!route.appRoute)return;
    const snapshotRoute={...route,scrollY:Math.max(0,Math.round(Number(route.scrollY)||0))};
    state.scrollPositions[routeKey(snapshotRoute)]=snapshotRoute.scrollY;
    state.lastRoute=snapshotRoute;
    state.updatedAt=Date.now();
    try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch{}
    if(saveDatabaseLater){
      clearTimeout(stateWriteTimer);
      const snapshot=JSON.parse(JSON.stringify(state));
      stateWriteTimer=setTimeout(()=>writeDatabaseState(snapshot),250);
    }
  }
  function storeCurrentScroll(){
    if(!historyReady||restoringHistory)return;
    const route=currentRoute();
    persistRouteSnapshot(route);
    if(history.state?.appRoute)history.replaceState(route,'',location.href);
  }
  function scheduleCurrentScrollSave(){
    if(!historyReady||restoringHistory)return;
    if(scrollAnimationFrame)cancelAnimationFrame(scrollAnimationFrame);
    scrollAnimationFrame=requestAnimationFrame(()=>{
      clearTimeout(scrollSaveTimer);
      scrollSaveTimer=setTimeout(storeCurrentScroll,90);
    });
  }
  function restoreScrollPosition(value){
    const target=Math.max(0,Math.round(Number(value)||0));
    const token=++scrollRestoreToken;
    const apply=()=>{
      if(token!==scrollRestoreToken)return;
      const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
      window.scrollTo({top:Math.min(target,max),left:0,behavior:'auto'});
    };
    requestAnimationFrame(()=>requestAnimationFrame(apply));
    [80,180,350,700,1200,2000].forEach(delay=>setTimeout(apply,delay));
    const active=$('.view.active');
    if(active){
      const pending=$$('img',active).filter(img=>!img.complete);
      if(pending.length){
        Promise.allSettled(pending.map(img=>new Promise(resolve=>{
          img.addEventListener('load',resolve,{once:true});
          img.addEventListener('error',resolve,{once:true});
          setTimeout(resolve,1800);
        }))).then(apply);
      }
    }
  }
  function writeRouteHistory(mode='push'){
    if(!historyReady||restoringHistory)return;
    const route=currentRoute();
    const url=routeHash(route);
    if(mode==='replace')history.replaceState(route,'',url);
    else history.pushState(route,'',url);
    persistRouteSnapshot(route);
  }
  function pushCurrentRoute(){writeRouteHistory('push');}
  function applyRoute(route){
    if(!route||!route.appRoute)route=parseRoute();
    const targetScroll=routeScroll(route);
    restoringHistory=true;
    if(route.view==='lesson'&&lessonById(route.lessonId)){
      currentLessonId=route.lessonId;
      currentLessonTab=['overview','pages','activities','checklist'].includes(route.tab)?route.tab:'overview';
      currentPage=Math.max(1,Math.min(Number(route.page)||1,lessonById(currentLessonId).pages));
      state.lastLesson=currentLessonId;state.lastPage[currentLessonId]=currentPage;
    }
    if(route.view==='activity'&&activityById(route.activityId))activeActivityId=route.activityId;
    if(route.view==='flashcards'){
      flashState.index=Math.max(0,Number(route.flashIndex)||0);
      flashState.module=route.flashModule||flashState.module;
      flashState.query=route.flashQuery||'';
    }
    navigate(route.view,{fromHistory:true,keepScroll:true});
    restoringHistory=false;
    const restoredRoute={...currentRoute(),scrollY:targetScroll};
    persistRouteSnapshot(restoredRoute);
    restoreScrollPosition(targetScroll);
  }
  function navigate(view,opts={}){
    if(!opts.fromHistory&&!opts.skipStore)storeCurrentScroll();
    $$('.view').forEach(v=>v.classList.remove('active'));
    const target=$(`#view-${view}`); if(!target)return; target.classList.add('active');
    currentView=view;
    $$('.nav-item[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view || (view==='lesson'&&n.dataset.view==='modules') || (view==='activity'&&n.dataset.view==='activities') || (['quiz','results'].includes(view)&&n.dataset.view==='assessment')));
    closeSidebar(); if(!opts.keepScroll) window.scrollTo({top:0,left:0,behavior:'auto'});
    const renders={dashboard:renderDashboard,modules:renderModules,lesson:renderLesson,activities:renderActivities,activity:()=>{const a=activityById(activeActivityId);if(a)renderActivity(a);},flashcards:renderFlashcards,assessment:renderAssessment,quiz:renderQuiz,results:renderResults,glossary:renderGlossary,sources:renderSources,settings:renderSettings,about:renderAbout};
    if(renders[view]) renders[view]();
    if(!opts.fromHistory)writeRouteHistory(opts.replace?'replace':'push');
  }

  function moduleProgress(mid){const m=moduleById(mid);return pct(m.lessonIds.filter(id=>state.completedLessons.includes(id)).length,m.lessonIds.length);}
  function activityCompleted(id){return Boolean(state.activityResults[id]?.completed);}
  function renderDashboard(){
    setPage('Dashboard','Complete reviewer for all lessons supplied in Modules 1 through 5.');
    const lesson=lessonById(state.lastLesson)||D.lessons[0];
    const completedActivities=D.activities.filter(a=>activityCompleted(a.id)).length;
    const latest=state.quizHistory[0];
    $('#view-dashboard').innerHTML=`
      <section class="hero">
        <div><span class="eyebrow">TESDA CSS NC II learning companion</span><h2>Study every supplied module page, ${esc((state.name||'Learner').split(' ')[0])}.</h2><p>The website preserves every learning page after removing each personal printed cover. Images, icons, instructions, tables, screenshots, and original attributions remain available with responsive activities and assessments.</p><div class="hero-actions"><button class="btn primary" data-open-lesson="${lesson.id}">Continue: ${esc(lesson.title)}</button><button class="btn" data-view-go="modules">Browse all lessons</button><button class="btn" data-view-go="about">About the creators</button></div></div>
        <div class="hero-art"><div class="hero-ring"><b>${D.modules.length}</b><span>modules</span></div><div class="hero-ring"><b>${D.lessons.length}</b><span>lessons</span></div><div class="hero-ring"><b>${D.lessons.reduce((n,l)=>n+l.pages,0)}</b><span>source pages</span></div></div>
      </section>
      <section class="stats-grid">
        <article class="stat-card"><span>Lesson progress</span><b>${state.completedLessons.length}/${D.lessons.length}</b><div class="progress-track"><i style="width:${pct(state.completedLessons.length,D.lessons.length)}%"></i></div></article>
        <article class="stat-card"><span>Activities completed</span><b>${completedActivities}/${D.activities.length}</b><div class="progress-track"><i style="width:${pct(completedActivities,D.activities.length)}%"></i></div></article>
        <article class="stat-card"><span>Practice questions</span><b>${D.questions.length}</b><small>${latest?`Latest score: ${latest.percent}%`:'No test taken yet'}</small></article>
        <article class="stat-card"><span>Flashcards</span><b>${D.flashcards.length}</b><small>${D.glossary.length} glossary terms</small></article>
      </section>
      <div class="section-head"><div><span class="eyebrow">Course structure</span><h2>Modules</h2></div><button class="text-btn" data-view-go="modules">View all lessons →</button></div>
      <section class="module-grid">${D.modules.map(m=>moduleCard(m)).join('')}</section>
      <div class="section-head"><div><span class="eyebrow">Continue learning</span><h2>Recommended next steps</h2></div></div>
      <section class="next-grid">
        <article class="next-card"><span class="next-icon">▤</span><div><b>Read the complete source pages</b><p>Open a lesson and use the Source Pages tab to move page by page, zoom images, and reveal extracted text.</p></div><button class="btn small" data-open-lesson="${lesson.id}" data-tab="pages">Open pages</button></article>
        <article class="next-card"><span class="next-icon">◫</span><div><b>Practice the module activities</b><p>Rebuilt H5P-style word search, ordering, matching, self-check, forms, and checklists.</p></div><button class="btn small" data-view-go="activities">Open activities</button></article>
        <article class="next-card"><span class="next-icon">✓</span><div><b>Take a randomized test</b><p>Choose a module, lesson, difficulty, and question count, then review explanations.</p></div><button class="btn small" data-view-go="assessment">Start setup</button></article>
      </section>`;
  }
  function moduleCard(m){
    const first=lessonById(m.lessonIds[0]);
    return `<article class="module-card ${m.id}"><div class="module-card-top"><span>${m.code}</span><b>${moduleProgress(m.id)}%</b></div><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p><div class="module-meta"><span>${m.lessonIds.length} lessons</span><span>${m.lessonIds.reduce((n,id)=>n+lessonById(id).pages,0)} pages</span></div><div class="progress-track"><i style="width:${moduleProgress(m.id)}%"></i></div><button class="btn block" data-open-lesson="${first.id}">Start module</button></article>`;
  }

  function renderModules(){
    setPage('Modules & Lessons','Browse the exact structure from the five supplied archives.');
    $('#view-modules').innerHTML=D.modules.map(m=>{
      const lessons=m.lessonIds.map(id=>lessonById(id));
      return `<section class="module-section"><div class="module-banner ${m.id}"><div><span class="eyebrow">${m.code}</span><h2>${esc(m.title)}</h2><p>${esc(m.description)}</p></div><div class="module-banner-stat"><b>${moduleProgress(m.id)}%</b><span>complete</span></div></div>
        ${m.groups.map(group=>`<div class="lesson-group"><div class="group-title"><h3>${esc(group)}</h3><span>${lessons.filter(l=>l.group===group).length} lessons</span></div><div class="lesson-list">${lessons.filter(l=>l.group===group).map((l,i)=>lessonCard(l,i)).join('')}</div></div>`).join('')}</section>`;
    }).join('');
  }
  function lessonCard(l,index){
    const done=state.completedLessons.includes(l.id); const actDone=l.activityIds.filter(activityCompleted).length;
    const preview=l.pagesData[Math.min(2,l.pagesData.length-1)].image;
    return `<article class="lesson-card" data-open-lesson="${l.id}"><img src="${preview}" alt="Preview of ${esc(l.title)}" loading="lazy"><div class="lesson-card-body"><div class="lesson-card-kicker"><span>${esc(l.number)}</span><span>${l.pages} pages</span></div><h4>${esc(l.title)}</h4><p>${esc(l.summary)}</p><div class="lesson-tags">${l.topics.slice(0,3).map(t=>`<span>${esc(t)}</span>`).join('')}</div><div class="lesson-card-footer"><span class="status ${done?'done':''}">${done?'✓ Completed':'○ Not completed'}</span><span>${actDone}/${l.activityIds.length} activities</span></div></div></article>`;
  }

  function openLesson(id,tab='overview',page=null){
    const l=lessonById(id); if(!l)return; storeCurrentScroll(); currentLessonId=id; currentLessonTab=tab; currentPage=page||state.lastPage[id]||1; state.lastLesson=id; saveState(); navigate('lesson',{skipStore:true});
  }
  function renderLesson(){
    const l=lessonById(currentLessonId); if(!l)return navigate('modules');
    const m=moduleById(l.module); setPage(l.title,`${m.code} • ${l.group} • ${l.pages} source pages`);
    const done=state.completedLessons.includes(l.id);
    $('#view-lesson').innerHTML=`
      <button class="back-link" data-view-go="modules">← Back to modules</button>
      <section class="lesson-hero"><div><span class="eyebrow">${m.code} · ${esc(l.group)} · ${esc(l.number)}</span><h2>${esc(l.title)}</h2><p>${esc(l.summary)}</p><div class="lesson-actions"><button class="btn primary" id="completeLessonBtn">${done?'✓ Lesson completed':'Mark lesson complete'}</button><a class="btn" href="${l.pdf}" target="_blank" rel="noopener">Open original PDF</a><button class="btn" id="printLessonBtn">Print lesson</button></div></div><img src="${l.pagesData[Math.min(2,l.pagesData.length-1)].image}" alt="${esc(l.title)} lesson visual"></section>
      <div class="tabs" role="tablist"><button class="tab ${currentLessonTab==='overview'?'active':''}" data-lesson-tab="overview">Overview</button><button class="tab ${currentLessonTab==='pages'?'active':''}" data-lesson-tab="pages">Source Pages (${l.pages})</button><button class="tab ${currentLessonTab==='activities'?'active':''}" data-lesson-tab="activities">Activities (${l.activityIds.length})</button><button class="tab ${currentLessonTab==='checklist'?'active':''}" data-lesson-tab="checklist">Study Checklist</button></div>
      <div id="lessonTabContent"></div>`;
    renderLessonTab();
  }
  function renderLessonTab(){
    const l=lessonById(currentLessonId); const box=$('#lessonTabContent'); if(!box)return;
    $$('.tab[data-lesson-tab]').forEach(b=>b.classList.toggle('active',b.dataset.lessonTab===currentLessonTab));
    if(currentLessonTab==='overview'){
      box.innerHTML=`<section class="content-grid"><article class="panel"><span class="eyebrow">Lesson scope</span><h3>Topics included</h3><ol class="topic-list">${l.topics.map(t=>`<li>${esc(t)}</li>`).join('')}</ol><div class="source-note"><b>Complete visual content is preserved.</b><p>Use Source Pages to view every supplied page with its images, icons, diagrams, tables, instructions, and original credits. Extracted page text is available below each page for search and accessibility.</p></div></article><article class="panel"><span class="eyebrow">Quick access</span><h3>Lesson resources</h3><div class="resource-list"><button data-lesson-tab-go="pages"><b>Read all ${l.pages} source pages</b><span>Page viewer with zoom and text</span></button><button data-lesson-tab-go="activities"><b>Complete ${l.activityIds.length} activities</b><span>H5P-style and practical exercises</span></button><a href="${l.pdf}" target="_blank"><b>Open original PDF</b><span>View or save the supplied source file</span></a></div></article></section><section class="panel"><div class="section-head compact"><div><span class="eyebrow">Activities in this lesson</span><h3>Interactive practice</h3></div></div><div class="activity-grid">${l.activityIds.map(id=>activityCard(activityById(id))).join('')}</div></section>`;
    } else if(currentLessonTab==='pages') renderPageViewer();
    else if(currentLessonTab==='activities') box.innerHTML=`<section class="panel"><div class="section-head compact"><div><span class="eyebrow">Lesson activities</span><h3>Practice and self-check</h3></div></div><div class="activity-grid">${l.activityIds.map(id=>activityCard(activityById(id))).join('')}</div></section>`;
    else {
      const saved=state.checklists[`lesson-${l.id}`]||[];
      box.innerHTML=`<section class="panel checklist-panel"><div class="section-head compact"><div><span class="eyebrow">Knowledge and performance</span><h3>Study checklist</h3><p>Check each item only when you can explain or perform it confidently.</p></div><b>${saved.length}/${l.checklist.length}</b></div><div class="check-list">${l.checklist.map((item,i)=>`<label><input type="checkbox" data-lesson-check="${i}" ${saved.includes(i)?'checked':''}><span>${esc(item)}</span></label>`).join('')}</div></section>`;
    }
  }
  function activityCard(a){const r=state.activityResults[a.id]; return `<article class="activity-card"><div class="activity-icon">${activityIcon(a.type)}</div><div><span>${a.supplemental?'Supplemental practice':activityTypeLabel(a.type)}</span><h4>${esc(a.title)}</h4><p>${esc(a.instruction)}</p></div><div class="activity-footer"><span class="status ${r?.completed?'done':''}">${r?.completed?`✓ ${r.score??'Done'}`:'Not completed'}</span><button class="btn small" data-open-activity="${a.id}">${r?.completed?'Try again':'Open'}</button></div></article>`;}
  function activityIcon(type){return ({match:'↔',classify:'▦',order:'↕',checklist:'☑',mcq:'?',wordsearch:'⌗',fill:'▭',risk:'⚠',inventory:'▤',qualitylog:'✎',flashcards:'▱',speech:'◉',topology:'⌘'})[type]||'◫';}
  function activityTypeLabel(type){return ({match:'Matching',classify:'Classification',order:'Arrange sequence',checklist:'Checklist',mcq:'Self-check',wordsearch:'Word search',fill:'Fill in the blanks',risk:'Risk worksheet',inventory:'Form activity',qualitylog:'Documentation form',flashcards:'Turn cards',speech:'Speech self-check',topology:'Topology builder'})[type]||'Activity';}

  function renderPageViewer(){
    const l=lessonById(currentLessonId); currentPage=Math.min(Math.max(1,currentPage),l.pages);
    const p=l.pagesData[currentPage-1]; state.lastPage[l.id]=currentPage; saveState();
    $('#lessonTabContent').innerHTML=`<section class="page-viewer"><div class="page-toolbar"><div><b>Source page ${currentPage} of ${l.pages}</b><span>${esc(l.title)}</span></div><div class="page-nav"><button class="btn small" id="prevPageBtn" ${currentPage===1?'disabled':''}>← Previous</button><select id="pageSelect" aria-label="Select page">${l.pagesData.map(x=>`<option value="${x.n}" ${x.n===currentPage?'selected':''}>Page ${x.n}</option>`).join('')}</select><button class="btn small" id="nextPageBtn" ${currentPage===l.pages?'disabled':''}>Next →</button></div></div><div class="source-page"><button class="page-image-button" id="expandPageBtn" aria-label="Expand source page"><img src="${p.image}" alt="${esc(l.title)}, source page ${currentPage}" loading="eager"></button><details class="page-text"><summary>Show extracted text for this page</summary><pre>${esc(p.text||'No selectable text was exported for this page. The visual page above remains the source of truth.')}</pre></details></div><div class="thumbnail-strip">${l.pagesData.map(x=>`<button class="thumb ${x.n===currentPage?'active':''}" data-page="${x.n}" title="Page ${x.n}"><img src="${x.image}" alt="Page ${x.n}" loading="lazy"><span>${x.n}</span></button>`).join('')}</div></section>`;
  }
  function openImageDialog(){
    const l=lessonById(currentLessonId),p=l.pagesData[currentPage-1]; zoomLevel=1; $('#imageDialogImg').src=p.image; $('#imageDialogTitle').textContent=l.title; $('#imageDialogMeta').textContent=`Page ${currentPage} of ${l.pages}`; applyZoom(); $('#imageDialog').showModal();
  }
  function applyZoom(){const img=$('#imageDialogImg');img.style.transform=`scale(${zoomLevel})`;$('#zoomResetBtn').textContent=`${Math.round(zoomLevel*100)}%`;}

  function renderActivities(){
    setPage('Interactive Activities','Rebuilt activities, practical forms, self-checks, and supplemental guided practice.');
    $('#view-activities').innerHTML=`<section class="filter-bar"><label>Module<select id="activityModuleFilter"><option value="all">All modules</option>${D.modules.map(m=>`<option value="${m.id}">${m.code}</option>`).join('')}</select></label><label>Type<select id="activityTypeFilter"><option value="all">All activity types</option>${[...new Set(D.activities.map(a=>a.type))].map(t=>`<option value="${t}">${activityTypeLabel(t)}</option>`).join('')}</select></label><label class="grow">Search<input id="activitySearch" type="search" placeholder="Search activities…"></label></section><div id="activityLibrary"></div>`;
    filterActivities();
  }
  function filterActivities(){
    const mid=$('#activityModuleFilter')?.value||'all',type=$('#activityTypeFilter')?.value||'all',q=($('#activitySearch')?.value||'').toLowerCase();
    const acts=D.activities.filter(a=>{const l=lessonById(a.lessonId);return (mid==='all'||l.module===mid)&&(type==='all'||a.type===type)&&(!q||`${a.title} ${a.instruction} ${l.title}`.toLowerCase().includes(q));});
    const byLesson={};acts.forEach(a=>(byLesson[a.lessonId]??=[]).push(a));
    $('#activityLibrary').innerHTML=acts.length?Object.entries(byLesson).map(([lid,list])=>`<section class="activity-section"><div class="group-title"><div><span class="eyebrow">${moduleById(lessonById(lid).module).code}</span><h3>${esc(lessonById(lid).title)}</h3></div><button class="text-btn" data-open-lesson="${lid}" data-tab="activities">Open lesson →</button></div><div class="activity-grid">${list.map(activityCard).join('')}</div></section>`).join(''):`<div class="empty-state"><b>No activities found</b><p>Adjust the filters or search term.</p></div>`;
  }

  function orderedActivities(){
    return D.modules.flatMap(module=>module.lessonIds.flatMap(lessonId=>{
      const lesson=lessonById(lessonId);
      return lesson?lesson.activityIds.map(activityById).filter(Boolean):[];
    }));
  }
  function nextActivityAfter(id){
    const activities=orderedActivities();
    const index=activities.findIndex(activity=>activity.id===id);
    return index>=0&&index<activities.length-1?activities[index+1]:null;
  }
  function updateActivityContinuation(a){
    const box=$('#activityContinue');
    if(!box)return;
    if(!activityCompleted(a.id)){box.hidden=true;box.innerHTML='';return;}
    const next=nextActivityAfter(a.id);
    box.hidden=false;
    if(next){
      const nextLesson=lessonById(next.lessonId);
      const nextModule=moduleById(nextLesson.module);
      box.innerHTML=`<div><span class="eyebrow">Activity completed</span><h3>Continue without returning to the activity list</h3><p><b>Next: ${esc(next.title)}</b><br><small>${esc(nextModule.code)} · ${esc(nextLesson.title)}</small></p></div><div class="activity-actions"><button class="btn" data-view-go="activities">Activity library</button><button class="btn primary" data-open-activity="${next.id}">Next activity →</button></div>`;
    }else{
      box.innerHTML=`<div><span class="eyebrow">All activities reached</span><h3>You completed the final activity in the reviewer sequence.</h3><p>Your saved activity records remain available offline on this device.</p></div><div class="activity-actions"><button class="btn primary" data-view-go="activities">Return to activity library</button></div>`;
    }
  }
  function openActivity(id){const a=activityById(id);if(!a)return;storeCurrentScroll();activeActivityId=id;navigate('activity',{skipStore:true});}
  function renderActivity(a){
    const lesson=lessonById(a.lessonId);setPage(a.title,`${lesson.title} • ${activityTypeLabel(a.type)}`);$('#view-activity').innerHTML=`<button class="back-link" data-view-go="activities">← Back to activities</button><section class="activity-work"><div class="activity-work-head"><div class="activity-icon large">${activityIcon(a.type)}</div><div><span class="eyebrow">${moduleById(lesson.module).code} · ${esc(lesson.title)}</span><h2>${esc(a.title)}</h2><p>${esc(a.instruction)}</p>${a.supplemental?'<div class="supplemental-note">This is clearly labeled supplemental practice because the exported PDF references hidden H5P slides that were not included in the file.</div>':''}</div></div><div id="activityBody"></div><section id="activityContinue" class="feedback success" aria-live="polite" hidden></section></section>`;
    const renderers={match:renderMatch,classify:renderClassify,order:renderOrder,checklist:renderChecklistActivity,mcq:renderMcqActivity,wordsearch:renderWordSearch,fill:renderFill,risk:renderRisk,inventory:renderInventory,qualitylog:renderQualityLog,flashcards:renderActivityFlashcards,speech:renderSpeech,topology:renderTopology};
    (renderers[a.type]||(()=>{}))(a,$('#activityBody'));
    updateActivityContinuation(a);
  }
  function completeActivity(a,score,total,extra={}){state.activityResults[a.id]={completed:true,score:total?`${score}/${total}`:'Completed',numeric:total?pct(score,total):100,updated:new Date().toISOString(),...extra};saveState();updateActivityContinuation(a);toast(total?`Activity score: ${score}/${total}`:'Activity saved');}
  function renderMatch(a,body){
    const right=shuffle(a.pairs.map((p,i)=>({text:p[1],index:i})));
    body.innerHTML=`<div class="match-instructions"><b>How to match</b><span>Select any item from either column, then select its partner in the other column. Select a paired item to change its match.</span></div><div class="match-grid"><div class="match-column"><h3>Items</h3>${a.pairs.map((p,i)=>`<button class="match-item" data-left="${i}" aria-pressed="false"><span class="match-token"></span><span>${esc(p[0])}</span></button>`).join('')}</div><div class="match-column"><h3>Matches</h3>${right.map(r=>`<button class="match-item answer" data-right="${r.index}" aria-pressed="false"><span class="match-token"></span><span>${esc(r.text)}</span></button>`).join('')}</div></div><div class="selection-help" id="matchHelp">Select an item from either the left or right column.</div><div class="activity-actions"><button class="btn" id="resetActivityBtn">Reset</button><button class="btn primary" id="checkActivityBtn">Check answers</button></div><div id="activityFeedback"></div>`;
    let selected=null; const mapping={};
    const byLeft=i=>$(`[data-left="${i}"]`,body),byRight=i=>$(`[data-right="${i}"]`,body);
    const clearVisuals=el=>{el.classList.remove('selected','paired','correct','wrong');el.removeAttribute('data-pair-color');el.setAttribute('aria-pressed','false');const t=$('.match-token',el);if(t)t.textContent='';};
    const unpairLeft=left=>{if(mapping[left]===undefined)return;const rightIndex=mapping[left];delete mapping[left];[byLeft(left),byRight(rightIndex)].filter(Boolean).forEach(clearVisuals);};
    const unpairRight=right=>{const entry=Object.entries(mapping).find(([,r])=>Number(r)===Number(right));if(entry)unpairLeft(Number(entry[0]));};
    const redrawPairs=()=>{
      $$('.match-item',body).forEach(el=>{el.classList.remove('paired');el.removeAttribute('data-pair-color');const t=$('.match-token',el);if(t)t.textContent='';el.setAttribute('aria-pressed',el.classList.contains('selected')?'true':'false');});
      Object.entries(mapping).forEach(([l,r],order)=>{const color=order%8+1;[byLeft(l),byRight(r)].filter(Boolean).forEach(el=>{el.classList.add('paired');el.dataset.pairColor=color;el.setAttribute('aria-pressed','true');const t=$('.match-token',el);if(t)t.textContent=String(order+1);});});
      $('#matchHelp',body).textContent=selected?`Selected ${selected.side==='left'?'item':'match'}: ${selected.label}. Choose from the other column.`:`${Object.keys(mapping).length}/${a.pairs.length} matched. Select either column to continue.`;
    };
    const select=(side,index,button)=>{
      button.classList.remove('correct','wrong');
      if(side==='left'&&mapping[index]!==undefined)unpairLeft(index);
      if(side==='right')unpairRight(index);
      if(!selected||selected.side===side){
        $$('.match-item.selected',body).forEach(x=>x.classList.remove('selected'));
        selected={side,index,label:side==='left'?a.pairs[index][0]:a.pairs[index][1]};button.classList.add('selected');redrawPairs();button.classList.add('selected');return;
      }
      const left=side==='left'?index:selected.index;
      const right=side==='right'?index:selected.index;
      unpairLeft(left);unpairRight(right);mapping[left]=right;
      $$('.match-item.selected',body).forEach(x=>x.classList.remove('selected'));
      selected=null;redrawPairs();
    };
    $$('[data-left]',body).forEach(b=>b.onclick=()=>select('left',Number(b.dataset.left),b));
    $$('[data-right]',body).forEach(b=>b.onclick=()=>select('right',Number(b.dataset.right),b));
    const reset=()=>{$$('.match-item',body).forEach(clearVisuals);Object.keys(mapping).forEach(k=>delete mapping[k]);selected=null;$('#matchHelp',body).textContent='Select an item from either the left or right column.';$('#activityFeedback',body).innerHTML='';};
    $('#resetActivityBtn',body).onclick=reset;
    $('#checkActivityBtn',body).onclick=()=>{let score=0;$$('.match-item',body).forEach(x=>x.classList.remove('correct','wrong'));Object.entries(mapping).forEach(([l,r])=>{const ok=Number(l)===Number(r);if(ok)score++;[byLeft(l),byRight(r)].filter(Boolean).forEach(el=>el.classList.add(ok?'correct':'wrong'));});$('#activityFeedback',body).innerHTML=feedback(score,a.pairs.length,Object.keys(mapping).length<a.pairs.length?'Complete all pairs, then review any highlighted matches.':'');completeActivity(a,score,a.pairs.length);};
  }
  function renderClassify(a,body){
    body.innerHTML=`<div class="classify-list">${a.items.map((it,i)=>`<article class="classify-item" data-classify-card="${i}"><b>${esc(it.text)}</b><div class="classify-options">${a.categories.map(c=>`<button type="button" data-classify-item="${i}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}</div><p class="classification-result" id="classification-result-${i}" aria-live="polite"></p></article>`).join('')}</div><div class="activity-actions"><button class="btn primary" id="checkActivityBtn">Check answers</button></div><div id="activityFeedback"></div>`;
    const answers={};
    $$('[data-classify-item]',body).forEach(button=>button.onclick=()=>{
      const i=Number(button.dataset.classifyItem);
      answers[i]=button.dataset.category;
      const card=$(`[data-classify-card="${i}"]`,body);
      const result=$(`#classification-result-${i}`,body);
      $$(`[data-classify-item="${i}"]`,body).forEach(option=>{
        option.classList.toggle('selected',option===button);
        option.classList.remove('correct','wrong','answer-key');
        option.removeAttribute('aria-label');
      });
      card?.classList.remove('classification-correct','classification-wrong','classification-unanswered');
      if(result){result.className='classification-result';result.textContent='';}
    });
    $('#checkActivityBtn').onclick=()=>{
      let score=0;
      a.items.forEach((item,i)=>{
        const selected=answers[i];
        const correctCategory=item.category;
        const isCorrect=selected===correctCategory;
        const card=$(`[data-classify-card="${i}"]`,body);
        const result=$(`#classification-result-${i}`,body);
        const options=$$(`[data-classify-item="${i}"]`,body);
        options.forEach(option=>{
          const isSelected=option.dataset.category===selected;
          const isAnswer=option.dataset.category===correctCategory;
          option.classList.remove('correct','wrong','answer-key');
          if(isCorrect&&isSelected){option.classList.add('correct');option.setAttribute('aria-label',`${option.textContent}: correct answer`);}
          if(!isCorrect&&isSelected){option.classList.add('wrong');option.setAttribute('aria-label',`${option.textContent}: wrong answer`);}
          if(!isCorrect&&isAnswer){option.classList.add('correct','answer-key');option.setAttribute('aria-label',`${option.textContent}: correct answer`);}
        });
        card?.classList.remove('classification-correct','classification-wrong','classification-unanswered');
        if(isCorrect){
          score++;
          card?.classList.add('classification-correct');
          if(result){result.className='classification-result correct';result.textContent='✓ Correct';}
        }else if(selected){
          card?.classList.add('classification-wrong');
          if(result){result.className='classification-result wrong';result.textContent=`✕ Wrong. Correct answer: ${correctCategory}`;}
        }else{
          card?.classList.add('classification-unanswered');
          if(result){result.className='classification-result unanswered';result.textContent=`Not answered. Correct answer: ${correctCategory}`;}
        }
      });
      $('#activityFeedback').innerHTML=feedback(score,a.items.length);
      completeActivity(a,score,a.items.length);
    };
  }
  function renderOrder(a,body){
    let items=shuffle(a.items.map((text,correct)=>({text,correct}))); if(items.every((x,i)=>x.correct===i))items.reverse();
    const draw=()=>{body.innerHTML=`<ol class="order-list" id="orderList">${items.map((it,i)=>`<li draggable="true" data-order-index="${i}"><span class="drag-handle">⋮⋮</span><b>${i+1}</b><span>${esc(it.text)}</span><div><button data-move-up="${i}" aria-label="Move up">↑</button><button data-move-down="${i}" aria-label="Move down">↓</button></div></li>`).join('')}</ol><div class="activity-actions"><button class="btn" id="shuffleOrderBtn">Shuffle</button><button class="btn primary" id="checkActivityBtn">Check sequence</button></div><div id="activityFeedback"></div>`;bind();};
    const move=(i,d)=>{const j=i+d;if(j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];draw();};
    function bind(){
      $$('[data-move-up]',body).forEach(b=>b.onclick=()=>move(Number(b.dataset.moveUp),-1));$$('[data-move-down]',body).forEach(b=>b.onclick=()=>move(Number(b.dataset.moveDown),1));
      let drag=null;$$('[draggable="true"]',body).forEach(li=>{li.ondragstart=()=>drag=Number(li.dataset.orderIndex);li.ondragover=e=>e.preventDefault();li.ondrop=e=>{e.preventDefault();const to=Number(li.dataset.orderIndex);const [x]=items.splice(drag,1);items.splice(to,0,x);draw();};});
      $('#shuffleOrderBtn').onclick=()=>{items=shuffle(items);draw();};$('#checkActivityBtn').onclick=()=>{const score=items.filter((x,i)=>x.correct===i).length;$$('[data-order-index]',body).forEach((li,i)=>li.classList.add(items[i].correct===i?'correct':'wrong'));$('#activityFeedback').innerHTML=feedback(score,items.length,score===items.length?'Sequence is correct.':'Review the source lesson and try again.');completeActivity(a,score,items.length);};
    }draw();
  }
  function renderChecklistActivity(a,body){
    const key=`activity-${a.id}`,saved=state.checklists[key]||[];body.innerHTML=`<div class="check-list">${a.items.map((it,i)=>`<label><input type="checkbox" data-act-check="${i}" ${saved.includes(i)?'checked':''}><span>${esc(it)}</span></label>`).join('')}</div><div class="activity-actions"><button class="btn" id="clearChecklistBtn">Clear</button><button class="btn primary" id="saveChecklistBtn">Save checklist</button></div><div id="activityFeedback"></div>`;
    $('#clearChecklistBtn').onclick=()=>{$$('[data-act-check]',body).forEach(x=>x.checked=false);};$('#saveChecklistBtn').onclick=()=>{const checked=$$('[data-act-check]:checked',body).map(x=>Number(x.dataset.actCheck));state.checklists[key]=checked;completeActivity(a,checked.length,a.items.length);$('#activityFeedback').innerHTML=feedback(checked.length,a.items.length,'Checklist progress saved on this device.');};
  }
  function renderMcqActivity(a,body){
    body.innerHTML=`<div class="question-stack">${a.questions.map((q,qi)=>`<article class="mini-question"><h3>${qi+1}. ${esc(q.q)}</h3>${q.options.map((o,oi)=>`<label><input type="radio" name="aq${qi}" value="${oi}"><span>${esc(o)}</span></label>`).join('')}<div class="mini-explain" id="aqexp${qi}"></div></article>`).join('')}</div><div class="activity-actions"><button class="btn primary" id="checkActivityBtn">Check answers</button></div><div id="activityFeedback"></div>`;
    $('#checkActivityBtn').onclick=()=>{let score=0;a.questions.forEach((q,qi)=>{const selected=$(`input[name="aq${qi}"]:checked`,body);const v=selected?Number(selected.value):-1;const ok=v===q.answer;if(ok)score++;$(`#aqexp${qi}`).innerHTML=`<b class="${ok?'good':'bad'}">${ok?'Correct':'Incorrect'}</b><p>${esc(q.why)}</p>`;$$(`input[name="aq${qi}"]`,body).forEach(x=>x.closest('label').classList.toggle('correct',Number(x.value)===q.answer));});$('#activityFeedback').innerHTML=feedback(score,a.questions.length);completeActivity(a,score,a.questions.length);};
  }
  function feedback(score,total,msg=''){return `<div class="feedback ${score===total?'success':'review'}"><b>${score}/${total} correct</b><p>${esc(msg|| (score===total?'Excellent. You completed the activity correctly.':'Review the highlighted answers and the source lesson.'))}</p></div>`;}

  function generateWordGrid(words){
    const size=15,grid=Array.from({length:size},()=>Array(size).fill('')),dirs=[[0,1],[1,0],[1,1],[-1,1]];let seed=37;const rand=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};const placed=[];
    for(const word of [...words].sort((a,b)=>b.length-a.length)){
      let ok=false;for(let tries=0;tries<500&&!ok;tries++){const [dr,dc]=dirs[Math.floor(rand()*dirs.length)],r=Math.floor(rand()*size),c=Math.floor(rand()*size),er=r+dr*(word.length-1),ec=c+dc*(word.length-1);if(er<0||er>=size||ec<0||ec>=size)continue;let fits=true;for(let k=0;k<word.length;k++){const ch=grid[r+dr*k][c+dc*k];if(ch&&ch!==word[k]){fits=false;break;}}if(!fits)continue;const cells=[];for(let k=0;k<word.length;k++){grid[r+dr*k][c+dc*k]=word[k];cells.push(`${r+dr*k}-${c+dc*k}`);}placed.push({word,cells});ok=true;}
    }
    const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';grid.forEach(row=>row.forEach((ch,i)=>{if(!ch)row[i]=letters[Math.floor(rand()*letters.length)];}));return {grid,placed};
  }
  function renderWordSearch(a,body){
    const ws=generateWordGrid(a.words);let start=null,found=new Set();body.innerHTML=`<div class="word-layout"><div class="word-grid" style="--grid-size:${ws.grid.length}">${ws.grid.map((row,r)=>row.map((ch,c)=>`<button data-cell="${r}-${c}">${ch}</button>`).join('')).join('')}</div><div class="word-list"><h3>Find the words</h3>${a.words.map(w=>`<span data-word="${w}">${w}</span>`).join('')}<p>Tap the first letter, then tap the last letter of the word.</p></div></div><div class="activity-actions"><button class="btn" id="resetActivityBtn">Reset</button></div><div id="activityFeedback"></div>`;
    const clearStart=()=>{$$('[data-cell]',body).forEach(x=>x.classList.remove('start'));start=null;};
    $$('[data-cell]',body).forEach(cell=>cell.onclick=()=>{const id=cell.dataset.cell;if(!start){start=id;cell.classList.add('start');return;}const [r1,c1]=start.split('-').map(Number),[r2,c2]=id.split('-').map(Number),dr=Math.sign(r2-r1),dc=Math.sign(c2-c1),len=Math.max(Math.abs(r2-r1),Math.abs(c2-c1))+1;if(!((r1===r2)||(c1===c2)||(Math.abs(r2-r1)===Math.abs(c2-c1)))){clearStart();toast('Select a straight horizontal, vertical, or diagonal line.','warn');return;}const cells=[],letters=[];for(let k=0;k<len;k++){cells.push(`${r1+dr*k}-${c1+dc*k}`);letters.push(ws.grid[r1+dr*k][c1+dc*k]);}const s=letters.join(''),rev=[...letters].reverse().join(''),match=a.words.find(w=>!found.has(w)&&(w===s||w===rev));if(match){found.add(match);cells.forEach(cid=>$(`[data-cell="${cid}"]`,body).classList.add('found'));$(`[data-word="${match}"]`,body).classList.add('found');toast(`${match} found`);if(found.size===a.words.length){$('#activityFeedback').innerHTML=feedback(found.size,a.words.length);completeActivity(a,found.size,a.words.length);}}else toast('That line does not match a remaining word.','warn');clearStart();});
    $('#resetActivityBtn').onclick=()=>renderWordSearch(a,body);
  }
  function renderFill(a,body){
    let html=esc(a.sentence);a.answers.forEach((ans,i)=>{html=html.replace(`{${i}}`,`<input class="inline-blank" data-blank="${i}" aria-label="Blank ${i+1}">`);});body.innerHTML=`<div class="fill-sentence">${html}</div><div class="activity-actions"><button class="btn primary" id="checkActivityBtn">Check answer</button></div><div id="activityFeedback"></div>`;
    $('#checkActivityBtn').onclick=()=>{let score=0;a.answers.forEach((ans,i)=>{const inp=$(`[data-blank="${i}"]`,body);const ok=inp.value.trim().toLowerCase()===ans.toLowerCase();if(ok)score++;inp.classList.add(ok?'correct':'wrong');});$('#activityFeedback').innerHTML=feedback(score,a.answers.length);completeActivity(a,score,a.answers.length);};
  }
  function renderRisk(a,body){
    const saved=state.activityResults[a.id]?.data||{};body.innerHTML=`<form class="worksheet" id="riskForm"><label>Hazard observed<textarea name="hazard" required>${esc(saved.hazard||'')}</textarea></label><div class="form-grid"><label>Likelihood<select name="likelihood"><option>Low</option><option ${saved.likelihood==='Medium'?'selected':''}>Medium</option><option ${saved.likelihood==='High'?'selected':''}>High</option></select></label><label>Possible damage / severity<select name="severity"><option>Minor</option><option ${saved.severity==='Serious'?'selected':''}>Serious</option><option ${saved.severity==='Critical'?'selected':''}>Critical</option></select></label></div><label>Risk control<textarea name="control" required>${esc(saved.control||'')}</textarea></label><label>Responsible person<input name="person" value="${esc(saved.person||'')}"></label><div class="activity-actions"><button class="btn" type="button" id="printWorksheetBtn">Print worksheet</button><button class="btn primary" type="submit">Save assessment</button></div></form><div id="activityFeedback"></div>`;
    $('#riskForm').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));state.activityResults[a.id]={completed:true,score:'Completed',numeric:100,data,updated:new Date().toISOString()};saveState();updateActivityContinuation(a);toast('Risk assessment saved');$('#activityFeedback').innerHTML='<div class="feedback success"><b>Assessment saved</b><p>Your worksheet is stored in this browser.</p></div>';};$('#printWorksheetBtn').onclick=()=>window.print();
  }
  function renderQualityLog(a,body){
    const saved=state.activityResults[a.id]?.rows||[];body.innerHTML=`<div class="table-editor"><table><thead><tr><th>Date received</th><th>O.R. #</th><th>Item name</th><th>Quantity</th><th>Signature</th><th>Quality result</th><th></th></tr></thead><tbody id="qualityRows"></tbody></table></div><div class="activity-actions"><button class="btn" id="addQualityRowBtn">+ Add row</button><button class="btn" id="printWorksheetBtn">Print</button><button class="btn primary" id="saveQualityBtn">Save log</button></div>`;
    const rows=saved.length?saved:[{date:'',or:'',item:'',qty:'',signature:'',result:'GOOD'}];
    const draw=()=>{$('#qualityRows').innerHTML=rows.map((r,i)=>`<tr><td><input type="date" data-qfield="date" data-row="${i}" value="${esc(r.date)}"></td><td><input data-qfield="or" data-row="${i}" value="${esc(r.or)}"></td><td><input data-qfield="item" data-row="${i}" value="${esc(r.item)}"></td><td><input type="number" min="0" data-qfield="qty" data-row="${i}" value="${esc(r.qty)}"></td><td><input data-qfield="signature" data-row="${i}" value="${esc(r.signature)}"></td><td><select data-qfield="result" data-row="${i}"><option ${r.result==='GOOD'?'selected':''}>GOOD</option><option ${r.result==='WITH ERROR'?'selected':''}>WITH ERROR</option></select></td><td><button data-remove-row="${i}">×</button></td></tr>`).join('');$$('[data-qfield]',body).forEach(inp=>inp.oninput=()=>rows[Number(inp.dataset.row)][inp.dataset.qfield]=inp.value);$$('[data-remove-row]',body).forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.removeRow),1);draw();});};draw();$('#addQualityRowBtn').onclick=()=>{rows.push({date:'',or:'',item:'',qty:'',signature:'',result:'GOOD'});draw();};$('#saveQualityBtn').onclick=()=>{state.activityResults[a.id]={completed:true,score:'Completed',numeric:100,rows,updated:new Date().toISOString()};saveState();updateActivityContinuation(a);toast('Quality log saved');};$('#printWorksheetBtn').onclick=()=>window.print();
  }
  function renderInventory(a,body){
    const rows=state.activityResults[a.id]?.rows||[{item:'',spec:'',qty:'1',remarks:''}];body.innerHTML=`<div class="inventory-head"><label>Organization / School<input id="invOrg" value="${esc(state.activityResults[a.id]?.org||'')}"></label><label>Prepared by<input id="invBy" value="${esc(state.activityResults[a.id]?.by||state.name)}"></label><label>Date<input id="invDate" type="date" value="${esc(state.activityResults[a.id]?.date||new Date().toISOString().slice(0,10))}"></label></div><div class="table-editor"><table><thead><tr><th>Item</th><th>Description / Specification</th><th>Quantity</th><th>Remarks</th><th></th></tr></thead><tbody id="inventoryRows"></tbody></table></div><div class="activity-actions"><button class="btn" id="addInventoryRowBtn">+ Add item</button><button class="btn" id="exportInventoryBtn">Export CSV</button><button class="btn" id="printWorksheetBtn">Print</button><button class="btn primary" id="saveInventoryBtn">Save inventory</button></div>`;
    const draw=()=>{$('#inventoryRows').innerHTML=rows.map((r,i)=>`<tr><td><input data-ifield="item" data-row="${i}" value="${esc(r.item)}"></td><td><input data-ifield="spec" data-row="${i}" value="${esc(r.spec)}"></td><td><input type="number" min="0" data-ifield="qty" data-row="${i}" value="${esc(r.qty)}"></td><td><input data-ifield="remarks" data-row="${i}" value="${esc(r.remarks)}"></td><td><button data-remove-row="${i}">×</button></td></tr>`).join('');$$('[data-ifield]',body).forEach(inp=>inp.oninput=()=>rows[Number(inp.dataset.row)][inp.dataset.ifield]=inp.value);$$('[data-remove-row]',body).forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.removeRow),1);draw();});};draw();$('#addInventoryRowBtn').onclick=()=>{rows.push({item:'',spec:'',qty:'1',remarks:''});draw();};const save=()=>{state.activityResults[a.id]={completed:true,score:'Completed',numeric:100,rows,org:$('#invOrg').value,by:$('#invBy').value,date:$('#invDate').value,updated:new Date().toISOString()};saveState();updateActivityContinuation(a);};$('#saveInventoryBtn').onclick=()=>{save();toast('Inventory saved');};$('#printWorksheetBtn').onclick=()=>{save();window.print();};$('#exportInventoryBtn').onclick=()=>{save();const lines=[['Item','Description / Specification','Quantity','Remarks'],...rows.map(r=>[r.item,r.spec,r.qty,r.remarks])];const csv=lines.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');downloadBlob(csv,'computer-inventory.csv','text/csv');};
  }
  function renderActivityFlashcards(a,body){let i=0,flip=false;const draw=()=>{const c=a.cards[i];body.innerHTML=`<div class="activity-flash"><button class="flash-card ${flip?'flipped':''}" id="turnActivityCard"><div class="front"><span>Prompt</span><b>${esc(c[0])}</b><small>Tap to turn</small></div><div class="back"><span>Answer</span><b>${esc(c[1])}</b><small>Tap to turn back</small></div></button><div class="flash-controls"><button class="btn" id="prevActivityCard" ${i===0?'disabled':''}>← Previous</button><span>${i+1} of ${a.cards.length}</span><button class="btn" id="nextActivityCard" ${i===a.cards.length-1?'disabled':''}>Next →</button></div></div>`;$('#turnActivityCard').onclick=()=>{flip=!flip;draw();};$('#prevActivityCard').onclick=()=>{i--;flip=false;draw();};$('#nextActivityCard').onclick=()=>{i++;flip=false;if(i===a.cards.length-1)completeActivity(a,a.cards.length,a.cards.length);draw();};};draw();}
  function renderSpeech(a,body){body.innerHTML=`<div class="speech-card"><p>${esc(a.prompt)}</p><div class="speech-input"><input id="speechAnswer" placeholder="Type or speak your answer"><button class="btn" id="speakBtn">◉ Push to speak</button></div><div class="activity-actions"><button class="btn primary" id="checkSpeechBtn">Check answer</button></div><div id="activityFeedback"></div></div>`;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){$('#speakBtn').disabled=true;$('#speakBtn').textContent='Microphone recognition unavailable';}else{$('#speakBtn').onclick=()=>{const r=new SR();r.lang='en-US';r.interimResults=false;r.onresult=e=>{$('#speechAnswer').value=e.results[0][0].transcript;};r.onerror=()=>toast('Speech recognition could not capture an answer. Type it instead.','warn');r.start();};}$('#checkSpeechBtn').onclick=()=>{const v=$('#speechAnswer').value.trim().toLowerCase().replace(/[.!?]/g,'');const ok=a.answers.some(ans=>v.includes(ans));$('#activityFeedback').innerHTML=feedback(ok?1:0,1,ok?'Correct: the answer is stress testing.':'The expected answer is “stress testing.”');completeActivity(a,ok?1:0,1);};}

  function renderTopology(a,body){
    const saved=state.activityResults[a.id]?.data||{};
    let nodes=Array.isArray(saved.nodes)?saved.nodes.map(x=>({...x})):[];
    let links=Array.isArray(saved.links)?saved.links.map(x=>[...x]):[];
    let selected=null,connectMode=false,connectFrom=null,drag=null,nextId=nodes.reduce((m,n)=>Math.max(m,Number(String(n.id).replace(/\D/g,''))||0),0)+1;
    const labels={pc:'PC',server:'Server',router:'Router',switch:'Switch',ap:'Access Point',printer:'Printer'};
    const icons={pc:'▣',server:'▤',router:'◉',switch:'▦',ap:'⌁',printer:'▧'};
    body.innerHTML=`<div class="topology-toolbar"><div class="topology-add">${Object.keys(labels).map(t=>`<button class="btn small" data-add-node="${t}">${icons[t]} ${labels[t]}</button>`).join('')}</div><div><button class="btn small" id="connectTopologyBtn">Connect nodes</button><button class="btn small" id="deleteTopologyBtn">Delete selected</button><button class="btn small" id="clearTopologyBtn">Clear</button></div></div><div class="topology-help" id="topologyHelp">Add at least ten worker PCs and the network devices needed for your design. Drag nodes to arrange them.</div><div class="topology-stage"><svg id="topologyCanvas" class="topology-canvas" viewBox="0 0 900 520" role="img" aria-label="Interactive office network topology"><g id="topologyLinks"></g><g id="topologyNodes"></g></svg></div><div class="activity-actions"><button class="btn" id="exportTopologyBtn">Export SVG</button><button class="btn primary" id="saveTopologyBtn">Save topology</button></div><div id="activityFeedback"></div>`;
    const svg=$('#topologyCanvas',body),linkLayer=$('#topologyLinks',body),nodeLayer=$('#topologyNodes',body),help=$('#topologyHelp',body);
    const svgPoint=e=>{const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
    const draw=()=>{
      linkLayer.innerHTML=links.map(([a1,b1])=>{const n1=nodes.find(n=>n.id===a1),n2=nodes.find(n=>n.id===b1);return n1&&n2?`<line class="topology-link" x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}"></line>`:'';}).join('');
      nodeLayer.innerHTML=nodes.map(n=>`<g class="topology-node ${selected===n.id?'selected':''} ${connectFrom===n.id?'connect-from':''}" data-topology-node="${n.id}" transform="translate(${n.x} ${n.y})"><rect x="-58" y="-29" width="116" height="58" rx="12"></rect><text text-anchor="middle" dominant-baseline="middle">${icons[n.type]} ${esc(n.label)}</text></g>`).join('');
      $$('[data-topology-node]',nodeLayer).forEach(g=>{
        g.onpointerdown=e=>{e.preventDefault();const id=g.dataset.topologyNode;if(connectMode){if(!connectFrom){connectFrom=id;selected=id;help.textContent='Select the second node to create a connection.';}else if(connectFrom!==id){const exists=links.some(x=>(x[0]===connectFrom&&x[1]===id)||(x[0]===id&&x[1]===connectFrom));if(!exists)links.push([connectFrom,id]);connectFrom=null;selected=id;help.textContent='Connection added. Select another first node or turn off connection mode.';}draw();return;}selected=id;const n=nodes.find(x=>x.id===id),p=svgPoint(e);drag={id,dx:n.x-p.x,dy:n.y-p.y};g.setPointerCapture(e.pointerId);draw();};
        g.onpointermove=e=>{if(!drag||drag.id!==g.dataset.topologyNode)return;const p=svgPoint(e),n=nodes.find(x=>x.id===drag.id);n.x=Math.max(65,Math.min(835,p.x+drag.dx));n.y=Math.max(35,Math.min(485,p.y+drag.dy));draw();};
        g.onpointerup=()=>{drag=null;};
      });
    };
    $$('[data-add-node]',body).forEach(b=>b.onclick=()=>{const type=b.dataset.addNode;const count=nodes.filter(n=>n.type===type).length+1;nodes.push({id:`n${nextId++}`,type,label:`${labels[type]} ${count}`,x:110+(nodes.length%6)*135,y:85+Math.floor(nodes.length/6)*95});draw();});
    $('#connectTopologyBtn',body).onclick=()=>{connectMode=!connectMode;connectFrom=null;$('#connectTopologyBtn',body).classList.toggle('primary',connectMode);help.textContent=connectMode?'Connection mode: select two nodes.':'Drag nodes to arrange them. Select a node before deleting it.';draw();};
    $('#deleteTopologyBtn',body).onclick=()=>{if(!selected){toast('Select a node first.','warn');return;}nodes=nodes.filter(n=>n.id!==selected);links=links.filter(x=>!x.includes(selected));selected=null;connectFrom=null;draw();};
    $('#clearTopologyBtn',body).onclick=()=>{if(confirm('Clear the topology canvas?')){nodes=[];links=[];selected=null;connectFrom=null;draw();}};
    const save=()=>{const data={nodes,links};state.activityResults[a.id]={completed:true,score:`${nodes.length} nodes`,numeric:Math.min(100,Math.round(nodes.length/10*100)),data,updated:new Date().toISOString()};saveState();updateActivityContinuation(a);return data;};
    $('#saveTopologyBtn',body).onclick=()=>{save();const pcs=nodes.filter(n=>n.type==='pc').length;$('#activityFeedback',body).innerHTML=`<div class="feedback ${pcs>=10?'success':'review'}"><b>${nodes.length} nodes and ${links.length} links saved</b><p>${pcs>=10?'The design includes at least ten worker PCs.':'The source assignment asks you to imagine at least ten workers. Add more PCs if each worker needs a workstation.'}</p></div>`;toast('Topology saved');};
    $('#exportTopologyBtn',body).onclick=()=>{save();const exportSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 520" width="1200" height="693"><rect width="900" height="520" fill="#f7fafc"/><style>.l{stroke:#4f6f8f;stroke-width:3}.n{fill:#fff;stroke:#0d3b66;stroke-width:3}.t{font:700 15px Arial;fill:#17324d}</style>${links.map(([a1,b1])=>{const n1=nodes.find(n=>n.id===a1),n2=nodes.find(n=>n.id===b1);return n1&&n2?`<line class="l" x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}"/>`:'';}).join('')}${nodes.map(n=>`<g transform="translate(${n.x} ${n.y})"><rect class="n" x="-58" y="-29" width="116" height="58" rx="12"/><text class="t" text-anchor="middle" dominant-baseline="middle">${icons[n.type]} ${esc(n.label)}</text></g>`).join('')}</svg>`;downloadBlob(exportSvg,'office-network-topology.svg','image/svg+xml');};
    draw();
  }

  function downloadBlob(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}

  function renderFlashcards(){
    setPage('Flashcards','Review key terms from all five supplied modules.');
    const value=c=>({title:c.term??c.front??'',detail:c.definition??c.back??'',lessonId:c.lessonId,module:c.module});
    const pool=D.flashcards.map(value).filter(c=>(flashState.module==='all'||c.module===flashState.module)&&(!flashState.query||`${c.title} ${c.detail}`.toLowerCase().includes(flashState.query.toLowerCase())));
    if(flashState.index>=pool.length)flashState.index=0; const c=pool[flashState.index];
    const context=c?(lessonById(c.lessonId)?.title||moduleById(c.module)?.title||'CSS NC II Reviewer'):'';
    const code=c?(moduleById(c.module)?.code||'Reviewer'):'';
    $('#view-flashcards').innerHTML=`<section class="flash-header"><div><span class="eyebrow">Active recall</span><h2>Flashcard reviewer</h2><p>Tap the card to reveal its definition. The term title remains visible and every card shows its module context.</p></div><div class="flash-total"><b>${pool.length}</b><span>cards found</span></div></section><section class="filter-bar"><label>Module<select id="flashModule"><option value="all">All modules</option>${D.modules.map(m=>`<option value="${m.id}" ${flashState.module===m.id?'selected':''}>${m.code}</option>`).join('')}</select></label><label class="grow">Search<input id="flashSearch" value="${esc(flashState.query)}" placeholder="Search term or definition…"></label></section>${c?`<section class="flash-study"><div class="flash-context"><span>${esc(code)}</span><b>${esc(context)}</b></div><button class="study-card ${flashState.flipped?'flipped':''}" id="studyCard" aria-label="Flashcard: ${esc(c.title)}"><div class="front"><span class="card-label">Term</span><h2>${esc(c.title)}</h2><p>Tap to reveal the definition</p></div><div class="back"><span class="card-label">${esc(c.title)}</span><p>${esc(c.detail)}</p><small>${esc(context)}</small></div></button><div class="flash-controls"><button class="btn" id="flashPrev">← Previous</button><span><b>${flashState.index+1}</b> of ${pool.length}</span><button class="btn" id="flashNext">Next →</button></div></section>`:`<div class="empty-state"><b>No flashcards found</b><p>Change the module filter or search phrase.</p></div>`}`;
    $('#flashModule').onchange=e=>{flashState.module=e.target.value;flashState.index=0;flashState.flipped=false;renderFlashcards();};
    $('#flashSearch').oninput=e=>{flashState.query=e.target.value;flashState.index=0;flashState.flipped=false;renderFlashcards();};
    if(c){$('#studyCard').onclick=()=>{flashState.flipped=!flashState.flipped;renderFlashcards();};$('#flashPrev').onclick=()=>{flashState.index=(flashState.index-1+pool.length)%pool.length;flashState.flipped=false;renderFlashcards();};$('#flashNext').onclick=()=>{flashState.index=(flashState.index+1)%pool.length;flashState.flipped=false;renderFlashcards();};}
  }

  function renderAssessment(){
    setPage('Practice Test',`Create a randomized reviewer from ${D.questions.length} source-based questions.`);
    $('#view-assessment').innerHTML=`<section class="assessment-hero"><div><span class="eyebrow">Randomized assessment</span><h2>Build your practice test</h2><p>Select the scope, difficulty, and number of questions. Explanations are shown after submission.</p></div><div class="assessment-count"><b>${D.questions.length}</b><span>question bank</span></div></section><form class="quiz-setup panel" id="quizSetup"><div class="form-grid"><label>Scope<select name="scope" id="quizScope"><option value="all">All modules</option>${D.modules.map(m=>`<option value="${m.id}">${m.code}: ${esc(m.title)}</option>`).join('')}${D.lessons.map(l=>`<option value="lesson:${l.id}">${moduleById(l.module).code} — ${esc(l.title)}</option>`).join('')}</select></label><label>Difficulty<select name="difficulty"><option value="all">Mixed difficulty</option><option>Basic</option><option>Intermediate</option><option>Technical</option></select></label><label>Question count<select name="count"><option>10</option><option selected>20</option><option>30</option><option>40</option></select></label><label>Mode<select name="mode"><option value="study">Study mode (no timer)</option><option value="timed">Timed: one minute per question</option></select></label></div><button class="btn primary large" type="submit">Generate practice test</button></form><section class="panel"><div class="section-head compact"><div><span class="eyebrow">Recent results</span><h3>Quiz history</h3></div></div>${state.quizHistory.length?`<div class="history-list">${state.quizHistory.slice(0,8).map(h=>`<div><b>${h.percent}%</b><span>${esc(h.scopeLabel)} · ${h.score}/${h.total}</span><time>${new Date(h.date).toLocaleString('en-PH')}</time></div>`).join('')}</div>`:'<p class="muted">No practice tests completed yet.</p>'}</section>`;
    $('#quizSetup').onsubmit=e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));let pool=D.questions.filter(q=>fd.scope==='all'||q.module===fd.scope||fd.scope===`lesson:${q.lessonId}`);if(fd.difficulty!=='all')pool=pool.filter(q=>q.difficulty===fd.difficulty);const count=Math.min(Number(fd.count),pool.length);if(!count){toast('No questions match those filters.','warn');return;}activeQuiz={questions:shuffle(pool).slice(0,count).map(q=>({...q,shuffled:shuffle(q.options.map((text,index)=>({text,index})))})),answers:{},current:0,started:Date.now(),mode:fd.mode,remaining:fd.mode==='timed'?count*60:null,scope:fd.scope,scopeLabel:fd.scope==='all'?'All modules':fd.scope.startsWith('lesson:')?lessonById(fd.scope.slice(7)).title:moduleById(fd.scope).code,timer:null};navigate('quiz');};
  }
  function renderQuiz(){if(!activeQuiz)return navigate('assessment');setPage('Practice Test',`${activeQuiz.scopeLabel} • ${activeQuiz.questions.length} questions`);const q=activeQuiz.questions[activeQuiz.current];$('#view-quiz').innerHTML=`<section class="quiz-shell"><div class="quiz-top"><div><span>Question ${activeQuiz.current+1} of ${activeQuiz.questions.length}</span><div class="progress-track"><i style="width:${pct(activeQuiz.current+1,activeQuiz.questions.length)}%"></i></div></div>${activeQuiz.mode==='timed'?`<b id="quizTimer">${formatTimer(activeQuiz.remaining)}</b>`:''}</div><article class="quiz-question"><span class="difficulty">${esc(q.difficulty)}</span><h2>${esc(q.question)}</h2><div class="quiz-options">${q.shuffled.map((o,i)=>`<label class="${activeQuiz.answers[activeQuiz.current]===o.index?'selected':''}"><input type="radio" name="quizOption" value="${o.index}" ${activeQuiz.answers[activeQuiz.current]===o.index?'checked':''}><span><b>${String.fromCharCode(65+i)}</b>${esc(o.text)}</span></label>`).join('')}</div></article><div class="quiz-nav"><button class="btn" id="quizPrev" ${activeQuiz.current===0?'disabled':''}>← Previous</button><div class="question-dots">${activeQuiz.questions.map((_,i)=>`<button data-qdot="${i}" class="${i===activeQuiz.current?'active':''} ${activeQuiz.answers[i]!==undefined?'answered':''}">${i+1}</button>`).join('')}</div>${activeQuiz.current===activeQuiz.questions.length-1?'<button class="btn primary" id="submitQuiz">Submit test</button>':'<button class="btn primary" id="quizNext">Next →</button>'}</div></section>`;
    $$('input[name="quizOption"]').forEach(x=>x.onchange=()=>{activeQuiz.answers[activeQuiz.current]=Number(x.value);renderQuiz();});$('#quizPrev').onclick=()=>{activeQuiz.current--;renderQuiz();};$('#quizNext')?.addEventListener('click',()=>{activeQuiz.current++;renderQuiz();});$$('[data-qdot]').forEach(b=>b.onclick=()=>{activeQuiz.current=Number(b.dataset.qdot);renderQuiz();});$('#submitQuiz')?.addEventListener('click',submitQuiz);startTimer();
  }
  function formatTimer(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
  function startTimer(){if(activeQuiz?.timer)clearInterval(activeQuiz.timer);if(activeQuiz?.mode!=='timed')return;activeQuiz.timer=setInterval(()=>{activeQuiz.remaining--;const t=$('#quizTimer');if(t)t.textContent=formatTimer(activeQuiz.remaining);if(activeQuiz.remaining<=0){clearInterval(activeQuiz.timer);submitQuiz();}},1000);}
  function submitQuiz(){if(activeQuiz.timer)clearInterval(activeQuiz.timer);let score=0;const details=activeQuiz.questions.map((q,i)=>{const answer=activeQuiz.answers[i];const ok=answer===q.answer;if(ok)score++;return {...q,userAnswer:answer,correct:ok};});const percent=pct(score,details.length);lastResults={score,total:details.length,percent,details,scopeLabel:activeQuiz.scopeLabel,date:new Date().toISOString()};state.quizHistory.unshift({score,total:details.length,percent,scopeLabel:activeQuiz.scopeLabel,date:lastResults.date});state.quizHistory=state.quizHistory.slice(0,30);saveState();activeQuiz=null;navigate('results');}
  function renderResults(){if(!lastResults)return navigate('assessment');setPage('Test Results',`${lastResults.scopeLabel} • ${lastResults.percent}%`);$('#view-results').innerHTML=`<section class="result-hero"><div class="score-ring" style="--score:${lastResults.percent}"><b>${lastResults.percent}%</b><span>${lastResults.score}/${lastResults.total}</span></div><div><span class="eyebrow">Practice test complete</span><h2>${lastResults.percent>=80?'Strong result':'Keep reviewing'}</h2><p>${lastResults.percent>=80?'You demonstrated good command of this question set. Review explanations to reinforce the details.':'Use the explanations and source-page links to review missed concepts.'}</p><div><button class="btn primary" data-view-go="assessment">Take another test</button><button class="btn" id="printResultsBtn">Print results</button></div></div></section><section class="result-list">${lastResults.details.map((q,i)=>{const selected=q.userAnswer===undefined?'No answer':q.options[q.userAnswer];const l=lessonById(q.lessonId);return `<article class="result-item ${q.correct?'correct':'wrong'}"><div class="result-num">${i+1}</div><div><h3>${esc(q.question)}</h3><p><b>Your answer:</b> ${esc(selected)}</p>${!q.correct?`<p><b>Correct answer:</b> ${esc(q.options[q.answer])}</p>`:''}<div class="explanation"><b>Explanation</b><p>${esc(q.explanation)}</p></div>${l?`<button class="text-btn" data-open-lesson="${l.id}">Review ${esc(l.title)} →</button>`:''}</div></article>`;}).join('')}</section>`;$('#printResultsBtn').onclick=()=>window.print();}

  function renderGlossary(){setPage('Glossary',`${D.glossary.length} terms from the supplied module content.`);$('#view-glossary').innerHTML=`<section class="filter-bar"><label class="grow">Search<input id="glossarySearch" type="search" placeholder="Search terms or definitions…"></label><label>Module<select id="glossaryModule"><option value="all">All modules</option>${D.modules.map(m=>`<option value="${m.id}">${m.code}</option>`).join('')}</select></label></section><div id="glossaryList"></div>`;filterGlossary();}
  function filterGlossary(){const q=($('#glossarySearch')?.value||'').toLowerCase(),mid=$('#glossaryModule')?.value||'all';const list=D.glossary.filter(g=>{const l=lessonById(g.lessonId);return (!q||`${g.term} ${g.definition}`.toLowerCase().includes(q))&&(mid==='all'||!l||l.module===mid);}).sort((a,b)=>a.term.localeCompare(b.term));$('#glossaryList').innerHTML=`<div class="glossary-grid">${list.map(g=>`<article><b>${esc(g.term)}</b><p>${esc(g.definition)}</p>${g.lessonId?`<button class="text-btn" data-open-lesson="${g.lessonId}">Open lesson</button>`:''}</article>`).join('')}</div>`;}

  function renderSources(){setPage('Source Modules','Open the original PDFs or review every page inside the website.');const totalPages=D.lessons.reduce((n,l)=>n+l.pages,0);$('#view-sources').innerHTML=`<section class="source-intro"><div><span class="eyebrow">Supplied learning materials</span><h2>Learning pages are included</h2><p>The website uses page renders to preserve diagrams, photos, icons, tables, instructions, screenshots, and attribution text. The first personal printed cover page was removed from every PDF and page set. Privacy-safe PDFs are bundled for direct viewing.</p></div><div class="source-stat"><b>${totalPages}</b><span>learning pages</span></div></section>${D.modules.map(m=>`<section class="source-module"><div class="group-title"><div><span class="eyebrow">${m.code}</span><h3>${esc(m.title)}</h3></div><span>${m.lessonIds.reduce((n,id)=>n+lessonById(id).pages,0)} pages</span></div><div class="source-list">${m.lessonIds.map(id=>{const l=lessonById(id);return `<article><img src="${l.pagesData[0].image}" alt="Preview of ${esc(l.title)}" loading="lazy"><div><span>${esc(l.number)} · ${l.pages} pages</span><h4>${esc(l.title)}</h4><p>${esc(l.course)}</p><div><button class="btn small" data-open-lesson="${l.id}" data-tab="pages">Read in website</button><a class="btn small" href="${l.pdf}" target="_blank">Open PDF</a></div></div></article>`;}).join('')}</div></section>`).join('')}<section class="panel"><h3>Interactive export limitations handled transparently</h3><p>Several supplied PDFs reference H5P videos or slide presentations. Page renders retain the instructions, visible first frames, screenshots, carousel indicators, icons, and credits that were actually exported. When the hidden slide or video content was not present, the replacement exercise is marked <b>Supplemental practice</b> and does not claim to reproduce unavailable steps.</p></section>`;}

  function offlineStatusText(){
    if(offlineStatus.complete)return `All ${offlineStatus.total} website files are available offline${offlineStatus.failed?` (${offlineStatus.failed} files could not be cached)`:''}.`;
    if(offlineStatus.total)return `${offlineStatus.cached} of ${offlineStatus.total} website files cached for offline use.`;
    return 'Checking offline content…';
  }
  function updateOfflineStatusUi(){
    const el=$('#offlineStatusText');if(el)el.textContent=offlineStatusText();
    const bar=$('#offlineProgressBar');if(bar)bar.style.width=`${offlineStatus.total?pct(offlineStatus.cached,offlineStatus.total):0}%`;
    const btn=$('#downloadOfflineBtn');if(btn){btn.disabled=offlineStatus.complete;btn.textContent=offlineStatus.complete?'Offline content ready':'Download all content for offline use';}
  }
  function requestOfflineContent(){
    if(!('serviceWorker' in navigator)){toast('Offline installation is not supported by this browser.','warn');return;}
    navigator.serviceWorker.ready.then(reg=>{const worker=navigator.serviceWorker.controller||reg.active;if(worker){worker.postMessage({type:'CACHE_ALL'});toast('Offline download started. Keep the app open until it completes.');}}).catch(()=>toast('Service worker is not ready yet.','warn'));
  }
  function renderSettings(){
    setPage('Settings & Backup','Manage your learner name, persistent progress, and complete offline storage.');
    const storage=JSON.stringify(state).length;
    $('#view-settings').innerHTML=`<section class="settings-grid"><form class="panel" id="profileForm"><span class="eyebrow">Profile</span><h3>Learner settings</h3><label>Display name<input name="name" value="${esc(state.name)}" maxlength="60"></label><label>Appearance<select name="theme"><option value="light" ${state.theme==='light'?'selected':''}>Light</option><option value="dark" ${state.theme==='dark'?'selected':''}>Dark</option></select></label><button class="btn primary" type="submit">Save settings</button></form><section class="panel"><span class="eyebrow">Backup</span><h3>Export or restore progress</h3><p>Progress is saved in both local browser storage and an IndexedDB backup. Export JSON when transferring to another phone or browser.</p><div class="stack-actions"><button class="btn" id="exportProgressBtn">Export progress JSON</button><label class="btn file-btn">Import progress JSON<input type="file" id="importProgressInput" accept="application/json"></label></div></section><section class="panel"><span class="eyebrow">Local data</span><h3>Persistent learner records</h3><p>Stored progress size: ${(storage/1024).toFixed(1)} KB. Completed lessons, activity scores, checklists, and quiz history remain after the app is closed.</p><button class="btn danger" id="resetProgressBtn">Erase all progress</button></section><section class="panel"><span class="eyebrow">Offline access</span><h3>Complete offline reviewer</h3><p id="offlineStatusText">${esc(offlineStatusText())}</p><div class="progress-track"><i id="offlineProgressBar" style="width:${offlineStatus.total?pct(offlineStatus.cached,offlineStatus.total):0}%"></i></div><button class="btn" id="downloadOfflineBtn" ${offlineStatus.complete?'disabled':''}>${offlineStatus.complete?'Offline content ready':'Download all content for offline use'}</button><small>Open the website online once and keep it open while the lesson pages and PDFs are downloaded. After completion, the installed app can reopen without internet.</small></section></section>`;
    $('#profileForm').onsubmit=e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));state.name=fd.name.trim()||'Learner';state.theme=fd.theme;saveState();toast('Settings saved');renderSettings();};
    $('#exportProgressBtn').onclick=()=>downloadBlob(JSON.stringify({app:'TESDA CSS NC II Complete Reviewer',version:D.version,exported:new Date().toISOString(),state},null,2),'css-ncii-reviewer-progress.json','application/json');
    $('#importProgressInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const obj=JSON.parse(r.result);state=normalizeState(obj.state||obj);saveState();currentLessonId=state.lastLesson;currentPage=state.lastPage[currentLessonId]||1;toast('Progress restored');renderSettings();}catch{toast('The selected JSON file is invalid.','error');}};r.readAsText(f);};
    $('#resetProgressBtn').onclick=()=>{if(confirm('Erase all lesson, activity, checklist, and test progress?')){state=normalizeState();saveState();toast('All progress erased');renderSettings();}};
    $('#downloadOfflineBtn').onclick=requestOfflineContent;
    updateOfflineStatusUi();
  }


  function renderAbout(){
    setPage('About','Credits and information about the website creators.');
    $('#view-about').innerHTML=`
      <section class="about-page">
        <section class="about-hero-card panel about-hero-compact">
          <div class="about-hero-copy">
            <span class="eyebrow">Created and Developed by</span>
            <h2>Reyan Bracino</h2>
            <p class="about-lead">System Analyst and System Developer</p>

            <div class="about-person-divider" aria-hidden="true"></div>

            <h2 class="about-trainer-name">Advent Grace Montesa-Bracino</h2>
            <p class="about-lead about-trainer-role">Trainer - CSS NCII</p>
          </div>
          <div class="about-logo-card">
            <img src="./assets/branding/softdev-logo.jpg" alt="SoftDev Systems logo" class="about-logo-img">
            <div class="about-logo-meta">
              <b>Powered by SoftDev Systems</b>
            </div>
          </div>
        </section>
      </section>`;
  }

  function globalSearch(){const q=$('#globalSearch').value.trim().toLowerCase();if(q.length<2){$('#searchResults').innerHTML='<p class="muted">Enter at least two characters.</p>';return;}const results=[];D.lessons.forEach(l=>{if(`${l.title} ${l.summary} ${l.topics.join(' ')}`.toLowerCase().includes(q))results.push({kind:'Lesson',title:l.title,sub:l.summary,lessonId:l.id});l.pagesData.forEach(p=>{const idx=p.text.toLowerCase().indexOf(q);if(idx>=0&&results.length<30)results.push({kind:`Source page ${p.n}`,title:l.title,sub:p.text.slice(Math.max(0,idx-80),idx+180).replace(/\s+/g,' '),lessonId:l.id,page:p.n});});});D.activities.forEach(a=>{if(`${a.title} ${a.instruction}`.toLowerCase().includes(q))results.push({kind:'Activity',title:a.title,sub:lessonById(a.lessonId).title,activityId:a.id});});D.glossary.forEach(g=>{if(`${g.term} ${g.definition}`.toLowerCase().includes(q))results.push({kind:'Glossary',title:g.term,sub:g.definition,lessonId:g.lessonId});});$('#searchResults').innerHTML=results.length?results.slice(0,40).map(r=>`<button class="search-result" ${r.activityId?`data-open-activity="${r.activityId}"`:`data-open-lesson="${r.lessonId}" data-tab="${r.page?'pages':'overview'}" ${r.page?`data-page="${r.page}"`:''}`}><span>${esc(r.kind)}</span><b>${esc(r.title)}</b><p>${esc(r.sub)}</p></button>`).join(''):'<div class="empty-state"><b>No results found</b></div>';}

  document.addEventListener('click',e=>{
    const view=e.target.closest('[data-view-go]');if(view){navigate(view.dataset.viewGo);return;}
    const nav=e.target.closest('.nav-item[data-view]');if(nav){navigate(nav.dataset.view);return;}
    const lesson=e.target.closest('[data-open-lesson]');if(lesson){openLesson(lesson.dataset.openLesson,lesson.dataset.tab||'overview',Number(lesson.dataset.page)||null);$('#searchDialog').open&&$('#searchDialog').close();return;}
    const act=e.target.closest('[data-open-activity]');if(act){openActivity(act.dataset.openActivity);$('#searchDialog').open&&$('#searchDialog').close();return;}
    const tab=e.target.closest('[data-lesson-tab]');if(tab){storeCurrentScroll();currentLessonTab=tab.dataset.lessonTab;renderLessonTab();pushCurrentRoute();return;}
    const tabgo=e.target.closest('[data-lesson-tab-go]');if(tabgo){storeCurrentScroll();currentLessonTab=tabgo.dataset.lessonTabGo;renderLessonTab();pushCurrentRoute();return;}
    const thumb=e.target.closest('[data-page]');if(thumb&&thumb.classList.contains('thumb')){storeCurrentScroll();currentPage=Number(thumb.dataset.page);renderPageViewer();pushCurrentRoute();return;}
    const close=e.target.closest('[data-close-dialog]');if(close){$(`#${close.dataset.closeDialog}`).close();return;}
  });
  $('#menuBtn').onclick=()=>{$('#sidebar').classList.add('open');$('#sidebarBackdrop').classList.add('show');};
  const sidebarClose=$('#sidebarClose');
  if(sidebarClose)sidebarClose.onclick=closeSidebar;
  const sidebarBackdrop=$('#sidebarBackdrop');
  if(sidebarBackdrop){
    sidebarBackdrop.onclick=closeSidebar;
    sidebarBackdrop.addEventListener('pointerdown',event=>{if(event.target===sidebarBackdrop)closeSidebar();});
  }
  document.addEventListener('pointerdown',e=>{
    const sidebar=$('#sidebar');
    if(!sidebar?.classList.contains('open'))return;
    if(sidebar.contains(e.target)||e.target.closest('#menuBtn'))return;
    closeSidebar();
  });
  $('#themeBtn').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';saveState();};$('#profileBtn').onclick=()=>navigate('settings');
  $('#searchBtn').onclick=()=>{$('#searchDialog').showModal();setTimeout(()=>$('#globalSearch').focus(),50);};$('#globalSearch').oninput=globalSearch;
  $('#zoomInBtn').onclick=()=>{zoomLevel=Math.min(3,zoomLevel+.2);applyZoom();};$('#zoomOutBtn').onclick=()=>{zoomLevel=Math.max(.5,zoomLevel-.2);applyZoom();};$('#zoomResetBtn').onclick=()=>{zoomLevel=1;applyZoom();};
  document.addEventListener('change',e=>{if(e.target.id==='pageSelect'){storeCurrentScroll();currentPage=Number(e.target.value);renderPageViewer();pushCurrentRoute();}if(e.target.matches('[data-lesson-check]')){const key=`lesson-${currentLessonId}`,vals=state.checklists[key]||[],i=Number(e.target.dataset.lessonCheck);state.checklists[key]=e.target.checked?[...new Set([...vals,i])]:vals.filter(x=>x!==i);saveState();renderLessonTab();}if(['activityModuleFilter','activityTypeFilter'].includes(e.target.id))filterActivities();if(e.target.id==='glossaryModule')filterGlossary();});
  document.addEventListener('input',e=>{if(e.target.id==='activitySearch')filterActivities();if(e.target.id==='glossarySearch')filterGlossary();});
  document.addEventListener('click',e=>{if(e.target.id==='prevPageBtn'){storeCurrentScroll();currentPage--;renderPageViewer();pushCurrentRoute();}if(e.target.id==='nextPageBtn'){storeCurrentScroll();currentPage++;renderPageViewer();pushCurrentRoute();}if(e.target.id==='expandPageBtn'||e.target.closest('#expandPageBtn'))openImageDialog();if(e.target.id==='completeLessonBtn'){const idx=state.completedLessons.indexOf(currentLessonId);if(idx>=0)state.completedLessons.splice(idx,1);else state.completedLessons.push(currentLessonId);saveState();renderLesson();}if(e.target.id==='printLessonBtn')window.print();});

  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar();if(currentLessonTab==='pages'&&$('#view-lesson').classList.contains('active')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){if(e.key==='ArrowLeft'&&currentPage>1){storeCurrentScroll();currentPage--;renderPageViewer();pushCurrentRoute();}if(e.key==='ArrowRight'&&currentPage<lessonById(currentLessonId).pages){storeCurrentScroll();currentPage++;renderPageViewer();pushCurrentRoute();}}});
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  window.addEventListener('scroll',scheduleCurrentScrollSave,{passive:true});
  window.addEventListener('popstate',event=>{
    clearTimeout(scrollSaveTimer);
    const route=event.state?.appRoute?event.state:parseRoute();
    applyRoute(route);
  });
  function saveSessionAndFlush(){storeCurrentScroll();flushState();}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveSessionAndFlush();});
  window.addEventListener('pagehide',saveSessionAndFlush);
  window.addEventListener('beforeunload',saveSessionAndFlush);

  function registerOfflineWorker(){
    if(!('serviceWorker' in navigator))return;
    navigator.serviceWorker.addEventListener('message',event=>{
      const msg=event.data||{};
      if(msg.type==='OFFLINE_STATUS'||msg.type==='OFFLINE_PROGRESS'||msg.type==='OFFLINE_COMPLETE'){
        offlineStatus={cached:Number(msg.cached)||0,total:Number(msg.total)||0,complete:Boolean(msg.complete||msg.type==='OFFLINE_COMPLETE'),failed:Number(msg.failed)||0};
        updateOfflineStatusUi();
        if(msg.type==='OFFLINE_COMPLETE')toast(msg.failed?'Offline download completed with some missing files.':'Complete reviewer is ready for offline use.',msg.failed?'warn':'success');
      }
    });
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').then(()=>navigator.serviceWorker.ready).then(reg=>{
      const worker=navigator.serviceWorker.controller||reg.active;
      if(worker){worker.postMessage({type:'GET_OFFLINE_STATUS'});worker.postMessage({type:'CACHE_ALL'});}
    }).catch(()=>{}));
  }
  async function requestPersistentStorage(){
    try{if(navigator.storage?.persist)await navigator.storage.persist();}catch{}
  }
  async function bootstrap(){
    await restoreDatabaseState();
    currentLessonId=lessonById(state.lastLesson)?state.lastLesson:D.lessons[0].id;
    currentPage=state.lastPage[currentLessonId]||1;
    updateChrome();
    const parsed=parseRoute();
    const hasExplicitHash=Boolean(location.hash&&location.hash!=='#/'&&location.hash!=='#/dashboard');
    const initial=history.state?.appRoute?history.state:(!hasExplicitHash&&state.lastRoute?.appRoute?state.lastRoute:parsed);
    historyReady=true;
    applyRoute(initial);
    const initialScroll=routeScroll(initial);
    const normalizedInitial={...currentRoute(),scrollY:initialScroll};
    history.replaceState(normalizedInitial,'',routeHash(normalizedInitial));
    persistRouteSnapshot(normalizedInitial);
    registerOfflineWorker();
    requestPersistentStorage();
  }
  bootstrap();
})();
