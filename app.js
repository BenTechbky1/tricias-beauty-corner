
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

  $$(".book-style").forEach(function (button) {
    button.addEventListener("click", function () {
      serviceSelect.value = button.getAttribute("data-service");

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
        "Booking availability is temporarily unavailable. Please contact the salon."
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
          "We could not check available times. Please try again later."
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

  // ---------- PHONE NUMBER HELPER ----------

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

  // ---------- BOOKING FORM ----------

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

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    msg.hidden = true;

    // Honeypot spam protection
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

    // Validate customer details
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
      return showError(
        "Please choose your preferred available time."
      );
    }

    if (!db) {
      return showError(
        "The booking service is unavailable. Please contact the salon."
      );
    }

    // Prevent multiple submissions
    btn.disabled = true;
    btn.textContent = "Preparing WhatsApp...";

    try {
      // Save a confirmed booking in Supabase.
      // The database checks availability and prevents overlapping bookings.
      var result = await db.rpc("request_booking", {
        p_name: name,
        p_whatsapp: phone,
        p_service: service,
        p_date: date,
        p_time: timeEl.value,
        p_notes: notes || null
      });

      if (result.error || !result.data) {
        console.error("Booking error:", result.error);

        var errorText =
          result.error && result.error.message
            ? result.error.message
            : "";

        if (
          errorText.includes("SLOT_UNAVAILABLE") ||
          errorText.toLowerCase().includes("conflict")
        ) {
          showError(
            "Sorry, this appointment time has just been taken. Please choose another available time."
          );
        } else {
          showError(
            "We could not save your booking request. Please refresh the page and try again."
          );
        }

        return;
      }

      // Prepare WhatsApp message without booking reference
      var message =
        "Hello Tricia! I would like to request an appointment at TRICIAS BEAUTY CONNER.\n\n" +
        "Name: " + name + "\n" +
        "My WhatsApp number: " + phone + "\n" +
        "Hairstyle: " + service + "\n" +
        "Preferred date: " + date + "\n" +
        "Preferred time: " + timeEl.value + "\n";

      if (notes) {
        message += "Additional information: " + notes + "\n";
      }

      message +=
        "\nPlease confirm whether this appointment is suitable. Thank you!";

      // Use the WhatsApp number from config.js
      var whatsappUrl =
        "https://wa.me/" +
        cfg.WHATSAPP_NUMBER +
        "?text=" +
        encodeURIComponent(message);

      // Open WhatsApp with the prepared message
      window.location.href = whatsappUrl;

    } catch (error) {
      console.error("Booking error:", error);

      showError(
        "Something went wrong. Please refresh the page and try again."
      );

    } finally {
      btn.disabled = false;
      btn.textContent = "BOOK VIA WHATSAPP";
    }
  });

})();
