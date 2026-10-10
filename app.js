/* app.js — lógica y datos de "Gastos del viaje". Expone window.Gastos. Sin dependencias. */
(function (global) {
  "use strict";

  var CLAVE = "gastos-viaje-v1";
  var CATEGORIAS = ["Comida", "Súper", "Nafta", "Alojamiento", "Salidas", "Otros"];
  var estado = { personas: [], gastos: [], sigId: 1 };

  // ---------- almacenamiento ----------
  function storage() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  function cargar() {
    var ls = storage();
    estado = { personas: [], gastos: [], sigId: 1 };
    if (!ls) return getEstado();
    try {
      var crudo = ls.getItem(CLAVE);
      if (crudo) {
        var d = JSON.parse(crudo);
        if (d && Array.isArray(d.personas) && Array.isArray(d.gastos)) {
          estado.personas = d.personas;
          estado.gastos = d.gastos;
          estado.sigId = Number(d.sigId) || calcularSigId();
        }
      }
    } catch (e) { /* datos corruptos: arrancamos vacío */ }
    return getEstado();
  }

  function guardar() {
    var ls = storage();
    if (!ls) return;
    try { ls.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin espacio o bloqueado */ }
  }

  function calcularSigId() {
    var max = 0;
    estado.personas.concat(estado.gastos).forEach(function (x) {
      var n = parseInt(String(x.id).replace(/\D/g, ""), 10);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function nuevoId(prefijo) { return prefijo + (estado.sigId++); }

  function copiar(x) { return JSON.parse(JSON.stringify(x)); }

  function getEstado() {
    return { personas: copiar(estado.personas), gastos: copiar(estado.gastos) };
  }

  // ---------- personas ----------
  function buscarPersona(id) {
    for (var i = 0; i < estado.personas.length; i++) if (estado.personas[i].id === id) return estado.personas[i];
    return null;
  }

  function validarNombre(nombre, idExcluir) {
    var n = typeof nombre === "string" ? nombre.trim().replace(/\s+/g, " ") : "";
    if (!n) throw new Error("Escribí un nombre.");
    if (n.length > 40) throw new Error("El nombre es muy largo (máximo 40 letras).");
    var repetido = estado.personas.some(function (p) {
      return p.id !== idExcluir && p.nombre.toLowerCase() === n.toLowerCase();
    });
    if (repetido) throw new Error("Ya hay alguien que se llama " + n + ".");
    return n;
  }

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
    var usada = estado.gastos.some(function (g) { return g.pagoPor === id || g.entre.indexOf(id) !== -1; });
    if (usada) throw new Error(p.nombre + " tiene gastos cargados. Borrá o editá esos gastos antes de sacarla.");
    estado.personas = estado.personas.filter(function (x) { return x.id !== id; });
    guardar();
    return true;
  }

  // ---------- gastos ----------
  function buscarGasto(id) {
    for (var i = 0; i < estado.gastos.length; i++) if (estado.gastos[i].id === id) return estado.gastos[i];
    return null;
  }

  function validarGasto(d) {
    var descripcion = typeof d.descripcion === "string" ? d.descripcion.trim() : "";
    if (!descripcion) throw new Error("Poné una descripción para el gasto.");
    if (descripcion.length > 80) throw new Error("La descripción es muy larga (máximo 80 letras).");

    var monto = parsearMonto(d.monto);

    if (CATEGORIAS.indexOf(d.categoria) === -1) throw new Error("Elegí una categoría.");

    if (!d.pagoPor) throw new Error("Elegí quién pagó.");
    if (!buscarPersona(d.pagoPor)) throw new Error("La persona que pagó no existe.");

    if (!Array.isArray(d.entre) || d.entre.length === 0) throw new Error("Elegí al menos una persona para dividir el gasto.");
    var entre = [];
    d.entre.forEach(function (id) {
      if (!buscarPersona(id)) throw new Error("Una de las personas elegidas para dividir no existe.");
      if (entre.indexOf(id) === -1) entre.push(id);
    });

    return { descripcion: descripcion, monto: monto, categoria: d.categoria, pagoPor: d.pagoPor, entre: entre };
  }

  // Lee un monto en pesos enteros. Acepta un número entero o un texto con solo dígitos (30000)
  // o con puntos de miles en grupos de a tres (30.000, 1.234.567); ignora "$" y espacios.
  var MSG_MONTO = "Escribí el monto en pesos enteros, ej: 30.000";
  function parsearMonto(valor) {
    var n;
    if (typeof valor === "number") {
      if (isNaN(valor)) throw new Error(MSG_MONTO);
      n = valor;
      if (isFinite(n) && n > 0 && Math.floor(n) !== n) throw new Error("El monto va en pesos enteros, sin centavos.");
    } else if (typeof valor === "string") {
      var t = valor.replace(/\s+/g, "").replace(/^\$/, "");
      if (/^-/.test(t) && /^-[\d.,]+$/.test(t)) throw new Error("El monto tiene que ser mayor a cero.");
      if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(t)) throw new Error(MSG_MONTO);
      n = Number(t.replace(/\./g, ""));
    } else {
      throw new Error(MSG_MONTO);
    }
    if (!isFinite(n) || n <= 0) throw new Error("El monto tiene que ser mayor a cero.");
    if (n > 1e12) throw new Error("El monto es demasiado grande.");
    return n;
  }

  function agregarGasto(datos) {
    var v = validarGasto(datos || {});
    var g = { id: nuevoId("g"), descripcion: v.descripcion, monto: v.monto, categoria: v.categoria, pagoPor: v.pagoPor, entre: v.entre };
    estado.gastos.push(g);
    guardar();
    return copiar(g);
  }

  function editarGasto(id, cambios) {
    var g = buscarGasto(id);
    if (!g) throw new Error("Ese gasto no existe.");
    var c = cambios || {};
    var mezcla = {};
    ["descripcion", "monto", "categoria", "pagoPor", "entre"].forEach(function (k) {
      mezcla[k] = Object.prototype.hasOwnProperty.call(c, k) ? c[k] : g[k];
    });
    var v = validarGasto(mezcla);
    g.descripcion = v.descripcion; g.monto = v.monto; g.categoria = v.categoria; g.pagoPor = v.pagoPor; g.entre = v.entre;
    guardar();
    return copiar(g);
  }

  function borrarGasto(id) {
    if (!buscarGasto(id)) throw new Error("Ese gasto no existe.");
    estado.gastos = estado.gastos.filter(function (g) { return g.id !== id; });
    guardar();
    return true;
  }

  // ---------- cálculos ----------
  // Parte de cada uno en un gasto: monto / n redondeado para abajo; el resto lo absorbe quien pagó
  // (aunque no esté en "entre"). Así la suma de las partes siempre da el monto exacto.
  function partes(g) {
    var n = g.entre.length;
    var base = Math.floor(g.monto / n);
    var resto = g.monto - base * n;
    var r = {};
    g.entre.forEach(function (id) { r[id] = base; });
    if (resto) r[g.pagoPor] = (r[g.pagoPor] || 0) + resto;
    return r;
  }

  function totalesPorPersona() {
    var t = {};
    estado.personas.forEach(function (p) { t[p.id] = { id: p.id, nombre: p.nombre, pagado: 0, consumido: 0, balance: 0 }; });
    estado.gastos.forEach(function (g) {
      if (t[g.pagoPor]) t[g.pagoPor].pagado += g.monto;
      var ps = partes(g);
      Object.keys(ps).forEach(function (id) { if (t[id]) t[id].consumido += ps[id]; });
    });
    return estado.personas.map(function (p) {
      var x = t[p.id];
      x.balance = x.pagado - x.consumido;
      return x;
    });
  }

  // Minimiza transferencias con el método greedy: el que más debe le paga al que más tiene que cobrar.
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
      var d = deudores[0], a = acreedores[0];
      var m = Math.min(d.m, a.m);
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
      totalesPorPersona().forEach(function (t) {
        lineas.push("• " + t.nombre + ": " + formatoPesos(t.consumido));
      });
    }
    lineas.push("");
    var deudas = calcularDeudas();
    if (!estado.gastos.length) lineas.push("Todavía no hay gastos cargados.");
    else if (!deudas.length) lineas.push("¡Están todos a mano! Nadie le debe a nadie.");
    else {
      lineas.push("*Quién le paga a quién:*");
      deudas.forEach(function (d) {
        lineas.push("• " + nombres[d.de] + " le paga " + formatoPesos(d.monto) + " a " + nombres[d.a]);
      });
    }
    return lineas.join("\n");
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
    calcularDeudas: calcularDeudas,
    resumenPorCategoria: resumenPorCategoria,
    totalesPorPersona: totalesPorPersona,
    totalViaje: totalViaje,
    textoWhatsApp: textoWhatsApp,
    formatoPesos: formatoPesos,
    parsearMonto: parsearMonto
  };

  cargar();
})(typeof window !== "undefined" ? window : globalThis);
