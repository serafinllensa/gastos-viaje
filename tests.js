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
  var G = global.Gastos, CLAVE = "gastos-viaje-v1";
  var respaldo = global.localStorage.getItem(CLAVE); // no pisar datos reales en el navegador
  var ok = 0, fallas = [];

  function limpio() { global.localStorage.removeItem(CLAVE); G.cargar(); }
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
      { id: p[0], nombre: "Ana", pagado: 3000, consumido: 5500, balance: -2500 },
      { id: p[1], nombre: "Beto", pagado: 9000, consumido: 5500, balance: 3500 },
      { id: p[2], nombre: "Caro", pagado: 1500, consumido: 2500, balance: -1000 }
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
    igual(G.getEstado(), { personas: [], gastos: [] });
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

  // restaurar datos del usuario
  if (respaldo === null) global.localStorage.removeItem(CLAVE); else global.localStorage.setItem(CLAVE, respaldo);
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
