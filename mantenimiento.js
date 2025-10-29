const SHEET_ID = '1v9tdhvtHJHHg2fR7masGKStwsu7fIRDSVZz-01ljARQ';
const API_KEY  = 'AIzaSyC87Q8cqDQHmfWE8crKfyLUfY_KUk78Pb4';

const SD_PREFIX = sessionStorage.getItem('SD') || '';
if (!SD_PREFIX) {
  window.location.href = 'index.html';
}

const RANGE = `${SD_PREFIX} DB`;

function tanqueSinCom(adcValor) {
  if (adcValor === '' || adcValor === undefined || adcValor === null) return true;
  const v = parseFloat(adcValor);
  if (isNaN(v)) return true;
  return v < 0.45;
}

function solicitarServicioUnidad(item) {
  const unidad = item['Unidad']  || 'Sin dato';
  const imei   = item['IMEI']    || 'Sin dato';
  const vin    = item['VIN']     || 'Sin dato';
  const placas = item['Placas']  || 'Sin dato';

  const motivos = [];
  if (item['Estatus'] === '0') motivos.push('Unidad fuera de línea');
  if (tanqueSinCom(item['adc1'])) motivos.push('Tanque 1 Desconectado');
  if (tanqueSinCom(item['adc2'])) motivos.push('Tanque 2 Desconectado');

  if (motivos.length === 0) {
    alert('No hay condiciones para solicitar servicio.');
    return;
  }

  const mensaje =
    `🔔 Hola, Me gustaría solicitar revisión técnica de mi unidad:\n` +
    `Motivo(s): ${motivos.join(', ')}\n\n` +
    `🚚 Unidad: ${unidad}\n` +
    `📱 IMEI: ${imei}\n` +
    `🔑 VIN: ${vin}\n` +
    `🔖 Placas: ${placas}`;

  const numeroSoporte = '524442515007';
  const url = `https://api.whatsapp.com/send?phone=${numeroSoporte}&text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

function cargarDatosFlotilla(filtro = 'todos') {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?key=${API_KEY}`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const rows = data.values;
      if (!rows || rows.length === 0) {
        console.error('No se encontraron datos en la hoja.');
        return;
      }
      const headers = rows.shift();
      const datosFlotilla = rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      }).filter(obj => (obj['Unidad'] || '').startsWith(SD_PREFIX));

      mostrarFlotilla(datosFlotilla, filtro);
    })
    .catch(err => console.error('Error al cargar los datos:', err));
}

function estadoADC(valor) {
  const num = parseFloat(valor);
  if (isNaN(num)) return 'Sin dato';
  return num >= 0.45 ? 'Conectado' : 'Desconectado';
}

function mostrarFlotilla(datos, filtro = 'todos') {
  const contenedor = document.getElementById('flotillaContainer');
  contenedor.classList.remove('oculto');
  contenedor.innerHTML = '';

  let totalConectadas   = 0;
  let totalSinConexion  = 0;
  let totalSensoresFail = 0;

  const motivosGenerales = new Set();

  datos.forEach(item => {
    const offline  = item['Estatus'] === '0';
    const online   = item['Estatus'] === '1';
    const senFail  = tanqueSinCom(item['adc1']) || tanqueSinCom(item['adc2']);

    if (online)  totalConectadas++;
    if (offline) totalSinConexion++;
    if (senFail) totalSensoresFail++;

    if (filtro === 'conectadas'  && !online)  return;
    if (filtro === 'sinConexion' && !offline) return;
    if (filtro === 'sensores'    && !senFail) return;

    if (offline) motivosGenerales.add('Unidad fuera de línea');
    if (senFail) {
      if (tanqueSinCom(item['adc1'])) motivosGenerales.add('Tanque 1 Desconectado');
      if (tanqueSinCom(item['adc2'])) motivosGenerales.add('Tanque 2 Desconectado');
    }

    const divItem = document.createElement('div');
    divItem.style.border       = '1px solid #ccc';
    divItem.style.padding      = '10px';
    divItem.style.marginBottom = '10px';
    divItem.style.borderRadius = '5px';

    const estadoHTML = online
      ? '<span class="status-dot online"></span>'
      : offline
        ? '<span class="status-dot offline"></span>'
        : '';

    const voltTxt = item['Voltaje Unidad']
      ? `${parseFloat(item['Voltaje Unidad']).toFixed(2)} V`
      : 'Sin dato';
    const batTxt  = item['Bateria Equipo']
      ? `${item['Bateria Equipo']} %`
      : 'Sin dato';

    divItem.innerHTML = `
      <strong>Unidad:</strong> <i class="fas fa-truck"></i> ${item['Unidad'] || 'Sin dato'}<br>
      <strong>IMEI:</strong> ${item['IMEI'] || 'Sin dato'}<br>
      <strong>VIN:</strong> ${item['VIN'] || 'Sin dato'}<br>
      <strong>Placas:</strong> ${item['Placas'] || 'Sin dato'}<br>
      <strong>Odómetro:</strong> ${item['Odometro'] || 'Sin dato'}<br>
      <strong>Tanque 1:</strong> ${estadoADC(item['adc1'])}<br>
      <strong>Tanque 2:</strong> ${estadoADC(item['adc2'])}<br>
      <strong>Estatus:</strong> ${estadoHTML}
    `;

    contenedor.appendChild(divItem);
  });

  const cardActivas     = document.getElementById('cardActivas');
  const cardSinConexion = document.getElementById('cardSinConexion');
  const cardSensores    = document.getElementById('cardSensores');

  if (cardActivas) {
    cardActivas.querySelector('p').textContent = totalConectadas;
    cardActivas.classList.remove('oculto');
    cardActivas.onclick = () => mostrarFlotilla(datos, 'conectadas');
  }
  if (cardSinConexion) {
    cardSinConexion.querySelector('p').textContent = totalSinConexion;
    cardSinConexion.classList.remove('oculto');
    cardSinConexion.onclick = () => mostrarFlotilla(datos, 'sinConexion');
  }
  if (cardSensores) {
    cardSensores.querySelector('p').textContent = totalSensoresFail;
    cardSensores.classList.remove('oculto');
    cardSensores.onclick = () => mostrarFlotilla(datos, 'sensores');
  }

  let btnGenCont = document.getElementById('generalServiceBtnContainer');
  if (!btnGenCont) {
    btnGenCont = document.createElement('div');
    btnGenCont.id = 'generalServiceBtnContainer';
    btnGenCont.style.textAlign = 'center';
    document.querySelector('.cards-container').after(btnGenCont);
  }
  btnGenCont.innerHTML = '';

  if (filtro !== 'conectadas' && motivosGenerales.size > 0) {
    const btnGen = document.createElement('button');
    btnGen.className = 'service-button';
    btnGen.innerHTML = '<i class="fab fa-whatsapp" style="margin-right:5px;"></i> Solicitar Servicio Técnico';
    btnGen.onclick = () => {
      const numeroSoporte = '524442515007';
      let mensajeGen;
      if (filtro === 'sinConexion') {
        mensajeGen = `🔔 Hola, mis unidades están fuera de línea:\nMotivo: Unidad fuera de línea`;
      } else if (filtro === 'sensores') {
        mensajeGen = `🔔 Hola, mis unidades tienen sensores desconectados:\nMotivo(s): ${Array.from(motivosGenerales).join(', ')}`;
      } else {
        mensajeGen = `🔔 Hola, solicito revisión técnica de mis unidades:\nMotivo(s): ${Array.from(motivosGenerales).join(', ')}`;
      }
      const url = `https://api.whatsapp.com/send?phone=${numeroSoporte}&text=${encodeURIComponent(mensajeGen)}`;
      window.open(url, '_blank');
    };
    btnGenCont.appendChild(btnGen);
  }

  document.getElementById('cardAgendadas' ).classList.add('oculto');
  document.getElementById('cardCompletadas').classList.add('oculto');
  document.getElementById('cardCanceladas' ).classList.add('oculto');
}

document.addEventListener('DOMContentLoaded', () => {
  const linkFlotilla  = document.getElementById('linkFlotilla');
  const linkServicios = document.getElementById('linkServicios');
  const sidebarLinks  = document.querySelectorAll('.sidebar ul li a');

  function setActiveLink(el) {
    sidebarLinks.forEach(link => link.classList.remove('active'));
    el.classList.add('active');
  }

  if (linkFlotilla) {
    setActiveLink(linkFlotilla);
    cargarDatosFlotilla('conectadas');
  }

  linkFlotilla.addEventListener('click', e => {
    e.preventDefault();
    setActiveLink(linkFlotilla);
    cargarDatosFlotilla('conectadas');
  });

  linkServicios.addEventListener('click', e => {
    e.preventDefault();
    setActiveLink(linkServicios);

    document.getElementById('cardAgendadas' ).classList.remove('oculto');
    document.getElementById('cardCompletadas').classList.remove('oculto');
    document.getElementById('cardCanceladas' ).classList.remove('oculto');

    ['cardActivas','cardSinConexion','cardSensores'].forEach(id =>
      document.getElementById(id).classList.add('oculto'));

    const cont = document.getElementById('flotillaContainer');
    cont.classList.add('oculto');
    cont.innerHTML = '';
  });
});
