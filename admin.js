/* TRICIAS BEAUTY CONNER – owner dashboard logic */
(function () {
  "use strict";

  var cfg = window.TBC_CONFIG || {};
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf("PASTE_") !== 0 &&
                   cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0 && window.supabase;
  var loginErr = $("#login-error");
  if (!configured) {
    loginErr.textContent = "Supabase is not configured yet. Fill in config.js first.";
    loginErr.hidden = false;
    return;
  }
  var db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  var all = [];
  var filter = "pending";
  var timer = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(text, isError) {
    var t = $("#toast");
    t.textContent = text; t.className = "toast" + (isError ? " error" : ""); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 6000);
  }
  function prettyDate(iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function digits(n) { return String(n).replace(/\D/g, ""); }

  // ---------- Auth ----------
  function showLogin() { $("#login-view").hidden = false; $("#dash-view").hidden = true; clearInterval(timer); }

  function showDash() {
    db.rpc("is_owner").then(function (res) {
      if (res.error || res.data !== true) {
        db.auth.signOut();
        showLogin();
        loginErr.textContent = "This account is not authorised to use the dashboard.";
        loginErr.hidden = false;
        return;
      }
      $("#login-view").hidden = true; $("#dash-view").hidden = false;
      loadSettings(); loadBookings();
      clearInterval(timer); timer = setInterval(loadBookings, 60000);
    });
  }

  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault(); loginErr.hidden = true;
    db.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value })
      .then(function (res) {
        if (res.error) { loginErr.textContent = "Incorrect email or password."; loginErr.hidden = false; return; }
        $("#password").value = "";
        showDash();
      });
  });
  $("#logout-btn").addEventListener("click", function () { db.auth.signOut().then(showLogin); });
  $("#refresh-btn").addEventListener("click", loadBookings);

  db.auth.getSession().then(function (r) { if (r.data && r.data.session) showDash(); else showLogin(); });

  // ---------- Bookings ----------
  function loadBookings() {
    db.from("bookings").select("*")
      .order("booking_date", { ascending: true }).order("booking_time", { ascending: true })
      .then(function (res) {
        if (res.error) { toast("Could not load appointments.", true); return; }
        all = res.data || [];
        render();
      });
  }

  function render() {
    var pending = all.filter(function (b) { return b.status === "pending"; }).length;
    $("#count-pending").textContent = pending;

    var rows = all.filter(function (b) { return filter === "all" || b.status === filter; });
    var box = $("#bookings");
    if (!rows.length) { box.innerHTML = '<p class="empty">No ' + (filter === "all" ? "" : esc(filter) + " ") + 'appointments.</p>'; return; }

    box.innerHTML = rows.map(function (b) {
      var actions = "";
      if (b.status === "pending") {
        actions = '<button class="btn btn-confirm btn-small" data-act="confirm" data-id="' + esc(b.id) + '">CONFIRM APPOINTMENT</button>' +
                  '<button class="btn btn-decline btn-small" data-act="decline" data-id="' + esc(b.id) + '">DECLINE APPOINTMENT</button>';
      } else if (b.status === "confirmed") {
        actions = '<button class="btn btn-outline btn-small" data-act="resend" data-id="' + esc(b.id) + '">Send WhatsApp again</button>';
      }
      return '<article class="booking-card ' + esc(b.status) + '">' +
        '<div class="card-head"><h3>' + esc(b.customer_name) + '</h3><span class="status ' + esc(b.status) + '">' + esc(b.status) + '</span></div>' +
        '<div class="meta">' +
          '<span><b>Service</b>' + esc(b.service) + '</span>' +
          '<span><b>WhatsApp</b>' + esc(b.whatsapp) + '</span>' +
          '<span><b>Date</b>' + esc(prettyDate(b.booking_date)) + '</span>' +
          '<span><b>Time</b>' + esc(String(b.booking_time).slice(0, 5)) + '</span>' +
          (b.notes ? '<span style="grid-column:1/-1"><b>Notes</b>' + esc(b.notes) + '</span>' : '') +
        '</div>' +
        (actions ? '<div class="card-actions">' + actions + '</div>' : '') +
      '</article>';
    }).join("");
  }

  $("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-filter]"); if (!b) return;
    filter = b.getAttribute("data-filter");
    $$("#tabs button").forEach(function (x) { x.classList.toggle("active", x === b); });
    var isSettings = filter === "settings";
    $("#list-view").hidden = isSettings; $("#settings-view").hidden = !isSettings;
    if (!isSettings) render();
  });

  function confirmationUrl(b) {
    var text = "Hello! Your appointment at Tricias Beauty Conner has been confirmed.\n\n" +
      "Service: " + b.service + "\n" +
      "Date: " + prettyDate(b.booking_date) + "\n" +
      "Time: " + String(b.booking_time).slice(0, 5) + "\n\n" +
      "Thank you for choosing Tricias Beauty Conner. We look forward to seeing you!";
    return "https://wa.me/" + digits(b.whatsapp) + "?text=" + encodeURIComponent(text);
  }

  $("#bookings").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]"); if (!btn) return;
    var act = btn.getAttribute("data-act"), id = btn.getAttribute("data-id");
    var booking = all.filter(function (b) { return b.id === id; })[0];
    if (!booking) return;

    if (act === "resend") { window.open(confirmationUrl(booking), "_blank"); return; }

    if (act === "decline") {
      if (!window.confirm("Decline this appointment request?")) return;
      btn.disabled = true;
      db.rpc("decline_booking", { p_id: id }).then(function (res) {
        if (res.error) { toast("Could not decline: " + friendly(res.error), true); btn.disabled = false; }
        else { toast("Appointment declined. The time stays available."); }
        loadBookings();
      });
      return;
    }

    if (act === "confirm") {
      // open the tab right now (inside the click) so the browser does not block it
      var win = window.open("", "_blank");
      btn.disabled = true;
      db.rpc("confirm_booking", { p_id: id }).then(function (res) {
        if (res.error) {
          if (win) win.close();
          toast("Could not confirm: " + friendly(res.error), true);
          btn.disabled = false; loadBookings(); return;
        }
        var b = res.data;
        var url = confirmationUrl(b);
        if (win) win.location.href = url; else window.open(url, "_blank");
        toast("Appointment confirmed. That time is now unavailable to other customers.");
        loadBookings();
      });
    }
  });

  function friendly(err) {
    var m = String(err.message || "");
    if (m.indexOf("SLOT_TAKEN") !== -1) return "that time overlaps an appointment you already confirmed.";
    if (m.indexOf("NOT_PENDING") !== -1) return "this request was already handled.";
    if (m.indexOf("NOT_ALLOWED") !== -1) return "you are not authorised.";
    return "please try again.";
  }

  // ---------- Working hours ----------
  function loadSettings() {
    db.from("settings").select("*").eq("id", 1).single().then(function (res) {
      if (res.error || !res.data) return;
      var s = res.data;
      $("#open_time").value = String(s.open_time).slice(0, 5);
      $("#close_time").value = String(s.close_time).slice(0, 5);
      $("#slot_minutes").value = s.slot_minutes;
      $("#max_days").value = s.max_days_ahead;
      $$('input[name="day"]').forEach(function (c) { c.checked = s.working_days.indexOf(+c.value) !== -1; });
    });
  }

  $("#settings-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var days = $$('input[name="day"]:checked').map(function (c) { return +c.value; });
    var open = $("#open_time").value, close = $("#close_time").value;
    var dur = parseInt($("#slot_minutes").value, 10);
    if (!days.length) return toast("Choose at least one working day.", true);
    if (open >= close) return toast("Closing time must be after opening time.", true);
    if (!(dur >= 15)) return toast("Appointment duration must be at least 15 minutes.", true);

    db.from("settings").update({
      open_time: open, close_time: close, slot_minutes: dur,
      max_days_ahead: parseInt($("#max_days").value, 10) || 60,
      working_days: days, updated_at: new Date().toISOString()
    }).eq("id", 1).then(function (res) {
      if (res.error) toast("Could not save settings.", true);
      else toast("Working hours saved.");
    });
  });
})();