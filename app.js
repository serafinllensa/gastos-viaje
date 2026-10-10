/* app.js — lógica y datos de "Gastos del viaje" (v2). Expone window.Gastos. Sin dependencias. */
(function (global) {
  "use strict";

  var CLAVE = "gastos-viaje-v2";
  var CLAVE_V1 = "gastos-viaje-v1"; // se lee una sola vez para migrar y se deja intacta como respaldo
  var VERSION = 2;
  var CATEGORIAS = ["Comida", "Súper", "Nafta", "Alojamiento", "Salidas", "Otros"];
  var MSG_MONTO = "Escribí el monto en pesos enteros, ej: 30.000";
  var estado = vacio();

  function vacio() { return { personas: [], gastos: [], pagos: [], sigId: 1 }; }
  function copiar(x) { return JSON.parse(JSON.stringify(x)); }

  // ---------- almacenamiento ----------
  function storage() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  function leerClave(ls, clave) {
    try {
      var crudo = ls.getItem(clave);
      return crudo ? validarDatos(JSON.parse(crudo)) : null;
    } catch (e) { return null; }
  }

  function cargar() {
    estado = vacio();
    var ls = storage();
    if (ls) {
      var hayV2 = false;
      try { hayV2 = !!ls.getItem(CLAVE); } catch (e) { /* nada */ }
      var d = hayV2 ? leerClave(ls, CLAVE) : leerClave(ls, CLAVE_V1);
      if (d) {
        estado = { personas: d.personas, gastos: d.gastos, pagos: d.pagos, sigId: 1 };
        estado.sigId = calcularSigId();
        if (!hayV2) guardar(); // migración v1 -> v2
      }
    }
    pedirPersistencia();
    return getEstado();
  }

  function pedirPersistencia() {
    try {
      var nav = global.navigator;
      if (nav && nav.storage && typeof nav.storage.persist === "function") {
        var p = nav.storage.persist();
        if (p && typeof p.catch === "function") p.catch(function () {});
      }
    } catch (e) { /* no disponible */ }
  }

  function guardar() {
    var ls = storage();
    if (!ls) return;
    try {
      ls.setItem(CLAVE, JSON.stringify({ version: VERSION, personas: estado.personas, gastos: estado.gastos, pagos: estado.pagos, sigId: estado.sigId }));
    } catch (e) { /* sin espacio o bloqueado */ }
  }

  function todosLosIds() {
    return estado.personas.concat(estado.gastos, estado.pagos).map(function (x) { return x.id; });
  }

  function calcularSigId() {
    var max = 0;
    todosLosIds().forEach(function (id) {
      var n = parseInt(String(id).replace(/\D/g, ""), 10);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function nuevoId(prefijo) {
    var usados = todosLosIds(), id;
    do { id = prefijo + (estado.sigId++); } while (usados.indexOf(id) !== -1);
    return id;
  }

  function getEstado() {
    return { personas: copiar(estado.personas), gastos: copiar(estado.gastos), pagos: copiar(estado.pagos) };
  }

  // ---------- validaciones ----------
  // Lee un monto en pesos enteros. Acepta un número entero o un texto con solo dígitos (30000)
  // o con puntos de miles en grupos de a tres (30.000, 1.234.567); ignora "$" y espacios.
  function parsearMonto(valor) {
    var n;
    if (typeof valor === "number") {
      if (isNaN(valor)) throw new Error(MSG_MONTO);
      n = valor;
      if (isFinite(n) && n > 0 && Math.floor(n) !== n) throw new Error("El monto va en pesos enteros, sin centavos.");
    } else if (typeof valor === "string") {
      var t = valor.replace(/\s+/g, "").replace(/^\$/, "");
      if (/^-[\d.,]+$/.test(t)) throw new Error("El monto tiene que ser mayor a cero.");
      if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(t)) throw new Error(MSG_MONTO);
      n = Number(t.replace(/\./g, ""));
    } else {
      throw new Error(MSG_MONTO);
    }
    if (!isFinite(n) || n <= 0) throw new Error("El monto tiene que ser mayor a cero.");
    if (n > 1e12) throw new Error("El monto es demasiado grande.");
    return n;
  }

  function limpiarNombre(nombre) {
    var n = typeof nombre === "string" ? nombre.trim().replace(/\s+/g, " ") : "";
    if (!n) throw new Error("Escribí un nombre.");
    if (n.length > 40) throw new Error("El nombre es muy largo (máximo 40 letras).");
    return n;
  }

  function validarNombre(nombre, idExcluir) {
    var n = limpiarNombre(nombre);
    var repetido = estado.personas.some(function (p) {
      return p.id !== idExcluir && p.nombre.toLowerCase() === n.toLowerCase();
    });
    if (repetido) throw new Error("Ya hay alguien que se llama " + n + ".");
    return n;
  }

  // existe(id) dice si la persona existe; así sirve para el estado actual y para un archivo importado.
  function validarGasto(d, existe) {
    var descripcion = typeof d.descripcion === "string" ? d.descripcion.trim() : "";
    if (!descripcion) throw new Error("Poné una descripción para el gasto.");
    if (descripcion.length > 80) throw new Error("La descripción es muy larga (máximo 80 letras).");
    var monto = parsearMonto(d.monto);
    if (CATEGORIAS.indexOf(d.categoria) === -1) throw new Error("Elegí una categoría.");
    if (!d.pagoPor) throw new Error("Elegí quién pagó.");
    if (!existe(d.pagoPor)) throw new Error("La persona que pagó no existe.");
    if (!Array.isArray(d.entre) || d.entre.length === 0) throw new Error("Elegí al menos una persona para dividir el gasto.");
    var entre = [];
    d.entre.forEach(function (id) {
      if (!existe(id)) throw new Error("Una de las personas elegidas para dividir no existe.");
      if (entre.indexOf(id) === -1) entre.push(id);
    });
    return { descripcion: descripcion, monto: monto, categoria: d.categoria, pagoPor: d.pagoPor, entre: entre };
  }

  // Valida un viaje completo (de un archivo o del almacenamiento) y devuelve una copia limpia. Tira Error si algo está mal.
  function validarDatos(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("no tiene el formato de un viaje");
    if (d.app !== undefined && d.app !== "gastos-viaje") throw new Error("no es un viaje de esta app");
    if (d.version !== undefined && !(d.version === 1 || d.version === 2)) throw new Error("es de una versión que esta app no conoce");
    if (!Array.isArray(d.personas) || !Array.isArray(d.gastos)) throw new Error("le faltan las personas o los gastos");
    if (d.pagos !== undefined && !Array.isArray(d.pagos)) throw new Error("los pagos no tienen el formato correcto");
    var ids = {}, nombres = {}, personas = [], gastos = [], pagos = [];
    function idNuevo(x, que) {
      if (!x || typeof x !== "object") throw new Error("hay " + que + " con formato incorrecto");
      if (typeof x.id !== "string" || !x.id) throw new Error("hay " + que + " sin id");
      if (ids[x.id]) throw new Error("el id " + x.id + " está repetido");
      ids[x.id] = que;
      return x.id;
    }
    d.personas.forEach(function (p) {
      var id = idNuevo(p, "una persona");
      var n = limpiarNombre(p.nombre);
      if (nombres[n.toLowerCase()]) throw new Error("el nombre " + n + " está repetido");
      nombres[n.toLowerCase()] = true;
      personas.push({ id: id, nombre: n });
    });
    function existe(id) { return ids[id] === "una persona"; }
    d.gastos.forEach(function (g) {
      var id = idNuevo(g, "un gasto");
      var v;
      try { v = validarGasto(g, existe); } catch (e) { throw new Error("el gasto \"" + (g.descripcion || id) + "\" está mal: " + e.message); }
      gastos.push({ id: id, descripcion: v.descripcion, monto: v.monto, categoria: v.categoria, pagoPor: v.pagoPor, entre: v.entre });
    });
    (d.pagos || []).forEach(function (p) {
      var id = idNuevo(p, "un pago");
      if (!existe(p.de) || !existe(p.a)) throw new Error("hay un pago de o para una persona que no existe");
      if (p.de === p.a) throw new Error("hay un pago de una persona a sí misma");
      var m;
      try { m = parsearMonto(p.monto); } catch (e) { throw new Error("hay un pago con monto inválido"); }
      pagos.push({ id: id, de: p.de, a: p.a, monto: m });
    });
    return { personas: personas, gastos: gastos, pagos: pagos };
  }

  // ---------- personas ----------
  function buscar(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }
  function buscarPersona(id) { return buscar(estado.personas, id); }
  function existePersona(id) { return !!buscarPersona(id); }

  function agregarPersona(nombre) {
    var p = { id: nuevoId("p"), nombre: validarNombre(nombre) };
    estado.personas.push(p);
    guardar();
    return copiar(p);
  }

  function editarPersona(id, nombre) {
    var p = buscarPersona(id);
    if (!p) throw new Error("Esa persona no existe.");
    p.nombre = validarNombre(nombre, id);
    guardar();
    return copiar(p);
  }

  function borrarPersona(id) {
    var p = buscarPersona(id);
    if (!p) throw new Error("Esa persona no existe.");
    var conGastos = estado.gastos.some(function (g) { return g.pagoPor === id || g.entre.indexOf(id) !== -1; });
    if (conGastos) throw new Error(p.nombre + " tiene gastos cargados. Borrá o editá esos gastos antes de sacarla.");
    var conPagos = estado.pagos.some(function (x) { return x.de === id || x.a === id; });
    if (conPagos) throw new Error(p.nombre + " tiene pagos registrados. Deshacé esos pagos antes de sacarla.");
    estado.personas = estado.personas.filter(function (x) { return x.id !== id; });
    guardar();
    return true;
  }

  // ---------- gastos ----------
  function agregarGasto(datos) {
    var v = validarGasto(datos || {}, existePersona);
    var g = { id: nuevoId("g"), descripcion: v.descripcion, monto: v.monto, categoria: v.categoria, pagoPor: v.pagoPor, entre: v.entre };
    estado.gastos.push(g);
    guardar();
    return copiar(g);
  }

  function editarGasto(id, cambios) {
    var g = buscar(estado.gastos, id);
    if (!g) throw new Error("Ese gasto no existe.");
    var c = cambios || {}, mezcla = {};
    ["descripcion", "monto", "categoria", "pagoPor", "entre"].forEach(function (k) {
      mezcla[k] = Object.prototype.hasOwnProperty.call(c, k) ? c[k] : g[k];
    });
    var v = validarGasto(mezcla, existePersona);
    g.descripcion = v.descripcion; g.monto = v.monto; g.categoria = v.categoria; g.pagoPor = v.pagoPor; g.entre = v.entre;
    guardar();
    return copiar(g);
  }

  function borrarGasto(id) {
    if (!buscar(estado.gastos, id)) throw new Error("Ese gasto no existe.");
    estado.gastos = estado.gastos.filter(function (g) { return g.id !== id; });
    guardar();
    return true;
  }

  // ---------- pagos (saldar deudas) ----------
  function balanceDe(id) {
    var t = totalesPorPersona();
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i].balance;
    return 0;
  }

  function registrarPago(de, a, monto) {
    var pd = buscarPersona(de), pa = buscarPersona(a);
    if (!pd || !pa) throw new Error("Esa persona no existe.");
    if (de === a) throw new Error("Una persona no se puede pagar a sí misma.");
    var m = parsearMonto(monto);
    var debe = -balanceDe(de), cobra = balanceDe(a);
    if (debe <= 0) throw new Error(pd.nombre + " no tiene nada pendiente para pagar.");
    if (cobra <= 0) throw new Error(pa.nombre + " no tiene nada pendiente para cobrar.");
    var max = Math.min(debe, cobra);
    if (m > max) throw new Error("El pago supera lo que le falta saldar (" + formatoPesos(max) + ").");
    var p = { id: nuevoId("x"), de: de, a: a, monto: m };
    estado.pagos.push(p);
    guardar();
    return copiar(p);
  }

  function borrarPago(id) {
    if (!buscar(estado.pagos, id)) throw new Error("Ese pago no existe.");
    estado.pagos = estado.pagos.filter(function (p) { return p.id !== id; });
    guardar();
    return true;
  }

  // ---------- cálculos ----------
  // Parte de cada uno en un gasto: monto / n redondeado para abajo; el resto lo absorbe quien pagó
  // (aunque no esté en "entre"). Así la suma de las partes siempre da el monto exacto.
  function partes(g) {
    var n = g.entre.length, base = Math.floor(g.monto / n), resto = g.monto - base * n, r = {};
    g.entre.forEach(function (id) { r[id] = base; });
    if (resto) r[g.pagoPor] = (r[g.pagoPor] || 0) + resto;
    return r;
  }

  // pagado y consumido son solo gastos del viaje; los pagos entre personas ajustan el balance.
  function totalesPorPersona() {
    var t = {};
    estado.personas.forEach(function (p) {
      t[p.id] = { id: p.id, nombre: p.nombre, pagado: 0, consumido: 0, pagosHechos: 0, pagosRecibidos: 0, balance: 0 };
    });
    estado.gastos.forEach(function (g) {
      if (t[g.pagoPor]) t[g.pagoPor].pagado += g.monto;
      var ps = partes(g);
      Object.keys(ps).forEach(function (id) { if (t[id]) t[id].consumido += ps[id]; });
    });
    estado.pagos.forEach(function (p) {
      if (t[p.de]) t[p.de].pagosHechos += p.monto;
      if (t[p.a]) t[p.a].pagosRecibidos += p.monto;
    });
    return estado.personas.map(function (p) {
      var x = t[p.id];
      x.balance = x.pagado - x.consumido + x.pagosHechos - x.pagosRecibidos;
      return x;
    });
  }

  // Minimiza transferencias: el que más debe le paga al que más tiene que cobrar. Solo lo pendiente.
  function calcularDeudas() {
    var orden = {};
    estado.personas.forEach(function (p, i) { orden[p.id] = i; });
    var deudores = [], acreedores = [];
    totalesPorPersona().forEach(function (t) {
      if (t.balance < 0) deudores.push({ id: t.id, m: -t.balance });
      else if (t.balance > 0) acreedores.push({ id: t.id, m: t.balance });
    });
    function cmp(a, b) { return b.m - a.m || orden[a.id] - orden[b.id]; }
    var deudas = [];
    while (deudores.length && acreedores.length) {
      deudores.sort(cmp); acreedores.sort(cmp);
      var d = deudores[0], a = acreedores[0], m = Math.min(d.m, a.m);
      deudas.push({ de: d.id, a: a.id, monto: m });
      d.m -= m; a.m -= m;
      if (!d.m) deudores.shift();
      if (!a.m) acreedores.shift();
    }
    return deudas;
  }

  function resumenPorCategoria() {
    var tot = {};
    CATEGORIAS.forEach(function (c) { tot[c] = 0; });
    estado.gastos.forEach(function (g) { tot[g.categoria] = (tot[g.categoria] || 0) + g.monto; });
    return CATEGORIAS
      .map(function (c) { return { categoria: c, total: tot[c] }; })
      .filter(function (x) { return x.total > 0; })
      .sort(function (a, b) { return b.total - a.total || CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria); });
  }

  function totalViaje() {
    return estado.gastos.reduce(function (s, g) { return s + g.monto; }, 0);
  }

  function formatoPesos(n) {
    var s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 ? "-$" : "$") + s;
  }

  function textoWhatsApp() {
    var nombres = {};
    estado.personas.forEach(function (p) { nombres[p.id] = p.nombre; });
    var lineas = ["*Gastos del viaje*", "Total gastado: " + formatoPesos(totalViaje())];
    if (estado.gastos.length) {
      lineas.push("", "*Lo que consumió cada uno:*");
      totalesPorPersona().forEach(function (t) { lineas.push("• " + t.nombre + ": " + formatoPesos(t.consumido)); });
    }
    lineas.push("");
    var deudas = calcularDeudas();
    if (!estado.gastos.length) lineas.push("Todavía no hay gastos cargados.");
    else if (!deudas.length) lineas.push("¡Están todos a mano! Nadie le debe a nadie.");
    else {
      lineas.push("*Quién le paga a quién:*");
      deudas.forEach(function (d) { lineas.push("• " + nombres[d.de] + " le paga " + formatoPesos(d.monto) + " a " + nombres[d.a]); });
    }
    if (estado.pagos.length) {
      lineas.push("", "*Ya pagado:*");
      estado.pagos.forEach(function (p) { lineas.push("• " + nombres[p.de] + " le pagó " + formatoPesos(p.monto) + " a " + nombres[p.a]); });
    }
    return lineas.join("\n");
  }

  // ---------- archivo ----------
  function exportarViaje() {
    return JSON.stringify({
      app: "gastos-viaje", version: VERSION, exportado: new Date().toISOString(),
      personas: estado.personas, gastos: estado.gastos, pagos: estado.pagos
    }, null, 2);
  }

  function nombreArchivoViaje() {
    var d = new Date();
    function dos(n) { return (n < 10 ? "0" : "") + n; }
    return "gastos-viaje-" + d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate()) + ".json";
  }

  function leerArchivo(texto) {
    if (typeof texto !== "string" || !texto.trim()) throw new Error("El archivo está vacío.");
    var crudo;
    try { crudo = JSON.parse(texto.replace(/^\uFEFF/, "")); } catch (e) { throw new Error("El archivo no es un viaje de Gastos del viaje (no se pudo leer)."); }
    try { return validarDatos(crudo); } catch (e) { throw new Error("El archivo no es válido: " + String(e.message).replace(/[.\s]+$/, "") + ". No se cambió nada."); }
  }

  // Misma validación que importarViaje, pero sin tocar nada. Devuelve las cantidades o tira el mismo error.
  function validarViaje(texto) {
    var d = leerArchivo(texto);
    return { personas: d.personas.length, gastos: d.gastos.length, pagos: d.pagos.length };
  }

  function importarViaje(texto) {
    var d = leerArchivo(texto);
    estado = { personas: d.personas, gastos: d.gastos, pagos: d.pagos, sigId: 1 };
    estado.sigId = calcularSigId();
    guardar();
    return { personas: d.personas.length, gastos: d.gastos.length, pagos: d.pagos.length };
  }

  global.Gastos = {
    CATEGORIAS: CATEGORIAS.slice(),
    cargar: cargar,
    guardar: guardar,
    getEstado: getEstado,
    agregarPersona: agregarPersona,
    editarPersona: editarPersona,
    borrarPersona: borrarPersona,
    agregarGasto: agregarGasto,
    editarGasto: editarGasto,
    borrarGasto: borrarGasto,
    registrarPago: registrarPago,
    borrarPago: borrarPago,
    calcularDeudas: calcularDeudas,
    resumenPorCategoria: resumenPorCategoria,
    totalesPorPersona: totalesPorPersona,
    totalViaje: totalViaje,
    textoWhatsApp: textoWhatsApp,
    formatoPesos: formatoPesos,
    parsearMonto: parsearMonto,
    exportarViaje: exportarViaje,
    importarViaje: importarViaje,
    validarViaje: validarViaje,
    nombreArchivoViaje: nombreArchivoViaje
  };

  cargar();
})(typeof window !== "undefined" ? window : globalThis);
