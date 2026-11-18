/* Evaluated in the remote page without installing a native JavaScript bridge. */
(function(){
  const tables=[],frames=[],issues=[],visited=new Set();let loading=false,login=false,truncated=false;
  const norm=s=>String(s||'').normalize('NFKC').replace(/\s/g,'');
  const weekday=s=>/^(?:星期|周|礼拜)?([一二三四五六日天])(?:\d{1,2}[月/.-]\d{1,2}日?)?$/.test(norm(s));
  function text(cell){
    // Walk BR and block boundaries explicitly: some legacy tables hide helper markup.
    let value='';
    function walk(node){
      if(node.nodeType===3){value+=node.nodeValue;return;}
      if(node.nodeType!==1||/^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.tagName)||node.hidden)return;
      if(node.tagName==='BR'){value+='\n';return;}
      const block=/^(DIV|P|LI|TR)$/.test(node.tagName);if(block)value+='\n';
      for(const child of node.childNodes)walk(child);if(block)value+='\n';
    }
    walk(cell);return value.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
  }
  function scan(win,depth){
    if(depth>8){issues.push('页面嵌套过深，部分内容未读取');return;}
    let doc;try{doc=win.document;if(!doc||!doc.body)return;}catch(e){return;}
    if(visited.has(doc))return;visited.add(doc);
    loading ||= doc.readyState!=='complete';
    login ||= !!doc.querySelector('input[type=password]');
    for(const table of doc.querySelectorAll('table')){
      // Only direct rows/cells belong to this table; outer layout tables must not win.
      const rows=Array.from(table.rows||[]).filter(r=>r.closest('table')===table);
      const header=rows.some(row=>Array.from(row.cells).filter(c=>weekday(text(c))).length>=3);
      if(!header)continue;
      if(tables.length>=12){truncated=true;break;}
      if(rows.length>100||rows.some(r=>r.cells.length>20))truncated=true;
      tables.push({rows:rows.slice(0,100).map(row=>Array.from(row.cells).slice(0,20).map(cell=>{
        const value=text(cell);if(value.length>6000)truncated=true;
        return {text:value.slice(0,6000),rowSpan:Math.max(1,Math.min(40,Number(cell.rowSpan)||1)),
          colSpan:Math.max(1,Math.min(20,Number(cell.colSpan)||1))};
      }))});
    }
    for(const frame of doc.querySelectorAll('iframe,frame')){
      try{
        const src=frame.getAttribute('src');
        if(src){const target=new URL(src,doc.baseURI);if(target.protocol==='https:'&&target.origin!==doc.location.origin)throw Error('cross-origin');}
        if(!frame.contentWindow||!frame.contentWindow.document)throw Error('unreadable');
        scan(frame.contentWindow,depth+1);
      }catch(e){
        try{const url=new URL(frame.getAttribute('src')||'',doc.baseURI);
          if(url.protocol==='https:'&&!url.username&&!url.password)
            frames.push({url:url.href,label:(frame.title||frame.name||url.hostname).slice(0,100)});
        }catch(ignored){}
      }
    }
  }
  scan(window,0);
  const blocked=Array.from(new Map(frames.map(f=>[f.url,f])).values()).slice(0,12);
  if(blocked.length)issues.push('部分嵌套页面无法读取，请核对是否缺少课程');
  if(truncated)issues.push('页面内容超出读取上限，请核对课程是否完整');
  return JSON.stringify({tables,source:'教务系统页面',diagnostics:{
    status:tables.length?'found':login?'login':blocked.length?'frame_blocked':loading?'loading':'no_table',
    documents:visited.size,frames:blocked,truncated,issues}});
})()
