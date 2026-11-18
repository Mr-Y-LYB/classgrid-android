const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const root=path.resolve(__dirname,'..');
const profile=path.join(root,'build',`browser-profile-${process.pid}-${Date.now()}`);
const browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let socket,id=0,pending=new Map(),errors=[];
async function command(method,params={}){const key=++id;socket.send(JSON.stringify({id:key,method,params}));return new Promise((resolve,reject)=>pending.set(key,{resolve,reject}));}
async function evaluate(expression,settle=true){
  // User actions wait for a dismissing sheet; dedicated rapid-tap tests bypass this.
  if(settle&&expression.includes('.click()'))await command('Runtime.evaluate',{expression:'new Promise(resolve=>{if(document.querySelector(".overlay.closing"))setTimeout(resolve,220);else resolve()})',awaitPromise:true});
  const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function checkCardAlignment(){
  const cards=await evaluate(`Array.from(document.querySelectorAll('.course-card')).map(card=>{
    const slot=Array.from(document.querySelectorAll('.slot')).find(s=>Number(s.style.gridColumn)===Number(card.dataset.day)+1);
    const c=card.getBoundingClientRect(),s=slot.getBoundingClientRect();
    return {day:card.dataset.day,left:c.left-s.left,right:s.right-c.right,width:c.width,slotWidth:s.width};
  })`);
  assert.ok(cards.length>0);
  for(const card of cards)assert.ok(card.left>=1&&card.right>=1&&card.width<=card.slotWidth-2,`Course card misaligned: ${JSON.stringify(card)}`);
}
async function main(){
  let port;for(let n=0;n<60;n++){
    try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port)break;}catch(e){}await wait(200);
  }
  if(!port)throw Error('Edge CDP did not start');
  const pages=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page=pages.find(x=>x.type==='page');if(!page)throw Error('No page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message',ev=>{
    const msg=JSON.parse(ev.data);
    if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}}
    if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);
  });
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  await command('Runtime.enable');await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});

  const appUrl='file:///'+path.join(root,'app/src/main/assets/index.html').replace(/\\/g,'/');
  const M=require('../app/src/main/assets/model.js'),I=require('../app/src/main/assets/import.js');
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});
  const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await wait(230);};
  const back=async()=>{await evaluate('window.onBackRequested()');await wait(230);};
  const shot=async name=>{await wait(250);fs.writeFileSync(path.join(root,'dist',name+'.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));};
  await command('Page.navigate',{url:appUrl});await wait(700);
  const state=M.defaultState(),t=state.tables[0];t.name='大三上课表';t.startDate=M.monday(M.todayDate());
  t.courses=[['习近平新时代中国特色社会主义思想概论','通明楼234',1,3,'#5269ab'],['电力系统分析基础','应星楼403',2,1,'#287c88'],['现代控制理论','通明楼132',4,3,'#8b67a2'],['电机拖动基础','应星楼106',5,7,'#b76f4b']].map(([name,room,day,start,color],i)=>({id:'sample-'+i,name,room,teacher:'教师',color,sessions:[{id:'s-'+i,day,start,end:start+1,weeks:i===1?[1,3,5,7,9,11]:Array.from({length:16},(_,j)=>j+1),room}]}));
  await evaluate('localStorage.setItem("classgrid-state",'+JSON.stringify(JSON.stringify(state))+');location.reload()');await wait(500);
  assert.equal(await evaluate('document.querySelectorAll(".bottom .navbtn").length'),3);
  assert.equal(await evaluate('document.querySelectorAll(".sheet-close").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".fab").length'),1);
  await checkCardAlignment();await shot('v211-home-light');
  await click('.course-card:has(.week-badge)');
  assert.match(await evaluate('document.querySelector("#modal-root .muted").textContent'),/第 1、3、5、7、9、11 周/);
  await shot('v211-course-detail');await back();
  await click('[data-action=import]');
  assert.equal(await evaluate('document.querySelector("#page-root").hidden'),false);
  assert.equal(await evaluate('document.querySelector(".overlay")'),null);
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".import-page .source-copy strong")).map(x=>x.textContent)'),['沈阳化工大学','其他学校网页','选择课表文件']);
  await shot('v211-import-light');
  assert.ok(await evaluate('document.querySelector(".template-download").getBoundingClientRect().height>=44'));
  assert.equal(await evaluate('document.querySelector(".template-copy strong").textContent'),'CSV 模板');
  await click('[data-action=other-school]');assert.ok(await evaluate('!!document.querySelector("#portal-url")'));
  await evaluate('document.querySelector("#portal-url").value="https://school.example"');
  await back();assert.ok(await evaluate('!!document.querySelector("#discard-confirm")'));
  await click('[data-action=keep-editing]');assert.equal(await evaluate('document.querySelector("#portal-url").value'),'https://school.example');
  await back();await click('[data-action=discard-changes]');
  await click('[data-action=settings]');await shot('v211-settings-light');
  await evaluate('document.querySelector("#setting-name").value="未保存课表"');await click('[data-action=import]');
  assert.ok(await evaluate('!!document.querySelector("#discard-confirm")'));await click('[data-action=keep-editing]');
  assert.equal(await evaluate('document.querySelector("#setting-name").value'),'未保存课表');
  await click('[data-tab=data]');await click('[data-action=changelog]');await back();
  assert.equal(await evaluate('!!document.querySelector("#discard-confirm")'),false,'Closing a read-only subpage preserves underlying settings draft');
  await click('[data-action=import]');await click('[data-action=discard-changes]');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("classgrid-state")).tables[0].name'),'大三上课表');
  await click('[data-action=home]');await click('[data-action=add]');
  for(const width of [320,390,430]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    const layout=await evaluate('(()=>{const a=document.querySelector("#c-name").getBoundingClientRect(),b=document.querySelector("#color-choice").getBoundingClientRect(),fab=document.querySelector(".fab"),sheet=document.querySelector(".sheet"),body=document.querySelector("#modal-root .sheet-body");return {centers:Math.abs((a.top+a.height/2)-(b.top+b.height/2)),ring:b.width,input:a.height,fab:getComputedStyle(fab).visibility,overflow:body.scrollWidth>body.clientWidth,topmost:sheet.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}})()');
    assert.ok(layout.centers<=1&&layout.ring===48&&layout.input===60&&!layout.overflow&&layout.topmost&&layout.fab==='hidden',JSON.stringify(layout));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await shot('v211-editor-material-light');
  assert.equal(await evaluate('document.querySelector(".sheet-head .sheet-back").hidden'),true);
  await evaluate('document.querySelector("#c-name").value="双教室课程";document.querySelector(".s-room").value="A106"');
  await click('[data-action=add-session]');await evaluate('document.querySelectorAll(".s-room")[1].value="B403";document.querySelectorAll(".s-day")[1].value="7";document.querySelectorAll(".s-start")[1].value="9";document.querySelectorAll(".s-end")[1].value="10"');
  await click('[data-action=color-custom]');await shot('v211-color');
  const alignment=await evaluate('(()=>{const a=document.querySelector("#color-preview").getBoundingClientRect(),b=document.querySelector("#color-hex").getBoundingClientRect();return Math.abs(a.bottom-b.bottom)})()');assert.ok(alignment<1);
  await back();assert.equal(await evaluate('document.querySelector("#c-name").value'),'双教室课程');
  await back();await click('[data-action=keep-editing]');await shot('v211-editor');
  await click('[data-action=save-course]');
  const saved=await evaluate('JSON.parse(localStorage.getItem("classgrid-state")).tables[0].courses.find(c=>c.name==="双教室课程")');
  assert.ok(saved,JSON.stringify(await evaluate('({toast:document.querySelector("#toast").textContent,error:document.querySelector("#course-error")?.textContent,title:document.querySelector(".sheet-head h2")?.textContent,name:document.querySelector("#c-name")?.value})')));assert.deepEqual(saved.sessions.map(s=>s.room),['A106','B403']);
  // Draft dismissal via the drag header, then retaining the exact DOM inputs.
  await click('[data-action=add]');await evaluate('document.querySelector("#c-name").value="手势草稿"');
  const point=await evaluate('(()=>{const r=document.querySelector(".sheet-head").getBoundingClientRect();return {x:r.x+100,y:r.y+22}})()');
  await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y+100,button:'left',buttons:1});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y+100,button:'left',clickCount:1});
  assert.ok(await evaluate('!!document.querySelector("#discard-confirm")'));await click('[data-action=keep-editing]');
  assert.equal(await evaluate('document.querySelector("#c-name").value'),'手势草稿');await back();await click('[data-action=discard-changes]');
  await click('[data-action=settings]');await click('[data-tab=reminder]');
  await evaluate('document.querySelector("#reminder-enabled").checked=true;document.querySelector("[data-action=save-settings]").click()');await wait(250);
  await evaluate('window.onReminderStatus({notifications:true,exact:true,scheduled:3,nextAt:Date.now()+60000,nextTitle:"电力系统分析基础",lastAt:Date.now()-60000,lastTitle:"大学英语",error:""})');
  await shot('v211-reminder');assert.match(await evaluate('document.querySelector("#permission-status").textContent'),/下次.*电力系统分析基础\n最近发送/);
  await click('[data-tab=table]');await click('[data-action=periods]');
  await evaluate('document.querySelector(".period-row .period-end").value="08:50"');
  await back();assert.ok(await evaluate('!!document.querySelector("#discard-confirm")'));await click('[data-action=keep-editing]');
  await click('[data-action=save-periods]');assert.equal(await evaluate('JSON.parse(localStorage.getItem("classgrid-state")).tables[0].periods[0].end'),'08:50');
  await click('[data-tab=data]');await click('[data-action=changelog]');assert.equal(await evaluate('document.querySelector(".changelog-entry strong").textContent'),'v2.1.1');await back();
  await click('[data-action=home]');await click('#theme-switch');await shot('v211-home-dark');
  await click('[data-action=add]');await shot('v211-editor-material-dark');await back();
  await click('[data-action=import]');await shot('v211-import-dark');await click('[data-action=settings]');await shot('v211-settings-dark');
  for(const width of [320,390,430]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    for(const action of ['home','import','settings']){
      await click('[data-action='+action+']');
      const box=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,nav:document.querySelector(".bottom").getBoundingClientRect().bottom})');
      assert.ok(box.scroll<=box.width&&box.nav<=844,JSON.stringify({width,action,box}));
      const centers=await evaluate('Array.from(document.querySelectorAll(".bottom .navbtn")).map(b=>{const r=b.getBoundingClientRect();return r.left+r.width/2})');
      assert.ok(Math.abs(centers[1]-width/2)<1,'Middle navigation item must be centered');
      assert.ok(Math.abs(centers[0]-(width-centers[2]))<1,'Navigation items must be symmetric');
    }
  }
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:560,deviceScaleFactor:1,mobile:true});
  await evaluate('document.documentElement.style.fontSize="18px"');
  assert.ok(await evaluate('document.querySelector(".page-actions").getBoundingClientRect().bottom<=560'));
  await evaluate('document.documentElement.style.fontSize=""');await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('[data-action=home]');await click('#theme-switch');
  await click('[data-action=add]');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".sheet")).animationName'),'none');await back();
  await command('Emulation.setEmulatedMedia',{features:[]});
  // All local control popups use the same Material layer and preserve parent drafts.
  await click('[data-action=add]');
  await click('.s-day + .md-control-trigger');assert.equal(await evaluate('document.querySelectorAll("#control-picker .md-choice").length'),7);
  await click('#control-picker [data-choice="4"]');assert.equal(await evaluate('document.querySelector(".s-day").value'),'5');
  await click('.s-week-mode + .md-control-trigger');await shot('v211-picker-course-weeks-light');
  await evaluate('window.onBackRequested()');await wait(200);
  assert.ok(await evaluate('!!document.querySelector("#course-form")'));
  await back();await click('[data-action=discard-changes]');
  await click('[data-action=settings]');await click('[data-tab=table]');await click('#setting-date + .md-control-trigger');await shot('v211-picker-date-light');
  await click('[data-picker=months]');assert.equal(await evaluate('document.querySelectorAll(".md-month-grid button").length'),12);
  await click('#control-picker [data-month="10"]');await evaluate('window.onBackRequested()');await wait(200);
  await click('[data-action=periods]');await click('#period-rows .period-start + .md-control-trigger');await shot('v211-picker-time-light');
  await evaluate('document.querySelector("#md-time-hour").value="25"');await click('[data-picker=apply-time]');
  assert.match(await evaluate('document.querySelector("#md-time-error").textContent'),/0–23/);
  await evaluate('document.querySelector("#md-time-hour").value="07";document.querySelector("#md-time-minute").value="55"');await click('[data-picker=apply-time]');
  assert.equal(await evaluate('document.querySelector("#period-rows .period-start").value'),'07:55');
  await click('[data-action=save-periods]');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("classgrid-state")).tables.find(t=>t.id===JSON.parse(localStorage.getItem("classgrid-state")).activeId).periods[0].start'),'07:55');
  await click('[data-action=home]');
  // Exercise the exact extraction script shipped to Android against real DOM/iframe fixtures.
  const extractor=fs.readFileSync(path.join(root,'app/src/main/assets/portal-extract.js'),'utf8');
  const cell='电机拖动基础<br>必修<br>２节／单周（１－１２）<br>李老师<br>应星楼106';
  const html='<table><tr><th>时间</th><th>周一</th><th>礼拜二</th><th>星期三</th></tr><tr><th>第１－２节</th><td rowspan="2">'+cell+'</td><td>高等数学<br>选修<br>2节/周(1-12)<br>王老师<br>B202</td><td>未识别格式</td></tr><tr><th>第3节</th><td></td><td></td></tr></table>';
  await command('Page.navigate',{url:'about:blank'});await wait(100);
  await evaluate('document.body.innerHTML='+JSON.stringify('<iframe id="nested"></iframe><iframe src="https://example.invalid/timetable"></iframe>')+';document.querySelector("#nested").srcdoc='+JSON.stringify(html));await wait(700);
  const payload=JSON.parse(await evaluate(extractor));assert.equal(payload.tables.length,1);
  assert.equal(payload.diagnostics.documents,2);assert.equal(payload.diagnostics.frames.length,1);
  const parsed=I.parsePortal(payload,16);assert.equal(parsed.courses.length,2);
  assert.deepEqual(parsed.courses.find(c=>c.name==='电机拖动基础').sessions[0].weeks,[1,3,5,7,9,11]);
  assert.ok(parsed.issues.some(x=>x.includes('未识别内容')));assert.ok(parsed.issues.some(x=>x.includes('嵌套页面')));
  const currentHtml=fs.readFileSync(path.join(root,'tests/fixtures/syuct-current.html'),'utf8');
  await evaluate('document.body.innerHTML='+JSON.stringify(currentHtml));
  const currentPayload=JSON.parse(await evaluate(extractor)),currentParsed=I.parsePortal(currentPayload,30);
  assert.equal(currentParsed.courses.length,5);
  assert.deepEqual(currentParsed.courses.find(c=>c.name==='电力系统分析基础').sessions[0].weeks,[1,2,3,4,5,6,7,8,9,10,11]);
  assert.equal(currentParsed.courses.find(c=>c.name==='现代控制理论').sessions[0].day,4,'Offscreen Thursday course must be collected');
  assert.equal(currentParsed.courses.find(c=>c.name==='大学英语').sessions[0].room,'B202');
  await evaluate('document.body.innerHTML="<input type=password>"');assert.equal(JSON.parse(await evaluate(extractor)).diagnostics.status,'login');
  await command('Page.navigate',{url:appUrl});await wait(500);await click('[data-action=import]');
  await evaluate('window.onPortalData('+JSON.stringify(currentPayload)+')');await wait(250);
  assert.equal(await evaluate('document.querySelector(".sheet-head h2").textContent'),'核对导入');
  assert.equal(await evaluate('document.querySelectorAll(".preview-item").length'),5);await shot('v211-import-preview');
  await click('#import-week-mode + .md-control-trigger');await shot('v211-picker-import-weeks-light');
  assert.equal(await evaluate('document.querySelector("#import-week-mode").hidden'),true);
  await click('#control-picker [data-choice="2"]');assert.equal(await evaluate('document.querySelector("#import-week-mode").value'),'odd');
  assert.match(await evaluate('document.querySelector("#import-course-preview").textContent'),/1-19单/);
  await click('#import-week-mode + .md-control-trigger');await click('#control-picker [data-choice="0"]');
  // Theme change while the preview is open tests the popup's independent semantic colors.
  await evaluate('document.documentElement.dataset.theme="dark"');await click('#import-week-mode + .md-control-trigger');await shot('v211-picker-import-weeks-dark');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".md-picker-dialog")).backgroundColor'),'rgb(27, 32, 40)');
  for(const width of [320,430]){await command('Emulation.setDeviceMetricsOverride',{width,height:640,deviceScaleFactor:1,mobile:true});
    assert.ok(await evaluate('(()=>{const r=document.querySelector(".md-picker-dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()'));
  }
  await evaluate('window.onBackRequested()');await wait(200);await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('document.documentElement.dataset.theme="light"');
  await click('[data-action=commit-import]');assert.equal(await evaluate('document.querySelectorAll(".course-card").length'),4);
  await checkCardAlignment();
  const backup=await evaluate('localStorage.getItem("classgrid-state")');
  await evaluate('window.onFileImported({name:"backup.json",text:'+JSON.stringify(backup)+'})');await click('[data-action=restore-backup]');
  assert.deepEqual(JSON.parse(await evaluate('localStorage.getItem("classgrid-state")')),JSON.parse(backup));
  await evaluate('window.onUpdateCheck({available:true,version:"2.1.2",notes:"- 测试公告",size:1040000,url:"https://github.com/Mr-Y-LYB/classgrid-android/releases/download/v2.1.2/ClassGrid-v2.1.2.apk",digest:"sha256:'+ 'a'.repeat(64)+'"})');await wait(250);await shot('v211-update');
  assert.equal(await evaluate('document.querySelectorAll(".sheet-close").length'),0);
  assert.deepEqual(errors,[]);console.log('ClassGrid Material UI and portal extraction tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(socket)socket.close();browser.kill();});
