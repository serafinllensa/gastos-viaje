/* ui.js — interfaz de "Gastos del viaje" (v2, estilo iOS). Solo usa window.Gastos (app.js). */
(function () {
  "use strict";

  var G = window.Gastos;
  var $ = function (id) { return document.getElementById(id); };
  if (!G) { $("aviso-error").hidden = false; return; }

  // ---------- Utilidades ----------
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
  function tiene(fn) { return typeof G[fn] === "function"; }
  function estado() { return G.getEstado() || {}; }
  function personas() { return estado().personas || []; }
  function gastos() { return estado().gastos || []; }
  function pagos() { return estado().pagos || []; }
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
  function mostrarError(el, msg) { el.hidden = true; void el.offsetWidth; el.textContent = msg; el.hidden = false; }
  function ocultarError(el) { el.textContent = ""; el.hidden = true; }
  var toastTimer;
  function toast(msg, esError) {
    var t = $("toast");
    t.hidden = true; void t.offsetWidth;
    t.textContent = msg; t.hidden = false;
    t.classList.toggle("error-toast", !!esError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  var ICONO = {
    editar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    borrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>'
  };
  function botonIcono(tipo, dato, id, etiqueta) {
    return '<button type="button" class="icono' + (tipo === "borrar" ? " peligro" : "") + '" data-' + dato + '="' + esc(id) +
      '" aria-label="' + esc(etiqueta) + '">' + ICONO[tipo] + "</button>";
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

  // ---------- Capas: hoja y cartel ----------
  function abrirCapa(velo, panel) {
    velo.hidden = false; panel.hidden = false;
    document.body.classList.add("bloqueado");
    void panel.offsetWidth; // fuerza el reflow para que corra la transición
    velo.classList.add("visible"); panel.classList.add("visible");
  }
  function cerrarCapa(velo, panel, alTerminar) {
    velo.classList.remove("visible"); panel.classList.remove("visible");
    var listo = false;
    function fin() {
      if (listo) return; listo = true;
      // Si en el medio se volvió a abrir (ej: "+ Gasto" enseguida de guardar), este cierre viejo no hace nada.
      if (panel.classList.contains("visible")) return;
      velo.hidden = true; panel.hidden = true;
      if ($("hoja-gasto").hidden && $("alerta").hidden) document.body.classList.remove("bloqueado");
      if (alTerminar) alTerminar();
    }
    panel.addEventListener("transitionend", fin, { once: true });
    setTimeout(fin, 420); // por si no hay transición (movimiento reducido)
  }

  // Cartel estilo iOS. opciones: {titulo, texto, ok, peligro, alAceptar}
  var alertaActual = null;
  function confirmar(op) {
    alertaActual = op;
    $("alerta-titulo").textContent = op.titulo;
    $("alerta-texto").textContent = op.texto || "";
    $("alerta-texto").hidden = !op.texto;
    $("alerta-ok").textContent = op.ok || "Eliminar";
    $("alerta-ok").classList.toggle("peligro", op.peligro !== false);
    abrirCapa($("velo-alerta"), $("alerta"));
    $("alerta-cancelar").focus({ preventScroll: true });
  }
  function cerrarAlerta(aceptar) {
    var op = alertaActual; alertaActual = null;
    if (!op) return;
    cerrarCapa($("velo-alerta"), $("alerta"));
    if (aceptar && op.alAceptar) op.alAceptar();
  }
  $("alerta-cancelar").addEventListener("click", function () { cerrarAlerta(false); });
  $("alerta-ok").addEventListener("click", function () { cerrarAlerta(true); });
  $("velo-alerta").addEventListener("click", function () { cerrarAlerta(false); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (alertaActual) cerrarAlerta(false);
    else if (!$("hoja-gasto").hidden) cerrarHoja();
  });

  // ---------- Personas ----------
  var editandoPersona = null;
  $("form-persona").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var nombre = $("p-nombre").value.trim();
    var editando = editandoPersona;
    var r = intentar(function () {
      return editando ? G.editarPersona(editando, nombre) : G.agregarPersona(nombre);
    }, $("p-error"));
    if (!r.ok) return;
    toast(editando ? "Persona actualizada" : "Persona agregada");
    cancelarPersona(); render();
  });
  $("p-cancelar").addEventListener("click", cancelarPersona);
  function cancelarPersona() {
    editandoPersona = null;
    $("p-nombre").value = "";
    $("form-persona-titulo").textContent = "Agregar persona";
    $("p-submit").textContent = "Agregar";
    $("p-cancelar").hidden = true;
    ocultarError($("p-error"));
  }
  function editarPersona(id) {
    editandoPersona = id;
    $("p-nombre").value = nombreDe(id);
    $("form-persona-titulo").textContent = "Editar a " + nombreDe(id);
    $("p-submit").textContent = "Guardar";
    $("p-cancelar").hidden = false;
    irA("personas"); $("p-nombre").focus();
  }
  function borrarPersona(id) {
    var nombre = nombreDe(id);
    confirmar({
      titulo: "¿Seguro que querés eliminar a " + nombre + "?",
      texto: "Esta acción no se puede deshacer.",
      alAceptar: function () {
        if (intentar(function () { return G.borrarPersona(id); }).ok) {
          if (editandoPersona === id) cancelarPersona();
          toast(nombre + " eliminada del viaje"); render();
        }
      }
    });
  }

  // ---------- Selector propio (reemplaza la lista nativa, que en Chrome de Windows se ve genérica) ----------
  // El <select> sigue existiendo, oculto, y es el que guarda el valor: el resto del código no cambia.
  var CHEVRON = '<svg viewBox="0 0 12 16" aria-hidden="true"><path d="M3 6l3-3 3 3M3 10l3 3 3-3"/></svg>';
  var TILDE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
  var menuAbierto = null;
  function mejorarSelect(sel) {
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "selector";
    btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    sel.classList.add("select-oculto"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    sel.insertAdjacentElement("afterend", btn);
    var campo = sel.closest("label");
    if (campo) {
      btn.setAttribute("aria-label", (campo.querySelector("span") || {}).textContent || "");
      campo.addEventListener("click", function (ev) { ev.preventDefault(); if (!btn.contains(ev.target)) btn.click(); });
    }
    function actualizar() {
      var o = sel.options[sel.selectedIndex];
      btn.innerHTML = '<span class="selector-valor">' + esc(o ? o.textContent : "—") + "</span>" + CHEVRON;
      btn.disabled = !sel.options.length || (sel.options.length === 1 && !sel.options[0].value);
    }
    new MutationObserver(actualizar).observe(sel, { childList: true, subtree: true, attributes: true });
    sel.addEventListener("change", actualizar);
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (menuAbierto && menuAbierto.btn === btn) { cerrarMenu(); return; }
      abrirMenu(sel, btn);
    });
    btn.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); abrirMenu(sel, btn); }
    });
    actualizar();
    return actualizar;
  }
  function abrirMenu(sel, btn) {
    cerrarMenu(true);
    var menu = document.createElement("div");
    menu.className = "menu-opciones"; menu.setAttribute("role", "listbox");
    Array.prototype.forEach.call(sel.options, function (o, i) {
      if (!o.value && sel.options.length > 1) return;
      var it = document.createElement("button");
      it.type = "button"; it.className = "opcion"; it.setAttribute("role", "option");
      var marcada = i === sel.selectedIndex;
      it.setAttribute("aria-selected", marcada);
      it.innerHTML = '<span class="opcion-tilde">' + (marcada ? TILDE : "") + "</span><span>" + esc(o.textContent) + "</span>";
      it.addEventListener("click", function (ev) {
        ev.stopPropagation();
        sel.selectedIndex = i; sel.dispatchEvent(new Event("change", { bubbles: true }));
        cerrarMenu();
        btn.focus({ preventScroll: true });
      });
      menu.appendChild(it);
    });
    document.body.appendChild(menu);
    // Se ubica pegado al selector, abajo o arriba según el lugar que haya.
    var r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = (window.visualViewport || {}).height || window.innerHeight;
    var ancho = Math.min(Math.max(220, Math.min(r.width * 0.7, 280)), vw - 24);
    menu.style.width = ancho + "px";
    menu.style.left = Math.max(12, Math.min(r.right - ancho, vw - ancho - 12)) + "px";
    var lugarAbajo = vh - r.bottom - 18, lugarArriba = r.top - 18, natural = menu.scrollHeight;
    var abajo = lugarAbajo >= natural || lugarAbajo >= lugarArriba;
    var alto = Math.max(120, Math.min(natural, abajo ? lugarAbajo : lugarArriba)); // si no entra, scrollea adentro
    menu.style.maxHeight = alto + "px";
    menu.style.top = (abajo ? r.bottom + 6 : r.top - alto - 6) + "px";
    menu.style.transformOrigin = (abajo ? "top" : "bottom") + " right";
    btn.setAttribute("aria-expanded", "true");
    menuAbierto = { menu: menu, btn: btn };
    void menu.offsetWidth; menu.classList.add("visible");
    var actual = menu.querySelector('[aria-selected="true"]') || menu.firstChild;
    if (actual) { actual.scrollIntoView({ block: "nearest" }); actual.focus({ preventScroll: true }); }
  }
  function cerrarMenu(sinAnimar) {
    if (!menuAbierto) return;
    var m = menuAbierto.menu; menuAbierto.btn.setAttribute("aria-expanded", "false"); menuAbierto = null;
    if (sinAnimar) { m.remove(); return; }
    m.classList.remove("visible");
    setTimeout(function () { m.remove(); }, 160);
  }
  // Tocar afuera solo cierra el menú (como en iOS): ese mismo toque no llega a lo de abajo,
  // así no se cierra la hoja ni se aprieta otro botón sin querer.
  var tragarClick = 0;
  document.addEventListener("pointerdown", function (ev) {
    if (menuAbierto && !menuAbierto.menu.contains(ev.target) && !menuAbierto.btn.contains(ev.target)) {
      cerrarMenu(); tragarClick = Date.now();
    }
  }, true);
  document.addEventListener("click", function (ev) {
    if (tragarClick && Date.now() - tragarClick < 600) { ev.stopPropagation(); ev.preventDefault(); }
    tragarClick = 0;
  }, true);
  document.addEventListener("keydown", function (ev) {
    if (!menuAbierto) return;
    var items = Array.prototype.slice.call(menuAbierto.menu.querySelectorAll(".opcion"));
    var i = items.indexOf(document.activeElement);
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); var b = menuAbierto.btn; cerrarMenu(); b.focus(); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if (ev.key === "Tab") cerrarMenu();
  }, true);
  window.addEventListener("resize", function () { cerrarMenu(true); });
  document.querySelector(".hoja-cuerpo").addEventListener("scroll", function () { cerrarMenu(true); }, { passive: true });
  mejorarSelect($("g-categoria"));
  mejorarSelect($("g-pagopor"));

  // ---------- Gastos (en una hoja) ----------
  var editandoGasto = null;
  $("btn-nuevo-gasto").addEventListener("click", function () { abrirHoja(null); });
  $("g-cancelar").addEventListener("click", cerrarHoja);
  $("velo-hoja").addEventListener("click", cerrarHoja);
  function abrirHoja(g) {
    editandoGasto = g ? g.id : null;
    $("form-gasto").reset();
    ocultarError($("g-error"));
    renderFormGasto(g);
    $("g-descripcion").value = g ? g.descripcion : "";
    $("g-monto").value = g ? fmt.format(g.monto) : "";
    $("form-gasto-titulo").textContent = g ? "Editar gasto" : "Nuevo gasto";
    $("g-submit").textContent = g ? "Guardar" : "Agregar";
    abrirCapa($("velo-hoja"), $("hoja-gasto"));
    if (!personas().length) return;
    // En iPhone el teclado solo abre si el focus ocurre dentro del toque, por eso va sin demora.
    if (!g) $("g-descripcion").focus({ preventScroll: true });
  }
  function cerrarHoja() {
    cerrarMenu(true);
    if (document.activeElement) document.activeElement.blur();
    cerrarCapa($("velo-hoja"), $("hoja-gasto"), function () { editandoGasto = null; });
  }
  $("form-gasto").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var datos = leerFormGasto();
    var editando = editandoGasto;
    var r = intentar(function () {
      return editando ? G.editarGasto(editando, datos) : G.agregarGasto(datos);
    }, $("g-error"));
    if (!r.ok) {
      // Que el error quede a la vista aunque el teclado del iPhone tape la parte de abajo.
      $("g-error").scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    toast(editando ? "Gasto actualizado" : "Gasto agregado");
    cerrarHoja(); render();
  });
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
  function editarGasto(id) {
    var g = gastos().find(function (x) { return x.id === id; });
    if (g) abrirHoja(g);
  }
  function borrarGasto(id) {
    var g = gastos().find(function (x) { return x.id === id; });
    confirmar({
      titulo: "¿Seguro que querés eliminar " + (g ? "“" + g.descripcion + "”" : "este gasto") + "?",
      texto: g ? plata(g.monto) + " · pagó " + nombreDe(g.pagoPor) : "",
      alAceptar: function () {
        if (intentar(function () { return G.borrarGasto(id); }).ok) { toast("Gasto eliminado"); render(); }
      }
    });
  }

  // ---------- Pagos ----------
  function marcarPagada(de, a, monto) {
    confirmar({
      titulo: "¿Marcar como pagada?",
      texto: nombreDe(de) + " le pagó " + plata(monto) + " a " + nombreDe(a) + ".",
      ok: "Marcar", peligro: false,
      alAceptar: function () {
        if (intentar(function () { return G.registrarPago(de, a, monto); }).ok) { toast("Deuda saldada"); render(); }
      }
    });
  }
  function borrarPago(id) {
    var p = pagos().find(function (x) { return x.id === id; });
    confirmar({
      titulo: "¿Seguro que querés eliminar este pago?",
      texto: p ? nombreDe(p.de) + " → " + nombreDe(p.a) + " · " + plata(p.monto) + ". La deuda vuelve a aparecer." : "",
      alAceptar: function () {
        if (intentar(function () { return G.borrarPago(id); }).ok) { toast("Pago eliminado"); render(); }
      }
    });
  }

  // ---------- Guardar y cargar el viaje ----------
  $("btn-guardar-viaje").addEventListener("click", function () {
    var r = intentar(function () { return G.exportarViaje(); });
    if (!r.ok) return;
    var hoy = new Date();
    var nombre = tiene("nombreArchivoViaje") ? G.nombreArchivoViaje() : "gastos-viaje-" + hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" +
      String(hoy.getDate()).padStart(2, "0") + ".json";
    var archivo;
    try { archivo = new File([r.valor], nombre, { type: "application/json" }); } catch (e) { archivo = null; }
    if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      navigator.share({ files: [archivo], title: "Gastos del viaje" })
        .then(function () { toast("Viaje guardado"); })
        .catch(function (e) { if (!e || e.name !== "AbortError") descargar(r.valor, nombre); });
    } else {
      descargar(r.valor, nombre);
    }
  });
  function descargar(texto, nombre) {
    var url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast("Viaje guardado en Descargas");
  }
  $("btn-cargar-viaje").addEventListener("click", function () { $("input-archivo").value = ""; $("input-archivo").click(); });
  $("input-archivo").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var lector = new FileReader();
    lector.onload = function () {
      var texto = String(lector.result || "");
      var error = prevalidar(texto);
      if (error) { toast(error, true); return; }
      var hayDatos = personas().length || gastos().length;
      var cargar = function () {
        var r = intentar(function () { return G.importarViaje(texto); });
        if (r.ok) {
          var c = r.valor || {};
          var cant = function (n, uno, varios) { return n + " " + (n === 1 ? uno : varios); };
          cancelarPersona(); render(); irA("gastos");
          toast(typeof c.personas === "number"
            ? "Se cargaron " + cant(c.personas, "persona", "personas") + " y " + cant(c.gastos || 0, "gasto", "gastos")
            : "Viaje cargado");
        }
      };
      if (!hayDatos) return cargar();
      confirmar({
        titulo: "¿Reemplazar el viaje actual?",
        texto: "Se cambian todos los datos de este celular por los de “" + f.name + "”. Si querés, guardá antes el viaje actual.",
        ok: "Reemplazar", alAceptar: cargar
      });
    };
    lector.onerror = function () { toast("No se pudo leer el archivo", true); };
    lector.readAsText(f);
  });

  // Revisa el archivo ANTES de preguntar si se reemplaza el viaje. Si app.js expone validarViaje, usa esa
  // validación completa; si no, chequea lo básico. importarViaje igual vuelve a validar todo y no toca nada si falla.
  function prevalidar(texto) {
    if (tiene("validarViaje")) {
      try { G.validarViaje(texto); return null; } catch (e) { return (e && e.message) || "El archivo no es válido."; }
    }
    var d;
    try { d = JSON.parse(texto); } catch (e) { return "Ese archivo no es un viaje guardado de esta app."; }
    if (!d || typeof d !== "object" || !Array.isArray(d.personas) || !Array.isArray(d.gastos)) {
      return "Ese archivo no es un viaje guardado de esta app.";
    }
    return null;
  }

  // ---------- Render ----------
  function renderFormGasto(g) {
    var ps = personas();
    var cat = $("g-categoria"), pago = $("g-pagopor"), entre = $("g-entre");
    var catSel = g ? g.categoria : G.CATEGORIAS[0];
    var pagoSel = g ? g.pagoPor : (ps[0] && ps[0].id);
    var entreSel = g ? g.entre : null;

    cat.innerHTML = G.CATEGORIAS.map(function (c) {
      return "<option" + (c === catSel ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");
    pago.innerHTML = ps.length
      ? ps.map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (p.id === pagoSel ? " selected" : "") + ">" + esc(p.nombre) + "</option>";
        }).join("")
      : '<option value="">Sin personas</option>';
    entre.innerHTML = ps.length
      ? ps.map(function (p) {
          var on = entreSel ? entreSel.indexOf(p.id) !== -1 : true;
          return '<label class="chip"><input type="checkbox" value="' + esc(p.id) + '"' + (on ? " checked" : "") +
            "><span>" + esc(p.nombre) + "</span></label>";
        }).join("")
      : "";
    $("g-submit").disabled = !ps.length;
    if (!ps.length) mostrarError($("g-error"), "Primero agregá a la gente del viaje en la pestaña Personas.");
  }

  function renderGastos() {
    var gs = gastos().slice().reverse();
    var n = personas().length;
    $("lista-gastos").innerHTML = gs.length
      ? gs.map(function (g) {
          var entre = (g.entre || []).length === n ? "todos" : (g.entre || []).map(nombreDe).join(", ");
          return '<li><div class="info"><div class="titulo">' + esc(g.descripcion) + "</div>" +
            '<div class="sub"><span class="tag">' + esc(g.categoria) + "</span>Pagó " + esc(nombreDe(g.pagoPor)) +
            " · entre " + esc(entre) + "</div></div>" +
            '<div class="monto">' + plata(g.monto) + "</div>" +
            '<div class="botones">' + botonIcono("editar", "editar-gasto", g.id, "Editar") +
            botonIcono("borrar", "borrar-gasto", g.id, "Eliminar") + "</div></li>";
        }).join("")
      : '<li class="vacio">' + (n ? "Todavía no hay gastos. Tocá “+ Gasto” para cargar el primero." :
          "Empezá agregando a la gente del viaje en Personas.") + "</li>";
  }

  function totales() {
    var r = intentar(function () { return G.totalesPorPersona() || []; });
    return r.ok ? r.valor : [];
  }

  function renderPersonas() {
    var ps = personas(), tot = {};
    totales().forEach(function (t) { tot[t.id] = t; });
    $("lista-personas").innerHTML = ps.length
      ? ps.map(function (p) {
          var t = tot[p.id];
          return '<li><div class="info"><div class="titulo">' + esc(p.nombre) + "</div>" +
            (t ? '<div class="sub">Pagó ' + plata(t.pagado) + " · consumió " + plata(t.consumido) + "</div>" : "") + "</div>" +
            '<div class="botones">' + botonIcono("editar", "editar-persona", p.id, "Editar") +
            botonIcono("borrar", "borrar-persona", p.id, "Eliminar") + "</div></li>";
        }).join("")
      : '<li class="vacio">Agregá a la gente del viaje.</li>';
  }

  function renderDeudas() {
    var r = intentar(function () { return G.calcularDeudas(); });
    var ds = r.ok ? r.valor || [] : [];
    var puedePagar = tiene("registrarPago");
    $("lista-deudas").innerHTML = ds.length
      ? ds.map(function (d) {
          return '<li><div class="info"><div class="titulo">' + esc(nombreDe(d.de)) +
            '<span class="flecha">→</span>' + esc(nombreDe(d.a)) + "</div></div>" +
            '<div class="monto">' + plata(d.monto) + "</div>" +
            (puedePagar ? '<button type="button" class="btn-chip" data-pagar-de="' + esc(d.de) + '" data-pagar-a="' + esc(d.a) +
              '" data-pagar-monto="' + esc(d.monto) + '">Pagada</button>' : "") + "</li>";
        }).join("")
      : '<li class="vacio">' + (gastos().length ? "¡Están todos a mano! 🎉" : "Cargá gastos para ver las deudas.") + "</li>";

    var texto = "";
    intentar(function () { texto = G.textoWhatsApp() || ""; });
    var wa = $("btn-whatsapp");
    wa.href = "https://wa.me/?text=" + encodeURIComponent(texto);
    wa.setAttribute("aria-disabled", gastos().length ? "false" : "true");
    $("btn-copiar").disabled = !gastos().length;
    $("btn-copiar").dataset.texto = texto;

    var ps = tiene("borrarPago") ? pagos() : [];
    $("bloque-pagos").hidden = !ps.length;
    $("lista-pagos").innerHTML = ps.slice().reverse().map(function (p) {
      return '<li><div class="info"><div class="titulo">' + esc(nombreDe(p.de)) + '<span class="flecha">→</span>' +
        esc(nombreDe(p.a)) + '</div><div class="sub pos">Pagado</div></div>' +
        '<div class="monto">' + plata(p.monto) + "</div>" +
        '<div class="botones">' + botonIcono("borrar", "borrar-pago", p.id, "Eliminar pago") + "</div></li>";
    }).join("");

    var ts = totales();
    $("lista-balance").innerHTML = ts.length
      ? ts.map(function (t) {
          var cls = t.balance > 0 ? "pos" : t.balance < 0 ? "neg" : "";
          return '<li><div class="info"><div class="titulo">' + esc(t.nombre) + '</div><div class="sub">Pagó ' +
            plata(t.pagado) + " · consumió " + plata(t.consumido) + '</div></div><div class="monto ' + cls + '">' +
            (t.balance > 0 ? "+" : "") + plata(t.balance) + "</div></li>";
        }).join("")
      : '<li class="vacio">Sin personas todavía.</li>';
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
          return '<li><div class="barra-top"><span>' + esc(c.categoria) + '<span class="sub">' + esc(pct) + "%</span></span><strong>" +
            plata(c.total) + '</strong></div><div class="barra"><div style="width:' + (c.total / max) * 100 + '%"></div></div></li>';
        }).join("")
      : '<li class="vacio">Todavía no hay gastos.</li>';
    $("total-viaje").textContent = plata(total);
    $("bloque-respaldo").hidden = !(tiene("exportarViaje") && tiene("importarViaje"));
  }

  function render() { renderGastos(); renderPersonas(); renderDeudas(); renderResumen(); }

  // ---------- Clicks en las listas ----------
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    var d = b.dataset;
    if (d.editarGasto) editarGasto(d.editarGasto);
    else if (d.borrarGasto) borrarGasto(d.borrarGasto);
    else if (d.editarPersona) editarPersona(d.editarPersona);
    else if (d.borrarPersona) borrarPersona(d.borrarPersona);
    else if (d.borrarPago) borrarPago(d.borrarPago);
    else if (d.pagarDe) marcarPagada(d.pagarDe, d.pagarA, Number(d.pagarMonto));
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

  // ---------- Instalable / sin internet ----------
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // ---------- Arranque ---------- (app.js ya llama a cargar() y guarda solo en cada cambio)
  render();
})();
