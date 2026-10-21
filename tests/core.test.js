const assert=require('node:assert/strict');
const M=require('../app/src/main/assets/model.js');
const I=require('../app/src/main/assets/import.js');

const t=M.defaultTable();
t.startDate='2026-09-21';
t.totalWeeks=16;
assert.deepEqual(M.parseWeeks('1-8单,10,12',16),[1,3,5,7,10,12]);
assert.deepEqual(M.parseWeeks('2-8双',16),[2,4,6,8]);
assert.equal(M.weekOf(t,'2026-10-05'),3);
assert.equal(M.dateFor(t,3,5),'2026-10-09');
const course={id:'c1',name:'电力系统分析基础',teacher:'张老师',room:'403',color:'#477F8B',
  sessions:[{id:'s1',day:1,start:1,end:2,weeks:M.parseWeeks('1-11单',16)}]};
t.courses=[course];
assert.equal(M.occurrences(t,1).length,1);
assert.equal(M.occurrences(t,2).length,0);
assert.equal(M.occurrences(t,3)[0].date,'2026-10-05');
t.exceptions.push({id:'x1',type:'cancel',courseId:'c1',sessionId:'s1',sourceDate:'2026-09-21'});
assert.equal(M.occurrences(t,1).length,0);
t.exceptions.push({id:'x2',type:'move',courseId:'c1',sessionId:'s1',sourceDate:'2026-10-05',targetDate:'2026-10-06',start:3,end:4,room:'204'});
assert.equal(M.occurrences(t,3)[0].room,'204');
assert.equal(M.occurrences(t,3)[0].day,2);
const state={schema:1,activeId:t.id,tables:[t],settings:{remindersEnabled:true,reminderMinutes:15}};
assert.equal(M.validateState(JSON.parse(JSON.stringify(state))).tables.length,1);
const ics=M.toIcs(t);
assert.match(ics,/BEGIN:VCALENDAR/);
assert.match(ics,/SUMMARY:电力系统分析基础/);
assert.match(ics,/DTSTART:20261006T020000Z/);
assert.doesNotMatch(ics,/DTSTART:20260921/);

const csv='课程,教师,教室,星期,开始节,结束节,周次\n"大学,英语",李老师,B202,三,3,4,1-12双\n';
const imported=I.parseCsvCourses(csv,16);
assert.equal(imported.courses[0].name,'大学,英语');
assert.deepEqual(imported.courses[0].sessions[0].weeks,[2,4,6,8,10,12]);

// Same merged weekday/period structure shown in the user's university screenshot.
const cell=(text,rowSpan=1,colSpan=1)=>({text,rowSpan,colSpan});
const portal={tables:[{rows:[
  [cell('时间'),cell('星 期 一'),cell('星期二'),cell('星期三'),cell('星期四'),cell('星期五'),cell('星期六'),cell('星期日')],
  [cell('第1节'),cell('电力系统分析基础\n必修\n2节/单周(1-11)\n张老师\n403',2),cell('电机拖动基础\n必修\n2节/单周(1-12)\n李老师\n106'),cell(''),cell(''),cell(''),cell(''),cell('')],
  [cell('第2节'),cell('电力电子技术\n必修\n2节/双周(1-11)\n王老师\n202'),cell(''),cell(''),cell(''),cell(''),cell('')]
]}]};
const parsed=I.parsePortal(portal,16);
assert.equal(parsed.courses.length,3);
const sessions=parsed.courses.flatMap(c=>c.sessions.map(s=>({name:c.name,...s})));
assert.deepEqual(sessions.find(s=>s.name==='电力系统分析基础').weeks,[1,3,5,7,9,11]);
assert.equal(sessions.find(s=>s.name==='电力电子技术').start,2);
assert.equal(sessions.find(s=>s.name==='电力电子技术').day,2);
console.log('ClassGrid core tests passed');
