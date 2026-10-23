// Uses only the dedicated local emulator. Never selects a physical phone.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const adb=process.env.CLASSGRID_ADB||'E:/Application/youji/.toolchain/sdk/platform-tools/adb.exe';
const serial='emulator-5556',pkg='com.mrylyb.classgrid';
const out=path.resolve(__dirname,'../build/reminder-verification');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function a(...args){return execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();}
const report={device:serial,started:new Date().toISOString(),checks:[]};
function pass(text){report.checks.push(text);console.log('PASS',text);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
let socket,seq=0,pending=new Map();
async function command(method,params={}){const id=++seq;socket.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);
  pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r);},reject:e=>{clearTimeout(timeout);reject(e);}});
});}
async function js(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function connect(){
  for(let i=0;i<30;i++){
    try{
      const pid=a('shell','pidof',pkg).split(' ')[0];a('forward','tcp:9229','localabstract:webview_devtools_remote_'+pid);
      const targets=await(await fetch('http://127.0.0.1:9229/json')).json();const page=targets.find(t=>t.type==='page');
      if(!page){await wait(500);continue;}
      socket=new WebSocket(page.webSocketDebuggerUrl);
      socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
      await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
      await command('Runtime.enable');if(await js('!!window.CGModel'))return;
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
  assert.equal(a('shell','getprop','ro.kernel.qemu'),'1','Test must run on an emulator');
  report.android=a('shell','getprop','ro.build.version.release');
  a('shell','pm','clear',pkg);
  a('shell','pm','grant',pkg,'android.permission.POST_NOTIFICATIONS');
  a('shell','appops','set',pkg,'SCHEDULE_EXACT_ALARM','allow');
  await launch();
  // Open the actual bridge from the actual settings button, even when permission is already granted.
  await js('document.querySelector("[data-action=settings]").click();document.querySelector("[data-tab=reminder]").click()');
  // The action name is checked below rather than allowing an absent button to silently pass.
  const permissionAction=await js('Array.from(document.querySelectorAll(".permission-actions button")).find(b=>b.textContent.includes("通知权限"))?.dataset.action');
  assert.ok(permissionAction);await js('document.querySelector("[data-action='+permissionAction+']").click()');
  await wait(700);
  const activity=a('shell','dumpsys','activity','activities');
  assert.match(activity,/NotificationSettings|AppNotificationSettings/);pass('Granted notification button opens Android notification settings');
  a('shell','input','keyevent','4');await wait(500);
  const now=Number(a('shell','date','+%s'))*1000,state=stateFor(now);
  await replaceState(state);
  // Explicit save uses the same JS model -> native persistence -> AlarmManager path as the user.
  await js('document.querySelector("[data-action=settings]").click();document.querySelector("[data-tab=reminder]").click();document.querySelector("[data-action=save-settings]").click()');
  await wait(500);
  fs.writeFileSync(path.join(out,'state.json'),JSON.stringify(state,null,2));
  const payload=JSON.parse(a('shell','run-as',pkg,'cat','files/reminders.json'));
  assert.equal(payload.events.length,3);assert.equal(payload.minutes,1);
  const alarms=a('shell','dumpsys','alarm');fs.writeFileSync(path.join(out,'alarms-before.txt'),alarms);
  assert.match(alarms,/com\.mrylyb\.classgrid\.NEXT_COURSE/);pass('Saved real courses reach the native alarm queue');
  socket.close();socket=null;
  a('shell','input','keyevent','187');await wait(900);
  a('shell','screencap','-p','/sdcard/classgrid-recents-before.png');a('pull','/sdcard/classgrid-recents-before.png',path.join(out,'recents-before-swipe.png'));
  a('shell','input','touchscreen','swipe','800','1200','800','100','220');await wait(900);
  if(/\* Recent[^\n]*com\.mrylyb\.classgrid/.test(a('shell','dumpsys','activity','recents'))){
    a('shell','uiautomator','dump','/sdcard/classgrid-recents.xml');
    const xml=a('shell','cat','/sdcard/classgrid-recents.xml');
    const clear=xml.match(/<node[^>]*resource-id="[^"]*:id\/clear_all"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(clear,'Recent tasks clear button must be visible');
    a('shell','input','tap',String(Math.round((+clear[1]+ +clear[3])/2)),String(Math.round((+clear[2]+ +clear[4])/2)));await wait(900);
  }
  const recent=a('shell','dumpsys','activity','recents');fs.writeFileSync(path.join(out,'recents-after-swipe.txt'),recent);
  assert.doesNotMatch(recent,/\* Recent[^\n]*com\.mrylyb\.classgrid/,'ClassGrid must be removed from recent tasks');
  assert.match(a('shell','dumpsys','package',pkg),/stopped=false/);
  a('shell','am','kill',pkg);
  let pid='';try{pid=a('shell','pidof',pkg).split(' ')[0];}catch(e){}
  if(pid){a('shell','run-as',pkg,'kill','-9',pid);await wait(300);}
  let remaining='';try{remaining=a('shell','pidof',pkg);}catch(e){}
  assert.equal(remaining,'','App process must be gone before the reminder');
  pass('ClassGrid removed through recent-task controls without force-stop');
  a('shell','dumpsys','battery','unplug');a('shell','input','keyevent','223');
  const idle=a('shell','dumpsys','deviceidle','force-idle');assert.match(idle,/idle/i);
  fs.writeFileSync(path.join(out,'device-idle.txt'),a('shell','dumpsys','deviceidle'));
  const first=payload.events[0].at-60000;
  console.log('Waiting for real course alarm',new Date(first).toISOString());
  await pollNotification(['真实课程 A','同时课程 B'],first+45000);
  pass('Two real courses notify after clearing the recent task, in Doze, without reopening the app');
  a('shell','dumpsys','deviceidle','unforce');a('shell','dumpsys','battery','reset');a('shell','input','keyevent','224');
  await pollNotification(['下一门课程 C'],first+105000);
  pass('Next course is scheduled and delivered after the first alarm');
  await launch();
  const before=a('shell','run-as',pkg,'cat','shared_prefs/alarms.xml');
  await js('document.querySelector("[data-action=settings]").click();document.querySelector("[data-tab=reminder]").click()');await wait(300);
  assert.match(await js('document.querySelector("#permission-status").textContent'),/最近发送/);
  const screenshot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'actual-reminder-status.png'),Buffer.from(screenshot.data,'base64'));
  await js('document.querySelector("[data-action=save-settings]").click()');await wait(1600);
  const after=a('shell','run-as',pkg,'cat','shared_prefs/alarms.xml');
  assert.equal(after.match(/name="lastAt" value="(\d+)"/)[1],before.match(/name="lastAt" value="(\d+)"/)[1]);
  pass('Saving and reopening do not resend already delivered courses');
  // Use a valid course whose requested reminder time has just passed, as after a delayed wake-up.
  const late=stateFor(Number(a('shell','date','+%s'))*1000,3);late.tables[0].courses=late.tables[0].courses.slice(0,1);
  late.tables[0].courses[0].id='late-course';late.tables[0].courses[0].name='恢复后的课程提醒';
  await replaceState(late);await pollNotification(['恢复后的课程提醒'],Date.now()+85000);
  pass('An overdue but not expired course is recovered instead of discarded on resume');
  report.completed=new Date().toISOString();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
}
main().catch(e=>{report.error=e.stack;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;}).finally(()=>{
  if(socket)socket.close();try{a('shell','dumpsys','deviceidle','unforce');a('shell','dumpsys','battery','reset');a('forward','--remove','tcp:9229');}catch(e){}
});
