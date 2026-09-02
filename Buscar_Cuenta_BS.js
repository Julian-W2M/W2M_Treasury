javascript:(()=>{
    const txt = prompt("Numero de cuenta o ultimos digitos:");
    if (!txt) return;

    const busca = txt.replace(/\s+/g, "");

    let encontrado = false;

    document.querySelectorAll("#orderAccountList a, a").forEach(a => {
        const texto = a.textContent.replace(/\s+/g, "");
        if (texto.includes(busca)) {
            a.click();
            encontrado = true;
        }
    });

    if (encontrado) return;

    const selects = document.querySelectorAll("select");

    for (const sel of selects) {
        const opcion = [...sel.options].find(opt =>
            opt.textContent.replace(/\s+/g, "").includes(busca)
        );

        if (opcion) {
            sel.value = opcion.value;

            sel.dispatchEvent(new Event("change", {
                bubbles: true
            }));

            encontrado = true;
            break;
        }
    }

    if (!encontrado) {
        alert("Cuenta no encontrada");
    }
})();