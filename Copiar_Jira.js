javascript:(async()=>{
	const esperar=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
	const recopilarTextoCompleto=async()=>{
		const textos=new Set();
		const guardarTexto=()=>{
			for(const linea of document.body.innerText.split('\n')){
				const limpia=linea.trim();
				if(limpia){
					textos.add(limpia);
				}
			}
		};
		const contenedores=[document.scrollingElement,...document.querySelectorAll('*')]
			.filter((elemento,index,lista)=>elemento&&lista.indexOf(elemento)===index)
			.filter((elemento)=>{
				const estilo=getComputedStyle(elemento);
				return elemento.scrollHeight>elemento.clientHeight&&
					/(auto|scroll)/.test(estilo.overflowY);
			});

		guardarTexto();
		for(const contenedor of contenedores){
			const posicionOriginal=contenedor.scrollTop;
			const salto=Math.max(300,Math.floor(contenedor.clientHeight*0.8));
			for(let posicion=0;posicion<contenedor.scrollHeight;posicion+=salto){
				contenedor.scrollTop=posicion;
				await esperar(150);
				guardarTexto();
			}
			contenedor.scrollTop=contenedor.scrollHeight;
			await esperar(150);
			guardarTexto();
			contenedor.scrollTop=posicionOriginal;
		}
		return Array.from(textos).join('\n');
	};

	const texto=await recopilarTextoCompleto();
	const jira=(texto.match(/\bFTR-\d+\b/)||['JIRA_NO_ENCONTRADO'])[0];
	const lineas=texto.split('\n').map((x)=>x.trim());
	const regexFecha=/^\d{2}\.\d{2}\.\d{4}\b/;
	const regexImporte=/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/;
	const regexMoneda=/^[A-Z]{3}$/;
	const resultado=[];
	let enActividad=false;
	let comentarios=0;

	const parseImporte=(valor)=>Number(valor.replace(/\./g,'').replace(',','.'));
	const formatImporte=(valor)=>new Intl.NumberFormat('es-ES',{
		minimumFractionDigits:2,
		maximumFractionDigits:2
	}).format(valor);

	const extraerImporteYMoneda=(linea)=>{
		const tokens=linea.split(/\s+/).filter(Boolean);

		for(let i=0;i<tokens.length;i++){
			const actual=tokens[i];
			const previo=tokens[i-1];
			const siguiente=tokens[i+1];

			if(regexMoneda.test(actual)&&previo&&regexImporte.test(previo)){
				return {moneda:actual,importe:parseImporte(previo)};
			}

			if(regexImporte.test(actual)&&siguiente&&regexMoneda.test(siguiente)){
				return {moneda:siguiente,importe:parseImporte(actual)};
			}
		}

		return null;
	};

	const cerrarModalExistente=()=>{
		const previo=document.getElementById('__copiar_jira_resumen__');
		if(previo){
			previo.remove();
		}
	};

	const mostrarResumen=(resumenTexto,resumenFilas,resumenEstado)=>{
		cerrarModalExistente();

		const overlay=document.createElement('div');
		overlay.id='__copiar_jira_resumen__';
		overlay.style.position='fixed';
		overlay.style.inset='0';
		overlay.style.background='rgba(15,23,42,0.35)';
		overlay.style.display='flex';
		overlay.style.alignItems='center';
		overlay.style.justifyContent='center';
		overlay.style.padding='24px';
		overlay.style.zIndex='2147483647';

		const modal=document.createElement('div');
		modal.style.background='#ffffff';
		modal.style.color='#0f172a';
		modal.style.width='100%';
		modal.style.maxWidth='520px';
		modal.style.borderRadius='14px';
		modal.style.boxShadow='0 25px 70px rgba(15,23,42,0.28)';
		modal.style.border='1px solid rgba(148,163,184,0.35)';
		modal.style.padding='24px';
		modal.style.fontFamily='Segoe UI, sans-serif';

		const titulo=document.createElement('h2');
		titulo.textContent='Resumen por moneda';
		titulo.style.margin='0 0 16px';
		titulo.style.fontSize='22px';
		modal.appendChild(titulo);

		if(resumenFilas.length){
			const tabla=document.createElement('table');
			tabla.style.width='100%';
			tabla.style.borderCollapse='collapse';
			tabla.style.marginBottom='18px';

			const cabecera=document.createElement('thead');
			cabecera.innerHTML='<tr><th style="text-align:left;padding:0 0 10px;border-bottom:1px solid #cbd5e1;">Moneda</th><th style="text-align:right;padding:0 0 10px;border-bottom:1px solid #cbd5e1;">Total</th></tr>';
			tabla.appendChild(cabecera);

			const cuerpo=document.createElement('tbody');
			for(const fila of resumenFilas){
				const tr=document.createElement('tr');
				tr.innerHTML=`<td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${fila.moneda}</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${fila.total}</td>`;
				cuerpo.appendChild(tr);
			}
			tabla.appendChild(cuerpo);
			modal.appendChild(tabla);
		}else{
			const vacio=document.createElement('p');
			vacio.textContent='No se detectaron importes y monedas v\u00e1lidos en las l\u00edneas copiadas.';
			vacio.style.margin='0 0 18px';
			modal.appendChild(vacio);
		}

		const estado=document.createElement('p');
		estado.textContent=resumenEstado;
		estado.style.margin='0 0 18px';
		estado.style.fontSize='13px';
		estado.style.lineHeight='1.5';
		estado.style.color='#64748b';
		modal.appendChild(estado);

		const acciones=document.createElement('div');
		acciones.style.display='flex';
		acciones.style.justifyContent='flex-end';
		acciones.style.gap='10px';

		const botonCopiar=document.createElement('button');
		botonCopiar.textContent='Copiar resumen';
		botonCopiar.disabled=!resumenTexto;
		botonCopiar.style.border='0';
		botonCopiar.style.borderRadius='10px';
		botonCopiar.style.padding='10px 14px';
		botonCopiar.style.fontWeight='600';
		botonCopiar.style.cursor=resumenTexto?'pointer':'not-allowed';
		botonCopiar.style.background=resumenTexto?'#0f766e':'#cbd5e1';
		botonCopiar.style.color=resumenTexto?'#ffffff':'#475569';

		botonCopiar.addEventListener('click',async()=>{
			if(!resumenTexto){
				return;
			}
			await navigator.clipboard.writeText(resumenTexto);
			const textoOriginal=botonCopiar.textContent;
			botonCopiar.textContent='Resumen copiado';
			setTimeout(()=>{
				botonCopiar.textContent=textoOriginal;
			},1200);
		});

		const cerrar=()=>{
			document.removeEventListener('keydown',onKeyDown);
			overlay.remove();
		};

		const onKeyDown=(event)=>{
			if(event.key==='Escape'){
				cerrar();
			}
		};

		const botonCerrar=document.createElement('button');
		botonCerrar.textContent='Cerrar';
		botonCerrar.style.border='1px solid #cbd5e1';
		botonCerrar.style.borderRadius='10px';
		botonCerrar.style.padding='10px 14px';
		botonCerrar.style.fontWeight='600';
		botonCerrar.style.cursor='pointer';
		botonCerrar.style.background='#ffffff';
		botonCerrar.style.color='#0f172a';
		botonCerrar.addEventListener('click',cerrar);

		overlay.addEventListener('click',(event)=>{
			if(event.target===overlay){
				cerrar();
			}
		});

		acciones.appendChild(botonCopiar);
		acciones.appendChild(botonCerrar);
		modal.appendChild(acciones);
		overlay.appendChild(modal);
		document.body.appendChild(overlay);
		document.addEventListener('keydown',onKeyDown);
	};

	for(const l of lineas){
		if(l==='Actividad'){
			enActividad=true;
		}

		if(regexFecha.test(l)){
			resultado.push(l);
			if(enActividad){
				comentarios++;
			}
		}
	}

	if(!resultado.length){
		alert('No se encontraron l\u00edneas con fecha dd.mm.aaaa');
		return;
	}

	const salida=`### JIRA: ${jira}\n${resultado.join('\n')}`;
	await navigator.clipboard.writeText(salida);

	const totalesPorMoneda=new Map();
	for(const linea of resultado){
		const extraido=extraerImporteYMoneda(linea);
		if(!extraido){
			continue;
		}

		totalesPorMoneda.set(
			extraido.moneda,
			(totalesPorMoneda.get(extraido.moneda)||0)+extraido.importe
		);
	}

	const resumenFilas=Array.from(totalesPorMoneda.entries())
		.sort(([monedaA],[monedaB])=>monedaA.localeCompare(monedaB))
		.map(([moneda,total])=>({
			moneda,
			total:formatImporte(total)
		}));
	const resumenTexto=resumenFilas.map((fila)=>`${fila.moneda}\t${fila.total}`).join('\n');
	const resumenEstado=`Copiadas ${resultado.length} l\u00edneas. ${comentarios>0?`Detectadas ${comentarios} l\u00edneas en comentarios.`:'Sin movimientos en comentarios.'}`;

	mostrarResumen(resumenTexto,resumenFilas,resumenEstado);
})();