/* tests.js — tests de app.js. Correr con `node tests.js` o abriendo tests.html. */
(function (global) {
  "use strict";
  var esNode = typeof window === "undefined";
  if (esNode) {
    var mem = {};
    global.localStorage = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
    require("./app.js");
  }
  var G = global.Gastos, CLAVE = "gastos-viaje-v2", CLAVE_V1 = "gastos-viaje-v1";
  // no pisar datos reales en el navegador
  var respaldo = global.localStorage.getItem(CLAVE), respaldoV1 = global.localStorage.getItem(CLAVE_V1);
  var ok = 0, fallas = [];

  function limpio() { global.localStorage.removeItem(CLAVE); global.localStorage.removeItem(CLAVE_V1); G.cargar(); }
  function igual(a, b, msg) {
    var A = JSON.stringify(a), B = JSON.stringify(b);
    if (A !== B) throw new Error((msg || "") + "\n   esperaba " + B + "\n   obtuve   " + A);
  }
  function tira(fn, texto) {
    try { fn(); } catch (e) {
      if (texto && e.message.indexOf(texto) === -1) throw new Error("Mensaje inesperado: " + e.message);
      return;
    }
    throw new Error("Esperaba un error" + (texto ? " (" + texto + ")" : ""));
  }
  function test(nombre, fn) {
    limpio();
    try { fn(); ok++; } catch (e) { fallas.push(nombre + ": " + e.message); }
  }
  function tres() {
    return [G.agregarPersona("Ana").id, G.agregarPersona("Beto").id, G.agregarPersona("Caro").id];
  }
  function sumaBalances() { return G.totalesPorPersona().reduce(function (s, t) { return s + t.balance; }, 0); }

  test("agregar, editar y validar personas", function () {
    var a = G.agregarPersona("  Ana  ");
    igual(a.nombre, "Ana");
    tira(function () { G.agregarPersona(""); }, "nombre");
    tira(function () { G.agregarPersona("ana"); }, "Ya hay");
    G.agregarPersona("Beto");
    G.editarPersona(a.id, "Anita");
    igual(G.getEstado().personas.map(function (p) { return p.nombre; }), ["Anita", "Beto"]);
    tira(function () { G.editarPersona(a.id, "beto"); }, "Ya hay");
    tira(function () { G.editarPersona("nada", "X"); }, "no existe");
  });

  test("no se puede borrar una persona con gastos", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Pizza", monto: 300, categoria: "Comida", pagoPor: p[0], entre: [p[0], p[1]] });
    tira(function () { G.borrarPersona(p[0]); }, "tiene gastos");
    tira(function () { G.borrarPersona(p[1]); }, "tiene gastos");
    G.borrarPersona(p[2]);
    igual(G.getEstado().personas.length, 2);
  });

  test("validaciones de gastos", function () {
    var p = tres();
    var base = { descripcion: "Nafta", monto: 1000, categoria: "Nafta", pagoPor: p[0], entre: [p[0]] };
    function con(k, v) { var o = JSON.parse(JSON.stringify(base)); o[k] = v; return o; }
    tira(function () { G.agregarGasto(con("descripcion", " ")); }, "descripción");
    tira(function () { G.agregarGasto(con("monto", NaN)); }, "pesos enteros");
    tira(function () { G.agregarGasto(con("monto", 0)); }, "mayor a cero");
    tira(function () { G.agregarGasto(con("monto", -5)); }, "mayor a cero");
    tira(function () { G.agregarGasto(con("monto", 10.5)); }, "enteros");
    tira(function () { G.agregarGasto(con("categoria", "Joda")); }, "categoría");
    tira(function () { G.agregarGasto(con("pagoPor", "x")); }, "no existe");
    tira(function () { G.agregarGasto(con("entre", [])); }, "al menos una");
    tira(function () { G.agregarGasto(con("entre", ["x"])); }, "no existe");
    igual(G.getEstado().gastos.length, 0);
    var g = G.agregarGasto(con("entre", [p[0], p[0], p[1]]));
    igual(g.entre, [p[0], p[1]], "saca repetidos");
  });

  test("editar y borrar gastos", function () {
    var p = tres();
    var g = G.agregarGasto({ descripcion: "Súper", monto: 900, categoria: "Súper", pagoPor: p[0], entre: p });
    G.editarGasto(g.id, { monto: 1200, pagoPor: p[1] });
    var e = G.getEstado().gastos[0];
    igual([e.monto, e.pagoPor, e.descripcion], [1200, p[1], "Súper"]);
    tira(function () { G.editarGasto(g.id, { monto: NaN }); }, "monto");
    igual(G.getEstado().gastos[0].monto, 1200, "un edit inválido no cambia nada");
    G.borrarGasto(g.id);
    igual(G.getEstado().gastos.length, 0);
    tira(function () { G.borrarGasto(g.id); }, "no existe");
  });

  test("deudas simples entre tres", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Cena", monto: 3000, categoria: "Comida", pagoPor: p[0], entre: p });
    igual(G.calcularDeudas(), [{ de: p[1], a: p[0], monto: 1000 }, { de: p[2], a: p[0], monto: 1000 }]);
  });

  test("resto al dividir lo absorbe quien pagó", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Helado", monto: 100, categoria: "Salidas", pagoPor: p[0], entre: p });
    var t = G.totalesPorPersona();
    igual(t.map(function (x) { return x.consumido; }), [34, 33, 33]);
    igual(G.calcularDeudas(), [{ de: p[1], a: p[0], monto: 33 }, { de: p[2], a: p[0], monto: 33 }]);
    igual(sumaBalances(), 0);
  });

  test("resto cuando el que pagó no participa", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Regalo", monto: 101, categoria: "Otros", pagoPor: p[0], entre: [p[1], p[2]] });
    var t = G.totalesPorPersona();
    igual(t.map(function (x) { return x.consumido; }), [1, 50, 50]);
    igual(G.calcularDeudas(), [{ de: p[1], a: p[0], monto: 50 }, { de: p[2], a: p[0], monto: 50 }]);
  });

  test("minimiza transferencias y cierra en cero", function () {
    var p = tres(); var d = G.agregarPersona("Dani").id;
    var todos = p.concat([d]);
    G.agregarGasto({ descripcion: "Casa", monto: 80000, categoria: "Alojamiento", pagoPor: p[0], entre: todos });
    G.agregarGasto({ descripcion: "Nafta", monto: 20000, categoria: "Nafta", pagoPor: p[1], entre: todos });
    G.agregarGasto({ descripcion: "Asado", monto: 20000, categoria: "Comida", pagoPor: p[1], entre: todos });
    // cada uno consume 30000: Ana +50000, Beto +10000, Caro -30000, Dani -30000
    var deudas = G.calcularDeudas();
    igual(deudas.length, 3, "con 4 personas alcanza con 3 transferencias");
    var neto = {}; todos.forEach(function (id) { neto[id] = 0; });
    deudas.forEach(function (x) { neto[x.de] -= x.monto; neto[x.a] += x.monto; if (x.monto <= 0) throw new Error("monto no positivo"); });
    G.totalesPorPersona().forEach(function (t) { igual(neto[t.id], t.balance, "deudas = balance de " + t.nombre); });
  });

  test("todos a mano no genera deudas", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "A", monto: 300, categoria: "Comida", pagoPor: p[0], entre: p });
    G.agregarGasto({ descripcion: "B", monto: 300, categoria: "Comida", pagoPor: p[1], entre: p });
    G.agregarGasto({ descripcion: "C", monto: 300, categoria: "Comida", pagoPor: p[2], entre: p });
    igual(G.calcularDeudas(), []);
    if (G.textoWhatsApp().indexOf("a mano") === -1) throw new Error("el texto debería decir que están a mano");
  });

  test("totales, resumen por categoría y total del viaje", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Cena", monto: 3000, categoria: "Comida", pagoPor: p[0], entre: p });
    G.agregarGasto({ descripcion: "Nafta", monto: 9000, categoria: "Nafta", pagoPor: p[1], entre: [p[0], p[1]] });
    G.agregarGasto({ descripcion: "Birra", monto: 1500, categoria: "Comida", pagoPor: p[2], entre: [p[2]] });
    igual(G.totalViaje(), 13500);
    igual(G.resumenPorCategoria(), [{ categoria: "Nafta", total: 9000 }, { categoria: "Comida", total: 4500 }]);
    igual(G.totalesPorPersona(), [
      { id: p[0], nombre: "Ana", pagado: 3000, consumido: 5500, pagosHechos: 0, pagosRecibidos: 0, balance: -2500 },
      { id: p[1], nombre: "Beto", pagado: 9000, consumido: 5500, pagosHechos: 0, pagosRecibidos: 0, balance: 3500 },
      { id: p[2], nombre: "Caro", pagado: 1500, consumido: 2500, pagosHechos: 0, pagosRecibidos: 0, balance: -1000 }
    ]);
  });

  test("persistencia en localStorage", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Cena", monto: 3000, categoria: "Comida", pagoPor: p[0], entre: p });
    var antes = G.getEstado();
    G.cargar();
    igual(G.getEstado(), antes);
    var nueva = G.agregarPersona("Dani");
    if (antes.personas.some(function (x) { return x.id === nueva.id; })) throw new Error("id repetido después de recargar");
  });

  test("datos corruptos no rompen", function () {
    global.localStorage.setItem(CLAVE, "{no es json");
    G.cargar();
    igual(G.getEstado(), { personas: [], gastos: [], pagos: [] });
  });

  test("getEstado devuelve copias", function () {
    tres();
    G.getEstado().personas[0].nombre = "Hackeado";
    igual(G.getEstado().personas[0].nombre, "Ana");
  });

  test("texto de WhatsApp", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Casa", monto: 150000, categoria: "Alojamiento", pagoPor: p[0], entre: p });
    var t = G.textoWhatsApp();
    ["Total gastado: $150.000", "Beto le paga $50.000 a Ana", "Caro le paga $50.000 a Ana"].forEach(function (s) {
      if (t.indexOf(s) === -1) throw new Error("falta: " + s + "\n" + t);
    });
    if (/%[0-9A-F]{2}/.test(t)) throw new Error("no debería venir codificado para URL");
  });

  test("WhatsApp muestra lo consumido por cada uno, sin promedio", function () {
    var p = tres();
    G.agregarGasto({ descripcion: "Súper", monto: 30000, categoria: "Súper", pagoPor: p[0], entre: p });
    G.agregarGasto({ descripcion: "Nafta", monto: 10000, categoria: "Nafta", pagoPor: p[1], entre: [p[0], p[1]] });
    G.agregarGasto({ descripcion: "Varios", monto: 100, categoria: "Otros", pagoPor: p[2], entre: p });
    var t = G.textoWhatsApp();
    if (t.indexOf("promedio") !== -1) throw new Error("no debería mostrar promedio");
    ["Ana: $15.033", "Beto: $15.033", "Caro: $10.034", "Caro le paga $9.934 a Ana", "Beto le paga $5.033 a Ana"].forEach(function (s) {
      if (t.indexOf(s) === -1) throw new Error("falta: " + s + "\n" + t);
    });
  });

  test("parsearMonto: válidos", function () {
    igual(["30000", "30.000", "1.234.567", "$ 5.000", " 30000 ", 30000].map(G.parsearMonto),
      [30000, 30000, 1234567, 5000, 30000, 30000]);
  });

  test("parsearMonto: con error", function () {
    ["30,000", "1,000", "30,00", "30,50", "5.00", "3.0000", "abc", "", "  ", "30.00.000", ".000", "1..000"].forEach(function (v) {
      tira(function () { G.parsearMonto(v); }, "pesos enteros, ej: 30.000");
    });
    tira(function () { G.parsearMonto(NaN); }, "pesos enteros, ej: 30.000");
    tira(function () { G.parsearMonto(undefined); }, "pesos enteros, ej: 30.000");
    tira(function () { G.parsearMonto("0"); }, "mayor a cero");
    tira(function () { G.parsearMonto(0); }, "mayor a cero");
    tira(function () { G.parsearMonto("-50"); }, "mayor a cero");
    tira(function () { G.parsearMonto(-50); }, "mayor a cero");
    tira(function () { G.parsearMonto(10.5); }, "sin centavos");
  });

  test("agregar y editar gasto con monto como texto o número", function () {
    var p = tres();
    var g = G.agregarGasto({ descripcion: "Súper", monto: "30.000", categoria: "Súper", pagoPor: p[0], entre: p });
    igual(g.monto, 30000);
    tira(function () { G.agregarGasto({ descripcion: "X", monto: "30,000", categoria: "Súper", pagoPor: p[0], entre: p }); }, "ej: 30.000");
    G.editarGasto(g.id, { monto: "1.234.567" });
    igual(G.getEstado().gastos[0].monto, 1234567);
    G.editarGasto(g.id, { monto: 1234567, descripcion: "Súper grande" });
    igual(G.getEstado().gastos[0].monto, 1234567);
    G.editarGasto(g.id, { descripcion: "Sin tocar el monto" });
    igual(G.getEstado().gastos[0].monto, 1234567);
    tira(function () { G.editarGasto(g.id, { monto: "5.00" }); }, "ej: 30.000");
    igual(G.getEstado().gastos.length, 1);
  });

  // ---------- v2: pagos ----------
  function casoABC() {
    var p = tres();
    G.agregarGasto({ descripcion: "Súper", monto: 30000, categoria: "Súper", pagoPor: p[0], entre: p });
    G.agregarGasto({ descripcion: "Nafta", monto: 10000, categoria: "Nafta", pagoPor: p[1], entre: [p[0], p[1]] });
    G.agregarGasto({ descripcion: "Varios", monto: 100, categoria: "Otros", pagoPor: p[2], entre: p });
    return p; // Caro le debe 9.934 a Ana, Beto le debe 5.033 a Ana
  }

  test("registrar un pago descuenta la deuda", function () {
    var p = casoABC();
    var pago = G.registrarPago(p[2], p[0], 9934);
    igual([pago.de, pago.a, pago.monto], [p[2], p[0], 9934]);
    igual(G.calcularDeudas(), [{ de: p[1], a: p[0], monto: 5033 }]);
    var t = G.totalesPorPersona();
    igual([t[2].pagado, t[2].consumido, t[2].pagosHechos, t[2].balance], [100, 10034, 9934, 0]);
    igual([t[0].pagosRecibidos, t[0].balance], [9934, 5033]);
    igual(G.totalViaje(), 40100, "los pagos no cambian el total del viaje");
    igual(G.getEstado().pagos.length, 1);
  });

  test("pagos parciales y todos a mano", function () {
    var p = casoABC();
    G.registrarPago(p[1], p[0], "2.000");
    igual(G.calcularDeudas(), [{ de: p[2], a: p[0], monto: 9934 }, { de: p[1], a: p[0], monto: 3033 }]);
    G.registrarPago(p[1], p[0], 3033);
    G.registrarPago(p[2], p[0], 9934);
    igual(G.calcularDeudas(), []);
    var txt = G.textoWhatsApp();
    ["a mano", "*Ya pagado:*", "Beto le pagó $2.000 a Ana", "Caro le pagó $9.934 a Ana"].forEach(function (s) {
      if (txt.indexOf(s) === -1) throw new Error("falta: " + s + "\n" + txt);
    });
  });

  test("validaciones de pagos", function () {
    var p = casoABC();
    tira(function () { G.registrarPago(p[2], p[0], 9935); }, "supera lo que le falta saldar ($9.934)");
    tira(function () { G.registrarPago(p[1], p[0], 6000); }, "($5.033)");
    tira(function () { G.registrarPago(p[0], p[1], 100); }, "Ana no tiene nada pendiente para pagar");
    tira(function () { G.registrarPago(p[2], p[1], 100); }, "Beto no tiene nada pendiente para cobrar");
    tira(function () { G.registrarPago(p[0], p[0], 100); }, "a sí misma");
    tira(function () { G.registrarPago("x", p[0], 100); }, "no existe");
    tira(function () { G.registrarPago(p[2], p[0], "30,000"); }, "ej: 30.000");
    tira(function () { G.registrarPago(p[2], p[0], 0); }, "mayor a cero");
    igual(G.getEstado().pagos.length, 0);
  });

  test("deshacer un pago y borrar personas con pagos", function () {
    var p = casoABC();
    var d = G.agregarPersona("Dani").id;
    var pago = G.registrarPago(p[1], p[0], 5033);
    G.borrarGasto(G.getEstado().gastos[1].id); // la nafta de Beto
    tira(function () { G.borrarPersona(p[1]); }, "tiene gastos");
    G.borrarPago(pago.id);
    igual(G.getEstado().pagos, []);
    tira(function () { G.borrarPago(pago.id); }, "no existe");
    G.borrarPersona(d);
    // persona sin gastos pero con pagos
    limpio(); var q = tres();
    var g = G.agregarGasto({ descripcion: "Cena", monto: 300, categoria: "Comida", pagoPor: q[0], entre: [q[0], q[1]] });
    var pg = G.registrarPago(q[1], q[0], 150);
    G.borrarGasto(g.id);
    tira(function () { G.borrarPersona(q[1]); }, "tiene pagos registrados");
    G.borrarPago(pg.id);
    G.borrarPersona(q[1]);
  });

  test("editar un gasto después de un pago recalcula bien", function () {
    var p = casoABC();
    G.registrarPago(p[2], p[0], 9934); // Caro saldó todo
    var nafta = G.getEstado().gastos[1];
    G.editarGasto(nafta.id, { entre: p }); // ahora la nafta es entre los 3
    // Nafta 10.000 / 3 = 3.333 c/u y el peso que sobra lo absorbe Beto. Varios 100 / 3 = 33 y sobra 1 para Caro.
    var t = G.totalesPorPersona();
    igual(t.map(function (x) { return x.consumido; }), [13366, 13367, 13367]);
    igual(t.map(function (x) { return x.balance; }), [6700, -3367, -3333]);
    igual(G.calcularDeudas(), [{ de: p[1], a: p[0], monto: 3367 }, { de: p[2], a: p[0], monto: 3333 }]);
    // si el gasto baja después del pago, la deuda se da vuelta y nadie pierde plata
    limpio(); var q = tres();
    var g = G.agregarGasto({ descripcion: "Cena", monto: 3000, categoria: "Comida", pagoPor: q[0], entre: q });
    G.registrarPago(q[2], q[0], 1000);
    G.editarGasto(g.id, { entre: [q[0], q[1]] }); // Caro ya no comió, pero había pagado 1.000
    igual(G.totalesPorPersona().map(function (x) { return x.balance; }), [500, -1500, 1000]);
    igual(G.calcularDeudas(), [{ de: q[1], a: q[2], monto: 1000 }, { de: q[1], a: q[0], monto: 500 }]);
  });

  // ---------- v2: archivo ----------
  test("exportar e importar deja todo idéntico", function () {
    var p = casoABC();
    G.registrarPago(p[1], p[0], 2000);
    var antes = G.getEstado(), deudas = G.calcularDeudas(), wa = G.textoWhatsApp();
    var archivo = G.exportarViaje();
    var j = JSON.parse(archivo);
    igual([j.app, j.version, typeof j.exportado], ["gastos-viaje", 2, "string"]);
    limpio();
    igual(G.getEstado().personas.length, 0);
    var r = G.importarViaje(archivo);
    igual(r, { personas: 3, gastos: 3, pagos: 1 });
    igual(G.getEstado(), antes);
    igual(G.calcularDeudas(), deudas);
    igual(G.textoWhatsApp(), wa);
    G.cargar();
    igual(G.getEstado(), antes, "queda guardado al recargar");
  });

  test("después de importar no se repiten ids", function () {
    tres();
    G.importarViaje(JSON.stringify({ app: "gastos-viaje", version: 2,
      personas: [{ id: "p1", nombre: "Ana" }, { id: "p40", nombre: "Beto" }],
      gastos: [{ id: "g41", descripcion: "Cena", monto: 100, categoria: "Comida", pagoPor: "p1", entre: ["p1", "p40"] }],
      pagos: [{ id: "x42", de: "p40", a: "p1", monto: 10 }] }));
    var nueva = G.agregarPersona("Caro"), g = G.agregarGasto({ descripcion: "Pan", monto: 50, categoria: "Súper", pagoPor: "p1", entre: ["p1"] });
    var ids = G.getEstado().personas.concat(G.getEstado().gastos, G.getEstado().pagos).map(function (x) { return x.id; });
    igual(ids.length, new Set(ids).size, "ids únicos: " + ids.join(","));
    if (["p1", "p40", "g41", "x42"].indexOf(nueva.id) !== -1 || ["p1", "p40", "g41", "x42"].indexOf(g.id) !== -1) throw new Error("repitió un id");
  });

  test("archivos rotos o inválidos no cambian nada", function () {
    var p = casoABC();
    G.registrarPago(p[1], p[0], 2000);
    var antes = G.getEstado(), guardado = global.localStorage.getItem(CLAVE);
    var bueno = JSON.parse(G.exportarViaje());
    function con(fn) { var o = JSON.parse(JSON.stringify(bueno)); fn(o); return JSON.stringify(o); }
    var malos = [
      "", "   ", "{roto", "null", "[]", "42", JSON.stringify({ hola: 1 }),
      con(function (o) { o.app = "otra-app"; }),
      con(function (o) { o.version = 9; }),
      con(function (o) { o.personas[1].id = o.personas[0].id; }),           // persona repetida
      con(function (o) { o.gastos[1].id = o.personas[0].id; }),             // id repetido entre listas
      con(function (o) { o.personas[1].nombre = o.personas[0].nombre.toUpperCase(); }),
      con(function (o) { o.personas[0].nombre = ""; }),
      con(function (o) { o.gastos[0].pagoPor = "nadie"; }),
      con(function (o) { o.gastos[0].entre = ["nadie"]; }),
      con(function (o) { o.gastos[0].entre = []; }),
      con(function (o) { o.gastos[0].monto = 10.5; }),
      con(function (o) { o.gastos[0].monto = -1; }),
      con(function (o) { o.gastos[0].categoria = "Joda"; }),
      con(function (o) { delete o.gastos[0].id; }),
      con(function (o) { o.pagos[0].a = o.pagos[0].de; }),
      con(function (o) { o.pagos[0].de = "nadie"; }),
      con(function (o) { o.pagos[0].monto = 0; }),
      con(function (o) { o.pagos = "x"; }),
      con(function (o) { delete o.personas; })
    ];
    malos.forEach(function (m, i) {
      var err = null;
      try { G.importarViaje(m); } catch (e) { err = e; }
      if (!err) throw new Error("el archivo malo #" + i + " se aceptó: " + m.slice(0, 80));
      igual(G.getEstado(), antes, "el archivo malo #" + i + " cambió el viaje");
      igual(global.localStorage.getItem(CLAVE), guardado, "el archivo malo #" + i + " cambió lo guardado");
    });
    tira(function () { G.importarViaje("{roto"); }, "no se pudo leer");
    tira(function () { G.importarViaje(con(function (o) { o.personas[1].id = o.personas[0].id; })); }, "repetido");
  });

  test("importa datos de la v1 sin pagos", function () {
    var v1 = JSON.stringify({ personas: [{ id: "p1", nombre: "Ana" }, { id: "p2", nombre: "Beto" }],
      gastos: [{ id: "g3", descripcion: "Cena", monto: 1000, categoria: "Comida", pagoPor: "p1", entre: ["p1", "p2"] }], sigId: 4 });
    igual(G.importarViaje(v1), { personas: 2, gastos: 1, pagos: 0 });
    igual(G.calcularDeudas(), [{ de: "p2", a: "p1", monto: 500 }]);
  });

  // ---------- v2: migración ----------
  test("cargar migra solo desde la v1 y la deja intacta", function () {
    var v1 = JSON.stringify({ personas: [{ id: "p1", nombre: "Ana" }, { id: "p2", nombre: "Beto" }],
      gastos: [{ id: "g3", descripcion: "Cena", monto: 1000, categoria: "Comida", pagoPor: "p1", entre: ["p1", "p2"] }], sigId: 4 });
    global.localStorage.removeItem(CLAVE);
    global.localStorage.setItem(CLAVE_V1, v1);
    G.cargar();
    igual(G.getEstado().personas.length, 2);
    igual(G.getEstado().pagos, []);
    igual(global.localStorage.getItem(CLAVE_V1), v1, "la v1 queda como respaldo");
    if (!global.localStorage.getItem(CLAVE)) throw new Error("no guardó en la v2");
    var nueva = G.agregarPersona("Caro");
    if (["p1", "p2", "g3"].indexOf(nueva.id) !== -1) throw new Error("repitió un id después de migrar");
  });

  test("si ya hay datos v2 no los pisa con la v1", function () {
    tres(); // queda guardado en v2
    var v2 = global.localStorage.getItem(CLAVE);
    global.localStorage.setItem(CLAVE_V1, JSON.stringify({ personas: [{ id: "p1", nombre: "Viejo" }], gastos: [] }));
    G.cargar();
    igual(G.getEstado().personas.map(function (x) { return x.nombre; }), ["Ana", "Beto", "Caro"]);
    igual(global.localStorage.getItem(CLAVE), v2);
  });

  test("nombre del archivo", function () {
    if (!/^gastos-viaje-\d{4}-\d{2}-\d{2}\.json$/.test(G.nombreArchivoViaje())) throw new Error(G.nombreArchivoViaje());
  });

  // restaurar datos del usuario
  [[CLAVE, respaldo], [CLAVE_V1, respaldoV1]].forEach(function (r) {
    if (r[1] === null) global.localStorage.removeItem(r[0]); else global.localStorage.setItem(r[0], r[1]);
  });
  G.cargar();

  var resumen = ok + " ok, " + fallas.length + " fallas";
  if (esNode) {
    fallas.forEach(function (f) { console.log("✗ " + f); });
    console.log(resumen);
    if (fallas.length) process.exitCode = 1;
  } else {
    global.resultadoTests = { ok: ok, fallas: fallas, resumen: resumen };
  }
})(typeof window !== "undefined" ? window : globalThis);
