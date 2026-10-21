(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CGModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCHEMA=1;
  const COLORS=['#477F8B','#5C70A9','#B77B5B','#658B70','#9475A0','#B08E49','#527A9C','#A26875'];
  const DEFAULT_PERIODS=[['08:00','08:45'],['08:55','09:40'],['10:00','10:45'],['10:55','11:40'],['13:30','14:15'],['14:25','15:10'],['15:30','16:15'],['16:25','17:10'],['18:30','19:15'],['19:25','20:10'],['20:20','21:05'],['21:15','22:00']];
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const pad=n=>String(n).padStart(2,'0');
  function todayDate(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function monday(date){const d=new Date(`${date}T12:00:00`);if(Number.isNaN(+d))throw Error('日期无效');d.setDate(d.getDate()-(d.getDay()+6)%7);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function dateAdd(date,days){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function weekOf(table,date){return Math.floor((new Date(`${date}T12:00:00`)-new Date(`${table.startDate}T12:00:00`))/604800000)+1;}
  function dateFor(table,week,day){return dateAdd(table.startDate,(week-1)*7+day-1);}
  function defaultTable(){return {id:uid(),name:'我的课表',startDate:monday(todayDate()),totalWeeks:20,periods:DEFAULT_PERIODS.map(x=>({start:x[0],end:x[1]})),courses:[],exceptions:[],background:'',backgroundFade:58};}
  function defaultState(){const table=defaultTable();return {schema:SCHEMA,activeId:table.id,tables:[table],settings:{remindersEnabled:false,reminderMinutes:15}};}
  function parseWeeks(input,maxWeeks=30){
    const result=new Set();let source=String(input||'').trim();
    if(!source)throw Error('请填写周次');
    source=source.replace(/第|周次/g,'').replace(/[，、；;]+/g,',').replace(/[～~—–至到]/g,'-');
    for(const raw of source.split(',').map(x=>x.trim()).filter(Boolean)){
      const parity=/单|odd/i.test(raw)?1:/双|even/i.test(raw)?0:null;
      const match=raw.match(/(\d{1,2})(?:\s*-\s*(\d{1,2}))?/);
      if(!match)throw Error(`无法识别周次：${raw}`);
      const start=Number(match[1]),end=match[2]?Number(match[2]):start;
      if(start<1||end<start||end>maxWeeks)throw Error(`周次应在 1-${maxWeeks} 周内`);
      for(let w=start;w<=end;w++)if(parity===null||w%2===parity)result.add(w);
    }
    if(!result.size)throw Error('周次为空');
    return [...result].sort((a,b)=>a-b);
  }
  function weeksLabel(weeks){
    const ws=[...new Set((weeks||[]).map(Number))].sort((a,b)=>a-b);if(!ws.length)return '';
    if(ws.length>=3&&ws.every((v,i)=>i===0||v-ws[i-1]===2))return `${ws[0]}-${ws[ws.length-1]}${ws[0]%2?'单':'双'}`;
    if(ws.length>=3&&ws.every((v,i)=>i===0||v-ws[i-1]===1))return `${ws[0]}-${ws[ws.length-1]}`;
    return ws.join(',');
  }
  function validateState(raw){
    if(!raw||raw.schema!==SCHEMA||!Array.isArray(raw.tables)||raw.tables.length>50)throw Error('备份版本或内容无效');
    for(const t of raw.tables){
      if(!t||!t.id||!t.name||!/^\d{4}-\d\d-\d\d$/.test(t.startDate)||
         !Number.isInteger(t.totalWeeks)||t.totalWeeks<1||t.totalWeeks>30||
         !Array.isArray(t.periods)||t.periods.length<1||t.periods.length>20||
         !Array.isArray(t.courses)||t.courses.length>1000||!Array.isArray(t.exceptions)||t.exceptions.length>2000)throw Error('课表数据无效');
      if(t.background!==undefined&&t.background!==''&&
         (typeof t.background!=='string'||t.background.length>220000||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(t.background)))throw Error('课表背景无效');
      if(t.backgroundFade!==undefined&&(!Number.isInteger(t.backgroundFade)||t.backgroundFade<0||t.backgroundFade>85))throw Error('背景透明度无效');
      for(const p of t.periods)if(!/^\d\d:\d\d$/.test(p.start)||!/^\d\d:\d\d$/.test(p.end)||p.start>=p.end)throw Error('节次时间无效');
      for(const c of t.courses){
        if(!c||!c.id||!c.name||!Array.isArray(c.sessions)||c.sessions.length>30)throw Error('课程数据无效');
        for(const s of c.sessions)if(!s.id||s.day<1||s.day>7||s.start<1||s.end<s.start||s.end>t.periods.length||
           !Array.isArray(s.weeks)||s.weeks.some(w=>!Number.isInteger(w)||w<1||w>t.totalWeeks))throw Error('上课安排无效');
      }
      for(const x of t.exceptions)if(!x||!x.id||!x.courseId||!['cancel','move','extra'].includes(x.type)||
        !/^\d{4}-\d\d-\d\d$/.test(x.sourceDate||x.targetDate||''))throw Error('临时调课数据无效');
    }
    if(!raw.tables.some(t=>t.id===raw.activeId))raw.activeId=raw.tables[0]?.id||null;
    if(!raw.settings)raw.settings={remindersEnabled:false,reminderMinutes:15};
    return raw;
  }
  function activeTable(state){return state.tables.find(t=>t.id===state.activeId)||state.tables[0];}
  function effectiveChanges(table){
    const latest=new Map(),extra=[];
    for(const change of table.exceptions||[]){
      if(change.type==='extra')extra.push(change);
      else latest.set(`${change.sessionId}@${change.sourceDate}`,change);
    }
    return {latest,all:[...latest.values(),...extra]};
  }
  function occurrences(table,week){
    const out=[];if(week<1||week>table.totalWeeks)return out;
    const from=dateFor(table,week,1),to=dateFor(table,week,7);
    const changes=effectiveChanges(table);
    for(const course of table.courses)for(const session of course.sessions){
      if(!session.weeks.includes(week))continue;
      const date=dateFor(table,week,session.day);
      const change=changes.latest.get(`${session.id}@${date}`);
      if(change&&['cancel','move'].includes(change.type))continue;
      out.push({id:`${session.id}@${date}`,courseId:course.id,sessionId:session.id,date,day:session.day,start:session.start,end:session.end,
        name:course.name,teacher:course.teacher||'',room:course.room||'',color:course.color||COLORS[0],moved:false});
    }
    for(const change of changes.all){
      if(change.type!=='move'&&change.type!=='extra')continue;
      if(!change.targetDate||change.targetDate<from||change.targetDate>to)continue;
      const course=table.courses.find(x=>x.id===change.courseId);if(!course)continue;
      const day=(new Date(`${change.targetDate}T12:00:00`).getDay()+6)%7+1;
      out.push({id:change.id,courseId:course.id,sessionId:change.sessionId||'',date:change.targetDate,day,
        start:change.start,end:change.end,name:course.name,teacher:course.teacher||'',room:change.room||course.room||'',
        color:course.color||COLORS[0],moved:true});
    }
    return out.sort((a,b)=>a.day-b.day||a.start-b.start||a.name.localeCompare(b.name,'zh'));
  }
  function changeMarkers(table,week){
    if(week<1||week>table.totalWeeks)return [];
    const from=dateFor(table,week,1),to=dateFor(table,week,7),out=[];
    for(const change of effectiveChanges(table).latest.values()){
      if(change.sourceDate<from||change.sourceDate>to)continue;
      const course=table.courses.find(x=>x.id===change.courseId);
      const session=course?.sessions.find(x=>x.id===change.sessionId);
      if(!session||!session.weeks.includes(week)||dateFor(table,week,session.day)!==change.sourceDate)continue;
      if(change.type==='move'&&change.targetDate===change.sourceDate&&change.start===session.start&&change.end===session.end)continue;
      out.push({id:`marker:${change.id}`,exceptionId:change.id,courseId:course.id,sessionId:session.id,
        date:change.sourceDate,day:session.day,start:session.start,end:session.end,
        name:course.name,room:course.room||'',color:course.color||COLORS[0],type:change.type,
        targetDate:change.targetDate||'',targetStart:change.start,targetEnd:change.end});
    }
    return out.sort((a,b)=>a.day-b.day||a.start-b.start||a.name.localeCompare(b.name,'zh'));
  }
  function conflicts(events){
    const result=new Set();
    for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
      const a=events[i],b=events[j];
      if(a.date===b.date&&a.start<=b.end&&b.start<=a.end){result.add(a.id);result.add(b.id);}
    }
    return result;
  }
  function allOccurrences(table){let all=[];for(let w=1;w<=table.totalWeeks;w++)all=all.concat(occurrences(table,w));return all;}
  function eventTime(table,event){
    const a=table.periods[event.start-1],b=table.periods[event.end-1];
    if(!a||!b)return null;
    return {start:new Date(`${event.date}T${a.start}:00+08:00`).getTime(),end:new Date(`${event.date}T${b.end}:00+08:00`).getTime()};
  }
  function escapeIcs(s){return String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
  function utc(ms){return new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
  function toIcs(table){
    const rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ClassGrid//Local Timetable//ZH','CALSCALE:GREGORIAN'];
    for(const event of allOccurrences(table)){
      const time=eventTime(table,event);if(!time)continue;
      rows.push('BEGIN:VEVENT',`UID:${escapeIcs(event.id)}@classgrid.local`,`DTSTAMP:${utc(Date.now())}`,
        `DTSTART:${utc(time.start)}`,`DTEND:${utc(time.end)}`,`SUMMARY:${escapeIcs(event.name)}`,
        `LOCATION:${escapeIcs(event.room)}`,`DESCRIPTION:${escapeIcs(event.teacher)}`,'END:VEVENT');
    }
    rows.push('END:VCALENDAR');return rows.join('\r\n')+'\r\n';
  }
  function reminderPayload(state){
    const table=activeTable(state);
    const events=table?allOccurrences(table).map(e=>({id:e.id,at:eventTime(table,e)?.start||0,title:e.name,room:e.room})).filter(e=>e.at):[];
    return {enabled:!!state.settings.remindersEnabled,minutes:Number(state.settings.reminderMinutes??15),events};
  }
  return {SCHEMA,COLORS,DEFAULT_PERIODS,uid,todayDate,monday,dateAdd,weekOf,dateFor,defaultTable,defaultState,parseWeeks,weeksLabel,
    validateState,activeTable,occurrences,changeMarkers,conflicts,allOccurrences,eventTime,toIcs,reminderPayload};
});
