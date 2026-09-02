javascript:void(async function(){
	const STATUS='[data-testid="issue-field-status.ui.status-view.status-button.status-button"]';
	const SUBMIT='#issue-workflow-transition-submit';
	const TXT='Buen dia. Ficheros enviados, saludos.';
	const TICK=45;
	const FAST=1700;
	const STEP=3800;
	const CLICK_GAP=140;
	const AFTER_CLICK_WAIT=110;

	const sl=m=>new Promise(r=>setTimeout(r,m));
	const nm=v=>(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
	const vs=e=>!!(e&&e.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&!e.disabled);
	const st=()=>{const b=document.querySelector(STATUS);return b&&b.innerText?b.innerText.trim():'';};
	const hasState=arr=>{const s=nm(st());for(let i=0;i<arr.length;i++){if(s.includes(arr[i]))return true;}return false;};

	const log=(msg,data)=>{if(data!==undefined){console.log('[CerrarJira]',msg,data);}else{console.log('[CerrarJira]',msg);}};
	let lastClickAt=0;
	let lastClickedEl=null;

	const pacedClick=async(el,tag)=>{
		if(!vs(el))return false;
		const now=Date.now();
		const waitMs=Math.max(0,CLICK_GAP-(now-lastClickAt));
		if(waitMs>0)await sl(waitMs);

		/* Prevent accidental rapid double-click over the same control. */
		if(lastClickedEl===el&&Date.now()-lastClickAt<CLICK_GAP+40){
			await sl(40);
		}

		try{el.scrollIntoView({block:'center',inline:'center'});}catch(_){ }
		el.click();
		lastClickAt=Date.now();
		lastClickedEl=el;
		await sl(AFTER_CLICK_WAIT);
		if(tag)log('click '+tag);
		return true;
	};

	const xExact=t=>{const x='//*[normalize-space(.)="'+t.replace(/"/g,'\\"')+'"]';const r=document.evaluate(x,document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);for(let i=0;i<r.snapshotLength;i++){const e=r.snapshotItem(i);if(vs(e))return e;}return null;};
	const xContains=t=>{const x='//*[contains(normalize-space(.),"'+t.replace(/"/g,'\\"')+'")]';const r=document.evaluate(x,document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);for(let i=0;i<r.snapshotLength;i++){const e=r.snapshotItem(i);if(vs(e))return e;}return null;};
	const findByLabels=labels=>{for(let i=0;i<labels.length;i++){const ex=xExact(labels[i]);if(ex)return ex;}for(let i=0;i<labels.length;i++){const ct=xContains(labels[i]);if(ct)return ct;}return null;};
	const findConfirm=()=>document.querySelector(SUBMIT)||findByLabels(['Confirmar','Confirm','Submit','Done','Cerrar incidencia','Close issue','Close']);

	const wait=async(get,ms=2600)=>{const end=Date.now()+ms;let h=get();if(h)return h;while(Date.now()<end){h=get();if(h)return h;await sl(TICK);}return null;};

	const burst=async(get,stop,ms=FAST)=>{
		const end=Date.now()+ms;
		while(Date.now()<end){
			const e=get();
			if(vs(e))await pacedClick(e,'burst');
			if(stop&&stop())return true;
			await sl(TICK);
		}
		return stop?stop():false;
	};

	const statusBtn=()=>document.querySelector(STATUS);
	const statusMenu=()=>{
		const listboxes=document.querySelectorAll('div[role="listbox"][id^="react-select-"]');
		for(let i=0;i<listboxes.length;i++){if(vs(listboxes[i]))return listboxes[i];}
		return null;
	};
	const isStatusMenuOpen=()=>{
		const b=statusBtn();
		if(vs(b)&&b.getAttribute('aria-expanded')==='true')return true;
		return !!statusMenu();
	};
	const openStatusMenu=async(ms=950)=>{
		if(isStatusMenuOpen())return true;
		const b=statusBtn();
		if(!vs(b))return false;
		await pacedClick(b,'status menu');
		return !!(await wait(()=>isStatusMenuOpen()?true:null,ms));
	};

	const findTransitionOption=labels=>{
		const menu=statusMenu();
		if(!menu)return null;
		const opts=menu.querySelectorAll('[data-testid="issue-field-status.ui.status-view.transition"], [role="option"]');
		for(let i=0;i<labels.length;i++){
			const target=nm(labels[i]);
			for(let j=0;j<opts.length;j++){
				const text=nm(opts[j].innerText||opts[j].textContent||'');
				if(text===target||text.includes(target)){
					const clickable=opts[j].closest('[role="option"]')||opts[j];
					if(vs(clickable))return clickable;
				}
			}
		}
		return null;
	};

	const transFast=async(labels,aliases,maxMs=STEP)=>{
		const end=Date.now()+maxMs;
		while(Date.now()<end){
			if(hasState(aliases))return true;

			await openStatusMenu();

			const op=findTransitionOption(labels);
			if(vs(op)){
				await pacedClick(op,'transition option');
				/* Give Jira a short window to render optional transition dialog/confirm. */
				await sl(80);
			}

			const cf=findConfirm();
			if(vs(cf))await pacedClick(cf,'confirm');

			if(await wait(()=>hasState(aliases)?true:null,900))return true;
			await sl(TICK);
		}

		for(let i=0;i<35;i++){
			if(hasState(aliases))return true;
			const cf=findConfirm();
			if(vs(cf))await pacedClick(cf,'confirm retry');
			await sl(TICK);
		}

		return hasState(aliases);
	};

	try{
		if(!document.body){alert('La pagina no esta lista. Reintenta en 1-2 segundos.');return;}

		/* Keep the original opener flow because it matches this Jira instance. */
		await burst(
			()=>findByLabels(['Responder al cliente']),
			()=>!!document.querySelector('.ProseMirror')||!!document.querySelector('textarea'),
			1800
		);

		const ed=await wait(()=>document.querySelector('.ProseMirror'),2200);
		if(ed){
			ed.focus();
			ed.innerHTML='<p>'+TXT+'</p>';
			ed.dispatchEvent(new InputEvent('input',{bubbles:true}));
		}else{
			const ta=await wait(()=>document.querySelector('textarea'),2200);
			if(!ta){alert('No encuentro editor');return;}
			ta.focus();
			ta.value=TXT;
			ta.dispatchEvent(new Event('input',{bubbles:true}));
		}

		await burst(()=>findByLabels(['Guardar','Save']),()=>!findByLabels(['Guardar','Save']),1800);

		const s=nm(st());
		const plan=[];
		if(s.includes('abierto')||s.includes('open')){
			plan.push(
				{labels:['In Progress','En proceso'],aliases:['in progress','en proceso']},
				{labels:['Resolved','Resuelto'],aliases:['resolved','resuelto']},
				{labels:['Closed','Done','Close issue','Cerrar incidencia','Cerrado','Finalizado'],aliases:['closed','cerrado','done','finalizado']}
			);
		}else if(s.includes('in progress')||s.includes('en proceso')){
			plan.push(
				{labels:['Resolved','Resuelto'],aliases:['resolved','resuelto']},
				{labels:['Closed','Done','Close issue','Cerrar incidencia','Cerrado','Finalizado'],aliases:['closed','cerrado','done','finalizado']}
			);
		}else if(s.includes('resolved')||s.includes('resuelto')){
			plan.push(
				{labels:['Closed','Done','Close issue','Cerrar incidencia','Cerrado','Finalizado'],aliases:['closed','cerrado','done','finalizado']}
			);
		}

		for(let i=0;i<plan.length;i++){
			const ok=await transFast(plan[i].labels,plan[i].aliases,i===plan.length-1?5000:STEP);
			if(!ok&&i===plan.length-1){
				await transFast(['Closed','Done','Close issue','Cerrar incidencia','Cerrado','Finalizado'],['closed','cerrado','done','finalizado'],5600);
			}
		}

		await burst(()=>findConfirm(),()=>!findConfirm(),1300);
	}catch(e){
		console.error(e);
		alert('Error en bookmarklet. Ver consola F12.');
	}
})();