/* ui.js — interfaz de "Gastos del viaje". Solo usa window.Gastos (app.js). */
(function () {
  "use strict";

  // ---------- Modo maqueta (solo si app.js todavía no existe) ----------
  // Datos fijos de ejemplo: no se calcula nada acá, los resultados están escritos a mano.
  var demo = !window.Gastos;
  var G = window.Gastos || crearMaqueta();

  function crearMaqueta() {
    var estado = {
      personas: [{ id: "p1", nombre: "Juli" }, { id: "p2", nombre: "Tomi" }, { id: "p3", nombre: "Caro" }],
      gastos: [
        { id: "g1", descripcion: "Nafta ida", monto: 30000, categoria: "Nafta", pagoPor: "p1", entre: ["p1", "p2", "p3"] },
        { id: "g2", descripcion: "Cabaña 2 noches", monto: 90000, categoria: "Alojamiento", pagoPor: "p2", entre: ["p1", "p2", "p3"] },
        { id: "g3", descripcion: "Asado", monto: 24000, categoria: "Comida", pagoPor: "p3", entre: ["p1", "p2", "p3"] }
      ]
    };
    var noDisponible = function () { throw new Error("Modo maqueta: falta app.js para guardar cambios."); };
    return {
      CATEGORIAS: ["Comida", "Súper", "Nafta", "Alojamiento", "Salidas", "Otros"],
      cargar: function () {}, guardar: function () {},
      getEstado: function () { return estado; },
      agregarPersona: noDisponible, editarPersona: noDisponible, borrarPersona: noDisponible,
      agregarGasto: noDisponible, editarGasto: noDisponible, borrarGasto: noDisponible,
      calcularDeudas: function () { return [{ de: "p1", a: "p2", monto: 18000 }, { de: "p3", a: "p2", monto: 24000 }]; },
      resumenPorCategoria: function () {
        return [{ categoria: "Alojamiento", total: 90000 }, { categoria: "Nafta", total: 30000 }, { categoria: "Comida", total: 24000 }];
      },
      totalesPorPersona: function () {
        return [
          { id: "p1", nombre: "Juli", pagado: 30000, consumido: 48000, balance: -18000 },
          { id: "p2", nombre: "Tomi", pagado: 90000, consumido: 48000, balance: 42000 },
          { id: "p3", nombre: "Caro", pagado: 24000, consumido: 48000, balance: -24000 }
        ];
      },
      totalViaje: function () { return 144000; },
      textoWhatsApp: function () { return "💸 Gastos del viaje\nJuli le paga $18.000 a Tomi\nCaro le paga $24.000 a Tomi"; }
    };
  }

  // ---------- Utilidades ----------
  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  function plata(n) {
    n = Number(n) || 0;
    if (typeof G.formatoPesos === "function") return G.formatoPesos(n);
    return (n < 0 ? "-$" : "$") + fmt.format(Math.abs(n));
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function personas() { return G.getEstado().personas || []; }
  function gastos() { return G.getEstado().gastos || []; }
  function nombreDe(id) {
    var p = personas().find(function (x) { return x.id === id; });
    return p ? p.nombre : (id == null ? "?" : String(id));
  }
  function intentar(fn, errorEl) {
    try { var r = fn(); if (errorEl) ocultarError(errorEl); return { ok: true, valor: r }; }
    catch (e) {
      var msg = (e && e.message) || "Algo salió mal.";
      if (errorEl) mostrarError(errorEl, msg); else toast(msg, true);
      return { ok: false };
    }
  }
  function mostrarError(el, msg) { el.textContent = msg; el.hidden = false; }
  function ocultarError(el) { el.textContent = ""; el.hidden = true; }
  var toastTimer;
  function toast(msg, esError) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    t.classList.toggle("error-toast", !!esError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---------- Pestañas ----------
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () { irA(b.dataset.tab); });
  });
  function irA(tab) {
    document.querySelectorAll(".tabs button").forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle("activa", on); b.setAttribute("aria-selected", on);
    });
    document.querySelectorAll(".tab").forEach(function (s) { s.classList.toggle("activa", s.id === "tab-" + tab); });
    window.scrollTo(0, 0);
  }

  // ---------- Personas ----------
  var editandoPersona = null;
  $("form-persona").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nombre = $("p-nombre").value.trim();
    var r = intentar(function () {
      return editandoPersona ? G.editarPersona(editandoPersona, nombre) : G.agregarPersona(nombre);
    }, $("p-error"));
    if (!r.ok) return;
    toast(editandoPersona ? "Persona actualizada" : "Persona agregada");
    cancelarPersona(); render();
    $("p-nombre").focus();
  });
  $("p-cancelar").addEventListener("click", cancelarPersona);
  function cancelarPersona() {
    editandoPersona = null;
    $("p-nombre").value = "";
    $("form-persona-titulo").textContent = "Agregar persona";
    $("p-submit").textContent = "Agregar";
    $("p-cancelar").hidden = true;
    $("form-persona").classList.remove("editando");
    ocultarError($("p-error"));
  }
  function editarPersona(id) {
    editandoPersona = id;
    $("p-nombre").value = nombreDe(id);
    $("form-persona-titulo").textContent = "Editar persona";
    $("p-submit").textContent = "Guardar";
    $("p-cancelar").hidden = false;
    $("form-persona").classList.add("editando");
    irA("personas"); $("p-nombre").focus();
  }
  function borrarPersona(id, btn) {
    if (!pedirSegundoToque(btn)) return;
    if (intentar(function () { return G.borrarPersona(id); }).ok) {
      if (editandoPersona === id) cancelarPersona();
      toast("Persona borrada"); render();
    }
  }

  // ---------- Gastos ----------
  var editandoGasto = null;
  $("form-gasto").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var datos = leerFormGasto();
    var r = intentar(function () {
      return editandoGasto ? G.editarGasto(editandoGasto, datos) : G.agregarGasto(datos);
    }, $("g-error"));
    if (!r.ok) return;
    toast(editandoGasto ? "Gasto actualizado" : "Gasto agregado");
    cancelarGasto(); render();
  });
  $("g-cancelar").addEventListener("click", cancelarGasto);
  $("g-todos").addEventListener("click", function () {
    var cajas = $("g-entre").querySelectorAll("input");
    var todas = Array.prototype.every.call(cajas, function (c) { return c.checked; });
    cajas.forEach(function (c) { c.checked = !todas; });
  });
  function leerFormGasto() {
    return {
      descripcion: $("g-descripcion").value.trim(),
      monto: $("g-monto").value, // texto tal cual: app.js lo lee con parsearMonto
      categoria: $("g-categoria").value,
      pagoPor: $("g-pagopor").value,
      entre: Array.prototype.map.call($("g-entre").querySelectorAll("input:checked"), function (c) { return c.value; })
    };
  }
  function cancelarGasto() {
    editandoGasto = null;
    $("form-gasto").reset();
    $("form-gasto-titulo").textContent = "Nuevo gasto";
    $("g-submit").textContent = "Agregar gasto";
    $("g-cancelar").hidden = true;
    $("form-gasto").classList.remove("editando");
    ocultarError($("g-error"));
    renderFormGasto();
  }
  function editarGasto(id) {
    var g = gastos().find(function (x) { return x.id === id; });
    if (!g) return;
    editandoGasto = id;
    renderFormGasto(g);
    $("g-descripcion").value = g.descripcion;
    $("g-monto").value = fmt.format(g.monto);
    $("form-gasto-titulo").textContent = "Editar gasto";
    $("g-submit").textContent = "Guardar cambios";
    $("g-cancelar").hidden = false;
    $("form-gasto").classList.add("editando");
    irA("gastos"); $("g-descripcion").focus();
  }
  function borrarGasto(id, btn) {
    var g = gastos().find(function (x) { return x.id === id; });
    if (!pedirSegundoToque(btn)) return;
    if (intentar(function () { return G.borrarGasto(id); }).ok) {
      if (editandoGasto === id) cancelarGasto();
      toast("Gasto borrado"); render();
    }
  }

  // ---------- Render ----------
  function renderFormGasto(g) {
    var ps = personas();
    var cat = $("g-categoria"), pago = $("g-pagopor"), entre = $("g-entre");
    var catSel = g ? g.categoria : (cat.value || G.CATEGORIAS[0]);
    var pagoSel = g ? g.pagoPor : pago.value;
    var entreSel = g ? g.entre : null;

    cat.innerHTML = G.CATEGORIAS.map(function (c) {
      return '<option' + (c === catSel ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");

    pago.innerHTML = ps.length
      ? ps.map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (p.id === pagoSel ? " selected" : "") + ">" + esc(p.nombre) + "</option>";
        }).join("")
      : '<option value="">Primero agregá personas</option>';

    entre.innerHTML = ps.length
      ? ps.map(function (p) {
          var on = entreSel ? entreSel.indexOf(p.id) !== -1 : true;
          return '<label class="chip"><input type="checkbox" value="' + esc(p.id) + '"' + (on ? " checked" : "") +
            "><span>" + esc(p.nombre) + "</span></label>";
        }).join("")
      : '<p class="vacio">Agregá personas en la pestaña Personas.</p>';
    $("g-submit").disabled = !ps.length;
  }

  function renderGastos() {
    var gs = gastos().slice().reverse();
    $("lista-gastos").innerHTML = gs.length
      ? gs.map(function (g) {
          var entre = (g.entre || []).length === personas().length ? "todos" : (g.entre || []).map(nombreDe).join(", ");
          return "<li><div class=\"info\"><div class=\"titulo\">" + esc(g.descripcion) + "</div>" +
            '<div class="sub"><span class="tag">' + esc(g.categoria) + "</span>Pagó " + esc(nombreDe(g.pagoPor)) +
            " · entre " + esc(entre) + "</div></div>" +
            '<div class="monto">' + plata(g.monto) + "</div>" +
            '<div class="botones"><button class="btn chico" data-editar-gasto="' + esc(g.id) + '" aria-label="Editar">✏️</button>' +
            '<button class="btn chico peligro" data-borrar-gasto="' + esc(g.id) + '" aria-label="Borrar">🗑️</button></div></li>';
        }).join("")
      : '<li class="vacio">Todavía no hay gastos.</li>';
  }

  function renderPersonas() {
    var ps = personas();
    var tot = {};
    intentar(function () { G.totalesPorPersona().forEach(function (t) { tot[t.id] = t; }); });
    $("lista-personas").innerHTML = ps.length
      ? ps.map(function (p) {
          var t = tot[p.id];
          return '<li><div class="info"><div class="titulo">' + esc(p.nombre) + "</div>" +
            (t ? '<div class="sub">Pagó ' + plata(t.pagado) + " · consumió " + plata(t.consumido) + "</div>" : "") + "</div>" +
            '<div class="botones"><button class="btn chico" data-editar-persona="' + esc(p.id) + '" aria-label="Editar">✏️</button>' +
            '<button class="btn chico peligro" data-borrar-persona="' + esc(p.id) + '" aria-label="Borrar">🗑️</button></div></li>';
        }).join("")
      : '<li class="vacio">Agregá a la gente del viaje.</li>';
  }

  function renderDeudas() {
    var r = intentar(function () { return G.calcularDeudas(); });
    var ds = r.ok ? r.valor || [] : [];
    $("lista-deudas").innerHTML = ds.length
      ? ds.map(function (d) {
          return '<li><div class="info"><div class="titulo">' + esc(nombreDe(d.de)) +
            ' <span class="flecha">→</span> ' + esc(nombreDe(d.a)) + "</div></div>" +
            '<div class="monto">' + plata(d.monto) + "</div></li>";
        }).join("")
      : '<li class="vacio">' + (gastos().length ? "¡Están todos a mano! 🎉" : "Cargá gastos para ver las deudas.") + "</li>";

    var texto = "";
    intentar(function () { texto = G.textoWhatsApp() || ""; });
    var wa = $("btn-whatsapp");
    wa.href = "https://wa.me/?text=" + encodeURIComponent(texto);
    wa.setAttribute("aria-disabled", ds.length ? "false" : "true");
    $("btn-copiar").disabled = !ds.length;
    $("btn-copiar").dataset.texto = texto;

    var ts = [];
    intentar(function () { ts = G.totalesPorPersona() || []; });
    $("tabla-personas").innerHTML = ts.length
      ? ts.map(function (t) {
          var cls = t.balance > 0 ? "pos" : t.balance < 0 ? "neg" : "";
          return "<tr><td>" + esc(t.nombre) + "</td><td>" + plata(t.pagado) + "</td><td>" + plata(t.consumido) +
            '</td><td class="' + cls + '">' + (t.balance > 0 ? "+" : "") + plata(t.balance) + "</td></tr>";
        }).join("")
      : '<tr><td colspan="4" class="vacio">Sin personas todavía.</td></tr>';
  }

  function renderResumen() {
    var cs = [];
    intentar(function () { cs = (G.resumenPorCategoria() || []).filter(function (c) { return c.total > 0; }); });
    var max = cs.reduce(function (m, c) { return Math.max(m, c.total); }, 0) || 1;
    var total = 0;
    intentar(function () { total = G.totalViaje() || 0; });
    $("lista-categorias").innerHTML = cs.length
      ? cs.map(function (c) {
          var exacto = total ? (c.total / total) * 100 : 0;
          var pct = exacto > 0 && exacto < 1 ? "<1" : String(Math.round(exacto));
          return '<li><div class="barra-top"><span>' + esc(c.categoria) + ' <span class="sub">' + esc(pct) + "%</span></span><strong>" +
            plata(c.total) + '</strong></div><div class="barra"><div style="width:' + (c.total / max) * 100 + '%"></div></div></li>';
        }).join("")
      : '<li class="vacio">Todavía no hay gastos.</li>';
    $("total-viaje").textContent = plata(total);
  }

  function render() {
    if (!editandoGasto) renderFormGasto();
    renderGastos(); renderPersonas(); renderDeudas(); renderResumen();
  }

  // ---------- Confirmación propia para borrar (el cartel nativo del navegador lo bloquean WhatsApp/Instagram en iPhone) ----------
  // Primer toque: el botón pasa a "¿Seguro?". Segundo toque dentro de 3 s: borra. Si no, vuelve a la normalidad.
  var armado = null; // { btn, timer }
  function desarmar() {
    if (!armado) return;
    clearTimeout(armado.timer);
    armado.btn.textContent = "🗑️";
    armado.btn.classList.remove("seguro");
    armado.btn.setAttribute("aria-label", "Borrar");
    armado = null;
  }
  function pedirSegundoToque(btn) {
    if (armado && armado.btn === btn) { desarmar(); return true; }
    desarmar();
    btn.textContent = "¿Seguro?";
    btn.classList.add("seguro");
    btn.setAttribute("aria-label", "Tocá de nuevo para borrar");
    armado = { btn: btn, timer: setTimeout(desarmar, 3000) };
    return false;
  }

  // Tocar afuera cancela. Safari de iPhone no manda click en zonas vacías, por eso pointerdown.
  // Se ignora si cae sobre un botón 🗑️: ahí decide el click (segundo toque borra, otro botón se re-arma).
  document.addEventListener("pointerdown", function (ev) {
    if (!armado) return;
    if (ev.target.closest("button[data-borrar-gasto],button[data-borrar-persona]")) return;
    desarmar();
  });

  // ---------- Delegación de clicks en listas ----------
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-editar-gasto],button[data-borrar-gasto],button[data-editar-persona],button[data-borrar-persona]");
    if (!b) { desarmar(); return; }
    if (!b.dataset.borrarGasto && !b.dataset.borrarPersona) desarmar();
    if (b.dataset.editarGasto) editarGasto(b.dataset.editarGasto);
    else if (b.dataset.borrarGasto) borrarGasto(b.dataset.borrarGasto, b);
    else if (b.dataset.editarPersona) editarPersona(b.dataset.editarPersona);
    else if (b.dataset.borrarPersona) borrarPersona(b.dataset.borrarPersona, b);
  });

  $("btn-copiar").addEventListener("click", function () {
    var texto = this.dataset.texto || "";
    var ok = function () { toast("Texto copiado"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(ok, function () { copiarViejo(texto) ? ok() : toast("No se pudo copiar", true); });
    } else { copiarViejo(texto) ? ok() : toast("No se pudo copiar", true); }
  });
  function copiarViejo(texto) {
    var ta = document.createElement("textarea");
    ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta); return ok;
  }

  // ---------- Arranque ----------
  if (demo) $("aviso-demo").hidden = false;
  // app.js ya llama a cargar() al cargarse y guarda solo en cada cambio.
  render();
})();
