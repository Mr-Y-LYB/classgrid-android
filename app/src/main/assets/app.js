(function(){
  'use strict';
  const M=window.CGModel,I=window.CGImport;
  const $=s=>document.querySelector(s);
  const native=window.Native||null;
  const days=['一','二','三','四','五','六','日'];
  const icons={
    home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    add:'<path d="M12 4v16M4 12h16"/>',
    import:'<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>',
    settings:'<path d="M4 7h8m4 0h4M4 17h4m4 0h8"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'
  };
  const navIcon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
  const panelIcons={
    timetable:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m-3 3h3m4-3h2"/>',
    alarm:'<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M4 3 2 6m16-3 2 3M7 20l-2 2m12-2 2 2"/>',
    data:'<path d="M4 8h16v12H4zM7 4h10v4m-7 5 2 2 2-2"/>',
    app:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 10v6m0-9v.5"/>',
    school:'<path d="M3 10 12 4l9 6v10H3V10Zm3 3h12m-9 0v7m6-7v7"/>',
    file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6m-6 4h6"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18m0-18c5 4 5 14 0 18"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    update:'<path d="M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 13-2l2 5M4 12l2 5a8 8 0 0 0 13-2"/>',
    message:'<path d="M4 5h16v12H8l-4 3zM8 10h8m-8 3h5"/>'
  };
  const panelIcon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${panelIcons[name]}</svg>`;
  const themeIcon=dark=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${dark?'<path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z"/>':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'}</svg>`;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const appVersion=native&&typeof native.appVersion==='function'?native.appVersion():'2.1.0';
  const androidVersion=native&&typeof native.androidVersion==='function'?native.androidVersion():'';
  let state,week=1,eventsById=new Map(),markersById=new Map(),selectedEvent=null,selectedMarker=null,pendingImport=null,pendingUpdate=null,reminderStatus={notifications:false,exact:false,scheduled:0,nextAt:0,error:''};
  try{state=M.validateState(JSON.parse(native?native.loadState():localStorage.getItem('classgrid-state')||'null'));}
  catch(e){state=M.defaultState();}
  let table=M.activeTable(state);week=Math.max(1,Math.min(table.totalWeeks,M.weekOf(table,M.todayDate())));

  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800);}
  function releaseItems(notes){
    const clean=line=>line.replace(/^[-*•]\s*/, '').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
      .replace(/[`*_]/g,'').trim();
    const lines=String(notes||'').split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!/^#{1,6}\s/.test(x)&&!/^APK SHA-?256/i.test(x)&&x!=='更新说明');
    const bullets=lines.filter(x=>/^[-*•]\s/.test(x)).map(clean);
    const items=bullets.length?bullets:lines.flatMap(x=>clean(x).split(/[；;]/).map(y=>y.trim()).filter(Boolean));
    return (items.length?items:['新版本已发布']).slice(0,6).map(x=>x.slice(0,140));
  }
  function changelogHtml(){
    const entries=String(window.CG_CHANGELOG||'').split(/^##\s+/m).slice(1).map(section=>{
      const lines=section.split(/\r?\n/),head=lines.shift().trim();
      const match=/^v(\d+\.\d+\.\d+)\s*·\s*(\d{4}-\d{2}-\d{2})$/.exec(head);
      return match?{version:match[1],date:match[2],items:lines.map(x=>x.trim()).filter(x=>x.startsWith('- ')).map(x=>x.slice(2))}:null;
    }).filter(Boolean);
    return entries.length?entries.map(entry=>`<section class="changelog-entry"><div class="listrow"><div><strong>v${esc(entry.version)}</strong><small>${esc(entry.date)}</small></div></div><ul class="update-list">${entry.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></section>`).join(''):
      '<p class="muted">更新说明暂不可用</p>';
  }
  function applyTheme(){
    const dark=state.settings.theme==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
    const meta=$('meta[name="theme-color"]');if(meta)meta.content=dark?'#101c29':'#f7f9fb';
    const switcher=$('#theme-switch');if(switcher){switcher.innerHTML=themeIcon(dark);switcher.setAttribute('aria-label',dark?'切换到白天模式':'切换到夜间模式');switcher.title=dark?'白天模式':'夜间模式';}
    if(native?.setTheme)native.setTheme(dark);
  }
  function save(syncReminders=true){
    try{
      M.validateState(state);const json=JSON.stringify(state);
      if(native){if(!native.saveState(json))throw Error('保存失败');if(syncReminders)native.syncReminders(JSON.stringify(M.reminderPayload(state)));}
      else localStorage.setItem('classgrid-state',json);
      return true;
    }catch(e){toast('保存失败：'+e.message);return false;}
  }
  function dateLabel(date){const d=new Date(date+'T12:00:00');return `${d.getMonth()+1}/${d.getDate()}`;}
  function currentWeek(){table=M.activeTable(state);return Math.max(1,Math.min(table.totalWeeks,M.weekOf(table,M.todayDate())));}
  function render(){
    table=M.activeTable(state);if(!table){state=M.defaultState();table=M.activeTable(state);save();}
    week=Math.max(1,Math.min(table.totalWeeks,week));
    const today=M.todayDate();
    const dates=days.map((_,i)=>M.dateFor(table,week,i+1));
    const occurrences=M.occurrences(table,week),markers=M.changeMarkers(table,week),conflicts=M.conflicts(occurrences);
    eventsById=new Map(occurrences.map(x=>[x.id,x]));
    markersById=new Map(markers.map(x=>[x.id,x]));
    $('#app').innerHTML=`<main class="shell">
      <div class="top"><div class="brand"><img class="brandmark" src="icon-a.svg" alt="" aria-hidden="true"><span class="brandtitle">ClassGrid</span></div>
        <button class="manage-btn" data-action="manage">切换／新建</button></div>
      <div class="toolbar"><strong class="table-name" title="${esc(table.name)}">${esc(table.name)}</strong>
        <div class="weeknav"><button class="iconbtn" data-action="prev" aria-label="上一周">‹</button>
          <button class="weekpill" data-action="week">第 ${week} 周</button>
          <button class="iconbtn" data-action="next" aria-label="下一周">›</button>
          <button class="todaybtn" data-action="today">本周</button></div></div>
      <div class="weekday-row"><button id="theme-switch" class="theme-switch" data-action="theme" aria-label="切换主题">${themeIcon(state.settings.theme==='dark')}</button>${days.map((d,i)=>`<div class="day ${dates[i]===today?'today':''}"><b>周${d}</b><span>${dateLabel(dates[i])}</span></div>`).join('')}</div>
      <div class="grid-scroll"><div class="timetable" id="timetable"><img class="timetable-background" id="table-background" alt="" hidden><div class="timetable-background-veil" id="table-background-veil" hidden></div>${table.periods.map((p,n)=>
        `<div class="period-label" style="height:72px;grid-row:${n+1};grid-column:1"><b>${n+1}</b><small>${esc(p.start)}</small><small class="period-end">${esc(p.end)}</small></div>`+
        days.map((_,i)=>`<div class="slot ${dates[i]===today?'todaycol':''}" style="height:72px;grid-row:${n+1};grid-column:${i+2}"></div>`).join('')).join('')}
        ${occurrences.length||markers.length?'':`<div class="empty-tip">本周暂无课程</div>`}</div></div>
      <nav class="bottom" aria-label="主导航"><button class="navbtn selected" data-action="home" aria-current="page">${navIcon('home')}<span>课表</span></button>
        <button class="navbtn action-add" data-action="add">${navIcon('add')}<span>添加课程</span></button>
        <button class="navbtn action-import" data-action="import">${navIcon('import')}<span>导入课表</span></button>
        <button class="navbtn" data-action="settings">${navIcon('settings')}<span>设置</span></button></nav>
      </main>`;
    positionCards(occurrences,markers,conflicts);
    let touch=null;const scroller=$('.grid-scroll');
    applyBackground(table);
    applyTheme();
    scroller.addEventListener('touchstart',e=>{touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
    scroller.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;
      if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.35){week+=dx<0?1:-1;render();}touch=null;},{passive:true});
  }
  function applyBackground(t,fade=Number(t.backgroundFade??35)){
    const scroll=$('.grid-scroll'),image=$('#table-background'),veil=$('#table-background-veil');
    if(!scroll||!image||!veil)return;
    const active=!!t.background;
    scroll.classList.toggle('has-background',active);
    image.hidden=veil.hidden=!active;
    if(active){if(image.src!==t.background)image.src=t.background;veil.style.backgroundColor=state.settings.theme==='dark'?`rgba(9,18,28,${Math.min(.65,fade/100+.18)})`:`rgba(255,255,255,${fade/100})`;}
    else image.removeAttribute('src');
  }
  function applyBackgroundPreview(t,fade=Number(t.backgroundFade??35)){
    const preview=$('#background-preview'),image=$('#background-preview-image'),veil=$('#background-preview-veil');
    if(!preview||!image||!veil)return;
    const active=!!t.background;
    preview.classList.toggle('has-background',active);
    image.hidden=veil.hidden=!active;
    if(active){if(image.src!==t.background)image.src=t.background;veil.style.backgroundColor=`rgba(255,255,255,${fade/100})`;}
    else image.removeAttribute('src');
  }
  function positionCards(events,markers,conflicts){
    const grid=$('#timetable');if(!grid)return;
    const entries=[...events,...markers];
    for(const entry of entries){
      const overlapping=entries.filter(x=>x.day===entry.day&&x.start<=entry.end&&entry.start<=x.end);
      const count=overlapping.length,index=overlapping.findIndex(x=>x.id===entry.id);
      const marker=!!entry.exceptionId;
      const button=document.createElement('button');button.className='course-card'+(marker?' change-marker':'')+(conflicts.has(entry.id)?' conflict':'')+(entry.moved?' moved':'');
      if(!marker){button.style.background=entry.color;button.style.color='#fff';}
      else button.style.setProperty('--course-color',entry.color);
      button.style.top=((entry.start-1)*72+3)+'px';
      button.style.height=((entry.end-entry.start+1)*72-6)+'px';
      // Use the grid width in CSS so cards stay inside their day column during a viewport change.
      const start=(entry.day-1+index/count)/7;
      const span=1/(7*count);
      button.style.left=`calc(${start*100}% + ${43-48*start}px)`;
      button.style.width=`calc(${span*100}% - ${48*span+4}px)`;
      button.dataset.day=String(entry.day);
      button.dataset.action=marker?'marker':'detail';button.dataset.id=entry.id;
      const session=marker||entry.moved?null:table.courses.find(c=>c.id===entry.courseId)?.sessions.find(s=>s.id===entry.sessionId);
      const pattern=session?M.weekPattern(session.weeks).mode:'custom';
      const badge=pattern==='odd'?'单周':pattern==='even'?'双周':'';
      button.setAttribute('aria-label',marker?`${entry.name}，${entry.type==='cancel'?'本次停课':`已调至${entry.targetDate}第${entry.targetStart}至${entry.targetEnd}节`}`:
        `${entry.name}${badge?'，'+badge:''}`);
      button.innerHTML=marker?`<strong>${esc(entry.name)}</strong><span>${entry.type==='cancel'?'本次停课':`已调至<br>${esc(dateLabel(entry.targetDate))} ${entry.targetStart}-${entry.targetEnd}节`}</span>`:
        `<strong>${esc(entry.name)}</strong><span class="course-room">${esc(entry.room)}</span>${badge?`<em class="week-badge">${badge}</em>`:''}`;
      grid.appendChild(button);
      fitCardText(button,marker);
    }
  }
  function fitCardText(card,marker){
    const title=card.querySelector('strong'),secondary=card.querySelector('.course-room')||card.querySelector('span');
    const style=getComputedStyle(card);
    const available=card.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-(card.querySelector('.week-badge')?19:0);
    const fits=()=>title.offsetHeight+secondary.offsetHeight+(secondary.textContent?2:0)<=available;
    for(const size of [13,12,11,10,9]){
      title.style.fontSize=size+'px';secondary.style.fontSize=Math.max(8,size-3)+'px';
      if(fits())return;
    }
    if(!marker)secondary.hidden=true;
    const titleSpace=Math.max(18,available-(secondary.hidden?0:secondary.offsetHeight+2));
    if(title.offsetHeight>titleSpace){
      title.style.maxHeight=titleSpace+'px';title.style.overflowY='auto';title.style.touchAction='pan-y';
    }
  }
  function modal(title,body,actions=''){
    $('#toast').classList.remove('show');
    document.body.classList.add('dialog-open');
    $('#modal-root').innerHTML=`<div class="overlay" data-action="close-overlay"><section class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head"><span class="sheet-handle" aria-hidden="true"></span><h2>${esc(title)}</h2><button class="iconbtn sheet-close" data-action="close" aria-label="关闭"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <div class="sheet-body">${body}</div>${actions?`<div class="sheet-actions">${actions}</div>`:''}</section></div>`;
    const head=$('.sheet-head'),sheet=$('.sheet');let drag=null;
    head.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;drag={y:e.clientY,delta:0};head.setPointerCapture(e.pointerId);});
    head.addEventListener('pointermove',e=>{if(!drag)return;drag.delta=Math.max(0,e.clientY-drag.y);sheet.style.animation='none';sheet.style.transform=`translateY(${drag.delta}px)`;});
    const endDrag=()=>{if(!drag)return;const dismiss=drag.delta>65;drag=null;
      if(dismiss){sheet.style.setProperty('--dismiss-start',sheet.style.transform);sheet.style.animation='';close();}
      else {sheet.style.transition='transform .18s ease-out';sheet.style.transform='';setTimeout(()=>{sheet.style.transition='';},190);}};
    head.addEventListener('pointerup',endDrag);head.addEventListener('pointercancel',endDrag);
  }
  function close(){
    const root=$('#modal-root'),overlay=root.firstElementChild;
    if(!overlay||overlay.classList.contains('closing'))return;
    const sheet=overlay.querySelector('.sheet');sheet.style.animation='';
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    overlay.classList.add('closing');
    setTimeout(()=>{if(root.firstElementChild===overlay){root.innerHTML='';document.body.classList.remove('dialog-open');}},matchMedia('(prefers-reduced-motion: reduce)').matches?0:200);
  }
  function field(label,input){return `<div class="field"><label>${label}</label>${input}</div>`;}
  function openWeek(){modal('选择周次',field('周次',`<input id="week-input" type="number" min="1" max="${table.totalWeeks}" value="${week}">`),
    '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="set-week">确定</button>');}
  function openManage(){
    modal('课表',`<div>${state.tables.map(t=>`<div class="listrow"><div><strong>${esc(t.name)}</strong><small>${esc(t.startDate)} · ${t.totalWeeks} 周 · ${t.courses.length} 门课</small></div>
      <div class="row">${t.id===state.activeId?'<span class="current-chip">当前</span>':`<button class="button small" data-action="switch-table" data-id="${esc(t.id)}">打开</button>`}${state.tables.length>1?`<button class="button small danger" data-action="delete-table" data-id="${esc(t.id)}">删除</button>`:''}</div></div>`).join('')}</div>
      <div class="section-title">当前课表背景</div><div class="background-preview" id="background-preview"><img id="background-preview-image" alt="" hidden><div id="background-preview-veil" hidden></div><span>${table.background?'':'尚未设置'}</span></div>
      <div class="row background-actions"><button class="button fill" data-action="pick-background">选择 JPG</button>
      <button class="button fill" data-action="clear-background" ${table.background?'':'disabled'}>移除背景</button></div>
      ${table.background?`<label class="fade-label" for="background-fade">背景淡化 <output id="background-fade-value">${table.backgroundFade??35}%</output></label>
      <input id="background-fade" type="range" min="0" max="85" value="${table.backgroundFade??35}">`:''}
      <div class="section-title">新建课表</div>${field('名称','<input id="new-table-name" placeholder="例如 2026 秋季学期" maxlength="50">')}`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="new-table">新建</button>');
    applyBackgroundPreview(table);
  }
  function sessionMarkup(s={},index=0,fallbackRoom=''){
    const pattern=s.weeks?M.weekPattern(s.weeks):{mode:'all',start:1,end:table.totalWeeks};
    const custom=pattern.mode==='custom';
    return `<div class="session" data-id="${esc(s.id||'')}"><div class="session-head"><span>上课时段 ${index+1}</span><button class="button small" type="button" data-action="remove-session">移除</button></div>
    <div class="row"><div class="field"><label>星期</label><select class="s-day">${days.map((d,i)=>`<option value="${i+1}" ${Number(s.day||1)===i+1?'selected':''}>周${d}</option>`).join('')}</select></div>
    <div class="field"><label>开始节</label><input class="s-start" type="number" min="1" max="${table.periods.length}" value="${s.start||1}"></div>
    <div class="field"><label>结束节</label><input class="s-end" type="number" min="1" max="${table.periods.length}" value="${s.end||Math.min(2,table.periods.length)}"></div></div>
    <div class="row">${field('周次',`<select class="s-week-mode" aria-label="周次类型">
      <option value="all" ${pattern.mode==='all'?'selected':''}>全部周数</option><option value="odd" ${pattern.mode==='odd'?'selected':''}>单周</option>
      <option value="even" ${pattern.mode==='even'?'selected':''}>双周</option><option value="custom" ${custom?'selected':''}>自选周次</option></select>`)}
    ${field('教室',`<input class="s-room" maxlength="100" placeholder="例如 A101" value="${esc(s.room??fallbackRoom)}">`)}</div>
    <div class="row s-week-range" ${custom?'hidden':''}>${field('从第几周',`<input class="s-week-start" type="number" min="1" max="${table.totalWeeks}" value="${pattern.start}">`)}
    ${field('到第几周',`<input class="s-week-end" type="number" min="1" max="${table.totalWeeks}" value="${pattern.end}">`)}</div>
    <div class="s-week-custom" ${custom?'':'hidden'}>${field('自选周次',`<input class="s-weeks" placeholder="例如 1,3,6-8" value="${esc(s.weeks?M.weeksLabel(s.weeks):`1-${table.totalWeeks}`)}">`)}</div></div>`;}
  function hexToHsv(hex){
    const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    let h=0;if(d){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h=(h*60+360)%360;}
    return {h,s:max?d/max:0,v:max};
  }
  function hsvToHex({h,s,v}){
    const chroma=v*s,x=chroma*(1-Math.abs((h/60)%2-1)),m=v-chroma;
    const rgb=h<60?[chroma,x,0]:h<120?[x,chroma,0]:h<180?[0,chroma,x]:h<240?[0,x,chroma]:h<300?[x,0,chroma]:[chroma,0,x];
    return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  let pickerHsv={h:180,s:.6,v:.6};
  function updatePicker(syncHex=true){
    const field=$('#color-field');if(!field)return;
    const hex=hsvToHex(pickerHsv);
    field.style.setProperty('--picker-hue',`hsl(${Math.round(pickerHsv.h)} 100% 50%)`);
    $('#color-point').style.left=`${pickerHsv.s*100}%`;$('#color-point').style.top=`${(1-pickerHsv.v)*100}%`;
    $('#color-preview').style.background=hex;$('#color-preview').style.color='#fff';
    $('#color-hue').value=Math.round(pickerHsv.h);
    if(syncHex)$('#color-hex').value=hex;
  }
  function setCourseColor(hex){
    if(!/^#[0-9a-f]{6}$/i.test(hex))return;
    const choice=$('#color-choice');choice.dataset.color=hex.toUpperCase();
    $('#current-color').style.background=hex;
    choice.setAttribute('aria-label',`选择课程颜色，当前 ${hex.toUpperCase()}`);
  }
  let editorScrollTop=0,editorActions='';
  function closeColorPicker(){
    $('#color-picker').hidden=true;$('#course-form').hidden=false;
    $('.sheet-head h2').textContent=$('#course-form').dataset.id?'编辑课程':'添加课程';
    const back=$('.sheet-head .iconbtn');back.textContent='×';back.dataset.action='close';
    $('.sheet-actions').innerHTML=editorActions;
    $('.sheet-body').scrollTop=editorScrollTop;
  }
  function openColorPicker(){
    pickerHsv=hexToHsv($('#color-choice').dataset.color);
    editorScrollTop=$('.sheet-body').scrollTop;
    editorActions=$('.sheet-actions').innerHTML;
    $('#course-form').hidden=true;$('#color-picker').hidden=false;
    $('.sheet-head h2').textContent='选择颜色';
    const back=$('.sheet-head .iconbtn');back.textContent='‹';back.dataset.action='color-cancel';
    $('.sheet-actions').innerHTML='<button class="button fill" data-action="color-cancel">返回</button><button class="button primary fill" data-action="color-apply">选用颜色</button>';
    $('.sheet-body').scrollTop=0;$('#color-error').textContent='';updatePicker();
  }
  function pickColorAt(x,y){
    const rect=$('#color-field').getBoundingClientRect();
    pickerHsv.s=Math.max(0,Math.min(1,(x-rect.left)/rect.width));
    pickerHsv.v=1-Math.max(0,Math.min(1,(y-rect.top)/rect.height));
    updatePicker();
  }
  function openEditor(courseId){
    const course=table.courses.find(x=>x.id===courseId);
    const chosenColor=course?.color||M.nextCourseColor(table.courses);
    modal(course?'编辑课程':'添加课程',`<div id="course-form" data-id="${course?esc(course.id):''}">
      <div class="course-name-row">${field('课程名称',`<input id="c-name" maxlength="100" value="${esc(course?.name||'')}" placeholder="课程名称">`)}
      <button type="button" class="color-ring" id="color-choice" data-color="${esc(chosenColor)}" data-auto="${course?'false':'true'}" data-action="color-custom" aria-label="选择课程颜色，当前 ${esc(chosenColor.toUpperCase())}" title="自定义颜色"><span id="current-color" style="background:${esc(chosenColor)}"></span></button></div>
      ${field('教师',`<input id="c-teacher" maxlength="60" value="${esc(course?.teacher||'')}">`)}
      <div class="section-title">上课时间</div><div id="sessions">${(course?.sessions.length?course.sessions:[{}]).map((s,i)=>sessionMarkup(s,i,course?.room||'')).join('')}</div>
      ${course&&table.exceptions.some(x=>x.courseId===course.id)?`<div class="section-title">临时变更</div>${table.exceptions.filter(x=>x.courseId===course.id).map(x=>
        `<div class="listrow"><small>${esc(x.sourceDate)} · ${x.type==='cancel'?'停课':`调至 ${esc(x.targetDate)}`}</small><button class="button small" data-action="remove-exception" data-id="${esc(x.id)}">恢复</button></div>`).join('')}`:''}
      <button class="button small" data-action="add-session">＋ 添加时段</button><p class="error" id="editor-error"></p></div>
      <div class="color-picker color-picker-page" id="color-picker" hidden><div class="color-picker-title">拖动选色，或输入 HEX 色值</div>
      <div class="color-picker-controls"><div class="color-field" id="color-field"><span id="color-point"></span></div><input id="color-hue" type="range" min="0" max="359" value="180" aria-label="色相"></div>
      <div class="color-picker-value"><div class="color-sample" id="color-preview">Aa</div>${field('HEX',`<input id="color-hex" maxlength="7" inputmode="text" value="${esc(chosenColor)}" aria-label="十六进制颜色">`)}</div>
      <p class="error" id="color-error"></p></div>`,
      `${course?'<button class="button danger" data-action="delete-course">删除</button>':''}<button class="button fill" data-action="close">取消</button><button class="button primary fill" id="save-course" data-action="save-course">保存</button>`);
  }
  function readSessions(){
    return [...document.querySelectorAll('#sessions .session')].map((box,index)=>{
      const day=Number(box.querySelector('.s-day').value),start=Number(box.querySelector('.s-start').value),end=Number(box.querySelector('.s-end').value);
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>table.periods.length)throw Error(`时段 ${index+1} 的节次无效`);
      const mode=box.querySelector('.s-week-mode').value;
      const weeks=mode==='custom'?M.parseWeeks(box.querySelector('.s-weeks').value,table.totalWeeks):
        M.selectWeeks(mode,box.querySelector('.s-week-start').value,box.querySelector('.s-week-end').value,table.totalWeeks);
      return {id:box.dataset.id||M.uid(),day,start,end,weeks,
        room:box.querySelector('.s-room').value.trim()};
    });
  }
  function saveCourse(){
    const form=$('#course-form'),id=form.dataset.id,name=$('#c-name').value.trim();
    try{
      if(!name)throw Error('请填写课程名称');
      const old=table.courses.find(x=>x.id===id);
      const sessions=readSessions();
      const course={id:id||M.uid(),name,teacher:$('#c-teacher').value.trim(),room:sessions[0]?.room||'',
        color:$('#color-choice').dataset.color||M.COLORS[0],sessions};
      const next=table.courses.filter(x=>x.id!==id).concat(course);
      const trial={...table,courses:next};let count=0;
      for(let w=1;w<=trial.totalWeeks;w++)count+=M.conflicts(M.occurrences(trial,w)).size;
      if(count&&!$('#save-course').dataset.confirmed){
        $('#editor-error').textContent=`检测到 ${count} 次重叠课程。再次点击“保存”继续。`;
        $('#save-course').dataset.confirmed='yes';return;
      }
      table.courses=next;
      if(old)table.exceptions=table.exceptions.filter(x=>!old.sessions.some(s=>s.id===x.sessionId) ||
        course.sessions.some(s=>s.id===x.sessionId));
      if(save()){close();render();toast('课程已保存');}
    }catch(e){$('#editor-error').textContent=e.message;}
  }
  function detail(eventId){
    const event=eventsById.get(eventId);if(!event)return;selectedEvent=event;selectedMarker=null;
    const course=table.courses.find(x=>x.id===event.courseId);if(!course)return;
    if(event.moved){
      const change=table.exceptions.find(x=>x.id===event.id),session=course.sessions.find(x=>x.id===event.sessionId);
      if(change&&session)selectedMarker={exceptionId:change.id,courseId:course.id,sessionId:session.id,date:change.sourceDate,
        start:session.start,end:session.end,room:session.room??course.room??'',type:'move'};
    }
    const info=`<div class="note" style="border-left:5px solid ${esc(event.color)}"><strong>${esc(course.name)}</strong><br>
      周${days[event.day-1]} · 第 ${event.start}-${event.end} 节 · ${esc(event.date)}<br>
      ${esc(event.room||'未填写教室')} ${event.teacher?'· '+esc(event.teacher):''}</div>
      <div class="muted">${event.moved?'本次课程已调课':`常规周次：${esc(M.weeksLabel(course.sessions.find(s=>s.id===event.sessionId)?.weeks||[]))}`}</div>`;
    modal('课程详情',info,`<button class="button" data-action="edit-selected">编辑整门课</button>
      ${event.moved?(selectedMarker?'<button class="button" data-action="move-occurrence">修改调课</button>':'')+'<button class="button" data-action="restore-occurrence">恢复本次</button>':
        '<button class="button" data-action="cancel-occurrence">本次停课</button><button class="button" data-action="move-occurrence">本次调课</button>'}`);
  }
  function detailMarker(markerId){
    const marker=markersById.get(markerId);if(!marker)return;
    selectedMarker=marker;selectedEvent=null;
    const destination=marker.type==='move'?`<br>调至 ${esc(marker.targetDate)} · 第 ${marker.targetStart}-${marker.targetEnd} 节`:'';
    modal(marker.type==='cancel'?'本次停课':'本次调课',`<div class="note" style="border-left:5px solid ${esc(marker.color)}"><strong>${esc(marker.name)}</strong><br>
      原定 ${esc(marker.date)} · 第 ${marker.start}-${marker.end} 节${destination}</div>`,
      `<button class="button fill" data-action="move-occurrence">${marker.type==='cancel'?'改为调课':'修改调课'}</button>
      <button class="button primary fill" data-action="restore-occurrence">恢复原安排</button>`);
  }
  function openMove(){
    const source=selectedMarker||selectedEvent;if(!source)return;
    const old=selectedMarker&&table.exceptions.find(x=>x.id===selectedMarker.exceptionId);
    modal(old?.type==='move'?'修改调课':'本次调课',`<div class="note">原课：${esc(source.date)} 第 ${source.start}-${source.end} 节</div>
      ${field('新日期',`<input id="move-date" type="date" min="${table.startDate}" max="${M.dateFor(table,table.totalWeeks,7)}" value="${old?.targetDate||source.date}">`)}
      <div class="row">${field('开始节',`<input id="move-start" type="number" min="1" max="${table.periods.length}" value="${old?.start||source.start}">`)}
      ${field('结束节',`<input id="move-end" type="number" min="1" max="${table.periods.length}" value="${old?.end||source.end}">`)}</div>
      ${field('教室',`<input id="move-room" value="${esc(old?.room??source.room)}">`)}<p class="error" id="move-error"></p>`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="save-move">保存</button>');
  }
  function openImport(){
    modal('导入课表',`<div class="import-page"><div class="import-section-label">教务系统</div><div class="import-sources">
      <button type="button" class="import-source" data-action="school"><span class="source-icon">${panelIcon('school')}</span>
      <span class="source-copy"><strong>沈阳化工大学</strong><small>登录后提取个人课表</small></span><span class="source-arrow">›</span></button>
      <button type="button" class="import-source" data-action="other-school"><span class="source-icon globe">${panelIcon('globe')}</span><span class="source-copy"><strong>其他学校网页</strong><small>使用教务系统网址</small></span><span class="source-arrow">›</span></button></div>
      <div class="import-section-label">本地导入</div><div class="import-files">
      <button type="button" class="import-source" data-action="pick-file"><span class="source-icon file">${panelIcon('file')}</span>
      <span class="source-copy"><strong>选择课表文件</strong><small>CSV / Excel / JSON 备份</small></span><span class="source-arrow">›</span></button>
      <button type="button" class="import-template" data-action="template">${panelIcon('file')}<span>下载 CSV 模板</span><span>↓</span></button></div>
      <p class="import-help">导入后先核对课程，再保存到课表。</p></div>`);
  }
  function openOtherSchool(){
    modal('其他学校网页',field('教务系统网址','<input id="portal-url" type="url" placeholder="https://..." inputmode="url" autocapitalize="off" spellcheck="false">'),
      '<button class="button fill" data-action="import">返回</button><button class="button primary fill" data-action="custom-portal">打开网页</button>');
  }
  function previewImport(result,source){
    pendingImport={...result,source};
    modal('核对导入',`<div class="note" id="import-summary"></div>
      ${result.issues?.length?`<div class="note warn">${result.issues.slice(0,5).map(esc).join('<br>')}</div>`:''}
      <div class="segmented"><label><input type="radio" name="import-mode" value="new" checked>新课表</label><label><input type="radio" name="import-mode" value="append">追加</label><label><input type="radio" name="import-mode" value="replace">替换</label></div>
      <div class="row" style="margin-top:12px">${field('新课表第一周周一',`<input id="import-date" type="date" value="${esc(table.startDate)}">`)}
      ${field('总周数',`<input id="import-weeks" type="number" min="1" max="30" value="${table.totalWeeks}">`)}</div>
      ${field('导入课程的周次',`<select id="import-week-mode"><option value="source">保留文件周次</option><option value="all">全部周数</option><option value="odd">单周</option><option value="even">双周</option></select>`)}
      <p class="error" id="import-error" role="alert"></p><div class="course-preview" id="import-course-preview"></div>`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="commit-import">导入</button>');
    updateImportPreview();
  }
  function importSelection(){
    const mode=$('input[name="import-mode"]:checked')?.value||'new';
    const weeks=mode==='new'?Number($('#import-weeks').value):table.totalWeeks;
    if(!Number.isInteger(weeks)||weeks<1||weeks>30)throw Error('总周数应在 1-30 周内');
    const weekMode=$('#import-week-mode').value;
    const scheduled=weekMode==='source'?pendingImport.courses:pendingImport.courses.map(c=>({...c,sessions:c.sessions.map(s=>
      ({...s,weeks:M.selectWeeks(weekMode,1,weeks,weeks)}))}));
    const courses=M.assignCourseColors(scheduled,mode==='append'?table.courses:[]);
    if(courses.some(c=>c.sessions.some(s=>s.weeks.some(w=>w>weeks))))throw Error('课程周次超出课表总周数');
    return {mode,weeks,courses};
  }
  function updateImportPreview(){
    if(!pendingImport?.courses||!$('#import-course-preview'))return;
    try{
      const {mode,weeks,courses}=importSelection();
      const trial={...table,totalWeeks:weeks,courses:mode==='append'?table.courses.concat(courses):courses,
        exceptions:mode==='append'?table.exceptions:[]};
      let conflicts=0;for(let w=1;w<=weeks;w++)conflicts+=M.conflicts(M.occurrences(trial,w)).size;
      const arrangements=courses.reduce((n,c)=>n+c.sessions.length,0);
      $('#import-summary').textContent=`${pendingImport.source} · ${courses.length} 门课 · ${arrangements} 个时段${conflicts?` · ${conflicts} 次时间重叠`:''}`;
      $('#import-course-preview').innerHTML=courses.map(c=>`<div class="preview-item" style="border-left-color:${esc(c.color)}"><strong>${esc(c.name)}</strong><span>${esc(c.teacher)}<br>${c.sessions.map(s=>`周${days[s.day-1]} ${s.start}-${s.end} 节 · ${M.weeksLabel(s.weeks)} 周 · ${esc(s.room??c.room??'未填写教室')}`).join('<br>')}</span></div>`).join('');
      $('#import-error').textContent='';$('#import-summary').hidden=false;
    }catch(e){$('#import-error').textContent=e.message;$('#import-summary').hidden=true;$('#import-course-preview').innerHTML='';}
  }
  function openSettings(){
    if(native?.reminderStatus){try{reminderStatus=JSON.parse(native.reminderStatus());}catch(e){}}
    modal('设置',`<div class="settings-page"><div class="settings-tabs" role="tablist" aria-label="设置分类">
      <button type="button" role="tab" aria-selected="true" class="selected" data-action="settings-tab" data-tab="table">课表</button>
      <button type="button" role="tab" aria-selected="false" data-action="settings-tab" data-tab="reminder">提醒</button>
      <button type="button" role="tab" aria-selected="false" data-action="settings-tab" data-tab="data">数据与应用</button></div>
      <section class="settings-panel" data-tab="table"><h3 class="panel-heading">${panelIcon('timetable')}<span>当前课表</span></h3>
      <div class="panel-card">${field('课表名称',`<input id="setting-name" value="${esc(table.name)}" maxlength="50">`)}
      <div class="row">${field('第一周周一',`<input id="setting-date" type="date" value="${table.startDate}">`)}
      ${field('总周数',`<input id="setting-weeks" type="number" min="1" max="30" value="${table.totalWeeks}">`)}</div>
      <button type="button" class="settings-link" data-action="periods">${panelIcon('clock')}<span>节次时间</span><span class="source-arrow">›</span></button></div></section>
      <section class="settings-panel" data-tab="reminder" hidden><h3 class="panel-heading">${panelIcon('alarm')}<span>课前提醒</span></h3>
      <div class="panel-card"><label class="reminder-switch"><span>开启提醒</span><input id="reminder-enabled" type="checkbox" ${state.settings.remindersEnabled?'checked':''}></label>
      ${field('提前分钟',`<input id="reminder-minutes" type="number" min="0" max="240" value="${state.settings.reminderMinutes??15}">`)}
      <div class="permission-status" id="permission-status">${esc(statusText())}</div>
      <div class="permission-actions"><button class="button small" data-action="notification-permission">通知权限</button>
      <button class="button small" data-action="exact-permission">精确提醒</button></div>
      <button class="button small reminder-test" data-action="test-reminder">测试提醒（1 分钟后）</button><p class="muted reminder-test-status" id="reminder-test-status" role="status"></p></div></section>
      <section class="settings-panel" data-tab="data" hidden><h3 class="panel-heading">${panelIcon('data')}<span>数据</span></h3>
      <div class="settings-list"><button data-action="backup">${panelIcon('data')}<span>导出 JSON 备份</span><b>›</b></button>
      <button data-action="ics">${panelIcon('timetable')}<span>导出日历</span><b>›</b></button></div>
      <h3 class="panel-heading">${panelIcon('app')}<span>应用</span></h3>
      <div class="settings-list"><button data-action="check-update">${panelIcon('update')}<span>检查更新</span><b>›</b></button>
      <button data-action="changelog">${panelIcon('file')}<span>更新说明</span><b>›</b></button>
      <button data-action="feedback">${panelIcon('message')}<span>反馈问题</span><b>›</b></button></div>
      <p class="version">ClassGrid v${esc(appVersion)}</p></section><p class="error" id="settings-error" role="alert"></p></div>`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="save-settings">保存</button>');
  }
  function openFeedback(){
    modal('反馈问题',`${field('问题描述','<textarea id="feedback-text" maxlength="1200" rows="5" placeholder="发生了什么？如何复现？"></textarea>')}
      <p class="muted">仅附带应用和安卓版本。GitHub 反馈公开可见，提交前请检查文字和截图；提交需要登录。</p><p class="error" id="feedback-error"></p>`,
      '<button class="button fill" data-action="feedback-share">分享文本</button><button class="button primary fill" data-action="feedback-github">打开 GitHub</button>');
  }
  function feedbackReport(){
    const description=$('#feedback-text')?.value.trim();
    if(!description){$('#feedback-error').textContent='请先填写问题描述';return null;}
    return `## 问题\n${description}\n\n## 环境\nClassGrid v${appVersion}${androidVersion?`\nAndroid ${androidVersion}`:''}`;
  }
  function statusText(){
    const last=reminderStatus.lastAt?`\n最近发送 ${new Date(reminderStatus.lastAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${reminderStatus.lastTitle||'课程提醒'}`:'';
    if(!state.settings.remindersEnabled)return '提醒已关闭';
    if(!reminderStatus.notifications)return '通知权限未开启，课程提醒无法显示';
    if(!reminderStatus.exact)return '精确提醒未开启，系统可能延迟通知；请点击下方“精确提醒”授权';
    if(reminderStatus.error)return reminderStatus.error;
    if(reminderStatus.scheduled>0&&reminderStatus.nextAt){
      const when=new Date(reminderStatus.nextAt);
      return `已设置 ${reminderStatus.scheduled} 条提醒\n下次 ${when.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}${reminderStatus.nextTitle?' · '+reminderStatus.nextTitle:''}${last}`;
    }
    return '未来 21 天暂无待发送的课程提醒'+last;
  }
  function periodRow(p,index){return `<div class="period-row"><span class="period-number">${index+1}</span>
    <input class="period-start" type="time" value="${esc(p.start)}" aria-label="第 ${index+1} 节开始时间">
    <span class="period-dash">—</span><input class="period-end" type="time" value="${esc(p.end)}" aria-label="第 ${index+1} 节结束时间"></div>`;}
  function openPeriods(){
    modal('节次时间',`<div class="period-column-head"><span>节</span><span>开始</span><span></span><span>结束</span></div>
      <div id="period-rows">${table.periods.map(periodRow).join('')}</div>
      <div class="period-editor-actions"><button class="button small" data-action="add-period" ${table.periods.length>=20?'disabled':''}>＋ 添加节次</button>
      <button class="button small" data-action="remove-period" ${table.periods.length<=1?'disabled':''}>删除末节</button></div><p class="error" id="period-error" role="alert"></p>`,
      '<button class="button fill" data-action="settings">返回</button><button class="button primary fill" data-action="save-periods">保存</button>');
  }
  async function pickBackgroundInBrowser(){
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,.jpg,.jpeg';
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        if(file.type!=='image/jpeg')throw Error('请选择 JPG 图片');
        const image=await createImageBitmap(file);
        const scale=Math.min(1,1600/Math.max(image.width,image.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
        const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);image.close();
        let background='';
        for(let round=0;round<5;round++){
          for(let quality=.82;quality>=.42;quality-=.1){
            background=canvas.toDataURL('image/jpeg',quality);
            if(background.length<=220000)break;
          }
          if(background.length<=220000)break;
          const copy=document.createElement('canvas');copy.width=Math.max(1,Math.round(canvas.width*.8));copy.height=Math.max(1,Math.round(canvas.height*.8));
          copy.getContext('2d').drawImage(canvas,0,0,copy.width,copy.height);canvas.width=copy.width;canvas.height=copy.height;context.drawImage(copy,0,0);
        }
        if(background.length>220000)throw Error('图片内容过于复杂，请换一张 JPG');
        window.onBackgroundPicked({tableId:table.id,background});
      }catch(e){toast(e.message||'无法读取 JPG 图片');}
    };
    input.click();
  }
  function handleAction(action,button){
    if(action==='close'){close();return;} if(action==='close-overlay'){if(button.classList.contains('overlay'))close();return;}
    if(action==='theme'){const old=state.settings.theme;state.settings.theme=old==='dark'?'light':'dark';applyTheme();applyBackground(table);if(!save(false)){state.settings.theme=old;applyTheme();applyBackground(table);}return;}
    if(action==='prev'||action==='next'){week+=action==='prev'?-1:1;render();return;}
    if(action==='home'){render();return;}
    if(action==='today'){week=currentWeek();render();return;}
    if(action==='week'){openWeek();return;}
    if(action==='set-week'){week=Math.max(1,Math.min(table.totalWeeks,Number($('#week-input').value)||1));close();render();return;}
    if(action==='manage'){openManage();return;}
    if(action==='pick-background'){if(native)native.pickBackground(table.id);else pickBackgroundInBrowser();return;}
    if(action==='clear-background'){
      const old=table.background;table.background='';
      if(!save()){table.background=old;return;}
      render();openManage();return;
    }
    if(action==='switch-table'){state.activeId=button.dataset.id;table=M.activeTable(state);week=currentWeek();save();close();render();return;}
    if(action==='new-table'){
      const name=$('#new-table-name').value.trim();if(!name)return toast('请填写名称');
      const t=M.defaultTable();t.name=name;state.tables.push(t);state.activeId=t.id;table=t;week=1;
      save();close();render();return;
    }
    if(action==='delete-table'){
      const t=state.tables.find(x=>x.id===button.dataset.id);if(!t)return;
      modal('删除课表',`<p>删除“${esc(t.name)}”及其中课程？</p>`,
        `<button class="button fill" data-action="manage">取消</button><button class="button danger fill" data-action="confirm-delete-table" data-id="${esc(t.id)}">删除</button>`);return;
    }
    if(action==='confirm-delete-table'){
      state.tables=state.tables.filter(x=>x.id!==button.dataset.id);if(state.activeId===button.dataset.id)state.activeId=state.tables[0].id;
      table=M.activeTable(state);week=currentWeek();save();close();render();return;
    }
    if(action==='add'){openEditor();return;}
    if(action==='detail'){detail(button.dataset.id);return;}
    if(action==='marker'){detailMarker(button.dataset.id);return;}
    if(action==='edit-selected'){const id=selectedEvent?.courseId;openEditor(id);return;}
    if(action==='add-session'){$('#sessions').insertAdjacentHTML('beforeend',sessionMarkup({},$('#sessions').children.length,$('#sessions .s-room')?.value||''));return;}
    if(action==='remove-session'){if($('#sessions').children.length>1)button.closest('.session').remove();return;}
    if(action==='color-custom'){openColorPicker();return;}
    if(action==='color-cancel'){closeColorPicker();return;}
    if(action==='color-apply'){
      const hex=$('#color-hex').value.trim().toUpperCase();
      if(!/^#[0-9A-F]{6}$/.test(hex)){$('#color-error').textContent='请输入 #RRGGBB 格式的颜色';return;}
      $('#color-choice').dataset.auto='false';setCourseColor(hex);closeColorPicker();return;
    }
    if(action==='save-course'){saveCourse();return;}
    if(action==='delete-course'){
      const id=$('#course-form').dataset.id,c=table.courses.find(x=>x.id===id);
      modal('删除课程',`<p>删除“${esc(c?.name||'课程')}”及其全部上课安排？</p>`,
        `<button class="button fill" data-action="close">取消</button><button class="button danger fill" data-action="confirm-delete-course" data-id="${esc(id)}">删除</button>`);return;
    }
    if(action==='confirm-delete-course'){
      const id=button.dataset.id;table.courses=table.courses.filter(x=>x.id!==id);
      table.exceptions=table.exceptions.filter(x=>x.courseId!==id);save();close();render();return;
    }
    if(action==='remove-exception'){
      table.exceptions=table.exceptions.filter(x=>x.id!==button.dataset.id);save();openEditor($('#course-form').dataset.id);render();return;
    }
    if(action==='cancel-occurrence'){
      if(!selectedEvent)return;
      table.exceptions=table.exceptions.filter(x=>x.sessionId!==selectedEvent.sessionId||x.sourceDate!==selectedEvent.date);
      table.exceptions.push({id:M.uid(),type:'cancel',courseId:selectedEvent.courseId,sessionId:selectedEvent.sessionId,sourceDate:selectedEvent.date});
      save();close();render();toast('本次课程已标记停课');return;
    }
    if(action==='move-occurrence'){openMove();return;}
    if(action==='restore-occurrence'){
      const id=selectedMarker?.exceptionId||selectedEvent?.id;
      table.exceptions=table.exceptions.filter(x=>x.id!==id);save();close();render();toast('已恢复');return;
    }
    if(action==='save-move'){
      const date=$('#move-date').value,start=Number($('#move-start').value),end=Number($('#move-end').value);
      if(!date||date<table.startDate||date>M.dateFor(table,table.totalWeeks,7)||start<1||end<start||end>table.periods.length){$('#move-error').textContent='请检查日期和节次';return;}
      const source=selectedMarker||selectedEvent,room=$('#move-room').value.trim();if(!source)return;
      if(date===source.date&&start===source.start&&end===source.end&&room===source.room){$('#move-error').textContent='新安排与原安排相同';return;}
      const change={id:M.uid(),type:'move',courseId:source.courseId,sessionId:source.sessionId,sourceDate:source.date,
        targetDate:date,start,end,room};
      table.exceptions=table.exceptions.filter(x=>x.sessionId!==source.sessionId||x.sourceDate!==source.date);
      table.exceptions.push(change);save();close();render();toast(`已调至 ${date} 第 ${start}-${end} 节`);return;
    }
    if(action==='import'){openImport();return;}
    if(action==='other-school'){openOtherSchool();return;}
    if(action==='school'){if(native)native.openPortal('https://jws.syuct.edu.cn/');else toast('请在安卓应用中打开');return;}
    if(action==='custom-portal'){
      const url=$('#portal-url').value.trim();try{const u=new URL(url);if(u.protocol!=='https:')throw 0;if(native)native.openPortal(url);else toast('请在安卓应用中打开');}
      catch(e){toast('请输入 HTTPS 网址');}return;
    }
    if(action==='pick-file'){if(native)native.pickImport();else toast('请在安卓应用中选择文件');return;}
    if(action==='template'){exportFile('ClassGrid-课程模板.csv','text/csv','\uFEFF'+I.TEMPLATE);return;}
    if(action==='commit-import'){
      if(!pendingImport)return;
      let selection;try{selection=importSelection();}catch(e){$('#import-error').textContent=e.message;return;}
      const {mode,courses}=selection;
      if(mode==='new'){
        const date=$('#import-date').value,weeks=Number($('#import-weeks').value);
        if(!date||M.monday(date)!==date||weeks<1||weeks>30){
          toast('请检查第一周周一和总周数');return;
        }
        const t=M.defaultTable();t.name=pendingImport.source+'课表';t.startDate=date;t.totalWeeks=weeks;
        t.courses=courses;state.tables.push(t);state.activeId=t.id;table=t;week=1;
      }
      else if(mode==='replace'){table.courses=courses;table.exceptions=[];}
      else table.courses.push(...courses);
      pendingImport=null;save();close();render();toast('导入完成');return;
    }
    if(action==='settings'){openSettings();return;}
    if(action==='settings-tab'){
      const selected=button.dataset.tab;
      $$('.settings-tabs [data-tab]').forEach(tab=>{const active=tab.dataset.tab===selected;tab.classList.toggle('selected',active);tab.setAttribute('aria-selected',String(active));});
      $$('.settings-panel').forEach(panel=>panel.hidden=panel.dataset.tab!==selected);
      $('.sheet-body').scrollTop=0;return;
    }
    if(action==='save-settings'){
      const name=$('#setting-name').value.trim(),date=$('#setting-date').value,weeks=Number($('#setting-weeks').value),mins=Number($('#reminder-minutes').value);
      if(!name||!/^\d{4}-\d\d-\d\d$/.test(date)||M.monday(date)!==date||weeks<1||weeks>30||mins<0||mins>240){$('#settings-error').textContent='请检查名称、第一周周一、总周数和提醒时间';return;}
      if(table.courses.some(c=>c.sessions.some(s=>s.weeks.some(w=>w>weeks)))){$('#settings-error').textContent='现有课程超出新的总周数';return;}
      const turningOn=!state.settings.remindersEnabled&&$('#reminder-enabled').checked;
      table.name=name;table.startDate=date;table.totalWeeks=weeks;state.settings.remindersEnabled=$('#reminder-enabled').checked;
      state.settings.reminderMinutes=mins;week=Math.min(week,weeks);save();close();render();
      if(turningOn&&native){
        if(!reminderStatus.notifications)native.requestReminderPermission();
        else if(!reminderStatus.exact)native.openExactAlarmSettings();
      }
      toast('设置已保存');return;
    }
    if(action==='periods'){openPeriods();return;}
    if(action==='add-period'){
      const rows=$('#period-rows');if(rows.children.length>=20)return;
      const last=rows.lastElementChild.querySelector('.period-end').value;
      const minutes=Number(last.slice(0,2))*60+Number(last.slice(3));
      if(minutes>23*60+4){$('#period-error').textContent='已到当天末尾，无法自动添加节次';return;}
      const start=minutes+10,end=Math.min(start+45,23*60+59);
      const format=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
      rows.insertAdjacentHTML('beforeend',periodRow({start:format(start),end:format(end)},rows.children.length));
      $('[data-action="add-period"]').disabled=rows.children.length>=20;
      $('[data-action="remove-period"]').disabled=false;return;
    }
    if(action==='remove-period'){
      const rows=$('#period-rows');if(rows.children.length<=1)return;
      if(table.courses.some(c=>c.sessions.some(s=>s.end>=rows.children.length))){$('#period-error').textContent='末节已有课程，不能删除';return;}
      rows.lastElementChild.remove();$('[data-action="remove-period"]').disabled=rows.children.length<=1;
      $('[data-action="add-period"]').disabled=false;$('#period-error').textContent='';return;
    }
    if(action==='save-periods'){
      try{
        const periods=[...document.querySelectorAll('#period-rows .period-row')].map((row,index)=>{
          const start=row.querySelector('.period-start').value,end=row.querySelector('.period-end').value;
          if(!/^\d\d:\d\d$/.test(start)||!/^\d\d:\d\d$/.test(end)||start>=end)throw Error(`第 ${index+1} 节时间无效`);
          return {start,end};
        });
        if(periods.length<1||periods.length>20||table.courses.some(c=>c.sessions.some(s=>s.end>periods.length)))throw Error('节次数量与课程不匹配');
        if(periods.some((p,i)=>i>0&&p.start<periods[i-1].end))throw Error('相邻节次时间不能重叠');
        const old=table.periods;table.periods=periods;
        if(!save()){table.periods=old;throw Error('保存失败');}
        openSettings();render();toast('节次时间已保存');
      }catch(e){$('#period-error').textContent=e.message;}return;
    }
    if(action==='notification-permission'){if(native)native.requestReminderPermission();return;}
    if(action==='exact-permission'){if(native)native.openExactAlarmSettings();return;}
    if(action==='test-reminder'){if(native?.testReminder)native.testReminder();else toast('请在安卓应用中测试提醒');return;}
    if(action==='backup'){exportFile('ClassGrid-backup.json','application/json',JSON.stringify(state));return;}
    if(action==='ics'){exportFile('ClassGrid-'+table.name+'.ics','text/calendar',M.toIcs(table));return;}
    if(action==='check-update'){if(native)native.checkForUpdates(true);else toast('请在安卓应用中检查更新');return;}
    if(action==='feedback'){openFeedback();return;}
    if(action==='feedback-github'||action==='feedback-share'){
      const report=feedbackReport();if(!report)return;
      if(native){
        if(action==='feedback-github')native.openFeedback('问题反馈',report);
        else native.shareFeedback(report);
      }else if(action==='feedback-github')window.open('https://github.com/Mr-Y-LYB/classgrid-android/issues/new?title='+encodeURIComponent('问题反馈')+'&body='+encodeURIComponent(report),'_blank');
      else if(navigator.share)navigator.share({text:report}).catch(()=>{});
      else toast('请在安卓应用中分享');
      return;
    }
    if(action==='changelog'){modal('更新说明',changelogHtml());return;}
    if(action==='download-update'){
      if(pendingUpdate&&native){
        const action=$('[data-action="download-update"]');if(action){action.disabled=true;action.textContent='正在下载';}
        const progress=$('#update-progress');if(progress){progress.classList.remove('error');progress.textContent='正在连接下载源…';}
        const track=$('#update-track');if(track){track.hidden=false;track.classList.add('loading');$('#update-fill').style.width='35%';}
        try{native.downloadUpdate(pendingUpdate.url,pendingUpdate.digest,pendingUpdate.version);}
        catch(e){window.onUpdateDownload({ok:false,message:'无法开始下载，请在浏览器下载'});}
      }return;
    }
    if(action==='browser-update'){
      if(pendingUpdate&&native){
        try{native.openUpdateInBrowser(pendingUpdate.url);}
        catch(e){window.onUpdateDownload({ok:false,message:'无法打开浏览器'});}
      }return;
    }
    if(action==='restore-backup'){
      if(!pendingImport?.backup)return;state=pendingImport.backup;table=M.activeTable(state);week=currentWeek();pendingImport=null;save();close();render();toast('备份已恢复');return;
    }
  }
  const $$=s=>[...document.querySelectorAll(s)];
  document.addEventListener('click',e=>{
    if($('.overlay.closing')){e.preventDefault();return;}
    const target=e.target.closest('[data-action]');
    if(target&&!(target.classList.contains('overlay')&&target!==e.target))handleAction(target.dataset.action,target);
  });
  document.addEventListener('pointerdown',e=>{
    const field=e.target.closest('#color-field');if(!field||$('#color-picker')?.hidden)return;
    field.setPointerCapture(e.pointerId);pickColorAt(e.clientX,e.clientY);
  });
  document.addEventListener('pointermove',e=>{
    const field=$('#color-field');if(field?.hasPointerCapture(e.pointerId))pickColorAt(e.clientX,e.clientY);
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='c-name'||e.target.id==='c-teacher'){
      if($('#color-choice')?.dataset.auto==='true')setCourseColor(M.nextCourseColor(table.courses,$('#c-name').value.trim(),$('#c-teacher').value.trim()));
      return;
    }
    if(e.target.id==='import-weeks'){updateImportPreview();return;}
    if(e.target.id==='color-hue'){
      pickerHsv.h=Number(e.target.value);updatePicker();return;
    }
    if(e.target.id==='color-hex'){
      const hex=e.target.value.trim();$('#color-error').textContent='';
      if(/^#[0-9a-f]{6}$/i.test(hex)){pickerHsv=hexToHsv(hex);updatePicker(false);}
      return;
    }
    if(e.target.id!=='background-fade')return;
    const fade=Number(e.target.value);
    $('#background-fade-value').textContent=`${fade}%`;
    applyBackgroundPreview(table,fade);
    applyBackground(table,fade);
  });
  document.addEventListener('change',e=>{
    if(e.target.classList.contains('s-week-mode')){
      const box=e.target.closest('.session'),custom=e.target.value==='custom';
      box.querySelector('.s-week-range').hidden=custom;box.querySelector('.s-week-custom').hidden=!custom;return;
    }
    if(e.target.id==='import-week-mode'||e.target.name==='import-mode'){updateImportPreview();return;}
    if(e.target.id!=='background-fade')return;
    const old=table.backgroundFade;table.backgroundFade=Number(e.target.value);
    if(!save()){table.backgroundFade=old;applyBackground(table);applyBackgroundPreview(table);}
  });
  function exportFile(name,mime,content){if(native)native.exportFile(name,mime,content);else toast('请在安卓应用中导出');}
  window.onFileImported=data=>{
    if(data.error){toast(data.error);return;}
    try{
      if(/\.json$/i.test(data.name)){
        const backup=M.validateState(JSON.parse(data.text));pendingImport={backup};
        modal('恢复备份',`<div class="note">${backup.tables.length} 张课表，共 ${backup.tables.reduce((n,t)=>n+t.courses.length,0)} 门课。恢复将替换当前全部数据。</div>`,
          '<button class="button fill" data-action="close">取消</button><button class="button danger fill" data-action="restore-backup">恢复</button>');
      }else previewImport(I.parseCsvCourses(data.text,table.totalWeeks),data.name);
    }catch(e){toast('导入失败：'+e.message);}
  };
  window.onPortalData=data=>{try{previewImport(I.parsePortal(data,table.totalWeeks),data.source||'教务系统');}catch(e){toast(e.message);}};
  window.onBackgroundPicked=data=>{
    if(data.error){toast(data.error);return;}
    const target=state.tables.find(t=>t.id===data.tableId);if(!target)return;
    let background=data.background;
    try{
      if(data.token){
        if(!native||!Number.isInteger(data.length)||data.length<24||data.length>220000)throw Error('图片传输失败');
        const chunks=[];
        for(let offset=0;offset<data.length;offset+=12000){
          const chunk=native.readBackgroundChunk(data.token,offset,Math.min(12000,data.length-offset));
          if(typeof chunk!=='string'||chunk.length!==Math.min(12000,data.length-offset))throw Error('图片传输不完整');
          chunks.push(chunk);
        }
        background=chunks.join('');
        native.clearPendingBackground(data.token);
      }
      if(typeof background!=='string'||background.length>220000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(background))throw Error('JPG 图片无效');
    }catch(e){if(data.token&&native)native.clearPendingBackground(data.token);toast(e.message||'图片传输失败');return;}
    const preview=new Image();
    preview.onload=()=>{
      const old=target.background,oldFade=target.backgroundFade;
      target.background=background;
      if(!old&&oldFade===58)target.backgroundFade=35;
      if(!save()){target.background=old;target.backgroundFade=oldFade;return;}
      render();if(target.id===state.activeId)openManage();toast('背景已更新');
    };
    preview.onerror=()=>toast('JPG 图片无法显示，请重新选择');
    preview.src=background;
  };
  window.onExportDone=data=>toast(data.ok?'文件已保存':'导出失败');
  window.onFeedbackResult=data=>{if(data?.error)toast(data.error);};
  window.onReminderAction=data=>{if(data.message)toast(data.message);};
  window.onReminderStatus=data=>{
    reminderStatus=data||reminderStatus;
    const el=$('#permission-status');if(el)el.textContent=statusText();
  };
  window.onReminderTest=data=>{
    const message=data?.ok?(data.exact?'测试提醒已设置，约 1 分钟后查看通知':'测试提醒已设置，系统可能延迟显示'):data?.error||'测试提醒设置失败';
    const el=$('#reminder-test-status');if(el)el.textContent=message;else toast(message);
  };
  window.onUpdateCheck=data=>{
    if(data.error){if(data.manual)toast(data.error);return;}
    if(!data.available){if(data.manual)toast('已是最新版本');return;}
    pendingUpdate=data;
    modal('发现新版本',`<div class="update-head"><span class="update-badge">v${esc(data.version)}</span>
      ${data.size?`<span class="muted">${Math.max(1,Math.round(data.size/1024))} KB</span>`:''}</div>
      <div class="update-title">更新内容</div><ul class="update-list">${releaseItems(data.notes).map(item=>`<li>${esc(item)}</li>`).join('')}</ul>
      <p class="muted update-progress" id="update-progress" aria-live="polite"></p>
      <div class="update-track" id="update-track" hidden><div id="update-fill"></div></div>
      <button class="update-browser" data-action="browser-update">在浏览器下载 APK</button>`,
      '<button class="button fill" data-action="close">稍后</button><button class="button primary fill" data-action="download-update">更新</button>');
  };
  window.onUpdateProgress=data=>{
    const el=$('#update-progress');if(el){el.classList.remove('error');el.textContent=data.message||`下载中 ${data.percent}%`;}
    const track=$('#update-track'),fill=$('#update-fill');
    if(track&&fill&&Number.isFinite(data.percent)){
      track.hidden=false;track.classList.remove('loading');fill.style.width=`${Math.max(0,Math.min(100,data.percent))}%`;
    }else if(track&&data.message){track.hidden=false;track.classList.add('loading');if(fill)fill.style.width='35%';}
  };
  window.onUpdateDownload=data=>{
    const action=$('[data-action="download-update"]');
    if(!data.ok&&action){action.disabled=false;action.textContent='重试';}
    const progress=$('#update-progress');if(progress){progress.classList.toggle('error',!data.ok);progress.textContent=data.message||'更新结束';}
    const track=$('#update-track');if(track){track.classList.remove('loading');track.hidden=!data.ok;}
    else toast(data.message||'更新结束');
  };
  let resizeTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      const grid=$('#timetable');if(!grid)return;
      grid.querySelectorAll('.course-card').forEach(card=>card.remove());
      const events=M.occurrences(table,week);
      positionCards(events,M.changeMarkers(table,week),M.conflicts(events));
    },80);
  });
  applyTheme();render();
  if(native)native.syncReminders(JSON.stringify(M.reminderPayload(state)));
})();
