// --- pdfplantilla.js ---
;(function () {

  /* ▶▶ reemplaza SOLO este valor por tu cadena base-64 ◀◀ */
  const LOGO_B64 = 'data:image/png;base64,PASTE_AQUI_TU_BASE64';

  const tpl = document.createElement('template');
  tpl.id = 'tpl-pdf-descarga';
  tpl.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    .sheet{width:572pt}

    header{background:#005aa7;color:#fff;padding:12pt 20pt;display:flex;align-items:center;gap:14pt}
    header img.logo{width:60pt;height:auto}
    header h1{font-size:14pt;font-weight:700;line-height:1.25;word-break:break-word}

    table{width:100%;border-collapse:collapse;margin:18pt 0}
    th,td{border:1px solid #bfc7d1;padding:6pt 8pt;vertical-align:top;word-break:break-word;white-space:normal}
    th{background:#005aa7;color:#fff;text-align:left;font-weight:700}
    thead th:nth-child(1),tbody td:nth-child(1){width:35%}
    thead th:nth-child(2),tbody td:nth-child(2){width:65%}
    tr:nth-child(even) td{background:#f5f9ff}
    td a{display:inline-block;word-break:break-word;white-space:normal;color:#005aa7;text-decoration:underline}

    footer{font-size:9pt;text-align:right;margin-top:24pt}
  </style>

  <div class="sheet">
    <header>
      <img src="${LOGO_B64}" alt="Logo" class="logo">
      <h1>Reporte&nbsp;de&nbsp;Descarga<br>de&nbsp;Combustible</h1>
    </header>

    <table>
      <thead><tr><th>Campo</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>Agrupación</td>       <td id="p-agrupacion"></td></tr>
        <tr><td>Fecha y Hora</td>     <td id="p-fecha"></td></tr>
        <tr><td>Localización</td>     <td id="p-localizacion"></td></tr>
        <tr><td>Nivel inicial</td>    <td id="p-nivel-inicial"></td></tr>
        <tr><td>Litros Descargados</td><td id="p-litros"></td></tr>
        <tr><td>Nivel final</td>      <td id="p-nivel-final"></td></tr>
      </tbody>
    </table>

    <footer id="p-generado"></footer>
  </div>`;
  document.body.appendChild(tpl);

  /* … el resto de generatePdf queda exactamente igual … */
  window.generatePdf = async function (cellsArray) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'position:fixed;top:0;left:0;width:572pt;z-index:-9999;pointer-events:none;';
    wrapper.appendChild(
      document.getElementById('tpl-pdf-descarga').content.cloneNode(true)
    );
    document.body.appendChild(wrapper);

    const texts = cellsArray.map(td => td.textContent.trim());
    const htmls = cellsArray.map(td => td.innerHTML.trim());

    wrapper.querySelector('#p-agrupacion'   ).textContent = texts[0];
    wrapper.querySelector('#p-fecha'        ).textContent = texts[1];
    wrapper.querySelector('#p-localizacion' ).innerHTML   = htmls[2];
    wrapper.querySelector('#p-nivel-inicial').textContent = texts[3];
    wrapper.querySelector('#p-litros'       ).textContent = texts[4];
    wrapper.querySelector('#p-nivel-final'  ).textContent = texts[5];
    wrapper.querySelector('#p-generado'     ).textContent =
      'Generado: ' + new Date().toLocaleString('es-MX');

    const { jsPDF } = window.jspdf;
    const SCALE=1.25, MARGIN=20;
    const doc = new jsPDF({unit:'pt',format:'letter',hotfixes:['px_scaling']});

    await doc.html(wrapper,{
      margin:[MARGIN,MARGIN,MARGIN,MARGIN],
      autoPaging:'text',
      enableLinks:false,
      html2canvas:{scale:SCALE,useCORS:true,allowTaint:true,backgroundColor:'#fff'}
    });

    wrapper.querySelectorAll('a[href]').forEach(a=>{
      const r=a.getBoundingClientRect();
      const x=r.left*SCALE+MARGIN, y=r.top*SCALE+MARGIN;
      doc.link(x,y,r.width*SCALE,r.height*SCALE,{url:a.href});
    });

    const fname='descarga_'+texts[0].replace(/\\s+/g,'_')+'_'+texts[1].replace(/[^0-9]/g,'')+'.pdf';
    doc.save(fname);
    document.body.removeChild(wrapper);
  };
})();
