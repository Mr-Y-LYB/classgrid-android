(function(){
  'use strict';
  const M=window.CGModel,I=window.CGImport;
  const $=s=>document.querySelector(s);
  const native=window.Native||null;
  const days=['一','二','三','四','五','六','日'];
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state,week=1,eventsById=new Map(),selectedEvent=null,pendingImport=null,pendingUpdate=null,reminderStatus={notifications:true,exact:true};
  try{state=M.validateState(JSON.parse(native?native.loadState():localStorage.getItem('classgrid-state')||'null'));}
  catch(e){state=M.defaultState();}
  let table=M.activeTable(state);week=Math.max(1,Math.min(table.totalWeeks,M.weekOf(table,M.todayDate())));

  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800);}
  function save(){
    try{
      M.validateState(state);const json=JSON.stringify(state);
      if(native){if(!native.saveState(json))throw Error('保存失败');native.syncReminders(JSON.stringify(M.reminderPayload(state)));}
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
    const occurrences=M.occurrences(table,week),conflicts=M.conflicts(occurrences);
    eventsById=new Map(occurrences.map(x=>[x.id,x]));
    $('#app').innerHTML=`<main class="shell">
      <div class="top"><div class="brand"><span class="brandmark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="brandtitle">ClassGrid</span></div>
        <button class="iconbtn" data-action="settings" aria-label="设置">⚙</button></div>
      <div class="toolbar"><button class="table-select" data-action="manage">${esc(table.name)} ▾</button>
        <div class="weeknav"><button class="iconbtn" data-action="prev" aria-label="上一周">‹</button>
          <button class="weekpill" data-action="week">第 ${week} 周</button>
          <button class="iconbtn" data-action="next" aria-label="下一周">›</button>
          <button class="todaybtn" data-action="today">本周</button></div></div>
      <div class="weekday-row"><div></div>${days.map((d,i)=>`<div class="day ${dates[i]===today?'today':''}"><b>周${d}</b><span>${dateLabel(dates[i])}</span></div>`).join('')}</div>
      <div class="grid-scroll"><div class="timetable" id="timetable">${table.periods.map((p,n)=>
        `<div class="period-label" style="height:72px;grid-row:${n+1};grid-column:1">${n+1}<small>${esc(p.start)}</small></div>`+
        days.map((_,i)=>`<div class="slot ${dates[i]===today?'todaycol':''}" style="height:72px;grid-row:${n+1};grid-column:${i+2}"></div>`).join('')).join('')}
        ${occurrences.length?'':`<div class="empty-tip">本周暂无课程</div>`}</div></div>
      <nav class="bottom"><button class="navbtn primary" data-action="add"><b>＋</b>添加</button>
        <button class="navbtn" data-action="import"><b>⇩</b>导入</button>
        <button class="navbtn" data-action="manage"><b>▦</b>课表</button>
        <button class="navbtn" data-action="settings"><b>⚙</b>设置</button></nav>
      </main>`;
    positionCards(occurrences,conflicts);
    let touch=null;const scroller=$('.grid-scroll');
    scroller.addEventListener('touchstart',e=>{touch={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
    scroller.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;
      if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.35){week+=dx<0?1:-1;render();}touch=null;},{passive:true});
  }
  function positionCards(events,conflicts){
    const grid=$('#timetable');if(!grid)return;
    const width=(grid.clientWidth-14-34)/7;
    for(const event of events){
      const overlapping=events.filter(x=>x.day===event.day&&x.start<=event.end&&event.start<=x.end);
      const count=overlapping.length,index=overlapping.findIndex(x=>x.id===event.id);
      const button=document.createElement('button');button.className='course-card'+(conflicts.has(event.id)?' conflict':'')+(event.moved?' moved':'');
      button.style.background=event.color;button.style.top=((event.start-1)*72+3)+'px';
      button.style.height=((event.end-event.start+1)*72-6)+'px';
      button.style.left=(7+34+(event.day-1)*width+(width*index/count)+2)+'px';
      button.style.width=(width/count-4)+'px';
      button.dataset.action='detail';button.dataset.id=event.id;
      button.innerHTML=`<strong>${esc(event.name)}</strong><span>${esc(event.room)}</span>`;
      grid.appendChild(button);
    }
  }
  function modal(title,body,actions=''){
    $('#modal-root').innerHTML=`<div class="overlay" data-action="close-overlay"><section class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="iconbtn" data-action="close" aria-label="关闭">×</button></div>
      <div class="sheet-body">${body}</div>${actions?`<div class="sheet-actions">${actions}</div>`:''}</section></div>`;
  }
  function close(){ $('#modal-root').innerHTML=''; }
  function field(label,input){return `<div class="field"><label>${label}</label>${input}</div>`;}
  function openWeek(){modal('选择周次',field('周次',`<input id="week-input" type="number" min="1" max="${table.totalWeeks}" value="${week}">`),
    '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="set-week">确定</button>');}
  function openManage(){
    modal('课表',`<div>${state.tables.map(t=>`<div class="listrow"><div><strong>${esc(t.name)} ${t.id===state.activeId?'✓':''}</strong><small>${esc(t.startDate)} · ${t.totalWeeks} 周 · ${t.courses.length} 门课</small></div>
      <div class="row"><button class="button small" data-action="switch-table" data-id="${esc(t.id)}">打开</button>${state.tables.length>1?`<button class="button small danger" data-action="delete-table" data-id="${esc(t.id)}">删除</button>`:''}</div></div>`).join('')}</div>
      <div class="section-title">新建课表</div>${field('名称','<input id="new-table-name" placeholder="例如 2026 秋季学期" maxlength="50">')}`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="new-table">新建</button>');
  }
  function sessionMarkup(s={},index=0){return `<div class="session" data-id="${esc(s.id||'')}"><div class="session-head"><span>上课时段 ${index+1}</span><button class="button small" type="button" data-action="remove-session">移除</button></div>
    <div class="row"><div class="field"><label>星期</label><select class="s-day">${days.map((d,i)=>`<option value="${i+1}" ${Number(s.day||1)===i+1?'selected':''}>周${d}</option>`).join('')}</select></div>
    <div class="field"><label>开始节</label><input class="s-start" type="number" min="1" max="${table.periods.length}" value="${s.start||1}"></div>
    <div class="field"><label>结束节</label><input class="s-end" type="number" min="1" max="${table.periods.length}" value="${s.end||Math.min(2,table.periods.length)}"></div></div>
    ${field('周次',`<input class="s-weeks" placeholder="1-16、1-16单、1,3,5" value="${esc(s.weeks?M.weeksLabel(s.weeks):`1-${table.totalWeeks}`)}">`)}</div>`;}
  function openEditor(courseId){
    const course=table.courses.find(x=>x.id===courseId);
    modal(course?'编辑课程':'添加课程',`<div id="course-form" data-id="${course?esc(course.id):''}">
      ${field('课程名称',`<input id="c-name" maxlength="100" value="${esc(course?.name||'')}" placeholder="课程名称">`)}
      <div class="row">${field('教师',`<input id="c-teacher" maxlength="60" value="${esc(course?.teacher||'')}">`)}${field('教室',`<input id="c-room" maxlength="100" value="${esc(course?.room||'')}">`)}</div>
      <div class="field"><label>颜色</label><div class="choice" id="color-choice">${M.COLORS.map(c=>`<button type="button" class="swatch ${c===(course?.color||M.COLORS[0])?'selected':''}" style="background:${c}" data-action="color" data-color="${c}" aria-label="选择颜色"></button>`).join('')}</div></div>
      <div class="section-title">上课时间</div><div id="sessions">${(course?.sessions.length?course.sessions:[{}]).map(sessionMarkup).join('')}</div>
      ${course&&table.exceptions.some(x=>x.courseId===course.id)?`<div class="section-title">临时变更</div>${table.exceptions.filter(x=>x.courseId===course.id).map(x=>
        `<div class="listrow"><small>${esc(x.sourceDate)} · ${x.type==='cancel'?'停课':`调至 ${esc(x.targetDate)}`}</small><button class="button small" data-action="remove-exception" data-id="${esc(x.id)}">恢复</button></div>`).join('')}`:''}
      <button class="button small" data-action="add-session">＋ 添加时段</button><p class="error" id="editor-error"></p></div>`,
      `${course?'<button class="button danger" data-action="delete-course">删除</button>':''}<button class="button fill" data-action="close">取消</button><button class="button primary fill" id="save-course" data-action="save-course">保存</button>`);
  }
  function readSessions(){
    return [...document.querySelectorAll('#sessions .session')].map((box,index)=>{
      const day=Number(box.querySelector('.s-day').value),start=Number(box.querySelector('.s-start').value),end=Number(box.querySelector('.s-end').value);
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>table.periods.length)throw Error(`时段 ${index+1} 的节次无效`);
      return {id:box.dataset.id||M.uid(),day,start,end,weeks:M.parseWeeks(box.querySelector('.s-weeks').value,table.totalWeeks)};
    });
  }
  function saveCourse(){
    const form=$('#course-form'),id=form.dataset.id,name=$('#c-name').value.trim();
    try{
      if(!name)throw Error('请填写课程名称');
      const old=table.courses.find(x=>x.id===id);
      const course={id:id||M.uid(),name,teacher:$('#c-teacher').value.trim(),room:$('#c-room').value.trim(),
        color:$('#color-choice .selected')?.dataset.color||M.COLORS[0],sessions:readSessions()};
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
    const event=eventsById.get(eventId);if(!event)return;selectedEvent=event;
    const course=table.courses.find(x=>x.id===event.courseId);if(!course)return;
    const info=`<div class="note" style="border-left:5px solid ${esc(event.color)}"><strong>${esc(course.name)}</strong><br>
      周${days[event.day-1]} · 第 ${event.start}-${event.end} 节 · ${esc(event.date)}<br>
      ${esc(event.room||'未填写教室')} ${event.teacher?'· '+esc(event.teacher):''}</div>
      <div class="muted">${event.moved?'本次课程已调课':`常规周次：${esc(M.weeksLabel(course.sessions.find(s=>s.id===event.sessionId)?.weeks||[]))}`}</div>`;
    modal('课程详情',info,`<button class="button" data-action="edit-selected">编辑整门课</button>
      ${event.moved?'<button class="button" data-action="restore-occurrence">恢复本次</button>':
        '<button class="button" data-action="cancel-occurrence">本次停课</button><button class="button" data-action="move-occurrence">本次调课</button>'}`);
  }
  function openMove(){
    if(!selectedEvent)return;
    modal('本次调课',`<div class="note">原课：${esc(selectedEvent.date)} 第 ${selectedEvent.start}-${selectedEvent.end} 节</div>
      ${field('新日期',`<input id="move-date" type="date" min="${table.startDate}" max="${M.dateFor(table,table.totalWeeks,7)}" value="${selectedEvent.date}">`)}
      <div class="row">${field('开始节',`<input id="move-start" type="number" min="1" max="${table.periods.length}" value="${selectedEvent.start}">`)}
      ${field('结束节',`<input id="move-end" type="number" min="1" max="${table.periods.length}" value="${selectedEvent.end}">`)}</div>
      ${field('教室',`<input id="move-room" value="${esc(selectedEvent.room)}">`)}<p class="error" id="move-error"></p>`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="save-move">保存</button>');
  }
  function openImport(){
    modal('导入课表',`<div class="section-title">教务系统</div><div class="note">在学校页面自行登录，进入“学生个人课表”后点“提取”。导入前可核对识别结果。</div>
      <button class="button primary fill" data-action="school" style="width:100%">沈阳化工大学</button>
      <div class="section-title">其他学校</div>${field('教务页面网址','<input id="portal-url" type="url" placeholder="https://...">')}
      <button class="button" data-action="custom-portal">打开网页并提取表格</button>
      <div class="section-title">文件</div><div class="row"><button class="button fill" data-action="pick-file">选择 CSV / XLSX / JSON</button>
      <button class="button fill" data-action="template">下载模板</button></div>
      <p class="muted">文件需使用模板列：课程、教师、教室、星期、开始节、结束节、周次。</p>`);
  }
  function previewImport(result,source){
    pendingImport={...result,source};
    let arrangements=result.courses.reduce((n,c)=>n+c.sessions.length,0);
    const trial={...table,courses:table.courses.concat(result.courses)};
    let conflicts=0;for(let w=1;w<=table.totalWeeks;w++)conflicts+=M.conflicts(M.occurrences(trial,w)).size;
    modal('核对导入',`<div class="note">${esc(source)} · ${result.courses.length} 门课 · ${arrangements} 个时段${conflicts?` · ${conflicts} 次时间重叠`:''}</div>
      ${result.issues?.length?`<div class="note warn">${result.issues.slice(0,5).map(esc).join('<br>')}</div>`:''}
      <div class="segmented"><label><input type="radio" name="import-mode" value="new" checked>新课表</label><label><input type="radio" name="import-mode" value="append">追加</label><label><input type="radio" name="import-mode" value="replace">替换</label></div>
      <div class="row" style="margin-top:12px">${field('新课表第一周周一',`<input id="import-date" type="date" value="${esc(table.startDate)}">`)}
      ${field('总周数',`<input id="import-weeks" type="number" min="1" max="30" value="${table.totalWeeks}">`)}</div>
      <div class="course-preview">${result.courses.map(c=>`<div class="preview-item" style="border-left-color:${c.color}"><strong>${esc(c.name)}</strong><span>${esc(c.teacher)} ${esc(c.room)}<br>${c.sessions.map(s=>`周${days[s.day-1]} ${s.start}-${s.end} 节 · ${M.weeksLabel(s.weeks)} 周`).join('<br>')}</span></div>`).join('')}</div>`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="commit-import">导入</button>');
  }
  function openSettings(){
    modal('设置',`${field('课表名称',`<input id="setting-name" value="${esc(table.name)}" maxlength="50">`)}
      <div class="row">${field('第一周周一',`<input id="setting-date" type="date" value="${esc(table.startDate)}">`)}
      ${field('总周数',`<input id="setting-weeks" type="number" min="1" max="30" value="${table.totalWeeks}">`)}</div>
      <button class="button small" data-action="periods">节次时间</button>
      <div class="section-title">提醒</div><div class="option-row"><span>课前提醒</span><input id="reminder-enabled" type="checkbox" ${state.settings.remindersEnabled?'checked':''}></div>
      ${field('提前分钟',`<input id="reminder-minutes" type="number" min="0" max="240" value="${state.settings.reminderMinutes??15}">`)}
      <div class="muted" id="permission-status">${statusText()}</div>
      <div class="row" style="margin-top:10px"><button class="button small" data-action="notification-permission">通知权限</button>
      <button class="button small" data-action="exact-permission">精确提醒权限</button></div>
      <div class="section-title">数据</div><div class="row"><button class="button fill" data-action="backup">导出 JSON</button>
      <button class="button fill" data-action="ics">导出日历</button></div>
      <div class="section-title">应用</div><div class="row"><button class="button fill" data-action="check-update">检查更新</button>
      <button class="button fill" data-action="changelog">更新说明</button></div>
      <p class="version">ClassGrid v1.0.0</p><p class="error" id="settings-error"></p>`,
      '<button class="button fill" data-action="close">取消</button><button class="button primary fill" data-action="save-settings">保存</button>');
  }
  function statusText(){return `${reminderStatus.notifications?'通知权限已开启':'通知权限未开启'} · ${reminderStatus.exact?'精确提醒可用':'按系统允许的时间提醒'}`;}
  function openPeriods(){
    modal('节次时间',`<div class="note">每行一个节次，格式 08:00-08:45。</div>
      ${field('时间表',`<textarea id="period-lines" rows="${Math.min(12,table.periods.length+1)}">${table.periods.map(p=>`${p.start}-${p.end}`).join('\n')}</textarea>`)}<p class="error" id="period-error"></p>`,
      '<button class="button fill" data-action="settings">返回</button><button class="button primary fill" data-action="save-periods">保存</button>');
  }
  function handleAction(action,button){
    if(action==='close'){close();return;} if(action==='close-overlay'){if(button.classList.contains('overlay'))close();return;}
    if(action==='prev'||action==='next'){week+=action==='prev'?-1:1;render();return;}
    if(action==='today'){week=currentWeek();render();return;}
    if(action==='week'){openWeek();return;}
    if(action==='set-week'){week=Math.max(1,Math.min(table.totalWeeks,Number($('#week-input').value)||1));close();render();return;}
    if(action==='manage'){openManage();return;}
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
    if(action==='edit-selected'){const id=selectedEvent?.courseId;openEditor(id);return;}
    if(action==='add-session'){$('#sessions').insertAdjacentHTML('beforeend',sessionMarkup({},$('#sessions').children.length));return;}
    if(action==='remove-session'){if($('#sessions').children.length>1)button.closest('.session').remove();return;}
    if(action==='color'){$$('#color-choice .swatch').forEach(x=>x.classList.remove('selected'));button.classList.add('selected');return;}
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
      table.exceptions.push({id:M.uid(),type:'cancel',courseId:selectedEvent.courseId,sessionId:selectedEvent.sessionId,sourceDate:selectedEvent.date});
      save();close();render();toast('本次课程已标记停课');return;
    }
    if(action==='move-occurrence'){openMove();return;}
    if(action==='restore-occurrence'){
      table.exceptions=table.exceptions.filter(x=>x.id!==selectedEvent?.id);save();close();render();toast('已恢复');return;
    }
    if(action==='save-move'){
      const date=$('#move-date').value,start=Number($('#move-start').value),end=Number($('#move-end').value);
      if(!date||date<table.startDate||date>M.dateFor(table,table.totalWeeks,7)||start<1||end<start||end>table.periods.length){$('#move-error').textContent='请检查日期和节次';return;}
      table.exceptions.push({id:M.uid(),type:'move',courseId:selectedEvent.courseId,sessionId:selectedEvent.sessionId,sourceDate:selectedEvent.date,
        targetDate:date,start,end,room:$('#move-room').value.trim()});save();close();week=M.weekOf(table,date);render();return;
    }
    if(action==='import'){openImport();return;}
    if(action==='school'){if(native)native.openPortal('https://jws.syuct.edu.cn/');else toast('请在安卓应用中打开');return;}
    if(action==='custom-portal'){
      const url=$('#portal-url').value.trim();try{const u=new URL(url);if(u.protocol!=='https:')throw 0;if(native)native.openPortal(url);else toast('请在安卓应用中打开');}
      catch(e){toast('请输入 HTTPS 网址');}return;
    }
    if(action==='pick-file'){if(native)native.pickImport();else toast('请在安卓应用中选择文件');return;}
    if(action==='template'){exportFile('ClassGrid-课程模板.csv','text/csv','\uFEFF'+I.TEMPLATE);return;}
    if(action==='commit-import'){
      if(!pendingImport)return;const mode=$('input[name="import-mode"]:checked')?.value||'new';
      if(mode==='new'){
        const date=$('#import-date').value,weeks=Number($('#import-weeks').value);
        if(!date||M.monday(date)!==date||weeks<1||weeks>30||pendingImport.courses.some(c=>c.sessions.some(s=>s.weeks.some(w=>w>weeks)))){
          toast('请检查第一周周一和总周数');return;
        }
        const t=M.defaultTable();t.name=pendingImport.source+'课表';t.startDate=date;t.totalWeeks=weeks;
        t.courses=pendingImport.courses;state.tables.push(t);state.activeId=t.id;table=t;week=1;
      }
      else if(mode==='replace'){table.courses=pendingImport.courses;table.exceptions=[];}
      else table.courses.push(...pendingImport.courses);
      pendingImport=null;save();close();render();toast('导入完成');return;
    }
    if(action==='settings'){openSettings();return;}
    if(action==='save-settings'){
      const name=$('#setting-name').value.trim(),date=$('#setting-date').value,weeks=Number($('#setting-weeks').value),mins=Number($('#reminder-minutes').value);
      if(!name||!/^\d{4}-\d\d-\d\d$/.test(date)||M.monday(date)!==date||weeks<1||weeks>30||mins<0||mins>240){$('#settings-error').textContent='请检查名称、第一周周一、总周数和提醒时间';return;}
      if(table.courses.some(c=>c.sessions.some(s=>s.weeks.some(w=>w>weeks)))){$('#settings-error').textContent='现有课程超出新的总周数';return;}
      table.name=name;table.startDate=date;table.totalWeeks=weeks;state.settings.remindersEnabled=$('#reminder-enabled').checked;
      state.settings.reminderMinutes=mins;week=Math.min(week,weeks);save();close();render();
      if(state.settings.remindersEnabled&&!reminderStatus.notifications&&native)native.requestReminderPermission();
      toast('设置已保存');return;
    }
    if(action==='periods'){openPeriods();return;}
    if(action==='save-periods'){
      try{const periods=$('#period-lines').value.trim().split('\n').map(line=>{
        const m=line.trim().match(/^(\d\d:\d\d)\s*-\s*(\d\d:\d\d)$/);
        if(!m||m[1]>=m[2])throw Error('格式应为 08:00-08:45');return {start:m[1],end:m[2]};});
        if(periods.length<1||periods.length>20||table.courses.some(c=>c.sessions.some(s=>s.end>periods.length)))throw Error('节次数量与课程不匹配');
        table.periods=periods;save();openSettings();render();toast('节次时间已保存');
      }catch(e){$('#period-error').textContent=e.message;}return;
    }
    if(action==='notification-permission'){if(native)native.requestReminderPermission();return;}
    if(action==='exact-permission'){if(native)native.openExactAlarmSettings();return;}
    if(action==='backup'){exportFile('ClassGrid-backup.json','application/json',JSON.stringify(state,null,2));return;}
    if(action==='ics'){exportFile('ClassGrid-'+table.name+'.ics','text/calendar',M.toIcs(table));return;}
    if(action==='check-update'){if(native)native.checkForUpdates(true);else toast('请在安卓应用中检查更新');return;}
    if(action==='changelog'){modal('更新说明','<div class="listrow"><div><strong>v1.0.0</strong><small>2026-10-21</small></div></div><p>周课表、课程编辑与调课；教务网页和文件导入；提醒、备份和日历导出。</p>');return;}
    if(action==='download-update'){
      if(pendingUpdate&&native)native.downloadUpdate(pendingUpdate.url,pendingUpdate.digest,pendingUpdate.version);return;
    }
    if(action==='restore-backup'){
      if(!pendingImport?.backup)return;state=pendingImport.backup;table=M.activeTable(state);week=currentWeek();pendingImport=null;save();close();render();toast('备份已恢复');return;
    }
  }
  const $$=s=>[...document.querySelectorAll(s)];
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-action]');
    if(target&&!(target.classList.contains('overlay')&&target!==e.target))handleAction(target.dataset.action,target);
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
  window.onExportDone=data=>toast(data.ok?'文件已保存':'导出失败');
  window.onReminderStatus=data=>{reminderStatus=data||reminderStatus;const el=$('#permission-status');if(el)el.textContent=statusText();};
  window.onUpdateCheck=data=>{
    if(data.error){if(data.manual)toast(data.error);return;}
    if(!data.available){if(data.manual)toast('已是最新版本');return;}
    pendingUpdate=data;
    modal(`发现 v${data.version}`,`<div class="note">${esc(data.notes||'新版本已发布')}</div><p class="muted">下载后由安卓系统确认安装。</p>`,
      '<button class="button fill" data-action="close">稍后</button><button class="button primary fill" data-action="download-update">下载更新</button>');
  };
  window.onUpdateProgress=data=>{const el=$('.sheet-body .muted');if(el)el.textContent=`下载中 ${data.percent}%`;};
  window.onUpdateDownload=data=>toast(data.message||'更新结束');
  render();
})();
