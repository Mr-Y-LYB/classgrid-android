(function(root,factory){const api=factory(root.CGModel||(typeof require==='function'?require('./model.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.CGImport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
  'use strict';
  const HEADERS=['课程','教师','教室','星期','开始节','结束节','周次'];
  const TEMPLATE='课程,教师,教室,星期,开始节,结束节,周次\r\n高等数学,张老师,A101,一,1,2,1-16\r\n大学英语,李老师,B202,三,3,4,1-16单\r\n';
  function clean(v){return String(v==null?'':v).replace(/\u00a0/g,' ').replace(/\r/g,'').trim();}
  function dayNumber(value){
    const s=clean(value).replace(/\s/g,'');
    if(/^[1-7]$/.test(s))return Number(s);
    const x=['一','二','三','四','五','六','日'];
    const char=s.replace(/^星期|^周/,'');return x.indexOf(char)+1;
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
      if(!groups.has(key))groups.set(key,{id:M.uid(),name:r.name,teacher:r.teacher,room:r.room,
        color:M.COLORS[groups.size%M.COLORS.length],sessions:[]});
      groups.get(key).sessions.push({id:M.uid(),day:r.day,start:r.start,end:r.end,weeks:r.weeks,room:r.room});
    }
    return [...groups.values()];
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
        const rs=Math.max(1,Math.min(20,Number(cell.rowSpan)||1));
        const cs=Math.max(1,Math.min(8,Number(cell.colSpan)||1));
        for(let y=r;y<r+rs;y++){if(!grid[y])grid[y]=[];for(let x=col;x<col+cs;x++)grid[y][x]=entry;}
        col+=cs;
      });
    });return grid;
  }
  function parseCell(text,day,start,maxWeeks){
    const lines=clean(text).split(/\n+/).map(clean).filter(Boolean);
    const results=[];
    const pattern=/(\d{1,2})\s*节\s*[\/／]\s*(单周|双周|周)\s*[（(]\s*(\d{1,2})\s*[-~～—–至到]\s*(\d{1,2})\s*[）)]/;
    for(let i=0;i<lines.length;i++){
      const hit=lines[i].match(pattern);if(!hit)continue;
      let previous=i-1;
      while(previous>=0&&/^(必修|选修|专选|公选|学选|无方向|实践)$/.test(lines[previous]))previous--;
      const name=clean(lines[previous]||'');
      if(!name||pattern.test(name))continue;
      const weeks=M.parseWeeks(`${hit[3]}-${hit[4]}${hit[2]==='单周'?'单':hit[2]==='双周'?'双':''}`,maxWeeks);
      const end=start+Number(hit[1])-1;
      if(end>20)continue;
      results.push({name,teacher:clean(lines[i+1]||''),room:clean(lines[i+2]||''),day,start,end,weeks});
    }
    return results;
  }
  function parsePortal(payload,totalWeeks=30){
    const tables=payload&&Array.isArray(payload.tables)?payload.tables:[];
    const weekdays=['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
    let best=[];
    for(const table of tables){
      const grid=tableGrid(table.rows||[]);let columns=null;
      for(const row of grid){
        const mapping=weekdays.map(day=>row.findIndex(cell=>cell&&normalized(cell.text)===day));
        if(mapping.filter(i=>i>=0).length>=5){columns=mapping;break;}
      }
      if(!columns)continue;
      const records=[];
      for(let r=0;r<grid.length;r++){
        const first=grid[r].slice(0,Math.max(2,Math.min(...columns.filter(x=>x>=0))));
        const section=first.map(x=>x&&normalized(x.text).match(/^第(\d{1,2})节$/)).find(Boolean);
        if(!section)continue;
        const start=Number(section[1]);
        columns.forEach((col,dayIndex)=>{
          if(col<0)return;
          const cell=grid[r][col];
          if(!cell||cell.originRow!==r||cell.originCol!==col)return;
          try{records.push(...parseCell(cell.text,dayIndex+1,start,totalWeeks));}catch(e){}
        });
      }
      if(records.length>best.length)best=records;
    }
    if(!best.length)throw Error('未识别到课程。请打开完整的“学生个人课表”，或改用文件导入。');
    return {courses:group(best),issues:[]};
  }
  return {TEMPLATE,parseCsv,parseCsvCourses,parsePortal,parseCell,tableGrid,dayNumber};
});
