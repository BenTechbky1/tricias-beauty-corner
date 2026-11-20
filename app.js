
/* TRICIAS BEAUTY CONNER – WhatsApp booking system */
(function () {
  "use strict";

  var cfg = window.TBC_CONFIG || {};

  var configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    window.supabase;

  var db = configured
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;

  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };

  var $$ = function (s, r) {
    return Array.prototype.slice.call(
      (r || document).querySelectorAll(s)
    );
  };

  // ---------- SMALL UI FEATURES ----------

  $("#year").textContent = new Date().getFullYear();

  var toggle = $(".nav-toggle");
  var nav = $("#nav");

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
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });

    $$(".reveal").forEach(function (el) {
      io.observe(el);
    });
  } else {
    $$(".reveal").forEach(function (el) {
      el.classList.add("in");
    });
  }

  // ---------- SELECT A HAIRSTYLE ----------

  var serviceSelect = $("#service");

  $$(".book-style").forEach(function (btn) {
    btn.addEventListener("click", function () {
      serviceSelect.value = btn.getAttribute("data-service");

      $("#booking").scrollIntoView({
        behavior: "smooth"
      });

      setTimeout(function () {
        $("#name").focus({ preventScroll: true });
      }, 700);
    });
  });

  // ---------- DATE AND AVAILABLE TIMES ----------

  var dateInput = $("#date");
  var slotsBox = $("#slots");

  function isoLocal(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");

    return d.getFullYear() + "-" + m + "-" + day;
  }

  var today = new Date();
  dateInput.min = isoLocal(today);

  var maxD = new Date();
  maxD.setDate(maxD.getDate() + 60);
  dateInput.max = isoLocal(maxD);

  function slotsMessage(text) {
    slotsBox.innerHTML = "";

    var p = document.createElement("p");
    p.className = "slots-note";
    p.textContent = text;

    slotsBox.appendChild(p);
  }

  var slotRequest = 0;

  function loadSlots() {
    var date = dateInput.value;

    if (!date) {
      slotsMessage("Select a date to see available times.");
      return;
    }

    if (!db) {
      slotsMessage(
        "Please contact us on WhatsApp to arrange your preferred time."
      );
      return;
    }

    var mine = ++slotRequest;

    slotsMessage("Checking available times...");

    db.rpc("get_available_slots", {
      p_date: date
    }).then(function (res) {

      if (mine !== slotRequest) return;

      if (res.error) {
        console.error("Availability error:", res.error);

        slotsMessage(
          "We could not check available times. Please contact us on WhatsApp."
        );
        return;
      }

      var rows = res.data || [];

      if (!rows.length) {
        slotsMessage(
          "No times are currently available on this date. Please choose another day."
        );
        return;
      }

      slotsBox.innerHTML = "";

      rows.forEach(function (r) {
        var t = String(r.slot).slice(0, 5);

        var label = document.createElement("label");
        label.className = "slot";

        var input = document.createElement("input");
        input.type = "radio";
        input.name = "time";
        input.value = t;
        input.required = true;

        var span = document.createElement("span");
        span.textContent = t;

        label.appendChild(input);
        label.appendChild(span);

        slotsBox.appendChild(label);
      });
    });
  }

  dateInput.addEventListener("change", loadSlots);

  // ---------- HELPERS ----------

  function normalizePhone(raw) {
    var digits = String(raw).replace(/\D/g, "");

    if (digits.indexOf("00") === 0) {
      digits = digits.slice(2);
    } else if (
      digits.length === 9 &&
      /^[679]/.test(digits)
    ) {
      digits = "34" + digits;
    }

    return digits;
  }

  function prettyDate(iso) {
    var p = iso.split("-");

    return new Date(
      +p[0],
      +p[1] - 1,
      +p[2]
    ).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function waLink(message) {
    var number = String(cfg.WHATSAPP_NUMBER || "")
      .replace(/\D/g, "");

    if (!number) return null;

    return "https://wa.me/" +
      number +
      "?text=" +
      encodeURIComponent(message);
  }

  // ---------- WHATSAPP BOOKING ----------

  var form = $("#booking-form");
  var msg = $("#form-message");
  var btn = $("#submit-btn");

  function showError(text) {
    msg.textContent = text;
    msg.hidden = false;

    msg.scrollIntoView({
      block: "nearest",
      behavior: "smooth"
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    msg.hidden = true;

    // Spam protection
    if (form.elements["website"].value) return;

    var name = form.elements["name"].value.trim();
    var phone = normalizePhone(
      form.elements["whatsapp"].value
    );
    var service = form.elements["service"].value;
    var date = form.elements["date"].value;
    var timeEl = form.querySelector(
      'input[name="time"]:checked'
    );
    var notes = form.elements["notes"].value.trim();

    if (name.length < 2) {
      return showError("Please enter your full name.");
    }

    if (phone.length < 9 || phone.length > 15) {
      return showError(
        "Please enter a valid WhatsApp number, including your country code."
      );
    }

    if (!service) {
      return showError("Please choose a hairstyle.");
    }

    if (!date) {
      return showError("Please choose a date.");
    }

    if (!timeEl) {
      return showError("Please choose your preferred available time.");
    }

    var time = timeEl.value;

    // Prepare the message for Tricia
    var message =
      "Hello Tricias Beauty Conner! I would like to request an appointment.\n\n" +
      "Name: " + name + "\n" +
      "My WhatsApp: +" + phone + "\n" +
      "Service: " + service + "\n" +
      "Preferred date: " + prettyDate(date) + "\n" +
      "Preferred time: " + time + "\n" +
      (notes
        ? "Additional information: " + notes + "\n"
        : "") +
      "\nPlease let me know if this time is available.\n\n" +
      "Thank you!";

    var url = waLink(message);

    if (!url) {
      return showError(
        "WhatsApp is not configured. Please contact the salon directly."
      );
    }

    // Show the WhatsApp confirmation screen
    form.hidden = true;

    var fallback = $("#wa-fallback");

    if (fallback) {
      fallback.href = url;
    }

    $("#booking-success").hidden = false;

    $("#booking-success").scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    // Open WhatsApp with the prepared message
    window.location.href = url;
  });

})();
