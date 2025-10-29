const SHEET_ID = '1v9tdhvtHJHHg2fR7masGKStwsu7fIRDSVZz-01ljARQ';
const API_KEY  = 'AIzaSyC87Q8cqDQHmfWE8crKfyLUfY_KUk78Pb4';
const TAB_MAP = {
  'CONSUMO TOTAL'           : '#consumo-total tbody',
  'CONSUMO EN RALENTI'      : '#consumo-ralenti tbody',
  'LLENADOS DE COMBUSTIBLE' : '#llenados-combustible tbody',
  'DESCARGAS DE COMBUSTIBLE': '#descargas-combustible tbody',
  'NIVELES FUEL'            : '#niveles-fuel tbody'
};

const SKIP_COLS = {
  'DESCARGAS DE COMBUSTIBLE': [6,7,8,9,10,11,12,13,14,15,16],
  'LLENADOS DE COMBUSTIBLE' : [6]
};

const ROUND_INT_TABS = new Set([
  'LLENADOS DE COMBUSTIBLE',
  'DESCARGAS DE COMBUSTIBLE'
]);

const SESSION_SD_KEY = 'FC_SD';

function getCurrentSD(){
  let sd = (sessionStorage.getItem(SESSION_SD_KEY) || '').trim().toUpperCase();
  if (sd) return sd;

  const userKeys = ['FC_USER','USER','USERNAME','USUARIO','login_user','current_user'];
  for (const k of userKeys){
    const u = (sessionStorage.getItem(k) || '').trim().toUpperCase();
    if (u){
      const m = u.match(/^([A-Z0-9]{4})/);
      if (m){
        sd = m[1];
        sessionStorage.setItem(SESSION_SD_KEY, sd);
        return sd;
      }
    }
  }

  const qs    = new URLSearchParams(location.search);
  const uParam = (qs.get('user') || qs.get('usuario') || qs.get('u') || '').trim().toUpperCase();
  if (uParam){
    const m = uParam.match(/^([A-Z0-9]{4})/);
    if (m){
      sd = m[1];
      sessionStorage.setItem(SESSION_SD_KEY, sd);
      return sd;
    }
  }
  const sdUrl = (qs.get('sd') || '').trim().toUpperCase();
  if (sdUrl){
    sessionStorage.setItem(SESSION_SD_KEY, sdUrl);
    return sdUrl;
  }

  return '';
}

function extractSDFromFirstCell(txt){
  const m = (txt || '').toUpperCase().match(/[A-Z0-9]{4}/);
  return m ? m[0] : '';
}

function applySDFilter(rows){
  const SD = getCurrentSD();
  if (!SD) return [];
  if (!rows || rows.length < 2) return rows || [];
  const out = [ rows[0] ];
  for (let i=1;i<rows.length;i++){
    const r = rows[i];
    if (extractSDFromFirstCell(r[0]||'') === SD) out.push(r);
  }
  return out;
}

let rowsLlenados  = [];
let rowsDescargas = [];
let chartNiveles  = null;
let chartsReady   = false;
let gReady        = false;

async function fetchTab(tab){
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'${encodeURIComponent(tab)}'?majorDimension=ROWS&key=${API_KEY}`;
  const r   = await fetch(url);
  if(!r.ok){ console.error('fetch',tab,r.status); return []; }
  return (await r.json()).values || [];
}

const numRe = /^[+-]?\d+(\.\d+)?$/;
function formatNumber(v,tab){
  const t = (v??'').trim();
  if(!numRe.test(t)) return v;
  const n = parseFloat(t);
  if(ROUND_INT_TABS.has(tab)){
    const f = Math.abs(n%1);
    return (f>=0.5?Math.round(n):Math.trunc(n)).toString();
  }
  return n.toFixed(2);
}

function durToSec(txt = '') {
  const m = txt.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
}

function isEventRow(tab, row, h) {
  if (tab === 'LLENADOS DE COMBUSTIBLE') {
    const find = kws => h.findIndex(c => kws.some(k => c.includes(k)));
    const il = find(['litros cargados','lts cargados','cargados']);
    const ic = find(['cargas']);
    return (il > -1 && ic > -1) ? (+row[il] > 0 || +row[ic] > 0) : true;
  }

  if (tab === 'DESCARGAS DE COMBUSTIBLE') {
    const find = kws => h.findIndex(c => kws.some(k => c.includes(k)));
    const vi = find(['velocidad inicial','vel. inicial','v inicial']);
    const vf = find(['velocidad final','vel. final','v final']);
    if ((vi > -1 && +row[vi] > 0) || (vf > -1 && +row[vf] > 0)) return false;

    const il      = find(['litros descargados','lts descargados','descargados']);
    const durIdx  = find(['tiempo descarga','tiempo de descarga','duración descarga','duracion descarga']);
    const litros  = il     > -1 ? (+row[il]     || 0)          : 0;

    if (durIdx > -1) {
      const durSeg  = durToSec(row[durIdx] || '');
      if (durSeg === 0) return false;

      const MUY_CORTO = durSeg <  300 && litros < 20;
      const MUY_LARGO = durSeg > 3600 && litros < 50;
      if (MUY_CORTO || MUY_LARGO) return false;
    }

    return litros > 0;
  }

  return true;
}

function parseFechaHora(txt){
  txt = (txt ?? '').trim();
  if(!txt) return null;

  txt = txt.replace(/a\.?\s*m\.?/i,'AM').replace(/p\.?\s*m\.?/i,'PM');

  let m = txt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if(m){
    let [ ,Y,M,D,h,mi,s='00',ap ] = m;
    let hh = parseInt(h,10);
    if(ap){ if(ap.toUpperCase()==='PM'&&hh<12) hh+=12; if(ap.toUpperCase()==='AM'&&hh===12) hh=0; }
    return new Date(`${Y}-${M}-${D}T${String(hh).padStart(2,'0')}:${mi}:${s}`);
  }
  m = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if(m){
    let [ ,D,M,Y,h,mi,s,ap ] = m;
    let hh = parseInt(h,10);
    if(ap){ if(ap.toUpperCase()==='PM'&&hh<12) hh+=12; if(ap.toUpperCase()==='AM'&&hh===12) hh=0; }
    return new Date(`${Y}-${M}-${D}T${String(hh).padStart(2,'0')}:${mi}:${s}`);
  }
  const iso = new Date(txt.replace(' ','T'));
  return isNaN(iso) ? null : iso;
}

async function downloadPdfByRow(tr){
  const jsPdfCtor = window.jspdf?.jsPDF || window.jsPDF;
  if(!jsPdfCtor){
    alert('jsPDF aún no está cargado');
    return;
  }

  const tpl = document.getElementById('tpl-pdf-descarga');
  if(!tpl){
    alert('Plantilla tpl-pdf-descarga no encontrada');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.position      = 'fixed';
  wrapper.style.top           = '0';
  wrapper.style.left          = '0';
  wrapper.style.width         = '572pt';
  wrapper.style.zIndex        = '-9999';
  wrapper.style.pointerEvents = 'none';
  wrapper.appendChild(tpl.content.cloneNode(true));
  document.body.appendChild(wrapper);

  const $ = sel => wrapper.querySelector(sel);
  const c = [...tr.cells].map(td => td.textContent.trim());

  $('#p-agrupacion'   ).textContent = c[0];
  $('#p-fecha'        ).textContent = c[1];
  $('#p-localizacion' ).textContent = c[2];
  $('#p-nivel-inicial').textContent = c[3];
  $('#p-litros'       ).textContent = c[4];
  $('#p-nivel-final'  ).textContent = c[5];
  $('#p-generado'     ).textContent =
      'Generado: ' + new Date().toLocaleString('es-MX');

  const doc = new jsPdfCtor({ unit:'pt', format:'letter', hotfixes:['px_scaling'] });

  try{
    await doc.html(wrapper, {
      margin:[20,20,20,20],
      autoPaging:'text',
      html2canvas:{
        scale:1.25,
        useCORS:true,
        allowTaint:true,
        backgroundColor:'#ffffff'
      }
    });

    const enlace = wrapper.querySelector('#p-localizacion a');
    if (enlace) {
      const href  = enlace.href;
      const texto = enlace.textContent.trim();
      const metrics = doc.getTextDimensions(texto);
      const w = metrics.w;
      const h = metrics.h;
      const x = 60;
      const y = 120;
      doc.text(texto, x, y);
      doc.link(x, y - h, w, h, { url: href });
    }

    const fname = 'descarga_' +
      c[0].replace(/\s+/g,'_') + '_' +
      c[1].replace(/[^0-9]/g,'') + '.pdf';

    doc.save(fname);
    document.body.removeChild(wrapper);

  }catch(err){
    console.error('Error generando PDF', err);
    alert('No se pudo generar el PDF.');
  }finally{
    document.body.removeChild(wrapper);
  }
}

function refreshDescargasUI(){
  if(typeof updateDescargasMapMarkers==='function'){
    updateDescargasMapMarkers();
  }
}

function fillTable(sel, rows, tab) {
  const tbody = document.querySelector(sel);
  tbody.innerHTML = '';
  if (rows.length < 2) return;

  const h        = rows[0].map(x => x.toLowerCase());
  const locIdx   = h.findIndex(x => x.includes('localiza'));
  let   coordIdx = h.findIndex(x => x.includes('lat,lon'));
  if (coordIdx === -1) coordIdx = 17;

  const skip     = new Set(SKIP_COLS[tab] || []);
  const seen     = new Set();
  const horaSet  = new Set();

  rows.slice(1).forEach(r => {
    if (!isEventRow(tab, r, h)) return;

    const unidad = r[0] ?? '';
    const hora   = r[1] ?? '';
    const clave  = `${unidad} ${hora}`;

    if (horaSet.has(clave)) return;
    horaSet.add(clave);

    if (tab === 'CONSUMO TOTAL' || tab === 'NIVELES FUEL') {
      if (seen.has(unidad)) return;
      seen.add(unidad);
    }

    const tr = document.createElement('tr');

    r.forEach((c, i) => {
      if (skip.has(i)) return;

      const td = document.createElement('td');

      if (
        (tab === 'DESCARGAS DE COMBUSTIBLE' || tab === 'LLENADOS DE COMBUSTIBLE') &&
        i === locIdx
      ){
        const coords = (r[coordIdx] || '').trim();
        const m = coords.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);

        if (m){
          const [lat, lon] = [m[1], m[2]];
          td.textContent = 'Buscando…';

          coordsToAddress(lat, lon).then(addr=>{
            const label = `${addr} (${lat},${lon})`;
            td.innerHTML =
              `<a href="https://www.google.com/maps/?q=${lat},${lon}"
                  target="_blank" rel="noopener">${label}</a>`;
          });
        }else{
          td.textContent = coords || '—';
        }
      } else{
        td.textContent = formatNumber(c, tab);
      }

      if (i === coordIdx) td.style.display = 'none';

      tr.appendChild(td);
    });

    if (tab === 'DESCARGAS DE COMBUSTIBLE') {
      const tdPdf = document.createElement('td');
      tdPdf.innerHTML = `
        <button class="pdf-btn">
          <i class="fa-solid fa-file-pdf"></i>
        </button>`;
      tdPdf.firstElementChild.addEventListener('click', () => {
        window.generatePdf([...tr.cells]);
      });
      tr.appendChild(tdPdf);
    }

    tbody.appendChild(tr);
  });
}

function toDateOnly(txt){
  const p = txt.trim().split(' ')[0];
  return p ? new Date(p + 'T00:00:00') : null;
}

google.charts.load('current', { packages: ['gauge', 'corechart'] });

google.charts.setOnLoadCallback(() => {
  gReady       = true;
  chartsReady  = true;
  renderNivelesFuelGauges();
  refreshGraficaNiveles();
});

function drawGaugeSet(container,u,t1,t2,total){
  const wrap = document.createElement('div'); wrap.className='gauge-set';
  wrap.innerHTML = `<div class="unit-title"><i class="fa-solid fa-truck"></i>${u}</div>`;
  const gGlobal=document.createElement('div'); gGlobal.className='gauge';
  const gT1    =document.createElement('div'); gT1.className='gauge small';
  const gT2    =document.createElement('div'); gT2.className='gauge small';
  const minis  =document.createElement('div'); minis.style.display='flex'; minis.style.gap='7px';
  minis.append(gT1,gT2); wrap.append(gGlobal,minis); container.appendChild(wrap);

  const optG={width:320,height:320,min:0,max:1200,greenFrom:950,greenTo:1200,yellowFrom:251,yellowTo:949,redFrom:0,redTo:250,minorTicks:10};
  const optT={width:160,height:160,min:0,max:600, greenFrom:500,greenTo:600,yellowFrom:101,yellowTo:499,redFrom:0,redTo:100,minorTicks:5};

  new google.visualization.Gauge(gGlobal).draw(
    google.visualization.arrayToDataTable([['L','V'],['Nivel Total',total]]), optG);
  new google.visualization.Gauge(gT1).draw(
    google.visualization.arrayToDataTable([['L','V'],['Tanque 1',t1]]), optT);
  new google.visualization.Gauge(gT2).draw(
    google.visualization.arrayToDataTable([['L','V'],['Tanque 2',t2]]), optT);
}
function renderNivelesFuelGauges(){
  if(!gReady) return;
  const cont=document.getElementById('gauges-dynamic');
  cont.innerHTML='';

  const rows=[...document.querySelectorAll('#niveles-fuel tbody tr')];
  const lastIndex = rows.length - 1;
  const datos = [];

  rows.forEach((tr,idx)=>{
    if(idx===lastIndex) return;
    if(tr.style.display==='none' || tr.cells.length<3) return;

    const unidad  = tr.cells[0]?.textContent.trim() || 'Sin nombre';
    const tanque1 = parseFloat(tr.cells[1]?.textContent.trim()) || 0;
    const tanque2 = parseFloat(tr.cells[2]?.textContent.trim()) || 0;
    const total   = tanque1 + tanque2;

    datos.push({u:unidad,t1:tanque1,t2:tanque2,total});
  });

  datos.sort((a,b)=>a.u.localeCompare(b.u,'es',{numeric:true,sensitivity:'base'}));
  datos.forEach(d=>drawGaugeSet(cont,d.u,d.t1,d.t2,d.total));
}

function buildNivelDataset(unidad, start, end){
  if(!start || !end || start.toDateString() !== end.toDateString()){
    return buildDatasetEventos(unidad, start, end);
  }

  const filasPorHora = Array.from({length:24}, ()=>({
    fecha   : null,
    nivel   : null,
    litros  : 0,
    color   : '#1e88e5',
    anot    : ''
  }));

  const sameDay = d => d >= start && d <= end;

  const procesar = (rows, tipo) =>{
    if(rows.length<2) return;
    const h        = rows[0].map(x=>x.toLowerCase());
    const idxF     = h.findIndex(x=>x.includes('fecha'));
    const idxH     = h.findIndex(x=>x.includes('hora'));
    const idxU     = 0;
    const idxLit   = h.findIndex(x=>x.includes('litros'));
    const idxNivel = h.findIndex(x=>x.includes('nivel final'));

    rows.slice(1).forEach(r=>{
      let fh=''; if(idxF>-1) fh=r[idxF]??''; if(idxH>-1) fh=`${fh} ${r[idxH]??''}`.trim();
      const fecha=parseFechaHora(fh); if(!fecha||!sameDay(fecha)) return;
      if(unidad && r[idxU].trim().toLowerCase()!==unidad) return;

      const hr = fecha.getHours();
      filasPorHora[hr] = {
        fecha,
        nivel : +r[idxNivel]||0,
        litros: tipo==='LLENADO' ?  Math.abs(+r[idxLit]||0) : -Math.abs(+r[idxLit]||0),
        color : tipo==='LLENADO' ? '#05c24b' : '#d20000',
        anot  : Math.abs(+r[idxLit]||0).toString()
      };
    });
  };

  procesar(rowsLlenados ,'LLENADO');
  procesar(rowsDescargas,'DESCARGA');

  let lastNivel = null;
  for(let h=0; h<24; h++){
    if(filasPorHora[h].nivel===null) filasPorHora[h].nivel = lastNivel ?? 0;
    lastNivel = filasPorHora[h].nivel;
  }

  const data=[['Hora','Nivel',{role:'style'},{role:'annotation'}]];
  filasPorHora.forEach((f,hr)=>{ data.push([`${hr}:00`, f.nivel, f.color, f.anot]); });
  return google.visualization.arrayToDataTable(data);
}

function buildDatasetEventos(unidad,start,end){
  const filas=[];

  const proc=(rows,tipo)=>{
    if(rows.length<2) return;
    const h=rows[0].map(x=>x.toLowerCase());
    const idxF=h.findIndex(x=>x.includes('fecha'));
    const idxH=h.findIndex(x=>x.includes('hora'));
    const idxU=0;
    const idxLit=h.findIndex(x=>x.includes('litros'));
    const idxNivel=h.findIndex(x=>x.includes('nivel final'));

    rows.slice(1).forEach(r=>{
      let fh=''; if(idxF>-1) fh=r[idxF]??''; if(idxH>-1) fh=`${fh} ${r[idxH]??''}`.trim();
      const fecha=parseFechaHora(fh); if(!fecha) return;
      if(unidad&&r[idxU].trim().toLowerCase()!==unidad) return;
      if(start&&fecha<start) return;
      if(end  &&fecha>end)   return;
      filas.push({
        fecha,
        nivel:+r[idxNivel]||0,
        litros:tipo==='LLENADO'? Math.abs(+r[idxLit]||0): -Math.abs(+r[idxLit]||0),
        color:tipo==='LLENADO'? '#05c24b':'#d20000',
        anot :Math.abs(+r[idxLit]||0).toString()
      });
    });
  };
  proc(rowsLlenados ,'LLENADO');
  proc(rowsDescargas,'DESCARGA');
  filas.sort((a,b)=>a.fecha-b.fecha);
  if(!filas.length) return null;

  const data=[['Momento','Nivel',{role:'style'},{role:'annotation'}]];
  filas.forEach(f=>{
    data.push([
      f.fecha.toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}),
      f.nivel,f.color,f.anot]);
  });
  return google.visualization.arrayToDataTable(data);
}

function drawGraficaNiveles(){
  if(!chartsReady) return;
  const unidadSel=document.getElementById('unit-select').value.trim().toLowerCase();
  const ds=document.getElementById('date-start').value;
  const de=document.getElementById('date-end').value;
  const start=ds?new Date(`${ds}T00:00:00`):null;
  const end  =de?new Date(`${de}T23:59:59`):null;

  const data=buildNivelDataset(unidadSel,start,end);
  const cont=document.getElementById('grafica-niveles-chart');
  if(!data){ cont.innerHTML='<p style="text-align:center;margin-top:40px;">Sin datos para los filtros actuales.</p>'; return; }

  const opts={
    legend:'none',
    vAxis:{title:'Nivel (L)'},
    hAxis:{slantedText:true,slantedTextAngle:60},
    annotations:{alwaysOutside:false,textStyle:{fontSize:10,color:'#000'}},
    chartArea:{left:60,top:20,width:'85%',height:'70%'},
    bar:{groupWidth:'90%'}
  };
  if(!chartNiveles) chartNiveles=new google.visualization.ColumnChart(cont);
  chartNiveles.draw(data,opts);
}
function refreshGraficaNiveles(){
  const act=document.querySelector('.report-section.active');
  if(act&&act.id==='grafica-niveles') drawGraficaNiveles();
}

google.charts.load('current',{packages:['gauge','corechart']});
google.charts.setOnLoadCallback(()=>{
  gReady=true;
  chartsReady=true;
  renderNivelesFuelGauges();
  refreshGraficaNiveles();
});

function drawGaugeSet(container,u,t1,t2,total){
  const wrap=document.createElement('div');wrap.className='gauge-set';
  wrap.innerHTML=`<div class="unit-title"><i class="fa-solid fa-truck"></i>${u}</div>`;
  const gGlobal=document.createElement('div');gGlobal.className='gauge';
  const gT1=document.createElement('div');gT1.className='gauge small';
  const gT2=document.createElement('div');gT2.className='gauge small';
  const minis=document.createElement('div');minis.style.display='flex';minis.style.gap='7px';
  minis.append(gT1,gT2);wrap.append(gGlobal,minis);container.appendChild(wrap);

  const optG={width:320,height:320,min:0,max:1200,greenFrom:950,greenTo:1200,yellowFrom:251,yellowTo:949,redFrom:0,redTo:250,minorTicks:10};
  const optT={width:160,height:160,min:0,max:600,greenFrom:500,greenTo:600,yellowFrom:101,yellowTo:499,redFrom:0,redTo:100,minorTicks:5};

  new google.visualization.Gauge(gGlobal).draw(
    google.visualization.arrayToDataTable([['L','V'],['Nivel Total',total]]),optG);
  new google.visualization.Gauge(gT1).draw(
    google.visualization.arrayToDataTable([['L','V'],['Tanque 1',t1]]),optT);
  new google.visualization.Gauge(gT2).draw(
    google.visualization.arrayToDataTable([['L','V'],['Tanque 2',t2]]),optT);
}
function renderNivelesFuelGauges(){
  if(!gReady) return;
  const cont=document.getElementById('gauges-dynamic');
  cont.innerHTML='';
  const rows=[...document.querySelectorAll('#niveles-fuel tbody tr')];
  const lastIndex=rows.length-1;
  const datos=[];
  rows.forEach((tr,idx)=>{
    if(idx===lastIndex) return;
    if(tr.style.display==='none'||tr.cells.length<3) return;
    const unidad = tr.cells[0]?.textContent.trim()||'Sin nombre';
    const t1=parseFloat(tr.cells[1]?.textContent.trim())||0;
    const t2=parseFloat(tr.cells[2]?.textContent.trim())||0;
    datos.push({u:unidad,t1,t2,total:t1+t2});
  });
  datos.sort((a,b)=>a.u.localeCompare(b.u,'es',{numeric:true}));
  datos.forEach(d=>drawGaugeSet(cont,d.u,d.t1,d.t2,d.total));
}

function setNivelTimestamp(mostrar){
  const el = document.getElementById('niveles-timestamp');
  if(!el) return;
  if(mostrar){
    const ahora = new Date();
    el.textContent = 'Último cálculo de niveles: ' +
      ahora.toLocaleString('es-MX',{dateStyle:'short',timeStyle:'medium'});
  }
}

async function loadAll(){
  try{
    for (const [t, s] of Object.entries(TAB_MAP)){
      const rowsBrutos = await fetchTab(t);
      const rows       = applySDFilter(rowsBrutos);

      fillTable(s, rows, t);

      if(t==='LLENADOS DE COMBUSTIBLE')   rowsLlenados  = rows;
      if(t==='DESCARGAS DE COMBUSTIBLE')  rowsDescargas = rows;
    }

    refreshUnitOptions();

    const secDesc = document.getElementById('descargas-combustible');
    if (secDesc && secDesc.classList.contains('active')){
      if (!descargasMap && typeof initDescargasMap==='function') initDescargasMap();
      if (typeof updateDescargasMapMarkers==='function') updateDescargasMapMarkers();
    }

    refreshGraficaNiveles();

  } catch (e) {
    console.error(e);
    alert('Error al leer Google Sheet');
  }
}

document.addEventListener('DOMContentLoaded', () => { loadAll(); });

function refreshUnitOptions(){
  const s=document.getElementById('unit-select');
  const a=document.querySelector('.report-section.active');
  if(!a) return;
  const set=new Set();
  a.querySelectorAll('tbody tr').forEach(r=>set.add(r.cells[0].textContent.trim()));
  const cur=s.value;
  s.innerHTML='<option value="">-- Todas las unidades --</option>';
  [...set].sort().forEach(u=>{
    s.innerHTML += `<option${u.toLowerCase()===cur.toLowerCase()?' selected':''}>${u}</option>`;
  });
}

function filtrarFilas(){
  const unidad = document.getElementById('unit-select').value.toLowerCase();
  const s      = document.getElementById('date-start').value;
  const e      = document.getElementById('date-end').value;
  const start  = s ? new Date(`${s}T00:00:00`) : null;
  const end    = e ? new Date(`${e}T23:59:59`) : null;
  const a      = document.querySelector('.report-section.active');
  if(!a) return;

  const noFilters = !unidad && !start && !end;
  if(noFilters){
    a.querySelectorAll('tbody tr').forEach(r=>r.style.display='none');
    if(a.id==='niveles-fuel') document.getElementById('gauges-dynamic').innerHTML='';
    if(a.id==='grafica-niveles') document.getElementById('grafica-niveles-chart').innerHTML='';
    return;
  }

  let col=-1;
  a.querySelectorAll('thead th').forEach((th,i)=>{
    const txt=th.textContent.toLowerCase();
    if(txt.includes('fecha')||txt.includes('hora')) col=i;
  });

  a.querySelectorAll('tbody tr').forEach(r=>{
    const vac=[...r.cells].every(td=>{
      const v=td.textContent.trim();
      return v===''||v==='-----';
    });
    if(vac){ r.style.display='none'; return; }

    const okU=!unidad || r.cells[0].textContent.toLowerCase()===unidad;

    let okF=true;
    if(col!==-1 && (start||end)){
      const txt=r.cells[col].textContent.trim();
      if(!txt || txt==='-----') okF=false;
      else{
        const d=toDateOnly(txt);
        if(!d) okF=false;
        if(start && d<start) okF=false;
        if(end   && d>end)   return r.style.display='none';
      }
    }
    r.style.display = (okU && okF) ? '' : 'none';
  });

  if(a.id==='niveles-fuel') renderNivelesFuelGauges();
  if(a.id==='grafica-niveles') refreshGraficaNiveles();
  if (a.id === 'descargas-combustible') refreshDescargasUI();
}

document.querySelectorAll('.report-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.report-section').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.report-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(btn.dataset.target).classList.add('active');
    btn.classList.add('active');

    refreshUnitOptions();
    filtrarFilas();

    if (btn.dataset.target === 'descargas-combustible') refreshDescargasUI();
    if (btn.dataset.target === 'grafica-niveles') refreshGraficaNiveles();

    if(btn.dataset.target==='niveles-fuel'){
      renderNivelesFuelGauges();
      setNivelTimestamp(true);
    }else{
      setNivelTimestamp(false);
    }
  });
});

document.getElementById('unit-select').addEventListener('change',filtrarFilas);
document.getElementById('date-start').addEventListener('change',filtrarFilas);
document.getElementById('date-end').addEventListener('change',filtrarFilas);

document.getElementById('clear-btn').addEventListener('click',()=>{
  document.getElementById('unit-select').value='';
  document.getElementById('date-start').value='';
  document.getElementById('date-end').value='';
  refreshUnitOptions();
  filtrarFilas();
});

document.getElementById('filter-hoy').addEventListener('click', () => {
  const now   = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const d     = local.toISOString().slice(0, 10);

  document.getElementById('date-start').value = d;
  document.getElementById('date-end').value   = d;
  filtrarFilas();
});

document.getElementById('filter-ayer').addEventListener('click', () => {
  const hoy   = new Date();
  const ayer  = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
  const local = new Date(ayer.getTime() - ayer.getTimezoneOffset() * 60000);
  const d     = local.toISOString().slice(0, 10);

  document.getElementById('date-start').value = d;
  document.getElementById('date-end').value   = d;
  filtrarFilas();
});

document.getElementById('filter-mes').addEventListener('click', () => {
  const t = new Date();
  const f = new Date(t.getFullYear(), t.getMonth(), 1);
  document.getElementById('date-start').value = f.toISOString().slice(0, 10);
  document.getElementById('date-end').value   = t.toISOString().slice(0, 10);
  filtrarFilas();
});

document.getElementById('btn-mantenimiento')
  .addEventListener('click',()=>{ window.location.href = 'mantenimiento.html'; });

document.getElementById('export-excel').addEventListener('click', () => {
  if (typeof XLSX === 'undefined') {
    alert('SheetJS no se cargó correctamente.');
    return;
  }

  const wb = XLSX.utils.book_new();

  document.querySelectorAll('.report-section').forEach(sec => {
    const table = sec.querySelector('table');
    if (!table) return;
    if (!table.tBodies[0] || table.tBodies[0].rows.length === 0) return;

    const nombreHoja = sec.querySelector('h2').textContent.trim();
    const sht = XLSX.utils.table_to_sheet(table, { raw: true });
    XLSX.utils.book_append_sheet(wb, sht, nombreHoja);
  });

  XLSX.writeFile(wb, 'FuelControlTotal.xlsx');
});

const MAPBOX_TOKEN = 'pk.eyJ1Ijoidm1vbGdhZG83IiwiYSI6ImNtODRteWZzdzI2bG0ydG9vNXRnZXh6dm4ifQ.gq7ZHhf9J1bRTOfTAfcbzg';

const geocodeCache = new Map();

async function coordsToAddress(lat, lon) {
  const key = `${lat},${lon}`;

  if (geocodeCache.has(key)) return geocodeCache.get(key);

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
                `${lon},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1&language=es`;
    const r   = await fetch(url);
    const j   = await r.json();
    const addr = j.features?.[0]?.place_name || key;
    geocodeCache.set(key, addr);
    return addr;
  } catch (e) {
    console.error('geocoding', e);
    return key;
  }
}
