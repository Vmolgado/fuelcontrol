/*****************************************************
 *  CONFIGURACIÓN DE GOOGLE SHEETS
 *****************************************************/
const SHEET_ID = '1v9tdhvtHJHHg2fR7masGKStwsu7fIRDSVZz-01ljARQ';
const API_KEY  = 'AIzaSyC87Q8cqDQHmfWE8crKfyLUfY_KUk78Pb4';

/* ——— SD que corresponde al usuario autenticado ——— */
const SD_PREFIX = sessionStorage.getItem('SD') || '';   // p.ej. "G772"
if (!SD_PREFIX) {
  // Si alguien entra directo sin loguearse, vuelve al login
  window.location.href = 'index.html';
}

/*  Cada SD tiene su propia pestaña: «G772 DB», «G798 DB», …  */
const RANGE = `${SD_PREFIX} DB`;

/*****************************************************
 *  Ayuda: evalúa el valor ADC de un tanque
 *  Devuelve true  → sin comunicación
 *          false → conectado
 *****************************************************/
function tanqueSinCom(adcValor) {
  if (adcValor === '' || adcValor === undefined || adcValor === null) return true;
  const v = parseFloat(adcValor);
  if (isNaN(v))                     return true;     // “Sin dato” u otro texto
  return v < 0.45;                                  // 0.45 V umbral
}

/*****************************************************
 *  SOLICITAR SERVICIO TÉCNICO (unidad + tanques)
 *****************************************************/
function solicitarServicioUnidad(item) {
  /* --- Datos básicos --- */
  const unidad = item['Unidad']  || 'Sin dato';
  const imei   = item['IMEI']    || 'Sin dato';
  const vin    = item['VIN']     || 'Sin dato';
  const placas = item['Placas']  || 'Sin dato';

  /* --- Motivos de la alerta --- */
  const motivos = [];

  // 1) Unidad fuera de línea
  if (item['Estatus'] === '0') motivos.push('Unidad fuera de línea');

  // 2) Tanques usando valores ADC
  if (tanqueSinCom(item['adc1'])) motivos.push('Tanque 1 Desconectado');
  if (tanqueSinCom(item['adc2'])) motivos.push('Tanque 2 Desconectado');

  // Si no hay ningún motivo, no se envía mensaje
  if (motivos.length === 0) {
    alert('No hay condiciones para solicitar servicio.');
    return;
  }

  /* --- Construcción del mensaje --- */
  const mensaje =
    `🔔 Hola, Me gustaría solicitar revisión técnica de mi unidad:\n` +
    `Motivo(s): ${motivos.join(', ')}\n\n` +
    `🚚 Unidad: ${unidad}\n` +
    `📱 IMEI: ${imei}\n` +
    `🔑 VIN: ${vin}\n` +
    `🔖 Placas: ${placas}`;

  /* --- Envío por WhatsApp --- */
  const numeroSoporte = '524442515007';
  const url = `https://api.whatsapp.com/send?phone=${numeroSoporte}&text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

/*****************************************************
 *  FUNCIÓN PARA CARGAR DATOS DE FLOTILLA
 *****************************************************/
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
      })
      // Filtro de seguridad por si en la pestaña hubiera otras SD
      .filter(obj => (obj['Unidad'] || '').startsWith(SD_PREFIX));

      mostrarFlotilla(datosFlotilla, filtro);
    })
    .catch(err => console.error('Error al cargar los datos:', err));
}

/* Devuelve “Conectado”, “Desconectado” o “Sin dato” */
function estadoADC(valor) {
  const num = parseFloat(valor);
  if (isNaN(num)) return 'Sin dato';
  return num >= 0.45 ? 'Conectado' : 'Desconectado';
}

/*****************************************************
 *  FUNCIÓN PARA MOSTRAR DATOS DE FLOTILLA EN EL HTML
 *****************************************************/
function mostrarFlotilla(datos, filtro = 'todos') {
  const contenedor = document.getElementById('flotillaContainer');
  contenedor.classList.remove('oculto');
  contenedor.innerHTML = '';

  let totalConectadas   = 0;
  let totalSinConexion  = 0;
  let totalSensoresFail = 0;

  // Recolectamos motivos de servicio para el botón general
  const motivosGenerales = new Set();

  datos.forEach(item => {
    const offline  = item['Estatus'] === '0';
    const online   = item['Estatus'] === '1';
    const senFail  = tanqueSinCom(item['adc1']) || tanqueSinCom(item['adc2']);

    if (online)  totalConectadas++;
    if (offline) totalSinConexion++;
    if (senFail) totalSensoresFail++;

    // Sólo mostramos según filtro
    if (filtro === 'conectadas'  && !online)    return;
    if (filtro === 'sinConexion' && !offline)   return;
    if (filtro === 'sensores'    && !senFail)   return;

    // Preparamos motivos para el botón general
    if (offline) motivosGenerales.add('Unidad fuera de línea');
    if (senFail) {
      if (tanqueSinCom(item['adc1'])) motivosGenerales.add('Tanque 1 Desconectado');
      if (tanqueSinCom(item['adc2'])) motivosGenerales.add('Tanque 2 Desconectado');
    }

    // --- Tarjeta individual sin botón ---
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
      <!-- Voltaje y batería comentados -->
      <!-- <strong>Voltaje Unidad:</strong> ${voltTxt}<br>
      <strong>Batería Equipo:</strong> ${batTxt}<br> -->
      <strong>Estatus:</strong> ${estadoHTML}
    `;

    contenedor.appendChild(divItem);
  });

  /* ---- Tarjetas resumen ---- */
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

  /* ---- Botón GENERAL de “Solicitar Servicio Técnico” ---- */
  let btnGenCont = document.getElementById('generalServiceBtnContainer');
  if (!btnGenCont) {
    btnGenCont = document.createElement('div');
    btnGenCont.id = 'generalServiceBtnContainer';
    btnGenCont.style.textAlign = 'center';
    document.querySelector('.cards-container').after(btnGenCont);
  }
  btnGenCont.innerHTML = '';

  // Solo mostramos el botón si NO estamos en la pestaña "conectadas"
  if (filtro !== 'conectadas' && motivosGenerales.size > 0) {
    const btnGen = document.createElement('button');
    btnGen.className = 'service-button';
    btnGen.innerHTML = '<i class="fab fa-whatsapp" style="margin-right:5px;"></i> Solicitar Servicio Técnico';
    btnGen.onclick = () => {
      const numeroSoporte = '524442515007';
      let mensajeGen;
      if (filtro === 'sinConexion') {
        mensajeGen =
          `🔔 Hola, mis unidades están fuera de línea:\n` +
          `Motivo: Unidad fuera de línea`;
      } else if (filtro === 'sensores') {
        mensajeGen =
          `🔔 Hola, mis unidades tienen sensores desconectados:\n` +
          `Motivo(s): ${Array.from(motivosGenerales).join(', ')}`;
      } else {
        mensajeGen =
          `🔔 Hola, solicito revisión técnica de mis unidades:\n` +
          `Motivo(s): ${Array.from(motivosGenerales).join(', ')}`;
      }
      const url = `https://api.whatsapp.com/send?phone=${numeroSoporte}&text=${encodeURIComponent(mensajeGen)}`;
      window.open(url, '_blank');
    };
    btnGenCont.appendChild(btnGen);
  }

  /* Ocultar tarjetas de solicitudes */
  document.getElementById('cardAgendadas' ).classList.add('oculto');
  document.getElementById('cardCompletadas').classList.add('oculto');
  document.getElementById('cardCanceladas' ).classList.add('oculto');
}

/*****************************************************
 *  EVENTOS PARA "FLOTILLA" Y "SERVICIOS TÉCNICOS"
 *****************************************************/
document.addEventListener('DOMContentLoaded', () => {
  const linkFlotilla  = document.getElementById('linkFlotilla');
  const linkServicios = document.getElementById('linkServicios');
  const sidebarLinks  = document.querySelectorAll('.sidebar ul li a');

  function setActiveLink(el) {
    sidebarLinks.forEach(link => link.classList.remove('active'));
    el.classList.add('active');
  }

  /* Carga inicial */
  if (linkFlotilla) {
    setActiveLink(linkFlotilla);
    cargarDatosFlotilla('conectadas');
  }

  /* Flotilla */
  linkFlotilla.addEventListener('click', e => {
    e.preventDefault();
    setActiveLink(linkFlotilla);
    cargarDatosFlotilla('conectadas');
  });

  /* Servicios Técnicos */
  linkServicios.addEventListener('click', e => {
    e.preventDefault();
    setActiveLink(linkServicios);

    /* Mostrar tarjetas de solicitudes */
    document.getElementById('cardAgendadas' ).classList.remove('oculto');
    document.getElementById('cardCompletadas').classList.remove('oculto');
    document.getElementById('cardCanceladas').classList.remove('oculto');

    /* Ocultar tarjetas de flotilla (incluye sensores) */
    ['cardActivas','cardSinConexion','cardSensores'].forEach(id =>
      document.getElementById(id).classList.add('oculto'));

    /* Ocultar contenedor flotilla */
    const cont = document.getElementById('flotillaContainer');
    cont.classList.add('oculto');
    cont.innerHTML = '';
  });
});
