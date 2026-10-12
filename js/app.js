// ==========================================================
// Brisa — lógica de la aplicación
// 1. El usuario escribe una ciudad.
// 2. Pedimos sus coordenadas a la API de geocodificación.
// 3. Con las coordenadas pedimos el tiempo a la API de previsión.
// 4. Pintamos los datos y cambiamos los colores según la hora.
// Las dos APIs son de Open-Meteo: gratuitas y sin clave.
// ==========================================================

const URL_GEOCODIFICACION = 'https://geocoding-api.open-meteo.com/v1/search';
const URL_PREVISION = 'https://api.open-meteo.com/v1/forecast';
const CLAVE_ULTIMA_CIUDAD = 'brisa-ultima-ciudad';
const CIUDAD_POR_DEFECTO = 'Valencia';

// Elementos de la página que vamos a usar
const formulario = document.getElementById('buscador');
const campoCiudad = document.getElementById('ciudad');
const aviso = document.getElementById('aviso');
const contenido = document.getElementById('contenido');

// Códigos del tiempo de Open-Meteo → texto e icono
// (lista completa en https://open-meteo.com/en/docs, apartado "WMO Weather interpretation codes")
const CODIGOS_TIEMPO = {
    0: ['Despejado', '☀️'],
    1: ['Casi despejado', '🌤️'],
    2: ['Parcialmente nublado', '⛅'],
    3: ['Nublado', '☁️'],
    45: ['Niebla', '🌫️'],
    48: ['Niebla con escarcha', '🌫️'],
    51: ['Llovizna débil', '🌦️'],
    53: ['Llovizna', '🌦️'],
    55: ['Llovizna intensa', '🌧️'],
    61: ['Lluvia débil', '🌦️'],
    63: ['Lluvia', '🌧️'],
    65: ['Lluvia fuerte', '🌧️'],
    71: ['Nieve débil', '🌨️'],
    73: ['Nieve', '🌨️'],
    75: ['Nieve fuerte', '❄️'],
    80: ['Chubascos', '🌦️'],
    81: ['Chubascos fuertes', '🌧️'],
    82: ['Chubascos muy fuertes', '⛈️'],
    95: ['Tormenta', '⛈️'],
    96: ['Tormenta con granizo', '⛈️'],
    99: ['Tormenta con granizo', '⛈️'],
};

// Devuelve [texto, icono] para un código. Si es de noche, cambia el sol por la luna.
function describirTiempo(codigo, esDeDia = true) {
    let [texto, icono] = CODIGOS_TIEMPO[codigo] ?? ['Tiempo variable', '🌡️'];

    if (!esDeDia && (codigo === 0 || codigo === 1)) {
        icono = '🌙';
    }

    return [texto, icono];
}

// Decide el momento del día a partir de la hora local de la ciudad (0-23)
function momentoDelDia(hora) {
    if (hora >= 7 && hora < 13) return 'manana';
    if (hora >= 13 && hora < 19) return 'tarde';
    if (hora >= 19 && hora < 21) return 'atardecer';
    return 'noche';
}

function mostrarAviso(texto) {
    aviso.textContent = texto;
    aviso.hidden = false;
}

function ocultarAviso() {
    aviso.hidden = true;
}

// Paso 2: nombre de ciudad → { nombre, pais, latitud, longitud }
async function buscarCiudad(nombre) {
    const parametros = new URLSearchParams({
        name: nombre,
        count: 1,
        language: 'es',
        format: 'json',
    });

    const respuesta = await fetch(`${URL_GEOCODIFICACION}?${parametros}`);
    if (!respuesta.ok) {
        throw new Error('No se ha podido conectar con el servicio del tiempo.');
    }

    const datos = await respuesta.json();

    // Si la ciudad no existe, la API devuelve un objeto sin "results"
    if (!datos.results || datos.results.length === 0) {
        throw new Error(`No encontramos "${nombre}". Revisa cómo está escrita.`);
    }

    const ciudad = datos.results[0];
    return {
        nombre: ciudad.name,
        pais: [ciudad.admin1, ciudad.country].filter(Boolean).join(', '),
        latitud: ciudad.latitude,
        longitud: ciudad.longitude,
    };
}

// Paso 3: coordenadas → previsión (actual, por horas y por días)
async function pedirPrevision(latitud, longitud) {
    const parametros = new URLSearchParams({
        latitude: latitud,
        longitude: longitud,
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
        hourly: 'temperature_2m,weather_code,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: 'auto', // las horas llegan en la hora local de la ciudad
        forecast_days: 6,
    });

    const respuesta = await fetch(`${URL_PREVISION}?${parametros}`);
    if (!respuesta.ok) {
        throw new Error('No se ha podido cargar la previsión. Inténtalo de nuevo.');
    }

    return respuesta.json();
}

// Paso 4: pintar todo en la página
function pintarTiempo(ciudad, prevision) {
    const actual = prevision.current;
    const [texto, icono] = describirTiempo(actual.weather_code, actual.is_day === 1);

    document.getElementById('nombre-ciudad').textContent = ciudad.nombre;
    document.getElementById('pais').textContent = ciudad.pais;
    document.getElementById('icono-actual').textContent = icono;
    document.getElementById('temperatura').textContent = `${Math.round(actual.temperature_2m)}°`;
    document.getElementById('descripcion').textContent = texto;
    document.getElementById('max-min').textContent =
        `Máx ${Math.round(prevision.daily.temperature_2m_max[0])}° · Mín ${Math.round(prevision.daily.temperature_2m_min[0])}°`;
    document.getElementById('sensacion').textContent = `${Math.round(actual.apparent_temperature)}°`;
    document.getElementById('humedad').textContent = `${actual.relative_humidity_2m} %`;
    document.getElementById('viento').textContent = `${Math.round(actual.wind_speed_10m)} km/h`;

    pintarHoras(prevision.hourly, actual.time);
    pintarDias(prevision.daily);

    // "2026-10-12T14:15" → hora 14 (hora local de la ciudad, no la del usuario)
    const horaLocal = Number(actual.time.slice(11, 13));
    document.body.dataset.momento = momentoDelDia(horaLocal);

    contenido.hidden = false;
}

// Las 12 horas siguientes a la hora actual
function pintarHoras(horario, horaActual) {
    const lista = document.getElementById('horas');
    lista.innerHTML = '';

    // Buscamos la posición de la hora en curso ("2026-10-12T14:00")
    const inicio = horario.time.findIndex((hora) => hora.slice(0, 13) === horaActual.slice(0, 13));

    for (let i = inicio; i < inicio + 12 && i < horario.time.length; i++) {
        const [texto, icono] = describirTiempo(horario.weather_code[i], horario.is_day[i] === 1);
        const etiqueta = i === inicio ? 'Ahora' : `${horario.time[i].slice(11, 13)} h`;

        const elemento = document.createElement('li');
        elemento.innerHTML = `
            <span>${etiqueta}</span>
            <span class="icono" role="img" aria-label="${texto}">${icono}</span>
            <strong>${Math.round(horario.temperature_2m[i])}°</strong>
        `;
        lista.appendChild(elemento);
    }
}

// Los 5 días siguientes a hoy
function pintarDias(diario) {
    const lista = document.getElementById('dias');
    lista.innerHTML = '';

    const formatoDia = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

    for (let i = 1; i < diario.time.length; i++) {
        // Añadimos la hora para que la fecha no se mueva de día por la zona horaria
        const fecha = new Date(`${diario.time[i]}T12:00:00`);
        let nombreDia = i === 1 ? 'Mañana' : formatoDia.format(fecha);
        nombreDia = nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1);

        const [texto, icono] = describirTiempo(diario.weather_code[i]);

        const elemento = document.createElement('li');
        elemento.innerHTML = `
            <span>${nombreDia}</span>
            <span class="icono" role="img" aria-label="${texto}">${icono}</span>
            <span class="rango">
                <strong>${Math.round(diario.temperature_2m_max[i])}°</strong>
                <span class="minima">${Math.round(diario.temperature_2m_min[i])}°</span>
            </span>
        `;
        lista.appendChild(elemento);
    }
}

// Junta todos los pasos. Se usa al buscar y al abrir la página.
async function mostrarTiempoDe(nombreCiudad) {
    mostrarAviso('Cargando el tiempo…');

    try {
        const ciudad = await buscarCiudad(nombreCiudad);
        const prevision = await pedirPrevision(ciudad.latitud, ciudad.longitud);

        pintarTiempo(ciudad, prevision);
        ocultarAviso();

        // Guardamos la ciudad para enseñarla la próxima vez que se abra la página
        localStorage.setItem(CLAVE_ULTIMA_CIUDAD, ciudad.nombre);
        document.title = `${ciudad.nombre} | Brisa`;
    } catch (error) {
        // fetch lanza un TypeError cuando no hay conexión; su mensaje viene en inglés
        if (error instanceof TypeError) {
            mostrarAviso('No hay conexión a internet. Compruébala e inténtalo de nuevo.');
        } else {
            mostrarAviso(error.message);
        }
        // Si ya había una ciudad en pantalla, se queda; solo avisamos del error
    }
}

// Paso 1: el usuario busca una ciudad
formulario.addEventListener('submit', (evento) => {
    evento.preventDefault(); // evita que el formulario recargue la página

    const nombre = campoCiudad.value.trim();
    if (nombre !== '') {
        mostrarTiempoDe(nombre);
        campoCiudad.blur(); // en el móvil, cierra el teclado
    }
});

// Al abrir la página: la última ciudad buscada o, si no hay, Valencia
mostrarTiempoDe(localStorage.getItem(CLAVE_ULTIMA_CIUDAD) ?? CIUDAD_POR_DEFECTO);
