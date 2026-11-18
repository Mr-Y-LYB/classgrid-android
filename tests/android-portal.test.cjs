// Uses only the dedicated local emulator. Never selects a physical phone.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const adb=process.env.CLASSGRID_ADB||'E:/Application/youji/.toolchain/sdk/platform-tools/adb.exe';
const serial='emulator-5556',pkg='com.mrylyb.classgrid';
const out=path.resolve(__dirname,'../build/portal-verification');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function a(...args){return execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();}
const report={device:serial,started:new Date().toISOString(),checks:[]};
function pass(text){report.checks.push(text);console.log('PASS',text);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
let socket,seq=0,pending=new Map();const connections=new Set();
async function command(method,params={}){const id=++seq;socket.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);
  pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r);},reject:e=>{clearTimeout(timeout);reject(e);}});
});}
async function js(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function connect(filter="file:///android_asset/"){
  for(let i=0;i<30;i++){
    try{
      const pid=a('shell','pidof',pkg).split(' ')[0];a('forward','tcp:9229','localabstract:webview_devtools_remote_'+pid);
      const targets=await(await fetch('http://127.0.0.1:9229/json')).json();const page=targets.find(t=>t.type==='page'&&t.url.startsWith(filter));
      if(!page){await wait(500);continue;}
      socket=new WebSocket(page.webSocketDebuggerUrl);
      connections.add(socket);
      socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
      await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
      await command('Runtime.enable');if(filter!=="file:///android_asset/"||await js('!!window.CGModel'))return;
    }catch(e){}await wait(500);
  }throw Error('Unable to connect to debug WebView');
}
async function launch(){a('shell','am','start','-n',pkg+'/.MainActivity');await wait(1300);await connect();}
async function replaceState(state){
  assert.equal(await js('Native.saveState('+JSON.stringify(JSON.stringify(state))+')'),true);
  await js('location.reload()');await wait(1000);
}
function stateFor(now,lead=1){
  const state=M.defaultState(),table=state.tables[0];
  const start=Math.ceil(now/60000)*60000+120000;
  const china=ms=>new Date(ms+8*3600000).toISOString();
  const date=china(start).slice(0,10),day=new Date(date+'T12:00:00+08:00').getDay()||7;
  table.startDate=M.monday(date);table.totalWeeks=2;table.name='提醒验证课表';
  table.periods=[{start:china(start).slice(11,16),end:china(start+60000).slice(11,16)},
    {start:china(start+60000).slice(11,16),end:china(start+120000).slice(11,16)}];
  table.courses=[['真实课程 A','A101',1],['同时课程 B','B202',1],['下一门课程 C','C303',2]].map(([name,room,period],i)=>({
    id:'integration-'+i,name,teacher:'',room,color:'#287c88',sessions:[{id:'session-'+i,day,start:period,end:period,weeks:[1],room}]}));
  state.settings.remindersEnabled=true;state.settings.reminderMinutes=lead;
  M.validateState(state);return state;
}
async function pollNotification(names,deadline){
  while(Date.now()<deadline){const dump=a('shell','dumpsys','notification','--noredact');
    if(names.every(name=>dump.includes(name))){fs.writeFileSync(path.join(out,'notifications.txt'),dump);return;}
    await wait(3000);
  }throw Error('Course notification missing: '+names.join(', '));
}

async function main(){
  assert.equal(a('shell','getprop','ro.kernel.qemu'),'1');
  await launch();
  const initial=M.defaultState();initial.tables[0].totalWeeks=2;
  await replaceState(initial);
  await js('Native.openPortal("https://jws.syuct.edu.cn/")');socket.close();await wait(1500);
  await connect('https://jws.syuct.edu.cn/');
  // Fulfil synthetic HTTPS traffic within the test WebView only; no school account is used.
  const fixture=fs.readFileSync(path.join(__dirname,'fixtures/syuct-current.html'),'utf8');
  socket.addEventListener('message',e=>{const message=JSON.parse(e.data);if(message.method==='Fetch.requestPaused'){
    command('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from(fixture).toString('base64')}).catch(console.error);
  }});
  await command('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await command('Page.navigate',{url:'https://jws.syuct.edu.cn/classgrid-synthetic-test'});await wait(1000);
  assert.match(await js('document.body.textContent'),/周一第3,4节\{第1-11周\}/);
  assert.equal(await js('typeof Native'),'undefined','Remote page has no native bridge');pass('Portal WebView has no app native bridge');
  const extracted=JSON.parse(await js(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/portal-extract.js'),'utf8')));
  const dimensions=await js('({viewport:innerWidth,content:document.querySelector("table").scrollWidth})');
  assert.ok(dimensions.content>=1800,'Fixture must reproduce the desktop-width timetable');
  fs.writeFileSync(path.join(out,'actual-wide-portal.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  a('shell','uiautomator','dump','/sdcard/classgrid-portal.xml');
  const xml=a('shell','cat','/sdcard/classgrid-portal.xml');
  const button=xml.match(/<node[^>]*text="提取"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(button,'Native extract button must be visible');
  a('shell','input','tap',String((+button[1]+ +button[3])/2),String((+button[2]+ +button[4])/2));
  await wait(1200);socket.close();await connect();
  assert.equal(await js('document.querySelector(".sheet-head h2")?.textContent'),'核对导入');
  const preview=await js('document.querySelector("#import-course-preview").textContent');assert.match(preview,/电力系统分析基础/);assert.match(preview,/应星楼.*403/);assert.match(preview,/现代控制理论/);
  assert.equal(await js('document.querySelectorAll(".preview-item").length'),5);
  assert.equal(await js('document.querySelector("#import-weeks").value'),'14','Full semester weeks are read independently of the existing two-week table');
  pass('Native extract button executes packaged extractor and parser, then opens correct import preview');
  const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'actual-portal-preview.png'),Buffer.from(shot.data,'base64'));
  await js('document.querySelector("[data-action=commit-import]").click()');await wait(300);
  assert.equal(await js('document.querySelectorAll(".course-card").length'),4);pass('Confirmed screenshot-format portal import persists all five courses');
  await js('document.querySelector(".fab").click()');await wait(250);
  await js('document.querySelector("#c-name").value="安卓返回草稿"');
  a('shell','input','keyevent','4');await wait(400);assert.equal(await js('document.querySelector("#discard-confirm")!==null'),true);
  await js('document.querySelector("[data-action=keep-editing]").click()');assert.equal(await js('document.querySelector("#c-name").value'),'安卓返回草稿');
  pass('Android system Back protects unsaved course draft');
  const aligned=await js('(()=>{const a=document.querySelector("#c-name").getBoundingClientRect(),b=document.querySelector("#color-choice").getBoundingClientRect();return {offset:Math.abs(a.y+a.height/2-b.y-b.height/2),fab:getComputedStyle(document.querySelector(".fab")).visibility,ring:document.querySelector(".sheet").contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}})()');
  assert.ok(aligned.offset<1&&aligned.fab==='hidden'&&aligned.ring,JSON.stringify(aligned));
  pass('Native WebView editor aligns color ring and hides underlying FAB');
  a('shell','settings','put','secure','show_ime_with_hard_keyboard','1');
  const focus=await js('(()=>{const r=document.querySelector("#c-name").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:focus.x,y:focus.y}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(1100);
  const keyboard=a('shell','dumpsys','input_method');assert.match(keyboard,/mInputShown=true|isInputViewShown=true/);
  const keyboardLayout=await js('(()=>{const a=document.querySelector(".sheet-actions").getBoundingClientRect();return {bottom:a.bottom,height:innerHeight,width:innerWidth,overflow:document.querySelector(".sheet-body").scrollWidth>document.querySelector(".sheet-body").clientWidth}})()');
  assert.ok(keyboardLayout.bottom<=keyboardLayout.height+1&&!keyboardLayout.overflow,JSON.stringify(keyboardLayout));
  fs.writeFileSync(path.join(out,'actual-editor-keyboard.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  pass('Actual Android soft keyboard opens with editor actions in view and no horizontal overflow');
  a('shell','input','keyevent','4');
  await js('window.onBackRequested()');await wait(200);await js('document.querySelector("[data-action=discard-changes]").click()');await wait(250);
  await js('document.querySelector("#theme-switch").click();document.querySelector(".bottom [data-action=import]").click()');
  await js('window.onPortalData('+JSON.stringify(extracted)+')');await wait(300);
  const tap=async selector=>{const p=await js('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(250);};
  await tap('#import-week-mode + .md-control-trigger');
  assert.equal(await js('document.querySelectorAll("#control-picker .md-choice").length'),4);
  assert.equal(await js('getComputedStyle(document.querySelector(".md-picker-dialog")).backgroundColor'),'rgb(27, 32, 40)');
  fs.writeFileSync(path.join(out,'actual-material-weeks-dark.png'),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await tap('#control-picker [data-choice="3"]');assert.equal(await js('document.querySelector("#import-week-mode").value'),'even');
  assert.match(await js('document.querySelector("#import-course-preview").textContent'),/2-14双/);
  await tap('#import-week-mode + .md-control-trigger');a('shell','input','keyevent','4');await wait(250);
  assert.equal(await js('document.querySelector("#control-picker:not(.picker-closing)")'),null);
  assert.equal(await js('document.querySelector(".sheet-head h2").textContent'),'核对导入');
  pass('Actual Android touch opens a dark Material week picker, writes selection and Back preserves import preview');
  report.completed=new Date().toISOString();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
}
main().catch(e=>{report.error=e.stack;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;}).finally(()=>{for(const connection of connections)connection.close();try{a('forward','--remove','tcp:9229');}catch(e){}});
