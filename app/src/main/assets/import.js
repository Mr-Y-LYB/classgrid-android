(function(root,factory){const api=factory(root.CGModel||(typeof require==='function'?require('./model.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.CGImport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const HEADERS=['课程','教师','教室','星期','开始节','结束节','周次'];
  const TEMPLATE='课程,教师,教室,星期,开始节,结束节,周次\r\n高等数学,张老师,A101,一,1,2,全部周数\r\n大学英语,李老师,B202,三,3,4,单周\r\n';
  function clean(v){return String(v==null?'':v).replace(/\u00a0/g,' ').replace(/\r/g,'').normalize('NFKC').trim();}
  function dayNumber(value){
    const s=clean(value).replace(/\s/g,'');
    if(/^[1-7]$/.test(s))return Number(s);
    const x=['一','二','三','四','五','六','日'];
    const char=s.replace(/^(星期|周|礼拜)/,'').replace('天','日');return x.indexOf(char)+1;
  }
  function parseCsv(text){
    const rows=[];let row=[],field='',quoted=false;
    const source=String(text||'').replace(/^\uFEFF/,'');
    for(let i=0;i<source.length;i++){
      const c=source[i];
      if(quoted){
        if(c==='"'&&source[i+1]==='"'){field+='"';i++;}
        else if(c==='"')quoted=false;
        else field+=c;
      }else if(c==='"')quoted=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\n'){row.push(field);if(row.some(x=>clean(x)))rows.push(row);row=[];field='';}
      else if(c!=='\r')field+=c;
    }
    if(quoted)throw Error('CSV 引号没有闭合');
    row.push(field);if(row.some(x=>clean(x)))rows.push(row);
    return rows;
  }
  function group(records){
    const groups=new Map();
    for(const r of records){
      const key=[r.name,r.teacher].join('\u001f');
      if(!groups.has(key))groups.set(key,{id:M.uid(),name:r.name,teacher:r.teacher,room:r.room,sessions:[]});
      groups.get(key).sessions.push({id:M.uid(),day:r.day,start:r.start,end:r.end,weeks:r.weeks,room:r.room});
    }
    return M.assignCourseColors([...groups.values()]);
  }
  function parseCsvCourses(text,totalWeeks=30){
    const rows=parseCsv(text);if(!rows.length)throw Error('文件为空');
    const aliases={'课程':'课程','课程名':'课程','name':'课程','教师':'教师','teacher':'教师',
      '教室':'教室','地点':'教室','room':'教室','星期':'星期','day':'星期',
      '开始节':'开始节','起始节':'开始节','start':'开始节','结束节':'结束节','end':'结束节','周次':'周次','weeks':'周次'};
    const header=rows[0].map(x=>aliases[clean(x).toLowerCase()]||'');
    if(!HEADERS.every(h=>header.includes(h)))throw Error('表头需要：'+HEADERS.join('、'));
    const records=[],issues=[];
    rows.slice(1).forEach((row,index)=>{
      const get=h=>clean(row[header.indexOf(h)]);
      try{
        const name=get('课程'),day=dayNumber(get('星期')),
          start=Number(get('开始节')),end=Number(get('结束节'));
        if(!name||name.length>100||day<1||day>7||!Number.isInteger(start)||!Number.isInteger(end)||
           start<1||end<start||end>20)throw Error('课程、星期或节次无效');
        records.push({name,teacher:get('教师'),room:get('教室'),day,start,end,
          weeks:M.parseWeeks(get('周次'),totalWeeks)});
      }catch(e){issues.push(`第 ${index+2} 行：${e.message}`);}
    });
    if(!records.length)throw Error(issues[0]||'没有可导入的课程');
    return {courses:group(records),issues};
  }
  function normalized(s){return clean(s).replace(/\s/g,'');}
  function tableGrid(rows){
    const grid=[];
    rows.forEach((row,r)=>{
      if(!grid[r])grid[r]=[];let col=0;
      row.forEach(cell=>{
        while(grid[r][col])col++;
        const entry={text:clean(cell.text),originRow:r,originCol:col};
        const rs=Math.max(1,Math.min(40,Number(cell.rowSpan)||1));
        const cs=Math.max(1,Math.min(20,Number(cell.colSpan)||1));
        for(let y=r;y<r+rs;y++){if(!grid[y])grid[y]=[];for(let x=col;x<col+cs;x++)grid[y][x]=entry;}
        col+=cs;
      });
    });return grid;
  }
  function sectionNumber(text){
    const s=normalized(text),hit=s.match(/^(?:第)?(\d{1,2})(?:[-~～—至](\d{1,2}))?(?:节|小节)(?:课)?$/);
    return hit?Number(hit[1]):0;
  }
  function headerDay(text){
    const s=normalized(text).replace(/\d{1,2}[月/.-]\d{1,2}日?$/,'');
    return dayNumber(s);
  }
  function parseCell(text,day,start,maxWeeks){
    const lines=clean(text).split(/\n+/).map(clean).filter(Boolean),results=[];
    const metadata=/^(必修|选修|专选|公选|学选|无方向|实践|考查|考试)$/;
    // New SYUCT page: 周一第3,4节{第1-11周}, including wrapped DOM text.
    const explicit=/(?:星期|礼拜|周)\s*([一二三四五六日天])\s*第?\s*([\d\s,、\-~～—–至到]+)\s*节\s*\{\s*([^{}]+)\s*\}/g;
    let consumed=-1;
    for(let i=0;i<lines.length;i++){
      const line=lines[i];if(!/^(?:星期|礼拜|周)\s*[一二三四五六日天]\s*第?\s*\d/.test(line))continue;
      let endLine=i,joined=line;
      while(!joined.includes('}')&&endLine+1<lines.length&&endLine-i<5)joined+=lines[++endLine];
      const matches=[...joined.matchAll(explicit)];if(!matches.length)continue;
      let nameEnd=i-1;while(nameEnd>consumed&&metadata.test(lines[nameEnd]))nameEnd--;
      const name=lines.slice(consumed+1,nameEnd+1).filter(x=>!metadata.test(x)).join('').trim();
      if(!name)throw Error('未找到课程名称');
      const teacher=clean(lines[endLine+1]||'');
      // Join layout wrapping inside classroom names, but stop before the next course block.
      let roomEnd=endLine+2;
      while(roomEnd+1<lines.length&&!metadata.test(lines[roomEnd+1])&&
          !/^(?:星期|礼拜|周)\s*[一二三四五六日天]/.test(lines[roomEnd+1])&&
          !metadata.test(lines[roomEnd+2]||''))roomEnd++;
      const room=clean(lines.slice(endLine+2,roomEnd+1).join(''));
      for(const match of matches){
        const explicitDay=dayNumber(match[1]);
        const weekSpec=match[3].replace(/周次|第|周/g,'').replace(/[()\[\]]/g,'').replace(/\s/g,'');
        const weeks=M.parseWeeks(weekSpec,maxWeeks),sections=new Set();
        for(const part of match[2].replace(/[、]/g,',').split(',')){
          const section=part.trim().match(/^(\d{1,2})(?:\s*[-~～—–至到]\s*(\d{1,2}))?$/);
          if(!section)throw Error('无法识别课程节次');
          const from=Number(section[1]),to=Number(section[2]||section[1]);
          if(from<1||to<from||to>20)throw Error('课程节次超出范围');
          for(let n=from;n<=to;n++)sections.add(n);
        }
        const sorted=[...sections].sort((a,b)=>a-b);let first=sorted[0],last=first;
        const add=()=>results.push({name,teacher,room,day:explicitDay,start:first,end:last,weeks});
        for(const n of sorted.slice(1)){if(n===last+1)last=n;else{add();first=last=n;}}add();
      }
      consumed=roomEnd;i=roomEnd;
    }
    if(results.length)return results;
    // SYUCT uses “2节/单周(1-12)”; also accept spaced / reversed week ranges.
    const pattern=/(\d{1,2})\s*节\s*\/\s*(单周|双周|全部周数|每周|周)\s*\(\s*([\d\s,，、\-~～—–至到]+)\s*\)/;
    const reversed=/(\d{1,2})\s*节\s*\/\s*([\d\s,，、\-~～—–至到]+)\s*周\s*(?:\((单|双)(?:周)?\))?/;
    for(let i=0;i<lines.length;i++){
      const hit=lines[i].match(pattern),reverse=hit?null:lines[i].match(reversed);if(!hit&&!reverse)continue;
      let previous=i-1;
      while(previous>=0&&/^(必修|选修|专选|公选|学选|无方向|实践|考查|考试)$/.test(lines[previous]))previous--;
      const name=clean(lines[previous]||'');if(!name)continue;
      const count=Number((hit||reverse)[1]),type=hit?hit[2]:reverse[3]||'',range=hit?hit[3]:reverse[2];
      const weeks=M.parseWeeks(range.replace(/[，、]/g,',')+(type.includes('单')?'单':type.includes('双')?'双':''),maxWeeks);
      const end=start+count-1;
      if(start<1||count<1||end>20)throw Error('课程节次超出范围');
      results.push({name,teacher:clean(lines[i+1]||''),room:clean(lines[i+2]||''),day,start,end,weeks});
    }
    return results;
  }
  function parsePortal(payload,totalWeeks=30){
    const tables=payload&&Array.isArray(payload.tables)?payload.tables:[];
    let best=[],bestIssues=[];
    for(const table of tables){
      const grid=tableGrid(table.rows||[]);let columns=null;
      for(const row of grid){
        const mapping=Array.from({length:7},(_,i)=>row.findIndex(cell=>cell&&headerDay(cell.text)===i+1));
        if(mapping.filter(i=>i>=0).length>=3){columns=mapping;break;}
      }
      if(!columns)continue;
      const records=[],issues=[],seen=new Set();
      const firstDay=Math.min(...columns.filter(x=>x>=0));
      for(let r=0;r<grid.length;r++){
        const section=grid[r].slice(0,firstDay).map(x=>sectionNumber(x?.text)).find(Boolean);
        if(!section)continue;
        columns.forEach((col,dayIndex)=>{
          if(col<0)return;const cell=grid[r][col];
          if(!cell||cell.originRow!==r||cell.originCol!==col||!cell.text)return;
          const key=cell.originRow+':'+cell.originCol;if(seen.has(key))return;seen.add(key);
          try{
            const parsed=parseCell(cell.text,dayIndex+1,section,totalWeeks);
            if(!parsed.length&&!/^(无|无课|—|-|\s)*$/.test(cell.text))issues.push(`周${['一','二','三','四','五','六','日'][dayIndex]}第${section}节有未识别内容，请核对`);
            records.push(...parsed);
          }catch(e){issues.push(`周${dayIndex+1}第${section}节：${e.message}`);}
        });
      }
      if(records.length>best.length){best=records;bestIssues=issues;}
    }
    if(!best.length)throw Error('已读取网页，但未识别到课程。请确认打开的是完整学期课表；可返回教务页面重试。');
    const unique=Array.from(new Map(best.map(r=>[JSON.stringify(r),r])).values());
    return {courses:group(unique),issues:[...new Set([...(payload.diagnostics?.issues||[]),...bestIssues])]};
  }
  return {TEMPLATE,parseCsv,parseCsvCourses,parsePortal,parseCell,tableGrid,dayNumber};
});
