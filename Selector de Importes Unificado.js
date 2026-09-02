javascript:(()=>{
  const RUNTIME_KEY="__selectorUnifiedRuntime";
  if(window[RUNTIME_KEY]?.running){
    alert("Ya esta en ejecucion");
    return;
  }

  const IDS={
    panel:"selector-unified-panel",
    input:"selector-unified-input",
    run:"selector-unified-run",
    stop:"selector-unified-stop",
    copy:"selector-unified-copy",
    close:"selector-unified-close",
    bar:"selector-unified-bar",
    log:"selector-unified-log"
  };

  const LEGACY_PANEL_IDS=["copilot-panel","capex-panel"];

  const PAGE_CONFIGS={
    REACT:{
      key:"REACT",
      title:"Buscador de flujos de fondos",
      detect:()=>{
        return Boolean(
          document.querySelector('[role="gridcell"]')
          && document.querySelector('[data-checkbox-name="rowSelection"] input[type="checkbox"]')
          && (
            document.querySelector('.ReactVirtualized__Grid__innerScrollContainer')
            || document.querySelector('.ReactVirtualized__Grid')
          )
        );
      },
      checkboxSelector:'[data-checkbox-name="rowSelection"] input[type="checkbox"]',
      amountSelector:'[class*="SingleAmountWithOptionalCurrency"]',
      storageKeys:["selector-unified-input-react","copilot-input","capex-input"]
    },
    E_ZAHLUNG:{
      key:"ENVIOS",
      title:"Buscador de pagos firmados",
      detect:()=>{
        return Boolean(
          document.querySelector('input[name="e_Zahlung"]')
          && (document.querySelector("tr.listeHG1")||document.querySelector("tr.listeHG2"))
        );
      },
      checkboxSelector:'input[name="e_Zahlung"]',
      rowsSelector:"tr.listeHG1, tr.listeHG2",
      storageKeys:["selector-unified-input-e_zahlung","capex-input","copilot-input"]
    },
    MARKIERT:{
      key:"PAGOS",
      title:"Buscador de pagos masivos",
      detect:()=>{
        return Boolean(
          document.querySelector('input[name="markiert"]')
          && (document.querySelector("tr.listeHG1")||document.querySelector("tr.listeHG2"))
        );
      },
      checkboxSelector:'input[name="markiert"]',
      rowsSelector:"tr.listeHG1, tr.listeHG2",
      storageKeys:["selector-unified-input-markiert","capex-input","copilot-input"]
    }
  };

  const runtime={
    running:true,
    stop:false,
    processing:false,
    profile:null,
    panel:null,
    ui:null
  };
  window[RUNTIME_KEY]=runtime;

  const detectPage=()=>{
    if(PAGE_CONFIGS.REACT.detect()) return PAGE_CONFIGS.REACT;
    if(PAGE_CONFIGS.E_ZAHLUNG.detect()) return PAGE_CONFIGS.E_ZAHLUNG;
    if(PAGE_CONFIGS.MARKIERT.detect()) return PAGE_CONFIGS.MARKIERT;
    return null;
  };

  const normalizeAmount=(value)=>{
    const raw=String(value||"")
      .replace(/\u00A0/g,"")
      .replace(/\s+/g,"")
      .replace(/[^\d,.-]/g,"");
    if(!raw) return NaN;
    const normalized=raw.replace(/\./g,"").replace(",", ".");
    const out=Number(normalized);
    return Number.isNaN(out)?NaN:out;
  };

  const isIgnoredLine=(line)=>/^###\s*JIRA:/i.test(String(line||"").trim());

  const isDateLike=(token)=>/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(token);
  const isYearLike=(token)=>/^(19|20)\d{2}$/.test(token);

  const scoreAmountToken=(token)=>{
    if(!token) return -999;
    if(isDateLike(token)) return -999;

    let score=0;
    if(/^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(token)) score+=120;
    if(/^-?\d{1,3}(?:\.\d{3})+$/.test(token)) score+=100;
    if(/^-?\d+(?:,\d{1,2})$/.test(token)) score+=90;
    if(/^-?\d+(?:\.\d{2})$/.test(token)) score+=75;
    if(/^-?\d+$/.test(token)) score+=35;

    if(isYearLike(token)) score-=80;
    if(/^\d{1,2}$/.test(token)) score-=25;

    return score;
  };

  const extractAmountFromLine=(line)=>{
    if(!line) return NaN;

    const chunks=String(line)
      .split(/\t|;|\|/)
      .map((s)=>s.trim())
      .filter(Boolean);

    const candidates=[];

    const collectCandidates=(text)=>{
      const matches=String(text).match(/-?\d[\d.,]*/g)||[];
      matches.forEach((token)=>{
        const cleanToken=token.trim();
        const score=scoreAmountToken(cleanToken);
        if(score<=-500) return;
        candidates.push({token:cleanToken,score,length:cleanToken.length});
      });
    };

    chunks.forEach(collectCandidates);
    if(!candidates.length) collectCandidates(String(line));
    if(!candidates.length) return NaN;

    candidates.sort((a,b)=>{
      if(b.score!==a.score) return b.score-a.score;
      return b.length-a.length;
    });

    const parsed=normalizeAmount(candidates[0].token);
    return Number.isNaN(parsed)?NaN:parsed;
  };

  const toCents=(n)=>Math.round(n*100);
  const fromCents=(c)=>c/100;
  const formatCents=(c)=>fromCents(c).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2});

  const parseInputLines=(rawText)=>{
    return String(rawText||"")
      .split(/\r?\n/)
      .map((line)=>line.trim())
      .filter((line)=>line&&!isIgnoredLine(line));
  };

  const buildTargetCounts=(rawText)=>{
    const targetCounts={};
    const rawByCents={};
    let totalExpected=0;
    const lines=parseInputLines(rawText);

    lines.forEach((line)=>{
      const value=extractAmountFromLine(line);
      if(Number.isNaN(value)) return;
      const cents=toCents(value);
      targetCounts[cents]=(targetCounts[cents]||0)+1;
      if(!rawByCents[cents]) rawByCents[cents]=[];
      rawByCents[cents].push(line);
      totalExpected+=1;
    });

    return {targetCounts,rawByCents,totalExpected};
  };

  const buildMissingDetailed=(targetCounts,selectedCounts)=>{
    const missing=[];
    Object.keys(targetCounts).forEach((k)=>{
      const expected=targetCounts[k]||0;
      const selected=selectedCounts[k]||0;
      if(selected<expected){
        missing.push({
          cents:Number(k),
          expected,
          selected,
          missing:expected-selected
        });
      }
    });
    return missing.sort((a,b)=>a.cents-b.cents);
  };

  const buildExceededDetailed=(targetCounts,foundCounts)=>{
    const exceeded=[];
    Object.keys(foundCounts).forEach((k)=>{
      const found=foundCounts[k]||0;
      const expected=targetCounts[k]||0;
      if(found>expected){
        exceeded.push({
          cents:Number(k),
          found,
          expected,
          excess:found-expected
        });
      }
    });
    return exceeded.sort((a,b)=>a.cents-b.cents);
  };

  const getStoredInput=(profile)=>{
    for(const key of profile.storageKeys){
      const value=localStorage.getItem(key);
      if(value) return value;
    }
    return "";
  };

  const setStoredInput=(profile,value)=>{
    if(profile.storageKeys.length){
      localStorage.setItem(profile.storageKeys[0],value);
    }
    if(profile.key==="REACT"){
      localStorage.setItem("copilot-input",value);
    }else{
      localStorage.setItem("capex-input",value);
    }
  };

  const clearStoredInput=(profile)=>{
    profile.storageKeys.forEach((key)=>localStorage.removeItem(key));
    if(profile.key==="REACT"){
      localStorage.removeItem("copilot-input");
    }else{
      localStorage.removeItem("capex-input");
    }
  };

  const copyToClipboard=async(text)=>{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return;
    }
    const area=document.createElement("textarea");
    area.value=text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  };

  const createUI=(profile)=>{
    LEGACY_PANEL_IDS.forEach((id)=>{
      const old=document.getElementById(id);
      if(old) old.remove();
    });

    const current=document.getElementById(IDS.panel);
    if(current) current.remove();

    const panel=document.createElement("div");
    panel.id=IDS.panel;
    panel.style="position:fixed;top:20px;right:20px;width:360px;background:#15171c;color:#f3f4f6;z-index:999999;padding:14px;border-radius:14px;border:1px solid #2a2f3a;font-family:'Segoe UI',Tahoma,sans-serif;box-shadow:0 14px 36px rgba(0,0,0,.45);";
    panel.innerHTML=''
      +'<div style="font-weight:600;margin-bottom:8px;letter-spacing:.2px;">'+profile.title+'</div>'
      +'<textarea id="'+IDS.input+'" style="display:block;width:100%;max-width:100%;box-sizing:border-box;height:96px;min-height:96px;max-height:180px;resize:vertical;background:#0f1115;color:#c7f9cc;border:1px solid #2f3542;border-radius:10px;padding:8px;line-height:1.35;"></textarea>'
      +'<div style="margin-top:8px;display:flex;gap:6px;">'
      +'<button id="'+IDS.run+'" title="Run" aria-label="Run" style="padding:6px 10px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;">&#9654;</button>'
      +'<button id="'+IDS.stop+'" title="Stop" aria-label="Stop" style="padding:6px 10px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;font-size:18px;line-height:1;">&#9632;</button>'
      +'<button id="'+IDS.copy+'" title="Copy" aria-label="Copy" style="padding:6px 10px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;">&#10697;</button>'
      +'<button id="'+IDS.close+'" title="Close" aria-label="Close" style="padding:6px 10px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;">&#10005;</button>'
      +'</div>'
      +'<div style="margin-top:8px;background:#2b303b;height:8px;border-radius:999px;overflow:hidden;">'
      +'<div id="'+IDS.bar+'" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#4ade80);transition:width 0.4s ease;"></div>'
      +'</div>'
      +'<div id="'+IDS.log+'" style="margin-top:8px;font-size:12px;color:#d1d5db;"></div>';

    document.body.appendChild(panel);

    const input=document.getElementById(IDS.input);
    const bar=document.getElementById(IDS.bar);
    const logEl=document.getElementById(IDS.log);

    input.value=getStoredInput(profile);

    return {
      panel,
      input,
      bar,
      logEl,
      log:(msg)=>{
        logEl.innerHTML=msg;
        console.log("[selector-unificado]",msg);
      },
      setProgress:(done,total)=>{
        const pct=total?Math.round((done/total)*100):0;
        bar.style.width=pct+"%";
        return pct;
      },
      clearPanelState:()=>{
        bar.style.width="0%";
        logEl.innerHTML="";
      }
    };
  };

  const getReactRowAnchor=(cell)=>{
    const row=
      cell.closest(".StandardTableRow__standardDataRow")
      || cell.closest(".tableRow")
      || cell.closest('[role="rowgroup"]')
      || cell.parentElement;

    if(row&&row.classList&&row.classList.contains("ReactVirtualized__Grid__innerScrollContainer")){
      return cell.parentElement||null;
    }
    return row;
  };

  const getScrollableAncestor=(el)=>{
    let current=el;
    while(current&&current!==document.body){
      const style=window.getComputedStyle(current);
      const overflowY=style.overflowY;
      const canScroll=(overflowY==="auto"||overflowY==="scroll"||overflowY==="overlay");
      if(canScroll&&current.scrollHeight>current.clientHeight+2){
        return current;
      }
      current=current.parentElement;
    }
    return null;
  };

  const getReactScrollContainer=()=>{
    const probes=[
      ".ReactVirtualized__Grid__innerScrollContainer",
      ".ReactVirtualized__Grid.ReactVirtualized__List",
      ".ReactVirtualized__Grid"
    ];

    for(const selector of probes){
      const node=document.querySelector(selector);
      if(!node) continue;

      const container=getScrollableAncestor(node)||node.parentElement;
      if(container&&container.scrollHeight>container.clientHeight+2){
        return container;
      }
    }

    return null;
  };

  const collectReactVisibleRows=(profile)=>{
    const cells=[...document.querySelectorAll('[role="gridcell"]')];
    const rows=[];

    cells.forEach((cell)=>{
      const y=cell.getBoundingClientRect().top;
      let row=rows.find((r)=>Math.abs(r.y-y)<3);
      if(!row){
        row={y,amountCents:null,checkbox:null,rowEl:getReactRowAnchor(cell)};
        rows.push(row);
      }

      const amountEl=cell.querySelector(profile.amountSelector);
      if(amountEl){
        const value=normalizeAmount((amountEl.innerText||"").trim());
        if(!Number.isNaN(value)) row.amountCents=toCents(value);
      }

      const checkbox=cell.querySelector(profile.checkboxSelector);
      if(checkbox) row.checkbox=checkbox;
    });

    return rows;
  };

  const markClassicRow=(row,checkbox,kind)=>{
    if(!row||!checkbox) return;
    if(kind==="duplicate"){
      checkbox.style.outline="2px solid red";
      row.style.background="#ffcccc";
      row.dataset.selectorUnifiedMark="duplicate";
      return;
    }
    checkbox.style.outline="2px solid #90EE90";
    row.style.background="#90EE90";
    row.dataset.selectorUnifiedMark="selected";
  };

  const clearClassicRowMarks=(rows,checkboxSelector)=>{
    rows.forEach((row)=>{
      row.style.background="";
      delete row.dataset.selectorUnifiedMark;
    });

    document.querySelectorAll(checkboxSelector).forEach((cb)=>{
      cb.style.outline="";
    });
  };

  const resetSelections=(profile,ui)=>{
    runtime.stop=true;

    if(profile.key==="REACT"){
      document.querySelectorAll(`${profile.checkboxSelector}:checked`).forEach((cb)=>{
        try{ cb.click(); }
        catch(_){ cb.checked=false; }
      });

      document.querySelectorAll('[data-selector-unified-mark]').forEach((el)=>{
        delete el.dataset.selectorUnifiedMark;
      });

      document.querySelectorAll(profile.checkboxSelector).forEach((cb)=>{
        cb.style.outline="";
      });
    }else{
      const rows=[...document.querySelectorAll(profile.rowsSelector)];
      document.querySelectorAll(profile.checkboxSelector).forEach((cb)=>{
        cb.checked=false;
      });
      clearClassicRowMarks(rows,profile.checkboxSelector);
    }

    ui.clearPanelState();
    ui.input.value="";
    clearStoredInput(profile);
    ui.log("RESET COMPLETO");
  };

  const copySelectionReact=async(profile)=>{
    const selected=[...document.querySelectorAll(`${profile.checkboxSelector}:checked`)];
    if(!selected.length){
      alert("No hay seleccion");
      return;
    }

    const lines=[];
    selected.forEach((cb)=>{
      const row=cb.closest('[role="row"]')||cb.closest("div");
      if(!row) return;
      const values=[...row.querySelectorAll('[role="gridcell"]')]
        .map((el)=>(el.innerText||"").replace(/\s+/g," ").trim())
        .filter(Boolean);
      if(values.length) lines.push(values.join("\t"));
    });

    if(!lines.length){
      alert("No hay seleccion");
      return;
    }

    await copyToClipboard(lines.join("\n"));
    alert("Seleccion copiada");
  };

  const copySelectionClassic=async(profile)=>{
    const rows=[...document.querySelectorAll(profile.rowsSelector)];
    const lines=[];

    rows.forEach((row)=>{
      const cb=row.querySelector(profile.checkboxSelector);
      if(!cb||!cb.checked) return;

      const values=[...row.querySelectorAll("td")]
        .map((cell)=>cell.textContent.replace(/\s+/g," ").trim())
        .filter(Boolean)
        .map((value)=>`"${value}"`);

      if(values.length) lines.push(values.join("\t"));
    });

    if(!lines.length){
      alert("No hay seleccion");
      return;
    }

    await copyToClipboard(lines.join("\n"));
    alert("Seleccion copiada");
  };

  const copySelection=async(profile)=>{
    try{
      if(profile.key==="REACT"){
        await copySelectionReact(profile);
      }else{
        await copySelectionClassic(profile);
      }
    }catch(error){
      console.error(error);
      alert("No se pudo copiar la seleccion");
    }
  };

  const showResults=(summary)=>{
    const {
      missingValues,
      foundValues,
      duplicateValues,
      countsText
    }=summary;

    if(!missingValues.length&&!foundValues.length&&!duplicateValues.length){
      return;
    }

    const overlay=document.createElement("div");
    overlay.style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999999;display:flex;align-items:center;justify-content:center;";

    const modal=document.createElement("div");
    modal.style="background:#15171c;color:#f3f4f6;padding:14px;border-radius:14px;width:460px;max-width:92vw;font-family:'Segoe UI',Tahoma,sans-serif;border:1px solid #2a2f3a;box-shadow:0 14px 36px rgba(0,0,0,.45);";

    const missingText=missingValues.join("\n");
    const foundText=foundValues.join("\n");
    const duplicateText=duplicateValues.join("\n");

    modal.innerHTML=''
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +'<div style="font-weight:600;letter-spacing:.2px;">Resumen de seleccion</div>'
      +'<div style="font-size:12px;color:#c9ced8;">'+countsText+'</div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:10px;">'
      +'<div style="background:#0f1115;border:1px solid #2f3542;border-radius:10px;padding:8px;"><div style="font-size:11px;color:#9ca3af;">No encontrados</div><div style="font-size:16px;font-weight:700;color:#86efac;">'+missingValues.length+'</div></div>'
      +'<div style="background:#0f1115;border:1px solid #2f3542;border-radius:10px;padding:8px;"><div style="font-size:11px;color:#9ca3af;">Encontrados</div><div style="font-size:16px;font-weight:700;color:#93c5fd;">'+foundValues.length+'</div></div>'
      +'<div style="background:#0f1115;border:1px solid #2f3542;border-radius:10px;padding:8px;"><div style="font-size:11px;color:#9ca3af;">Duplicados</div><div style="font-size:16px;font-weight:700;color:#f9a8d4;">'+duplicateValues.length+'</div></div>'
      +'</div>'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:5px;">No encontrados</div>'
      +'<textarea id="selector-unified-missing" style="width:100%;height:74px;background:#0f1115;color:#c7f9cc;border:1px solid #2f3542;border-radius:10px;padding:8px;line-height:1.35;margin-bottom:6px;">'+missingText+'</textarea>'
      +'<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button id="selector-unified-copy-missing" style="padding:5px 9px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;">COPY</button></div>'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:5px;">Encontrados</div>'
      +'<textarea id="selector-unified-found" style="width:100%;height:74px;background:#0f1115;color:#9cf;border:1px solid #2f3542;border-radius:10px;padding:8px;line-height:1.35;margin-bottom:6px;">'+foundText+'</textarea>'
      +'<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button id="selector-unified-copy-found" style="padding:5px 9px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;">COPY</button></div>'
      +'<div style="font-size:12px;font-weight:600;margin-bottom:5px;">Duplicados</div>'
      +'<textarea id="selector-unified-duplicates" style="width:100%;height:74px;background:#0f1115;color:#f9a;border:1px solid #2f3542;border-radius:10px;padding:8px;line-height:1.35;margin-bottom:8px;">'+duplicateText+'</textarea>'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
      +'<button id="selector-unified-copy-duplicates" style="padding:5px 9px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;">COPY DUP</button>'
      +'<button id="selector-unified-close-results" style="padding:5px 9px;border-radius:8px;border:1px solid #2f3542;background:#1f2937;color:#f8fafc;">Cerrar</button>'
      +'</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const missingEl=modal.querySelector("#selector-unified-missing");
    const foundEl=modal.querySelector("#selector-unified-found");
    const duplicateEl=modal.querySelector("#selector-unified-duplicates");

    modal.querySelector("#selector-unified-copy-missing").onclick=async()=>{
      await copyToClipboard(missingEl.value);
    };
    modal.querySelector("#selector-unified-copy-found").onclick=async()=>{
      await copyToClipboard(foundEl.value);
    };
    modal.querySelector("#selector-unified-copy-duplicates").onclick=async()=>{
      await copyToClipboard(duplicateEl.value);
    };
    modal.querySelector("#selector-unified-close-results").onclick=()=>{
      overlay.remove();
    };
  };

  const runReactVirtualized=async(profile,targets,ui)=>{
    const container=getReactScrollContainer();
    if(!container){
      ui.log("No contenedor scrolleable");
      return null;
    }

    const selectedCounts={};
    const foundCounts={};
    const selectedRows=[];
    const processedRows=new Set();

    let selectedTotal=0;
    let loops=0;
    let idleLoops=0;
    let lastScrollTop=-1;
    const MAX_LOOPS=200;

    const renderProgress=(pct)=>`cazando capex ... ${pct}% (${selectedTotal}/${targets.totalExpected})`;
    ui.log(renderProgress(0));

    while(selectedTotal<targets.totalExpected&&!runtime.stop&&loops<MAX_LOOPS){
      const visibleRows=collectReactVisibleRows(profile);

      visibleRows.forEach((row)=>{
        if(row.amountCents===null||!row.checkbox) return;
        if(processedRows.has(row.checkbox)) return;
        processedRows.add(row.checkbox);

        const cents=row.amountCents;
        if(!targets.targetCounts[cents]) return;

        foundCounts[cents]=(foundCounts[cents]||0)+1;

        const expected=targets.targetCounts[cents]||0;
        const selectedForAmount=selectedCounts[cents]||0;
        if(selectedForAmount<expected){
          if(!row.checkbox.checked) row.checkbox.click();
          selectedCounts[cents]=(selectedCounts[cents]||0)+1;
          selectedRows.push(row);
          selectedTotal+=1;
          row.checkbox.style.outline="2px solid #90EE90";
          if(row.rowEl){
            row.rowEl.dataset.selectorUnifiedMark="selected";
          }
          return;
        }

        row.checkbox.style.outline="2px solid red";
        if(row.rowEl){
          row.rowEl.dataset.selectorUnifiedMark="duplicate";
        }
      });

      const pct=ui.setProgress(selectedTotal,targets.totalExpected);
      ui.log(renderProgress(pct));

      container.scrollBy(0,container.clientHeight*0.8);
      await new Promise((resolve)=>setTimeout(resolve,250));

      if(container.scrollTop===lastScrollTop){
        idleLoops+=1;
        if(idleLoops>5){
          ui.log("Fin scroll");
          break;
        }
      }else{
        idleLoops=0;
      }

      lastScrollTop=container.scrollTop;
      loops+=1;
    }

    const exceeded=buildExceededDetailed(targets.targetCounts,foundCounts);
    const missing=buildMissingDetailed(targets.targetCounts,selectedCounts);

    ui.log(`Final ${selectedTotal}/${targets.totalExpected} loops:${loops}`);

    if(exceeded.length){
      const details=exceeded
        .map((item)=>`${formatCents(item.cents)} | encontrados:${item.found} | esperados:${item.expected} | exceso:${item.excess}`)
        .join("\n");
      alert("Exceso de coincidencias:\n"+details);
    }

    return {
      selectedCounts,
      foundCounts,
      missing,
      exceeded,
      selectedTotal,
      totalExpected:targets.totalExpected
    };
  };

  const extractClassicAmount=(profile,row)=>{
    const numericCells=[...row.querySelectorAll("td.cssNumerisch")];
    if(!numericCells.length) return NaN;

    if(profile.key==="E_ZAHLUNG"){
      if(numericCells.length<2) return NaN;
      return normalizeAmount(numericCells[1].textContent);
    }

    const cell=[...numericCells].reverse().find((td)=>td.innerText.includes(","));
    if(!cell) return NaN;
    return normalizeAmount(cell.innerText);
  };

  const runClassicPage=(profile,targets,ui)=>{
    const rows=[...document.querySelectorAll(profile.rowsSelector)];
    const foundRowsByCents={};

    ui.log("Procesando filas...");

    rows.forEach((row)=>{
      if(runtime.stop) return;

      const checkbox=row.querySelector(profile.checkboxSelector);
      if(!checkbox) return;

      const amount=extractClassicAmount(profile,row);
      if(Number.isNaN(amount)) return;

      const cents=toCents(amount);
      if(!targets.targetCounts[cents]) return;

      if(!checkbox.checked) checkbox.click();
      if(!foundRowsByCents[cents]) foundRowsByCents[cents]=[];
      foundRowsByCents[cents].push({row,checkbox});
    });

    const selectedCounts={};
    const foundCounts={};
    let selectedTotal=0;

    Object.keys(foundRowsByCents).forEach((k)=>{
      const cents=Number(k);
      const rowsForAmount=foundRowsByCents[k]||[];
      const expected=targets.targetCounts[k]||0;
      const found=rowsForAmount.length;

      foundCounts[k]=found;

      if(found>expected){
        rowsForAmount.forEach(({row,checkbox})=>markClassicRow(row,checkbox,"duplicate"));
        selectedCounts[k]=expected;
      }else{
        rowsForAmount.forEach(({row,checkbox})=>markClassicRow(row,checkbox,"selected"));
        selectedCounts[k]=found;
        selectedTotal+=found;
      }
    });

    const missing=buildMissingDetailed(targets.targetCounts,selectedCounts);
    const exceeded=buildExceededDetailed(targets.targetCounts,foundCounts);

    const pct=ui.setProgress(selectedTotal,targets.totalExpected);

    if(exceeded.length&&profile.key==="REACT"){
      const details=exceeded.map((item)=>`${formatCents(item.cents)} (${item.found} veces)`).join("\n");
      alert("Duplicados:\n"+details);
    }

    if(missing.length&&profile.key==="REACT"){
      const missingValues=[];
      missing.forEach((item)=>{
        for(let i=0;i<item.missing;i+=1){
          missingValues.push(formatCents(item.cents));
        }
      });
      alert("No encontrados:\n"+missingValues.join("\n"));
    }

    if(!missing.length&&!exceeded.length){
      ui.log("Todos encontrados");
    }

    ui.log(`${selectedTotal}/${targets.totalExpected} (${pct}%)`);

    return {
      selectedCounts,
      foundCounts,
      missing,
      exceeded,
      selectedTotal,
      totalExpected:targets.totalExpected
    };
  };

  const buildSummaryForResults=(result)=>{
    const missingValues=[];
    result.missing.forEach((item)=>{
      for(let i=0;i<item.missing;i+=1){
        missingValues.push(formatCents(item.cents));
      }
    });

    const foundValues=[];
    Object.keys(result.selectedCounts)
      .map((k)=>Number(k))
      .sort((a,b)=>a-b)
      .forEach((cents)=>{
        const count=result.selectedCounts[cents]||0;
        for(let i=0;i<count;i+=1){
          foundValues.push(formatCents(cents));
        }
      });

    const duplicateValues=[];
    result.exceeded.forEach((item)=>{
      for(let i=0;i<item.found;i+=1){
        duplicateValues.push(formatCents(item.cents));
      }
    });

    return {
      missingValues,
      foundValues,
      duplicateValues,
      countsText:`Seleccionados ${result.selectedTotal}/${result.totalExpected}`
    };
  };

  const cleanupRuntime=()=>{
    runtime.processing=false;
    runtime.stop=true;
    runtime.running=false;
    delete window[RUNTIME_KEY];
  };

  const closePanel=()=>{
    runtime.stop=true;
    if(runtime.panel) runtime.panel.remove();
    cleanupRuntime();
  };

  const runCurrentProfile=async()=>{
    if(runtime.processing){
      alert("Ya hay un proceso en ejecucion");
      return;
    }

    runtime.processing=true;

    try{
      runtime.stop=false;
      const profile=runtime.profile;
      const ui=runtime.ui;
      const rawText=ui.input.value;
      setStoredInput(profile,rawText);

      const targets=buildTargetCounts(rawText);
      if(!targets.totalExpected){
        ui.setProgress(0,1);
        ui.log("Sin importes validos");
        runtime.processing=false;
        return;
      }

      let result;
      if(profile.key==="REACT"){
        result=await runReactVirtualized(profile,targets,ui);
      }else{
        result=runClassicPage(profile,targets,ui);
      }

      if(!result){
        runtime.processing=false;
        return;
      }

      const summary=buildSummaryForResults(result);
      showResults(summary);
    }catch(error){
      console.error(error);
      if(runtime.ui) runtime.ui.log("Error");
    }

    runtime.processing=false;
  };

  const main=()=>{
    const profile=detectPage();
    if(!profile){
      alert("Pagina no compatible con este selector unificado");
      cleanupRuntime();
      return;
    }

    runtime.profile=profile;
    runtime.ui=createUI(profile);
    runtime.panel=runtime.ui.panel;

    document.getElementById(IDS.run).onclick=()=>{ runCurrentProfile(); };
    document.getElementById(IDS.stop).onclick=()=>{ resetSelections(profile,runtime.ui); };
    document.getElementById(IDS.copy).onclick=()=>{ copySelection(profile); };
    document.getElementById(IDS.close).onclick=()=>{ closePanel(); };

    const modeLabel=profile.key==="REACT"?"Cash Flows":profile.key;
    runtime.ui.log("Modo detectado: "+modeLabel);
  };

  main();
})();
