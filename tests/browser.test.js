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
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
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
  await command('Page.navigate',{url:'file:///'+path.join(root,'app/src/main/assets/index.html').replace(/\\/g,'/')});
  await wait(1200);
  assert.equal(await evaluate('window.innerWidth'),390);
  assert.equal(await evaluate('document.querySelectorAll(".weekday-row .day").length'),7);
  const box=await evaluate('({page:document.documentElement.scrollWidth,view:innerWidth})');
  assert.ok(box.page<=box.view,`Horizontal overflow ${JSON.stringify(box)}`);
  await evaluate('document.querySelector("[data-action=add]").click()');
  assert.equal(await evaluate('document.querySelector(".sheet-head h2").textContent'),'添加课程');
  await evaluate('document.querySelector("#c-name").value="测试高等数学";document.querySelector("#c-room").value="A101";document.querySelector("[data-action=save-course]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".course-card").length'),1);
  assert.match(await evaluate('document.querySelector(".course-card").textContent'),/测试高等数学/);
  await evaluate('document.querySelector(".course-card").click()');
  assert.equal(await evaluate('document.querySelector(".sheet-head h2").textContent'),'课程详情');
  await evaluate('document.querySelector("[data-action=cancel-occurrence]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".course-card").length'),0);
  await evaluate('document.querySelector("[data-action=import]").click()');
  await evaluate('window.onFileImported({name:"courses.csv",text:"课程,教师,教室,星期,开始节,结束节,周次\\n大学英语,李老师,B202,三,3,4,1-12单\\n"})');
  assert.equal(await evaluate('document.querySelector(".sheet-head h2").textContent'),'核对导入');
  assert.equal(await evaluate('document.querySelectorAll("input[value=append]").length'),1);
  assert.equal(await evaluate('document.querySelectorAll("[data-action=commit-import]").length'),1);
  await evaluate('document.querySelector("input[value=append]").click()');
  await evaluate('document.querySelector("[data-action=commit-import]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".course-card").length'),1);
  await evaluate('document.querySelector("[data-action=settings]").click()');
  assert.ok(await evaluate('document.querySelector("#setting-date")!==null'));
  const shot=await command('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(root,'dist','ui-phone.png'),Buffer.from(shot.data,'base64'));
  assert.deepEqual(errors,[]);
  console.log('ClassGrid browser test passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(socket)socket.close();browser.kill();});
