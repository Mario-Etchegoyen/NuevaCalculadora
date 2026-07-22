// ─────────────────────────────────────────────────────────────────────────────
// Restaurar scroll al inicio en recarga con historial
// ─────────────────────────────────────────────────────────────────────────────
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("load", function () {
	setTimeout(function () { window.scrollTo(0, 0); }, 0);
});

document.addEventListener("DOMContentLoaded", () => {
	"use strict";

	// ─────────────────────────────────────────────────────────────────────────
	// UTILIDAD: debounce — agrupa llamadas rápidas en una sola diferida
	// ─────────────────────────────────────────────────────────────────────────
	function debounce(fn, ms) {
		let t;
		return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
	}

	// ─────────────────────────────────────────────────────────────────────────
	// CONFIGURACIÓN GLOBAL
	// ─────────────────────────────────────────────────────────────────────────
	const CONFIG = {
		MONTO_MINIMO:              4000000,
		GASTOS_ADMIN:              3.5,        // % sobre el monto
		IVA:                       21,         // % de IVA aplicado
		ANIOS_RETROACTIVOS:        9,          // años hacia atrás disponibles
		LIMITE_TOTAL_ADJUNTOS_HTML: 10_485_760, // 10 MB en bytes
		PLAZOS:                    [12, 18, 24, 36, 48, 60],

		LIMITES: {
			MOTO: {
				CILINDRADA: { BAJA: 125, MEDIA: 200, ALTA: 500, UVA: 200 },
				POTENCIA:   { BAJA: 1200, ALTA: 5000 }
			}
		},

		// Tasas anuales (%) indexadas igual que PLAZOS
		TASAS: {
			AUTO: {
				COMUN:    [42.9, 42.9, 42.9, 42.9, 42.9, 42.9],
				ELECTRICO:[39.9, 39.9, 39.9, 39.9, 39.9, 39.9],
				UVA:      [17.9, 17.9, 17.9, 17.9, 17.9, 0]
			},
			MOTO: {
				COMUN:    [61, 61, 61, 61, 61, 61],
				ELECTRICO:[48, 48, 48, 48, 48, 48],
				UVA:      [27, 28, 28, 28, 28,  0]
			}
		},

		CONDICIONES: {
			AUTO:       ["0km", "Usado"],
			UTILITARIO: ["0km", "Usado"],
			MOTO:       ["0km"],
			CUATRICICLO:["0km"]
		},

		LIMITES_ANIOS: { AUTO: 9, UTILITARIO: 9, MOTO: 1, CUATRICICLO: 1 },

		EMAIL_PREAPROBADO: "preaprobados@tuprendario.com"
	};

	// ─────────────────────────────────────────────────────────────────────────
	// FLAGS DE HABILITACIÓN DE TIPOS DE TASA
	// ─────────────────────────────────────────────────────────────────────────
	const TASA_FIJA_HABILITADA = true;
	const TASA_UVA_HABILITADA  = true;
	const TASA_CERO_HABILITADA = false;

	// ─────────────────────────────────────────────────────────────────────────
	// QUEBRANTO POR PLAZO — índice alineado con CONFIG.PLAZOS [12,18,24,36,48,60]
	// ─────────────────────────────────────────────────────────────────────────
	const QUEBRANTOS_POR_PLAZO = [13, 0, 23.5, 33, 40, 0];

	// ─────────────────────────────────────────────────────────────────────────
	// POTENCIA MÍNIMA PARA MOTO ELÉCTRICA (vatios)
	// ─────────────────────────────────────────────────────────────────────────
	const POTENCIA_MINIMA_MOTO = 1200;
	const CILINDRADA_MINIMA_MOTO = 300;

	// ─────────────────────────────────────────────────────────────────────────
	// AÑO ACTUAL Y LISTA DE AÑOS DISPONIBLES (desc.)
	// ─────────────────────────────────────────────────────────────────────────
	const anioActual = (new Date()).getFullYear();
	const aniosDisponibles = Array.from(
		{ length: CONFIG.ANIOS_RETROACTIVOS + 1 },
		(_, idx) => anioActual - idx
	);

	// ─────────────────────────────────────────────────────────────────────────
	// LÍMITES PARA ELEGIBILIDAD A TASA UVA
	// ─────────────────────────────────────────────────────────────────────────
	const LIMITES_UVA = {
		AUTOS: { INICIO: aniosDisponibles[7], MESES_MAX: 48 },
		MOTOS: { INICIO: aniosDisponibles[7], MESES_MAX: 48 }
	};

	// ─────────────────────────────────────────────────────────────────────────
	// ESTADO GLOBAL DE LA CALCULADORA
	// ─────────────────────────────────────────────────────────────────────────
	const estado = {
		vehiculo:       "",
		combustible:    "",
		condicion:      "",
		anio:           null,
		plazo:          null,
		tasa:           null,
		cuota:          null,
		cilindrada:     null,
		potencia:       null,
		preaprobadoForm: {}
	};

	// ─────────────────────────────────────────────────────────────────────────
	// Actualiza la variable CSS --header-height según la altura real del header
	// ─────────────────────────────────────────────────────────────────────────
	function actualizarAlturaHeader() {
		const header = document.querySelector("header");
		if (!header) return;
		const altura = Math.ceil(header.getBoundingClientRect().height);
		document.documentElement.style.setProperty("--header-height", `${altura}px`);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// REFERENCIAS AL DOM
	// ─────────────────────────────────────────────────────────────────────────
	const DOM = {
		form: document.getElementById("formCalculadora"),
		inputs: {
			monto:      document.getElementById("montoPrestamo"),
			vehiculo:   document.getElementById("tipoVehiculo"),
			combustible:document.getElementById("tipoCombustible"),
			condicion:  document.getElementById("condicion"),
			anio:       document.getElementById("anio"),
			plazo:      document.getElementById("plazo"),
			tasa:       document.getElementById("tasaInteres")
		},
		btnCalcular: document.getElementById("btnCalcular"),
		resultado: {
			container: document.getElementById("resultadoCuota"),
			stack:     document.querySelector(".resultado-stack"),
			fraseInfo: document.getElementById("frase-uva-info"),
			infoAutos: {
				anio:  document.getElementById("autos-anio"),
				meses: document.getElementById("autos-meses")
			},
			infoMotos: {
				cilindrada: document.getElementById("motos-cilindrada"),
				anio:       document.getElementById("motos-anio"),
				meses:      document.getElementById("motos-meses")
			}
		},
		modales: {
			preaprobado: document.getElementById("modalDatosPreaprobado"),
			overlay:     document.querySelector("#modalDatosPreaprobado .modal-preaprobado__overlay"),
			toast:       document.getElementById("modalPreaprobadoToast")
		},
		preaprobadoPrestamoGrid: document.querySelector(".modal-preaprobado__prestamo-grid"),
		preaprobadoPrestamo: {
			monto: {
				visible: document.getElementById("preaprobadoMontoInfo"),
				hidden:  document.getElementById("preaprobadoMonto")
			},
			anio: {
				control: document.getElementById("preaprobadoAnioEditable"),
				hidden:  document.getElementById("preaprobadoAnio")
			},
			tasa: {
				control: document.getElementById("preaprobadoTasaEditable"),
				hidden:  document.getElementById("preaprobadoTasa")
			},
			plazo: {
				control: document.getElementById("preaprobadoPlazoEditable"),
				hidden:  document.getElementById("preaprobadoPlazo")
			},
			cuota: {
				visible: document.getElementById("preaprobadoCuotaInfo"),
				hidden:  document.getElementById("preaprobadoCuota")
			}
		},
		contacto: {
			form:     document.getElementById("formularioContacto"),
			exito:    document.getElementById("mensajeExito"),
			contador: document.getElementById("contadorCaracteres")
		}
	};

	// Mover el modal al body si quedó anidado dentro de otra sección
	if (DOM.modales.preaprobado && DOM.modales.preaprobado.parentElement !== document.body) {
		document.body.appendChild(DOM.modales.preaprobado);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// UTILIDAD: formatea un número como moneda argentina sin decimales
	// ─────────────────────────────────────────────────────────────────────────
	const formatearPesos = (num) =>
		num.toLocaleString("es-AR", { maximumFractionDigits: 0 });

	DOM.inputs.monto.placeholder = `Mín. $ ${formatearPesos(CONFIG.MONTO_MINIMO)}`;

	// ─────────────────────────────────────────────────────────────────────────
	// Procesa el campo monto: formatea, habilita/deshabilita campos dependientes
	// @param {boolean} alPerderFoco - true cuando se llama desde el evento blur
	// ─────────────────────────────────────────────────────────────────────────
	function procesarMonto(alPerderFoco = false) {
		const inputMonto = DOM.inputs.monto;
		let soloNumeros = inputMonto.value.replace(/[^0-9]/g, "");
		let montoInt    = parseInt(soloNumeros, 10);

		if (soloNumeros) {
			inputMonto.value = `$ ${parseInt(soloNumeros, 10).toLocaleString("es-AR")}`;
		} else {
			inputMonto.value = "";
			if (alPerderFoco) {
				inputMonto.placeholder = `Ingresá Monto (Mín. $${formatearPesos(CONFIG.MONTO_MINIMO)})`;
			}
		}

		if (!isNaN(montoInt) && montoInt >= CONFIG.MONTO_MINIMO) {
			inputMonto.classList.add("input-con-valor");
			// Habilitar el siguiente campo (vehículo)
			if (true) {
				DOM.inputs.vehiculo.disabled = false;
			} else {
				Object.values(DOM.inputs).forEach(inp => {
					if (inp !== DOM.inputs.monto) inp.disabled = true;
				});
				resetearCamposDependientes();
			}
		} else {
			inputMonto.classList.remove("input-con-valor");
			if (alPerderFoco) resetearCamposDependientes();
		}

		actualizarBotonCalcular();
		actualizarPanelPreaprobado();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Resetea todos los campos dependientes al monto (vehículo en adelante)
	// ─────────────────────────────────────────────────────────────────────────
	function resetearCamposDependientes() {
		Object.values(DOM.inputs).forEach(inp => {
			if (inp !== DOM.inputs.monto) {
				inp.selectedIndex = 0;
				inp.classList.remove("select-con-valor");
				inp.disabled = true;
			}
		});
		estado.vehiculo    = "";
		estado.combustible = "";
		estado.condicion   = "";
		estado.anio        = null;
		estado.plazo       = null;
		estado.tasa        = null;
		estado.cilindrada  = null;
		estado.potencia    = null;
		actualizarPanelPreaprobado();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Carga las opciones del select Condición según vehículo y combustible
	// ─────────────────────────────────────────────────────────────────────────
	function cargarCondicion() {
		const selectCondicion = DOM.inputs.condicion;
		if (!estado.vehiculo || !estado.combustible) return;

		selectCondicion.innerHTML = '<option value="" disabled selected hidden>Opciones</option>';
		let opciones = [];

		if      (estado.vehiculo === "auto")       opciones = CONFIG.CONDICIONES.AUTO;
		else if (estado.vehiculo === "utilitario") opciones = CONFIG.CONDICIONES.UTILITARIO;
		else if (estado.vehiculo === "moto")       opciones = CONFIG.CONDICIONES.MOTO;
		else if (estado.vehiculo === "cuatriciclo") opciones = CONFIG.CONDICIONES.CUATRICICLO;

		opciones.forEach(op => {
			selectCondicion.innerHTML += `<option value="${op}">${op}</option>`;
		});
		selectCondicion.disabled = opciones.length === 0;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Carga las opciones del select Año según el estado actual
	// ─────────────────────────────────────────────────────────────────────────
	function cargarAnio() {
		const selectAnio = DOM.inputs.anio;
		if (!estado.vehiculo || !estado.combustible || !estado.condicion) return;

		selectAnio.innerHTML = '<option value="" disabled selected hidden>Opciones</option>';
		const anios = obtenerAnios(leerEstado());

		anios.forEach(anio => {
			const opt = document.createElement("option");
			opt.value       = anio;
			opt.textContent = anio;
			selectAnio.appendChild(opt);
		});
		selectAnio.disabled = anios.length === 0;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Carga las opciones del select Plazo según el estado actual
	// ─────────────────────────────────────────────────────────────────────────
	function cargarPlazo() {
		const selectPlazo = DOM.inputs.plazo;
		if (!estado.vehiculo || !estado.combustible || !estado.anio) return;

		selectPlazo.innerHTML = '<option value="" disabled selected hidden>Opciones</option>';
		const plazos = obtenerPlazos(leerEstado());

		plazos.forEach(plazo => {
			const opt = document.createElement("option");
			opt.value       = plazo;
			opt.textContent = `${plazo} meses`;
			selectPlazo.appendChild(opt);
		});
		selectPlazo.disabled = plazos.length === 0;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Carga las opciones del select Tasa según el estado actual
	// ─────────────────────────────────────────────────────────────────────────
	function cargarTasa() {
		const selectTasa = DOM.inputs.tasa;
		if (!(estado.vehiculo && estado.combustible && estado.anio && estado.plazo)) return;

		selectTasa.innerHTML = '<option value="" disabled selected hidden>Opciones</option>';
		const tasas = obtenerTasas(leerEstado());

		tasas.forEach(t => {
			selectTasa.innerHTML += `<option value="${t.valor}">${t.texto}</option>`;
		});
		selectTasa.disabled = tasas.length === 0;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Lee y devuelve el monto del input como entero (o null si inválido)
	// ─────────────────────────────────────────────────────────────────────────
	function leerMonto() {
		const raw   = DOM.inputs.monto.value.replace(/[^0-9]/g, "");
		const valor = parseInt(raw, 10);
		return Number.isFinite(valor) ? valor : null;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Construye y devuelve un objeto con el estado actual de la calculadora.
	// Se puede sobreescribir cualquier propiedad pasando un objeto parcial.
	// ─────────────────────────────────────────────────────────────────────────
	function leerEstado(overrides = {}) {
		return {
			monto:      Object.prototype.hasOwnProperty.call(overrides, "monto") ? overrides.monto : leerMonto(),
			vehiculo:   overrides.vehiculo   ?? estado.vehiculo,
			combustible:overrides.combustible ?? estado.combustible,
			condicion:  overrides.condicion  ?? estado.condicion,
			anio:       overrides.anio       ?? estado.anio,
			plazo:      overrides.plazo      ?? estado.plazo,
			tasa:       overrides.tasa       ?? estado.tasa,
			cilindrada: overrides.cilindrada ?? estado.cilindrada,
			potencia:   overrides.potencia   ?? estado.potencia
		};
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Devuelve los años disponibles para el contexto dado
	// ─────────────────────────────────────────────────────────────────────────
	function obtenerAnios(ctx) {
		if (!ctx?.vehiculo || !ctx?.combustible || !ctx?.condicion) return [];

		let lista = [];
		const esCombustibleComun = ["comun", "nafta"].includes(ctx.combustible);
		const esNuevo            = ctx.condicion === "0km";

		if (ctx.vehiculo === "auto") {
			lista = esCombustibleComun && esNuevo ? aniosDisponibles.slice(0, 2)
				  : esCombustibleComun            ? aniosDisponibles.slice(0, CONFIG.LIMITES_ANIOS.AUTO + 1)
				  : esNuevo                       ? aniosDisponibles.slice(0, 2)
				  :                                 aniosDisponibles.slice(0, 4);

		} else if (ctx.vehiculo === "utilitario") {
			lista = esCombustibleComun
				? (esNuevo ? aniosDisponibles.slice(0, 2)
					: ctx.condicion === "Usado" ? aniosDisponibles.slice(0, CONFIG.LIMITES_ANIOS.UTILITARIO + 1)
					: aniosDisponibles.slice(0, 4))
				: (esNuevo ? aniosDisponibles.slice(0, 2) : aniosDisponibles.slice(0, 4));

		} else if (ctx.vehiculo === "moto") {
			if (ctx.combustible === "nafta") {
				if (!ctx.cilindrada || ctx.cilindrada < CILINDRADA_MINIMA_MOTO) return [];
				lista = aniosDisponibles.slice(0, CONFIG.LIMITES_ANIOS.MOTO + 1);
			} else if (ctx.combustible === "electricoMoto") {
				if (!ctx.potencia || ctx.potencia < POTENCIA_MINIMA_MOTO) return [];
				lista = aniosDisponibles.slice(0, CONFIG.LIMITES_ANIOS.MOTO + 1);
			}

		} else if (ctx.vehiculo === "cuatriciclo") {
			lista = aniosDisponibles.slice(0, CONFIG.LIMITES_ANIOS.CUATRICICLO + 1);
		}

		return lista;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Devuelve los plazos disponibles para el contexto dado
	// ─────────────────────────────────────────────────────────────────────────
	function obtenerPlazos(ctx) {
		if (!ctx?.vehiculo || !ctx?.combustible || !ctx?.anio) return [];

		let lista = [];
		const idxAnio       = aniosDisponibles.indexOf(ctx.anio);
		const esCombComun   = ["comun", "nafta", "electricoAuto"].includes(ctx.combustible);

		if (ctx.vehiculo === "auto" || ctx.vehiculo === "utilitario") {
			const esUsado = ctx.condicion === "Usado";
			lista = esCombComun && !esUsado
				? CONFIG.PLAZOS.filter((_, i) => i !== 1)
				: esCombComun && esUsado
					? idxAnio <= 7  ? CONFIG.PLAZOS.filter((_, i) => i <= 5 && i !== 1)
					: idxAnio === 8 ? CONFIG.PLAZOS.filter((_, i) => i <= 4 && i !== 1)
					:                 CONFIG.PLAZOS.filter((_, i) => i <= 3 && i !== 1)
				: CONFIG.PLAZOS.filter((_, i) => i <= 3 && i !== 1);

		} else if (ctx.vehiculo === "moto") {
			lista = ctx.combustible === "nafta"
				? ctx.anio >= aniosDisponibles[4] ? [...CONFIG.PLAZOS]
				: ctx.anio === aniosDisponibles[5] ? CONFIG.PLAZOS.slice(0, 5)
				:                                    CONFIG.PLAZOS.slice(0, 4)
				: [...CONFIG.PLAZOS];

		} else if (ctx.vehiculo === "cuatriciclo") {
			lista = [...CONFIG.PLAZOS];
		}

		return lista;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Devuelve las tasas disponibles para el contexto dado
	// Cada ítem: { valor: number, texto: string }
	// ─────────────────────────────────────────────────────────────────────────
	function obtenerTasas(ctx) {
		if (!(ctx?.vehiculo && ctx?.combustible && ctx?.anio && ctx?.plazo)) return [];

		const idxPlazo     = CONFIG.PLAZOS.indexOf(ctx.plazo);
		if (idxPlazo === -1) return [];

		const tasasDisponibles  = [];
		const esCombComun       = ["comun", "nafta"].includes(ctx.combustible);
		const quebrantoPlazo    = QUEBRANTOS_POR_PLAZO[idxPlazo] ?? 0;
		const formatPct         = (v) => `${v.toFixed(1).replace(".", ",")}%`;

		const agregarTasa = (valor, etiqueta, textoForzado) => {
			if (typeof valor !== "number" || Number.isNaN(valor)) return;
			tasasDisponibles.push({
				valor,
				texto: textoForzado ?? `${etiqueta} (${formatPct(valor)})`
			});
		};

		if (["auto", "utilitario"].includes(ctx.vehiculo)) {
			const tasaFija = esCombComun
				? CONFIG.TASAS.AUTO.COMUN[idxPlazo]
				: CONFIG.TASAS.AUTO.ELECTRICO[idxPlazo];

			if (TASA_FIJA_HABILITADA) agregarTasa(tasaFija, "Fija");

			if (ctx.anio >= LIMITES_UVA.AUTOS.INICIO && ctx.plazo <= LIMITES_UVA.AUTOS.MESES_MAX) {
				const tasaUva = CONFIG.TASAS.AUTO.UVA[idxPlazo];
				if (TASA_UVA_HABILITADA)  agregarTasa(tasaUva, "UVA");
				if (TASA_CERO_HABILITADA && quebrantoPlazo > 0) agregarTasa(0, "Tasa 0%", "Tasa 0%");
			}

		} else {
			const tasaFija = esCombComun
				? CONFIG.TASAS.MOTO.COMUN[idxPlazo]
				: CONFIG.TASAS.MOTO.ELECTRICO[idxPlazo];

			if (TASA_FIJA_HABILITADA) agregarTasa(tasaFija, "Fija");

			const aplicaUva =
				(ctx.vehiculo === "moto" && ctx.combustible === "nafta"      && ctx.cilindrada >= CONFIG.LIMITES.MOTO.CILINDRADA.MEDIA) ||
				(ctx.vehiculo === "moto" && ctx.combustible === "electricoMoto" && ctx.potencia >= POTENCIA_MINIMA_MOTO) ||
				(ctx.vehiculo === "cuatriciclo");

			if (aplicaUva && ctx.anio >= LIMITES_UVA.MOTOS.INICIO && ctx.plazo <= LIMITES_UVA.MOTOS.MESES_MAX) {
				const tasaUva = CONFIG.TASAS.MOTO.UVA[idxPlazo];
				if (TASA_UVA_HABILITADA)  agregarTasa(tasaUva, "UVA");
				if (TASA_CERO_HABILITADA && quebrantoPlazo > 0) agregarTasa(0, "Tasa 0%", "Tasa 0%");
			}
		}

		return tasasDisponibles;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Calcula la cuota mensual dado un contexto
	// @returns {object|null} objeto con cuota y textos formateados, o null si faltan datos
	// ─────────────────────────────────────────────────────────────────────────
	function calcularCuota(ctx, textoTasaForzado = "") {
		const monto = ctx?.monto;
		const plazo = ctx?.plazo;
		const tasa  = ctx?.tasa;

		if (!monto || !plazo || tasa === null || Number.isNaN(tasa)) return null;

		const idxPlazo = CONFIG.PLAZOS.indexOf(plazo);
		if (idxPlazo === -1) return null;

		const tasaMensual       = tasa / 12 / 100;
		const montoConGastos    = monto / (1 - CONFIG.GASTOS_ADMIN / 100);
		const montoRedondeado   = Math.round(montoConGastos);
		const quebrantoConIVA   = (QUEBRANTOS_POR_PLAZO[idxPlazo] ?? 0) / 100 * (1 + CONFIG.IVA / 100);
		const montoConQuebranto = Math.round(montoConGastos / (1 - quebrantoConIVA));

		// Cuota base (sistema francés o lineal si tasa = 0)
		const cuotaBase = tasaMensual === 0
			? montoConQuebranto / plazo
			: montoRedondeado * tasaMensual / (1 - Math.pow(1 + tasaMensual, -plazo));

		// IVA sobre intereses
		const ivaIntereses = montoRedondeado * tasaMensual * (CONFIG.IVA / 100);

		const cuotaFinal = tasaMensual === 0
			? Math.round(cuotaBase)
			: Math.ceil(cuotaBase + ivaIntereses);

		const textoTasa = textoTasaForzado || `${tasa.toFixed(1).replace(".", ",")}%`;

		return {
			cuota:      cuotaFinal,
			montoTexto: `$ ${formatearPesos(monto)}`,
			anioTexto:  ctx.anio ? String(ctx.anio) : "",
			plazoTexto: `${plazo} meses`,
			tasaTexto:  textoTasa,
			cuotaTexto: `$ ${formatearPesos(cuotaFinal)}`
		};
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Calcula la cuota con el estado actual de los selects
	// ─────────────────────────────────────────────────────────────────────────
	function calcularCuotaActual() {
		const textoTasa = DOM.inputs.tasa.options[DOM.inputs.tasa.selectedIndex]?.textContent
			|| `${estado.tasa?.toFixed(1).replace(".", ",")}%`;
		return calcularCuota(leerEstado(), textoTasa);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Puebla un <select> con opciones y devuelve el valor seleccionado
	// @param {HTMLSelectElement} selectEl
	// @param {Array<{valor, texto}>} opciones
	// @param {any} valorPreferido - valor a preseleccionar
	// @param {string} placeholder - texto del placeholder
	// ─────────────────────────────────────────────────────────────────────────
	function poblarSelect(selectEl, opciones, valorPreferido, placeholder) {
		if (!selectEl) return "";
		selectEl.innerHTML = `<option value="" disabled hidden>${placeholder}</option>`;

		opciones.forEach(op => {
			const opt       = document.createElement("option");
			opt.value       = String(op.valor);
			opt.textContent = op.texto;
			selectEl.appendChild(opt);
		});

		const valorStr = valorPreferido != null ? String(valorPreferido) : "";
		const existe   = opciones.some(op => String(op.valor) === valorStr);

		selectEl.disabled = opciones.length === 0;
		selectEl.value    = existe ? valorStr : "";
		if (!selectEl.value) selectEl.selectedIndex = 0;
		return selectEl.value;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Detecta si el contenido de un elemento desborda (varias líneas)
	// ─────────────────────────────────────────────────────────────────────────
	function textoDesborda(el) {
		if (!el || !el.textContent || !el.textContent.trim()) return false;

		const estilos    = window.getComputedStyle(el);
		const lineHeight = parseFloat(estilos.lineHeight) || 1.4 * parseFloat(estilos.fontSize);
		const altoUnaLinea = lineHeight + (parseFloat(estilos.paddingTop) || 0) + (parseFloat(estilos.paddingBottom) || 0);
		const altoReal   = el.getBoundingClientRect().height;

		const cantLineas = (function contarLineas(el) {
			if (!el || !el.textContent || !el.textContent.trim()) return 0;
			const rango = document.createRange();
			rango.selectNodeContents(el);
			const n = rango.getClientRects().length;
			rango.detach?.();
			return n;
		})(el);

		return cantLineas > 1 || altoReal > altoUnaLinea + 0.45 * lineHeight;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Ajusta la grilla de datos de préstamo en el modal según si desborda la cuota
	// ─────────────────────────────────────────────────────────────────────────
	function ajustarColumnasPreaprobado() {
		const grid   = DOM.preaprobadoPrestamoGrid;
		if (!grid) return;
		const elCuota  = DOM.preaprobadoPrestamo?.cuota?.visible;
		const desborda = Boolean(elCuota && !elCuota.classList.contains("is-empty") && textoDesborda(elCuota));
		grid.classList.toggle("is-two-columns", desborda);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Actualiza los datos del panel Preaprobado (selects y textos de resumen)
	// @param {boolean} forzarDesdeCalculadora - si true, toma los valores del estado global
	// ─────────────────────────────────────────────────────────────────────────
	function actualizarPanelPreaprobado(forzarDesdeCalculadora = false) {
		const panelPreaprobado = DOM.preaprobadoPrestamo;
		if (!panelPreaprobado || !panelPreaprobado.monto) return;

		// Sincroniza los selects del panel con los disponibles en la calculadora
		(function sincronizarSelectsPreaprobado(forzar = false) {
			const ctrlAnio  = DOM.preaprobadoPrestamo?.anio?.control;
			const ctrlPlazo = DOM.preaprobadoPrestamo?.plazo?.control;
			const ctrlTasa  = DOM.preaprobadoPrestamo?.tasa?.control;
			if (!ctrlAnio || !ctrlPlazo || !ctrlTasa) return;

			const ctxActual    = leerEstado();
			const opcsAnio     = obtenerAnios(ctxActual).map(a => ({ valor: a, texto: String(a) }));
			const valAnioPref  = forzar ? ctxActual.anio : parseInt(ctrlAnio.value, 10) || ctxActual.anio;
			const anioSel      = parseInt(poblarSelect(ctrlAnio, opcsAnio, valAnioPref, "desde calculadora"), 10);

			const ctxConAnio   = leerEstado({ anio: Number.isFinite(anioSel) ? anioSel : null });
			const opcsPlazos   = obtenerPlazos(ctxConAnio).map(p => ({ valor: p, texto: `${p} meses` }));
			const valPlazoPref = forzar ? ctxConAnio.plazo : parseInt(ctrlPlazo.value, 10) || ctxConAnio.plazo;
			const plazoSel     = parseInt(poblarSelect(ctrlPlazo, opcsPlazos, valPlazoPref, "desde calculadora"), 10);

			const ctxConPlazo  = leerEstado({ anio: Number.isFinite(anioSel) ? anioSel : null, plazo: Number.isFinite(plazoSel) ? plazoSel : null });
			poblarSelect(ctrlTasa, obtenerTasas(ctxConPlazo), forzar ? ctxConPlazo.tasa : parseFloat(ctrlTasa.value) || ctxConPlazo.tasa, "desde calculadora");

			actualizarEstadoVisual(ctrlAnio);
			actualizarEstadoVisual(ctrlPlazo);
			actualizarEstadoVisual(ctrlTasa);
		})(forzarDesdeCalculadora);

		// Calcula los textos a mostrar usando los selects del modal
		const textos = (function calcularTextosPanel() {
			const ctxActual = leerEstado();
			const ctrlAnio  = DOM.preaprobadoPrestamo?.anio?.control;
			const ctrlPlazo = DOM.preaprobadoPrestamo?.plazo?.control;
			const ctrlTasa  = DOM.preaprobadoPrestamo?.tasa?.control;

			const anioVal   = parseInt(ctrlAnio?.value  || "", 10);
			const plazoVal  = parseInt(ctrlPlazo?.value || "", 10);
			const tasaVal   = parseFloat(ctrlTasa?.value || "");
			const textoTasa = ctrlTasa?.options?.[ctrlTasa.selectedIndex]?.textContent || "";

			const resultado = calcularCuota(
				leerEstado({
					anio:  Number.isFinite(anioVal)  ? anioVal  : null,
					plazo: Number.isFinite(plazoVal) ? plazoVal : null,
					tasa:  Number.isFinite(tasaVal)  ? tasaVal  : null
				}),
				textoTasa
			);

			return {
				montoTexto: Number.isFinite(ctxActual.monto) && ctxActual.monto > 0 ? `$ ${formatearPesos(ctxActual.monto)}` : "",
				anioTexto:  Number.isFinite(anioVal)  ? String(anioVal)  : "",
				plazoTexto: Number.isFinite(plazoVal) ? `${plazoVal} meses` : "",
				tasaTexto:  Number.isFinite(tasaVal)  ? textoTasa : "",
				cuotaTexto: resultado?.cuotaTexto || ""
			};
		})();

		// Actualiza los elementos visible/hidden del panel
		Object.entries(panelPreaprobado).forEach(([campo, refs]) => {
			const texto = textos[`${campo}Texto`] || "";
			if (refs.hidden)  refs.hidden.value     = texto;
			if (refs.visible) {
				refs.visible.textContent = texto || "desde calculadora";
				refs.visible.classList.toggle("is-empty", texto === "");
			}
		});

		requestAnimationFrame(ajustarColumnasPreaprobado);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Sincroniza los selects de la calculadora principal desde el modal Preaprobado
	// (cuando el usuario edita año/plazo/tasa en el modal)
	// ─────────────────────────────────────────────────────────────────────────
	function sincronizarCalculadoraDesdeModal() {
		const anioModal  = parseInt(DOM.preaprobadoPrestamo?.anio?.control?.value  || "", 10);
		const plazoModal = parseInt(DOM.preaprobadoPrestamo?.plazo?.control?.value || "", 10);
		const tasaModal  = parseFloat(DOM.preaprobadoPrestamo?.tasa?.control?.value || "");

		const selAnio  = DOM.inputs.anio;
		const selPlazo = DOM.inputs.plazo;
		const selTasa  = DOM.inputs.tasa;

		if (!(selAnio && selPlazo && selTasa && Number.isFinite(anioModal) && Number.isFinite(plazoModal) && Number.isFinite(tasaModal))) return;

		cargarAnio();
		if (!Array.from(selAnio.options).some(o => o.value === String(anioModal))) return;
		if (selAnio.value !== String(anioModal)) {
			selAnio.value = String(anioModal);
			selAnio.dispatchEvent(new Event("change", { bubbles: true }));
		} else {
			estado.anio = anioModal;
			actualizarEstadoVisual(selAnio);
		}

		cargarPlazo();
		if (!Array.from(selPlazo.options).some(o => o.value === String(plazoModal))) return;
		if (selPlazo.value !== String(plazoModal)) {
			selPlazo.value = String(plazoModal);
			selPlazo.dispatchEvent(new Event("change", { bubbles: true }));
		} else {
			estado.plazo = plazoModal;
			actualizarEstadoVisual(selPlazo);
		}

		cargarTasa();
		if (Array.from(selTasa.options).some(o => o.value === String(tasaModal))) {
			if (selTasa.value !== String(tasaModal)) {
				selTasa.value = String(tasaModal);
				selTasa.dispatchEvent(new Event("change", { bubbles: true }));
			} else {
				estado.tasa = tasaModal;
				actualizarEstadoVisual(selTasa);
				actualizarBotonCalcular();
			}
			if (!DOM.btnCalcular.disabled && calcularCuotaActual()) mostrarResultado();
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Muestra el resultado de la cuota calculada
	// ─────────────────────────────────────────────────────────────────────────
	function mostrarResultado() {
		const resultado = calcularCuotaActual();
		if (!resultado) return;

		estado.cuota = resultado.cuota;
		DOM.btnCalcular.classList.add("vis-hidden");
		if (DOM.resultado.fraseInfo) DOM.resultado.fraseInfo.classList.add("vis-hidden");

		DOM.resultado.container.innerHTML = `
					<div class="resultado-cuota-total">Total Cuota $ ${resultado.cuota.toLocaleString("es-AR")}</div>
					<p class="resultado-cuota-leyenda">Valor de la cuota sujeto a aprobación crediticia de acuerdo a pautas de la entidad interviniente.</p>
					<button type="button" class="resultado-preaprobado" id="btnSolicitarPreaprobado">Solicitar Preaprobado</button>
				`;

		DOM.resultado.container.classList.remove("resultado-hidden");
		DOM.resultado.container.classList.add("resultado-visible");
		DOM.resultado.container.style.animation = "none";
		DOM.resultado.container.style.opacity   = "0";

		posicionarResultado();
		ajustarFuenteResultado();

		requestAnimationFrame(() => {
			DOM.resultado.container.style.animation = "";
			DOM.resultado.container.style.opacity   = "";
		});

		actualizarPanelPreaprobado();
		document.getElementById("btnSolicitarPreaprobado").addEventListener("click", abrirModalPreaprobado);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Habilita/deshabilita el botón Calcular según si todos los campos están completos
	// ─────────────────────────────────────────────────────────────────────────
	function actualizarBotonCalcular() {
		const listo =
			DOM.inputs.monto.classList.contains("input-con-valor") &&
			estado.vehiculo &&
			estado.combustible &&
			estado.condicion &&
			estado.anio &&
			estado.plazo &&
			estado.tasa !== null && !Number.isNaN(estado.tasa);

		DOM.btnCalcular.disabled = !listo;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Invalida y resetea los campos dependientes a partir del campo indicado.
	// @param {string} campoOrigen - nombre del campo que cambió
	// @param {object} estadoAnterior - snapshot del estado antes del cambio
	// ─────────────────────────────────────────────────────────────────────────
	function invalidarDependientes(campoOrigen, estadoAnterior = {}) {
		const orden = ["vehiculo", "combustible", "condicion", "anio", "plazo", "tasa"];
		let idxOrigen = orden.indexOf(campoOrigen);
		if (idxOrigen === -1) return;

		let ctxAux = leerEstado(estadoAnterior);

		for (let i = idxOrigen + 1; i < orden.length; i++) {
			const campo  = orden[i];
			const selectEl = DOM.inputs[campo];
			let debeLimpiar = false;

			if (campo === "combustible") {
				const combAnt = estadoAnterior.vehiculo ? obtenerCombustiblesParaVehiculo(ctxAux.vehiculo) : [];
				const combNuevo = estado.vehiculo ? obtenerCombustiblesParaVehiculo(estado.vehiculo) : [];
				debeLimpiar = JSON.stringify(combAnt) !== JSON.stringify(combNuevo);
			} else if (campo === "condicion") {
				debeLimpiar = estadoAnterior.vehiculo !== estado.vehiculo || estadoAnterior.combustible !== estado.combustible;
			} else if (campo === "anio") {
				debeLimpiar = estadoAnterior.vehiculo !== estado.vehiculo || estadoAnterior.combustible !== estado.combustible ||
					estadoAnterior.condicion !== estado.condicion || estadoAnterior.cilindrada !== estado.cilindrada ||
					estadoAnterior.potencia !== estado.potencia;
			} else if (campo === "plazo") {
				debeLimpiar = estadoAnterior.anio !== estado.anio;
			} else if (campo === "tasa") {
				debeLimpiar = estadoAnterior.plazo !== estado.plazo;
			}

			if (debeLimpiar && selectEl) {
				selectEl.innerHTML = '<option value="" disabled selected hidden>Opciones</option>';
				selectEl.classList.remove("select-con-valor");
				selectEl.value = "";
				estado[campo] = null;
			}
			ctxAux = { ...ctxAux, [campo]: estado[campo] };
		}

		estado.cuota = null;
		actualizarPanelPreaprobado();
		ocultarResultado();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Devuelve las opciones de combustible según el tipo de vehículo
	// ─────────────────────────────────────────────────────────────────────────
	function obtenerCombustiblesParaVehiculo(vehiculo) {
		if (["auto", "utilitario"].includes(vehiculo))
			return [{ v: "comun", t: "Nafta/Diesel" }, { v: "electricoAuto", t: "Híbrido/Eléctrico" }];
		if (vehiculo === "moto")
			return [{ v: "nafta", t: "Nafta" }, { v: "electricoMoto", t: "Eléctrico" }];
		if (vehiculo === "cuatriciclo")
			return [{ v: "nafta", t: "Nafta" }, { v: "electricoCuatri", t: "Eléctrico" }];
		return [];
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Oculta el panel de resultado y restaura el botón Calcular
	// ─────────────────────────────────────────────────────────────────────────
	function ocultarResultado() {
		DOM.resultado.container.classList.add("resultado-hidden");
		DOM.resultado.container.classList.remove("resultado-visible");
		DOM.resultado.container.style.top       = "";
		DOM.resultado.container.style.left      = "";
		DOM.resultado.container.style.width     = "";
		DOM.resultado.container.style.height    = "";
		DOM.resultado.container.style.maxHeight = "";
		DOM.resultado.container.style.transform = "";
		DOM.btnCalcular.classList.remove("vis-hidden");
		if (DOM.resultado.fraseInfo) DOM.resultado.fraseInfo.classList.remove("vis-hidden");
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Configura validación sintáctica de email en un input
	// ─────────────────────────────────────────────────────────────────────────
	function configurarValidacionEmail(inputEl) {
		if (!inputEl) return;
		const validar = () => {
			const val = inputEl.value.trim();
			if (val === "") {
				inputEl.setCustomValidity("");
			} else if (/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(val)) {
				inputEl.setCustomValidity("");
			} else {
				inputEl.setCustomValidity("Ingresá un mail válido con formato usuario@dominio.extensión.");
			}
			actualizarEstadoVisual(inputEl);
		};
		inputEl._syncCustomEmailValidity = validar;
		inputEl.addEventListener("input",  validar);
		inputEl.addEventListener("change", validar);
		inputEl.addEventListener("blur",   validar);
		validar();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Configura un input tel para aceptar solo números y mínimo 10 dígitos
	// ─────────────────────────────────────────────────────────────────────────
	function configurarTelefonoSoloNumeros(inputEl) {
		if (!inputEl) return;
		const validar = () => {
			const soloNum = inputEl.value.replace(/\D+/g, "");
			if (inputEl.value !== soloNum) inputEl.value = soloNum;
			if (soloNum !== "" && soloNum.length < 10) {
				inputEl.setCustomValidity("Ingresá solo números, con mínimo 10 dígitos.");
			} else {
				inputEl.setCustomValidity("");
			}
			actualizarEstadoVisual(inputEl);
		};
		inputEl._syncCustomPhoneDigits = validar;
		inputEl.addEventListener("input",  validar);
		inputEl.addEventListener("change", validar);
		inputEl.addEventListener("blur",   validar);
		validar();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Agrega/quita la clase CSS de "campo con valor" según validez del campo
	// ─────────────────────────────────────────────────────────────────────────
	function actualizarEstadoVisual(inputEl) {
		if (!inputEl || !inputEl.tagName) return;
		if (inputEl.matches('input[type="hidden"], input[type="checkbox"], input[type="radio"]')) return;

		const claseValido = inputEl.tagName === "SELECT" ? "select-con-valor" : "input-con-valor";

		const tieneValor = (function esValido(el) {
			if (!el || el.disabled) return false;
			if (el.matches('input[type="hidden"], input[type="checkbox"], input[type="radio"]')) return false;
			if (el.type === "file") return el.files && el.files.length > 0 && el.checkValidity();
			const val = typeof el.value === "string" ? el.value.trim() : el.value;
			return val !== "" && el.checkValidity();
		})(inputEl);

		inputEl.classList.toggle(claseValido, tieneValor);

		// Custom select wrapper
		const customSelect = inputEl.tagName === "SELECT" ? inputEl.closest(".custom-select") : null;
		if (customSelect) customSelect.classList.toggle("is-valid", tieneValor);

		// File picker wrapper
		const filePicker = inputEl.type === "file" ? inputEl.closest(".modal-preaprobado__file-picker") : null;
		if (filePicker) filePicker.classList.toggle("is-valid", tieneValor);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Inicializa los listeners de validación visual en todos los campos del form
	// ─────────────────────────────────────────────────────────────────────────
	function inicializarValidacionVisual(formEl) {
		if (!formEl) return;
		formEl.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')
			.forEach(el => {
				const fn = () => actualizarEstadoVisual(el);
				el.addEventListener("input",  fn);
				el.addEventListener("change", fn);
				el.addEventListener("blur",   fn);
			});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Resetea las clases de validación visual de un formulario
	// ─────────────────────────────────────────────────────────────────────────
	function resetearClasesValidacion(formEl) {
		if (!formEl) return;
		formEl.querySelectorAll(".input-con-valor").forEach(el => el.classList.remove("input-con-valor"));
		formEl.querySelectorAll(".select-con-valor").forEach(el => el.classList.remove("select-con-valor"));
		formEl.querySelectorAll(".custom-select.is-valid").forEach(el => el.classList.remove("is-valid"));
		formEl.querySelectorAll(".modal-preaprobado__file-picker.is-valid").forEach(el => el.classList.remove("is-valid"));
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Cierra los custom-selects abiertos excepto el indicado
	// ─────────────────────────────────────────────────────────────────────────
	function cerrarOtrosSelects(excepto = null) {
		document.querySelectorAll("#calculadora .custom-select.open").forEach(cs => {
			if (cs !== excepto) cs.classList.remove("open");
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Ajusta el font-size de las opciones de un custom-select para que entren en una línea
	// ─────────────────────────────────────────────────────────────────────────
	function ajustarFuenteOpciones(customSelectEl) {
		if (!customSelectEl) return;
		const listaOpc = customSelectEl.querySelector(".options");
		if (!listaOpc || !customSelectEl.classList.contains("open")) return;

		listaOpc.querySelectorAll("li").forEach(li => {
			li.style.fontSize     = "";
			li.style.letterSpacing= "";
			const fzBase = parseFloat(window.getComputedStyle(li).fontSize);
			if (!fzBase) return;
			let fz = fzBase;
			while (li.scrollWidth > li.clientWidth && fz > 10.5) {
				fz -= 0.25;
				li.style.fontSize = `${fz}px`;
			}
			if (li.scrollWidth > li.clientWidth) li.style.letterSpacing = "-0.02em";
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Muestra un modal de entrada numérica para cilindrada o potencia
	// @param {string} titulo - etiqueta del campo
	// @param {string} unidad - "cc" o "w"
	// @param {number} minimo - valor mínimo aceptable
	// @param {number|null} maximo - valor máximo (o null si no hay límite superior)
	// @param {Function} callback - función llamada con el valor ingresado
	// ─────────────────────────────────────────────────────────────────────────
	function mostrarModalNumerico(titulo, unidad, minimo, maximo, callback) {
		const fondo  = document.createElement("div");
		fondo.className = "js-modal-fondo";

		const modal  = document.createElement("div");
		modal.className = "js-modal";

		const label  = document.createElement("label");
		label.textContent = titulo;
		label.className   = "js-modal-label";

		const input  = document.createElement("input");
		input.type        = "text";
		input.className   = "js-modal-input";
		input.placeholder = unidad === "w" && maximo
			? `Entre ${minimo.toLocaleString("es-AR")}w y ${maximo.toLocaleString("es-AR")}w`
			: maximo
				? `Entre ${minimo} y ${maximo}`
				: `Mínimo ${minimo.toLocaleString("es-AR")}${unidad}`;

		const moverCursor = (pos) => { try { input.setSelectionRange(pos, pos); } catch (e) {} };

		const setValorFormateado = (val = "") => {
			if (val) {
				const fmt = parseInt(val, 10).toLocaleString("es-AR");
				input.value = `${fmt} ${unidad}`;
				return fmt.length;
			}
			input.value = "";
			return 0;
		};

		input.addEventListener("input", () => {
			const raw = input.value.replace(/[^0-9]/g, "");
			const pos = setValorFormateado(raw);
			moverCursor(pos);
		});
		input.addEventListener("click", () => {
			const raw = input.value.replace(/[^0-9]/g, "");
			const pos = raw ? parseInt(raw, 10).toLocaleString("es-AR").length : 0;
			moverCursor(pos);
		});

		const btnAceptar = document.createElement("button");
		btnAceptar.textContent = "Aceptar";
		btnAceptar.className   = "js-modal-btn";

		const cerrar = () => { if (document.body.contains(fondo)) document.body.removeChild(fondo); };

		fondo.addEventListener("click", cerrar);
		modal.addEventListener("click", e => e.stopPropagation());
		input.addEventListener("keydown", e => {
			if (e.key === "Enter") { e.preventDefault(); btnAceptar.click(); }
			else if (e.key === "Escape") cerrar();
		});

		btnAceptar.onclick = () => {
			const valor = parseInt(input.value.replace(/[^0-9]/g, ""), 10);
			if (!isNaN(valor) && valor >= minimo && (!maximo || valor <= maximo)) {
				callback(valor);
				cerrar();
			} else {
				setValorFormateado("");
				input.focus();
			}
		};

		modal.appendChild(label);
		modal.appendChild(input);
		modal.appendChild(document.createElement("br"));
		modal.appendChild(btnAceptar);
		fondo.appendChild(modal);
		document.body.appendChild(fondo);
		setValorFormateado("");
		input.focus();
		moverCursor(0);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Modal Preaprobado: quita max-height forzada
	// ─────────────────────────────────────────────────────────────────────────
	function eliminarMaxHeightModal() {
		const modal = DOM.modales.preaprobado;
		if (modal) modal.style.removeProperty("--modal-preaprobado-max-height");
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Modal Preaprobado: actualiza las variables CSS del overlay
	// ─────────────────────────────────────────────────────────────────────────
	function actualizarOverlayModal() {
		const modal   = DOM.modales.preaprobado;
		const overlay = DOM.modales.overlay;
		const contenido = modal?.querySelector(".modal-preaprobado__content");
		if (!modal || !overlay || !contenido) return;

		if (modal.getAttribute("aria-hidden") === "true") {
			modal.style.removeProperty("--modal-preaprobado-overlay-top");
			modal.style.removeProperty("--modal-preaprobado-overlay-width");
			modal.style.removeProperty("--modal-preaprobado-overlay-height");
			modal.style.removeProperty("--modal-preaprobado-overlay-bleed");
			return;
		}

		modal.style.setProperty("--modal-preaprobado-overlay-top",    `${contenido.offsetTop}px`);
		modal.style.setProperty("--modal-preaprobado-overlay-width",  `${contenido.offsetWidth}px`);
		modal.style.setProperty("--modal-preaprobado-overlay-height", `${contenido.offsetHeight}px`);
		modal.style.setProperty("--modal-preaprobado-overlay-bleed",  "12px");
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Modal Preaprobado: calcula y aplica el offset top de posicionamiento
	// ─────────────────────────────────────────────────────────────────────────
	function calcularOffsetTopModal() {
		const modal = DOM.modales.preaprobado;
		if (!modal) return;

		const estilosRoot    = window.getComputedStyle(document.documentElement);
		const header         = document.querySelector("header");
		const alturaHeader   = header ? header.getBoundingClientRect().height : parseFloat(estilosRoot.getPropertyValue("--header-height")) || 52;
		const gapTop         = parseFloat(estilosRoot.getPropertyValue("--modal-preaprobado-top-gap")) || 0;
		const gutterInline   = parseFloat(estilosRoot.getPropertyValue("--modal-inline-gutter")) || 0;
		const selCombustible = document.getElementById("tipoCombustible");
		const scrollY        = window.scrollY || window.pageYOffset || 0;

		const btnSelComb = selCombustible?.closest(".custom-select")?.querySelector(".selected");
		const refEl      = (btnSelComb || selCombustible);
		const rect       = refEl?.getBoundingClientRect();
		const centroRef  = (rect ? rect.top + scrollY + rect.height / 2 : alturaHeader + gapTop) - gutterInline;
		const topFinal   = Math.max(alturaHeader + gapTop, centroRef);

		modal.style.setProperty("--modal-preaprobado-top-offset", `${topFinal}px`);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Modal Preaprobado: ajusta el ancho para que coincida con la calculadora
	// ─────────────────────────────────────────────────────────────────────────
	function actualizarAnchoModal() {
		const modal       = DOM.modales.preaprobado;
		const contenedor  = document.querySelector("#calculadora .calculadora-container");
		if (!modal || !contenedor) return;

		const estilosRoot = window.getComputedStyle(document.documentElement);
		const escala      = parseFloat(estilosRoot.getPropertyValue("--modal-preaprobado-scale")) || 1;
		const anchoContenedor = contenedor.getBoundingClientRect().width;
		if (!anchoContenedor) return;

		modal.style.setProperty("--modal-preaprobado-width", `${anchoContenedor * escala}px`);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Abre el modal Preaprobado: oculta resultado, restaura estado del form
	// ─────────────────────────────────────────────────────────────────────────
	function abrirModalPreaprobado() {
		ocultarResultado();

		// Restaurar valores guardados en estado.preaprobadoForm
		(function restaurarFormPreaprobado() {
			if (!formPreaprobado) return;
			const datosGuardados = estado.preaprobadoForm || {};

			formPreaprobado.querySelectorAll("input, select, textarea").forEach(el => {
				if (el.type === "file") return;
				const clave = obtenerClaveInput(el);
				if (!clave || !(clave in datosGuardados)) return;
				if (el.type === "radio")    el.checked = el.value === datosGuardados[clave];
				else if (el.type === "checkbox") el.checked = Boolean(datosGuardados[clave]);
				else el.value = datosGuardados[clave] ?? "";
			});

			formPreaprobado.querySelectorAll('input[type="email"]').forEach(el => el._syncCustomEmailValidity?.());
			formPreaprobado.querySelectorAll('input[type="tel"]').forEach(el => el._syncCustomPhoneDigits?.());
			sincronizarRadiosDinamicos();
			formPreaprobado.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select').forEach(actualizarEstadoVisual);

			if (errorTerminos) errorTerminos.classList.remove("visible");

			const radioSi  = formPreaprobado.querySelector("#datosPrestamoSi");
			const seccionPrestamo = radioSi?.closest(".modal-preaprobado__section");
			if (seccionPrestamo) seccionPrestamo.classList.toggle("prestamo-datos-ok", radioSi?.checked === true);

			actualizarBotonEnviarPreaprobado();
		})();

		// Si el usuario dijo "No" a los datos, resetear esa respuesta
		const radioNo = formPreaprobado?.querySelector("#datosPrestamoNo");
		if (radioNo?.checked) {
			const radioSi = formPreaprobado.querySelector("#datosPrestamoSi");
			if (radioSi) radioSi.checked = false;
			radioNo.checked = false;
			const seccion = radioSi?.closest(".modal-preaprobado__section");
			if (seccion) seccion.classList.remove("prestamo-datos-ok");
			if (estado.preaprobadoForm) delete estado.preaprobadoForm["radio:datosPrestamo"];
		}

		actualizarPanelPreaprobado(true);
		DOM.modales.preaprobado.setAttribute("aria-hidden", "false");

		requestAnimationFrame(() => {
			calcularOffsetTopModal();
			actualizarAnchoModal();
			eliminarMaxHeightModal();
			actualizarOverlayModal();
			ajustarColumnasPreaprobado();
			document.body.classList.add("modal-preaprobado-open");
			requestAnimationFrame(() => {
				calcularOffsetTopModal();
				actualizarAnchoModal();
				actualizarOverlayModal();
				ajustarColumnasPreaprobado();
			});
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Cierra el modal Preaprobado
	// @param {boolean} guardar - si true, guarda el estado del form antes de cerrar
	// ─────────────────────────────────────────────────────────────────────────
	function cerrarModalPreaprobado(guardar = true) {
		document.body.classList.remove("modal-preaprobado-open");
		if (guardar) guardarEstadoFormPreaprobado();
		DOM.modales.preaprobado.setAttribute("aria-hidden", "true");
		DOM.modales.preaprobado.style.removeProperty("--modal-preaprobado-max-height");
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Devuelve la clave identificadora de un input (para guardado de estado)
	// ─────────────────────────────────────────────────────────────────────────
	function obtenerClaveInput(inputEl) {
		if (inputEl.type === "radio") return `radio:${inputEl.name}`;
		return inputEl.id || inputEl.name || "";
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Guarda el estado actual del formulario Preaprobado en estado.preaprobadoForm
	// ─────────────────────────────────────────────────────────────────────────
	function guardarEstadoFormPreaprobado() {
		if (!formPreaprobado) return;
		const datos = {};
		formPreaprobado.querySelectorAll("input, select, textarea").forEach(el => {
			if (el.type === "file") return;
			const clave = obtenerClaveInput(el);
			if (!clave) return;
			if      (el.type === "radio")    { if (el.checked) datos[clave] = el.value; }
			else if (el.type === "checkbox") datos[clave] = el.checked;
			else                             datos[clave] = el.value;
		});
		estado.preaprobadoForm = datos;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Sincroniza los radios de cónyuge y cotitular disparando el evento change
	// ─────────────────────────────────────────────────────────────────────────
	function sincronizarRadiosDinamicos() {
		["estadoConyuge", "estadoCotitular"].forEach(nombre => {
			const radioChecked = formPreaprobado.querySelector(`input[name="${nombre}"]:checked`);
			radioChecked?.dispatchEvent(new Event("change"));
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Inicialización de eventos del campo monto
	// ─────────────────────────────────────────────────────────────────────────
	DOM.inputs.monto.addEventListener("input", () => procesarMonto(false));
	DOM.inputs.monto.addEventListener("blur",  () => procesarMonto(true));

	// ─────────────────────────────────────────────────────────────────────────
	// Inicialización de custom selects (reemplaza <select> nativo con UI custom)
	// ─────────────────────────────────────────────────────────────────────────
	Object.values(DOM.inputs)
		.filter(el => el && el.tagName === "SELECT")
		.forEach(selectEl => inicializarCustomSelect(selectEl));

	function inicializarCustomSelect(selectEl) {
		if (!selectEl || selectEl.closest(".custom-select")) return;

		// Estructura del custom select
		const wrapper    = document.createElement("div");
		wrapper.className = "custom-select";
		selectEl.parentNode.insertBefore(wrapper, selectEl);
		wrapper.appendChild(selectEl);

		const btnSelected = document.createElement("button");
		btnSelected.type  = "button";
		btnSelected.className = "selected";

		const spanLabel   = document.createElement("span");
		spanLabel.className = "selected-label";
		btnSelected.appendChild(spanLabel);

		const spanArrow   = document.createElement("span");
		spanArrow.className = "arrow";
		spanArrow.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

		const listaOpc    = document.createElement("ul");
		listaOpc.className = "options";

		wrapper.appendChild(btnSelected);
		wrapper.appendChild(spanArrow);
		wrapper.appendChild(listaOpc);

		// Renderiza el estado visual del custom select
		const renderizar = () => {
			const optSel   = selectEl.options[selectEl.selectedIndex] || null;
			const tieneVal = Boolean(selectEl.value);

			spanLabel.textContent = selectEl.disabled ? "-----"
				: tieneVal && optSel ? optSel.textContent
				: "Opciones";

			wrapper.classList.toggle("is-disabled",    selectEl.disabled);
			wrapper.classList.toggle("is-placeholder", selectEl.disabled || !tieneVal);
			wrapper.classList.toggle("is-valid",       !selectEl.disabled && tieneVal && selectEl.checkValidity());

			listaOpc.innerHTML = "";
			Array.from(selectEl.options).forEach(opt => {
				if (opt.hidden || opt.disabled || opt.value === "") return;
				const li = document.createElement("li");
				li.textContent = opt.textContent;
				li.classList.toggle("is-selected", opt.selected);
				li.setAttribute("tabindex", "-1");
				li.addEventListener("click", () => {
					selectEl.value = opt.value;
					selectEl.dispatchEvent(new Event("change", { bubbles: true }));
					selectEl.dispatchEvent(new Event("input",  { bubbles: true }));
					wrapper.classList.remove("open");
					btnSelected.focus();
					renderizar();
				});
				listaOpc.appendChild(li);
			});
		};

		// Click en el botón del select
		btnSelected.addEventListener("click", () => {
			if (selectEl.disabled) return;
			selectEl.dispatchEvent(new Event("focus"));
			renderizar();
			const estabaAbierto = wrapper.classList.contains("open");
			cerrarOtrosSelects(wrapper);
			wrapper.classList.toggle("open", !estabaAbierto);
			if (!estabaAbierto) {
				requestAnimationFrame(() => {
					ajustarFuenteOpciones(wrapper);
					listaOpc.querySelector("li.is-selected, li")?.focus();
				});
			}
		});

		// Teclado en el botón
		btnSelected.addEventListener("keydown", e => {
			if (selectEl.disabled) return;
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				if (!wrapper.classList.contains("open")) {
					cerrarOtrosSelects(wrapper);
					wrapper.classList.add("open");
					requestAnimationFrame(() => {
						ajustarFuenteOpciones(wrapper);
						(e.key === "ArrowDown"
							? listaOpc.querySelector("li.is-selected, li")
							: listaOpc.querySelector("li:last-child"))?.focus();
					});
				}
			} else if (e.key === "Escape") {
				wrapper.classList.remove("open");
			}
		});

		// Teclado en la lista
		listaOpc.addEventListener("keydown", e => {
			const items = Array.from(listaOpc.querySelectorAll("li"));
			const idx   = items.indexOf(document.activeElement);
			if      (e.key === "ArrowDown")  { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.focus(); }
			else if (e.key === "ArrowUp")    { e.preventDefault(); idx > 0 ? items[idx - 1].focus() : (wrapper.classList.remove("open"), btnSelected.focus()); }
			else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.activeElement.click(); }
			else if (e.key === "Escape" || e.key === "Tab") { wrapper.classList.remove("open"); btnSelected.focus(); }
		});

		// Sincronizar con el select nativo
		selectEl.addEventListener("change", renderizar);
		selectEl.addEventListener("input",  renderizar);
		selectEl.addEventListener("blur",   renderizar);
		new MutationObserver(renderizar).observe(selectEl, {
			childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"]
		});
		renderizar();
	}

	// Cerrar custom selects al hacer click fuera
	document.addEventListener("click", e => {
		if (!e.target.closest("#calculadora .custom-select")) cerrarOtrosSelects();
	});

	// ─────────────────────────────────────────────────────────────────────────
	// EVENTOS DE LOS SELECTS DE LA CALCULADORA
	// ─────────────────────────────────────────────────────────────────────────

	// Vehículo
	DOM.inputs.vehiculo.addEventListener("change", e => {
		const nuevoVehiculo = e.target.value;
		if (estado.vehiculo === nuevoVehiculo) return;
		const estadoAnterior = { ...estado };
		estado.vehiculo = nuevoVehiculo;
		e.target.classList.add("select-con-valor");
		invalidarDependientes("vehiculo", estadoAnterior);

		// Cargar combustibles
		const selCombustible = DOM.inputs.combustible;
		selCombustible.innerHTML = '<option value="" disabled selected hidden>Opciones</option>';
		const combustibles = obtenerCombustiblesParaVehiculo(estado.vehiculo);
		combustibles.forEach(c => {
			const opt = document.createElement("option");
			opt.value = c.v; opt.textContent = c.t;
			selCombustible.appendChild(opt);
		});
		selCombustible.disabled = combustibles.length === 0;
		selCombustible.classList.remove("select-con-valor");
		invalidarDependientes("combustible");
		actualizarPanelPreaprobado();
	});

	// Combustible
	DOM.inputs.combustible.addEventListener("change", e => {
		const nuevoCombustible = e.target.value;
		if (estado.combustible === nuevoCombustible) return;
		const estadoAnterior = { ...estado };
		estado.combustible = nuevoCombustible;
		e.target.classList.add("select-con-valor");
		invalidarDependientes("combustible", estadoAnterior);

		const esNafta = estado.combustible === "nafta";
		const esMotoOCuatri =
			(estado.vehiculo === "moto"        && ["nafta", "electricoMoto"].includes(estado.combustible)) ||
			(estado.vehiculo === "cuatriciclo" && ["nafta", "electricoCuatri"].includes(estado.combustible));

		if (esMotoOCuatri) {
			DOM.inputs.condicion.innerHTML = '<option value="" disabled selected hidden>Opciones</option>';
			DOM.inputs.condicion.disabled  = true;
			if (esNafta) {
			mostrarModalNumerico("CILINDRADA", "cc", CILINDRADA_MINIMA_MOTO, null, val => { estado.cilindrada = val; cargarCondicion(); });
			} else {
				mostrarModalNumerico("POTENCIA", "w", POTENCIA_MINIMA_MOTO, CONFIG.LIMITES.MOTO.POTENCIA.ALTA, val => { estado.potencia = val; cargarCondicion(); });
			}
		} else {
			cargarCondicion();
		}
	});

	// Condición
	DOM.inputs.condicion.addEventListener("change", e => {
		const nuevaCondicion = e.target.value;
		if (estado.condicion === nuevaCondicion) return;
		const estadoAnterior = { ...estado };
		estado.condicion = nuevaCondicion;
		if (e.target.value) e.target.classList.add("select-con-valor");
		invalidarDependientes("condicion", estadoAnterior);
		cargarAnio();
	});

	DOM.inputs.condicion.addEventListener("focus", cargarCondicion);
	DOM.inputs.anio.addEventListener("focus",      cargarAnio);
	DOM.inputs.plazo.addEventListener("focus",     cargarPlazo);
	DOM.inputs.tasa.addEventListener("focus",      cargarTasa);

	// Año
	DOM.inputs.anio.addEventListener("change", e => {
		const nuevoAnio = parseInt(e.target.value, 10);
		if (estado.anio === nuevoAnio) return;
		const estadoAnterior = { ...estado };
		estado.anio = nuevoAnio;
		e.target.classList.add("select-con-valor");
		invalidarDependientes("anio", estadoAnterior);
		cargarPlazo();
	});

	// Plazo
	DOM.inputs.plazo.addEventListener("change", e => {
		const nuevoPlazo = parseInt(e.target.value, 10);
		if (estado.plazo === nuevoPlazo) return;
		const estadoAnterior = { ...estado };
		estado.plazo = nuevoPlazo;
		e.target.classList.add("select-con-valor");
		invalidarDependientes("plazo", estadoAnterior);
		cargarTasa();
	});

	// Tasa
	DOM.inputs.tasa.addEventListener("change", e => {
		const nuevaTasa = parseFloat(e.target.value);
		if (estado.tasa !== nuevaTasa) {
			estado.tasa = nuevaTasa;
			e.target.classList.add("select-con-valor");
			actualizarBotonCalcular();
			actualizarPanelPreaprobado();
		}
	});

	// Botón Calcular
	DOM.btnCalcular.addEventListener("click", mostrarResultado);

	// Ocultar resultado al hacer foco en cualquier campo
	Object.values(DOM.inputs).forEach(inp => {
		inp.addEventListener("focus", ocultarResultado);
	});

	// Ocultar resultado al hacer click fuera
	document.addEventListener("click", e => {
		const container = DOM.resultado.container;
		if (container && container.classList.contains("resultado-visible")) {
			if (!container.contains(e.target) && !DOM.btnCalcular.contains(e.target)) {
				ocultarResultado();
			}
		}
	});

	// ─────────────────────────────────────────────────────────────────────────
	// EVENTOS DEL MODAL PREAPROBADO
	// ─────────────────────────────────────────────────────────────────────────
	document.getElementById("cerrarModalPreaprobado").addEventListener("click", cerrarModalPreaprobado);
	document.getElementById("btnCancelarPreaprobado").addEventListener("click", cerrarModalPreaprobado);

	document.getElementById("datosPrestamoSi").addEventListener("change", () => {
		const seccion = document.getElementById("datosPrestamoSi").closest(".modal-preaprobado__section");
		if (seccion) seccion.classList.add("prestamo-datos-ok");
		actualizarBotonEnviarPreaprobado();
	});

	document.getElementById("datosPrestamoNo").addEventListener("change", () => {
		const seccion = document.getElementById("datosPrestamoNo").closest(".modal-preaprobado__section");
		if (seccion) seccion.classList.remove("prestamo-datos-ok");
		cerrarModalPreaprobado(true);

		// Notificación de corrección de datos
		const notif = document.createElement("div");
		notif.className   = "notif-datos-prestamo";
		notif.textContent = "Por favor corregí los datos del Préstamo";
		document.body.appendChild(notif);
		requestAnimationFrame(() => requestAnimationFrame(() => notif.classList.add("is-visible")));

		setTimeout(() => {
			notif.classList.remove("is-visible");
			const eliminar = () => notif.remove();
			notif.addEventListener("transitionend", eliminar, { once: true });
			setTimeout(eliminar, 600);

			if (estado.preaprobadoForm) delete estado.preaprobadoForm["radio:datosPrestamo"];
			const secCalc = document.getElementById("calculadora");
			if (secCalc) secCalc.scrollIntoView({ behavior: "smooth", block: "start" });
		}, 2800);
	});

	// Cerrar modal al click en overlay
	DOM.modales.preaprobado.addEventListener("click", e => {
		if (!e.target.closest(".modal-preaprobado__content")) cerrarModalPreaprobado();
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Referencias al formulario Preaprobado y sus controles de validación
	// ─────────────────────────────────────────────────────────────────────────
	const formPreaprobado = document.getElementById("formPreaprobado");
	const checkConsentimiento = document.getElementById("consentimientoDatos");
	const errorTerminos       = document.getElementById("errorTerminosModal");

	// Valida el checkbox de consentimiento
	function validarConsentimiento() {
		if (!checkConsentimiento) return false;
		const aceptado = checkConsentimiento.checked;
		const msg = aceptado ? "" : "Debes aceptar el tratamiento de datos para continuar.";
		checkConsentimiento.setCustomValidity(msg);
		if (errorTerminos) errorTerminos.classList.toggle("visible", !aceptado);
		return aceptado;
	}

	let _refFormPreaprobado; // referencia temporal para inicializar file inputs

	// ─────────────────────────────────────────────────────────────────────────
	// Habilita/deshabilita el botón Enviar del modal según campos obligatorios
	// ─────────────────────────────────────────────────────────────────────────
	function actualizarBotonEnviarPreaprobado() {
		const btnEnviar = document.getElementById("btnEnviarPreaprobado");
		if (!btnEnviar) return;

		const dniFrente        = document.getElementById("dniTitularFrente");
		const dniDorso         = document.getElementById("dniTitularDorso");
		const tituloFrente     = document.getElementById("tituloFrente");
		const telCliente       = document.getElementById("telefonoCliente");
		const mailCliente      = document.getElementById("mailCliente");
		const consentimiento   = document.getElementById("consentimientoDatos");
		const solicitante      = document.getElementById("tipoSolicitante");
		const telContacto      = document.getElementById("telefonoContacto");

		const listo = !!(
			document.querySelector('input[name="datosPrestamo"]:checked')?.value === "si" &&
			solicitante?.value.trim().length > 0 &&
			telContacto?.value.trim().length >= 10 &&
			dniFrente?.files?.length    > 0 &&
			dniDorso?.files?.length     > 0 &&
			tituloFrente?.files?.length > 0 &&
			telCliente?.value.trim().length >= 10 &&
			mailCliente?.value.trim() &&
			/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailCliente?.value.trim()) &&
			consentimiento?.checked
		);

		btnEnviar.disabled = !listo;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Inicializa el toggle de sección extra (cónyuge / cotitular)
	// @param {string} grupo - "conyuge" o "cotitular"
	// @param {string} nombreRadio - nombre del radio group
	// ─────────────────────────────────────────────────────────────────────────
	function inicializarOpcionExtra(grupo, nombreRadio) {
		const radios     = document.querySelectorAll(`input[name="${nombreRadio}"]`);
		const secExtras  = document.querySelectorAll(`[data-extra-group="${grupo}"]`);

		const actualizar = () => {
			const marcadoSi = document.querySelector(`input[name="${nombreRadio}"]:checked`)?.value === "si";
			secExtras.forEach(sec => {
				sec.classList.toggle("is-hidden", !marcadoSi);
				sec.querySelectorAll("input").forEach(inp => {
					inp.disabled = !marcadoSi;
					if (!marcadoSi) inp.value = "";
					if (inp._syncPreaprobadoFileUi) inp._syncPreaprobadoFileUi();
					actualizarEstadoVisual(inp);
				});
			});
		};
		radios.forEach(r => r.addEventListener("change", actualizar));
		actualizar();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Inicializar inputs file con UI custom (reemplaza el nativo)
	// ─────────────────────────────────────────────────────────────────────────
	const FILE_NAME_MAP = {
		dniTitularFrente: "DNI_Titular_Frente",
		dniTitularDorso:  "DNI_Titular_Dorso",
		tituloFrente:     "Titulo_Frente",
		tituloDorso:      "Titulo_Dorso",
		conyugeFrente:    "DNI_Conyuge_Frente",
		conyugeDorso:     "DNI_Conyuge_Dorso",
		cotitularFrente:  "DNI_Cotitular_Frente",
		cotitularDorso:   "DNI_Cotitular_Dorso",
	};

	if (formPreaprobado) {
		(_refFormPreaprobado = formPreaprobado) &&
		_refFormPreaprobado.querySelectorAll('input[type="file"]').forEach(inputFile => {
			if (inputFile.dataset.preaprobadoFileReady === "true") return;
			inputFile.dataset.preaprobadoFileReady = "true";
			inputFile.classList.add("modal-preaprobado__file-native");

			const pickerDiv  = document.createElement("div");
			pickerDiv.className = "modal-preaprobado__file-picker";

			const btnImagen  = document.createElement("span");
			btnImagen.className  = "modal-preaprobado__file-button";
			btnImagen.textContent = "Imagen";

			const spanNombre = document.createElement("span");
			spanNombre.className  = "modal-preaprobado__file-name";
			spanNombre.textContent = "";

			inputFile.parentNode.insertBefore(pickerDiv, inputFile);
			pickerDiv.appendChild(btnImagen);
			pickerDiv.appendChild(spanNombre);
			pickerDiv.appendChild(inputFile);

			const sincronizarUI = () => {
				const tieneArchivo = inputFile.files && inputFile.files.length > 0;
				if (tieneArchivo) {
					const archivo = inputFile.files[0];
					const ext = archivo.name.includes(".") ? archivo.name.split(".").pop().toLowerCase() : "";
					const base = FILE_NAME_MAP[inputFile.id] || inputFile.id;
					inputFile._nombreNormalizado = ext ? `${base}.${ext}` : base;
				} else {
					inputFile._nombreNormalizado = null;
				}
				spanNombre.textContent = tieneArchivo ? inputFile._nombreNormalizado : "";
				spanNombre.classList.toggle("is-visible",  tieneArchivo);
				btnImagen.classList.toggle("is-hidden",    tieneArchivo);
				pickerDiv.style.justifyContent = tieneArchivo ? "flex-start" : "center";
				pickerDiv.classList.toggle("is-disabled", inputFile.disabled);
			};

			inputFile.addEventListener("change", sincronizarUI);
			inputFile._syncPreaprobadoFileUi = sincronizarUI;
			sincronizarUI();
		});

		inicializarValidacionVisual(formPreaprobado);
		configurarValidacionEmail(formPreaprobado.querySelector("#mailContacto"));
		configurarValidacionEmail(formPreaprobado.querySelector("#mailCliente"));
		configurarTelefonoSoloNumeros(formPreaprobado.querySelector("#telefonoContacto"));
		configurarTelefonoSoloNumeros(formPreaprobado.querySelector("#telefonoCliente"));

		// Sincronizar selects del modal con la calculadora al cambiar año/plazo/tasa
		DOM.preaprobadoPrestamo?.anio?.control?.addEventListener("change",  () => { actualizarPanelPreaprobado(false); sincronizarCalculadoraDesdeModal(); });
		DOM.preaprobadoPrestamo?.plazo?.control?.addEventListener("change", () => { actualizarPanelPreaprobado(false); sincronizarCalculadoraDesdeModal(); });
		DOM.preaprobadoPrestamo?.tasa?.control?.addEventListener("change",  () => { actualizarPanelPreaprobado(false); sincronizarCalculadoraDesdeModal(); });

		formPreaprobado.addEventListener("input",  guardarEstadoFormPreaprobado);
		formPreaprobado.addEventListener("change", guardarEstadoFormPreaprobado);

		if (checkConsentimiento) {
			checkConsentimiento.addEventListener("change",  validarConsentimiento);
			checkConsentimiento.addEventListener("change",  actualizarBotonEnviarPreaprobado);
			checkConsentimiento.addEventListener("invalid", () => validarConsentimiento());
		}

		formPreaprobado.addEventListener("input",  actualizarBotonEnviarPreaprobado);
		formPreaprobado.addEventListener("change", actualizarBotonEnviarPreaprobado);
		actualizarBotonEnviarPreaprobado();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Envío por WhatsApp del formulario Preaprobado
	// ─────────────────────────────────────────────────────────────────────────
	document.getElementById("btnEnviarPreaprobado")?.addEventListener("click", () => {
		const formEl = document.getElementById("formPreaprobado");
		if (!formEl) return;

		const getVal   = id => document.getElementById(id)?.value?.trim() || "";
		const getNombre = id => {
			const el = document.getElementById(id);
			if (!el?.files?.length) return "-";
			return el._nombreNormalizado || el.files[0].name;
		};

		const tieneConyuge   = document.querySelector('input[name="estadoConyuge"]:checked')?.value === "si";
		const monto          = getVal("preaprobadoMonto")  || "No indicado";
		const anio           = getVal("preaprobadoAnio")   || "No indicado";
		const plazo          = getVal("preaprobadoPlazo")  || "No indicado";
		const tasa           = getVal("preaprobadoTasa")   || "No indicado";
		const cuota          = getVal("preaprobadoCuota")  || "No indicado";

		let msg = "";
		msg += "🔵 *TITULAR*\n";
		msg += `DNI Frente: ${getNombre("dniTitularFrente")}\n`;
		msg += `DNI Dorso: ${getNombre("dniTitularDorso")}\n\n`;
		msg += "🔵 *TÍTULO AUTOMOTOR*\n";
		msg += `Frente (o CAT): ${getNombre("tituloFrente")}\n`;
		msg += `Dorso: ${getNombre("tituloDorso")}\n\n`;
		msg += "🔵 *CONTACTO CLIENTE*\n";
		msg += `telefonoContacto:\n${getVal("telefonoContacto") || "-"}\n`;
		msg += `mailContacto:\n${getVal("mailContacto") || "-"}\n\n`;

		if (tieneConyuge) {
			msg += "🔵 *CASADO/CONCUBINO*\n";
			msg += `DNI Frente: ${getNombre("conyugeFrente")}\n`;
			msg += `DNI Dorso: ${getNombre("conyugeDorso")}\n\n`;
		}

		msg += "🔵 *NOTA:* Se enviarán por WhatsApp única y exclusivamente los archivos listados arriba. Ningún otro archivo.\n\n";
		msg += "🔵 *DATOS PRÉSTAMO*\n";
		msg += `Monto: ${monto}\n`;
		msg += `Año: ${anio}\n`;
		msg += `Plazo: ${plazo}\n`;
		msg += `Tasa: ${tasa}\n`;
		msg += `Cuota: ${cuota}\n\n`;
		msg += "✅ Acepto que procesen mis datos personales\n\n";
		msg += "---\n";
		msg += `*Solicitante:* ${getVal("tipoSolicitante") || "-"}\n`;
		msg += `*Tel. Contacto:* ${getVal("telefonoContacto") || "-"}\n`;
		const mailCtc = getVal("mailContacto");
		if (mailCtc) msg += `*Mail Contacto:* ${mailCtc}\n`;

		const url = "https://wa.me/5493446612371?text=" + encodeURIComponent(msg);
		const _a = document.createElement("a");
		_a.href = url;
		_a.target = "_blank";
		_a.rel = "noopener noreferrer";
		document.body.appendChild(_a);
		_a.click();
		document.body.removeChild(_a);
	});

	// Inicializar secciones extra de cónyuge y cotitular
	inicializarOpcionExtra("conyuge",    "estadoConyuge");
	inicializarOpcionExtra("cotitular",  "estadoCotitular");

	// Links Preaprobado (header y footer)
	const linkPreaprobadoHeader = document.getElementById("linkDatosPreaprobadoHeader");
	if (linkPreaprobadoHeader) {
		linkPreaprobadoHeader.addEventListener("click", e => { e.preventDefault(); abrirModalPreaprobado(); });
	}

	const linkPreaprobadoFooter = document.getElementById("linkDatosPreaprobadoFooter");
	if (linkPreaprobadoFooter) {
		linkPreaprobadoFooter.addEventListener("click", e => { e.preventDefault(); abrirModalPreaprobado(); });
	}

	// ─────────────────────────────────────────────────────────────────────────
	// AJUSTE DINÁMICO DE FUENTE: frase UVA/0% en el panel resultado
	// ─────────────────────────────────────────────────────────────────────────
	let _cacheFrase = { ancho: -1 };
	function ajustarFuenteFrase() {
		const fraseEl = DOM.resultado.fraseInfo;
		if (!fraseEl) return;

		const lineas = Array.from(fraseEl.querySelectorAll(".frase-line"));
		if (!lineas.length) return;

		const refLabel   = document.querySelector("#calculadora label") || document.querySelector("label");
		const fzBase     = refLabel ? parseFloat(window.getComputedStyle(refLabel).fontSize || "0") : 15.36;
		const lineasData = lineas.filter(l => !l.classList.contains("frase-line--title"));
		const lineasRef  = lineasData.length ? lineasData : lineas;

		const estilos    = window.getComputedStyle(fraseEl);
		const padding    = parseFloat(estilos.paddingLeft || "0") + parseFloat(estilos.paddingRight || "0");
		const anchoDisp  = (fraseEl.parentElement?.clientWidth || fraseEl.clientWidth) - padding;
		if (anchoDisp <= 0) return;
		if (Math.abs(anchoDisp - _cacheFrase.ancho) < 1) return;
		_cacheFrase.ancho = anchoDisp;

		const medirAncho = (el, fz) => {
			const clon = el.cloneNode(true);
			Object.assign(clon.style, {
				position: "absolute", visibility: "hidden", pointerEvents: "none",
				width: "auto", maxWidth: "none", display: "inline-block",
				whiteSpace: "nowrap", fontSize: `${fz}px`, lineHeight: "1.2",
				letterSpacing: "-0.01em", padding: "0", margin: "0"
			});
			document.body.appendChild(clon);
			const w = clon.getBoundingClientRect().width;
			clon.remove();
			return w;
		};

		let min = 7, max = fzBase, mejor = min;
		while (max - min > 0.1) {
			const mid = (min + max) / 2;
			if (Math.max(...lineasRef.map(l => medirAncho(l, mid))) <= anchoDisp) {
				mejor = mid; min = mid;
			} else { max = mid; }
		}

		fraseEl.style.setProperty("--frase-info-font", `${mejor.toFixed(2)}px`);
		const anchoReal = Math.max(...lineasRef.map(l => medirAncho(l, mejor)));
		fraseEl.style.width = `${Math.min(anchoDisp + padding, anchoReal + padding).toFixed(2)}px`;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// AJUSTE DINÁMICO DE FUENTE: total cuota en el panel resultado
	// ─────────────────────────────────────────────────────────────────────────
	let _cacheResultado = { ancho: -1 };
	function ajustarFuenteResultado() {
		const elCuotaTotal = DOM.resultado.container?.querySelector(".resultado-cuota-total");
		const contenedor   = DOM.resultado.container;
		if (!elCuotaTotal || !contenedor || !contenedor.classList.contains("resultado-visible")) return;

		const refTitulo = document.querySelector("#calculadora .panel-encabezado__titulo");
		const fzBase    = refTitulo ? parseFloat(window.getComputedStyle(refTitulo).fontSize || "0") : 28;
		const estilos   = window.getComputedStyle(contenedor);
		const padding   = parseFloat(estilos.paddingLeft || "0") + parseFloat(estilos.paddingRight || "0");
		const anchoDisp = contenedor.clientWidth - padding;
		if (anchoDisp <= 0) return;
		if (Math.abs(anchoDisp - _cacheResultado.ancho) < 1) return;
		_cacheResultado.ancho = anchoDisp;

		const medirAncho = (fz) => {
			const clon = elCuotaTotal.cloneNode(true);
			Object.assign(clon.style, {
				position: "absolute", visibility: "hidden", pointerEvents: "none",
				width: "auto", maxWidth: "none", whiteSpace: "nowrap",
				fontSize: `${fz}px`, margin: "0"
			});
			document.body.appendChild(clon);
			const w = clon.getBoundingClientRect().width;
			clon.remove();
			return w;
		};

		let min = 8, max = fzBase, mejor = min;
		while (max - min > 0.1) {
			const mid = (min + max) / 2;
			if (medirAncho(mid) <= anchoDisp) { mejor = mid; min = mid; }
			else { max = mid; }
		}
		elCuotaTotal.style.fontSize = `${mejor.toFixed(2)}px`;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// POSICIONAMIENTO DEL PANEL DE RESULTADO (flotante entre calculadora y servicios)
	// ─────────────────────────────────────────────────────────────────────────
	function posicionarResultado() {
		const contenedor = DOM.resultado.container;
		if (!contenedor || !contenedor.classList.contains("resultado-visible")) return;

		const panelCalc    = document.querySelector("#calculadora .calculadora-container");
		if (!panelCalc) return;

		const rectCalc     = panelCalc.getBoundingClientRect();
		const panelServ    = document.querySelector("#servicios .section-panel");
		const rectServ     = panelServ ? panelServ.getBoundingClientRect() : rectCalc;

		const leftInicio   = (rectCalc.left + rectServ.left) / 2;
		const anchoTotal   = (rectCalc.left + rectCalc.width + rectServ.left + rectServ.width) / 2 - leftInicio;
		const rectBtn      = DOM.btnCalcular.getBoundingClientRect();

		contenedor.style.top       = `${rectBtn.top + rectBtn.height / 2}px`;
		contenedor.style.transform = "translateY(-50%)";
		contenedor.style.left      = `${leftInicio}px`;
		contenedor.style.width     = `${anchoTotal}px`;
		contenedor.style.height    = "auto";
		contenedor.style.maxHeight = `${rectCalc.height - 40}px`;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Navegación suave: si el modal está abierto, cerrarlo antes de navegar
	// ─────────────────────────────────────────────────────────────────────────
	document.querySelectorAll('header nav a[href^="#"]:not([data-modal-link="true"])').forEach(enlace => {
		enlace.addEventListener("click", e => {
			const href      = enlace.getAttribute("href");
			const destino   = href ? document.querySelector(href) : null;

			if (DOM.modales.preaprobado.getAttribute("aria-hidden") === "false" && destino) {
				e.preventDefault();
				(function resetearFormPreaprobado() {
					if (!formPreaprobado) return;
					formPreaprobado.reset();
					formPreaprobado.querySelectorAll("input, select, textarea").forEach(el => {
						if (el.type === "hidden") return;
						if (el.type === "radio" || el.type === "checkbox") el.checked = el.defaultChecked;
						else if (el.type === "file") { el.value = ""; if (el._syncPreaprobadoFileUi) el._syncPreaprobadoFileUi(); }
						else el.value = el.defaultValue || "";
						el.setCustomValidity("");
					});
					resetearClasesValidacion(formPreaprobado);
					sincronizarRadiosDinamicos();
					estado.preaprobadoForm = {};
					if (errorTerminos) errorTerminos.classList.remove("visible");
					const secPrestamo = formPreaprobado.querySelector("#datosPrestamoSi")?.closest(".modal-preaprobado__section");
					if (secPrestamo) secPrestamo.classList.remove("prestamo-datos-ok");
				})();
				cerrarModalPreaprobado(false);
				history.pushState(null, "", href);
				destino.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		});
	});

	// Cerrar modal con Escape
	document.addEventListener("keydown", e => {
		if (e.key === "Escape" && DOM.modales.preaprobado.getAttribute("aria-hidden") === "false") {
			cerrarModalPreaprobado();
		}
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Inicializar textos de límites UVA en el panel de información
	// ─────────────────────────────────────────────────────────────────────────
	if (DOM.resultado.infoAutos.anio)       DOM.resultado.infoAutos.anio.textContent       = LIMITES_UVA.AUTOS.INICIO;
	if (DOM.resultado.infoAutos.meses)      DOM.resultado.infoAutos.meses.textContent      = LIMITES_UVA.AUTOS.MESES_MAX;
	if (DOM.resultado.infoMotos.cilindrada) DOM.resultado.infoMotos.cilindrada.textContent = CONFIG.LIMITES.MOTO.CILINDRADA.UVA;
	if (DOM.resultado.infoMotos.anio)       DOM.resultado.infoMotos.anio.textContent       = LIMITES_UVA.MOTOS.INICIO;
	if (DOM.resultado.infoMotos.meses)      DOM.resultado.infoMotos.meses.textContent      = LIMITES_UVA.MOTOS.MESES_MAX;

	// Mostrar/ocultar la frase de info según tasas habilitadas
	(function inicializarFraseInfo() {
		const fraseEl = DOM.resultado.fraseInfo;
		if (!fraseEl) return;
		fraseEl.querySelectorAll("[data-tasa-grupo]").forEach(span => {
			const grupo   = span.dataset.tasaGrupo;
			const visible = (grupo === "uva" && TASA_UVA_HABILITADA) || (grupo === "cero" && TASA_CERO_HABILITADA);
			span.style.display = visible ? "" : "none";
		});
		fraseEl.style.display = (TASA_UVA_HABILITADA || TASA_CERO_HABILITADA) ? "" : "none";
	})();

	// ─────────────────────────────────────────────────────────────────────────
	// RESIZE OBSERVERS Y EVENT LISTENERS DE REDIMENSIONADO
	// ─────────────────────────────────────────────────────────────────────────
	actualizarAlturaHeader();

	if (window.ResizeObserver) {
		const headerEl = document.querySelector("header");
		if (headerEl) new ResizeObserver(debounce(actualizarAlturaHeader, 100)).observe(headerEl);
	}

	if (window.ResizeObserver && DOM.resultado.fraseInfo) {
		new ResizeObserver(debounce(ajustarFuenteFrase, 150)).observe(DOM.resultado.fraseInfo);
	}

	window.addEventListener("load", actualizarAlturaHeader);

	// ─────────────────────────────────────────────────────────────────────────
	// AJUSTE DINÁMICO DE FUENTE: placeholder del input Monto
	// ─────────────────────────────────────────────────────────────────────────
	let _cacheMontoAncho = -1;
	function ajustarFuenteMonto() {
		const input = DOM.inputs.monto;
		if (!input) return;

		const estilos   = window.getComputedStyle(input);
		const anchoDisp = input.clientWidth
			- parseFloat(estilos.paddingLeft  || 0)
			- parseFloat(estilos.paddingRight || 0);
		if (anchoDisp <= 0) return;
		if (Math.abs(anchoDisp - _cacheMontoAncho) < 1) return;
		_cacheMontoAncho = anchoDisp;

		const texto  = input.placeholder;
		if (!texto) return;

		const fzBase = parseFloat(estilos.fontSize) || 16;

		const medirAncho = (fz) => {
			const span = document.createElement("span");
			Object.assign(span.style, {
				position: "absolute", visibility: "hidden", pointerEvents: "none",
				whiteSpace: "nowrap", fontSize: `${fz}px`,
				fontFamily: estilos.fontFamily, fontWeight: estilos.fontWeight,
				letterSpacing: estilos.letterSpacing, padding: "0", margin: "0"
			});
			span.textContent = texto;
			document.body.appendChild(span);
			const w = span.getBoundingClientRect().width;
			span.remove();
			return w;
		};

		if (medirAncho(fzBase) <= anchoDisp) {
			input.style.removeProperty("font-size");
			return;
		}

		let min = 9, max = fzBase, mejor = min;
		while (max - min > 0.25) {
			const mid = (min + max) / 2;
			if (medirAncho(mid) <= anchoDisp) { mejor = mid; min = mid; }
			else { max = mid; }
		}
		input.style.fontSize = `${mejor.toFixed(2)}px`;
	}

	// Un único listener debounced reemplaza los 9 individuales
	const _onResize = debounce(() => {
		actualizarAlturaHeader();
		ajustarFuenteMonto();
		ajustarFuenteFrase();
		ajustarFuenteResultado();
		posicionarResultado();
		calcularOffsetTopModal();
		actualizarAnchoModal();
		eliminarMaxHeightModal();
		actualizarOverlayModal();
		ajustarColumnasPreaprobado();
	}, 150);

	window.addEventListener("resize", _onResize, { passive: true });

	// Reposicionar resultado en scroll (throttle via rAF)
	let rafScrollId = null;
	window.addEventListener("scroll", () => {
		if (rafScrollId) cancelAnimationFrame(rafScrollId);
		rafScrollId = requestAnimationFrame(() => { posicionarResultado(); rafScrollId = null; });
	}, { passive: true });

	// Ejecución inicial de ajustes de fuente y posición
	ajustarFuenteMonto();
	ajustarFuenteFrase();
	ajustarFuenteResultado();
	posicionarResultado();

	// ─────────────────────────────────────────────────────────────────────────
	// FORMULARIO DE CONTACTO
	// ─────────────────────────────────────────────────────────────────────────
	if (DOM.contacto.form) {
		inicializarValidacionVisual(DOM.contacto.form);

		const inputEmail    = DOM.contacto.form.querySelector("#email");
		const inputTelefono = DOM.contacto.form.querySelector("#telefono");
		configurarValidacionEmail(inputEmail);
		configurarTelefonoSoloNumeros(inputTelefono);

		const textoExitoOriginal = DOM.contacto.exito
			? DOM.contacto.exito.textContent.trim()
			: "Mensaje enviado exitosamente";

		// Muestra mensaje de estado del formulario de contacto
		const mostrarEstadoContacto = (mensaje, esError = false, duracion = 5000) => {
			if (!DOM.contacto.exito) return;
			DOM.contacto.exito.textContent = mensaje;
			DOM.contacto.exito.classList.toggle("is-error", esError);
			DOM.contacto.exito.classList.add("visible");
			window.clearTimeout(window.contactoEstadoTimer);
			window.contactoEstadoTimer = window.setTimeout(() => {
				DOM.contacto.exito.classList.remove("visible", "is-error");
				DOM.contacto.exito.textContent = textoExitoOriginal;
			}, duracion);
		};

		DOM.contacto.form.addEventListener("submit", async e => {
			e.preventDefault();
			if (!DOM.contacto.form.checkValidity()) { DOM.contacto.form.reportValidity(); return; }

			const btnEnviar   = DOM.contacto.form.querySelector('button[type="submit"]');
			const textoOrig   = btnEnviar.textContent;
			const urlAccion   = DOM.contacto.form.getAttribute("action") || "https://formsubmit.co/ajax/contacto@tuprendario.com";
			const datos       = new FormData(DOM.contacto.form);

			btnEnviar.textContent = "Enviando...";
			btnEnviar.disabled    = true;

			try {
				const respuesta = await fetch(urlAccion, { method: "POST", body: datos });

				// Parsea la respuesta de FormSubmit (puede ser JSON o HTML)
				const parsearRespuesta = async (resp, url) => {
					const textoResp = await resp.text();
					let json = null;
					try { json = textoResp ? JSON.parse(textoResp) : null; } catch { json = null; }

					if (json && typeof json === "object") {
						if (!Object.prototype.hasOwnProperty.call(json, "success")) json.success = resp.ok;
						return json;
					}

					// Limpiar HTML para extraer texto legible
					const textoLimpio = textoResp
						.replace(/<style[\s\S]*?<\/style>/gi, " ")
						.replace(/<script[\s\S]*?<\/script>/gi, " ")
						.replace(/<[^>]+>/g, " ")
						.replace(/\s+/g, " ").trim();

					const esFormSubmit = url.includes("formsubmit.co");
					let msgError = esFormSubmit
						? `El servicio de formularios respondió ${resp.status}. Si es el primer envío, confirmá la activación desde el mail que llega a la casilla destino.`
						: `El servicio configurado en ${url} respondió ${resp.status}. Revisá la URL configurada en el formulario.`;

					if (resp.status === 404) {
						msgError = esFormSubmit
							? "No se pudo contactar el servicio de formularios. Verificá la conexión a internet e intentá nuevamente."
							: `No se encontró ${url} en el servidor. Verificá que el archivo exista en el hosting y que la ruta sea correcta.`;
					} else if (esFormSubmit && /confirm|activate|activation|verify|verification/.test(textoLimpio.toLowerCase())) {
						msgError = "FormSubmit pidió confirmar la casilla destino. Abrí el correo de activación en la cuenta receptora y luego reenviá el formulario.";
					} else if (textoLimpio !== "") {
						msgError += ` Detalle: ${textoLimpio.slice(0, 180)}${textoLimpio.length > 180 ? "..." : ""}`;
					}

					return { success: false, message: msgError };
				};

				const resultado = await parsearRespuesta(respuesta, urlAccion);
				const exitoso   = resultado && typeof resultado === "object" &&
					Object.prototype.hasOwnProperty.call(resultado, "success") &&
					(resultado.success === true || resultado.success === "true" || resultado.success === 1 || resultado.success === "1");

				if (!respuesta.ok || !exitoso) throw new Error(resultado.message || "No fue posible enviar el mensaje.");

				mostrarEstadoContacto(resultado.message || "Mensaje enviado correctamente. Si es el primer envío, confirmá el correo de activación que envía FormSubmit.");
				DOM.contacto.form.reset();
				if (inputEmail) inputEmail.setCustomValidity("");
				resetearClasesValidacion(DOM.contacto.form);
				if (DOM.contacto.contador) DOM.contacto.contador.textContent = "0";

			} catch (err) {
				mostrarEstadoContacto(err.message || "No fue posible enviar el mensaje.", true, 6500);
			} finally {
				btnEnviar.textContent = textoOrig;
				btnEnviar.disabled    = false;
			}
		});

		// Contador de caracteres del textarea mensaje
		const textareaMensaje = document.getElementById("mensaje");
		if (textareaMensaje) {
			textareaMensaje.addEventListener("input", function () {
				DOM.contacto.contador.textContent = this.value.length;
			});
			const placeholderOriginal = textareaMensaje.getAttribute("placeholder") || "";
			textareaMensaje.addEventListener("focus", function () { textareaMensaje.setAttribute("placeholder", ""); });
			textareaMensaje.addEventListener("blur",  function () {
				if (!textareaMensaje.value || textareaMensaje.value.trim() === "") {
					textareaMensaje.setAttribute("placeholder", placeholderOriginal);
				}
			});
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// SCROLL SUAVE PARA TODOS LOS LINKS ANCLA (excepto los del modal)
	// ─────────────────────────────────────────────────────────────────────────
	document.querySelectorAll('a[href^="#"]').forEach(enlace => {
		if (enlace.dataset.modalLink === "true") return;
		enlace.addEventListener("click", function (e) {
			e.preventDefault();
			const destino = document.querySelector(this.getAttribute("href"));
			if (!destino) return;

			const header       = document.querySelector("header");
			const alturaHeader = header ? header.offsetHeight + 10 : 0;
			const scrollMargin = window.getComputedStyle(destino).scrollMarginTop;
			const margen       = scrollMargin ? parseFloat(scrollMargin) : NaN;
			const offset       = isNaN(margen) ? alturaHeader : margen;
			const posY         = destino.getBoundingClientRect().top + window.pageYOffset - offset;
			window.scrollTo({ top: posY, behavior: "smooth" });
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// INTERSECTION OBSERVER: animación fadeIn al entrar en viewport
	// ─────────────────────────────────────────────────────────────────────────
	const observadorSecciones = new IntersectionObserver(
		entries => {
			entries.forEach(entry => {
				if (entry.isIntersecting) entry.target.classList.add("animate-fadeIn");
			});
		},
		{ threshold: 0.1 }
	);
	document.querySelectorAll("section").forEach(sec => observadorSecciones.observe(sec));

}); // fin DOMContentLoaded
