/* TRICIAS BEAUTY CONNER – public website logic */
(function () {
  "use strict";

  var cfg = window.TBC_CONFIG || {};
  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf("PASTE_") !== 0 &&
                   cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0 &&
                   window.supabase;
  var db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- Small UI bits ----------
  $("#year").textContent = new Date().getFullYear();

  var toggle = $(".nav-toggle"), nav = $("#nav");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
  $$("#nav a").forEach(function (a) {
    a.addEventListener("click", function () {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  // ---------- BOOK THIS STYLE -> preselect the service ----------
  var serviceSelect = $("#service");
  $$(".book-style").forEach(function (btn) {
    btn.addEventListener("click", function () {
      serviceSelect.value = btn.getAttribute("data-service");
      $("#booking").scrollIntoView({ behavior: "smooth" });
      setTimeout(function () { $("#name").focus({ preventScroll: true }); }, 700);
    });
  });

  // ---------- Date + availability ----------
  var dateInput = $("#date"), slotsBox = $("#slots");

  function isoLocal(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  var today = new Date();
  dateInput.min = isoLocal(today);
  var maxD = new Date(); maxD.setDate(maxD.getDate() + 60);
  dateInput.max = isoLocal(maxD);

  function slotsMessage(text) {
    slotsBox.innerHTML = "";
    var p = document.createElement("p");
    p.className = "slots-note"; p.textContent = text;
    slotsBox.appendChild(p);
  }

  var slotRequest = 0;
  function loadSlots() {
    var date = dateInput.value;
    if (!date) { slotsMessage("Select a date to see available times."); return; }
    if (!db) { slotsMessage("The booking system is being set up. Please message us on WhatsApp to book."); return; }

    var mine = ++slotRequest;
    slotsMessage("Checking availability…");
    db.rpc("get_available_slots", { p_date: date }).then(function (res) {
      if (mine !== slotRequest) return; // a newer date was picked meanwhile
      if (res.error) { slotsMessage("We could not load times. Please try again."); return; }
      var rows = res.data || [];
      if (!rows.length) { slotsMessage("No times available on this date. Please choose another day."); return; }
      slotsBox.innerHTML = "";
      rows.forEach(function (r, i) {
        var t = String(r.slot).slice(0, 5);
        var label = document.createElement("label");
        label.className = "slot";
        var input = document.createElement("input");
        input.type = "radio"; input.name = "time"; input.value = t; input.required = true;
        if (i === 0) input.setAttribute("aria-required", "true");
        var span = document.createElement("span"); span.textContent = t;
        label.appendChild(input); label.appendChild(span);
        slotsBox.appendChild(label);
      });
    });
  }
  dateInput.addEventListener("change", loadSlots);

  // ---------- Helpers ----------
  function normalizePhone(raw) {
    var digits = String(raw).replace(/[^\d+]/g, "");
    var plus = digits.charAt(0) === "+";
    digits = digits.replace(/\+/g, "");
    if (!plus && digits.indexOf("00") === 0) digits = digits.slice(2);
    else if (!plus && digits.length === 9 && /^[679]/.test(digits)) digits = "34" + digits; // Spanish numbers
    return digits;
  }
  function prettyDate(iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function waLink(text) {
    return "https://wa.me/" + cfg.WHATSAPP_NUMBER + "?text=" + encodeURIComponent(text);
  }

  // ---------- Submit ----------
  var form = $("#booking-form"), msg = $("#form-message"), btn = $("#submit-btn");
  function showError(t) { msg.textContent = t; msg.hidden = false; msg.scrollIntoView({ block: "nearest", behavior: "smooth" }); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.hidden = true;
    if (form.elements["website"].value) return; // bot

    var name = form.elements["name"].value.trim();
    var phone = normalizePhone(form.elements["whatsapp"].value);
    var service = form.elements["service"].value;
    var date = form.elements["date"].value;
    var timeEl = form.querySelector('input[name="time"]:checked');
    var notes = form.elements["notes"].value.trim();

    if (name.length < 2) return showError("Please enter your full name.");
    if (phone.length < 9 || phone.length > 15) return showError("Please enter a valid WhatsApp number, including your country code (for example +34 600 000 000).");
    if (!service) return showError("Please choose a hairstyle.");
    if (!date) return showError("Please choose a date.");
    if (!timeEl) return showError("Please choose an available time.");
    if (!db) return showError("The booking system is not available yet. Please contact us directly on WhatsApp.");

    btn.disabled = true;
    var time = timeEl.value;

    db.rpc("request_booking", {
      p_name: name, p_whatsapp: "+" + phone, p_service: service,
      p_date: date, p_time: time, p_notes: notes || null
    }).then(function (res) {
      btn.disabled = false;
      if (res.error) {
        if (String(res.error.message).indexOf("SLOT_UNAVAILABLE") !== -1) {
          showError("Sorry, that time has just been taken. Please choose another time.");
          loadSlots();
        } else {
          showError("Something went wrong saving your request. Please try again.");
        }
        return;
      }

      var text = "Hello Tricias Beauty Conner! I would like to book an appointment.\n\n" +
        "Name: " + name + "\n" +
        "WhatsApp: +" + phone + "\n" +
        "Service: " + service + "\n" +
        "Date: " + prettyDate(date) + "\n" +
        "Time: " + time + "\n" +
        (notes ? "Additional information: " + notes + "\n" : "") +
        "\nThank you!";
      var url = waLink(text);

      form.hidden = true;
      $("#wa-fallback").href = url;
      $("#booking-success").hidden = false;
      $("#booking-success").scrollIntoView({ behavior: "smooth", block: "center" });
      window.location.href = url;
    });
  });
})();