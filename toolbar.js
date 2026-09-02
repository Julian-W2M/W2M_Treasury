(()=>{
    if(document.getElementById("w2m-toolbar")) return;

    const bar=document.createElement("div");

    bar.id="w2m-toolbar";

    bar.style.cssText=`
        position:fixed;
        top:20px;
        right:20px;
        background:#1f1f1f;
        padding:10px;
        border-radius:10px;
        z-index:999999;
        display:flex;
        flex-direction:column;
        gap:5px;
    `;

    document.body.appendChild(bar);

    function crearBoton(nombre,archivo){

        const btn=document.createElement("button");

        btn.textContent=nombre;

        btn.onclick=async()=>{

            try{

                const codigo=await fetch(
                    `https://raw.githubusercontent.com/Julian-W2M/W2M_Treasury/main/${archivo}`
                ).then(r=>r.text());

                eval(codigo);

            }catch(err){
                console.error(err);
                alert("Error ejecutando "+nombre);
            }
        };

        bar.appendChild(btn);
    }

    crearBoton("Copiar Jira","Copiar_Jira.js");
    crearBoton("Cerrar Jira","Cerrar_jira.js");
    crearBoton("Buscar Cuenta","Buscar_Cuenta_BS.js");
    crearBoton("Firmas","Firmas_pendientes_BS.js");
    crearBoton("Importes","Selector_de_Importes_Unificado.js");

})();
