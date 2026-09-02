javascript:(function(){
	function n(s){
		if(!s)return null;
		s=s.replace(/\u00a0/g,' ').replace('€','').trim();
		s=s.replace(/\./g,'').replace(',','.');
		return parseFloat(s);
	}

	function r(){
		return document.querySelectorAll('tr.fila1,tr.fila2');
	}

	try{
		if(typeof desplegarTodos==='function'){
			desplegarTodos();
		}else{
			document.querySelectorAll("a[href*='plegarDesplegar']").forEach(function(a){
				try{a.click();}catch(e){}
			});
		}
	}catch(e){}

	if(window.__bmRun){
		alert("Ya abierto");
		return;
	}

	window.__bmRun=true;

	let old=document.getElementById("bm-panel");
	if(old)old.remove();

	let p=document.createElement("div");
	p.id="bm-panel";
	p.style="position:fixed;top:18px;right:18px;width:330px;background:#15171c;color:#f3f4f6;z-index:999999;padding:12px;border-radius:12px;border:1px solid #2a2f3a;font-family:'Segoe UI',Tahoma,sans-serif;font-size:13px;box-shadow:0 12px 30px rgba(0,0,0,.42);";

	p.innerHTML=''
		+'<div style="font-weight:600;margin-bottom:7px;letter-spacing:.2px;font-size:13px;">Ficheros pendientes de firma</div>'
		+'<textarea id="bm-input" style="display:block;width:100%;max-width:100%;box-sizing:border-box;height:96px;min-height:86px;max-height:160px;resize:vertical;background:#0f1115;color:#c7f9cc;border:1px solid #2f3542;border-radius:9px;padding:7px;line-height:1.3;font-size:12px;"></textarea>'
		+'<div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap;">'
		+'<button id="bm-run" title="Run" aria-label="Run" style="padding:5px 9px;border-radius:7px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;font-size:12px;">▶</button>'
		+'<button id="bm-all" title="Seleccionar todo" aria-label="Seleccionar todo" style="padding:5px 9px;border-radius:7px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;font-size:12px;">✅ Seleccionar todo</button>'
		+'<button id="bm-clear" title="Clear" aria-label="Clear" style="padding:5px 9px;border-radius:7px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;font-size:12px;">🧹</button>'
		+'<button id="bm-copy" title="Copy" aria-label="Copy" style="padding:5px 9px;border-radius:7px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;font-size:12px;">📋</button>'
		+'<button id="bm-close" title="Close" aria-label="Close" style="padding:5px 9px;border-radius:7px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;font-size:12px;">✖</button>'
		+'</div>'
		+'<div style="margin-top:7px;background:#2b303b;height:7px;border-radius:999px;overflow:hidden;">'
		+'<div id="bm-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#4ade80);transition:width 0.4s ease;"></div>'
		+'</div>'
		+'<div id="bm-log" style="margin-top:7px;font-size:11px;color:#d1d5db;"></div>';

	document.body.appendChild(p);

	let i=document.getElementById("bm-input");
	let bar=document.getElementById("bm-bar");
	let logEl=document.getElementById("bm-log");

	let log=m=>{logEl.innerHTML=m;};
	let fmt=n=>n.toLocaleString("es-ES",{minimumFractionDigits:2});

	document.getElementById("bm-close").onclick=()=>{
		p.remove();
		window.__bmRun=false;
	};

	document.getElementById("bm-clear").onclick=()=>{
		i.value='';
		logEl.innerHTML='';
		bar.style.width='0%';
	};

	document.getElementById("bm-copy").onclick=()=>{
		navigator.clipboard.writeText(i.value);
		alert("Copiado");
	};

	document.getElementById("bm-all").onclick=()=>{
		let c=0;
		[...r()].forEach(rw=>{
			let ck=rw.querySelector("input[type='checkbox']");
			if(ck&&!ck.checked){
				ck.checked=true;
				if(typeof ck.onclick==='function'){
					ck.onclick();
				}else{
					ck.click();
				}
				c++;
			}
		});
		alert("Seleccionados "+c+" registros");
	};

	document.getElementById("bm-run").onclick=()=>{
		let raw=i.value.split(/\n+/).map(v=>v.trim()).filter(Boolean);
		let targets=raw.map(v=>n(v)).filter(v=>!isNaN(v));
		let found=[];
		let foundMap={};
		let rows=[...r()];

		rows.forEach(rw=>{
			rw.style.background='';
			let c=rw.querySelector("input[type='checkbox']");
			if(c)c.checked=false;
		});

		rows.forEach(rw=>{
			let td=[...rw.querySelectorAll('td.a11')].find(td=>td.innerText.includes('€'));
			if(!td)return;

			let val=n(td.innerText);
			if(val&&targets.some(t=>Math.abs(t-val)<0.01)){
				rw.style.background="#90EE90";
				let k=val.toFixed(2);
				found.push(k);
				foundMap[k]=(foundMap[k]||0)+1;

				let c=rw.querySelector("input[type='checkbox']");
				if(c){
					c.checked=true;
					if(typeof c.onclick==='function'){
						c.onclick();
					}else{
						c.click();
					}
				}
			}
		});

		let tmp={...foundMap};
		let notFound=[];
		targets.forEach(v=>{
			let k=v.toFixed(2);
			if(tmp[k]>0){
				tmp[k]--;
			}else{
				notFound.push(v);
			}
		});

		setTimeout(()=>alert("NO ENCONTRADOS:\n"+(notFound.length?notFound.map(v=>fmt(v)).join("\n"):"NINGUNO")),100);

		let pct=targets.length?Math.round((targets.length-notFound.length)/targets.length*100):0;
		bar.style.width=pct+"%";

		let msg="✅ "+(targets.length-notFound.length)+"/"+targets.length+"<br>";
		if(found.length){
			msg+='<span style="color:#86efac">✔ '+found.join(", ")+"</span><br>";
		}
		if(notFound.length){
			msg+='<span style="color:#fca5a5">✖ '+notFound.map(v=>fmt(v)).join(", ")+"</span>";
		}

		log(msg);
	};
})();