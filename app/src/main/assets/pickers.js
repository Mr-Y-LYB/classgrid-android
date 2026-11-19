/* Local Material choice/date/time dialogs; the original controls remain the data source. */
(function(){
  'use strict';
  let active=null,sequence=0,scheduled=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const arrow=icon('<path d="m9 5 7 7-7 7"/>');
  const labelOf=input=>input.getAttribute('aria-label')||input.closest('.field')?.querySelector('label')?.textContent||'选择';
  const dateOf=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(s+'T12:00:00'):null;
  const dateString=d=>`${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function close(){
    if(!active)return;const previous=active;active=null;
    previous.root.classList.add('picker-closing');document.body.classList.remove('picker-open');
    previous.trigger.setAttribute('aria-expanded','false');previous.trigger.focus({preventScroll:true});
    setTimeout(()=>previous.root.remove(),matchMedia('(prefers-reduced-motion: reduce)').matches?0:160);
  }
  function refresh(input){
    const trigger=input.nextElementSibling;if(!trigger?.classList.contains('md-control-trigger'))return;
    trigger.querySelector('.md-control-value').textContent=input.tagName==='SELECT'?input.selectedOptions[0]?.textContent||'请选择':input.value||'请选择';
    trigger.disabled=input.disabled;trigger.setAttribute('aria-label',labelOf(input)+'，'+trigger.querySelector('.md-control-value').textContent);
  }
  function commit(value){
    if(!active)return;const input=active.input;if(!input.isConnected){close();return;}
    input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));refresh(input);close();
  }
  function render(){
    if(!active)return;const {input,root}=active,title=labelOf(input);
    let body='',actions='';
    if(input.tagName==='SELECT'){
      body=`<div class="md-choice-list" role="radiogroup" aria-label="${esc(title)}">${Array.from(input.options).map((option,i)=>`<button type="button" class="md-choice ${option.selected?'chosen':''}" role="radio" aria-checked="${option.selected}" data-choice="${i}" ${option.disabled?'disabled':''}><span>${esc(option.textContent)}</span><span class="md-radio" aria-hidden="true"></span></button>`).join('')}</div>`;
      actions='<button type="button" class="md-dialog-button" data-picker="cancel">取消</button>';
    }else if(input.type==='date'){
      const y=active.year,m=active.month;
      if(active.monthView){
        body=`<div class="md-calendar-nav"><button type="button" data-picker="prev-year" aria-label="上一年">${arrow}</button><strong>${y} 年</strong><button type="button" data-picker="next-year" aria-label="下一年">${arrow}</button></div><div class="md-month-grid">${Array.from({length:12},(_,i)=>`<button type="button" data-month="${i}" class="${i===m?'chosen':''}">${i+1}月</button>`).join('')}</div>`;
      }else{
        const offset=(new Date(y,m,1).getDay()+6)%7,count=new Date(y,m+1,0).getDate(),today=dateString(new Date());
        body=`<div class="md-calendar-selected">${esc(active.value||'选择日期')}</div><div class="md-calendar-nav"><button type="button" data-picker="prev-month" aria-label="上个月">${arrow}</button><button type="button" data-picker="months" class="md-month-title">${y}年 ${m+1}月</button><button type="button" data-picker="next-month" aria-label="下个月">${arrow}</button></div><div class="md-calendar-grid">${['一','二','三','四','五','六','日'].map(x=>`<span class="md-weekday">${x}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:count},(_,i)=>{
          const value=dateString(new Date(y,m,i+1)),disabled=(input.min&&value<input.min)||(input.max&&value>input.max);
          return `<button type="button" data-date="${value}" aria-label="${value}" aria-pressed="${value===active.value}" ${disabled?'disabled':''} class="${value===active.value?'chosen':''} ${value===today?'is-today':''}">${i+1}</button>`;
        }).join('')}</div>`;
      }
      actions='<button type="button" class="md-dialog-button" data-picker="cancel">取消</button><button type="button" class="md-dialog-button primary" data-picker="apply-date">确定</button>';
    }else{
      const [hour,minute]=(input.value||'08:00').split(':');
      body=`<div class="md-time-fields"><label><span>时</span><input id="md-time-hour" type="text" inputmode="numeric" maxlength="2" value="${esc(hour)}" aria-label="小时" autocomplete="off"></label><span class="md-time-colon">:</span><label><span>分</span><input id="md-time-minute" type="text" inputmode="numeric" maxlength="2" value="${esc(minute)}" aria-label="分钟" autocomplete="off"></label></div><p class="md-time-hint">24 小时制</p><p id="md-time-error" class="error" role="alert"></p>`;
      actions='<button type="button" class="md-dialog-button" data-picker="cancel">取消</button><button type="button" class="md-dialog-button primary" data-picker="apply-time">确定</button>';
    }
    root.innerHTML=`<section class="md-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="md-picker-title"><h2 id="md-picker-title">${esc(title)}</h2><div class="md-picker-body">${body}</div><div class="md-picker-actions">${actions}</div></section>`;
  }
  function diag(msg){try{console.warn('[picker]',msg);}catch(e){}}
  function open(input,trigger){
    if(active||input.disabled){diag('被拦截 active='+!!active+' disabled='+!!input.disabled);return;}
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    const root=document.createElement('div');root.className='md-picker-overlay';root.id='control-picker';document.body.appendChild(root);
    const chosen=dateOf(input.value)||new Date();active={input,trigger,root,value:input.value||dateString(chosen),year:chosen.getFullYear(),month:chosen.getMonth(),monthView:false};
    document.body.classList.add('picker-open');trigger.setAttribute('aria-expanded','true');
    try{render();}catch(err){diag('render 失败 '+(err&&err.message||err));}
    root.addEventListener('click',e=>{
      if(!active||active.root!==root)return;
      if(e.target===root){close();return;}
      const choice=e.target.closest('[data-choice]');
      if(choice&&!choice.disabled){const option=input.options[Number(choice.dataset.choice)];if(option&&!option.disabled)commit(option.value);return;}
      const date=e.target.closest('[data-date]');if(date&&!date.disabled){active.value=date.dataset.date;render();return;}
      const month=e.target.closest('[data-month]');if(month){active.month=Number(month.dataset.month);active.monthView=false;render();return;}
      const action=e.target.closest('[data-picker]')?.dataset.picker;
      if(action==='cancel'){close();return;}
      if(action==='months'){active.monthView=true;render();return;}
      if(action==='prev-year'||action==='next-year'){active.year=Math.max(1,Math.min(9999,active.year+(action==='prev-year'?-1:1)));render();return;}
      if(action==='prev-month'||action==='next-month'){const d=new Date(active.year,active.month+(action==='prev-month'?-1:1),1);active.year=d.getFullYear();active.month=d.getMonth();render();return;}
      if(action==='apply-date'){
        if((input.min&&active.value<input.min)||(input.max&&active.value>input.max))return;commit(active.value);return;
      }
      if(action==='apply-time'){
        const hour=root.querySelector('#md-time-hour').value,minute=root.querySelector('#md-time-minute').value;
        if(!/^\d{1,2}$/.test(hour)||!/^\d{1,2}$/.test(minute)||Number(hour)>23||Number(minute)>59){root.querySelector('#md-time-error').textContent='小时应为 0–23，分钟应为 0–59';return;}
        commit(hour.padStart(2,'0')+':'+minute.padStart(2,'0'));
      }
    });
    const selected=root.querySelector('.md-choice.chosen')||root.querySelector('[data-date].chosen')||root.querySelector('input')||root.querySelector('button');
    // Focusing a time field is left to an explicit tap, to keep the opening layout stable.
    if(selected&&selected.tagName!=='INPUT')selected.focus({preventScroll:true});
  }
  function enhance(){
    scheduled=false;
    for(const input of document.querySelectorAll('select,input[type=date],input[type=time]')){
      if(input.closest('#control-picker'))continue;
      if(input.dataset.materialControl){refresh(input);continue;}
      input.dataset.materialControl='true';input.hidden=true;input.tabIndex=-1;input.setAttribute('aria-hidden','true');
      const trigger=document.createElement('button');trigger.type='button';trigger.className='md-control-trigger';
      trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
      trigger.id='md-control-'+(++sequence);trigger.innerHTML=`<span class="md-control-value"></span>${icon(input.tagName==='SELECT'?'<path d="m7 10 5 5 5-5"/>':input.type==='date'?'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/>':'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>')}`;
      input.after(trigger);
      const label=input.closest('.field')?.querySelector('label');if(label)label.htmlFor=trigger.id;
      input.addEventListener('change',()=>refresh(input));refresh(input);
    }
  }
  const observer=new MutationObserver(records=>{
    if(active&&!active.input.isConnected)close();
    if(records.some(record=>Array.from(record.addedNodes).some(node=>node.nodeType===1&&!node.closest?.('#control-picker')&&!node.classList?.contains('md-control-trigger')))&&!scheduled){scheduled=true;queueMicrotask(enhance);}
  });
  observer.observe(document.body,{childList:true,subtree:true});enhance();
  // 指针与键盘都走委托：trigger 由 MutationObserver 动态插入，逐元素绑定在部分 WebView 上会丢
  function onTriggerActivate(e){
    const trigger=e.target&&e.target.closest&&e.target.closest('.md-control-trigger');
    if(!trigger)return;
    const input=trigger.previousElementSibling;
    if(!input||!input.dataset||input.dataset.materialControl!=='true'){diag('trigger 找不到对应 input');return;}
    e.preventDefault();
    open(input,trigger);
  }
  document.addEventListener('click',onTriggerActivate,true);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const t=e.target;
    if(t&&t.classList&&t.classList.contains('md-control-trigger'))onTriggerActivate(e);
  },true);
  const back=window.onBackRequested;window.onBackRequested=()=>{if(active){close();return true;}return back?back():false;};
  document.addEventListener('keydown',e=>{
    if(!active)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
    if(e.key==='Tab'){
      const list=[...active.root.querySelectorAll('button:not(:disabled),input:not(:disabled)')],index=list.indexOf(document.activeElement);
      if(e.shiftKey&&index<=0){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&index===list.length-1){e.preventDefault();list[0]?.focus();}
    }
  },true);
})();
